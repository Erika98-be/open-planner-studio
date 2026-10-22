// @ts-check
// node --test scripts/aur/render-pkgbuild.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
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

// Draai het echte versiescript zonder GitHub of publicatie: gh accepteert alleen de API-aanroep
// voor de gekozen tag. Een terugval naar `gh release list` laat deze test dus falen.
test('aur.yml gebruikt de gebouwde pakketversie, of de expliciete dispatch-tag', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/aur.yml'), 'utf8');
  const match = /      - name: Get version[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/.exec(workflow);
  assert.ok(match, 'versiestap ontbreekt');
  const script = match[1].replace(/^          /gm, '');
  const d = mkdtempSync(join(tmpdir(), 'ops-aur-version-'));
  try {
    writeFileSync(join(d, 'package.json'), JSON.stringify({ version: '2026.43.1' }));
    const gh = join(d, 'gh');
    writeFileSync(gh, `#!/usr/bin/env bash
set -eu
[ "$1" = api ] || { echo "onverwachte gh-aanroep: $*" >&2; exit 1; }
printf '%s\\n' "$2" >> "$API_LOG"
printf '%s\\n' '{"draft":false,"prerelease":false}'
`);
    chmodSync(gh, 0o755);
    for (const [event, expected] of [['workflow_run', '2026.43.1'], ['workflow_dispatch', '2099.1.0']]) {
      const output = join(d, `${event}.output`);
      const apiLog = join(d, `${event}.api`);
      const result = spawnSync('bash', ['-c', script], {
        cwd: d,
        encoding: 'utf8',
        env: {
          ...process.env, PATH: `${d}:${process.env.PATH}`, EVENT_NAME: event,
          DISPATCH_VERSION: 'v2099.1.0', HEAD_BRANCH: 'main', REPO: 'test/repo',
          GITHUB_OUTPUT: output, API_LOG: apiLog,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8'), `version=v${expected}\nversion_number=${expected}\n`);
      assert.equal(readFileSync(apiLog, 'utf8'), `repos/test/repo/releases/tags/v${expected}\n`);
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
