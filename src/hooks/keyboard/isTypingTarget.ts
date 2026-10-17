/**
 * Zit de toetsenbordfocus in een tekst- of keuzeveld? Dan horen globale sneltoetsen de toets niet
 * te kapen. Eén definitie voor alle toetsenbordhooks: eerder kende de zoomhook `<select>` niet
 * (−/+/0 zoomden terwijl een keuzelijst focus had) en het sneltoetsregister geen contentEditable.
 *
 * De eigen keuzelijst (`Select`) is een knop met `aria-haspopup="listbox"`; zijn open lijst heeft
 * `role="listbox"`. Die tellen ook als keuzeveld: anders verwijderen Delete en Backspace de
 * geselecteerde taak, zoomen − en 0 de Gantt en heft Escape de taakselectie op terwijl de gebruiker
 * in de keuzelijst zit.
 *
 * Eén uitzondering (besluit orkestrator 2026-10-15): op een DICHTE trigger gaan combinaties met
 * Ctrl/Meta wél door, behalve Delete en Backspace. Na een muiskeuze staat de focus weer op de
 * trigger, en een planner die verkeerd kiest drukt meteen Ctrl+Z; dat mag geen extra klik vragen.
 * Geef daarom het event mee als tweede argument. In een open lijst blijft alles afgevangen.
 */
export function isTypingTarget(
  target: EventTarget | null,
  event?: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  const selectPart = target.closest('[aria-haspopup="listbox"], [role="listbox"]');
  if (!selectPart) return false;
  const closedTrigger = selectPart.getAttribute('aria-haspopup') === 'listbox'
    && selectPart.getAttribute('aria-expanded') !== 'true';
  if (closedTrigger && event && (event.ctrlKey || event.metaKey)
    && event.key !== 'Delete' && event.key !== 'Backspace') return false;
  return true;
}
