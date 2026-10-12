// Samenvoegen van UI-pakketten (§9), als pure functie: alleen pakketten waarvan de poort groen is.
import type { JsonObject } from '../i18n-tools';
import { hashUnit, unitsOf } from './common';
import { checkPackage, formatResult } from './gates';
import { applyUiPackage, type UiOut, type UiPackage, type UiSources } from './ui';

export interface BatchResult {
  /** Bijgewerkte doelobjecten per namespace (alleen namespaces die iets kregen). */
  targets: Map<string, JsonObject>;
  applied: string[];
  red: { id: string; lines: string[] }[];
}

/**
 * Voeg de pakketten één voor één toe. Een rood pakket wordt overgeslagen (met zijn foutregels);
 * een groen pakket gaat via `applyUiPackage` in het doelobject en werkt `sources` bij (muteert).
 * `readTarget` levert het huidige doelobject van een namespace (`{}` als het nog niet bestaat).
 *
 * Het pakket ligt in `build/translate/`, waar ook de agents schrijven. Daarom geldt het pakket niet
 * blind: het moet voor `lang` zijn, en elk item moet in de huidige nl staan met precies de nl-tekst uit
 * het pakket. Anders zou een bewerkt pakket (of een nl-wijziging na `prepare`) een sleutel met een
 * verkeerde hash als "actueel" wegschrijven.
 */
export function applyUiBatch(
  batch: { pkg: UiPackage; out: unknown }[],
  readTarget: (ns: string) => JsonObject,
  nl: Record<string, JsonObject>,
  sources: UiSources,
  lang?: string,
): BatchResult {
  const targets = new Map<string, JsonObject>();
  const applied: string[] = [];
  const red: { id: string; lines: string[] }[] = [];
  for (const { pkg, out } of batch) {
    const r = checkPackage(pkg, out);
    if (r.errors.length) {
      red.push({ id: pkg.id, lines: formatResult(pkg.id, r).filter(l => !l.startsWith('WW')) });
      continue;
    }
    const ns = pkg.namespace;
    const nlNs = nl[ns];
    if (!nlNs) { red.push({ id: pkg.id, lines: [`XX onbekende namespace ${ns}`] }); continue; }
    const wrong = packageMismatch(pkg, nlNs, lang);
    if (wrong.length) { red.push({ id: pkg.id, lines: wrong }); continue; }
    const target = targets.get(ns) ?? readTarget(ns);
    targets.set(ns, applyUiPackage(pkg, out as UiOut, target, nlNs, sources));
    applied.push(pkg.id);
  }
  return { targets, applied, red };
}

/** Waarom een pakket niet (meer) bij de huidige nl en de taal past; leeg = past. */
function packageMismatch(pkg: UiPackage, nlNs: JsonObject, lang: string | undefined): string[] {
  const lines: string[] = [];
  if (pkg.kind !== 'ui') lines.push(`XX geen UI-pakket (kind ${String(pkg.kind)})`);
  if (lang !== undefined && pkg.lang !== lang) lines.push(`XX pakket is voor taal ${pkg.lang}, niet ${lang}`);
  const current = new Map(unitsOf(nlNs).map(u => [u.key, u.text]));
  for (const item of pkg.items) {
    const text = current.get(item.key);
    if (text === undefined) lines.push(`XX ${item.key}: staat niet (meer) in nl`);
    else if (hashUnit(text) !== hashUnit(item.nl)) {
      lines.push(`XX ${item.key}: nl-tekst in het pakket ≠ huidige nl (veranderd na prepare, of pakket bewerkt); opnieuw prepare`);
    }
  }
  return lines;
}
