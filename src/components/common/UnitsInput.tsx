import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatReportNumber, parseDecimalInput } from '@/utils/reportNumber';

/**
 * Strikt-positief eenheden-invoerveld. Houdt een lokale draft-string
 * bij zodat de gebruiker vrij kan typen, wijst 0/negatieve/lege waarden visueel af (rode rand) en
 * commit ALLEEN geldige (> 0, eindig) waarden naar de store — nooit een clamp naar 0. Bij blur op
 * een ongeldige waarde valt het veld terug op de laatst geldige (opgeslagen) waarde. Fracties zijn
 * toegestaan (materiaal-max.eenheden, halve-dag-toewijzingen).
 *
 * Getoond in de getalnotatie van de app-taal (`formatReportNumber`: nl "1,71", en "1.71", hoogstens
 * twee decimalen); invoer met komma of punt (`parseDecimalInput`). Daarom een tekstveld met
 * `inputMode="decimal"`, geen `type="number"` (dat kent alleen de punt). Zolang de tekst gelijk is aan
 * de getoonde tekst commit het veld niets: de exacte opgeslagen waarde (1.71428571428571) blijft staan.
 */
export function UnitsInput({
  value, onCommit, className = '', title, ariaLabel, onKeyDown, gridCell,
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
}) {
  const { i18n } = useTranslation();
  const shown = formatReportNumber(value, i18n.language);
  const [draft, setDraft] = useState<string>(shown);
  const [focused, setFocused] = useState(false);

  // Zolang het veld niet in bewerking is, blijft de draft gelijk aan de opgeslagen waarde.
  useEffect(() => {
    if (!focused) setDraft(shown);
  }, [shown, focused]);

  const parsed = parseDecimalInput(draft);
  const invalid = draft.trim() !== shown && !(Number.isFinite(parsed) && parsed > 0);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      title={title}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      data-ops-grid-cell={gridCell}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onChange={e => {
        const typed = e.target.value;
        setDraft(typed);
        // De getoonde (afgeronde) tekst is geen wijziging: niets naar de store.
        if (typed.trim() === shown) return;
        const n = parseDecimalInput(typed);
        if (Number.isFinite(n) && n > 0) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        if (invalid) setDraft(shown);
      }}
      className={className}
      style={invalid ? { borderColor: 'var(--error)', boxShadow: '0 0 0 1px var(--error)' } : undefined}
    />
  );
}
