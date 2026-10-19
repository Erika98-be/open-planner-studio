import { formatClock } from '@/utils/displayTime';
import { parseDate, parseInstant } from '@/utils/dateUtils';
import { isHourModeCalendar, type WorkCalendar } from '@/types/calendar';

/**
 * De statusdatum met of zonder tijd (besluit eigenaar 2026-10-17).
 *
 * `project.statusDate` is `YYYY-MM-DD` of `YYYY-MM-DDTHH:mm`. MS Project bewaart de statusdatum op een
 * tijd (vaak 17:00) en die tijd telt mee voor het restwerk: 17:00 en 12:00 op dezelfde dag geven een
 * halve dag verschil — maar alleen als de projectkalender in uur-modus rekent. Daarom toont het lint
 * de tijd, en laat hem wijzigen, precies wanneer de rekenkern hem gebruikt (`statusDateUsesTime`).
 */

/** Minuten-vanaf-middernacht van het tijddeel, of `undefined` als de statusdatum geen tijd draagt. */
export function statusDateMinutes(statusDate: string | undefined): number | undefined {
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(statusDate ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

/**
 * Gebruikt de rekenkern de tijd van de statusdatum? Dat hangt af van de PROJECTkalender: de solver leest
 * de statusdatum met `parseIn(projectEngine, …)` — uur-modus ⇒ met tijd, dag-modus ⇒ alleen de datum
 * (`CPMSolver.ts`, de regel boven `this.dataDate =`). De modus komt uit `isHourModeCalendar`, dezelfde
 * functie die `CalendarEngine.isHourMode` zet. Besluit orkestrator 2026-10-19: toon wat de motor
 * gebruikt — het tijdveld in het lint én de lijn op het tijdstip alleen als dit `true` is.
 */
export function statusDateUsesTime(projectCalendar: Pick<WorkCalendar, 'workTime'>): boolean {
  return isHourModeCalendar(projectCalendar);
}

/**
 * De statusdatum zoals de rekenkern hem gebruikt: met tijd in uur-modus, anders alleen het datumdeel.
 * Basis voor elk label (scherm, print, dialoog), zodat een tijd die niet meetelt ook niet getoond wordt.
 */
export function statusDateAsUsed(statusDate: string, usesTime: boolean): string {
  return usesTime ? statusDate : statusDate.slice(0, 10);
}

/**
 * Zet het tijddeel van een statusdatum. `minutes === undefined` haalt de tijd weg (alleen de datum).
 * De uitkomst is altijd ISO met 24 uur (`YYYY-MM-DDTHH:mm`); de weergave volgt `ui.timeNotation`.
 * Zonder geldig datumdeel ⇒ `undefined` (een tijd zonder datum bestaat niet).
 */
export function withStatusTime(statusDate: string | undefined, minutes: number | undefined): string | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(statusDate ?? '');
  if (!m) return undefined;
  return minutes === undefined ? m[1] : `${m[1]}T${formatClock(minutes, '24h')}`;
}

/**
 * Het tijdstip van de statusdatum op de tijdas — de ene positieregel voor scherm (`GanttRenderer`) en
 * print (`printPreview`). Rekent de kern met de tijd (`usesTime`, zie `statusDateUsesTime`):
 * `parseInstant`, zoals een uurtaakbalk (kalendertijd; 17:00 = 17/24 van de dag op de lineaire as).
 * Anders, of zonder tijd: het begin van de dag (`parseDate`), zoals de solver in dag-modus.
 */
export function statusDateInstant(statusDate: string, usesTime: boolean): Date {
  return usesTime ? parseInstant(statusDate) : parseDate(statusDate);
}
