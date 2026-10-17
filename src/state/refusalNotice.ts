import type { NotificationDetailLine, NotificationSeverity, NotifyInput } from './slices/types';

/**
 * Weigeringen in het meldingenkanaal (eigenaarsbesluit 2026-10-17).
 *
 * Een weigering is een melding dat de app een handeling van de gebruiker NIET heeft uitgevoerd
 * ("De duur is niet gewijzigd.", "… kan geen mijlpaal worden."). Zo'n melding is rood
 * (`severity: 'error'`) en blijft staan tot het kruisje: een blauwe info verdwijnt na 5 s en is zo
 * te missen. De vlag `refusal` onderscheidt hem van een echte fout (bv. opslaan mislukt): bij een
 * volle stapel gaat eerst de oudste gewone info weg, dan de oudste weigering, en pas daarna iets
 * anders (`notify` in uiSlice). Zo duwen herhaalde weigeringen een echte fout nooit weg.
 *
 * Maak elke weigering via deze twee functies, zodat de regel op één plek staat.
 */

/**
 * Een weigering waarbij een DEEL van de handeling wel lukte (bv. plakken in tien cellen, waarvan
 * twee geweigerd). Eigenaarsbesluit 2026-10-17: ook die is rood ("weigering = rood"). Dit blijft de
 * ene schakelaar voor dat besluit; de melding noemt via {@link refusedNamesLine} wat niet is aangepast.
 */
export const PARTIAL_REFUSAL_SEVERITY: NotificationSeverity = 'error';

/** Hoeveel namen een detailregel hooguit noemt; de rest telt als "en nog N". */
export const REFUSED_NAMES_SHOWN = 5;

/**
 * De detailregel onder een weigering die meer taken (of relaties) raakt: welke niet zijn aangepast.
 * Hooguit {@link REFUSED_NAMES_SHOWN} namen, daarna "en nog N". Geen namen ⇒ geen regel.
 */
export function refusedNamesLine(
  names: readonly string[],
  kind: 'tasks' | 'relations' = 'tasks',
): NotificationDetailLine[] {
  if (names.length === 0) return [];
  const shown = names.slice(0, REFUSED_NAMES_SHOWN).join(', ');
  const rest = names.length - REFUSED_NAMES_SHOWN;
  if (rest <= 0) {
    return [{ messageKey: kind === 'tasks' ? 'notifications.refusedTaskNames' : 'notifications.refusedRelationNames', params: { names: shown } }];
  }
  return [{
    messageKey: kind === 'tasks' ? 'notifications.refusedTaskNamesMore' : 'notifications.refusedRelationNamesMore',
    params: { names: shown, count: rest },
  }];
}

/** Een weigering waarbij niets is uitgevoerd: rood en blijvend. */
export function refusalNotice(notice: Omit<NotifyInput, 'severity' | 'refusal'>): NotifyInput {
  return { ...notice, severity: 'error', refusal: true };
}

/**
 * Een weigering die mogelijk deels lukte. `partlyApplied` = de rest van dezelfde handeling is wél
 * uitgevoerd. Niets gelukt ⇒ {@link refusalNotice}; deels gelukt ⇒ {@link PARTIAL_REFUSAL_SEVERITY}
 * (nu ook rood).
 */
export function partialRefusalNotice(
  notice: Omit<NotifyInput, 'severity' | 'refusal'>,
  partlyApplied: boolean,
): NotifyInput {
  if (!partlyApplied) return refusalNotice(notice);
  return { ...notice, severity: PARTIAL_REFUSAL_SEVERITY, refusal: true };
}
