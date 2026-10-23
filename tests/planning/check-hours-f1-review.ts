// PR #563, reviewronde 1: ingevoerde feiten, relatieondergrenzen en mijlpaalkanten behouden.
import './domStub';
import { createAppStoreContext } from '@/state/appStore';
import { createTaskDialogSave, draftWithActualStart, draftWithActualFinish } from '@/state/taskDialogSave';
import { planProgressEntry } from '@/engine/progressEntry';
import { progress } from '@/state/mcpValidation';
import { makeBands } from '@/utils/effectiveWorkTime';
import type { CellEditIntent } from '@/types/taskGrid';
import type { Task } from '@/types/task';

let checks = 0;
const failures: string[] = [];
function eq(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
}
function fixture(start = 480, end = 960) {
  const context = createAppStoreContext();
  const S = () => context.store.getState();
  const calendar = { ...S().calendar, id: 'f1-review', workDays: [1, 2, 3, 4, 5], holidays: [],
    hoursPerDay: (end - start) / 60, workStartHour: start / 60, workEndHour: end / 60,
    workTime: makeBands([1, 2, 3, 4, 5], [{ start, end }]),
  };
  S().setCalendar(calendar);
  S().setProject({ startDate: '2026-06-01', statusDate: '2026-06-03' });
  const id = S().addTask({ name: 'F1 review', time: {
    scheduleStart: '2026-06-01T08:00', scheduleDuration: 1,
    durationUnit: 'hours', durationMinutes: 480, durationType: 'WORKTIME',
  } as Task['time'] });
  const task = () => S().tasks.find(t => t.id === id)!;
  const cell = (field: string, value: unknown): CellEditIntent => ({
    kind: 'cell-edit', taskId: id, columnId: field as CellEditIntent['columnId'], route: 'task-progress', value,
  });
  const draft = () => structuredClone({ tasks: S().tasks, sequences: [], assignments: [], resources: [],
    calendars: S().calendars, calendar: S().calendar, project: S().project });
  return { context, S, id, task, calendar, cell, draft };
}

// Punt 1: 100% mag een al vastgelegde start op de statusdag niet naar middernacht terugzetten.
for (const route of ['paneel', 'dialoog', 'raster', 'plakken', 'import', 'MCP'] as const) {
  const f = fixture();
  f.S().updateTask(f.id, { status: 'STARTED', time: {
    ...f.task().time, completion: 0.5, actualStart: '2026-06-03T10:00',
  } });
  let actual = f.task();
  if (route === 'paneel') f.S().setTaskProgress(f.id, 1);
  else if (route === 'dialoog') {
    const plan = planProgressEntry(f.task(), { field: 'completion', value: 1 },
      { statusDate: '2026-06-03', today: '2026-06-03', calendar: f.calendar });
    eq('P1 dialoog: concept toegestaan', plan.ok && !!plan.change, true);
    if (plan.ok && plan.change) eq('P1 dialoog: opgeslagen', createTaskDialogSave(f.context)({
      editingTaskId: f.id, draft: plan.change.task, startDate: f.task().time.scheduleStart,
    }), true);
  } else if (route === 'MCP') {
    const draft = f.draft();
    eq('P1 MCP: toegestaan', progress.applyProgressUpdate(draft, f.id, { completion: 100 }, '2026-06-03').applied, true);
    actual = draft.tasks[0];
  } else if (route === 'import') {
    eq('P1 import: toegepast', f.S().applyProgressImport([
      { rowNumber: 2, taskId: f.id, completion: { kind: 'value', value: 1 } },
    ]).appliedCount, 1);
  } else {
    const edit = f.cell('task.time.completion', 1);
    eq('P1 ' + route + ': toegestaan', f.S().runGridMutation(route === 'plakken'
      ? [{ kind: 'paste', writes: [edit] }] : [edit]).ok, true);
  }
  if (route !== 'MCP') actual = f.task();
  eq('P1 ' + route + ': start blijft 10:00', actual.time.actualStart, '2026-06-03T10:00');
  eq('P1 ' + route + ': einde D6', actual.time.actualFinish, '2026-06-03T16:00');
  eq('P1 ' + route + ': voltooid', [actual.time.completion, actual.status], [1, 'COMPLETED']);
}

// Punt 2: de equivalentie van twee blokgrenzen geldt niet voor een willekeurig moment ertussen.
for (const profile of ['ops', 'p6', 'msproject'] as const) {
  for (const [lagMinutes, lagUnit, finish] of [
    [120, 'ELAPSEDTIME', '2026-07-07T08:00'],
    [480, 'WORKTIME', '2026-07-07T16:00'],
    [4320, 'ELAPSEDTIME', '2026-07-09T16:00'],
  ] as const) {
    const f = fixture();
    f.S().setProject({ startDate: '2026-07-06', statusDate: undefined,
      schedulingProfile: { id: profile, baseId: profile, name: '', overrides: {} } });
    f.S().updateTask(f.id, { time: { ...f.task().time, scheduleStart: '2026-07-06T08:00' } });
    const milestone = f.S().addTask({ name: 'Eindmijlpaal', isMilestone: true, milestoneKind: 'FINISH' });
    f.S().addSequence({ predecessorId: f.id, successorId: milestone, type: 'FINISH_START',
      lagDays: 0, lagMinutes, lagUnit });
    f.S().runCPM();
    const m = f.S().tasks.find(t => t.id === milestone)!;
    const label = `P2 ${profile} ${lagMinutes} ${lagUnit}`;
    eq(label + ': voorganger eindigt ma 16:00', f.task().time.earlyFinish, '2026-07-06T16:00');
    eq(label + ': mijlpaal', [m.time.earlyStart, m.time.earlyFinish], [finish, finish]);
    eq(label + ': speling voorganger', f.task().time.totalFloat, 0);
  }
  // De opvolger is dinsdag vrij en werkt 09–17; ma 16:00 is geen equivalent van di 08:00.
  const f = fixture();
  const successorCalendar = { ...f.calendar, id: 'opvolger', holidays: [
    { name: 'Vrije dinsdag', startDate: '2026-07-07', endDate: '2026-07-07' },
  ],
    workTime: makeBands([1, 2, 3, 4, 5], [{ start: 540, end: 1020 }]) };
  f.context.store.setState(s => { s.calendars.push(successorCalendar); });
  f.S().setProject({ startDate: '2026-07-06', statusDate: undefined,
    schedulingProfile: { id: profile, baseId: profile, name: '', overrides: {} } });
  f.S().updateTask(f.id, { time: { ...f.task().time, scheduleStart: '2026-07-06T08:00',
    scheduleDuration: 3, durationMinutes: 1440 } });
  const milestone = f.S().addTask({ name: 'Eindmijlpaal eigen kalender', calendarId: 'opvolger',
    isMilestone: true, milestoneKind: 'FINISH' });
  f.S().addSequence({ predecessorId: f.id, successorId: milestone, type: 'FINISH_START',
    lagDays: 0, lagMinutes: -960, lagUnit: 'WORKTIME' });
  f.S().runCPM();
  eq(`P2 ${profile}: negatieve lag bewaart ondergrens di 08:00`,
    f.S().tasks.find(t => t.id === milestone)!.time.earlyStart, '2026-07-08T09:00');
}

// Punt 3: status, percentage en duur volgen hetzelfde afleidingspunt, bij invoer én plakken.
for (const route of ['raster', 'plakken', 'plakken-met-naam']) for (const [field, value] of [
  ['task.status', 'COMPLETED'], ['task.time.completion', 1],
  ['task.time.actualDuration', 480], ['task.time.remainingTime', 0],
] as const) {
  const f = fixture();
  f.S().updateTask(f.id, { status: 'STARTED', time: {
    ...f.task().time, actualStart: '2026-06-02T10:00', completion: 0.5,
  } });
  const edit = f.cell(field, value);
  const label = `P3 ${route} ${field}`;
  const writes = route === 'plakken-met-naam'
    ? [edit, { ...f.cell('task.name', 'Voortgang geplakt'), route: 'task-field' as const }]
    : [edit];
  eq(label + ': toegestaan', f.S().runGridMutation(route === 'raster'
    ? [edit] : [{ kind: 'paste', writes }]).ok, true);
  eq(label + ': actuals', [f.task().time.actualStart, f.task().time.actualFinish],
    ['2026-06-02T10:00', '2026-06-03T16:00']);
  eq(label + ': voltooid', [f.task().status, f.task().time.completion], ['COMPLETED', 1]);
}

// Punt 4: beide velden van een FINISH-mijlpaal horen bij dezelfde werkdag, ook over middernacht.
for (const [start, end, moment] of [
  [1320, 1800, '2026-06-04T06:00'], [0, 1440, '2026-06-04T00:00'],
] as const) for (const route of ['MCP', 'plakken', 'paneel', 'dialoog', 'dialoogvelden'] as const) {
  const f = fixture(start, end);
  f.S().updateTask(f.id, { isMilestone: true, milestoneKind: 'FINISH', time: {
    ...f.task().time, scheduleDuration: 0, durationMinutes: 0,
  } });
  const label = `P4 ${route} ${start}–${end}`;
  let actual = f.task();
  if (route === 'MCP') {
    const draft = f.draft();
    eq(label + ': toegestaan', progress.applyProgressUpdate(draft, f.id,
      { actualStart: '2026-06-03', actualFinish: '2026-06-03' }, '2026-06-03').applied, true);
    actual = draft.tasks[0];
  } else if (route === 'plakken') {
    eq(label + ': toegestaan', f.S().runGridMutation([{ kind: 'paste', writes: [
      f.cell('task.time.actualStart', '2026-06-03'), f.cell('task.time.actualFinish', '2026-06-03'),
    ] }]).ok, true);
  } else if (route === 'paneel') {
    eq(label + ': start toegestaan', f.S().setActualStart(f.id, '2026-06-03'), true);
    eq(label + ': einde toegestaan', f.S().setActualFinish(f.id, '2026-06-03'), true);
  } else if (route === 'dialoogvelden') {
    const started = draftWithActualStart(f.task(), '2026-06-03', '2026-06-03', f.calendar);
    eq(label + ': start toegestaan', started !== null, true);
    const draft = started && draftWithActualFinish(started, '2026-06-03', '2026-06-03', f.calendar);
    eq(label + ': einde toegestaan', !!draft, true);
    eq(label + ': opgeslagen', !!draft && createTaskDialogSave(f.context)({ editingTaskId: f.id, draft,
      startDate: f.task().time.scheduleStart }), true);
  } else {
    let draft = f.task();
    for (const field of ['actualStart', 'actualFinish'] as const) {
      const plan = planProgressEntry(draft, { field, value: '2026-06-03' },
        { statusDate: '2026-06-03', today: '2026-06-03', calendar: f.calendar });
      eq(label + ': ' + field + ' toegestaan', plan.ok, true);
      if (plan.ok && plan.change) draft = plan.change.task;
    }
    eq(label + ': opgeslagen', createTaskDialogSave(f.context)({ editingTaskId: f.id, draft,
      startDate: f.task().time.scheduleStart }), true);
  }
  if (route !== 'MCP') actual = f.task();
  eq(label + ': één eindmoment', [actual.time.actualStart, actual.time.actualFinish], [moment, moment]);
}

for (const failure of failures) console.log('XX ' + failure);
console.log(`F1 reviewronde 1: ${checks} controles, ${failures.length} fouten`);
if (failures.length) process.exit(1);
