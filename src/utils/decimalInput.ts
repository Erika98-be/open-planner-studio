import { formatReportNumber } from '@/utils/reportNumber';

/**
 * Invoer en weergave van een positief decimaal getal in een tekstveld (inzet en werk in het blok
 * *Toewijzingen*). Eén regel voor beide velden, zodat ze niet uiteenlopen.
 *
 * Invoer is strikt: cijfers met hooguit één decimaalteken, komma of punt ("2,5", "2.5", ",5").
 * Alles anders is ongeldig — ook "1.234,5", "1,234.5", "2x", "1e3" en een leeg veld. `parseFloat`
 * las daar stil een voorvoegsel uit ("1.234,5" ⇒ 1.234, "2x" ⇒ 2). Zelfde gedachte als de
 * tabelparser (`taskColumnRegistry.ts`, `Number(text.trim().replace(',', '.'))`), maar zonder de
 * vormen die `Number` daarnaast nog toelaat (exponent, hex).
 */
const DECIMAL = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/** Het getal als het een eindig positief decimaal getal is, anders `null`. */
export function parsePositiveDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const smallFormatters = new Map<string, Intl.NumberFormat | null>();

/**
 * De getalnotatie van de app (`formatReportNumber`: hooguit twee decimalen, decimaalteken van de
 * taal). Rondt een positieve waarde daarbij af tot "0", dan toont deze functie drie significante
 * cijfers ("0,004"): een geldige kleine inzet mag niet als "0" verschijnen.
 */
export function formatDecimalInput(n: number, locale: string): string {
  const text = formatReportNumber(n, locale);
  if (!(n > 0) || text !== '0') return text;
  let fmt = smallFormatters.get(locale);
  if (fmt === undefined) {
    try {
      fmt = Intl.NumberFormat.supportedLocalesOf([locale]).length > 0
        ? new Intl.NumberFormat(`${locale}-u-nu-latn`, { maximumSignificantDigits: 3, useGrouping: false })
        : null;
    } catch {
      fmt = null;
    }
    smallFormatters.set(locale, fmt);
  }
  return fmt ? fmt.format(n) : String(Number(n.toPrecision(3)));
}

const decimalSeparators = new Map<string, string>();

/** Het decimaalteken van de app-taal in de getalnotatie van de app (Latijnse cijfers). */
function decimalSeparatorOf(locale: string): string {
  let sep = decimalSeparators.get(locale);
  if (sep === undefined) {
    try {
      sep = new Intl.NumberFormat(`${locale}-u-nu-latn`).formatToParts(1.5)
        .find(p => p.type === 'decimal')?.value ?? '.';
    } catch {
      sep = '.';
    }
    decimalSeparators.set(locale, sep);
  }
  return sep;
}

/**
 * Dubbelzinnige invoer: een komma gevolgd door precies drie cijfers ("1,500") in een taal met een
 * PUNT als decimaalteken (en). Een Engelse planner bedoelt daar vaak 1500 (duizendtal), maar
 * `parsePositiveDecimal` leest 1,5. Zo'n invoer wordt geweigerd: geen stille gok. In een taal met
 * een komma als decimaalteken (nl) is "1,500" gewoon 1,5 en niet dubbelzinnig.
 */
export function isAmbiguousThousands(text: string, locale: string): boolean {
  return /^\d+,\d{3}$/.test(text.trim()) && decimalSeparatorOf(locale) !== ',';
}
