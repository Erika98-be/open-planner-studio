#!/usr/bin/env node
// Kwantitatieve meting voor de `docs-audit`-skill. Alleen lezen: dit script verandert niets.
//
//   node .claude/skills/docs-audit/metrics.mjs              # rapport in Markdown op stdout
//   node .claude/skills/docs-audit/metrics.mjs --json x.json # daarnaast alle ruwe cijfers als JSON
//
// Wat het meet staat in SKILL.md (§ Kwantitatief). Elke drempel hieronder levert een SIGNAAL, geen
// oordeel: een signaal is een plek om te gaan lezen. Of het echt fout is, beslist de kwalitatieve stap.
// `verify:docs` bewaakt de structuur al (manifest, pariteit van koppen en links, parser-subset); wat
// die poort al afdwingt, meet dit script niet nog eens.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'public/docs');
const LOCALES = join(ROOT, 'src/i18n/locales');
const INVENTORY = join(ROOT, 'docs/superpowers/specs/2026-09-28-gebruikersdocumentatie-functie-inventaris.md');
const HELP_IDS = join(ROOT, 'src/state/helpArticles.ts');
const LANGS = ['nl', 'en'];

/** Drempels voor signalen (zie SKILL.md: ze wijzen aan waar je leest, ze keuren niets af). */
const T = {
  /** en/nl-woordverhouding buiten deze band: een taal mist mogelijk inhoud. */
  parityLow: 0.8,
  parityHigh: 1.3,
  /** Aandeel lijstregels in de lopende tekst: boven deze grens mogelijk een "kale opsomming". */
  listShare: 0.6,
  /** Gemiddelde zinslengte (woorden) boven deze grens: "korte zinnen" (schrijfgids §4.1.7) in gevaar. */
  avgSentence: 20,
  /** Eén zin langer dan dit is een signaal. */
  longSentence: 40,
};

if (!existsSync(join(DOCS, 'manifest.json'))) {
  console.error('Draai dit vanuit de root van de repo (public/docs/manifest.json niet gevonden).');
  process.exit(2);
}

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const manifest = JSON.parse(readFileSync(join(DOCS, 'manifest.json'), 'utf8'));
const articles = manifest.articles;
const kindOf = new Map(articles.map(a => [a.id, a.kind]));
const aliases = manifest.aliases ?? {};
const resolveId = id => (kindOf.has(id) ? id : aliases[id] ?? id);

// ── Hulpjes ─────────────────────────────────────────────────────────────────────────────────────────

/** Tekst zonder codeblokken en inline code: die horen niet mee in woorden, zinnen of labels. */
function stripCode(md) {
  return md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

const words = s => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Alle stringwaarden uit de locale-bestanden van één taal, plus een kleine-letterversie. */
function localeStrings(lang) {
  const exact = new Set();
  const walk = v => {
    if (typeof v === 'string') exact.add(normLabel(v));
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  for (const f of readdirSync(join(LOCALES, lang)).filter(f => f.endsWith('.json'))) {
    walk(JSON.parse(readFileSync(join(LOCALES, lang, f), 'utf8')));
  }
  return { exact, lower: new Set([...exact].map(s => s.toLowerCase())) };
}

/** Een label zoals de docs hem schrijven: zonder ▾, …, sneltoets-uitleg en omringende spaties. */
function normLabel(s) {
  return s.replace(/\{\{[^}]*\}\}/g, '').replace(/[▾…]|\.\.\./g, '').replace(/\s+/g, ' ').trim();
}

function lastChanged(path) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', path], { cwd: ROOT }).toString().trim() || null;
  } catch {
    return null;
  }
}

// ── Per artikel ─────────────────────────────────────────────────────────────────────────────────────

const locale = Object.fromEntries(LANGS.map(l => [l, localeStrings(l)]));
const perArticle = [];
const inLinks = new Map(articles.map(a => [a.id, new Set()]));

for (const a of articles) {
  const row = { id: a.id, kind: a.kind, draft: !!a.draft };
  for (const lang of LANGS) {
    const path = join(DOCS, lang, `${a.id}.md`);
    if (!existsSync(path)) { row[lang] = null; continue; }
    const raw = readFileSync(path, 'utf8');
    const text = stripCode(raw);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const body = lines.filter(l => !l.startsWith('#'));
    const listLines = body.filter(l => /^([-*]|\d+\.)\s/.test(l));
    const prose = body.filter(l => !/^([-*]|\d+\.)\s/.test(l) && !l.startsWith('!['))
      .map(l => l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
    const sentences = prose.join(' ').split(/(?<=[.!?]\**)\s+(?=[\p{Lu}\d*])/u).map(words).filter(n => n > 0);
    const links = [...raw.matchAll(/\]\(docs:\/\/([^)#\s]+)(?:#[^)]*)?\)/g)].map(m => resolveId(m[1]));
    // Lintpaden in de vorm *Planning › Kalender › Kalender*: elk deel hoort letterlijk een label te zijn.
    const pathSegments = [...text.matchAll(/\*{1,2}([^*\n]*›[^*\n]*)\*{1,2}/g)]
      .flatMap(m => m[1].split('›').map(normLabel)).filter(Boolean);
    const unmatched = [];
    const caseOnly = [];
    const known = s => locale[lang].exact.has(s);
    for (const seg of pathSegments) {
      // Een opsomming van labels in één padonderdeel ("Verticaal, Horizontaal, Zoomen") per label toetsen.
      if (known(seg) || (seg.includes(',') && seg.split(/,\s*/).every(known))) continue;
      if (locale[lang].lower.has(seg.toLowerCase())) caseOnly.push(seg);
      else unmatched.push(seg);
    }
    row[lang] = {
      words: words(body.join(' ')),
      headings: lines.filter(l => l.startsWith('#')).length,
      listShare: body.length ? +(listLines.length / body.length).toFixed(2) : 0,
      avgSentence: sentences.length ? +(sentences.reduce((s, n) => s + n, 0) / sentences.length).toFixed(1) : 0,
      longestSentence: sentences.length ? Math.max(...sentences) : 0,
      images: (raw.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length,
      numbers: (text.match(/\b\d+([.,:]\d+)*\b/g) ?? []).length,
      outLinks: [...new Set(links)],
      pathSegments: pathSegments.length,
      unmatchedLabels: [...new Set(unmatched)],
      caseOnlyLabels: [...new Set(caseOnly)],
      // Alleen nl: de schrijfgids eist je-vorm; "u"/"uw" als los woord is een signaal.
      formal: lang === 'nl' ? (text.match(/(?<![\p{L}\p{N}`+])(u|uw|U|Uw)(?![\p{L}\p{N}`+])/gu) ?? []).length : 0,
      lastChanged: lastChanged(join('public/docs', lang, `${a.id}.md`)),
    };
    if (lang === 'nl') for (const t of row.nl.outLinks) inLinks.get(t)?.add(a.id);
  }
  perArticle.push(row);
}

// ── Over de hele set ────────────────────────────────────────────────────────────────────────────────

const helpIds = existsSync(HELP_IDS)
  ? [...readFileSync(HELP_IDS, 'utf8').matchAll(/export const \w+ = '([^'#]+)(?:#[^']*)?'/g)].map(m => resolveId(m[1]))
  : [];
const appUsed = new Set(helpIds);

// ?-knoppen: elke <DialogHeader …/> in src/ met of zonder help-prop, plus DialogHelpButton/HelpButton.
function dialogHelpCoverage() {
  const files = execFileSync('git', ['ls-files', 'src/**/*.tsx'], { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
  const without = [];
  let headers = 0;
  let withHelp = 0;
  let ownHelp = 0;
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    if (/<(DialogHelpButton|HelpButton)\b/.test(src) && !f.endsWith('Dialog.tsx') && !f.endsWith('HelpButton.tsx')) ownHelp++;
    for (const m of src.matchAll(/<DialogHeader\b[\s\S]*?\/>/g)) {
      headers++;
      if (/\bhelp=/.test(m[0])) withHelp++;
      else without.push(f);
    }
  }
  return { headers, withHelp, withoutHelp: [...new Set(without)], filesWithOwnHelpButton: ownHelp };
}

// Dekking van de functie-inventaris: komt de (eerste) naam van elke functie ergens in de nl-docs voor?
// Grof: een naam die nergens voorkomt is een kandidaat-gat om na te lopen, geen bewezen gat.
function inventoryCoverage() {
  if (!existsSync(INVENTORY)) return null;
  const corpus = articles.map(a => {
    const p = join(DOCS, 'nl', `${a.id}.md`);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  }).join('\n').toLowerCase();
  const items = [...readFileSync(INVENTORY, 'utf8').matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]);
  const missing = [];
  for (const item of items) {
    const variants = item.split(/\s*\/\s*|\s*\(|\)/).map(normLabel).map(s => s.toLowerCase()).filter(s => s.length > 2);
    if (!variants.some(v => corpus.includes(v))) missing.push(item);
  }
  return { items: items.length, found: items.length - missing.length, missing };
}

const kinds = {};
for (const r of perArticle) {
  kinds[r.kind] ??= { articles: 0, wordsNl: 0, wordsEn: 0 };
  kinds[r.kind].articles++;
  kinds[r.kind].wordsNl += r.nl?.words ?? 0;
  kinds[r.kind].wordsEn += r.en?.words ?? 0;
}

const signals = [];
for (const r of perArticle) {
  const nl = r.nl;
  const en = r.en;
  if (!nl || !en) { signals.push([r.id, 'ontbreekt', `nl ${nl ? 'ja' : 'nee'}, en ${en ? 'ja' : 'nee'}`]); continue; }
  const ratio = nl.words ? en.words / nl.words : 0;
  if (ratio < T.parityLow || ratio > T.parityHigh) signals.push([r.id, 'pariteit', `en/nl-woorden ${ratio.toFixed(2)} (${en.words}/${nl.words})`]);
  if (nl.listShare > T.listShare && r.kind !== 'referentie') signals.push([r.id, 'opsomming', `${Math.round(nl.listShare * 100)}% lijstregels`]);
  if (nl.avgSentence > T.avgSentence) signals.push([r.id, 'zinslengte', `gemiddeld ${nl.avgSentence} woorden`]);
  if (nl.longestSentence > T.longSentence) signals.push([r.id, 'lange zin', `${nl.longestSentence} woorden`]);
  if (r.kind === 'uitleg' && nl.numbers < 5) signals.push([r.id, 'geen rekenvoorbeeld', `${nl.numbers} getallen in een uitleg`]);
  if (nl.formal) signals.push([r.id, 'u-vorm', `${nl.formal}× "u"/"uw"`]);
  if (!nl.outLinks.length) signals.push([r.id, 'geen links', 'linkt naar geen ander artikel']);
  const linkedKinds = new Set(nl.outLinks.map(t => kindOf.get(t)));
  if (r.kind === 'howto' && !linkedKinds.has('uitleg')) signals.push([r.id, 'kruislink', 'how-to zonder link naar een uitleg']);
  if (r.kind === 'uitleg' && !linkedKinds.has('howto')) signals.push([r.id, 'kruislink', 'uitleg zonder link naar een how-to']);
  if (!inLinks.get(r.id).size && !appUsed.has(r.id)) signals.push([r.id, 'wees', 'geen artikel linkt ernaar en de app opent het niet']);
  for (const lang of LANGS) {
    const x = r[lang];
    if (x.unmatchedLabels.length) signals.push([r.id, `label ${lang}`, `niet als label gevonden: ${x.unmatchedLabels.map(s => `"${s}"`).join(', ')}`]);
    if (x.caseOnlyLabels.length) signals.push([r.id, `hoofdletter ${lang}`, `alleen anders gespeld: ${x.caseOnlyLabels.map(s => `"${s}"`).join(', ')}`]);
  }
}

const dialogs = dialogHelpCoverage();
const inventory = inventoryCoverage();
const totals = {
  articles: perArticle.length,
  drafts: perArticle.filter(r => r.draft).length,
  aliases: Object.keys(aliases).length,
  wordsNl: perArticle.reduce((s, r) => s + (r.nl?.words ?? 0), 0),
  wordsEn: perArticle.reduce((s, r) => s + (r.en?.words ?? 0), 0),
  appUsedIds: appUsed.size,
  orphans: perArticle.filter(r => !inLinks.get(r.id).size && !appUsed.has(r.id)).map(r => r.id),
  pathSegments: perArticle.reduce((s, r) => s + (r.nl?.pathSegments ?? 0) + (r.en?.pathSegments ?? 0), 0),
  unmatchedLabels: perArticle.reduce((s, r) => s + (r.nl?.unmatchedLabels.length ?? 0) + (r.en?.unmatchedLabels.length ?? 0), 0),
};

// ── Rapport ─────────────────────────────────────────────────────────────────────────────────────────

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n.v.t.');
const out = [];
out.push(`# Docs-audit — kwantitatieve meting`, '');
out.push(`Stand: \`${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim()}\`, ${new Date().toISOString().slice(0, 10)}. Signalen zijn plekken om te lezen, geen oordelen.`, '');
out.push('## Omvang', '');
out.push(`- Artikelen: ${totals.articles} (drafts: ${totals.drafts}), aliassen: ${totals.aliases}.`);
for (const [k, v] of Object.entries(kinds)) out.push(`- ${k}: ${v.articles} artikelen, ${v.wordsNl} woorden nl, ${v.wordsEn} woorden en.`);
out.push(`- Totaal: ${totals.wordsNl} woorden nl, ${totals.wordsEn} woorden en (verhouding ${(totals.wordsEn / totals.wordsNl).toFixed(2)}).`, '');
out.push('## Bereikbaarheid', '');
out.push(`- Artikel-id's die de app zelf opent (\`helpArticles.ts\`): ${totals.appUsedIds}.`);
out.push(`- Wezen (geen inkomende link, niet door de app geopend): ${totals.orphans.length ? totals.orphans.join(', ') : 'geen'}.`);
out.push(`- Vensters met \`DialogHeader\`: ${dialogs.headers}, waarvan met ?-knop: ${dialogs.withHelp} (${pct(dialogs.withHelp, dialogs.headers)}). Bestanden met een eigen \`HelpButton\`/\`DialogHelpButton\`: ${dialogs.filesWithOwnHelpButton}.`);
if (dialogs.withoutHelp.length) out.push(`- Zonder ?-knop: ${dialogs.withoutHelp.map(f => `\`${f.replace(/^src\//, '')}\``).join(', ')}.`);
out.push('');
if (inventory) {
  out.push('## Dekking van de functie-inventaris', '');
  out.push(`- ${inventory.found} van ${inventory.items} functies (${pct(inventory.found, inventory.items)}) worden in de nl-docs bij naam genoemd.`);
  if (inventory.missing.length) out.push(`- Niet bij naam gevonden (kandidaat-gaten, nalopen): ${inventory.missing.map(s => `"${s}"`).join('; ')}.`);
  out.push('');
}
out.push('## Labels in lintpaden', '');
out.push(`- ${totals.pathSegments} padonderdelen (*A › B*) gemeten; ${totals.unmatchedLabels} niet letterlijk gevonden in \`src/i18n/locales\` (zie signalen "label").`, '');
out.push(`## Signalen (${signals.length})`, '');
out.push('Drempels: ' + `pariteit buiten ${T.parityLow}–${T.parityHigh}, lijstregels > ${T.listShare * 100}% (niet bij referentie), gemiddelde zin > ${T.avgSentence} woorden, één zin > ${T.longSentence} woorden, uitleg met < 5 getallen.`, '');
const byType = new Map();
for (const s of signals) byType.set(s[1], (byType.get(s[1]) ?? 0) + 1);
out.push([...byType].map(([t, n]) => `${t}: ${n}`).join(' · '), '');
for (const [id, type, detail] of signals) out.push(`- \`${id}\` — **${type}**: ${detail}`);
out.push('', '## Per artikel (nl)', '');
out.push('```');
out.push(['id'.padEnd(38), 'soort'.padEnd(10), 'wrd'.padStart(5), 'en/nl'.padStart(6), 'lijst'.padStart(6), 'zin'.padStart(5), 'uit'.padStart(4), 'in'.padStart(3), 'gewijzigd'.padStart(11)].join(' '));
for (const r of perArticle) {
  if (!r.nl || !r.en) continue;
  out.push([
    r.id.padEnd(38), r.kind.padEnd(10), String(r.nl.words).padStart(5), (r.en.words / r.nl.words).toFixed(2).padStart(6),
    `${Math.round(r.nl.listShare * 100)}%`.padStart(6), String(r.nl.avgSentence).padStart(5),
    String(r.nl.outLinks.length).padStart(4), String(inLinks.get(r.id).size).padStart(3), String(r.nl.lastChanged ?? '-').padStart(11),
  ].join(' '));
}
out.push('```');
console.log(out.join('\n'));

if (jsonOut) {
  const data = {
    totals, kinds, dialogs, inventory, thresholds: T, signals,
    articles: perArticle.map(r => ({ ...r, inLinks: [...inLinks.get(r.id)] })),
  };
  writeFileSync(jsonOut, JSON.stringify(data, null, 2));
  console.error(`JSON geschreven naar ${jsonOut}`);
}
