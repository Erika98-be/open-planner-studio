// PR #563, reviewrondes 1 en 2: ingevoerde feiten, relatieondergrenzen en mijlpaalkanten behouden.
import './domStub';
import { createAppStoreContext } from '@/state/appStore';
import { createTaskDialogSave, draftWithActualStart, draftWithActualFinish } from '@/state/taskDialogSave';
import { planProgressEntry } from '@/engine/progressEntry';
import { invalidDateReasons } from '@/engine/reports/dcmaAssessment';
import { normalizeImportedProgress } from '@/services/importNormalize';
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

// Punt 1: een aanwezige werkelijke start is een feit, ook ná het afgeleide blokeinde.
// D1/D6 beslissen alleen over datumloze invoer. Besluit orkestrator: het afgeleide einde wordt
// minstens die start. De statusdag en de taakkalender veranderen een vastgelegde start niet.
for (const [day, start, finish, ownCalendar] of [
  ['2026-06-03', '2026-06-03T10:00', '2026-06-03T16:00', false],
  ['2026-06-03', '2026-06-03T18:00', '2026-06-03T18:00', false],
  ['2026-06-06', '2026-06-06T18:00', '2026-06-06T18:00', false],
  ['2026-06-03', '2026-06-03T18:00', '2026-06-03T18:00', true],
] as const) for (const route of ['paneel', 'dialoog', 'rasterpercentage', 'statuskolom', 'plakken', 'import', 'MCP'] as const) {
  const f = fixture();
  let calendar = f.calendar;
  if (ownCalendar) {
    calendar = { ...calendar, id: 'eigen-09-17', hoursPerDay: 8, workStartHour: 9, workEndHour: 17,
      workTime: makeBands([1, 2, 3, 4, 5], [{ start: 540, end: 1020 }]) };
    f.context.store.setState(s => { s.calendars.push(calendar); });
    f.S().updateTask(f.id, { calendarId: calendar.id });
  }
  f.S().setProject({ statusDate: day });
  const label = `P1 ${route} ${start}${ownCalendar ? ' eigen 09–17' : ''}`;
  eq(label + ': start toegestaan', f.S().setActualStart(f.id, start), true);
  f.S().setTaskProgress(f.id, 0.5);
  eq(label + ': start vastgelegd', f.task().time.actualStart, start);
  let actual = f.task();
  if (route === 'paneel') eq(label + ': toegestaan', f.S().setTaskProgress(f.id, 1), true);
  else if (route === 'dialoog') {
    const plan = planProgressEntry(f.task(), { field: 'completion', value: 1 },
      { statusDate: day, today: day, calendar });
    eq(label + ': concept toegestaan', plan.ok && !!plan.change, true);
    if (plan.ok && plan.change) eq(label + ': opgeslagen', createTaskDialogSave(f.context)({
      editingTaskId: f.id, draft: plan.change.task, startDate: f.task().time.scheduleStart,
    }), true);
  } else if (route === 'MCP') {
    const draft = f.draft();
    eq(label + ': toegestaan', progress.applyProgressUpdate(draft, f.id, { completion: 100 }, day).applied, true);
    actual = draft.tasks[0];
  } else if (route === 'import') {
    eq(label + ': toegepast', f.S().applyProgressImport([
      { rowNumber: 2, taskId: f.id, completion: { kind: 'value', value: 1 } },
    ]).appliedCount, 1);
  } else {
    const edit = route === 'statuskolom' ? f.cell('task.status', 'COMPLETED') : f.cell('task.time.completion', 1);
    eq(label + ': toegestaan', f.S().runGridMutation(route === 'plakken'
      ? [{ kind: 'paste', writes: [edit] }] : [edit]).ok, true);
  }
  if (route !== 'MCP') actual = f.task();
  eq(label + ': vastgelegde start blijft staan', actual.time.actualStart, start);
  eq(label + ': einde D6, minstens de vastgelegde start', actual.time.actualFinish, finish);
  eq(label + ': voltooid', [actual.time.completion, actual.status], [1, 'COMPLETED']);
}

// De gedeelde volgorderegel krijgt bij lezers expliciet mee of de start nog ontbrak.
// Alleen zo'n automatisch afgeleide start mag terug naar het einde op de statusdatum.
for (const start of [undefined, '2026-06-03T18:00']) {
  const f = fixture();
  const task = structuredClone(f.task());
  task.time = { ...task.time, completion: 1, actualStart: start, scheduleStart: '2026-06-08T08:00', earlyStart: '2026-06-08T08:00' };
  normalizeImportedProgress([task], '2026-06-03');
  eq(`P1 lezer ${start ?? 'ontbrekend'}: actuals`, [task.time.actualStart, task.time.actualFinish],
    start ? [start, start] : ['2026-06-03', '2026-06-03']);
}

// Punt 2: de equivalentie van twee blokgrenzen geldt niet voor een willekeurig moment ertussen.
for (const profile of ['ops', 'p6', 'msproject'] as const) {
  for (const [lagMinutes, lagUnit, finish] of [
    [0, 'ELAPSEDTIME', '2026-07-06T16:00'],
    [0, 'WORKTIME', '2026-07-06T16:00'],
    [120, 'ELAPSEDTIME', '2026-07-07T08:00'],
    [960, 'ELAPSEDTIME', '2026-07-07T08:00'],
    [1440, 'ELAPSEDTIME', '2026-07-07T16:00'],
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
  // Reviewronde 2, punt 3: het rapport gebruikt dezelfde mijlpaalkant als de invoer.
  eq(label + ': DCMA aanvaardt de statuswerkdag',
    invalidDateReasons(actual, '2026-06-03', '2026-06-03', false, f.calendar), []);
}

for (const failure of failures) console.log('XX ' + failure);
console.log(`F1 reviewrondes 1 en 2: ${checks} controles, ${failures.length} fouten`);
if (failures.length) process.exit(1);
