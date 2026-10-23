// Verricht resourcewerk blijft een feit bij een regel- en inzetwijziging, ook bij de latere
// voortgangsboeking. Echte store-acties; de fixture zet alleen geïmporteerde actuals/contouren.
import './domStub';
import { createAppStore } from '@/state/appStore';
import { assignmentDayUnits } from '@/engine/scheduler/ResourceLoad';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import type { TimephasedContourPeriod } from '@/types/task';

let checks = 0;
const diffs: string[] = [];
function near(label: string, got: number | undefined, want: number): void {
  checks++;
  if (got === undefined || !(Math.abs(got - want) <= 1e-6)) diffs.push(`${label}: kreeg ${got}, verwachtte ${want}`);
}
function ok(label: string, value: boolean): void {
  checks++;
  if (!value) diffs.push(label);
}

for (const sample of [
  { id: 'h50', days: 4, completion: 0.5 },
  { id: 'h32', days: 5, completion: 0.32 },
  // De urenmaat levert nu al de exacte 32%-rest van B3; dageninvoer wordt in F3c aangesloten.
  { id: 'h32-exact', days: 5, completion: 0.32, hours: true },
  { id: 'expliciet-nul', days: 4, completion: 0.5, actual: 0 },
  { id: 'expliciet', days: 4, completion: 0.5, actual: 321.5 },
  { id: 'contour', days: 4, completion: 0.5, contour: true },
  { id: 'beide', days: 4, completion: 0.5, actual: 321.5, contour: true },
]) {
  const store = createAppStore();
  const S = () => store.getState();
  S().setProject({ startDate: '2026-06-01', statusDate: '2026-06-10' });
  const id = S().addTask({ name: sample.id, time: createDefaultTaskTime('2026-06-01', sample.hours ? sample.days * 8 : sample.days, sample.hours ? 'hours' : 'days', S().calendar) });
  const rid = S().addResource({ name: 'Ploeg', description: '', type: 'LABOR', maxUnits: 1 });
  S().assignResource(id, rid, 1);
  const task = () => S().tasks.find(t => t.id === id)!;
  const assignment = () => S().assignments.find(a => a.taskId === id)!;
  ok(`${sample.id}: geen verricht werk vóór de start`, assignment().actualWorkMinutes === undefined);
  S().runCPM();
  ok(`${sample.id}: voortgang geaccepteerd`, S().setTaskProgress(id, sample.completion));
  const periods: TimephasedContourPeriod[] = [
    { kind: 'actual', afterMinutes: 0, minutes: 480, workMinutes: 250.25 },
    { kind: 'remaining', afterMinutes: 480, minutes: 1440, workMinutes: 960 },
  ];
  store.setState(s => {
    if (sample.actual !== undefined) s.assignments.find(a => a.taskId === id)!.actualWorkMinutes = sample.actual;
    if (sample.contour) s.tasks.find(t => t.id === id)!.timephasedContours = [{ resourceUid: null, resourceId: rid, periods }];
  });
  const actualPeriods = () => JSON.stringify(task().timephasedContours?.flatMap(c => c.periods.filter(p => p.kind === 'actual')) ?? []);
  const originalActualPeriods = actualPeriods();
  const before = task().time;
  const done = sample.actual ?? (sample.contour ? 250.25 : (sample.days - before.remainingTime!) * 480);
  const work = before.remainingTime! * 480;
  if (sample.hours) near(`${sample.id}: 32 % is exact 768 minuten verricht`, done, 768);
  S().setTaskWorkRule(id, 'FIXED_WORK');
  const restWork = assignment().remainingWorkMinutes!;
  near(`${sample.id}: restwerk bij de regelwissel`, restWork, work);
  ok(`${sample.id}: urenmaat na vast werk`, task().time.durationUnit === 'hours');
  S().updateAssignment(assignment().id, { unitsPerDay: 7 });
  near(`${sample.id}: verricht met de oude inzet vastgelegd`, assignment().actualWorkMinutes, done);
  near(`${sample.id}: restwerk blijft staan`, assignment().remainingWorkMinutes, restWork);
  ok(`${sample.id}: actual-contourperiodes na inzetwijziging behouden`, actualPeriods() === originalActualPeriods);
  if (!sample.contour) near(`${sample.id}: belasting behoudt het totale werk`, assignmentDayUnits(task(), assignment(), 480).reduce((a, b) => a + b, 0) * 480, done + restWork);
  ok(`${sample.id}: voltooien geaccepteerd`, S().setTaskProgress(id, 1));
  near(`${sample.id}: later geboekt verricht werk`, assignment().actualWorkMinutes, done + restWork);
  if (sample.actual === undefined && !sample.contour) near(`${sample.id}: oorspronkelijke ${sample.days * 480} minuten voltooid`, assignment().actualWorkMinutes, sample.days * 480);
  near(`${sample.id}: geen restwerk na voltooien`, assignment().remainingWorkMinutes, 0);
  ok(`${sample.id}: actual-contourperiodes ook na voltooien behouden`, actualPeriods() === originalActualPeriods);
}

console.log(`${checks} checks, ${diffs.length} afwijkingen`);
for (const d of diffs) console.log(`XX ${d}`);
process.exit(diffs.length ? 1 : 0);
