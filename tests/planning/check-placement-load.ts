// F3b: vaste plaatsingen zijn het orakel; de solver bepaalt geen verwachte dagverdeling.
import { CalendarEngine } from '@/engine/scheduler/CalendarEngine';
import { workPlacement } from '@/engine/scheduler/workPlacement';
import { assignmentPlacementLoad, computeResourceLoad, computeHistogramReport } from '@/engine/scheduler/ResourceLoad';
import { createLevelingPlacementCache, levelResources } from '@/engine/scheduler/ResourceLeveler';
import { exceedsCapacity } from '@/engine/scheduler/capacityTolerance';
import { parseInstant } from '@/utils/dateUtils';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import { makeBands } from '@/utils/effectiveWorkTime';
import { legacyCpmOptions } from './legacySolveOptions';
import type { Task } from '@/types/task';
import type { ResourceAssignment } from '@/types/resource';
import type { WorkCalendar } from '@/types/calendar';
import type { CPMResult } from '@/engine/scheduler/CPMSolver';

const calendar: WorkCalendar = {
  id: 'plaatsing', name: 'plaatsing', description: '', workDays: [1, 2, 3, 4, 5],
  workStartHour: 8, workEndHour: 16, hoursPerDay: 8, holidays: [],
  workTime: makeBands([1, 2, 3, 4, 5], [{ start: 480, end: 960 }]),
};
const shortFriday: WorkCalendar = { ...calendar, workStartHour: 7, workEndHour: 15, workTime: {
  byWeekday: { ...makeBands([1, 2, 3, 4, 5], [{ start: 420, end: 900 }]).byWeekday, 5: [{ start: 420, end: 780 }] },
} };
const engine = new CalendarEngine(calendar);
const shortEngine = new CalendarEngine(shortFriday);
let checks = 0;
const failures: string[] = [];
function eq(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${label}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
}
function rounded(values: readonly number[]): number[] { return values.map(n => Math.round(n * 1e9) / 1e9); }
function task(start: string, finish: string, duration = 3): Task {
  return {
    id: 'taak', name: 'taak', description: '', wbsCode: '1', taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
    isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: ['r'],
    time: { ...createDefaultTaskTime(start, duration), durationType: 'WORKTIME', durationUnit: 'hours',
      scheduleDuration: duration, durationMinutes: duration * 480, scheduleStart: start, scheduleFinish: finish,
      earlyStart: start, earlyFinish: finish, lateStart: start, lateFinish: finish },
  };
}
const resource = { id: 'r', name: 'r', type: 'LABOR' as const, description: '', maxUnits: 1 };
const assignment: ResourceAssignment = { id: 'a', taskId: 'taak', resourceId: 'r', unitsPerDay: 1 };
const base = task('2026-06-03T12:00', '2026-06-08T12:00');
const placement = { start: parseInstant(base.time.earlyStart), finish: parseInstant(base.time.earlyFinish), measure: 'minutes' as const };
const expectedDays = ['2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08'];
const result = assignmentPlacementLoad(base, assignment, engine, placement);
eq('deeldagen: werkdagen', result.days.map(d => d.iso), expectedDays);
eq('deeldagen: aandelen', rounded(result.units), [0.5, 1, 1, 0.5]);
eq('histogram: zelfde verdeling', rounded(Object.values(computeResourceLoad([resource], [assignment], [base], calendar, []).load.r)), [0.5, 1, 1, 0.5]);
const histogram = computeHistogramReport({ tasks: [base], assignments: [assignment], resources: [resource],
  calendar, calendars: [], sequences: [], cpmResult: null, bucket: 'dag' });
eq('rapport: dezelfde belaste dagen', histogram.resources[0].buckets.filter(b => b.load > 0).map(b => b.start), expectedDays);
eq('rapport: dezelfde belasting', rounded(histogram.resources[0].buckets.filter(b => b.load > 0).map(b => b.load)), [0.5, 1, 1, 0.5]);

const friday = task('2026-06-05T07:00', '2026-06-08T09:00', 1);
const cache = createLevelingPlacementCache([assignment], () => shortEngine);
const fridayDemand = cache.at(friday, parseInstant('2026-06-05T07:00'));
const mondayDemand = cache.at(friday, parseInstant('2026-06-08T07:00'));
eq('korte vrijdag: 6 + 2 uur', rounded(fridayDemand.byResource.get('r')!), [0.75, 0.25]);
eq('maandag: vraag opnieuw berekend', rounded(mondayDemand.byResource.get('r')!), [1]);
eq('maandag met vaste 0,25: geweigerd', exceedsCapacity(0.25 + mondayDemand.byResource.get('r')![0], 1), true);
const noon = cache.at(friday, parseInstant('2026-06-08T11:00'));
eq('cache onderscheidt startmomenten op dezelfde datum', rounded(noon.byResource.get('r')!), [0.5, 0.5]);
eq('cache hergebruikt dezelfde kandidaatuitkomst', cache.at(friday, parseInstant('2026-06-08T07:00')) === mondayDemand, true);

// De opgeslagen taak blijft 'days'; alleen het door de aanroeper opgeloste maatbeleid verschilt.
const dayTask = { ...friday, time: { ...friday.time, durationUnit: 'days' as const } };
const dayCache = createLevelingPlacementCache([assignment], () => shortEngine, { taak: 'workdays' });
eq('effectieve dagenmaat: vrijdag één dag', rounded(dayCache.at(dayTask, parseInstant('2026-06-05T07:00')).byResource.get('r')!), [1]);
eq('effectieve minutenmaat bij dezelfde dagtaak', rounded(cache.at(dayTask, parseInstant('2026-06-05T07:00')).byResource.get('r')!), [0.75, 0.25]);
eq('profieltoepassing herschrijft de taak niet', dayTask.time.durationUnit, 'days');

const split = { ...base, splitGaps: [{ afterMinutes: 120, gapMinutes: 240 }, { afterMinutes: 600, gapMinutes: 120 }] };
const splitPlacement = { ...placement, gaps: split.splitGaps };
eq('splits: twee gaten op cumulatieve minutenas', rounded(assignmentPlacementLoad(split, assignment, engine, splitPlacement).units), [0.25, 0.5, 1, 0.5]);
const splitCache = createLevelingPlacementCache([assignment], () => engine);
eq('splitkandidaat: geen afronding naar dagslots', rounded(splitCache.at(split, placement.start).byResource.get('r')!), [0.25, 0.5, 1, 1, 0.25]);

const contour = { resourceId: 'r', resourceUid: null, periods: [
  { afterMinutes: 0, minutes: 480, workMinutes: 240, kind: 'remaining' as const },
  { afterMinutes: 480, minutes: 960, workMinutes: 960, kind: 'remaining' as const },
] };
eq('contour: echte overlap met deeldagen', rounded(assignmentPlacementLoad(base, assignment, engine, placement, contour).units), [0.25, 0.75, 1, 0.5]);
const stored = { ...assignment, remainingWorkMinutes: 720 };
eq('opgeslagen werk: totaal 12 uur blijft behouden', rounded(assignmentPlacementLoad(base, stored, engine, placement).units), [0.25, 0.5, 0.5, 0.25]);
eq('curve: bestaande FRONT_LOADED-slots gewogen naar overlap', rounded(assignmentPlacementLoad(base, { ...assignment, curve: 'FRONT_LOADED' }, engine, placement).units), [1, 1.5, 0.5, 0]);
const curveValues = { ...assignment, curveValues: [0, ...Array<number>(10).fill(2), ...Array<number>(10).fill(1)] };
eq('exacte curve: werkbehoud', rounded([assignmentPlacementLoad(base, curveValues, engine, placement).units.reduce((a, b) => a + b, 0)]), [3]);

const nightCalendar = { ...calendar, workTime: makeBands([1, 2, 3, 4, 5], [{ start: 1320, end: 1800 }]) };
const night = workPlacement(new CalendarEngine(nightCalendar), {
  start: parseInstant('2026-06-04T00:00'), finish: parseInstant('2026-06-04T04:00'), measure: 'workdays',
});
eq('nachtblok hoort bij zijn startdag', night.days.map(d => d.iso), ['2026-06-03']);
eq('nachtblok: deel van de hele shift', rounded(night.days.map(d => d.share)), [0.5]);
eq('exclusief einde boekt geen volgende dag', workPlacement(engine, {
  start: parseInstant('2026-06-01T08:00'), finish: parseInstant('2026-06-02T08:00'), measure: 'minutes',
}).days.map(d => d.iso), ['2026-06-01']);

// De motor mag intern oplossen; de verwachte plaatsing en belasting liggen hierboven al vast.
const fixedFriday = { ...friday, id: 'vrijdag', priority: 1000 };
const fixedMonday = { ...task('2026-06-08T07:00', '2026-06-08T09:00', 0.25), id: 'maandag', priority: 1000 };
const assignments = [assignment, { ...assignment, id: 'vast-vr', taskId: 'vrijdag' }, { ...assignment, id: 'vast-ma', taskId: 'maandag' }];
const booked: Record<string, number> = {};
const cpm: CPMResult = {
  tasks: new Map(), criticalPath: [], drivingSequenceIds: [], sequenceFreeFloat: {},
  truncatedLeadSequenceIds: [], violatedConstraintTaskIds: [], missedDeadlineTaskIds: [],
  outOfSequenceSequenceIds: [], nearCriticalTaskIds: [], criticalPaths: [], floatPathByTask: {},
  hammockNoFinishDriverTaskIds: [], projectEnd: '2026-06-08T10:00', projectDuration: 0,
};
const leveled = levelResources([fixedFriday, fixedMonday, friday], [], [resource], assignments, shortFriday, [], cpm, {
  constrainToFloat: false, scopeTaskIds: ['taak'], poolLedger: {
    horizonIso: null, poolItemOf: () => 'pool', residualOn: () => 100,
    book: (_id, iso, units) => { booked[iso] = (booked[iso] ?? 0) + units; },
  },
}, legacyCpmOptions());
eq('nivelleerder: maandag afgewezen, dinsdag gekozen', leveled.shifts.taak?.newStart, '2026-06-09T07:00');
const applied = task('2026-06-09T07:00', '2026-06-09T15:00', 1);
const appliedLoad = computeResourceLoad([resource], assignments, [fixedFriday, fixedMonday, applied], shortFriday, []);
eq('na toepassen: grootboek is gelijk aan histogram', rounded(Object.keys(booked).sort().map(d => booked[d])),
  rounded(Object.keys(booked).sort().map(d => appliedLoad.load.r[d] ?? 0)));

// De gekozen vrijdag heeft een ANDERE verdeling dan de oorspronkelijke maandag. Daardoor
// vangt dit een boeking met de oude taakvraag, ook wanneer de capaciteitstoets al goed rekent.
const mondayTask = task('2026-06-01T07:00', '2026-06-01T15:00', 1);
const fourDays = { ...task('2026-06-01T07:00', '2026-06-04T15:00', 4), id: 'vast' };
const weekAssignments = [assignment, { ...assignment, id: 'vast', taskId: 'vast' }];
const weekBooked: Record<string, number> = {};
const week = levelResources([fourDays, mondayTask], [], [resource], weekAssignments, shortFriday, [], cpm, {
  constrainToFloat: false, scopeTaskIds: ['taak'], poolLedger: {
    horizonIso: null, poolItemOf: () => 'pool', residualOn: () => 100,
    book: (_id, iso, units) => { weekBooked[iso] = (weekBooked[iso] ?? 0) + units; },
  },
}, legacyCpmOptions());
eq('geplaatste vrijdag: kandidaatverdeling geboekt', rounded([weekBooked['2026-06-05'], weekBooked['2026-06-08']]), [0.75, 0.25]);
eq('geplaatste vrijdag: start ligt vast', week.shifts.taak?.newStart, '2026-06-05T07:00');
const fridayApplied = { ...mondayTask, time: { ...mondayTask.time, earlyStart: '2026-06-05T07:00', earlyFinish: '2026-06-08T09:00' } };
const weekLoad = computeResourceLoad([resource], weekAssignments, [fourDays, fridayApplied], shortFriday, []);
eq('geplaatste vrijdag: boeking en histogram gelijk', rounded(Object.keys(weekBooked).sort().map(d => weekBooked[d])),
  rounded(Object.keys(weekBooked).sort().map(d => weekLoad.load.r[d] ?? 0)));

// Een bindend venster dwingt de split-terugval af: ma/wo werken, dinsdag bezet. De verwachte
// pauze is 480 minuten op de cumulatieve as, geen van de verwachte waarden komt uit een solve.
const twoDays = task('2026-06-01T08:00', '2026-06-02T16:00', 2);
const fixedTuesday = { ...task('2026-06-02T08:00', '2026-06-02T16:00', 1), id: 'dinsdag' };
const splitAssignments = [assignment, { ...assignment, id: 'dinsdag', taskId: 'dinsdag' }];
const scatterBooked: Record<string, number> = {};
const scatter = levelResources([fixedTuesday, twoDays], [], [resource], splitAssignments, calendar, [], cpm, {
  constrainToFloat: false, overrunCeilingDays: 1, allowSplits: true, scopeTaskIds: ['taak'],
  poolLedger: { horizonIso: null, poolItemOf: () => 'pool', residualOn: () => 100,
    book: (_id, iso, units) => { scatterBooked[iso] = (scatterBooked[iso] ?? 0) + units; } },
}, legacyCpmOptions());
eq('onderbrekingspad: dinsdag overgeslagen', scatter.gaps.taak, [{ afterMinutes: 480, gapMinutes: 480, source: 'leveling' }]);
eq('onderbrekingspad: geen onopgelost conflict', scatter.unresolved, {});
eq('onderbrekingspad: werk op maandag en woensdag', rounded([scatterBooked['2026-06-01'], scatterBooked['2026-06-03']]), [1, 1]);

for (const failure of failures) console.error(`XX ${failure}`);
console.log(`Plaatsingsbelasting: ${checks} checks, ${failures.length} afwijkingen`);
process.exit(failures.length ? 1 : 0);
