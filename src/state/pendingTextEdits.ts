// Open tekstinvoer die pas bij Enter/blur commit — en de documentwissel die er niet op wacht.
//
// Een veld met een draft (`UnitsInput` met `commitOnBlur`) commit bij Enter, blur of unmount. Een
// documentwissel die niet met een klik begint (MCP `planner_duplicate_document`, een sneltoets,
// crashherstel) laat de focus in het veld staan: het veld unmount pas NA de wissel, en zijn
// unmount-commit schreef dan via de store-actie in het inmiddels actieve document. Daar bestaat na
// dupliceren dezelfde toewijzings-id, dus de invoer belandde in de kopie en de bron bleef schoon
// (review #401, punt 1).
//
// Elke actie die de actieve documentpayload vastlegt of vervangt, roept daarom EERST
// `flushPendingTextEdits()` aan. Dan staat de invoer in de bron vóór die wordt vastgelegd, en heeft
// het veld bij zijn unmount geen draft meer.
//
// Bewust een losse bladmodule (net als `editHold.ts`): geen documentdata en geen UI-toestand, en de
// store hoeft het DOM niet te kennen.

const flushers = new Set<() => void>();

/** Meld een veld aan dat een openstaande draft kan committen. Geeft de afmelding terug. */
export function registerPendingTextEdit(flush: () => void): () => void {
  flushers.add(flush);
  return () => { flushers.delete(flush); };
}

/** Commit elke openstaande draft naar het NU actieve document. Aanroepen vóór een documentwissel. */
export function flushPendingTextEdits(): void {
  for (const flush of [...flushers]) flush();
}
