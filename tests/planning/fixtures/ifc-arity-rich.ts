// Het RIJKE project voor de IFC-ariteitstoetsen (issue #292): een ingelezen voorbeeldproject, aangevuld
// met alles wat de writer kan schrijven. Gebruikt door `check-ifc-arity.ts` (elke entiteit die de writer
// kan schrijven komt hier minstens één keer voor) en, eenmalig, om met de writer van vóór de fix de
// fixture `ifc-arity-oude-writer.ifc` te maken (`check-ifc-legacy-arity.ts`).
//
// Alleen type-imports en geen klok of toeval: hetzelfde basisproject geeft altijd hetzelfde resultaat,
// ook gebundeld tegen een oudere `src/` (zo is de oude fixture gemaakt).
import type { ImportResult } from '@/services/importTypes';
import type { WriteIFCInput } from '@/services/ifc/ifcWriter';
import type { Task } from '@/types/task';
import type { WorkCalendar } from '@/types/calendar';
import type { Resource, ResourceAssignment } from '@/types/resource';
import type { Sequence } from '@/types/sequence';

/** De kalenders die het rijke project toevoegt (id's), voor de toetsen. */
export const RICH_CALENDAR_IDS = {
  twoShift: 'cal-rich-tweeploegen',
  night: 'cal-rich-nacht',
  unused: 'cal-rich-eigen',
} as const;

const WEEK_6_TO_22 = { start: 360, end: 840 };
const WEEK_14_TO_22 = { start: 840, end: 1320 };

export function buildRichIfcProject(base: ImportResult): WriteIFCInput {
  const r = structuredClone(base) as ImportResult;
  const leaves = r.tasks.filter(t => t.childIds.length === 0 && !t.isMilestone);
  if (leaves.length < 8) throw new Error(`rijk project: te weinig bladtaken in het basisproject (${leaves.length})`);
  const leaf = (i: number): Task => leaves[i];

  // ── Kalenders ────────────────────────────────────────────────────────────────────────────────
  // Projectkalender: een werkende uitzondering mét banden (DAILY-recurrence in ExceptionTimes).
  r.calendar.workingExceptions = [
    { name: 'Inhaalzaterdag', startDate: '2027-06-12', endDate: '2027-06-12', bands: [{ start: 420, end: 720 }] },
  ];
  const day = (id: string, name: string, shift: WorkCalendar['shift']): WorkCalendar => ({
    id, name, description: `${name} (rijk testproject)`,
    workDays: [1, 2, 3, 4, 5], workStartHour: 7, workEndHour: 16, hoursPerDay: 8,
    holidays: [{ name: 'Kerst', startDate: '2027-12-25', endDate: '2027-12-26' }],
    ...(shift ? { shift } : {}),
  });
  const twoShift: WorkCalendar = {
    ...day(RICH_CALENDAR_IDS.twoShift, 'Tweeploegen', 'SECOND'),
    workStartHour: 6, workEndHour: 22, hoursPerDay: 16,
    workTime: {
      byWeekday: {
        1: [WEEK_6_TO_22, WEEK_14_TO_22], 2: [WEEK_6_TO_22, WEEK_14_TO_22], 3: [WEEK_6_TO_22, WEEK_14_TO_22],
        4: [WEEK_6_TO_22, WEEK_14_TO_22], 5: [WEEK_6_TO_22, WEEK_14_TO_22], 6: [], 7: [],
      },
    },
    workingExceptions: [
      { name: 'Zaterdagdienst', startDate: '2027-06-19', endDate: '2027-06-19', bands: [{ start: 420, end: 900 }] },
    ],
  };
  const night = day(RICH_CALENDAR_IDS.night, 'Nachtploeg', 'THIRD');
  const unused = day(RICH_CALENDAR_IDS.unused, 'Eigen rooster', 'USERDEFINED');
  r.resourceCalendars = [...(r.resourceCalendars ?? []), twoShift, night, unused];

  // ── Resources: alle vijf soorten, ploeg met leden, kalender, capaciteitsstap, bibliotheekstempel ──
  const extra: Resource[] = [
    {
      id: 'res-rich-kraan', name: 'Torenkraan', type: 'EQUIPMENT', description: 'Kraan met capaciteitsstap',
      maxUnits: 1, costPerHour: 85.5, unitOfMeasure: 'h', color: '#aa5500', calendarId: RICH_CALENDAR_IDS.twoShift,
      availabilitySteps: [{ from: '2027-06-01', maxUnits: 2 }],
    },
    {
      id: 'res-rich-beton', name: 'Beton C30/37', type: 'MATERIAL', description: 'Betonlevering',
      maxUnits: 40, costPerHour: 120, unitOfMeasure: 'm3',
    },
    {
      id: 'res-rich-installateur', name: 'Installateur BV', type: 'SUBCONTRACTOR', description: '',
      maxUnits: 1, costPerHour: 72.25,
      libraryOrigin: { companyId: 'bib-rich', libraryItemId: 'item-installateur', poolVersion: 3, syncedHash: 'h-rich' },
    },
    { id: 'res-rich-ploeg', name: 'Afbouwploeg', type: 'CREW', description: 'Ploeg met twee leden', maxUnits: 1 },
    {
      id: 'res-rich-stukadoor', name: 'Stukadoor (ploeg)', type: 'LABOR', description: '', maxUnits: 1,
      parentId: 'res-rich-ploeg', calendarId: RICH_CALENDAR_IDS.twoShift,
    },
    { id: 'res-rich-schilder', name: 'Schilder (ploeg)', type: 'LABOR', description: '', maxUnits: 2, parentId: 'res-rich-ploeg' },
  ];
  r.resources = [...r.resources, ...extra];

  // Toewijzingen met curves, timephased-venster en werkvelden.
  const assign = (id: string, task: Task, resourceId: string, more: Partial<ResourceAssignment> = {}): ResourceAssignment => {
    task.resourceIds = [...new Set([...task.resourceIds, resourceId])];
    return { id, taskId: task.id, resourceId, unitsPerDay: 1, ...more };
  };
  r.assignments = [
    ...r.assignments,
    assign('asg-rich-1', leaf(0), 'res-rich-kraan', { unitsPerDay: 0.5, curve: 'BELL' }),
    assign('asg-rich-2', leaf(1), 'res-rich-beton', {
      unitsPerDay: 12, curve: 'FRONT_LOADED', plannedWorkMinutes: 960, actualWorkMinutes: 480, remainingWorkMinutes: 480,
    }),
    assign('asg-rich-3', leaf(2), 'res-rich-installateur', {
      workWindowStart: leaf(2).time.scheduleStart, workWindowFinish: leaf(2).time.scheduleFinish,
    }),
    assign('asg-rich-4', leaf(3), 'res-rich-stukadoor', { curve: 'BACK_LOADED' }),
    assign('asg-rich-5', leaf(3), 'res-rich-schilder', { unitsPerDay: 2 }),
  ];

  // ── Structuur: eigen velden (alle zes soorten), activity codes, eigen taaktype ────────────────────
  r.customFieldDefs = [
    { id: 'cf-rich-tekst', name: 'Opmerking', type: 'text' },
    { id: 'cf-rich-getal', name: 'Factor', type: 'number' },
    { id: 'cf-rich-geheel', name: 'Aantal', type: 'integer' },
    { id: 'cf-rich-kosten', name: 'Budget', type: 'cost' },
    { id: 'cf-rich-datum', name: 'Keuringsdatum', type: 'date' },
    { id: 'cf-rich-vlag', name: 'Vergunning nodig', type: 'boolean' },
  ];
  leaf(0).customFields = {
    'cf-rich-tekst': 'Let op: "aanvoer" via achterom', 'cf-rich-getal': 6.5, 'cf-rich-geheel': 4,
    'cf-rich-kosten': 1250.75, 'cf-rich-datum': '2027-06-15', 'cf-rich-vlag': true,
  };
  leaf(1).customFields = { 'cf-rich-geheel': 2, 'cf-rich-vlag': false };
  r.activityCodeTypes = [{
    id: 'ac-rich-fase', name: 'Fase',
    values: [{ id: 'ac-rich-ruw', code: 'RUW', description: 'Ruwbouw', color: '#884400' }, { id: 'ac-rich-afb', code: 'AFB' }],
  }];
  leaf(0).activityCodes = { 'ac-rich-fase': 'ac-rich-ruw' };
  leaf(4).activityCodes = { 'ac-rich-fase': 'ac-rich-afb' };
  r.customTaskTypes = [{ id: 'ctt-rich-keuring', name: 'Keuring' }];
  leaf(5).customTaskTypeId = 'ctt-rich-keuring';
  leaf(5).taskType = 'USERDEFINED';

  // ── Taakeigenschappen: kalender, constraint, deadline, notities, kalenderwandeling ──────────────
  leaf(6).calendarId = RICH_CALENDAR_IDS.night;
  leaf(6).constraint = { type: 'SNET', date: leaf(6).time.scheduleStart };
  leaf(6).deadline = leaf(7).time.scheduleFinish;
  leaf(6).notes = [{ id: 'note-rich-1', text: 'Nachtwerk aanvragen', done: false }];
  leaf(0).timephasedDurationWalks = [
    { anchor: leaf(0).time.scheduleStart, resourceCalendarId: RICH_CALENDAR_IDS.twoShift, workMinutes: 480 },
  ];

  // ── Voortgang: twee taken klaar, één bezig, statusdatum ──────────────────────────────────────────
  for (const t of [leaf(0), leaf(1)]) {
    t.time.actualStart = t.time.scheduleStart;
    t.time.actualFinish = t.time.scheduleFinish;
    t.time.completion = 1;
    t.status = 'COMPLETED';
  }
  leaf(2).time.actualStart = leaf(2).time.scheduleStart;
  leaf(2).time.completion = 0.4;
  leaf(2).time.remainingTime = 2;
  leaf(2).status = 'STARTED';
  r.project.statusDate = leaf(2).time.scheduleStart;
  r.project.progressMode = 'PROGRESS_OVERRIDE';

  // ── Relaties: alle vier soorten en elke lag-vorm (dagen, lead, procent, minuten, verstreken tijd) ──
  const seq = (id: string, p: number, s: number, more: Partial<Sequence>): Sequence => ({
    id, predecessorId: leaf(p).id, successorId: leaf(s).id, type: 'FINISH_START', lagDays: 0, ...more,
  });
  r.sequences = [
    ...r.sequences,
    seq('seq-rich-sf', 2, 7, { type: 'START_FINISH' }),
    seq('seq-rich-procent', 3, 7, { lagPercent: 50 }),
    seq('seq-rich-minuten', 4, 7, { type: 'START_START', lagMinutes: 90 }),
    seq('seq-rich-verstreken', 5, 7, { type: 'FINISH_FINISH', lagDays: 2, lagUnit: 'ELAPSEDTIME' }),
    seq('seq-rich-lead', 6, 7, { lagDays: -1 }),
  ];

  // ── Baselines: twee (elk een eigen .BASELINE.-werkschema) ────────────────────────────────────────
  const first = r.baselines?.[0];
  if (!first) throw new Error('rijk project: het basisproject heeft geen baseline');
  r.baselines = [...(r.baselines ?? []), {
    ...structuredClone(first), id: 'bl-rich-herplanning', name: 'Herplanning', createdAt: '2027-05-20T10:00:00.000Z',
  }];
  r.activeBaselineId = 'bl-rich-herplanning';

  // ── Project: eigen rekenprofiel en -opties, herkomst ─────────────────────────────────────────────
  r.project.schedulingProfile = { baseId: 'msproject', id: 'msproject', name: '', overrides: {} };
  r.project.schedulingOptions = { ...(r.project.schedulingOptions ?? {}), nearCriticalThreshold: 2 };
  r.importPristine = true;

  return r;
}
