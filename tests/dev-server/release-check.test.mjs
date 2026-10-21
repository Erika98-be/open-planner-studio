import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Regressietests voor scripts/release-check.sh en .github/workflows/release-verify.yml
// (review PR #438, bevindingen 1 en 5).
const ROOT = new URL('../../', import.meta.url).pathname;
const HELPER = join(ROOT, 'scripts', 'release-check.sh');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'release-verify.yml');
const INJECTION = 'v2026.9.0\ntag=v2026.9.0$(printf INJECTIE >&2)';

function helper(args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-check-'));
  const log = join(dir, 'checks.tsv');
  const r = spawnSync('bash', [HELPER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, RELEASE_CHECKS: log, GITHUB_STEP_SUMMARY: join(dir, 'summary.md'), ...env },
  });
  return { ...r, log, rows: existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

/** De `run:`-blokken van een workflow, met de naam van de stap (regelgebaseerd, geen YAML-library). */
function runBlocks(yaml) {
  const lines = yaml.split('\n');
  const blocks = [];
  let name = '';
  for (let i = 0; i < lines.length; i++) {
    const n = /^\s*-?\s*name:\s*(.*)$/.exec(lines[i]);
    if (n) name = n[1];
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    if (m[2] !== '|' && m[2] !== '>') {
      blocks.push({ name, body: m[2] });
      continue;
    }
    const body = [];
    for (i++; i < lines.length && (lines[i].trim() === '' || lines[i].search(/\S/) > indent); i++) body.push(lines[i]);
    i--;
    const cut = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
    blocks.push({ name, body: body.map((l) => l.slice(cut)).join('\n') });
  }
  return blocks;
}

test('valid-tag keurt de hele waarde, ook met een regeleinde (bevinding 1)', () => {
  assert.equal(helper(['valid-tag', 'v2026.9.0']).status, 0);
  assert.equal(helper(['valid-tag', 'v2026.10.1-rc.1']).status, 0);
  for (const bad of [INJECTION, 'v2026.9.0\n', 'v1$(id)', 'v1 x', '', '2026.9.0', 'v2026.9.0;ls']) {
    assert.notEqual(helper(['valid-tag', bad]).status, 0, JSON.stringify(bad));
  }
});

test('de stap "Bepaal de tag" weigert de injectie-invoer en schrijft geen output (bevinding 1)', () => {
  const step = runBlocks(readFileSync(WORKFLOW, 'utf8')).find((b) => b.name === 'Bepaal de tag');
  assert.ok(step, 'stap "Bepaal de tag" niet gevonden');
  const dir = mkdtempSync(join(tmpdir(), 'resolve-'));
  const out = join(dir, 'output');
  writeFileSync(out, '');
  const r = spawnSync('bash', ['-e', '-c', step.body], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env, EVENT_NAME: 'workflow_dispatch', DISPATCH_TAG: INJECTION, GITHUB_OUTPUT: out,
      GITHUB_STEP_SUMMARY: join(dir, 'summary'), REPO: 'x/y', RELEASE_VERIFY_STRICT: '1',
      // Mocht de stap toch `gh` aanroepen: faal, niet het netwerk op.
      PATH: `${dir}:${process.env.PATH}`,
    },
  });
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(out, 'utf8'), '');
  assert.doesNotMatch(r.stdout + r.stderr, /INJECTIE/);

  writeFileSync(out, '');
  const ok = spawnSync('bash', ['-e', '-c', step.body], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, EVENT_NAME: 'workflow_dispatch', DISPATCH_TAG: 'v2026.9.0', GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: join(dir, 'summary'), REPO: 'x/y', RELEASE_VERIFY_STRICT: '1' },
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(readFileSync(out, 'utf8'), 'tag=v2026.9.0\n');
});

test('geen ${{ }} in een run:-blok van release-verify.yml (bevinding 1)', () => {
  const offenders = runBlocks(readFileSync(WORKFLOW, 'utf8')).filter((b) => b.body.includes('${{')).map((b) => b.name);
  assert.deepEqual(offenders, []);
});

test('elke helperaanroep met set +e geeft een kapotte controle door (bevinding 5)', () => {
  for (const b of runBlocks(readFileSync(WORKFLOW, 'utf8'))) {
    if (!b.body.includes('set +e')) continue;
    assert.match(b.body, /chk\(\) \{ bash scripts\/release-check\.sh "\$@" \|\| exit \$\?; \}/, b.name);
    const bare = b.body.split('\n').filter((l) => /bash scripts\/release-check\.sh (run|alive|record)/.test(l) && !l.includes('chk()'));
    assert.deepEqual(bare, [], `${b.name}: helper zonder chk`);
  }
});

test('run: een gewone mislukking is een FOUT-regel met helper-exit 0', () => {
  const r = helper(['run', 'faalt', 'false']);
  assert.equal(r.status, 0);
  assert.match(r.rows, /^FOUT\tfaalt\texit 1/);
});

test('run: ontbrekend commando, exit 127 en een syntaxfout zijn hard (exit 3), geen regel (bevinding 5)', () => {
  for (const args of [
    ['run', 'weg', 'bestaat-niet-ops-429'],
    ['run', 'weg', 'sh', '-c', 'bestaat-niet-ops-429'],
    ['run', 'kapot', 'bash', '-c', 'if then fi ('],
    ['alive', 'weg', '1', 'bestaat-niet-ops-429'],
  ]) {
    const r = helper(args);
    assert.equal(r.status, 3, `${args.join(' ')}: ${r.stderr}`);
    assert.equal(r.rows, '', args.join(' '));
  }
});

test('een stap met set +e stopt hard op een kapotte controle, ook in rapportmodus (bevinding 5)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chk-'));
  const script = `set +e -uo pipefail
chk() { bash ${JSON.stringify(HELPER)} "$@" || exit $?; }
chk run "ok" true
chk run "weg" bestaat-niet-ops-429
echo NA-DE-FOUT`;
  const r = spawnSync('bash', ['-e', '-c', script], {
    encoding: 'utf8', env: { ...process.env, RELEASE_CHECKS: join(dir, 'c.tsv'), RELEASE_VERIFY_STRICT: '0' },
  });
  assert.equal(r.status, 3);
  assert.doesNotMatch(r.stdout, /NA-DE-FOUT/);
});

test('finish: streng faalt op FOUT, rapportmodus niet; leeg of onzin in het log is hard', () => {
  const dir = mkdtempSync(join(tmpdir(), 'finish-'));
  const log = join(dir, 'c.tsv');
  const env = { ...process.env, RELEASE_CHECKS: log, GITHUB_STEP_SUMMARY: join(dir, 's.md') };
  const finish = (extra) => spawnSync('bash', [HELPER, 'finish', 'T'], { encoding: 'utf8', env: { ...env, ...extra } }).status;
  assert.equal(finish({}), 2, 'leeg log');
  writeFileSync(log, 'OK\ta\t\nFOUT\tb\tx\n');
  assert.equal(finish({ RELEASE_VERIFY_STRICT: '1' }), 1);
  assert.equal(finish({ RELEASE_VERIFY_STRICT: '0' }), 0);
  writeFileSync(log, 'OK\ta\t\nbash: regel 3: syntaxfout\n');
  assert.equal(finish({ RELEASE_VERIFY_STRICT: '0' }), 3);
});

test('release.yml: elke `tauri signer sign` wist eerst de oude .sig en controleert de exitcode (bevinding 6)', () => {
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8').split('\n');
  const calls = yml.map((l, i) => [l, i]).filter(([l]) => /npx tauri signer sign /.test(l));
  assert.ok(calls.length >= 2);
  for (const [line, i] of calls) {
    const target = /sign "([^"]+)"/.exec(line)[1];
    assert.ok(yml[i - 1].includes('Remove-Item') && yml[i - 1].includes(`${target}.sig`), `oude .sig niet gewist vóór regel ${i + 1}`);
    assert.match(yml[i + 1], /if \(\$LASTEXITCODE -ne 0\) \{ throw /, `geen exitcodecontrole na regel ${i + 1}`);
  }
});
