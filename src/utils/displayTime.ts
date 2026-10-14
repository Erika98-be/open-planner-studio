import type { TimeNotation } from '@/types/view';

/**
 * Weergave en invoer van kloktijden volgens de instelling Tijdnotatie (`ui.timeNotation`).
 *
 * Deze module raakt ALLEEN wat op het scherm en op print verschijnt, en wat de gebruiker intypt.
 * Opslag, bestandsformaten (IFC, XER, MSPDI, CSV) en MCP-antwoorden blijven ISO en 24 uur; die
 * gebruiken `minutesToClock` uit `@/services/subdayIo`, niet deze module.
 *
 * - `'24h'`: `13:00`, met voorloopnul (`07:00`). Middernacht als EINDE van een dag is `24:00`.
 * - `'12h'`: `1:00 PM`, zonder voorloopnul. Middernacht is `12:00 AM`, het middaguur `12:00 PM`.
 *   Middernacht als einde van een dag is ook `12:00 AM`, zoals MS Project een 24-uurskalender toont
 *   (`12:00 AM`–`12:00 AM`). Een eindveld leest `12:00 AM` daarom als einde van de dag (24:00): een
 *   einde om 0:00 aan het begin van dezelfde dag bestaat niet.
 *
 * AM en PM zijn vaste notatietekens (zoals de Latijnse cijfers), geen vertaalde tekst: de parser moet
 * ze in elke taal herkennen.
 */

const MIN_PER_DAY = 1440;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Minuten-vanaf-middernacht → kloktijd in de gekozen notatie. Een waarde buiten 0..1439 valt modulo
 * op de dag (een nachtblok tot 1560 toont `02:00`). Met `endOfDay` wordt precies 1440 het einde van de
 * dag: `24:00` of `12:00 AM`.
 */
export function formatClock(minutes: number, notation: TimeNotation, opts: { endOfDay?: boolean } = {}): string {
  const total = Math.round(minutes);
  if (opts.endOfDay && total === MIN_PER_DAY) return notation === '12h' ? '12:00 AM' : '24:00';
  const m = ((total % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (notation === '12h') {
    const suffix = h < 12 ? 'AM' : 'PM';
    return `${h % 12 === 0 ? 12 : h % 12}:${pad2(mm)} ${suffix}`;
  }
  return `${pad2(h)}:${pad2(mm)}`;
}

/**
 * Korte kloktijd voor de tijdschaal van de Gantt, waar een uurkolom bij de hoogste zoom maar ~42 px
 * breed is. 24 uur: `13:00` en `13:15`. 12 uur: de uurrij toont `1 PM`, de kwartierrij `1:15` (de
 * uurrij erboven draagt AM/PM). Een volledig `1:00 PM` past daar niet en zou wegvallen. Met `compact`
 * (de renderer meet dat `12 AM` niet past) wordt de 12-uurs uurrij nog smaller: `12a`, `1p`.
 */
export function formatAxisClock(
  minutes: number, notation: TimeNotation, tier: 'hour' | 'quarterHour', compact = false,
): string {
  if (notation === '24h') return formatClock(minutes, '24h');
  const m = ((Math.round(minutes) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (tier === 'hour') return compact ? `${h12}${h < 12 ? 'a' : 'p'}` : `${h12} ${h < 12 ? 'AM' : 'PM'}`;
  return `${h12}:${pad2(m % 60)}`;
}

/**
 * Een lokaal tijdstip (bv. de wijzigingstijd van een bestand) als "datum tijd": de datum in de UI-taal
 * (`dateStyle: 'medium'`, Gregoriaans en Latijnse cijfers, zoals overal in de app), de tijd via
 * {@link formatClock}. Zo staan AM/PM overal hetzelfde ("1:00 PM"), en niet als "1:00 p.m." of "午後1:00".
 */
export function formatLocalDateTime(date: Date, locale: string, notation: TimeNotation): string {
  const base = locale.split('-u-')[0] || 'en';
  let dateFormat: Intl.DateTimeFormat;
  try {
    dateFormat = new Intl.DateTimeFormat(`${base}-u-ca-gregory-nu-latn`, { dateStyle: 'medium' });
  } catch {
    dateFormat = new Intl.DateTimeFormat('en-u-ca-gregory-nu-latn', { dateStyle: 'medium' });
  }
  return `${dateFormat.format(date)} ${formatClock(date.getHours() * 60 + date.getMinutes(), notation)}`;
}

/** Plaatshouder voor een leeg tijdveld in de gekozen notatie. */
export function clockPlaceholder(notation: TimeNotation): string {
  return notation === '12h' ? 'h:mm AM' : 'HH:MM';
}

const CLOCK_INPUT = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(?:(a|p)\.?(?:m\.?)?)?$/;

/**
 * Getypte kloktijd → minuten-vanaf-middernacht, of `undefined` bij ongeldige invoer. De parser hangt
 * bewust NIET van de notatie af: wie omschakelt, kan beide vormen blijven typen.
 * - 24-uursvormen: `13:00`, `13.00`, `1300`, `13`, `7:30`, `0730`.
 * - 12-uursvormen: `1:00 PM`, `1 pm`, `1pm`, `12:00 AM` (= 0:00), `12:00 PM` (= 12:00), `a.m.`/`p.m.`.
 * - `endOfDay` (eindvelden): `24:00` en `12:00 AM` worden 1440. Zonder die vlag is 24:00 ongeldig.
 */
export function parseClock(raw: string, opts: { endOfDay?: boolean } = {}): number | undefined {
  const match = CLOCK_INPUT.exec(raw.trim().toLowerCase());
  if (!match) return undefined;
  const h = Number(match[1]);
  const m = match[2] === undefined ? 0 : Number(match[2]);
  if (m > 59) return undefined;
  const period = match[3];
  if (period) {
    if (h < 1 || h > 12) return undefined;
    const minutes = ((h % 12) + (period === 'p' ? 12 : 0)) * 60 + m;
    return opts.endOfDay && minutes === 0 ? MIN_PER_DAY : minutes;
  }
  if (h === 24 && m === 0 && opts.endOfDay) return MIN_PER_DAY;
  if (h > 23) return undefined;
  return h * 60 + m;
}

/**
 * Het tijddeel van een ISO-datumtijd (`YYYY-MM-DDTHH:mm…`) in de gekozen notatie, of `''` als de
 * waarde geen tijd draagt.
 */
export function displayIsoTime(iso: string | undefined, notation: TimeNotation): string {
  if (!iso) return '';
  const tIdx = iso.indexOf('T');
  if (tIdx < 0) return '';
  const time = /^(\d{2}):(\d{2})/.exec(iso.slice(tIdx + 1));
  if (!time) return '';
  return formatClock(Number(time[1]) * 60 + Number(time[2]), notation);
}
