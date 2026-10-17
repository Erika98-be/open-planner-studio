import type { NotificationSeverity, NotifyInput } from './slices/types';

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
 * twee geweigerd). Open besluit van de eigenaar: rood of niet. Dit is de ene schakelaar; zet hem op
 * `'error'` om ook deels gelukte weigeringen rood en blijvend te maken.
 */
export const PARTIAL_REFUSAL_SEVERITY: NotificationSeverity = 'info';

/** Een weigering waarbij niets is uitgevoerd: rood en blijvend. */
export function refusalNotice(notice: Omit<NotifyInput, 'severity' | 'refusal'>): NotifyInput {
  return { ...notice, severity: 'error', refusal: true };
}

/**
 * Een weigering die mogelijk deels lukte. `partlyApplied` = de rest van dezelfde handeling is wél
 * uitgevoerd. Niets gelukt ⇒ {@link refusalNotice}; deels gelukt ⇒ {@link PARTIAL_REFUSAL_SEVERITY}.
 */
export function partialRefusalNotice(
  notice: Omit<NotifyInput, 'severity' | 'refusal'>,
  partlyApplied: boolean,
): NotifyInput {
  if (!partlyApplied) return refusalNotice(notice);
  return { ...notice, severity: PARTIAL_REFUSAL_SEVERITY, refusal: true };
}
