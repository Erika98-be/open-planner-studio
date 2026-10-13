// MSPDI-feestdagen (2026-10-13): een MS Project XML-kalender krijgt alleen de NL-standaardfeestdagen
// van `createDefaultCalendar()` als hij kaal is (geen werkweek, geen uitzonderingen, geen basis).
//
// Vroeger gold: 0 `<Exception>`-elementen ⇒ NL-feestdagen. Een Amerikaans MS Project-bestand uit 2026
// rekende daardoor met Koningsdag als vrije dag. Nu dezelfde regel als de P6 XML-lezer (#330):
//  1. eigen werkweek zonder uitzonderingen ⇒ géén feestdagen;
//  2. kale kalender (of geen `<Calendars>`) ⇒ NL-standaard blijft;
//  3. eigen uitzonderingen ⇒ precies die;
//  4. rekentest: een taak over Koningsdag 2026 eindigt zonder vrije dag;
//  5. afgeleide kalender (`<BaseCalendarUID>`) erft de uitzonderingen van zijn basis, eigen wint;
//  6. oude vorm (Project 2003): `<WeekDay>` met `DayType` 0 is een uitzondering;
//  7. basis UID 1 die niet de projectkalender is en niet als eerste staat, wordt gevonden;
//  8. round-trip: een OPS-kalender zonder feestdagen komt na MSPDI-export zonder feestdagen terug.
//
// Fixronde #335 — twee aanpalende kalenderfouten:
//  9. projectkalender = `<Project><CalendarUID>` (terugval: eerste element); de rest, ook UID 1, wordt
//     bibliotheekkalender; taak- en resourceverwijzingen volgen die indeling;
// 10. afgeleide kalender zonder eigen werkweek erft de werkweek (dagen en blokken) van zijn basis; een
//     eigen `<WeekDay>` wint per weekdag; begin, einde en netto-uren kloppen (`workDayFromBlocks`);
// 11. rekentest: een taak op een afgeleide kalender rekent met de geërfde zaterdag.
//
// Fixronde 2 #335 (review):
// 12. budget: overerving telt mee in MAX_TOTAL_HOLIDAY_SLOTS (MSPDI-versie van T6-C1), ook bij een
//     basis met ~100.000 vrije dagen en 1023 afgeleide kalenders (vroeger: heap out of memory);
// 13. `<Exceptions>` gaat vóór de oude `DayType 0`-vorm; `DayType 0` in `<WorkWeeks>` telt niet;
// 14. terugval van de projectkalender als alleen taken en resources een `<CalendarUID>` hebben;
// 15. basis bestaat niet, cyclus, zelfverwijzing ⇒ geen overerving en géén NL-terugval (zoals .mpp);
// 16. keten van 40: de uitkomst hangt niet af van de documentvolgorde;
// 17. eigen export schrijft `<CalendarUID>` in de projectkop; round-trip met een bibliotheekkalender
//     op de eerste taak.
//
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen — alleen de exitcode telt.
import { readMSPDI } from '@/services/msproject/mspdiReader';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
import { createDefaultCalendar } from '@/engine/calendar/defaultCalendar';
import { MAX_TOTAL_HOLIDAY_SLOTS, MAX_BASE_CHAIN_DEPTH } from '@/services/calendarRecurrence';
import { solveProject } from '@/engine/scheduler/solveProject';
import type { WorkCalendar } from '@/types/calendar';
import type { Project } from '@/types/project';
import type { Task } from '@/types/task';
import { installDOMParser } from './xmldom-shim';
import { opsSolveInput } from './legacySolveOptions';

installDOMParser();

let checks = 0;
const fails: string[] = [];
// Faalregels meteen printen: de zware budgettest (12, achteraan) kan bij een regressie het proces
// laten crashen (heap out of memory); de eerdere faalregels staan dan al in de uitvoer.
const fail = (msg: string) => {
  fails.push(msg);
  console.log(`XX  ${msg}`);
};
const ok = (label: string, cond: boolean) => {
  checks++;
  if (!cond) fail(label);
};
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
};

// ── Bouwstenen ─────────────────────────────────────────────────────────────────────────────────
const WT = '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>'
  + '<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>';
/** Standaardwerkweek ma–vr 08–17 zoals MS Project hem schrijft (DayType 1 = zondag … 7 = zaterdag). */
const WEEK = '<WeekDays>'
  + '<WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>'
  + [2, 3, 4, 5, 6].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking>${WT}</WeekDay>`).join('')
  + '<WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>'
  + '</WeekDays>';
const exc = (from: string, to: string, name: string) =>
  `<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${from}T00:00:00</FromDate>`
  + `<ToDate>${to}T23:59:00</ToDate></TimePeriod><Occurrences>1</Occurrences><Name>${name}</Name><Type>1</Type>`
  + '<DayWorking>0</DayWorking></Exception>';
const cal = (uid: number, name: string, body: string, baseUid = -1) =>
  `<Calendar><UID>${uid}</UID><Name>${name}</Name><IsBaseCalendar>${baseUid < 0 ? 1 : 0}</IsBaseCalendar>`
  + `<BaseCalendarUID>${baseUid}</BaseCalendarUID>${body}</Calendar>`;
const doc = (calendars: string | null, tasks = '', projectCalUid = '1', resources = '') =>
  '<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project">'
  + `<Name>Feestdagen</Name><StartDate>2026-04-20T08:00:00</StartDate>${projectCalUid ? `<CalendarUID>${projectCalUid}</CalendarUID>` : ''}`
  + '<MinutesPerDay>480</MinutesPerDay>'
  + (calendars === null ? '' : `<Calendars>${calendars}</Calendars>`)
  + `<Tasks>${tasks}</Tasks>${resources ? `<Resources>${resources}</Resources>` : ''}</Project>`;
/** Werkweek met werkende dagen `working` (MSP-DayType), elk 08–12 + 13–17. */
const weekOf = (working: number[]) => '<WeekDays>'
  + [1, 2, 3, 4, 5, 6, 7].map((d) => working.includes(d)
    ? `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking>${WT}</WeekDay>`
    : `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`).join('')
  + '</WeekDays>';
const MA_ZA = weekOf([2, 3, 4, 5, 6, 7]);
const taskOn = (uid: number, name: string, calUid: number, start: string, hours: number) =>
  `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${name}</Name><OutlineLevel>1</OutlineLevel><CalendarUID>${calUid}</CalendarUID>`
  + `<Duration>PT${hours}H0M0S</Duration><Start>${start}T08:00:00</Start><Finish>${start}T17:00:00</Finish>`
  + `<ConstraintType>4</ConstraintType><ConstraintDate>${start}T08:00:00</ConstraintDate></Task>`;
const lib = (r: ReturnType<typeof readMSPDI>, name: string): WorkCalendar | undefined =>
  (r.resourceCalendars ?? []).find((c) => c.name === name);

const NL = createDefaultCalendar().holidays;
ok('voorwaarde: de NL-standaard heeft feestdagen in deze omgeving (bouwmodus aan)', NL.length > 0);
ok('voorwaarde: Koningsdag 2026 zit in de NL-standaard', NL.some((h) => h.startDate <= '2026-04-27' && h.endDate >= '2026-04-27'));

// ── 1. Eigen werkweek, geen uitzonderingen ⇒ geen feestdagen ────────────────────────────────────
{
  const r = readMSPDI(doc(cal(1, 'Standard', WEEK) + cal(2, 'Ploeg', WEEK)));
  eq('1 projectkalender met werkweek, zonder uitzonderingen: 0 feestdagen', r.calendar.holidays.length, 0);
  eq('1 bibliotheekkalender met werkweek, zonder uitzonderingen: 0 feestdagen', lib(r, 'Ploeg')?.holidays.length, 0);
  eq('1 werkweek zelf gelezen (ma–vr)', r.calendar.workDays, [1, 2, 3, 4, 5]);
}

// ── 2. Kale kalender / geen <Calendars> ⇒ NL-standaard ─────────────────────────────────────────
{
  const kaal = readMSPDI(doc(cal(1, 'Kaal', '')));
  eq('2 kale projectkalender (geen werkweek, geen uitzonderingen): NL-standaard', kaal.calendar.holidays, NL);
  const geen = readMSPDI(doc(null));
  eq('2 bestand zonder <Calendars>: NL-standaard', geen.calendar.holidays, NL);
  const kaalLib = readMSPDI(doc(cal(1, 'Standard', WEEK) + cal(2, 'Kaal', '')));
  eq('2 kale bibliotheekkalender zonder basis: NL-standaard', lib(kaalLib, 'Kaal')?.holidays, NL);
}

// ── 3. Eigen uitzonderingen ⇒ precies die ───────────────────────────────────────────────────────
{
  const body = WEEK + `<Exceptions>${exc('2026-07-03', '2026-07-03', 'Independence Day')}${exc('2026-12-24', '2026-12-25', 'Christmas')}</Exceptions>`;
  const r = readMSPDI(doc(cal(1, 'US', body)));
  eq('3 projectkalender met uitzonderingen: precies die', r.calendar.holidays, [
    { name: 'Independence Day', startDate: '2026-07-03', endDate: '2026-07-03' },
    { name: 'Christmas', startDate: '2026-12-24', endDate: '2026-12-25' },
  ]);
}

// ── 4. Rekentest: taak over Koningsdag 2026 (maandag 27 april) ──────────────────────────────────
// Vrijdag 24 april + 2 werkdagen: zonder vrije dag klaar op maandag 27 april, mét Koningsdag op
// dinsdag 28 april.
{
  const task = '<Task><UID>1</UID><ID>1</ID><Name>Over Koningsdag</Name><OutlineLevel>1</OutlineLevel>'
    + '<Duration>PT16H0M0S</Duration><Start>2026-04-24T08:00:00</Start><Finish>2026-04-27T17:00:00</Finish>'
    + '<ConstraintType>4</ConstraintType><ConstraintDate>2026-04-24T08:00:00</ConstraintDate></Task>';
  const finishOf = (r: ReturnType<typeof readMSPDI>): string => {
    const res = solveProject(opsSolveInput({ tasks: r.tasks, sequences: r.sequences, calendar: r.calendar, calendars: r.resourceCalendars ?? [] }));
    ok(`4 planning rekent zonder fout (${res.error ?? 'geen fout'})`, !res.error);
    const t = r.tasks.find((x) => x.name === 'Over Koningsdag');
    return (t?.time.earlyFinish ?? '').slice(0, 10);
  };
  eq('4 MS Project-kalender met werkweek: taak eindigt op Koningsdag zelf (geen vrije dag)', finishOf(readMSPDI(doc(cal(1, 'Standard', WEEK), task))), '2026-04-27');
  // Contrast: een kale kalender houdt de NL-standaard en slaat Koningsdag over.
  eq('4 kale kalender (contrast): Koningsdag is vrij, einde dinsdag', finishOf(readMSPDI(doc(cal(1, 'Kaal', ''), task))), '2026-04-28');
}

// ── 5. Afgeleide kalender erft de uitzonderingen van zijn basis ─────────────────────────────────
{
  const base = cal(1, 'Standard', WEEK + `<Exceptions>${exc('2026-07-03', '2026-07-03', 'Independence Day')}</Exceptions>`);
  const r = readMSPDI(doc(base
    + cal(2, 'Erft alles', '', 1)
    + cal(3, 'Eigen erbij', `<Exceptions>${exc('2026-08-10', '2026-08-10', 'Verlof')}</Exceptions>`, 1)));
  eq('5 afgeleide kalender zonder eigen data: de feestdagen van de basis', lib(r, 'Erft alles')?.holidays, [
    { name: 'Independence Day', startDate: '2026-07-03', endDate: '2026-07-03' },
  ]);
  eq('5 afgeleide kalender met eigen uitzondering: basis + eigen', lib(r, 'Eigen erbij')?.holidays, [
    { name: 'Independence Day', startDate: '2026-07-03', endDate: '2026-07-03' },
    { name: 'Verlof', startDate: '2026-08-10', endDate: '2026-08-10' },
  ]);
  // Basis zonder uitzonderingen (volledige MS Project-kalender) ⇒ de afgeleide kalender ook zonder.
  const leeg = readMSPDI(doc(cal(1, 'Standard', WEEK) + cal(2, 'Resource', '', 1)));
  eq('5 afgeleide kalender op een basis zonder feestdagen: 0 feestdagen', lib(leeg, 'Resource')?.holidays.length, 0);
}

// ── 6. Oude vorm: DayType 0 met TimePeriod ──────────────────────────────────────────────────────
{
  const legacy = '<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod>'
    + '<FromDate>2026-05-25T00:00:00</FromDate><ToDate>2026-05-25T23:59:00</ToDate></TimePeriod></WeekDay>'
    + '<WeekDay><DayType>0</DayType><DayWorking>1</DayWorking><TimePeriod>'
    + '<FromDate>2026-05-30T00:00:00</FromDate><ToDate>2026-05-30T23:59:00</ToDate></TimePeriod>' + WT + '</WeekDay>';
  const r = readMSPDI(doc(cal(1, 'Oud', WEEK.replace('</WeekDays>', `${legacy}</WeekDays>`))));
  eq('6 DayType 0 zonder werktijden: vrije dag', r.calendar.holidays.map((h) => [h.startDate, h.endDate]), [['2026-05-25', '2026-05-25']]);
  eq('6 DayType 0 met werktijden: werkende uitzondering', (r.calendar.workingExceptions ?? []).map((w) => w.startDate), ['2026-05-30']);
  eq('6 DayType 0 telt niet als weekdag', r.calendar.workDays, [1, 2, 3, 4, 5]);
}

// ── 7. Basis UID 1 die niet de projectkalender is en niet als eerste staat ─────────────────────
// Projectkalender = UID 3; een afgeleide kalender met `<BaseCalendarUID>1</BaseCalendarUID>` vindt
// zijn basis in de bibliotheek.
{
  const r = readMSPDI(doc(
    cal(3, 'Eerste', WEEK)
    + cal(1, 'Standard', WEEK + `<Exceptions>${exc('2026-11-26', '2026-11-26', 'Thanksgiving')}</Exceptions>`)
    + cal(5, 'Resource', '', 1), '', '3'));
  eq('7 afgeleide kalender vindt basis UID 1 (niet de projectkalender)', lib(r, 'Resource')?.holidays, [
    { name: 'Thanksgiving', startDate: '2026-11-26', endDate: '2026-11-26' },
  ]);
}

// ── 8. Round-trip: OPS-kalender zonder feestdagen ───────────────────────────────────────────────
{
  const opsCal: WorkCalendar = {
    id: 'cal-x', name: 'Zonder feestdagen', description: '', workDays: [1, 2, 3, 4, 5],
    workStartHour: 8, workEndHour: 16, hoursPerDay: 8, holidays: [],
  };
  const project: Project = {
    id: 'p', name: 'RT', description: '', startDate: '2026-04-20', endDate: '2026-05-30',
    calendarId: 'cal-x', createdAt: '2026-04-20T00:00', modifiedAt: '2026-04-20T00:00', author: 'T', company: 'C',
  };
  const t: Task = {
    id: 't', name: 'T', description: '', wbsCode: '1', taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
    isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [],
    time: {
      durationType: 'WORKTIME', durationUnit: 'days', scheduleDuration: 2, scheduleStart: '2026-04-24', scheduleFinish: '2026-04-27',
      earlyStart: '2026-04-24', earlyFinish: '2026-04-27', lateStart: '2026-04-24', lateFinish: '2026-04-27',
      freeFloat: 0, totalFloat: 0, isCritical: false, completion: 0,
    },
  };
  const back = readMSPDI(writeMSPDI(project, opsCal, [t], [], [], []));
  eq('8 OPS-kalender zonder feestdagen: na MSPDI-export en heropenen nog steeds 0', back.calendar.holidays.length, 0);
}

// ── 9. Projectkalender via <CalendarUID> ──────────────────────────────────────────────────────
{
  const cals = cal(3, 'Eerste', WEEK) + cal(1, 'Standard', MA_ZA) + cal(4, 'Ploeg', WEEK);
  const tasks = taskOn(1, 'Op Eerste', 3, '2026-06-01', 8) + taskOn(2, 'Op project', 1, '2026-06-01', 8) + taskOn(3, 'Zonder', -1, '2026-06-01', 8);
  const res = '<Resource><UID>1</UID><Name>Piet</Name><Type>1</Type><CalendarUID>4</CalendarUID></Resource>';
  const r = readMSPDI(doc(cals, tasks, '1', res));
  eq('9 projectkalender volgt <CalendarUID>1, niet het eerste element', r.calendar.name, 'Standard');
  eq('9 projectkalender heeft de werkweek van UID 1 (ma–za)', r.calendar.workDays, [1, 2, 3, 4, 5, 6]);
  eq('9 bibliotheek = alle andere kalenders, projectkalender niet dubbel', (r.resourceCalendars ?? []).map((c) => c.name), ['Eerste', 'Ploeg']);
  const byName = new Map(r.tasks.map((t) => [t.name, t]));
  eq('9 taak met CalendarUID 3 wijst naar "Eerste"', byName.get('Op Eerste')?.calendarId, lib(r, 'Eerste')?.id);
  eq('9 taak met CalendarUID van de projectkalender: geen eigen kalender', byName.get('Op project')?.calendarId, undefined);
  eq('9 taak met CalendarUID -1: geen eigen kalender', byName.get('Zonder')?.calendarId, undefined);
  eq('9 resource met CalendarUID 4 wijst naar "Ploeg"', r.resources[0]?.calendarId, lib(r, 'Ploeg')?.id);

  // Projectkalender = UID 3: dan is UID 1 een gewone bibliotheekkalender en raakt hij niet kwijt.
  const r3 = readMSPDI(doc(cals, tasks, '3'));
  eq('9 <CalendarUID>3: projectkalender "Eerste"', r3.calendar.name, 'Eerste');
  eq('9 <CalendarUID>3: UID 1 staat in de bibliotheek', (r3.resourceCalendars ?? []).map((c) => c.name), ['Standard', 'Ploeg']);
  eq('9 <CalendarUID>3: taak met CalendarUID 1 wijst naar "Standard"', r3.tasks.find((t) => t.name === 'Op project')?.calendarId, lib(r3, 'Standard')?.id);

  // Terugval: <CalendarUID> wijst naar niets, of ontbreekt ⇒ het eerste element (oud gedrag).
  eq('9 <CalendarUID>99 (bestaat niet): terugval op het eerste element', readMSPDI(doc(cals, '', '99')).calendar.name, 'Eerste');
  eq('9 geen <CalendarUID>: terugval op het eerste element', readMSPDI(doc(cals, '', '')).calendar.name, 'Eerste');
}

// ── 10. Afgeleide kalender erft de werkweek van zijn basis ─────────────────────────────────────
{
  const own = '<WeekDays><WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>'
    + '<WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>07:00:00</FromTime>'
    + '<ToTime>15:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay></WeekDays>';
  const r = readMSPDI(doc(cal(1, 'Standard', MA_ZA) + cal(2, 'Erft', '', 1) + cal(3, 'Eigen dagen', own, 1) + cal(4, 'Kleinkind', '', 2)));
  const erft = lib(r, 'Erft');
  eq('10 afgeleide kalender zonder werkweek: dagen van de basis (ma–za)', erft?.workDays, [1, 2, 3, 4, 5, 6]);
  eq('10 afgeleide kalender: begin/einde uit de blokken van de basis (8–17)', [erft?.workStartHour, erft?.workEndHour], [8, 17]);
  eq('10 afgeleide kalender: netto 8 uur per dag (pauze niet meegeteld)', erft?.hoursPerDay, 8);
  eq('10 keten (kleinkind → afgeleid → basis): ook ma–za', lib(r, 'Kleinkind')?.workDays, [1, 2, 3, 4, 5, 6]);
  const eigen = lib(r, 'Eigen dagen');
  eq('10 eigen <WeekDay> wint per dag: zaterdag vrij, rest van de basis', eigen?.workDays, [1, 2, 3, 4, 5]);
  eq('10 eigen maandag 07–15 (één blok) bepaalt begin en einde', [eigen?.workStartHour, eigen?.workEndHour, eigen?.hoursPerDay], [7, 15, 8]);
  // Basis zonder werkweek (kaal): de afgeleide kalender houdt de app-standaard, zoals vroeger.
  const kaal = readMSPDI(doc(cal(1, 'Kaal', '') + cal(2, 'Op kaal', '', 1)));
  eq('10 afgeleide kalender op een kale basis: app-standaard ma–vr', lib(kaal, 'Op kaal')?.workDays, createDefaultCalendar().workDays);
}

// ── 11. Rekentest: geërfde zaterdag ─────────────────────────────────────────────────────────────
// Vrijdag 5 juni 2026 + 2 werkdagen op een afgeleide kalender van een ma–za-basis: klaar zaterdag 6
// juni. Met de app-standaard (ma–vr) zou het maandag 8 juni worden.
{
  const r = readMSPDI(doc(cal(1, 'Standard', MA_ZA) + cal(2, 'Ploeg', '', 1), taskOn(1, 'Op ploeg', 2, '2026-06-05', 16)));
  const res = solveProject(opsSolveInput({ tasks: r.tasks, sequences: r.sequences, calendar: r.calendar, calendars: r.resourceCalendars ?? [] }));
  ok(`11 planning rekent zonder fout (${res.error ?? 'geen fout'})`, !res.error);
  eq('11 taak op afgeleide kalender eindigt op de geërfde zaterdag', (r.tasks[0]?.time.earlyFinish ?? '').slice(0, 10), '2026-06-06');
}

// ── 12. Budget: overerving telt mee in MAX_TOTAL_HOLIDAY_SLOTS ─────────────────────────────────
// MSPDI-versie van T6-C1 (check-mpp-calendars.ts): één basis met 400 losse vrije dagen + 300
// afgeleide kalenders zonder eigen data. Ongeklemd 301 × 400 = 120.400 > 100.000.
{
  const d0 = Date.UTC(2026, 0, 1);
  let excs = '';
  for (let i = 0; i < 400; i++) {
    const d = new Date(d0 + i * 2 * 86_400_000).toISOString().slice(0, 10);
    excs += exc(d, d, `H${i}`);
  }
  let cals = cal(1, 'Basis', WEEK + `<Exceptions>${excs}</Exceptions>`);
  for (let k = 2; k <= 301; k++) cals += cal(k, `R${k}`, '', 1);
  const t0 = Date.now();
  const r = readMSPDI(doc(cals));
  const ms = Date.now() - t0;
  const all = [r.calendar, ...(r.resourceCalendars ?? [])];
  const total = all.reduce((n, c) => n + c.holidays.length, 0);
  eq(`12 T6-C1: totaal precies MAX_TOTAL_HOLIDAY_SLOTS (ongeklemd 120400)`, total, MAX_TOTAL_HOLIDAY_SLOTS);
  eq('12 T6-C1: alle 301 kalenders gematerialiseerd', all.length, 301);
  ok(`12 T6-C1: binnen 2000 ms (${ms} ms)`, ms < 2000);
}
// ── 13. Voorrang <Exceptions> boven DayType 0; DayType 0 in <WorkWeeks> telt niet ──────────────
{
  const day0 = (d: string) => `<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>${d}T00:00:00</FromDate><ToDate>${d}T23:59:00</ToDate></TimePeriod></WeekDay>`;
  const week = WEEK.replace('</WeekDays>', `${day0('2026-07-01')}${day0('2026-08-03')}</WeekDays>`);
  const r = readMSPDI(doc(cal(1, 'Beide', week + `<Exceptions>${exc('2026-07-01', '2026-07-01', 'X')}</Exceptions>`)));
  eq('13 <Exceptions> aanwezig: alleen die, DayType 0 genegeerd (zoals MPXJ)', r.calendar.holidays, [
    { name: 'X', startDate: '2026-07-01', endDate: '2026-07-01' },
  ]);
  const ww = `<WorkWeeks><WorkWeek><TimePeriod><FromDate>2026-06-01T00:00:00</FromDate><ToDate>2026-06-30T23:59:00</ToDate></TimePeriod><WeekDays>${day0('2026-06-10')}</WeekDays></WorkWeek></WorkWeeks>`;
  eq('13 DayType 0 binnen <WorkWeeks>: geen uitzondering', readMSPDI(doc(cal(1, 'Tijdelijk', WEEK + ww))).calendar.holidays.length, 0);
}

// ── 14. Terugval: alleen taken en resources hebben een <CalendarUID> ───────────────────────────
{
  const cals = cal(1, 'Standard', WEEK) + cal(3, 'Ander', MA_ZA);
  const res = '<Resource><UID>1</UID><Name>Piet</Name><Type>1</Type><CalendarUID>3</CalendarUID></Resource>';
  const r = readMSPDI(doc(cals, taskOn(1, 'Op ander', 3, '2026-06-01', 8), '', res));
  eq('14 geen <CalendarUID> in de projectkop: eerste element, niet de UID van een taak/resource', r.calendar.name, 'Standard');
  eq('14 taak met CalendarUID 3 wijst naar "Ander"', r.tasks[0]?.calendarId, lib(r, 'Ander')?.id);
}

// ── 15. Basis bestaat niet, cyclus, zelfverwijzing: geen overerving, geen NL-terugval ──────────
{
  const base = cal(1, 'Proj', MA_ZA + `<Exceptions>${exc('2026-07-01', '2026-07-01', 'X')}</Exceptions>`);
  const r = readMSPDI(doc(base + cal(2, 'Wees', '', 99) + cal(3, 'A', '', 4) + cal(4, 'B', '', 3) + cal(5, 'Zelf', '', 5) + cal(6, 'Rare', '', -65533)
    + cal(7, 'Op cyclus', '', 3)));
  for (const n of ['Wees', 'A', 'B', 'Zelf', 'Rare', 'Op cyclus']) {
    eq(`15 "${n}": 0 feestdagen (geen NL-terugval, geen basis)`, lib(r, n)?.holidays.length, 0);
    eq(`15 "${n}": app-werkweek, niet die van een basis`, lib(r, n)?.workDays, createDefaultCalendar().workDays);
  }
  // Eigen uitzondering blijft wel staan.
  const eigen = readMSPDI(doc(base + cal(2, 'Wees eigen', `<Exceptions>${exc('2026-09-01', '2026-09-01', 'Eigen')}</Exceptions>`, 99)));
  eq('15 basis bestaat niet, eigen uitzondering: precies die', lib(eigen, 'Wees eigen')?.holidays, [{ name: 'Eigen', startDate: '2026-09-01', endDate: '2026-09-01' }]);
}

// ── 16. Keten van 40: uitkomst onafhankelijk van de documentvolgorde ───────────────────────────
// K2 → Proj, K3 → K2, …, K41 → K40. K(n) ligt n-1 schakels van de basis: tot en met MAX_BASE_CHAIN_DEPTH
// schakels erft hij, daarboven niet — in beide documentvolgordes hetzelfde.
{
  const proj = cal(1, 'Proj', MA_ZA);
  const links = Array.from({ length: 40 }, (_, i) => i + 2).map((k) => cal(k, `K${k}`, '', k === 2 ? 1 : k - 1));
  const sig = (r: ReturnType<typeof readMSPDI>) => (r.resourceCalendars ?? []).map((c) => `${c.name}:${c.workDays.join('')}`).sort().join(' ');
  const baseFirst = readMSPDI(doc(proj + links.join('')));
  const leafFirst = readMSPDI(doc(proj + [...links].reverse().join('')));
  eq('16 keten van 40: blad eerst = basis eerst', sig(leafFirst), sig(baseFirst));
  const inherits = (k: number) => lib(leafFirst, `K${k}`)?.workDays.join('') === '123456';
  ok(`16 K${MAX_BASE_CHAIN_DEPTH + 1} (${MAX_BASE_CHAIN_DEPTH} schakels) erft nog`, inherits(MAX_BASE_CHAIN_DEPTH + 1));
  ok(`16 K${MAX_BASE_CHAIN_DEPTH + 2} (te diep) erft niet`, !inherits(MAX_BASE_CHAIN_DEPTH + 2));
}

// ── 17. Eigen export: <CalendarUID> in de projectkop; eerste taak op een bibliotheekkalender ─────
{
  const projCal: WorkCalendar = { ...createDefaultCalendar(), id: 'cal-proj', name: 'NL project' };
  const ploeg: WorkCalendar = { ...createDefaultCalendar(), id: 'cal-ploeg', name: 'Ploeg za', holidays: [], workDays: [1, 2, 3, 4, 5, 6] };
  const project: Project = {
    id: 'p', name: 'RT', description: '', startDate: '2026-04-20', endDate: '2026-05-30',
    calendarId: 'cal-proj', createdAt: '2026-04-20T00:00', modifiedAt: '2026-04-20T00:00', author: 'T', company: 'C',
  };
  const mk = (id: string, calendarId?: string): Task => ({
    id, name: id, description: '', wbsCode: id, taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
    isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [], calendarId,
    time: {
      durationType: 'WORKTIME', durationUnit: 'days', scheduleDuration: 2, scheduleStart: '2026-04-24', scheduleFinish: '2026-04-27',
      earlyStart: '2026-04-24', earlyFinish: '2026-04-27', lateStart: '2026-04-24', lateFinish: '2026-04-27',
      freeFloat: 0, totalFloat: 0, isCritical: false, completion: 0,
    },
  });
  const xml = writeMSPDI(project, projCal, [mk('A', 'cal-ploeg'), mk('B')], [], [], [], [ploeg]);
  const head = xml.split('<Calendars>')[0];
  ok('17 export: <CalendarUID>1</CalendarUID> in de projectkop', /<CalendarUID>1<\/CalendarUID>/.test(head));
  const r = readMSPDI(xml);
  eq('17 heropend: projectkalender', r.calendar.name, 'NL project');
  eq('17 heropend: projectkalender houdt zijn feestdagen', r.calendar.holidays.length, projCal.holidays.length);
  eq('17 heropend: bibliotheek', (r.resourceCalendars ?? []).map((c) => c.name), ['Ploeg za']);
  eq('17 heropend: taak A op "Ploeg za"', r.tasks.find((t) => t.name === 'A')?.calendarId, lib(r, 'Ploeg za')?.id);
  eq('17 heropend: taak B op de projectkalender', r.tasks.find((t) => t.name === 'B')?.calendarId, undefined);
}

// ── 12b. Budget, zwaar (achteraan: een regressie kan hier crashen) ─────────────────────────────
{
  // Zwaar: 28 wekelijkse records ma/wo/vr van elk 24 jaar ⇒ ~100.000 vrije dagen in de basis, plus
  // 1023 lege afgeleide kalenders (129 KB XML). Zonder rem in `mergeInherited` pakt dat 1023 × 100.000
  // datums uit.
  let excs = '';
  for (let i = 0; i < 28; i++) {
    const y = 2000 + i * 24;
    excs += `<Exception><DayWorking>0</DayWorking><TimePeriod><FromDate>${y}-01-01T00:00:00</FromDate><ToDate>${y + 24}-01-01T00:00:00</ToDate></TimePeriod><Type>6</Type><DaysOfWeek>42</DaysOfWeek><Period>1</Period></Exception>`;
  }
  let cals = cal(1, 'Basis', WEEK + `<Exceptions>${excs}</Exceptions>`);
  for (let k = 2; k <= 1024; k++) cals += cal(k, `R${k}`, '', 1);
  const t0 = Date.now();
  const r = readMSPDI(doc(cals));
  const ms = Date.now() - t0;
  const total = [r.calendar, ...(r.resourceCalendars ?? [])].reduce((n, c) => n + c.holidays.length, 0);
  ok(`12 zwaar: totaal ≤ MAX_TOTAL_HOLIDAY_SLOTS (${total})`, total <= MAX_TOTAL_HOLIDAY_SLOTS);
  ok(`12 zwaar: binnen 3000 ms (${ms} ms)`, ms < 3000);
}

if (fails.length > 0) {
  console.log(`check-mspdi-feestdagen: ${fails.length}/${checks} ROOD`);
  process.exit(1);
}
console.log(`OK  check-mspdi-feestdagen: ${checks}/${checks} groen`);
