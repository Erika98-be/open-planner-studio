// @ts-check
// node --test scripts/aur/render-pkgbuild.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { comparePackages, renderPkgbuild, srcinfoVersion } from './render-pkgbuild.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const TEMPLATE = readFileSync(join(ROOT, 'packaging/aur/PKGBUILD'), 'utf8');
const SRCINFO = readFileSync(join(ROOT, 'packaging/aur/.SRCINFO'), 'utf8');
const SHA = 'a'.repeat(64);

test('renderPkgbuild: nieuwe versie → pkgver, pkgrel=1, checksum; rest ongewijzigd', () => {
  const out = renderPkgbuild(TEMPLATE.replace(/^pkgrel=1$/m, 'pkgrel=3'), { version: '2026.10.0', sha256: SHA });
  assert.match(out, /^pkgver=2026\.10\.0$/m);
  assert.match(out, /^pkgrel=1$/m);
  assert.match(out, new RegExp(`^sha256sums_x86_64=\\('${SHA}'\\)$`, 'm'));
  const strip = (/** @type {string} */ s) => s.replace(/^(pkgver|pkgrel|sha256sums_x86_64)=.*$/gm, '');
  assert.equal(strip(out), strip(TEMPLATE));
});

test('renderPkgbuild: zelfde versie houdt de pkgrel uit het sjabloon', () => {
  const tpl = TEMPLATE.replace(/^pkgrel=1$/m, 'pkgrel=2');
  const ver = /^pkgver=(.*)$/m.exec(tpl)?.[1] ?? '';
  assert.match(renderPkgbuild(tpl, { version: ver, sha256: SHA }), /^pkgrel=2$/m);
});

test('renderPkgbuild: weigert ongeldige versies en checksums', () => {
  assert.match(renderPkgbuild(TEMPLATE, { version: '2026.43.1042', sha256: SHA }), /^pkgver=2026\.43\.1042$/m);
  assert.throws(() => renderPkgbuild(TEMPLATE, { version: 'v2026.9.0', sha256: SHA }), /X\.Y\.Z/);
  assert.throws(() => renderPkgbuild(TEMPLATE, { version: '2026.9.0/../x', sha256: SHA }), /X\.Y\.Z/);
  assert.throws(() => renderPkgbuild(TEMPLATE, { version: '2026.9.0', sha256: 'abc' }), /sha256/);
  assert.throws(() => renderPkgbuild(`${TEMPLATE}\npkgver=1.2.3\n`, { version: '2026.9.0', sha256: SHA }), /precies één/);
});

test('srcinfoVersion + comparePackages: nooit terug in versie', () => {
  assert.deepEqual(srcinfoVersion(SRCINFO), { pkgver: '2026.9.0', pkgrel: 1 });
  const v = (/** @type {string} */ ver, /** @type {number} */ rel) =>
    SRCINFO.replace(/^\tpkgver = .*$/m, `\tpkgver = ${ver}`).replace(/^\tpkgrel = .*$/m, `\tpkgrel = ${rel}`);
  assert.equal(comparePackages(v('2026.9.0', 1), v('2026.10.0', 1)), 'push');
  assert.equal(comparePackages(v('2026.9.0', 1), v('2026.9.0', 2)), 'push');
  assert.equal(comparePackages(v('2026.9.0', 1), v('2026.9.0', 1)), 'same');
  assert.equal(comparePackages(v('2026.10.0', 1), v('2026.9.0', 3)), 'older');
  assert.equal(comparePackages(v('2026.9.0', 2), v('2026.9.0', 1)), 'older');
  assert.equal(comparePackages(v('2026.9.10', 1), v('2026.9.9', 1)), 'older');
});

test('cli: schrijft het PKGBUILD; exit 1 bij een ongeldige versie', () => {
  const d = mkdtempSync(join(tmpdir(), 'ops-aur-'));
  const tpl = join(d, 'PKGBUILD.in');
  writeFileSync(tpl, TEMPLATE);
  const script = join(HERE, 'render-pkgbuild.mjs');
  const ok = spawnSync(process.execPath, [script, '--template', tpl, '--version', '2026.10.0', '--sha256', SHA, '--out', join(d, 'PKGBUILD')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(readFileSync(join(d, 'PKGBUILD'), 'utf8'), /^pkgver=2026\.10\.0$/m);
  const bad = spawnSync(process.execPath, [script, '--template', tpl, '--version', '2026.43.1-beta', '--sha256', SHA, '--out', join(d, 'X')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
