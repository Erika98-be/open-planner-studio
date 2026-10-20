#!/usr/bin/env node
// Verdeling van de browserspecs over de CI-shards op gemeten duur, in plaats van Playwrights `--shard`.
//
// Waarom: `--shard=k/n` knipt de testlijst in n aaneengesloten stukken met evenveel TESTS, in
// bestandsvolgorde. Alle tutorialspecs (weinig tests, elk lang) vielen zo samen in shard 4: in CI-run
// 39275828606 waren de testvensters 436/402/454/566 s (testaudit 2026-10-20, review D §7 en review F).
// Hier krijgt elke spec een geschatte duur uit `tests/browser/spec-durations.json`, en de verdeling is
// "langste eerst naar de lichtste shard" (LPT): eenvoudig, deterministisch en ruim binnen een paar
// procent van het optimum bij ruim honderd specs.
//
// Dekking hangt NIET van de duren af: elke spec die Playwright zou vinden, komt in precies één shard
// (een spec zonder meting krijgt de mediaan). Een verouderd getal kost alleen balans.
// `tests/dev-server/browser-shards.test.mjs` bewaakt dat de unie van alle shards exact de specs is die
// `playwright test --list` vindt, en dat geen spec in twee shards zit.
//
//   node scripts/browser-shards.mjs 4          # toon de indeling over 4 shards met geschatte duur
//   node scripts/browser-shards.mjs --update "CI-run <id>" shard-*.log   # duren uit de joblogs van een run
//   node scripts/run-browser-tests.mjs --duration-shard=2/4   # draai shard 2 van 4 (zo doet CI het)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const SPEC_DIR = 'tests/browser';
export const DURATIONS_FILE = 'tests/browser/spec-durations.json';
/** Playwrights standaard-testMatch (`**\/*.@(spec|test).?(c|m)[jt]s?(x)`); playwright.config.ts zet geen eigen. */
const SPEC_PATTERN = /\.(?:spec|test)\.(?:c|m)?[jt]sx?$/;

/** Alle specbestanden onder tests/browser, als posix-pad relatief aan de repo, gesorteerd. */
export function listSpecFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SPEC_PATTERN.test(entry.name)) found.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(join(root, SPEC_DIR));
  return found.sort();
}

/** { 'naam.spec.ts': seconden } uit het duurbestand; ontbreekt het, dan leeg (alles krijgt de mediaan). */
export function readDurations(root) {
  try {
    const parsed = JSON.parse(readFileSync(join(root, DURATIONS_FILE), 'utf8'));
    return parsed && typeof parsed.seconds === 'object' ? parsed.seconds : {};
  } catch {
    return {};
  }
}

/** Shardnummer en totaal uit "k/n" (1-gebaseerd), of een fout met de juiste vorm. */
export function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  const current = match ? Number(match[1]) : NaN;
  const total = match ? Number(match[2]) : NaN;
  if (!(total >= 1) || !(current >= 1) || current > total) {
    throw new Error(`--duration-shard "${value}": verwacht "k/n" met 1 ≤ k ≤ n, bijvoorbeeld "2/4"`);
  }
  return { current, total };
}

/**
 * Verdeel `files` (paden relatief aan de repo) over `total` shards. `durations` is gesleuteld op het pad
 * relatief aan tests/browser. Geeft `total` lijsten terug, elk gesorteerd, samen precies `files`.
 */
export function assignShards(files, durations, total) {
  const relToSpecDir = (file) => file.startsWith(`${SPEC_DIR}/`) ? file.slice(SPEC_DIR.length + 1) : file;
  const known = files.map((f) => durations[relToSpecDir(f)]).filter((s) => typeof s === 'number' && s > 0)
    .sort((a, b) => a - b);
  const median = known.length > 0 ? known[Math.floor(known.length / 2)] : 1;
  const estimate = (file) => {
    const s = durations[relToSpecDir(file)];
    return typeof s === 'number' && s > 0 ? s : median;
  };
  const order = [...files].sort((a, b) => estimate(b) - estimate(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards = Array.from({ length: total }, () => ({ files: [], seconds: 0 }));
  for (const file of order) {
    let lightest = 0;
    for (let i = 1; i < total; i++) if (shards[i].seconds < shards[lightest].seconds) lightest = i;
    shards[lightest].files.push(file);
    shards[lightest].seconds += estimate(file);
  }
  return shards.map((s) => ({ files: s.files.sort(), seconds: s.seconds }));
}

/** De specs van shard `current` van `total` voor deze repo. */
export function shardFiles(root, current, total) {
  return assignShards(listSpecFiles(root), readDurations(root), total)[current - 1].files;
}

/**
 * Seconden per spec uit de log van een CI-browserjob (GitHub-tijdstempel vóór elke regel, Playwrights
 * `line`-reporter): per test de tijd tot de start van de volgende test, de laatste tot de regel
 * "N passed". Opgeteld per spec. Dezelfde maat als de audit gebruikte (startvensters).
 */
export function durationsFromJobLog(text) {
  const starts = [];
  let end = null;
  for (const line of text.split('\n')) {
    const start = /^(\S+Z) \[\d+\/\d+\] \[[^\]]+\] › tests\/browser\/([^:]+):/.exec(line);
    if (start) starts.push({ at: Date.parse(start[1]), spec: start[2] });
    const passed = /^(\S+Z)\s+\d+ passed/.exec(line);
    if (passed) end = Date.parse(passed[1]);
  }
  const seconds = {};
  starts.forEach(({ at, spec }, i) => {
    const next = i + 1 < starts.length ? starts[i + 1].at : end;
    if (next !== null) seconds[spec] = (seconds[spec] ?? 0) + (next - at) / 1000;
  });
  return seconds;
}

const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli && process.argv[2] === '--update') {
  // node scripts/browser-shards.mjs --update <bron> <joblog>...  (de logs van ALLE shards van één groene run,
  // bv. `gh api repos/<repo>/actions/jobs/<id>/logs > shard-1.log`). Vervangt de duren in het bestand.
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const [source, ...logs] = process.argv.slice(3);
  if (!source || logs.length === 0) {
    console.error('Gebruik: node scripts/browser-shards.mjs --update <bron, bv. "CI-run 123"> <joblog>...');
    process.exit(2);
  }
  const seconds = {};
  for (const log of logs) Object.assign(seconds, durationsFromJobLog(readFileSync(log, 'utf8')));
  const existing = listSpecFiles(root).map((f) => f.slice(SPEC_DIR.length + 1));
  const missing = existing.filter((spec) => !(spec in seconds));
  const rounded = Object.fromEntries(Object.keys(seconds).filter((spec) => existing.includes(spec)).sort()
    .map((spec) => [spec, Math.round(seconds[spec] * 10) / 10]));
  const file = join(root, DURATIONS_FILE);
  const current = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, `${JSON.stringify({ ...current, _bron: source, seconds: rounded }, null, 2)}\n`);
  console.log(`${Object.keys(rounded).length} specs bijgewerkt uit ${logs.length} log(s)`
    + `${missing.length ? `; zonder meting (krijgen de mediaan): ${missing.join(', ')}` : ''}`);
} else if (isCli) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const total = Number(process.argv[2] ?? 4);
  const shards = assignShards(listSpecFiles(root), readDurations(root), total);
  shards.forEach((s, i) => {
    console.log(`shard ${i + 1}/${total}: ${s.files.length} specs, geschat ${Math.round(s.seconds)} s`);
    for (const f of s.files) console.log(`  ${f}`);
  });
}
