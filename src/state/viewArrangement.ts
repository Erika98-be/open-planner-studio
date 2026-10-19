import type { AppState } from './appStore';

/**
 * "Wissen": zet filter, groepering en sortering van het ACTIEVE document uit, zodat de weergave
 * weer in pure boommodus staat (`isTreeMode`). Gedeeld door de strook `StructureLockedNotice` en de
 * meldingsactie `clearViewArrangement` (`NotificationHost`, eigenaarsbesluit 2026-10-19 5a).
 *
 * Drie losse setters: er is geen gecombineerde actie. Elk ervan rekent de rijen zelf opnieuw uit
 * (`recomputeViewRows`).
 */
export function clearViewArrangement(s: Pick<AppState, 'setFilter' | 'setGroup' | 'setSort'>): void {
  s.setFilter(null);
  s.setGroup([]);
  s.setSort([]);
}
