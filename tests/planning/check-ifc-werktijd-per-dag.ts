// B7 (docs/onderhoudbaarheid/deelrapporten/rapport-ifc.md) — werkblokken die per weekdag verschillen,
// door opslaan als IFC en heropenen.
//
// Vóór de fix schreef `writeCalendar` alleen de blokken van de eerste werkdag, en stopte de lezer na de
// eerste `IFCWORKTIME`: een korte vrijdag (ma–do 07–15, vr 07–11) kwam terug als een volle vrijdag. Nu
// krijgt elke groep weekdagen met dezelfde blokken een eigen `IFCWORKTIME` (het model van IFC 4.3,
// `IfcWorkCalendar` figuur 1), met vooraan een terugvalweek voor oudere OPS-versies.
//
//  §1 round-trip per geval: korte vrijdag, zaterdag, drie groepen, nachtploeg per dag, blok tot 24:00,
//     zondag die afwijkt (de scalaire dag is niet de grootste groep); plus een tweede round-trip.
//  §2 de vorm van het bestand: terugvalweek vooraan (datum 1900-01-01, `LegacyWorkTimeIds`), daarna de
//     groepen zonder datum, de grootste eerst.
//  §3 wat een oudere OPS-versie ziet: die leest alleen de EERSTE `IFCWORKTIME` (gemeten met de lezer van
//     main 1e192b31a). Die moet alle werkdagen dragen, met de blokken van de grootste groep — precies wat
//     zo'n versie vóór de fix zag. Zonder terugvalweek werd een korte vrijdag daar een VRIJE dag.
//  §4 byte-identiek aan main: een uniforme uurweek, een dagkalender zonder blokken en een scalaire
//     kalender met urentaak (gematerialiseerde blokken). De verwachte regels zijn gemaakt met de writer
//     van main 1e192b31a; een gewijzigde byte is een fout, geen reden om de verwachting bij te werken.
//  §5 de lezer op bestanden van andere pakketten: één `IFCWORKTIME` per tijdvak, overlap, de dag-modus
//     (vereniging van werkdagen), de scalaire dag (eerste werkdag met blokken, zoals MSPDI/.mpp) en een
//     terugvalweek zonder markering.
//  §6 afgeleide velden en de motor na heropenen: pauze (`inferredSimpleBreak`), `hoursPerDay`, en een
//     urentaak van 16 u vanaf donderdag 07:00 die eindigt op maandag 11:00 (met de oude fout: vrijdag
//     15:30).
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import { createDefaultProject } from '@/state/defaults';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import { inferredSimpleBreak } from '@/utils/effectiveWorkTime';
import { CalendarEngine } from '@/engine/scheduler/CalendarEngine';
import type { WorkCalendar, WorkTimeBands } from '@/types/calendar';
import type { Task } from '@/types/task';
import type { ImportResult } from '@/services/importTypes';

declare const process: { exit(code: number): never };

let checks = 0;
const failures: string[] = [];
function same(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures.push(`${label}\n        verwacht ${JSON.stringify(want)}\n        kreeg    ${JSON.stringify(got)}`);
  }
}

type Band = { start: number; end: number };
type Day = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const DAYS: readonly Day[] = [1, 2, 3, 4, 5, 6, 7];
const week = (m: Partial<Record<Day, Band[]>>): WorkTimeBands =>
  ({ byWeekday: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], ...m } });
const on = (days: Day[], bands: Band[]): Partial<Record<Day, Band[]>> =>
  Object.fromEntries(days.map((d) => [d, bands.map((b) => ({ ...b }))]));

const project = { ...createDefaultProject(), id: 'proj-b7', calendarId: 'cal-b7', startDate: '2026-06-01' };
function hourCal(name: string, workTime: WorkTimeBands, scalar: Pick<WorkCalendar, 'workStartHour' | 'workEndHour' | 'hoursPerDay'>): WorkCalendar {
  const workDays = DAYS.filter((d) => workTime.byWeekday[d].length > 0);
  return { id: 'cal-b7', name, description: '', workDays, holidays: [], workTime, ...scalar };
}
function write(cal: WorkCalendar, tasks: Task[] = []): string {
  const input: ImportResult = { project, calendar: cal, tasks, sequences: [], resources: [], assignments: [] };
  return writeIFC(input);
}
/** De kalendervelden die de round-trip ongeschonden moet laten; `workTime` per weekdag. */
function shape(c: WorkCalendar) {
  return {
    workDays: [...c.workDays], workStartHour: c.workStartHour, workEndHour: c.workEndHour, hoursPerDay: c.hoursPerDay,
    byWeekday: c.workTime ? DAYS.map((d) => (c.workTime!.byWeekday[d] ?? []).map((b) => [b.start, b.end])) : null,
  };
}

// ── Mini-STEP-lezer voor de vormchecks (alleen DATA-regels `#n=TYPE(args);`) ─────────────────────────
type Entity = { type: string; args: string[] };
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === "'" && s[i + 1] === "'") cur += s[++i]; // '' is een apostrof binnen de string
      else if (ch === "'") quote = false;
      continue;
    }
    if (ch === "'") { quote = true; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function parseStep(ifc: string): Map<string, Entity> {
  const map = new Map<string, Entity>();
  for (const line of ifc.split('\n')) {
    const m = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(line.trim());
    if (m) map.set(m[1], { type: m[2], args: splitTop(m[3]) });
  }
  return map;
}
const refs = (s: string): string[] => [...s.matchAll(/#(\d+)/g)].map((m) => m[1]);
const ints = (s: string): number[] => s.replace(/[()]/g, '').split(',').filter(Boolean).map(Number);
const unq = (s: string): string => s.replace(/^'|'$/g, '');
/** De `IFCWORKTIME`'s in `WorkingTimes` van de (enige/eerste) kalender: naam, datums, weekdagen, tijdvakken. */
function workingTimes(ifc: string) {
  const e = parseStep(ifc);
  const cal = [...e.values()].find((x) => x.type === 'IFCWORKCALENDAR')!;
  return refs(cal.args[5]).map((id) => {
    const wt = e.get(id)!;
    const rec = e.get(refs(wt.args[3])[0])!;
    const periods = refs(rec.args[7]).map((p) => e.get(p)!.args.map(unq).join('-'));
    return { id, name: unq(wt.args[0]), dates: `${wt.args[4]},${wt.args[5]}`, days: ints(rec.args[2]), periods };
  });
}
function opsCalendarProp(ifc: string, name: string): string | undefined {
  const line = ifc.split('\n').find((l) => l.includes(`IFCPROPERTYSINGLEVALUE('${name}'`));
  return line ? /,\$,IFC[A-Z]+\((.*)\),\$\);$/.exec(line)?.[1] : undefined;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §1 Round-trip per geval
// ════════════════════════════════════════════════════════════════════════════════════════════════
const MA_DO_PAUZE = [{ start: 420, end: 720 }, { start: 750, end: 960 }]; // 07:00–12:00 + 12:30–16:00 (8,5 u)
const CASES: [string, WorkCalendar][] = [
  ['korte vrijdag', hourCal('Korte vrijdag',
    week({ ...on([1, 2, 3, 4], [{ start: 420, end: 900 }]), 5: [{ start: 420, end: 660 }] }),
    { workStartHour: 7, workEndHour: 15, hoursPerDay: 8 })],
  ['zaterdag met een ander blok', hourCal('Zaterdag',
    week({ ...on([1, 2, 3, 4, 5], MA_DO_PAUZE), 6: [{ start: 480, end: 720 }] }),
    { workStartHour: 7, workEndHour: 16, hoursPerDay: 8.5 })],
  ['drie groepen', hourCal('Drie groepen',
    week({ ...on([1, 2, 3, 4], MA_DO_PAUZE), 5: [{ start: 420, end: 720 }, { start: 750, end: 870 }], 6: [{ start: 480, end: 720 }] }),
    { workStartHour: 7, workEndHour: 16, hoursPerDay: 8.5 })],
  ['nachtploeg die per dag verschilt', hourCal('Nacht',
    week({ ...on([1, 2, 3, 4], [{ start: 1320, end: 1800 }]), 5: [{ start: 1320, end: 1680 }] }),
    { workStartHour: 22, workEndHour: 24, hoursPerDay: 8 })],
  ['blok tot 24:00 per dag', hourCal('Avond',
    week({ ...on([1, 2, 3, 4, 5], [{ start: 960, end: 1440 }]), 6: [{ start: 960, end: 1200 }] }),
    { workStartHour: 16, workEndHour: 24, hoursPerDay: 8 })],
  // De scalaire dag van de lezer (eerste werkdag met blokken, zondag eerst — zoals MSPDI/.mpp) is hier
  // NIET de grootste groep, en de eerste periode geeft de scalar 7 terug. Zonder `WorkStartHour` werd
  // het 10 (de zondag).
  ['zondag die afwijkt', hourCal('Zondag',
    week({ ...on([1, 2, 3, 4, 5], MA_DO_PAUZE), 7: [{ start: 600, end: 840 }] }),
    { workStartHour: 7, workEndHour: 16, hoursPerDay: 8.5 })],
];
for (const [label, cal] of CASES) {
  const ifc1 = write(cal);
  const rt1 = readIFC(ifc1).calendar;
  same(`§1 ${label}: kalender ongewijzigd na opslaan en heropenen`, shape(rt1), shape(cal));
  const rt2 = readIFC(write({ ...rt1, id: cal.id })).calendar;
  same(`§1 ${label}: tweede round-trip gelijk aan de eerste`, shape(rt2), shape(rt1));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §2 + §3 De vorm van het bestand, en wat een oudere OPS-versie eruit leest
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  const ifc = write(CASES[0][1]); // korte vrijdag
  const wts = workingTimes(ifc);
  same('§2 korte vrijdag: WorkingTimes = terugvalweek + twee groepen', wts.map((w) => ({ name: w.name, dates: w.dates, days: w.days, periods: w.periods })), [
    { name: 'Standard work week (for older Open Planner Studio versions)', dates: "'1900-01-01','1900-01-01'", days: [1, 2, 3, 4, 5], periods: ['07:00:00-15:00:00'] },
    { name: 'Standard work week (Mon, Tue, Wed, Thu)', dates: '$,$', days: [1, 2, 3, 4], periods: ['07:00:00-15:00:00'] },
    { name: 'Standard work week (Fri)', dates: '$,$', days: [5], periods: ['07:00:00-11:00:00'] },
  ]);
  same('§2 korte vrijdag: LegacyWorkTimeIds wijst de terugvalweek aan',
    opsCalendarProp(ifc, 'LegacyWorkTimeIds'), `'["${wts[0].id}"]'`);
  same('§2 korte vrijdag: WorkStartHour/WorkEndHour altijd geschreven bij meer groepen',
    [opsCalendarProp(ifc, 'WorkStartHour'), opsCalendarProp(ifc, 'WorkEndHour')], ['7', '15']);
}
for (const [label, cal] of CASES) {
  // Een oudere OPS-versie (t/m v2026.9.0 en main 1e192b31a) neemt de EERSTE IFCWORKTIME met een patroon,
  // negeert zijn datums en zet zijn tijdvakken op elke weekdag van dat patroon.
  const [first] = workingTimes(write(cal));
  const bandsOf = (d: Day) => cal.workTime!.byWeekday[d].map((b) => `${b.start}-${b.end}`).join(',');
  const counts = new Map<string, number>();
  for (const d of cal.workDays) counts.set(bandsOf(d as Day), (counts.get(bandsOf(d as Day)) ?? 0) + 1);
  const largest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const largestDay = cal.workDays.find((d) => bandsOf(d as Day) === largest) as Day;
  const clock = (m: number, end = false) => (end && m === 1440 ? '24:00:00'
    : `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`);
  same(`§3 ${label}: een oudere versie ziet alle werkdagen, met de blokken van de grootste groep`,
    { days: first.days, periods: first.periods },
    { days: cal.workDays, periods: cal.workTime!.byWeekday[largestDay].map((b) => `${clock(b.start)}-${clock(b.end, true)}`) });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §4 Byte-identiek aan main (1e192b31a) bij één groep en bij een kalender zonder blokken
// ════════════════════════════════════════════════════════════════════════════════════════════════
/** De kalenderregels van het bestand, met STEP-ids relatief aan de eerste kalenderregel (`#+n`) en
 *  verwijzingen naar eerdere regels als `#<`; zo maakt een extra entiteit vóór de kalender niets uit. */
function calendarLines(ifc: string): string[] {
  const keep = /=IFC(TIMEPERIOD|RECURRENCEPATTERN|WORKTIME|WORKCALENDAR)\(|'OPS_Calendar'|IFCPROPERTYSINGLEVALUE\('(WorkStartHour|WorkEndHour|HoursPerDay|IsHourCalendar|LegacyWorkTimeIds|SimpleBreakStart|SimpleBreakDuration)'/;
  const lines = ifc.split('\n').map((l) => l.trim()).filter((l) => keep.test(l));
  const base = Number(/^#(\d+)=/.exec(lines[0])![1]);
  return lines.map((l) => l.replace(/#(\d+)/g, (_, n: string) => (Number(n) >= base ? `#+${Number(n) - base}` : '#<')));
}
const uniformWeek = hourCal('Uniforme uurweek', week(on([1, 2, 3, 4, 5], MA_DO_PAUZE)),
  { workStartHour: 7, workEndHour: 16, hoursPerDay: 8.5 });
const dayCal: WorkCalendar = {
  id: 'cal-b7', name: 'Dagkalender', description: '', workDays: [1, 2, 3, 4, 5],
  workStartHour: 7, workEndHour: 16, hoursPerDay: 8, holidays: [{ name: 'Kerst', startDate: '2026-12-25', endDate: '2026-12-26' }],
};
const hourTask: Task = {
  id: 't-uur', name: 'Urentaak', description: '', wbsCode: '1', taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
  isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [],
  time: createDefaultTaskTime('2026-06-01', 4, 'hours', dayCal),
};
// Gemaakt door deze batterij met esbuild te bundelen tegen `src/` van main 1e192b31a (alias `@`) en de
// §4-uitvoer over te nemen. Zie de kop: een afwijking is een fout in de writer, niet in deze lijst.
const GOLDEN: [string, string, string[]][] = [
  ['uniforme uurweek', write(uniformWeek), [
    "#+0=IFCTIMEPERIOD('07:00:00','12:00:00');",
    "#+1=IFCTIMEPERIOD('12:30:00','16:00:00');",
    "#+2=IFCRECURRENCEPATTERN(.WEEKLY.,$,(1,2,3,4,5),$,$,$,$,(#+0,#+1));",
    "#+3=IFCWORKTIME('Standard work week',.PREDICTED.,$,#+2,$,$);",
    "#+4=IFCWORKCALENDAR('2uNGXnRewWtJPOazG2o4_7',#<,'Uniforme uurweek',$,$,(#+3),$,.FIRSTSHIFT.);",
    "#+5=IFCPROPERTYSINGLEVALUE('WorkEndHour',$,IFCREAL(16),$);",
    "#+6=IFCPROPERTYSINGLEVALUE('IsHourCalendar',$,IFCBOOLEAN(.T.),$);",
    "#+7=IFCPROPERTYSET('263IQ2FKK_eiUDl$xw9qpv',#<,'OPS_Calendar',$,(#+5,#+6));",
  ]],
  ['dagkalender zonder blokken', write(dayCal), [
    "#+0=IFCTIMEPERIOD('07:00:00','16:00:00');",
    "#+1=IFCRECURRENCEPATTERN(.WEEKLY.,$,(1,2,3,4,5),$,$,$,$,(#+0));",
    "#+2=IFCWORKTIME('Standard work week',.PREDICTED.,$,#+1,$,$);",
    "#+3=IFCWORKTIME('Kerst',.PREDICTED.,$,$,'2026-12-25','2026-12-26');",
    "#+4=IFCWORKCALENDAR('2uNGXnRewWtJPOazG2o4_7',#<,'Dagkalender',$,$,(#+2),(#+3),.FIRSTSHIFT.);",
    "#+5=IFCPROPERTYSINGLEVALUE('HoursPerDay',$,IFCREAL(8),$);",
    "#+6=IFCPROPERTYSET('263IQ2FKK_eiUDl$xw9qpv',#<,'OPS_Calendar',$,(#+5));",
  ]],
  ['scalaire kalender met urentaak (gematerialiseerde blokken)', write(dayCal, [hourTask]), [
    "#+0=IFCTIMEPERIOD('07:00:00','12:00:00');",
    "#+1=IFCTIMEPERIOD('13:00:00','16:00:00');",
    "#+2=IFCRECURRENCEPATTERN(.WEEKLY.,$,(1,2,3,4,5),$,$,$,$,(#+0,#+1));",
    "#+3=IFCWORKTIME('Standard work week',.PREDICTED.,$,#+2,$,$);",
    "#+4=IFCWORKTIME('Kerst',.PREDICTED.,$,$,'2026-12-25','2026-12-26');",
    "#+5=IFCWORKCALENDAR('2uNGXnRewWtJPOazG2o4_7',#<,'Dagkalender',$,$,(#+3),(#+4),.FIRSTSHIFT.);",
    "#+6=IFCPROPERTYSINGLEVALUE('HoursPerDay',$,IFCREAL(8),$);",
    "#+7=IFCPROPERTYSINGLEVALUE('WorkEndHour',$,IFCREAL(16),$);",
    "#+8=IFCPROPERTYSINGLEVALUE('IsHourCalendar',$,IFCBOOLEAN(.F.),$);",
    "#+9=IFCPROPERTYSET('263IQ2FKK_eiUDl$xw9qpv',#<,'OPS_Calendar',$,(#+6,#+7,#+8));",
  ]],
];
for (const [label, ifc, want] of GOLDEN) {
  same(`§4 ${label}: kalenderregels byte-identiek aan main`, calendarLines(ifc), want);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §5 De lezer op bestanden van andere pakketten (geen OPS_Calendar)
// ════════════════════════════════════════════════════════════════════════════════════════════════
/** Een minimaal extern bestand: één `IFCWORKCALENDAR` met de gegeven `WorkingTimes` (weekdagen +
 *  tijdvakken als 'hh:mm'). */
function foreignIfc(groups: [number[], [string, string][]][], extra = ''): string {
  const lines: string[] = [];
  let id = 100;
  const wtIds: number[] = [];
  for (const [days, periods] of groups) {
    const tps = periods.map(([s, e]) => { lines.push(`#${++id}=IFCTIMEPERIOD('${s}:00','${e}:00');`); return id; });
    lines.push(`#${++id}=IFCRECURRENCEPATTERN(.WEEKLY.,$,(${days.join(',')}),$,$,$,$,(${tps.map((t) => `#${t}`).join(',')}));`);
    lines.push(`#${++id}=IFCWORKTIME('Werktijd',.PREDICTED.,$,#${id - 1},$,$);`);
    wtIds.push(id);
  }
  lines.push(`#${++id}=IFCWORKCALENDAR('3Ext0000000000000000000',$,'Extern',$,$,(${wtIds.map((w) => `#${w}`).join(',')}),$,.FIRSTSHIFT.);`);
  return `ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n${lines.join('\n')}\n${extra}ENDSEC;\nEND-ISO-10303-21;\n`;
}
{
  // (a) Eén IFCWORKTIME per tijdvak (ma–vr 08–12 en ma–vr 13–17): de vereniging per dag.
  const c = readIFC(foreignIfc([[[1, 2, 3, 4, 5], [['08:00', '12:00']]], [[1, 2, 3, 4, 5], [['13:00', '17:00']]]])).calendar;
  same('§5a één IFCWORKTIME per tijdvak: beide tijdvakken op elke werkdag', shape(c), {
    workDays: [1, 2, 3, 4, 5], workStartHour: 8, workEndHour: 17, hoursPerDay: 8,
    byWeekday: DAYS.map((d) => (d <= 5 ? [[480, 720], [780, 1020]] : [])),
  });
  // (b) Dag-modus (één blok per dag, geen signaal (a)/(b)/(c)): geen workTime, maar workDays is de
  //     vereniging van alle groepen, en de scalar komt van de eerste werkdag met blokken.
  const d = readIFC(foreignIfc([[[1, 2, 3, 4], [['07:00', '15:00']]], [[5], [['07:00', '11:00']]]])).calendar;
  same('§5b dag-modus: werkdagen = vereniging van de groepen', shape(d),
    { workDays: [1, 2, 3, 4, 5], workStartHour: 7, workEndHour: 15, hoursPerDay: 8, byWeekday: null });
  // (c) Overlap: vrijdag in twee IFCWORKTIME's (07–11 en 08–11:30) wordt één tijdvak 07–11:30.
  const o = readIFC(foreignIfc([[[1, 2, 3, 4], [['07:00', '12:00'], ['12:30', '16:00']]], [[5], [['07:00', '11:00']]], [[5], [['08:00', '11:30']]]])).calendar;
  same('§5c overlap op één weekdag: de vereniging van de tijdvakken', o.workTime?.byWeekday[5], [{ start: 420, end: 690 }]);
  // (d) De scalaire dag is de eerste werkdag met blokken in de MSPDI/.mpp-volgorde (zondag eerst),
  //     onafhankelijk van de volgorde in de SET.
  const s = readIFC(foreignIfc([[[1, 2, 3, 4, 5], [['08:00', '12:00'], ['13:00', '17:00']]], [[7], [['10:00', '14:00']]]])).calendar;
  same('§5d scalaire dag = eerste werkdag met blokken (zondag eerst)', [s.workStartHour, s.workEndHour], [10, 14]);
}
{
  // (e) Terugvalweek zonder markering (bv. een ander pakket gooide OPS_Calendar weg): hij telt als
  //     gewone week mee. Geen werkdag gaat verloren; vrijdag krijgt de vereniging (07–15).
  const ifc = write(CASES[0][1]);
  const stripped = ifc.split('\n').filter((l) => !l.includes("'LegacyWorkTimeIds'")).join('\n');
  const c = readIFC(stripped).calendar;
  same('§5e terugvalweek zonder markering: geen werkdag verloren, vrijdag = vereniging',
    [c.workDays, c.workTime?.byWeekday[5]], [[1, 2, 3, 4, 5], [{ start: 420, end: 900 }]]);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §6 Afgeleide velden en de motor na heropenen
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  const MA_DO = [{ start: 420, end: 720 }, { start: 750, end: 930 }]; // 07:00–12:00 + 12:30–15:30 (8 u)
  const cal = hourCal('Korte vrijdag met pauze', week({ ...on([1, 2, 3, 4], MA_DO), 5: [{ start: 420, end: 660 }] }),
    { workStartHour: 7, workEndHour: 15.5, hoursPerDay: 8 });
  const rt = readIFC(write(cal)).calendar;
  same('§6 pauze van de eerste werkdag (12:00, 30 min) na heropenen', inferredSimpleBreak(rt), { startMinute: 720, durationMinutes: 30 });
  same('§6 hoursPerDay = modale dagsom (ma–do 8 u, vr 4 u)', rt.hoursPerDay, 8);
  // 16 werkuren vanaf donderdag 4 juni 2026 07:00: do 8 u + vr 4 u + ma 4 u ⇒ maandag 8 juni 11:00.
  const finish = new CalendarEngine(rt).addWorkMinutes(new Date('2026-06-04T07:00:00Z'), 16 * 60);
  same('§6 urentaak van 16 u vanaf do 07:00 eindigt ma 11:00 (niet vr 15:30)', finish.toISOString(), '2026-06-08T11:00:00.000Z');
}

if (failures.length > 0) {
  for (const f of failures) console.log(`   XX ${f}`);
  console.log(`XX  ifc-werktijd-per-dag: ${failures.length} van ${checks} controles rood`);
  process.exit(1);
}
console.log(`OK  ifc-werktijd-per-dag: alle ${checks} controles groen`);
