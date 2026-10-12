// `npm run i18n:add -- <ns>:<pad.naar.sleutel> <vertalingen.json> [--update] [--after <broer>]`
//
// Zet één tekst in nl + en en in elke opgegeven locale tegelijk, op dezelfde plek (de volgorde van nl).
// <vertalingen.json> bevat per locale de tekst; alleen nl en en zijn verplicht (besluit B5, 2026-10-10):
//
//   { "nl": "Onderbreking opheffen", "en": "Remove break" }                          // gewone tekst
//   { "nl": { "one": "{{count}} taak", "other": "{{count}} taken" },                 // meervoud:
//     "en": { "one": "{{count}} task", "other": "{{count}} tasks" },
//     "pl": { "one": "…", "few": "…", "many": "…", "other": "…" } }                   // (optioneel)
//
// Een locale die niet is opgegeven, krijgt geen tekst: de app valt daar terug op en. Een oude vertaling
// blijft staan (behalve als de sleutel van soort verandert: tekst ↔ familie).
//
// Het script weigert (en schrijft dan niets) als nl of en ontbreekt, een opgegeven taal niet precies
// haar CLDR-meervoudscategorieën heeft, of de {{invulplekken}} afwijken van nl. Een bestaande sleutel
// wijzigen kan alleen met --update (bijv. een label inkorten: één commando i.p.v. 14 bestanden).
// --after <broer> plaatst een nieuwe sleutel direct na die broer; anders achteraan in zijn object.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LOCALES, NAMESPACES, formatLocale, keyExists, removeTranslation, serialize, setTranslation, translationKind,
  validateTranslations,
  type JsonObject, type Namespace, type Translation,
} from './i18n-tools';

function fail(message: string): never {
  console.log(`XX  i18n:add: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const update = args.includes('--update');
const afterIdx = args.indexOf('--after');
const after = afterIdx >= 0 ? args[afterIdx + 1] : undefined;
if (afterIdx >= 0 && !after) fail('--after verwacht de naam van een broersleutel');
const positional = args.filter((a, i) => !a.startsWith('--') && (afterIdx < 0 || i !== afterIdx + 1));
const [target, file] = positional;
if (!target || !file) {
  fail('gebruik: npm run i18n:add -- <ns>:<pad.naar.sleutel> <vertalingen.json> [--update] [--after <broer>]');
}

const sep = target.indexOf(':');
const ns = target.slice(0, sep) as Namespace;
const path = target.slice(sep + 1);
if (sep < 0 || !(NAMESPACES as readonly string[]).includes(ns) || !/^[\w-]+(\.[\w-]+)*$/.test(path)) {
  fail(`"${target}" is geen <ns>:<pad>; namespaces: ${NAMESPACES.join(', ')}`);
}

let input: Record<string, Translation>;
try {
  input = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Translation>;
} catch (err) {
  fail(`kan ${file} niet lezen als JSON: ${err instanceof Error ? err.message : String(err)}`);
}
const errors = validateTranslations(input);
if (errors.length > 0) fail(`niets geschreven, want:\n    - ${errors.join('\n    - ')}`);

const dir = join(process.cwd(), 'src/i18n/locales');
const read = (loc: string, n: string = ns) => JSON.parse(readFileSync(join(dir, loc, `${n}.json`), 'utf8')) as JsonObject;

const nl = read('nl');
const exists = keyExists(nl, path);
if (exists && !update) fail(`${ns}:${path} bestaat al — gebruik --update om hem te wijzigen`);
if (!exists && update) fail(`${ns}:${path} bestaat nog niet — laat --update weg om hem toe te voegen`);

setTranslation(nl, path, input.nl, exists ? undefined : after);
const nlText = serialize(nl);
const nlOrdered = formatLocale(nlText, nlText);
writeFileSync(join(dir, 'nl', `${ns}.json`), nlOrdered);
const written: string[] = ['nl'];
const left: string[] = [];
for (const loc of LOCALES) {
  if (loc === 'nl') continue;
  const data = read(loc);
  if (input[loc] !== undefined) {
    setTranslation(data, path, input[loc]);
    writeFileSync(join(dir, loc, `${ns}.json`), formatLocale(serialize(data), nlOrdered));
    written.push(loc);
  } else {
    // Niet opgegeven (B5): geen tekst schrijven. Een oude tekst van het verkeerde soort (tekst waar nu
    // een familie hoort, of omgekeerd) gaat weg; de app valt dan terug op en.
    const kind = translationKind(data, path);
    if (kind !== undefined && kind !== (typeof input.nl !== 'string') && removeTranslation(data, path)) {
      writeFileSync(join(dir, loc, `${ns}.json`), formatLocale(serialize(data), nlOrdered));
    }
    left.push(loc);
  }
}
console.log(`OK  i18n:add: ${ns}:${path} ${exists ? 'gewijzigd' : 'toegevoegd'} in ${written.length} locale(s) (${written.join(', ')})`);
if (left.length) {
  console.log(`..  ${left.length} locale(s) niet opgegeven (valt terug op en): ${left.join(', ')}`);
}
