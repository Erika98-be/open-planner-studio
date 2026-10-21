#!/usr/bin/env node
// Controleert de assets van één GitHub-release (issue #429).
//
//   node scripts/verify-release.mjs [<tag>] [--repo owner/naam] [--dir <map>] [--out <rapport.md>]
//
// Zonder tag: de laatste gepubliceerde release. Het script downloadt via `gh`
// en controleert:
//   1. elke `*.sig`-asset (minisign, updater-handtekening) tegen de pubkey in
//      src-tauri/tauri.conf.json: sleutel-id, handtekening over het bestand
//      (`ED` = BLAKE2b-512-prehash, legacy `Ed` = ruwe bytes) en de globale
//      handtekening over `handtekening || trusted comment`;
//   2. latest.json: elke platform-URL wijst naar een asset van deze release,
//      en de signature is gelijk aan die asset-.sig en verifieert;
//   3. sha256 van elke asset gelijk aan de `digest` die GitHub meldt;
//   4. informatief: heeft de macOS-`app.tar.gz` een Contents/_CodeSignature/CodeResources?
//
// Uitvoer: een markdown-rapport op stdout (en in --out). Exitcode 0 = alles OK,
// 1 = minstens één controle FOUT, 2 = het script zelf crashte (altijd een fout).
// Geen dependencies buiten Node zelf.

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- minisign

/** Leest een minisign-pubkey: base64 van de tekst, of de tekst zelf, of alleen de sleutelregel. */
export function parsePublicKey(input) {
  const text = decodeMaybeBase64Text(input.trim());
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const keyLine = lines.find((l) => !l.startsWith('untrusted comment:'));
  if (!keyLine) throw new Error('pubkey: geen sleutelregel');
  const raw = Buffer.from(keyLine, 'base64');
  if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') {
    throw new Error(`pubkey: verwacht 42 bytes met 'Ed', kreeg ${raw.length} bytes`);
  }
  return { keyId: raw.subarray(2, 10), key: raw.subarray(10, 42) };
}

/** Leest een minisign-handtekening (zoals Tauri hem schrijft: base64 van de tekst, of de tekst zelf). */
export function parseSignature(input) {
  const text = decodeMaybeBase64Text(input.trim());
  const lines = text.split(/\r?\n/);
  if (lines.length < 4 || !lines[0].startsWith('untrusted comment:')) {
    throw new Error('handtekening: geen minisign-formaat (4 regels, begint met "untrusted comment:")');
  }
  const sig = Buffer.from(lines[1].trim(), 'base64');
  if (sig.length !== 74) throw new Error(`handtekening: verwacht 74 bytes, kreeg ${sig.length}`);
  const prefix = 'trusted comment: ';
  if (!lines[2].startsWith(prefix)) throw new Error('handtekening: regel 3 is geen trusted comment');
  const globalSig = Buffer.from(lines[3].trim(), 'base64');
  if (globalSig.length !== 64) throw new Error(`globale handtekening: verwacht 64 bytes, kreeg ${globalSig.length}`);
  return {
    alg: sig.subarray(0, 2).toString('latin1'),
    keyId: sig.subarray(2, 10),
    signature: sig.subarray(10, 74),
    trustedComment: lines[2].slice(prefix.length),
    globalSignature: globalSig,
  };
}

function decodeMaybeBase64Text(s) {
  if (s.startsWith('untrusted comment:')) return s;
  return Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
}

/** Minisign toont een sleutel-id als hex van de bytes in omgekeerde volgorde. */
export function keyIdHex(buf) {
  return Buffer.from(buf).reverse().toString('hex').toUpperCase();
}

function ed25519Key(raw32) {
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw32]);
  return createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

/**
 * Verifieert `data` (Buffer) tegen een minisign-handtekening.
 * Geeft { ok, reason, alg, keyId, trustedComment } terug; gooit niet bij een foute handtekening.
 */
export function verifyMinisign({ publicKey, signatureText, data }) {
  const pub = typeof publicKey === 'string' ? parsePublicKey(publicKey) : publicKey;
  let sig;
  try {
    sig = parseSignature(signatureText);
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  const base = { alg: sig.alg, keyId: keyIdHex(sig.keyId), trustedComment: sig.trustedComment };
  if (!sig.keyId.equals(pub.keyId)) {
    return { ...base, ok: false, reason: `sleutel-id ${keyIdHex(sig.keyId)} is niet ${keyIdHex(pub.keyId)}` };
  }
  let message;
  if (sig.alg === 'ED') message = createHash('blake2b512').update(data).digest();
  else if (sig.alg === 'Ed') message = data;
  else return { ...base, ok: false, reason: `onbekend algoritme '${sig.alg}'` };
  const key = ed25519Key(pub.key);
  if (!cryptoVerify(null, message, key, sig.signature)) {
    return { ...base, ok: false, reason: 'handtekening past niet bij het bestand' };
  }
  const globalMessage = Buffer.concat([sig.signature, Buffer.from(sig.trustedComment, 'utf8')]);
  if (!cryptoVerify(null, globalMessage, key, sig.globalSignature)) {
    return { ...base, ok: false, reason: 'globale handtekening (trusted comment) klopt niet' };
  }
  return { ...base, ok: true, reason: '' };
}

// ---------------------------------------------------------------- tar

/** Namen van alle entries in een (ongecomprimeerde) tar; kent ustar-prefix, GNU 'L' en pax 'path'. */
export function tarEntryNames(tar) {
  const names = [];
  let offset = 0;
  let pendingName = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) => {
      const slice = header.subarray(start, start + len);
      const end = slice.indexOf(0);
      return slice.subarray(0, end === -1 ? len : end).toString('utf8');
    };
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 0x30);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    let name = field(0, 100);
    // Alleen POSIX-ustar ("ustar\0") heeft een prefixveld; GNU ("ustar  ") gebruikt die bytes anders.
    const prefix = header.subarray(257, 263).toString('latin1') === 'ustar\0' ? field(345, 155) : '';
    if (prefix) name = `${prefix}/${name}`;
    if (type === 'L') {
      pendingName = body.toString('utf8').replace(/\0+$/, '');
    } else if (type === 'x') {
      const m = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      if (m) pendingName = m[1];
    } else if (type !== 'g') {
      names.push(pendingName ?? name);
      pendingName = null;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

export function hasMacCodeSignature(names) {
  return names.some((n) => /\.app\/Contents\/_CodeSignature\/CodeResources$/.test(n));
}

// ---------------------------------------------------------------- controles

/**
 * Pure kern: beoordeelt een release.
 * @param {object} o
 * @param {string} o.publicKey   pubkey uit tauri.conf.json
 * @param {{name:string, digest?:string|null}[]} o.assets  assetlijst van de API
 * @param {(name:string)=>Buffer} o.read  leest een gedownloade asset
 * @returns {{group:string, item:string, status:'OK'|'FOUT'|'INFO', detail:string}[]}
 */
export function evaluateRelease({ publicKey, assets, read }) {
  const rows = [];
  const add = (group, item, status, detail = '') => rows.push({ group, item, status, detail });
  const pub = parsePublicKey(publicKey);
  const names = new Set(assets.map((a) => a.name));

  // 1. sha256 tegen GitHub-digest
  for (const asset of assets) {
    const actual = createHash('sha256').update(read(asset.name)).digest('hex');
    if (!asset.digest) {
      add('sha256 = GitHub-digest', asset.name, 'INFO', `geen digest in de API; sha256 ${actual}`);
    } else if (asset.digest === `sha256:${actual}`) {
      add('sha256 = GitHub-digest', asset.name, 'OK', actual);
    } else {
      add('sha256 = GitHub-digest', asset.name, 'FOUT', `API ${asset.digest}, gedownload sha256:${actual}`);
    }
  }

  // 2. elke .sig
  for (const sigName of [...names].filter((n) => n.endsWith('.sig')).sort()) {
    const target = sigName.slice(0, -4);
    if (!names.has(target)) {
      add('updater-handtekening (.sig)', sigName, 'FOUT', `asset ${target} ontbreekt`);
      continue;
    }
    const r = verifyMinisign({ publicKey: pub, signatureText: read(sigName).toString('utf8'), data: read(target) });
    const detail = [r.alg && `alg ${r.alg}`, r.keyId && `sleutel ${r.keyId}`, r.trustedComment && `"${r.trustedComment}"`, r.reason]
      .filter(Boolean).join('; ');
    add('updater-handtekening (.sig)', target, r.ok ? 'OK' : 'FOUT', detail);
  }

  // 3. latest.json
  if (!names.has('latest.json')) {
    add('latest.json', 'latest.json', 'FOUT', 'asset ontbreekt');
  } else {
    let latest = null;
    try {
      latest = JSON.parse(read('latest.json').toString('utf8'));
    } catch (err) {
      add('latest.json', 'latest.json', 'FOUT', `geen geldige JSON: ${err.message}`);
    }
    const platforms = latest?.platforms ?? {};
    if (latest && Object.keys(platforms).length === 0) add('latest.json', 'platforms', 'FOUT', 'geen platforms');
    for (const [platform, entry] of Object.entries(platforms).sort(([a], [b]) => a.localeCompare(b))) {
      const url = String(entry?.url ?? '');
      const assetName = decodeURIComponent(url.split('/').pop() ?? '');
      if (!names.has(assetName)) {
        add('latest.json', platform, 'FOUT', `URL ${url} wijst niet naar een asset van deze release`);
        continue;
      }
      const sigAsset = `${assetName}.sig`;
      if (!names.has(sigAsset)) {
        add('latest.json', platform, 'FOUT', `${sigAsset} ontbreekt`);
        continue;
      }
      const same = String(entry.signature ?? '').trim() === read(sigAsset).toString('utf8').trim();
      const r = verifyMinisign({ publicKey: pub, signatureText: String(entry.signature ?? ''), data: read(assetName) });
      if (same && r.ok) add('latest.json', platform, 'OK', `${assetName}; signature = ${sigAsset}, verifieert`);
      else add('latest.json', platform, 'FOUT',
        `${assetName}; ${same ? 'signature = asset-.sig' : 'signature ≠ asset-.sig'}; ${r.ok ? 'verifieert' : r.reason}`);
    }
  }

  // 4. informatief: macOS-codesign in de updater-tar
  for (const name of [...names].filter((n) => n.endsWith('.app.tar.gz')).sort()) {
    let entries;
    try {
      entries = tarEntryNames(gunzipSync(read(name)));
    } catch (err) {
      add('macOS app.tar.gz (informatief)', name, 'FOUT', `tar niet leesbaar: ${err.message}`);
      continue;
    }
    add('macOS app.tar.gz (informatief)', name, 'INFO',
      hasMacCodeSignature(entries)
        ? 'bevat Contents/_CodeSignature/CodeResources (app is gecodesigned)'
        : 'GEEN Contents/_CodeSignature/CodeResources: app is niet gecodesigned');
  }
  return rows;
}

export function renderReport({ tag, repo, keyId, rows }) {
  const fails = rows.filter((r) => r.status === 'FOUT').length;
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = [`## Releaseverificatie ${tag} (${repo})`, '',
    `Updater-pubkey uit src-tauri/tauri.conf.json, sleutel-id ${keyId}.`, '',
    fails === 0 ? '**Oordeel: OK** — geen enkele controle faalde.' : `**Oordeel: FOUT** — ${fails} controle(s) faalden.`, ''];
  const groups = [...new Set(rows.map((r) => r.group))];
  for (const g of groups) {
    out.push(`### ${g}`, '', '| asset / platform | uitkomst | detail |', '|---|---|---|');
    for (const r of rows.filter((x) => x.group === g)) out.push(`| ${esc(r.item)} | ${r.status} | ${esc(r.detail)} |`);
    out.push('');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- CLI

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs(argv) {
  const o = { tag: null, repo: process.env.GITHUB_REPOSITORY || 'OpenAEC-Foundation/open-planner-studio', dir: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--dir') o.dir = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a.startsWith('--')) throw new Error(`onbekende optie ${a}`);
    else o.tag = a;
  }
  return o;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.tag) opts.tag = gh(['release', 'view', '--repo', opts.repo, '--json', 'tagName', '--jq', '.tagName']).trim();
  if (!/^v[0-9][0-9A-Za-z.\-]*$/.test(opts.tag)) throw new Error(`ongeldige tag '${opts.tag}'`);
  const release = JSON.parse(gh(['api', `repos/${opts.repo}/releases/tags/${opts.tag}`]));
  const assets = release.assets.map((a) => ({ name: a.name, digest: a.digest ?? null }));
  if (assets.length === 0) throw new Error(`release ${opts.tag} heeft geen assets`);
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'ops-release-'));
  const missing = assets.filter((a) => !existsSync(join(dir, a.name)));
  if (missing.length > 0) {
    process.stderr.write(`download ${missing.length} asset(s) van ${opts.tag} naar ${dir}\n`);
    gh(['release', 'download', opts.tag, '--repo', opts.repo, '--dir', dir, '--skip-existing']);
  }
  const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const publicKey = conf?.plugins?.updater?.pubkey;
  if (!publicKey) throw new Error('geen plugins.updater.pubkey in tauri.conf.json');
  const cache = new Map();
  const read = (name) => {
    if (!cache.has(name)) cache.set(name, readFileSync(join(dir, name)));
    return cache.get(name);
  };
  const rows = evaluateRelease({ publicKey, assets, read });
  const report = renderReport({ tag: opts.tag, repo: opts.repo, keyId: keyIdHex(parsePublicKey(publicKey).keyId), rows });
  process.stdout.write(`${report}\n`);
  if (opts.out) writeFileSync(opts.out, `${report}\n`);
  return rows.some((r) => r.status === 'FOUT') ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (err) {
    process.stderr.write(`verify-release: CRASH: ${err?.stack ?? err}\n`);
    process.exitCode = 2;
  }
}
