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
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen — alleen de exitcode telt.
import { readMSPDI } from '@/services/msproject/mspdiReader';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
import { createDefaultCalendar } from '@/engine/calendar/defaultCalendar';
import { solveProject } from '@/engine/scheduler/solveProject';
import type { WorkCalendar } from '@/types/calendar';
import type { Project } from '@/types/project';
import type { Task } from '@/types/task';
import { installDOMParser } from './xmldom-shim';
import { opsSolveInput } from './legacySolveOptions';

installDOMParser();

let checks = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  checks++;
  if (!cond) fails.push(label);
};
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
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

if (fails.length > 0) {
  for (const f of fails) console.log(`XX  ${f}`);
  console.log(`check-mspdi-feestdagen: ${fails.length}/${checks} ROOD`);
  process.exit(1);
}
console.log(`OK  check-mspdi-feestdagen: ${checks}/${checks} groen`);
