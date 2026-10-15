// Uren per dag na eigen export en heropenen (P6 XML en MSPDI). Fout gevonden bij de review van PR #363
// (2026-10-15): `promoteHourCalendar` zette `hoursPerDay` altijd op de modale dagsom van de blokken.
// Een kalender met `hoursPerDay` 8 en blokken van 10 h opende na export met 10; de volgende export
// schreef 10, en een dagtaak van 5 d werd 4 d.
//
// Eigenaarsbesluit 2026-10-15 ("een dag", optie 2, PR #363): de opgeslagen uren per dag blijven
// bewaard en gaan ongewijzigd terug bij export. Dus na twee keer exporteren en heropenen:
//   - `hoursPerDay` blijft 8, de blokken blijven 10 h;
//   - een dagtaak van 5 d blijft 5 d;
//   - een urentaak houdt haar minuten.
// Een kalender zonder eigen waarde in het bestand volgt de blokken (zoals vroeger).
import { writeP6XML } from '@/services/p6/p6xmlWriter';
import { readP6XML } from '@/services/p6/p6xmlReader';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
import { readMSPDI } from '@/services/msproject/mspdiReader';
import type { Task } from '@/types/task';
import type { WorkCalendar, WorkTimeBands } from '@/types/calendar';
import type { Project } from '@/types/project';
import type { ImportResult } from '@/services/importTypes';
import { installDOMParser } from './xmldom-shim';

installDOMParser();

let checks = 0;
let fails = 0;
function eq(name: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails++;
    console.log(`   XX ${name}: kreeg ${JSON.stringify(got)} ≠ verwacht ${JSON.stringify(want)}`);
  }
}

const tenHourWeek = (): WorkTimeBands => {
  const byWeekday = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as WorkTimeBands['byWeekday'];
  for (let d = 1; d <= 5; d++) byWeekday[d as 1] = [{ start: 7 * 60, end: 17 * 60 }]; // 07–17, geen pauze
  return { byWeekday };
};
const TEN_HOUR_BAND = [{ start: 420, end: 1020 }];

// Projectkalender: 8 uur per dag, blokken van 10 h.
const CAL: WorkCalendar = {
  id: 'cal-tien', name: 'Tien uur', description: '', workDays: [1, 2, 3, 4, 5],
  workStartHour: 7, workEndHour: 17, hoursPerDay: 8, holidays: [], workTime: tenHourWeek(),
};
// Bibliotheekkalender met dezelfde vorm (P6 schrijft per kalender een eigen `HoursPerDay`).
const LIB: WorkCalendar = { ...CAL, id: 'cal-lib', name: 'Bibliotheek tien uur', workTime: tenHourWeek() };

const project: Project = {
  id: 'p', name: 'Uren per dag', description: '', startDate: '2026-07-06', endDate: '2026-12-31',
  calendarId: CAL.id, createdAt: '2026-07-06T00:00', modifiedAt: '2026-07-06T00:00', author: 'T', company: 'C',
};

const HOUR_MINUTES = 1870 * 60; // urentaak van 1870 h
const mk = (name: string, unit: 'days' | 'hours', duration: number, minutes?: number, calendarId?: string): Task => ({
  id: `t-${name}`, name, description: '', wbsCode: name, taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
  isMilestone: false, priority: 500, parentId: null, childIds: [],
  time: {
    durationType: 'WORKTIME', durationUnit: unit, scheduleDuration: duration,
    ...(minutes !== undefined ? { durationMinutes: minutes } : {}),
    scheduleStart: '2026-07-06T07:00', scheduleFinish: '2026-07-10T17:00',
    earlyStart: '2026-07-06T07:00', earlyFinish: '2026-07-10T17:00',
    lateStart: '2026-07-06T07:00', lateFinish: '2026-07-10T17:00',
    freeFloat: 0, totalFloat: 0, isCritical: false, completion: 0,
  },
  resourceIds: [],
  ...(calendarId ? { calendarId } : {}),
});
const TASKS: Task[] = [
  mk('Dagtaak', 'days', 5),
  mk('Urentaak', 'hours', HOUR_MINUTES / 600, HOUR_MINUTES),
];

type Writer = (p: Project, c: WorkCalendar, t: Task[], s: [], r: [], a: [], lib: WorkCalendar[]) => string;
type Reader = (xml: string) => ImportResult;

function checkCalendar(label: string, cal: WorkCalendar | undefined): void {
  eq(`${label} hoursPerDay`, cal?.hoursPerDay, 8);
  eq(`${label} blokken ma`, cal?.workTime?.byWeekday[1], TEN_HOUR_BAND);
  eq(`${label} blokken vr`, cal?.workTime?.byWeekday[5], TEN_HOUR_BAND);
}

function checkTasks(label: string, tasks: Task[], dayName: string): void {
  const day = tasks.find(t => t.name === dayName);
  const hour = tasks.find(t => t.name === 'Urentaak');
  eq(`${label} ${dayName} eenheid`, day?.time.durationUnit, 'days');
  eq(`${label} ${dayName} 5 d`, day?.time.scheduleDuration, 5);
  eq(`${label} urentaak eenheid`, hour?.time.durationUnit, 'hours');
  eq(`${label} urentaak minuten`, hour?.time.durationMinutes, HOUR_MINUTES);
}

function route(name: string, write: Writer, read: Reader, hpdTag: RegExp, withLibrary: boolean): void {
  const lib = withLibrary ? [LIB] : [];
  const tasks = withLibrary ? [...TASKS, mk('Dagtaak bibliotheek', 'days', 5, undefined, LIB.id)] : TASKS;
  let cal = CAL;
  let libCals = lib;
  let tk = tasks;
  for (let round = 1; round <= 2; round++) {
    const label = `${name} ronde ${round}`;
    const xml = write(project, cal, tk, [], [], [], libCals);
    eq(`${label} geschreven uren per dag`, xml.match(hpdTag)?.[1], hpdTag.source.includes('Minutes') ? '480' : '8');
    const back = read(xml);
    checkCalendar(`${label} projectkalender`, back.calendar);
    checkTasks(label, back.tasks, 'Dagtaak');
    if (withLibrary) {
      checkCalendar(`${label} bibliotheekkalender`, back.resourceCalendars?.find(c => c.name === LIB.name));
      checkTasks(label, back.tasks, 'Dagtaak bibliotheek');
    }
    cal = back.calendar;
    libCals = back.resourceCalendars ?? [];
    tk = back.tasks;
  }
}

// Route A: app → P6 XML → app (twee keer). P6 schrijft per kalender een `HoursPerDay`.
route('P6 XML', writeP6XML as Writer, readP6XML, /<HoursPerDay>([^<]*)<\/HoursPerDay>/, true);
// Route B: app → MSPDI → app (twee keer). MSPDI draagt alleen `MinutesPerDay` op projectniveau.
route('MSPDI', writeMSPDI as Writer, readMSPDI, /<MinutesPerDay>([^<]*)<\/MinutesPerDay>/, false);

// Zonder eigen waarde in het bestand volgt de kalender de blokken (10 h), zoals vroeger.
{
  const xml = writeP6XML(project, CAL, TASKS, [], [], [], []).replace(/<HoursPerDay>[^<]*<\/HoursPerDay>/g, '');
  eq('P6 XML zonder HoursPerDay volgt de blokken', readP6XML(xml).calendar.hoursPerDay, 10);
}
{
  const xml = writeMSPDI(project, CAL, TASKS, [], [], [], []).replace(/<MinutesPerDay>[^<]*<\/MinutesPerDay>/g, '');
  eq('MSPDI zonder MinutesPerDay volgt de blokken', readMSPDI(xml).calendar.hoursPerDay, 10);
}
// Een ongeldige waarde (0) telt als geen eigen waarde.
{
  const xml = writeP6XML(project, CAL, TASKS, [], [], [], []).replace(/<HoursPerDay>[^<]*<\/HoursPerDay>/g, '<HoursPerDay>0</HoursPerDay>');
  eq('P6 XML met HoursPerDay 0 volgt de blokken', readP6XML(xml).calendar.hoursPerDay, 10);
}

if (fails > 0) {
  console.log(`XX  urenperdag-heropenen: ${fails}/${checks} checks rood`);
  process.exit(1);
}
console.log(`OK  urenperdag-heropenen: ${checks} checks groen`);
