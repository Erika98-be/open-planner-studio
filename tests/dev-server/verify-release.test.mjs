import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  evaluateRelease,
  hasMacCodeSignature,
  keyIdHex,
  parsePublicKey,
  renderReport,
  checkUpdaterUrl,
  tarGzEntryNames,
  verifyMinisign,
} from '../../scripts/verify-release.mjs';

// Een eigen Ed25519-sleutel in minisign-formaat, zoals `tauri signer` hem schrijft:
// pubkey en .sig zijn allebei base64 van de minisign-tekst.
function makeKey(keyId = randomBytes(8)) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const keyLine = Buffer.concat([Buffer.from('Ed'), keyId, raw]).toString('base64');
  const text = `untrusted comment: minisign public key: ${keyIdHex(keyId)}\n${keyLine}\n`;
  return { keyId, privateKey, pubkey: Buffer.from(text).toString('base64') };
}

function minisign(key, data, { alg = 'ED', keyId = key.keyId, trusted = 'timestamp:1788331608\tfile:test.bin' } = {}) {
  const message = alg === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  const signature = sign(null, message, key.privateKey);
  const globalSig = sign(null, Buffer.concat([signature, Buffer.from(trusted)]), key.privateKey);
  const sigLine = Buffer.concat([Buffer.from(alg), keyId, signature]).toString('base64');
  const text = `untrusted comment: signature from tauri secret key\n${sigLine}\ntrusted comment: ${trusted}\n${globalSig.toString('base64')}\n`;
  return Buffer.from(text).toString('base64');
}

const DATA = Buffer.from('Open Planner Studio installer bytes\n'.repeat(100));

test('parsePublicKey leest de echte pubkey uit tauri.conf.json', async () => {
  const { readFileSync } = await import('node:fs');
  const conf = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.equal(keyIdHex(parsePublicKey(conf.plugins.updater.pubkey).keyId), '28AC8F08A87C90CD');
});

test('verifyMinisign keurt een geldige ED-handtekening (BLAKE2b-prehash) goed', () => {
  const key = makeKey();
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: minisign(key, DATA), data: DATA });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.alg, 'ED');
  assert.equal(r.keyId, keyIdHex(key.keyId));
});

test('verifyMinisign keurt een geldige legacy Ed-handtekening (ruwe bytes) goed', () => {
  const key = makeKey();
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: minisign(key, DATA, { alg: 'Ed' }), data: DATA });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.alg, 'Ed');
});

test('mutatie: één byte anders in het bestand wordt afgekeurd (ED en Ed)', () => {
  const key = makeKey();
  for (const alg of ['ED', 'Ed']) {
    const mutated = Buffer.from(DATA);
    mutated[1234] ^= 0x01;
    const r = verifyMinisign({ publicKey: key.pubkey, signatureText: minisign(key, DATA, { alg }), data: mutated });
    assert.equal(r.ok, false, alg);
    assert.match(r.reason, /past niet/);
  }
});

test('een verkeerde sleutel-id wordt afgekeurd, ook als de handtekening zelf klopt', () => {
  const key = makeKey(Buffer.from('0102030405060708', 'hex'));
  const sig = minisign(key, DATA, { keyId: Buffer.from('0807060504030201', 'hex') });
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: sig, data: DATA });
  assert.equal(r.ok, false);
  assert.match(r.reason, /sleutel-id 0102030405060708 is niet 0807060504030201/);
});

test('een andere sleutel met dezelfde id wordt afgekeurd', () => {
  const key = makeKey();
  const other = makeKey(key.keyId);
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: minisign(other, DATA), data: DATA });
  assert.equal(r.ok, false);
});

test('een aangepaste trusted comment faalt op de globale handtekening', () => {
  const key = makeKey();
  const text = Buffer.from(minisign(key, DATA), 'base64').toString('utf8').replace('timestamp:1788331608', 'timestamp:1999999999');
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: Buffer.from(text).toString('base64'), data: DATA });
  assert.equal(r.ok, false);
  assert.match(r.reason, /globale handtekening/);
});

test('onzin als handtekening geeft een FOUT-uitkomst, geen exceptie', () => {
  const key = makeKey();
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: 'geen handtekening', data: DATA });
  assert.equal(r.ok, false);
});

// Een echte .tar.gz via de systeem-tar (bevinding 7: geen eigen tar-parser meer).
function tarGz(names) {
  const dir = mkdtempSync(join(tmpdir(), 'tar-'));
  const src = join(dir, 'src');
  for (const n of names) {
    const p = join(src, n);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '');
  }
  return execFileSync('tar', ['-czf', '-', '-C', src, ...names]);
}

test('tarGzEntryNames en hasMacCodeSignature herkennen een gecodesignde app', () => {
  const signed = tarGzEntryNames(tarGz(['A B.app/Contents/Info.plist', 'A B.app/Contents/_CodeSignature/CodeResources']));
  assert.ok(signed.includes('A B.app/Contents/_CodeSignature/CodeResources'));
  assert.equal(hasMacCodeSignature(signed), true);
  assert.equal(hasMacCodeSignature(tarGzEntryNames(tarGz(['A.app/Contents/Info.plist']))), false);
  assert.throws(() => tarGzEntryNames(Buffer.from('geen tar')));
});

const REPO = 'OpenAEC-Foundation/open-planner-studio';
const TAG = 'v2026.9.0';
const LATEST = `https://github.com/${REPO}/releases/latest/download/`;
const sha = (b) => `sha256:${createHash('sha256').update(b).digest('hex')}`;

/** Een kleine release: zip + .sig en latest.json; `manifest` mag de JSON-tekst vervangen. */
function release(key, { manifest, entry, sigFile } = {}) {
  const zip = Buffer.from('zip');
  const sig = minisign(key, zip);
  const files = new Map([['app.nsis.zip', zip], ['app.nsis.zip.sig', Buffer.from(sigFile ?? sig)]]);
  const json = manifest ?? JSON.stringify({
    version: '2026.9.0',
    pub_date: '2026-09-02T06:49:44.677Z',
    platforms: { 'windows-x86_64': { url: `${LATEST}app.nsis.zip`, signature: sig, ...entry } },
  });
  files.set('latest.json', Buffer.from(json));
  const assets = [...files.keys()].map((name) => ({ name, digest: sha(files.get(name)) }));
  return { assets, read: (n) => files.get(n), sig };
}

function fails(key, opts, ctx = {}) {
  const r = release(key, opts);
  const rows = evaluateRelease({ publicKey: key.pubkey, assets: r.assets, read: r.read, repo: REPO, tag: TAG, isLatest: true, ...ctx });
  return rows.filter((x) => x.status === 'FOUT').map((x) => `${x.item}: ${x.detail}`);
}

test('een geldige mini-release heeft nul FOUT-regels', () => {
  assert.deepEqual(fails(makeKey()), []);
});

test('bevinding 2: een updater-URL buiten de bedoelde release is FOUT', () => {
  const key = makeKey();
  for (const url of [
    'https://example.invalid/does-not-exist/app.nsis.zip',
    `http://github.com/${REPO}/releases/latest/download/app.nsis.zip`,
    `https://github.com/ander/repo/releases/latest/download/app.nsis.zip`,
    `https://github.com.evil.example/${REPO}/releases/latest/download/app.nsis.zip`,
    `https://github.com/${REPO}/releases/download/v2026.8.1/app.nsis.zip`,
    `https://github.com/${REPO}/releases/latest/download/app.nsis.zip?x=1`,
    `https://github.com/${REPO}/releases/latest/download/sub/app.nsis.zip`,
    'geen url',
  ]) {
    const f = fails(key, { entry: { url } });
    assert.equal(f.length, 1, `${url}: ${f.join(' | ')}`);
  }
  // De vaste tag-vorm is altijd goed; latest/download alleen voor de nieuwste release.
  assert.deepEqual(fails(key, { entry: { url: `https://github.com/${REPO}/releases/download/${TAG}/app.nsis.zip` } }), []);
  const old = fails(key, {}, { isLatest: false });
  assert.equal(old.length, 1);
  assert.match(old[0], /nieuwste release, niet naar v2026\.9\.0/);
});

test('checkUpdaterUrl geeft de gedecodeerde assetnaam', () => {
  assert.deepEqual(checkUpdaterUrl(`${LATEST}Open.Planner.Studio%20x.zip`, { repo: REPO, tag: TAG, isLatest: true }), { asset: 'Open.Planner.Studio x.zip' });
});

test('bevinding 3: een onbruikbaar manifest is FOUT', () => {
  const key = makeKey();
  const { sig } = release(key);
  const entries = { 'windows-x86_64': { url: `${LATEST}app.nsis.zip`, signature: sig } };
  const cases = {
    null: 'null',
    array: '[]',
    getal: '42',
    'geen JSON': '{',
    'zonder version': JSON.stringify({ platforms: entries }),
    'andere version': JSON.stringify({ version: '2026.8.1', platforms: entries }),
    'version geen tekst': JSON.stringify({ version: 2026, platforms: entries }),
    'pub_date onzin': JSON.stringify({ version: '2026.9.0', pub_date: 'gisteren', platforms: entries }),
    'zonder platforms': JSON.stringify({ version: '2026.9.0' }),
    'platforms array': JSON.stringify({ version: '2026.9.0', platforms: [] }),
    'lege platforms': JSON.stringify({ version: '2026.9.0', platforms: {} }),
    'entry null': JSON.stringify({ version: '2026.9.0', platforms: { 'windows-x86_64': null } }),
    'url geen tekst': JSON.stringify({ version: '2026.9.0', platforms: { 'windows-x86_64': { url: 1, signature: sig } } }),
  };
  for (const [label, manifest] of Object.entries(cases)) {
    assert.ok(fails(key, { manifest }).length >= 1, label);
  }
  // 'v'-voorvoegsel in version telt als dezelfde versie (de updater strip het ook).
  assert.deepEqual(fails(key, { manifest: JSON.stringify({ version: 'v2026.9.0', platforms: entries }) }), []);
});

test('bevinding 4: base64 en UTF-8 zo streng als de updater', () => {
  const key = makeKey();
  const { sig } = release(key);
  const text = Buffer.from(sig, 'base64').toString('utf8');
  for (const [label, bad] of Object.entries({
    '! ervoor': `!${sig}`,
    'regeleinde erachter': `${sig}\n`,
    'spatie ervoor': ` ${sig}`,
    'zonder padding': sig.replace(/=+$/, ''),
    'ruwe minisign-tekst': text,
    'url-safe alfabet': sig.replace(/\+/g, '-').replace(/\//g, '_'),
  })) {
    if (bad === sig) continue;
    // Een kapotte .sig: de .sig-regel faalt, en latest.json (signature ≠ asset-.sig) ook.
    assert.ok(fails(key, { sigFile: bad }).some((f) => /^app\.nsis\.zip: .*base64/.test(f)), `.sig ${label}`);
    assert.equal(fails(key, { entry: { signature: bad } }).length, 1, `latest.json ${label}`);
    assert.equal(verifyMinisign({ publicKey: key.pubkey, signatureText: bad, data: Buffer.from('zip') }).ok, false, label);
  }
  // Ongeldige UTF-8 binnen geldige base64.
  const latin = Buffer.from(text.replace('trusted comment: ', 'trusted comment: \u00e9'), 'latin1').toString('base64');
  assert.equal(verifyMinisign({ publicKey: key.pubkey, signatureText: latin, data: Buffer.from('zip') }).ok, false);
  assert.throws(() => parsePublicKey(`!${key.pubkey}`), /base64/);
});

test('evaluateRelease: .sig, latest.json en digest, met precies de verwachte FOUT-regels', () => {
  const key = makeKey();
  const zip = Buffer.from('zip');
  const exe = Buffer.from('exe-na-authenticode');
  const files = new Map([
    ['app.nsis.zip', zip],
    ['app.nsis.zip.sig', Buffer.from(minisign(key, zip))],
    ['app-setup.exe', exe],
    // .exe.sig van vóór Authenticode: hoort bij andere bytes (zoals in v2026.9.0).
    ['app-setup.exe.sig', Buffer.from(minisign(key, Buffer.from('exe-voor-authenticode')))],
  ]);
  files.set('latest.json', Buffer.from(JSON.stringify({
    version: '2026.9.0',
    platforms: {
      'windows-x86_64': { url: `${LATEST}app.nsis.zip`, signature: files.get('app.nsis.zip.sig').toString() },
      'linux-x86_64': { url: `${LATEST}weg.AppImage`, signature: 'x' },
    },
  })));
  const assets = [...files.keys()].map((name) => ({ name, digest: sha(files.get(name)) }));
  assets.find((a) => a.name === 'app.nsis.zip').digest = 'sha256:' + '0'.repeat(64);
  assets.find((a) => a.name === 'latest.json').digest = null;

  const rows = evaluateRelease({ publicKey: key.pubkey, assets, read: (n) => files.get(n), repo: REPO, tag: TAG, isLatest: true });
  const failed = rows.filter((r) => r.status === 'FOUT').map((r) => `${r.group}: ${r.item}`).sort();
  assert.deepEqual(failed, [
    'latest.json: linux-x86_64',
    'sha256 = GitHub-digest: app.nsis.zip',
    'updater-handtekening (.sig): app-setup.exe',
  ]);
  assert.ok(rows.some((r) => r.status === 'OK' && r.group === 'latest.json' && r.item === 'windows-x86_64'));
  assert.ok(rows.some((r) => r.status === 'OK' && r.item === 'version'));
  assert.ok(rows.some((r) => r.status === 'INFO' && r.item === 'latest.json'));
  const md = renderReport({ tag: TAG, repo: REPO, keyId: keyIdHex(key.keyId), rows });
  assert.match(md, /\*\*Oordeel: FOUT\*\* — 3 controle\(s\) faalden/);
});

test('renderReport escapet backslash en pipe, zodat een detail de tabel niet breekt', () => {
  const md = renderReport({ tag: 'v0', repo: 'x/y', keyId: 'AA', rows: [{ group: 'g', item: 'C:\\pad|x', status: 'OK', detail: 'a\\|b' }] });
  assert.match(md, /\| C:\\\\pad\\\|x \| OK \| a\\\\\\\|b \|/);
});
