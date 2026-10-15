import { useEffect, useState } from 'react';
import { formatReportNumber } from '@/utils/reportNumber';

/**
 * Strikt-positief eenheden-invoerveld. Houdt een lokale draft-string
 * bij zodat de gebruiker vrij kan typen, wijst 0/negatieve/lege waarden visueel af (rode rand) en
 * commit ALLEEN geldige (> 0, eindig) waarden naar de store — nooit een clamp naar 0. Bij blur op
 * een ongeldige waarde valt het veld terug op de laatst geldige (opgeslagen) waarde. Fracties zijn
 * toegestaan (materiaal-max.eenheden, halve-dag-toewijzingen), dus `step="any"`.
 *
 * Met `locale` toont het veld de getalnotatie van de app (`formatReportNumber`: hooguit twee
 * decimalen, decimaalteken van de taal) in een tekstveld met `inputMode="decimal"`; komma en punt
 * zijn dan allebei geldige invoer. De weergave rondt af, de opslag niet: alleen een echte
 * wijziging (`onChange`) commit, dus focussen en weer verlaten laat een geïmporteerde
 * 1.77777777777778 exact staan.
 */
export function UnitsInput({
  value, onCommit, className = '', title, ariaLabel, onKeyDown, gridCell, locale,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
  /** Rasternavigatie (Enter/Shift+Enter) — het veld is een cel in een live tabel. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** `data-ops-grid-cell`-adres van deze cel; `useLiveGridNav` focust hierop. */
  gridCell?: string;
  /** App-taal voor de weergave (twee decimalen, decimaalteken van de taal). Zonder: de ruwe waarde
   *  in een `type="number"`-veld, zoals altijd. */
  locale?: string;
}) {
  const shownOf = (n: number) => locale ? formatReportNumber(n, locale) : String(n);
  const [draft, setDraft] = useState<string>(() => shownOf(value));
  const [focused, setFocused] = useState(false);

  // Zolang het veld niet in bewerking is, blijft de draft gelijk aan de opgeslagen waarde.
  useEffect(() => {
    if (!focused) setDraft(locale ? formatReportNumber(value, locale) : String(value));
  }, [value, focused, locale]);

  const parseDraft = (text: string) => parseFloat(locale ? text.replace(',', '.') : text);
  const parsed = parseDraft(draft);
  const invalid = !(Number.isFinite(parsed) && parsed > 0);

  return (
    <input
      {...(locale
        ? { type: 'text', inputMode: 'decimal' as const }
        : { type: 'number', min: '0', step: 'any' })}
      value={draft}
      title={title}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      data-ops-grid-cell={gridCell}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onChange={e => {
        setDraft(e.target.value);
        const n = parseDraft(e.target.value);
        if (Number.isFinite(n) && n > 0) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        if (invalid) setDraft(shownOf(value));
      }}
      className={className}
      style={invalid ? { borderColor: 'var(--error)', boxShadow: '0 0 0 1px var(--error)' } : undefined}
    />
  );
}
