/**
 * Zit de toetsenbordfocus in een tekst- of keuzeveld? Dan horen globale sneltoetsen de toets niet
 * te kapen. Eén definitie voor alle toetsenbordhooks: eerder kende de zoomhook `<select>` niet
 * (−/+/0 zoomden terwijl een keuzelijst focus had) en het sneltoetsregister geen contentEditable.
 *
 * De eigen keuzelijst (`Select`) is een knop met `aria-haspopup="listbox"`; zijn open lijst heeft
 * `role="listbox"`. Die tellen net zo mee als een native `<select>`: anders verwijderen Delete en
 * Backspace de geselecteerde taak, zoomen − en 0 de Gantt en heft Escape de taakselectie op terwijl
 * de gebruiker in de keuzelijst zit.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  return target.closest('[aria-haspopup="listbox"], [role="listbox"]') !== null;
}
