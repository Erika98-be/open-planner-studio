import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import {
  evaluateRelease,
  hasMacCodeSignature,
  keyIdHex,
  parsePublicKey,
  renderReport,
  tarEntryNames,
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
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: text, data: DATA });
  assert.equal(r.ok, false);
  assert.match(r.reason, /globale handtekening/);
});

test('onzin als handtekening geeft een FOUT-uitkomst, geen exceptie', () => {
  const key = makeKey();
  const r = verifyMinisign({ publicKey: key.pubkey, signatureText: 'geen handtekening', data: DATA });
  assert.equal(r.ok, false);
});

// Minimale ustar-tar met lege bestanden.
function tar(names) {
  const blocks = names.map((name) => {
    const h = Buffer.alloc(512);
    h.write(name, 0, 'utf8');
    h.write('0000644\0', 100);
    h.write('00000000000\0', 124);
    h[156] = name.endsWith('/') ? 0x35 : 0x30;
    h.write('ustar\0' + '00', 257, 'latin1');
    return h;
  });
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

test('tarEntryNames en hasMacCodeSignature herkennen een gecodesignde app', () => {
  const signed = tarEntryNames(tar(['A.app/', 'A.app/Contents/Info.plist', 'A.app/Contents/_CodeSignature/CodeResources']));
  assert.equal(signed.length, 3);
  assert.equal(hasMacCodeSignature(signed), true);
  assert.equal(hasMacCodeSignature(tarEntryNames(tar(['A.app/', 'A.app/Contents/Info.plist']))), false);
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
    platforms: {
      'windows-x86_64': { url: 'https://example.invalid/releases/latest/download/app.nsis.zip', signature: files.get('app.nsis.zip.sig').toString() },
      'linux-x86_64': { url: 'https://example.invalid/releases/latest/download/weg.AppImage', signature: 'x' },
    },
  })));
  const sha = (b) => `sha256:${createHash('sha256').update(b).digest('hex')}`;
  const assets = [...files.keys()].map((name) => ({ name, digest: sha(files.get(name)) }));
  assets.find((a) => a.name === 'app.nsis.zip').digest = 'sha256:' + '0'.repeat(64);
  assets.find((a) => a.name === 'latest.json').digest = null;

  const rows = evaluateRelease({ publicKey: key.pubkey, assets, read: (n) => files.get(n) });
  const fails = rows.filter((r) => r.status === 'FOUT').map((r) => `${r.group}: ${r.item}`).sort();
  assert.deepEqual(fails, [
    'latest.json: linux-x86_64',
    'sha256 = GitHub-digest: app.nsis.zip',
    'updater-handtekening (.sig): app-setup.exe',
  ]);
  assert.ok(rows.some((r) => r.status === 'OK' && r.group === 'latest.json' && r.item === 'windows-x86_64'));
  assert.ok(rows.some((r) => r.status === 'INFO' && r.item === 'latest.json'));
  const md = renderReport({ tag: 'v0.0.0', repo: 'x/y', keyId: keyIdHex(key.keyId), rows });
  assert.match(md, /\*\*Oordeel: FOUT\*\* — 3 controle\(s\) faalden/);
});

test('renderReport escapet backslash en pipe, zodat een detail de tabel niet breekt', () => {
  const md = renderReport({ tag: 'v0', repo: 'x/y', keyId: 'AA', rows: [{ group: 'g', item: 'C:\\pad|x', status: 'OK', detail: 'a\\|b' }] });
  assert.match(md, /\| C:\\\\pad\\\|x \| OK \| a\\\\\\\|b \|/);
});
