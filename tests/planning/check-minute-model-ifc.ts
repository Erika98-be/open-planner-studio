import { parseInstant, MS_PER_DAY } from '@/utils/dateUtils';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import './domStub';
import { freshPayload, payloadFromImport } from '@/state/documentContract';
import { buildWriteIFCInput } from '@/state/ifcSaveInput';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import { minuteModelWriteView } from '@/services/ifc/minuteModelWrite';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import type { Task } from '@/types/task';
import { computeCalendarHash } from '@/services/library/libraryOps';
import { migrateToMinuteModel } from '@/state/migrations/minuteModel';

let checks = 0;
const errors: string[] = [];
function eq(label: string, got: unknown, want: unknown) {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
}
function task(id: string, start: string, finish: string): Task {
  return { id, name: id, description: '', wbsCode: id, taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
    isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [],
    time: { ...createDefaultTaskTime('2026-06-01', 1), scheduleStart: start, scheduleFinish: finish,
      earlyStart: start, earlyFinish: finish, lateStart: start, lateFinish: finish } };
}
for (const variant of ['W0', 'W1', 'W2']) {
  const payload = freshPayload();
  payload.calendar = { ...payload.calendar, holidays: [] };
  payload.tasks = [task('dag', '2026-06-01T07:00', '2026-06-01T16:00')];
  if (variant !== 'W0') {
    const completed = task('voltooid', '2026-06-01T11:00', '2026-06-01T16:00');
    completed.time = { ...completed.time, completion: 1, actualStart: '2026-06-01T11:00', actualFinish: '2026-06-01T16:00' };
    completed.constraint = { type: 'SNET', date: '2026-06-01T11:00' };
    completed.deadline = '2026-06-02T07:00';
    completed.time.stop = '2026-06-01T14:00'; completed.time.resume = '2026-06-02T09:00';
    payload.tasks.push(completed);
    const elapsed = task('kalendertijd', '2026-06-01T00:00', '2026-06-02T00:00');
    elapsed.time.durationType = 'ELAPSEDTIME';
    payload.tasks.push(elapsed);
    if (variant === 'W1') {
      const hour = task('uur', '2026-06-01T07:00', '2026-06-01T16:00');
      hour.time.durationUnit = 'hours'; hour.time.durationMinutes = 480;
      payload.tasks.push(hour);
    }
  }
  const hashBefore = computeCalendarHash(payload.calendar);
  const input = buildWriteIFCInput(payload);
  const view = minuteModelWriteView(input);
  const text = writeIFC(input);
  const compatOut = process.env.OPS_MINUTE_MODEL_COMPAT_OUT;
  if (compatOut) { mkdirSync(compatOut, { recursive: true }); writeFileSync(join(compatOut, `${variant}.ifc`), text); }
  const parsed = readIFC(text);
  const roundtrip = payloadFromImport(parsed, null);
  eq(`${variant} kalenderkeuze`, text.includes("'LiteralTimes'"), variant !== 'W0');
  eq(`${variant} kalender blijft scalair`, parsed.calendar.workTime, undefined);
  eq(`${variant} kalenderhash verandert niet door save`, computeCalendarHash(payload.calendar), hashBefore);
  eq(`${variant} markering`, parsed.timeModel, 'MINUTES-1');
  for (const original of payload.tasks) {
    const back = roundtrip.tasks.find(t => t.id === original.id)!;
    eq(`${variant} ${original.id} begin`, back.time.earlyStart, original.time.earlyStart);
    eq(`${variant} ${original.id} einde`, back.time.earlyFinish, original.time.earlyFinish);
    eq(`${variant} ${original.id} beperking`, back.constraint, original.constraint);
    eq(`${variant} ${original.id} deadline`, back.deadline, original.deadline);
  }
  if (variant === 'W0') eq('W0 schrijft datums als anker', view.tasks[0].time.earlyFinish, '2026-06-01');
  else eq(`${variant} dagtaak blijft letterlijk op de kalender`, view.tasks[0].time.earlyFinish, '2026-06-01T16:00');
}
// D7: zonder soort kan een anker alleen met de hint hetzelfde eindmoment herstellen.
{
  const payload = freshPayload();
  payload.calendar.holidays = [];
  const ms = task('mijlpaal', '2026-06-01T16:00', '2026-06-01T16:00');
  ms.isMilestone = true; ms.time.scheduleDuration = 0;
  payload.tasks = [ms];
  const text = writeIFC(buildWriteIFCInput(payload));
  eq('D7 hint geschreven', text.includes("'AtDayEnd'"), true);
  const back = payloadFromImport(readIFC(text), null).tasks[0];
  eq('D7 begin en einde één moment', [back.time.earlyStart, back.time.earlyFinish], ['2026-06-01T16:00', '2026-06-01T16:00']);
  eq('D7 soort blijft oningevuld', back.milestoneKind, undefined);
}
// D3: de baseline van een voltooide kalendertijd-taak houdt haar afstand tot het getoonde einde.
{
  const payload = freshPayload();
  const t = task('kalender', '2026-06-01', '2026-06-02');
  t.time.durationType = 'ELAPSEDTIME'; t.time.completion = 1;
  t.time.actualStart = '2026-06-01'; t.time.actualFinish = '2026-06-02';
  payload.tasks = [t];
  payload.baselines = [{ id: 'baseline', name: 'Basis', createdAt: '', projectDuration: 1, projectEnd: '2026-06-02', tasks: [{
    taskId: t.id, start: '2026-06-01', finish: '2026-06-02', duration: 1, isMilestone: false,
  }] }];
  const out = migrateToMinuteModel(payload).payload;
  eq('baseline-einde volgt werkelijk einde', out.baselines[0].tasks[0].finish, out.tasks[0].time.actualFinish);
  const earlier = { ...payload, baselines: payload.baselines.map(b => ({ ...b, tasks: b.tasks.map(bt => ({ ...bt, finish: '2026-05-31' })) })) };
  const normalized = migrateToMinuteModel(earlier).payload;
  eq('baseline behoudt twee kalenderdagen afstand',
    (parseInstant(normalized.tasks[0].time.actualFinish!).getTime() - parseInstant(normalized.baselines[0].tasks[0].finish).getTime()) / MS_PER_DAY, 2);

}
if (errors.length) { for (const e of errors) console.log(`XX ${e}`); process.exitCode = 1; }
console.log(`minutenmodel IFC: ${checks - errors.length}/${checks} groen`);
