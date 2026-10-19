import './domStub';
// MSPDI: de werktijd van een werkdag met één blok telt op de minuut (bevinding review 2026-10-19,
// 0402ScheduleMSP.xml).
//
// De lezer las de blokken van `<WeekDays><WeekDay><WorkingTimes>` al op de minuut (`clockToMinutes`),
// maar de enkelvoudige werkdag (`workStartHour`/`workEndHour`, en daaruit `hoursPerDay`) kwam uit het
// uurdeel van de kloktijd. 07:30–16:00 werd 7–16 met 9 uur per dag; `00:08:00`–`00:16:00` (8 minuten op
// zaterdag en zondag in 0402ScheduleMSP.xml) werd 0–24. Een verkeerde `hoursPerDay` verandert de
// omrekening van uren naar dagen én de keuze tussen dag- en urentaak. De schrijver had de spiegelfout:
// een dagkalender die om 07:30 begint, schreef `<FromTime>7.5:00:00</FromTime>`, een ongeldige kloktijd.
//
//  §1 lezer: één blok op de minuut, in de canonieke vorm (`canonicalizeBands`); hele uren, een nachtblok
//     en een hele dag blijven zoals ze waren.
//  §2 rekenen: 90 werkuren op een kalender van 8,5 uur per dag zijn 10 dagen en 5,5 uur (MS Project:
//     klaar maandag 13:00), niet 10 dagen van 9 uur (klaar vrijdag).
//  §3 rondgang door de echte open- en exportroute (store): een dagkalender van 07:30–16:00 komt na
//     opslaan als MSPDI en heropenen terug met dezelfde werktijd, en F5 geeft dezelfde datums.
//
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen — alleen de exitcode telt.
import { readMSPDI } from '@/services/msproject/mspdiReader';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
import { getCalendarBands } from '@/services/subdayIo';
import { parseOpenedFile } from '@/services/formatRegistry';
import { createAppStoreContext } from '@/state/appStore';
import type { DocumentPayload } from '@/state/documentContract';
import type { OpenedImport } from '@/services/importTypes';
import type { WorkCalendar } from '@/types/calendar';
import { installDOMParser } from './xmldom-shim';

declare const process: { exit(code: number): never };

installDOMParser();

let checks = 0;
const failures: string[] = [];
function same(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures.push(`${label}\n        verwacht ${JSON.stringify(want)}\n        kreeg    ${JSON.stringify(got)}`);
  }
}

// ── Bouwstenen ─────────────────────────────────────────────────────────────────────────────────
/** Werkweek met per MSP-DayType (1 = zondag … 7 = zaterdag) één blok, of vrij. */
const week = (perDay: Record<number, [string, string] | undefined>) => '<WeekDays>'
  + [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const b = perDay[d];
    return b
      ? `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime>`
        + `<FromTime>${b[0]}</FromTime><ToTime>${b[1]}</ToTime></WorkingTime></WorkingTimes></WeekDay>`
      : `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`;
  }).join('') + '</WeekDays>';
const maVr = (from: string, to: string) => ({ 2: [from, to], 3: [from, to], 4: [from, to], 5: [from, to], 6: [from, to] } as Record<number, [string, string]>);
const cal = (uid: number, name: string, body: string) =>
  `<Calendar><UID>${uid}</UID><Name>${name}</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID>${body}<Exceptions/></Calendar>`;
/** Taak van `hours` werkuren vanaf maandag 19 oktober 2026 08:00 op kalender `calUid`. Begin en einde op
 *  het dag-anker 08:00, zodat alleen de duur beslist of het een urentaak is. */
const task = (uid: number, name: string, calUid: number, hours: number, finishDate: string) =>
  `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${name}</Name><OutlineLevel>1</OutlineLevel><CalendarUID>${calUid}</CalendarUID>`
  + `<Duration>PT${hours}H0M0S</Duration><Start>2026-10-19T08:00:00</Start><Finish>${finishDate}T08:00:00</Finish></Task>`;

const XML = '<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project">'
  + '<Name>Werktijd op de minuut</Name><StartDate>2026-10-19T08:00:00</StartDate><CalendarUID>1</CalendarUID>'
  + '<MinutesPerDay>480</MinutesPerDay><Calendars>'
  // De kalender "global" uit 0402ScheduleMSP.xml: zondag eerst, met een blok van 8 minuten.
  + cal(1, 'Weekend kort', week({ ...maVr('08:00:00', '16:00:00'), 1: ['00:08:00', '00:16:00'], 7: ['00:08:00', '00:16:00'] }))
  + cal(2, 'Halfuur', week(maVr('07:30:00', '16:00:00')))
  + cal(3, 'Halfuur uren', week(maVr('07:30:00', '16:00:00')))
  + cal(4, 'Kwartier', week(maVr('08:15:00', '16:45:00')))
  // Ongewijzigd gedrag: hele uren, een nachtblok over middernacht en een hele dag.
  + cal(5, 'Hele uren', week(maVr('07:00:00', '16:00:00')))
  + cal(6, 'Nacht', week(maVr('22:00:00', '06:00:00')))
  + cal(7, '24 uur', week({ ...maVr('00:00:00', '00:00:00'), 1: ['00:00:00', '00:00:00'], 7: ['00:00:00', '00:00:00'] }))
  + '</Calendars><Tasks>'
  // 85 u = precies 10 dagen van 8,5 u ⇒ dagtaak, 10 werkdagen.
  + task(1, 'Dagtaak halfuur', 2, 85, '2026-10-30')
  // 90 u = 10 dagen en 5 u van 8,5 u ⇒ urentaak. Met 9 u per dag was het precies 10 dagen.
  + task(2, 'Urentaak halfuur', 3, 90, '2026-11-02')
  + '</Tasks></Project>';

const byName = (cals: WorkCalendar[], name: string): WorkCalendar => {
  const c = cals.find((x) => x.name === name);
  if (!c) throw new Error(`kalender ${name} ontbreekt`);
  return c;
};
const scalar = (c: WorkCalendar) => ({
  workDays: c.workDays, start: Math.round(c.workStartHour * 60), end: Math.round(c.workEndHour * 60), hoursPerDay: c.hoursPerDay, uurkalender: !!c.workTime,
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §1 De lezer: één blok op de minuut (vergeleken in minuten, zodat 8/60 uur geen afrondingsruis geeft)
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  const r = readMSPDI(XML);
  const cals = [r.calendar, ...(r.resourceCalendars ?? [])];
  // Zondag is de eerste werkdag in MS Project-volgorde (`SCALAR_DAY_ORDER`): zijn blok van 8 minuten is
  // de enkelvoudige werkdag. `<MinutesPerDay>` 480 blijft de uren per dag van de projectkalender.
  same('§1 "Weekend kort": 00:08–00:16 uit het zondagblok, niet 0–24', scalar(byName(cals, 'Weekend kort')),
    { workDays: [1, 2, 3, 4, 5, 6, 7], start: 8, end: 16, hoursPerDay: 8, uurkalender: false });
  const weekendBands = getCalendarBands(byName(cals, 'Weekend kort'))?.canonical.byWeekday;
  same('§1 "Weekend kort": de blokken per weekdag op de minuut', [weekendBands?.[1], weekendBands?.[6], weekendBands?.[7]],
    [[{ start: 480, end: 960 }], [{ start: 8, end: 16 }], [{ start: 8, end: 16 }]]);
  same('§1 "Halfuur": 07:30–16:00 met 8,5 uur per dag (was 7–16 met 9)', scalar(byName(cals, 'Halfuur')),
    { workDays: [1, 2, 3, 4, 5], start: 450, end: 960, hoursPerDay: 8.5, uurkalender: false });
  same('§1 "Kwartier": 08:15–16:45 met 8,5 uur per dag (was 8–16 met 8)', scalar(byName(cals, 'Kwartier')),
    { workDays: [1, 2, 3, 4, 5], start: 495, end: 1005, hoursPerDay: 8.5, uurkalender: false });
  same('§1 "Hele uren": 07:00–16:00 ongewijzigd', scalar(byName(cals, 'Hele uren')),
    { workDays: [1, 2, 3, 4, 5], start: 420, end: 960, hoursPerDay: 9, uurkalender: false });
  same('§1 "Nacht": 22:00–06:00 ⇒ 22–30, uurkalender, ongewijzigd', scalar(byName(cals, 'Nacht')),
    { workDays: [1, 2, 3, 4, 5], start: 1320, end: 1800, hoursPerDay: 8, uurkalender: true });
  same('§1 "24 uur": 00:00–00:00 ⇒ 0–24, uurkalender, ongewijzigd', scalar(byName(cals, '24 uur')),
    { workDays: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 1440, hoursPerDay: 24, uurkalender: true });
  same('§1 de taken: 85 u is een dagtaak van 10 dagen, 90 u een urentaak',
    r.tasks.map((t) => [t.name, t.time.durationUnit, t.time.scheduleDuration]),
    [['Dagtaak halfuur', 'days', 10], ['Urentaak halfuur', 'hours', 90 / 8.5]]);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §2 + §3 De echte open- en exportroute: F5, en F5 na opslaan als MSPDI en heropenen
// ════════════════════════════════════════════════════════════════════════════════════════════════
const OPEN = { filePath: null, fileHandle: null, recompute: true, fit: false, hourDataNotice: false, linkedOpen: true } as const;
function openAndRecalc(parsed: OpenedImport): DocumentPayload {
  const store = createAppStoreContext().store;
  store.getState().applyOpenedImport(parsed, OPEN);
  store.getState().runCPM(); // F5
  return store.getState().getOpenDocumentPayloads()[0].payload;
}
const dates = (p: DocumentPayload) => Object.fromEntries(p.tasks.map((t) => [t.name, [t.time.earlyStart, t.time.earlyFinish]]));
const calView = (p: DocumentPayload) => Object.fromEntries([p.calendar, ...p.calendars].map((c) => [c.name, scalar(c)]));
const exportMSPDI = (p: DocumentPayload) => writeMSPDI(p.project, p.calendar, p.tasks, p.sequences, p.resources,
  p.assignments, p.calendars, p.baselines, p.activeBaselineId, p.customTaskTypes);
{
  const before = openAndRecalc(await parseOpenedFile({ name: 'werktijd-minuten.xml', text: XML }));
  // §2: dagtaak 10 werkdagen (ma 19 t/m vr 30 oktober). Urentaak: ma 19 okt 08:00–16:00 (8 u), di–vr
  // 4 × 8,5 u, de week erna 5 × 8,5 u = 84,5 u op vrijdag 30 oktober 16:00; de laatste 5,5 u op maandag
  // 2 november van 07:30 tot 13:00. Met 9 u per dag was het een dagtaak die vrijdag 30 oktober eindigde.
  same('§2 F5 na MSPDI-import', dates(before), {
    'Dagtaak halfuur': ['2026-10-19', '2026-10-30'],
    'Urentaak halfuur': ['2026-10-19T08:00', '2026-11-02T13:00'],
  });

  const xml = exportMSPDI(before);
  const fromTimes = [...xml.matchAll(/<FromTime>([^<]*)<\/FromTime>/g)].map((m) => m[1]);
  same('§3 schrijver: elke <FromTime> is een geldige kloktijd HH:MM:SS', fromTimes.filter((t) => !/^\d\d:\d\d:\d\d$/.test(t)), []);
  same('§3 schrijver: de dagkalender "Halfuur" begint om 07:30:00', fromTimes.includes('07:30:00'), true);

  const after = openAndRecalc(await parseOpenedFile({ name: 'werktijd-minuten-terug.xml', text: xml }));
  same('§3 kalenders gelijk na opslaan als MSPDI en heropenen', calView(after), calView(before));
  same('§3 F5 ná de MSPDI-rondgang = F5 ervóór', dates(after), dates(before));
}

if (failures.length > 0) {
  for (const f of failures) console.log(`XX  ${f}`);
  console.log(`XX  check-mspdi-werktijd-minuten: ${failures.length} van ${checks} controles mislukt`);
  process.exit(1);
}
console.log(`OK  check-mspdi-werktijd-minuten: ${checks} controles groen`);
