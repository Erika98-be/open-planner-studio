import { useRef, useState, type KeyboardEvent } from 'react';
import { formatDecimalInput, parsePositiveDecimal } from '@/utils/decimalInput';

/**
 * Strikt-positief eenheden-invoerveld. Houdt een lokale draft-string bij zodat de gebruiker vrij
 * kan typen, wijst 0/negatieve/lege/onleesbare invoer visueel af (rode rand, `aria-invalid`) en
 * commit ALLEEN geldige (> 0, eindig) waarden naar de store — nooit een clamp naar 0. De rode rand
 * staat alleen op wat de gebruiker zelf typt, niet op een opgeslagen waarde. Bij blur op een
 * ongeldige waarde valt het veld terug op de opgeslagen waarde. Fracties zijn toegestaan
 * (materiaal-max.eenheden, halve-dag-toewijzingen). Invoer leest `parsePositiveDecimal` (strikt).
 *
 * Zonder `locale`: een `type="number"`-veld dat bij elke geldige toetsaanslag commit, zoals altijd.
 *
 * Met `locale`: een tekstveld met `inputMode="decimal"` in de getalnotatie van de app
 * (`formatDecimalInput`: hooguit twee decimalen, decimaalteken van de taal, een kleine waarde met
 * drie significante cijfers); komma en punt zijn allebei geldig. Het veld commit pas op Enter of
 * blur, en alleen als de gebruiker iets typte: een half getypt getal ("1.234" op weg naar
 * "1.234,5") komt dus nooit in de store, en focussen en weer verlaten laat een geïmporteerde
 * 1.77777777777778 exact staan. Escape zet de opgeslagen waarde terug.
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
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** `data-ops-grid-cell`-adres van deze cel; `useLiveGridNav` focust hierop. */
  gridCell?: string;
  /** App-taal voor de weergave. Zonder: de ruwe waarde in een `type="number"`-veld. */
  locale?: string;
}) {
  // `null` = de gebruiker typt niet; het veld toont dan de opgeslagen waarde.
  const [draft, setDraft] = useState<string | null>(null);
  // Escape roept `blur()` aan; de blur-handler ziet dan nog de oude draft en mag die niet committen.
  const discardOnBlur = useRef(false);
  const text = draft ?? (locale ? formatDecimalInput(value, locale) : String(value));
  const parsed = draft === null ? null : parsePositiveDecimal(draft);
  const invalid = draft !== null && parsed === null;

  const commit = () => {
    if (parsed !== null && parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  return (
    <input
      {...(locale
        ? { type: 'text', inputMode: 'decimal' as const }
        : { type: 'number', min: '0', step: 'any' })}
      value={text}
      title={title}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      data-ops-grid-cell={gridCell}
      onKeyDown={e => {
        // Enter verlaat het veld; de blur commit (één keer, één undo-stap).
        if (locale && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        else if (locale && e.key === 'Escape') { discardOnBlur.current = true; setDraft(null); e.currentTarget.blur(); }
        onKeyDown?.(e);
      }}
      onChange={e => {
        setDraft(e.target.value);
        if (!locale) {
          const n = parsePositiveDecimal(e.target.value);
          if (n !== null) onCommit(n);
        }
      }}
      onBlur={() => {
        if (locale && !discardOnBlur.current) commit();
        else setDraft(null);
        discardOnBlur.current = false;
      }}
      className={className}
      style={invalid ? { borderColor: 'var(--error)', boxShadow: '0 0 0 1px var(--error)' } : undefined}
    />
  );
}
