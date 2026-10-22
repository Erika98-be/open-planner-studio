import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpVersion, checkVersionFiles, isoWeek, nextVersion, parseVersion } from '../../scripts/bump-version.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
// Bewust een onafhankelijke lijst: een vergeten pakket mag niet verdwijnen uit de testdekking.
const paths = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'headless/server/package.json', 'headless/consumer-example/package.json', 'headless/server/openapi.yaml', 'snap/snapcraft.yaml'];

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ops-bump-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of [...paths, 'scripts/bump-version.js']) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    copyFileSync(join(root, path), join(dir, path));
  }
  const sourceVersion = json(root, 'package.json').version;
  for (const path of paths) writeFileSync(join(dir, path), read(dir, path).replaceAll(sourceVersion, '2026.10.0'));
  return dir;
}

const read = (dir, path) => readFileSync(join(dir, path), 'utf8');
const json = (dir, path) => JSON.parse(read(dir, path));
const snapshot = dir => paths.map(path => read(dir, path));

function assertVersions(dir, version) {
  for (const path of ['package.json', 'src-tauri/tauri.conf.json', 'headless/server/package.json', 'headless/consumer-example/package.json']) {
    assert.equal(json(dir, path).version, version, path);
  }
  const lock = json(dir, 'package-lock.json');
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.ok(read(dir, 'src-tauri/Cargo.toml').includes(`name = "open-planner-studio"\nversion = "${version}"`));
  assert.ok(read(dir, 'src-tauri/Cargo.lock').includes(`name = "open-planner-studio"\nversion = "${version}"`));
  assert.ok(read(dir, 'headless/server/openapi.yaml').includes(`  version: ${version}\n`));
  assert.ok(read(dir, 'snap/snapcraft.yaml').includes(`version: '${version}'\n`));
}

test('gewone week begint bij nul en telt numeriek verder vanaf de hoogste stabiele weektag', () => {
  assert.deepEqual(isoWeek('2026-10-22'), { year: 2026, week: 43 });
  assert.equal(nextVersion('2026-10-22', ['v2026.10.0', 'v2026.42.99', 'v2027.43.50']), '2026.43.0');
  assert.equal(nextVersion('2026-10-22', ['v2026.43.0']), '2026.43.1');
  assert.equal(nextVersion('2026-10-22', ['v2026.43.9', 'v2026.43.99', 'v2026.43.10', 'v2026.43.100-beta', 'v2026.43.099', '2026.43.101']), '2026.43.100');
});

test('28 december 2026 t/m 3 januari 2027 horen allemaal bij ISO-weekjaar 2026, week 53', () => {
  for (const date of ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']) {
    assert.deepEqual(isoWeek(date), { year: 2026, week: 53 }, date);
    assert.equal(nextVersion(date, ['v2026.53.7', 'v2027.1.99']), '2026.53.8', date);
  }
  assert.equal(nextVersion('2027-01-04', ['v2026.53.99']), '2027.1.0');
  assert.deepEqual(isoWeek('2025-12-29'), { year: 2026, week: 1 });
});

test('foute nummers en ongeldige datums worden geweigerd', () => {
  for (const version of ['2026.03.0', '2026.43.01', '2026.0.0', '2026.54.0', '2027.53.0', '2026.43.-1', '2026.43.0-beta', 'v2026.43.0', '2026-43', '026.43.0', '2026.43.9007199254740992', '2026.43.0\n']) {
    assert.throws(() => parseVersion(version), /geen geldige versie/, version);
  }
  for (const date of ['2026-02-30', '2026-2-03', 'ongeldig']) assert.throws(() => isoWeek(date), /Ongeldige datum/, date);
  assert.deepEqual(parseVersion('2026.53.12345'), [2026, 53, 12345]);
});

test('bump houdt alle app-, Cargo- en headless-velden gelijk en bewaart dependencies en opmaak', t => {
  const dir = fixture(t);
  const before = snapshot(dir);
  const dependencies = json(dir, 'package-lock.json').packages;
  delete dependencies[''];
  assert.equal(bumpVersion({ root: dir, date: '2026-10-22', tags: [] }), '2026.43.0');
  assertVersions(dir, '2026.43.0');
  assert.equal(bumpVersion({ root: dir, date: '2026-10-22', tags: ['v2026.43.0'] }), '2026.43.1');
  assertVersions(dir, '2026.43.1');
  const afterDependencies = json(dir, 'package-lock.json').packages;
  delete afterDependencies[''];
  assert.deepEqual(afterDependencies, dependencies);
  // Uitsluitend de eigen versievelden mogen wijzigen, ook in Cargo.lock.
  for (const [index, path] of paths.entries()) {
    assert.equal(read(dir, path).replaceAll('2026.43.1', '2026.10.0'), before[index], path);
  }
  const bumped = snapshot(dir);
  checkVersionFiles('2026.43.1', dir);
  assert.deepEqual(snapshot(dir), bumped, 'de releasecontrole schrijft niets');
  assert.equal(bumpVersion({ root: dir, version: '2026.43.1' }), '2026.43.1', 'gelijk nummer is toegestaan');
  assert.equal(bumpVersion({ root: dir, version: '2026.44.1' }), '2026.44.1');
  assertVersions(dir, '2026.44.1');
});

test('een lager nummer of een ongeldig bestand laat alle bestanden ongewijzigd', t => {
  const dir = fixture(t);
  bumpVersion({ root: dir, version: '2026.43.10' });
  const before = snapshot(dir);
  for (const version of ['2026.43.9', '2026.42.99', '2025.52.99', '2026.043.11']) {
    assert.throws(() => bumpVersion({ root: dir, version }));
    assert.deepEqual(snapshot(dir), before);
  }
  assert.throws(() => bumpVersion({ root: dir, date: '2026-10-22', tags: [] }), /lager/);
  assert.deepEqual(snapshot(dir), before);
  writeFileSync(join(dir, 'src-tauri/Cargo.lock'), read(dir, 'src-tauri/Cargo.lock').replace('name = "open-planner-studio"', 'name = "ontbreekt"'));
  const broken = snapshot(dir);
  assert.throws(() => bumpVersion({ root: dir, version: '2026.44.0' }), /Cargo.lock.*vond er 0/);
  assert.deepEqual(snapshot(dir), broken, 'alles vooraf controleren voorkomt een gedeeltelijke bump');
});

test('de releasecontrole weigert ieder afwijkend versieveld afzonderlijk', t => {
  const dir = fixture(t);
  bumpVersion({ root: dir, version: '2026.43.0' });
  for (const path of paths) {
    const original = read(dir, path);
    writeFileSync(join(dir, path), original.replace('2026.43.0', '2026.42.0'));
    assert.throws(() => checkVersionFiles('2026.43.0', dir), error => error.message.includes(path), path);
    writeFileSync(join(dir, path), original);
  }
});

test('CLI zonder argument leest de git-tags, gebruikt OPS_BUMP_DATE en ondersteunt --check', t => {
  const dir = fixture(t);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  // Geen echte tags aanmaken: deze git-vervanger bewaakt ook de read-only tagaanroep.
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\nimport assert from 'node:assert/strict';\nassert.deepEqual(process.argv.slice(2), ['tag', '--list', 'v2026.53.*']);\nconsole.log('v2026.53.2\\nv2026.53.10');\n`, { mode: 0o755 });
  for (const TZ of ['Europe/Amsterdam', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
    const env = { ...process.env, OPS_BUMP_DATE: '2027-01-01', PATH: `${bin}${delimiter}${process.env.PATH}`, TZ };
    const run = args => spawnSync(process.execPath, ['scripts/bump-version.js', ...args], { cwd: dir, env, encoding: 'utf8' });
    const result = run([]);
    assert.equal(result.status, 0, result.stderr);
    assertVersions(dir, '2026.53.11');
    assert.equal(run(['--check', '2026.53.11']).status, 0);
    assert.equal(run(['--check', '2026.53.12']).status, 1);
    assert.equal(run(['2026.52.0']).status, 1);
    assert.equal(run(['2027.01.0']).status, 1);
    assert.equal(run(['2027.1.0', 'extra']).status, 1);
  }
});
