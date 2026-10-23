import { MAX_DAY_ZOOM, pickTiers, TIER_CONFIG } from '@/engine/renderer/timelineTiers';
import type { WorkCalendar } from '@/types/calendar';
import type { GanttAxis } from '@/engine/renderer/timeAxis';
import { CalendarEngine } from '@/engine/scheduler/CalendarEngine';
import { workdayOfInstant } from '@/engine/calendar/workdayRules';
import { addCalendarDays, formatInstant, parseDate, utcDayStart } from '@/utils/dateUtils';

// Gedeeld snappen van de balkgebaren (`useBarDrag`) en de splits-modus (`useSplitGesture`): beide
// moeten onder dezelfde canvas-x exact dezelfde datum vinden.

/**
 * Snap-quantum (minuten) van een uurgebaar: dezelfde actieve minor-tier als de tijdkop. Op
 * kwartierzoom is 15 minuten bereikbaar; zonder die opt-in blijft de ondergrens één uur.
 */
export function hourSnapMinutesFor(zoom: number, enableQuarterHourZoom: boolean): number {
  if (zoom < MAX_DAY_ZOOM) return 1440;
  const minorTier = pickTiers(zoom, enableQuarterHourZoom).minor;
  return Math.max(enableQuarterHourZoom ? 15 : 60, Math.round(TIER_CONFIG[minorTier].stepDays * 1440));
}

/**
 * De gesnapte datum onder een canvas-x: in dag-modus het begin van de dag, in uur-modus het
 * snap-quantum. De x loopt via de gedeelde as, dus werkdagencompressie zit er al in. `null` als de
 * as op die x geen datum heeft.
 */
export function snapTimelineDate(axis: GanttAxis, x: number, hourMode: boolean, hourSnapMinutes: number): Date | null {
  const raw = axis.xToDate(x);
  if (Number.isNaN(raw.getTime())) return null;
  if (!hourMode) return utcDayStart(raw);
  const q = Math.max(1, hourSnapMinutes) * 60_000;
  return new Date(Math.round(raw.getTime() / q) * q);
}

/** T24: werkdag onder de pointer; een nachtploeg hoort bij zijn begindatum. */
export function splitWorkdayStart(raw: Date, eng: CalendarEngine, calendar: WorkCalendar): Date {
  const day = workdayOfInstant({ kind: 'blocks', engine: eng, calendar }, formatInstant(raw, 'hour'), 'start');
  let date = parseDate(day);
  for (let i = 0; i < 3660; i++, date = addCalendarDays(date, 1)) {
    const bands = eng.effectiveBandsOn(date);
    if (bands.length) return new Date(date.getTime() + bands[0].start * 60_000);
  }
  return new Date(Number.NaN);
}

/** Minimum voor een nieuwe pauze: alle blokken van de werkdag, ook over middernacht. */
export function splitWorkdayMinutes(at: Date, eng: CalendarEngine, calendar: WorkCalendar): number {
  const day = workdayOfInstant({ kind: 'blocks', engine: eng, calendar }, formatInstant(at, 'hour'), 'start');
  return eng.effectiveBandsOn(parseDate(day)).reduce((sum, band) => sum + band.end - band.start, 0);
}

/** Een werkstuk mag tot de volgende werkdaggrens worden ingekort, ook vanaf ma 13:00. */
export function splitWorkMinimum(start: Date, eng: CalendarEngine, calendar: WorkCalendar): number {
  const day = workdayOfInstant({ kind: 'blocks', engine: eng, calendar }, formatInstant(start, 'hour'), 'start');
  const next = splitWorkdayStart(addCalendarDays(parseDate(day), 1), eng, calendar);
  return eng.workMinutesBetween(start, next);
}

/** Het label telt werkdagdelen langs dezelfde kalender als het gebaar. */
export function splitWorkdayUnits(start: Date, minutes: number, eng: CalendarEngine, calendar: WorkCalendar): number {
  let at = start;
  let rest = minutes;
  let days = 0;
  for (let i = 0; rest > 1e-6 && i < 3660; i++) {
    const capacity = splitWorkMinimum(at, eng, calendar);
    if (!(capacity > 0)) break;
    days += Math.min(1, rest / capacity);
    rest -= capacity;
    const day = workdayOfInstant({ kind: 'blocks', engine: eng, calendar }, formatInstant(at, 'hour'), 'start');
    at = splitWorkdayStart(addCalendarDays(parseDate(day), 1), eng, calendar);
  }
  return Math.round(days * 100) / 100;
}
