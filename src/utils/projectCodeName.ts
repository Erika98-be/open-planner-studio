/**
 * "Projectnaam (Project-ID)": de naam waarmee een P6-project (XER of P6 XML) als document verschijnt.
 * Geen naam ⇒ het ID; naam gelijk aan het ID ⇒ één keer. Staat het ID al tussen haakjes achter de
 * naam (een eerder geëxporteerd en heropend bestand), dan komt het er niet nog eens bij.
 * Bladmodule: puur, geen imports.
 */
export function nameWithProjectCode(name: string | null | undefined, id: string | null | undefined): string {
  const n = (name ?? '').trim();
  const code = (id ?? '').trim();
  if (!n) return code;
  if (!code || n === code || n.endsWith(` (${code})`)) return n;
  return `${n} (${code})`;
}
