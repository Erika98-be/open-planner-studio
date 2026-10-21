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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- minisign

// Zo streng als de updater: Tauri decodeert pubkey en signature met de
// STANDARD-engine van de crate `base64` (padding verplicht, geen witruimte,
// geen vreemde tekens) en leest de tekst als UTF-8. Een tolerantere decoder
// zou een handtekening goedkeuren die de app zelf weigert.

/** Strikte base64 (RFC 4648, standaardalfabet, padding verplicht, canoniek). */
export function decodeBase64Strict(text, label) {
  if (typeof text !== 'string' || text.length === 0 || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
    throw new Error(`${label}: geen geldige base64`);
  }
  const buf = Buffer.from(text, 'base64');
  if (buf.toString('base64') !== text) throw new Error(`${label}: geen canonieke base64`);
  return buf;
}

function utf8Strict(buf, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error(`${label}: geen geldige UTF-8`);
  }
}

/** Leest een minisign-pubkey zoals in tauri.conf.json: base64 van de minisign-tekst. */
export function parsePublicKey(input) {
  const text = utf8Strict(decodeBase64Strict(input, 'pubkey'), 'pubkey');
  const lines = text.split('\n').map((l) => l.trim());
  if (lines.length < 2 || !lines[0].startsWith('untrusted comment:')) throw new Error('pubkey: geen minisign-formaat');
  const raw = decodeBase64Strict(lines[1], 'pubkey-sleutelregel');
  if (raw.length !== 42 || raw.subarray(0, 2).toString('latin1') !== 'Ed') {
    throw new Error(`pubkey: verwacht 42 bytes met 'Ed', kreeg ${raw.length} bytes`);
  }
  return { keyId: raw.subarray(2, 10), key: raw.subarray(10, 42) };
}

/** Leest een minisign-handtekening zoals Tauri hem schrijft: base64 van de minisign-tekst. */
export function parseSignature(input) {
  const text = utf8Strict(decodeBase64Strict(input, 'handtekening'), 'handtekening');
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length < 4 || !lines[0].startsWith('untrusted comment:')) {
    throw new Error('handtekening: geen minisign-formaat (4 regels, begint met "untrusted comment:")');
  }
  const sig = decodeBase64Strict(lines[1].trim(), 'handtekeningregel');
  if (sig.length !== 74) throw new Error(`handtekening: verwacht 74 bytes, kreeg ${sig.length}`);
  const prefix = 'trusted comment: ';
  if (!lines[2].startsWith(prefix)) throw new Error('handtekening: regel 3 is geen trusted comment');
  const globalSig = decodeBase64Strict(lines[3].trim(), 'globale handtekening');
  if (globalSig.length !== 64) throw new Error(`globale handtekening: verwacht 64 bytes, kreeg ${globalSig.length}`);
  return {
    alg: sig.subarray(0, 2).toString('latin1'),
    keyId: sig.subarray(2, 10),
    signature: sig.subarray(10, 74),
    trustedComment: lines[2].slice(prefix.length),
    globalSignature: globalSig,
  };
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

/** Namen in een .tar.gz, via de systeem-`tar` (alleen voor de informatieve macOS-controle). */
export function tarGzEntryNames(buf) {
  return execFileSync('tar', ['-tzf', '-'], { input: buf, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean);
}

export function hasMacCodeSignature(names) {
  return names.some((n) => /\.app\/Contents\/_CodeSignature\/CodeResources$/.test(n));
}

// ---------------------------------------------------------------- controles

export const TAG_PATTERN = /^v[0-9][0-9A-Za-z.-]*$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function textStrict(buf) {
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

/**
 * Controleert een updater-URL uit latest.json tegen de bedoelde release. Twee vormen
 * zijn geldig: `https://github.com/<repo>/releases/download/<tag>/<asset>` en de vorm
 * die release.yml schrijft, `https://github.com/<repo>/releases/latest/download/<asset>`.
 * Die laatste wijst altijd naar de NIEUWSTE release; voor een oudere tag is hij dus fout
 * (de asset met versienummer bestaat daar niet, of het is een ander bestand).
 * @returns {{asset?:string, error?:string}}
 */
export function checkUpdaterUrl(url, { repo, tag, isLatest }) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { error: `geen geldige URL: ${url}` };
  }
  if (u.protocol !== 'https:') return { error: `protocol ${u.protocol} is geen https` };
  if (u.hostname !== 'github.com' || u.port || u.username || u.password) return { error: `host ${u.host} is niet github.com` };
  if (u.search || u.hash) return { error: 'URL heeft een query of fragment' };
  const prefix = `/${repo}/releases/`;
  if (!u.pathname.startsWith(prefix)) return { error: `pad ${u.pathname} hoort niet bij ${repo}/releases` };
  const rest = u.pathname.slice(prefix.length).split('/');
  let encodedAsset;
  if (rest.length === 3 && rest[0] === 'latest' && rest[1] === 'download') {
    if (!isLatest) return { error: `releases/latest/download wijst naar de nieuwste release, niet naar ${tag}` };
    encodedAsset = rest[2];
  } else if (rest.length === 3 && rest[0] === 'download' && decodeURIComponent(rest[1]) === tag) {
    encodedAsset = rest[2];
  } else {
    return { error: `pad ${u.pathname} is geen releases/latest/download/<asset> of releases/download/${tag}/<asset>` };
  }
  let asset;
  try {
    asset = decodeURIComponent(encodedAsset);
  } catch {
    return { error: `assetnaam ${encodedAsset} is ongeldig gecodeerd` };
  }
  if (!asset) return { error: 'assetnaam ontbreekt' };
  return { asset };
}

/**
 * Pure kern: beoordeelt een release.
 * @param {object} o
 * @param {string} o.publicKey   pubkey uit tauri.conf.json
 * @param {{name:string, digest?:string|null}[]} o.assets  assetlijst van de API
 * @param {(name:string)=>Buffer} o.read  leest een gedownloade asset
 * @param {string} o.repo   owner/naam
 * @param {string} o.tag    de gecontroleerde tag
 * @param {boolean} o.isLatest  is dit de nieuwste gepubliceerde release?
 * @returns {{group:string, item:string, status:'OK'|'FOUT'|'INFO', detail:string}[]}
 */
export function evaluateRelease({ publicKey, assets, read, repo, tag, isLatest }) {
  const rows = [];
  const add = (group, item, status, detail = '') => rows.push({ group, item, status, detail });
  const pub = parsePublicKey(publicKey);
  const names = new Set(assets.map((a) => a.name));
  const readText = (name) => textStrict(read(name));

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
    let sigText;
    try {
      sigText = readText(sigName);
    } catch {
      add('updater-handtekening (.sig)', target, 'FOUT', `${sigName} is geen geldige UTF-8`);
      continue;
    }
    const r = verifyMinisign({ publicKey: pub, signatureText: sigText, data: read(target) });
    const detail = [r.alg && `alg ${r.alg}`, r.keyId && `sleutel ${r.keyId}`, r.trustedComment && `"${r.trustedComment}"`, r.reason]
      .filter(Boolean).join('; ');
    add('updater-handtekening (.sig)', target, r.ok ? 'OK' : 'FOUT', detail);
  }

  // 3. latest.json: object, versie = tag, platforms, en per platform URL + signature
  const G = 'latest.json';
  let latest;
  if (!names.has('latest.json')) {
    add(G, 'latest.json', 'FOUT', 'asset ontbreekt');
  } else {
    try {
      latest = JSON.parse(readText('latest.json'));
    } catch (err) {
      add(G, 'latest.json', 'FOUT', `geen geldige JSON: ${err.message}`);
    }
  }
  if (latest !== undefined && !isPlainObject(latest)) {
    add(G, 'manifest', 'FOUT', `manifest is geen object maar ${latest === null ? 'null' : Array.isArray(latest) ? 'een array' : typeof latest}`);
  } else if (latest !== undefined) {
    const want = tag.replace(/^v/, '');
    if (typeof latest.version !== 'string') add(G, 'version', 'FOUT', 'veld version ontbreekt of is geen tekst');
    else if (latest.version.replace(/^v/, '') !== want) add(G, 'version', 'FOUT', `version ${latest.version} hoort bij een andere release dan ${tag}`);
    else add(G, 'version', 'OK', `${latest.version} = ${tag}`);
    if (latest.pub_date !== undefined && (typeof latest.pub_date !== 'string' || !RFC3339.test(latest.pub_date))) {
      add(G, 'pub_date', 'FOUT', `pub_date ${JSON.stringify(latest.pub_date)} is geen RFC 3339-tijdstip`);
    }
    const platforms = latest.platforms;
    if (!isPlainObject(platforms) || Object.keys(platforms).length === 0) {
      add(G, 'platforms', 'FOUT', 'platforms ontbreekt, is geen object of is leeg');
    } else {
      for (const [platform, entry] of Object.entries(platforms).sort(([a], [b]) => a.localeCompare(b))) {
        if (!isPlainObject(entry) || typeof entry.url !== 'string' || typeof entry.signature !== 'string') {
          add(G, platform, 'FOUT', 'entry is geen object met url en signature als tekst');
          continue;
        }
        const u = checkUpdaterUrl(entry.url, { repo, tag, isLatest });
        if (u.error) {
          add(G, platform, 'FOUT', u.error);
          continue;
        }
        const assetName = u.asset;
        if (!names.has(assetName)) {
          add(G, platform, 'FOUT', `URL ${entry.url} wijst niet naar een asset van ${tag}`);
          continue;
        }
        const sigAsset = `${assetName}.sig`;
        let sigText = null;
        try {
          sigText = names.has(sigAsset) ? readText(sigAsset) : null;
        } catch {
          sigText = null;
        }
        const same = sigText !== null && entry.signature === sigText;
        const r = verifyMinisign({ publicKey: pub, signatureText: entry.signature, data: read(assetName) });
        if (same && r.ok) add(G, platform, 'OK', `${assetName}; signature = ${sigAsset}, verifieert`);
        else add(G, platform, 'FOUT',
          `${assetName}; ${sigText === null ? `${sigAsset} ontbreekt of is onleesbaar` : same ? 'signature = asset-.sig' : 'signature ≠ asset-.sig'}; ${r.ok ? 'verifieert' : r.reason}`);
      }
    }
  }

  // 4. informatief: macOS-codesign in de updater-tar
  for (const name of [...names].filter((n) => n.endsWith('.app.tar.gz')).sort()) {
    let entries;
    try {
      entries = tarGzEntryNames(read(name));
    } catch (err) {
      add('macOS app.tar.gz (informatief)', name, 'FOUT', `tar niet leesbaar: ${String(err.message).split('\n')[0]}`);
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
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(opts.repo)) throw new Error(`ongeldige repo ${JSON.stringify(opts.repo)}`);
  if (!TAG_PATTERN.test(opts.tag)) throw new Error(`ongeldige tag ${JSON.stringify(opts.tag)}`);
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
  // releases/latest/download in latest.json is alleen juist voor de nieuwste release.
  const latestTag = gh(['api', `repos/${opts.repo}/releases/latest`, '--jq', '.tag_name']).trim();
  const isLatest = latestTag === opts.tag;
  process.stderr.write(`nieuwste release: ${latestTag}; ${opts.tag} is ${isLatest ? '' : 'NIET '}de nieuwste\n`);
  const rows = evaluateRelease({ publicKey, assets, read, repo: opts.repo, tag: opts.tag, isLatest });
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
