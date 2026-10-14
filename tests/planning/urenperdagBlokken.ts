// Gedeelde opbouw voor `check-ifc-urenperdag-blokken.ts` en de fixture
// `fixtures/urenperdag-oude-writer.ifc`: blokkenkalenders waarvan `hoursPerDay` afwijkt van de klokuren
// van de blokken, zoals een XER-kalender met `day_hr_cnt` 8 bij blokken van 10 uur ("Late ploeg").
//
// `hoursPerDay` is de omrekening tussen dagen en uren (P6 `day_hr_cnt`); de blokken zijn de werktijd. De
// twee mogen verschillen. Geen check-*.ts-naam: dit bestand draait niet zelf mee in de suite.
import type { WorkCalendar, WorkTimeBands } from '@/types/calendar';
import type { Task } from '@/types/task';
import type { ImportResult } from '@/services/importTypes';
import { createDefaultProject } from '@/state/defaults';
import { createDefaultTaskTime } from '@/utils/taskDefaults';

export type Day = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Band = { start: number; end: number };
export const DAYS: readonly Day[] = [1, 2, 3, 4, 5, 6, 7];
export const week = (m: Partial<Record<Day, Band[]>>): WorkTimeBands =>
  ({ byWeekday: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], ...m } });
export const on = (days: readonly Day[], bands: Band[]): Partial<Record<Day, Band[]>> =>
  Object.fromEntries(days.map((d) => [d, bands.map((b) => ({ ...b }))]));
const MA_VR: readonly Day[] = [1, 2, 3, 4, 5];

export interface UrenCase {
  /** Kort label voor de checkregels. */
  label: string;
  cal: WorkCalendar;
  /** Klokuren per dag zoals de lezer ze uit de blokken afleidt (modale dagsom). */
  clockHours: number;
}

function hourCal(
  id: string, name: string, workTime: WorkTimeBands,
  scalar: Pick<WorkCalendar, 'workStartHour' | 'workEndHour' | 'hoursPerDay'>,
): WorkCalendar {
  const workDays = DAYS.filter((d) => workTime.byWeekday[d].length > 0);
  return { id, name, description: '', workDays, holidays: [], workTime, ...scalar };
}

/** De gevallen. De eerste is de projectkalender, de rest staat in de kalenderbibliotheek. */
export const CASES: readonly UrenCase[] = [
  {
    label: 'één blok (Late ploeg 14:00–24:00, 8 u/dag)',
    cal: hourCal('cal-late', 'Late ploeg', week(on(MA_VR, [{ start: 840, end: 1440 }])),
      { workStartHour: 14, workEndHour: 24, hoursPerDay: 8 }),
    clockHours: 10,
  },
  {
    label: 'twee blokken (07–12 + 13–17, 8 u/dag)',
    cal: hourCal('cal-twee', 'Twee blokken', week(on(MA_VR, [{ start: 420, end: 720 }, { start: 780, end: 1020 }])),
      { workStartHour: 7, workEndHour: 17, hoursPerDay: 8 }),
    clockHours: 9,
  },
  {
    label: 'nachtblok (22:00–06:00, 7,5 u/dag)',
    cal: hourCal('cal-nacht', 'Nachtblok', week(on(MA_VR, [{ start: 1320, end: 1800 }])),
      { workStartHour: 22, workEndHour: 6, hoursPerDay: 7.5 }),
    clockHours: 8,
  },
  {
    label: 'blokken per weekdag (ma–do 07–17, vr 07–12, 8 u/dag)',
    cal: hourCal('cal-perdag', 'Korte vrijdag', week({
      ...on([1, 2, 3, 4], [{ start: 420, end: 1020 }]), 5: [{ start: 420, end: 720 }],
    }), { workStartHour: 7, workEndHour: 17, hoursPerDay: 8 }),
    clockHours: 10,
  },
  {
    // `hoursPerDay` is gelijk aan einde − begin (10), niet aan de blokken (9): de vergelijking moet
    // tegen de blokken gaan, zoals de lezer afleidt.
    label: 'gelijk aan de spanne, niet aan de blokken (07–12 + 13–17, 10 u/dag)',
    cal: hourCal('cal-spanne', 'Spanne', week(on(MA_VR, [{ start: 420, end: 720 }, { start: 780, end: 1020 }])),
      { workStartHour: 7, workEndHour: 17, hoursPerDay: 10 }),
    clockHours: 9,
  },
  {
    label: 'gebroken getal (06–16, 7,6 u/dag)',
    cal: hourCal('cal-fractie', 'Fractie', week(on([1, 2, 3, 4, 5, 6], [{ start: 360, end: 960 }])),
      { workStartHour: 6, workEndHour: 16, hoursPerDay: 7.6 }),
    clockHours: 10,
  },
  {
    label: 'gelijk aan de klokuren (07–15, 8 u/dag)',
    cal: hourCal('cal-gelijk', 'Gelijk', week(on(MA_VR, [{ start: 420, end: 900 }])),
      { workStartHour: 7, workEndHour: 15, hoursPerDay: 8 }),
    clockHours: 8,
  },
];

export const deviates = (c: UrenCase): boolean => c.cal.hoursPerDay !== c.clockHours;

/** Urentaak van 40 werkuren op `cal`, met de dagwaarde zoals de XER-lezer hem zet (uren / hoursPerDay). */
function hourTask(id: string, name: string, cal: WorkCalendar, calendarId: string | undefined): Task {
  const time = createDefaultTaskTime('2026-06-01T07:00', 40, 'hours', cal);
  time.durationMinutes = 2400;
  time.scheduleDuration = 2400 / (cal.hoursPerDay * 60);
  return {
    id, name, description: '', wbsCode: id, taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
    isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [],
    ...(calendarId ? { calendarId } : {}),
    time,
  } as Task;
}

/** Project: de eerste kalender is de projectkalender, de rest de bibliotheek; per kalender één urentaak
 *  van 40 u, plus een dagtaak van 5 d op de projectkalender. */
export function buildProject(): ImportResult {
  const [first, ...rest] = CASES.map((c) => c.cal);
  const project = { ...createDefaultProject(), id: 'proj-urenperdag', calendarId: first.id, startDate: '2026-06-01' };
  const tasks: Task[] = [
    hourTask('t-late', 'Urentaak Late ploeg', first, undefined),
    ...rest.map((cal) => hourTask(`t-${cal.id.slice(4)}`, `Urentaak ${cal.name}`, cal, cal.id)),
  ];
  // Datums met kloktijd, zoals de XER-lezer ze op een uurkalender zet (een kale datum krijgt na IFC
  // `T07:00`; dat staat los van de uren per dag).
  const dayTime = createDefaultTaskTime('2026-06-01', 5, 'days');
  dayTime.scheduleStart = '2026-06-01T07:00';
  dayTime.scheduleFinish = '2026-06-05T07:00';
  tasks.push({
    id: 't-dag', name: 'Dagtaak Late ploeg', description: '', wbsCode: 't-dag', taskType: 'CONSTRUCTION',
    status: 'NOT_STARTED', isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [],
    time: dayTime,
  } as Task);
  return { project, calendar: first, resourceCalendars: rest, tasks, sequences: [], resources: [], assignments: [] };
}
