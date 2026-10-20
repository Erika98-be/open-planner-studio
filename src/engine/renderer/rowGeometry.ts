// Balkgeometrie binnen één Gantt-rij. De rijhoogte zelf komt uit `engine/taskGrid/rowHeight.ts`
// (gedeeld met het taakraster). De renderer leidt de balk en de strook eronder (resource-accent +
// baseline) af van `barLayout`, zodat tekenen, hit-testen en de sleep-duurbadge dezelfde
// balkhoogte gebruiken.

/** Balkhoogte als fractie van de rijhoogte. */
export const BAR_HEIGHT_RATIO = 0.6;

export interface BarLayout {
  /** Hoogte van de hoofdbalk. */
  barHeight: number;
  /** Afstand van de rijbovenkant tot de balk (= vrije strook onder de balk). */
  barOffset: number;
  /** Hoogte van het resource-accent onder de balk. */
  accentHeight: number;
  /** Hoogte van de baseline-onderbalk. */
  baselineHeight: number;
}

/**
 * Balkgeometrie binnen een rij van `rowHeight`.
 *
 * Resource-accent en baseline delen de vrije strook onder de balk (`barOffset`) VAST: 1 px lucht,
 * dan het accent, dan de baseline. Beide krijgen hun hoogte hier, los van welke van de twee aan
 * staat — zo is de baseline even dik met of zonder accent (vroeger kromp hij bij de combinatie tot
 * wat er overbleef) en past de combinatie altijd binnen de rij. Staat het accent uit, dan schuift
 * de baseline op naar direct onder de balk, maar hij houdt dezelfde hoogte.
 */
export function barLayout(rowHeight: number): BarLayout {
  const barHeight = rowHeight * BAR_HEIGHT_RATIO;
  const barOffset = (rowHeight - barHeight) / 2;
  const strip = Math.max(0, barOffset - 1);
  const accentHeight = Math.max(2, Math.round(strip / 2));
  const baselineHeight = Math.max(2, strip - accentHeight);
  return { barHeight, barOffset, accentHeight, baselineHeight };
}

/** Eén baselinelaag in de strook onder de balk: afstand vanaf de bovenkant van de strook, en hoogte. */
export interface BaselineStackSlot {
  offset: number;
  height: number;
}

/** Lucht tussen twee gestapelde baselinelagen (px), zolang die past. */
const BASELINE_STACK_GAP = 0.5;
/** Dunste baselinelaag (px). Dunner is op het scherm niet meer als kleur te lezen. */
const BASELINE_MIN_HEIGHT = 1;

/**
 * PROTOTYPE (issue #391): plaats `count` gestapelde baselinelagen in de vrije strook onder de balk.
 *
 * `available` is de hoogte van de strook (vanaf de bovenkant van de eerste laag tot de rijrand).
 * Eén laag houdt altijd de gewone `baselineHeight` (het huidige uiterlijk). Passen meer lagen niet
 * op die hoogte, dan worden ALLE lagen even dun, zodat geen kleur zwaarder weegt dan een andere; de
 * taakbalk zelf verandert nooit. Onder `BASELINE_MIN_HEIGHT` gaat het niet: dan steekt de stapel
 * hooguit een paar pixels over de rijrand (alleen met resource-accent bij de kleinste tekengrootte).
 */
export function baselineStack(baselineHeight: number, available: number, count: number): BaselineStackSlot[] {
  if (count <= 0) return [];
  if (count === 1) return [{ offset: 0, height: baselineHeight }];
  const gap = available - count * BASELINE_MIN_HEIGHT >= (count - 1) * BASELINE_STACK_GAP ? BASELINE_STACK_GAP : 0;
  const height = Math.max(BASELINE_MIN_HEIGHT, Math.min(baselineHeight, (available - (count - 1) * gap) / count));
  return Array.from({ length: count }, (_, i) => ({ offset: i * (height + gap), height }));
}
