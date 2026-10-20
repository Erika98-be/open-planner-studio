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
  /** Hoogte van de baselinestrook zonder resource-accent: de hele vrije strook onder de balk. */
  baselineHeight: number;
  /** Hoogte van de baselinestrook als er een resource-accent boven staat (wat er dan overblijft). */
  baselineHeightWithAccent: number;
  /** Breedte (px, horizontaal gemeten) van één schuine band waar baselines overlappen. */
  baselineStripeWidth: number;
}

/**
 * Balkgeometrie binnen een rij van `rowHeight`.
 *
 * Onder de balk ligt een vrije strook (`barOffset`): 1 px lucht, dan het resource-accent, dan de
 * baseline. Issue #391 (meerdere baselines): de baselinestrook is dikker gemaakt voor de
 * zichtbaarheid van de kleuren en strepen. Zonder accent vult hij de hele vrije strook (~5 px bij
 * rijhoogte 32); staat er een accent, dan krijgt hij wat onder het accent overblijft (~2,4 px, de
 * oude dikte). Zo blijft alles binnen de rij en wordt de taakbalk nooit kleiner. De schuine banden
 * schalen mee met de rijhoogte (~3 px bij 32).
 */
export function barLayout(rowHeight: number): BarLayout {
  const barHeight = rowHeight * BAR_HEIGHT_RATIO;
  const barOffset = (rowHeight - barHeight) / 2;
  const strip = Math.max(0, barOffset - 1);
  const accentHeight = Math.max(2, Math.round(strip / 2));
  const baselineHeight = Math.max(2, Math.floor(strip));
  const baselineHeightWithAccent = Math.max(2, strip - accentHeight);
  const baselineStripeWidth = Math.max(2, Math.round(rowHeight / 10));
  return { barHeight, barOffset, accentHeight, baselineHeight, baselineHeightWithAccent, baselineStripeWidth };
}
