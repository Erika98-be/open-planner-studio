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
//   node scripts/run-browser-tests.mjs --duration-shard=2/4   # draai shard 2 van 4 (zo doet CI het)
import { readdirSync, readFileSync } from 'node:fs';
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

const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const total = Number(process.argv[2] ?? 4);
  const shards = assignShards(listSpecFiles(root), readDurations(root), total);
  shards.forEach((s, i) => {
    console.log(`shard ${i + 1}/${total}: ${s.files.length} specs, geschat ${Math.round(s.seconds)} s`);
    for (const f of s.files) console.log(`  ${f}`);
  });
}
