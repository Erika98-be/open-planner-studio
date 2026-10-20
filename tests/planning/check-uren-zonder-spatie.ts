// Uren als "10u" (nl) en "10h" (en), zonder spatie (eigenaarsbesluit 2026-10-20).
//
// AANLEIDING. De kolom Duur toonde in het Nederlands "80h" (de suffix `common:duration.suffixHour` was
// "h"), de restwerkmelding schreef "320 u → 88 u" met een spatie, en de lag stond in elke taal als
// "+2u" (ook in het Engels). Nu volgt alles de taal: nl "80u", "320u → 88u", "+2u"; en "80h",
// "320h → 88h", "+2h". De invoer blijft taalonafhankelijk: "80u" en "80h" werken allebei.
//
// Deze check draait met de ECHTE locale-bestanden (setLocale) en dezelfde labelkoppeling als het
// taakraster (`FullTaskGrid`: `duration.`-sleutels uit `common`).
//
// Draait via run.sh. Exit 0 = alles groen.
import './domStub';
import i18n, { setLocale } from '@/i18n/config';
import { useAppStore } from '@/state/appStore';
import { runGridMutation } from '@/state/gridTransaction';
import { createTaskGridAdapter } from '@/engine/taskGrid/taskGridAdapter';
import { taskColumnId } from '@/engine/taskGrid/fieldIds';
import { effectiveCalendarOf, effHoursPerDay } from '@/utils/taskDuration';
import { parseDuration } from '@/utils/durationFormat';
import { parseTaskDurationInput } from '@/utils/taskDurationInput';
import { parseLagInput } from '@/utils/lagFormat';
import type { TaskColumnId } from '@/types/taskGrid';
import type { TaskTime } from '@/types/task';

const S = () => useAppStore.getState();
const H = 60;

let checks = 0;
const diffs: string[] = [];
function eq(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    diffs.push(`${label}: kreeg ${JSON.stringify(actual)}, verwacht ${JSON.stringify(expected)}`);
  }
}

function adapter() {
  const s = S();
  return createTaskGridAdapter({
    projectId: s.project.id, tasks: s.tasks, sequences: s.sequences, cpmResult: s.cpmResult,
    assignments: s.assignments, resources: s.resources, baselines: s.baselines,
    activityCodeTypes: s.activityCodeTypes, customFieldDefs: s.customFieldDefs, customTaskTypes: s.customTaskTypes,
    scheduleStale: s.scheduleStale, wbsAutoNumber: false,
    effectiveHoursPerDay: t => effHoursPerDay(effectiveCalendarOf(t, s.calendar, s.calendars)),
    labelForColumn: k => k,
    // Dezelfde koppeling als FullTaskGrid: `duration.`-sleutels uit `common`, de rest uit `task`.
    labelForText: (key, values) => (key.startsWith('duration.')
      ? i18n.t(`common:${key}`, { ...values, defaultValue: key })
      : i18n.t(`task:${key}`, { ...values, defaultValue: key })) as string,
    numberLocale: i18n.language,
    surfaceId: 'full-task-grid', rows: s.viewRows, selectedTaskIds: [],
  });
}

function rowKeyOf(taskId: string): string {
  return S().viewRows.find(r => r.kind === 'task' && r.task.id === taskId)!.rowKey;
}

const DURATION = taskColumnId('task.time.scheduleDuration') as TaskColumnId;
const PREDECESSORS = 'relation.predecessors' as TaskColumnId;

function durationCell(taskId: string) {
  const a = adapter();
  return a.getCell(rowKeyOf(taskId), DURATION);
}

/** Typ `text` in de Duur-cel zoals de gebruiker doet (planEdit → gridtransactie); geeft de minuten terug. */
function typeDuration(taskId: string, text: string): number | string {
  const plan = adapter().planEdit(rowKeyOf(taskId), DURATION, text);
  if (!plan.ok) return `geweigerd: ${plan.errors.map(e => e.code).join(',')}`;
  const res = runGridMutation(plan.value);
  if (!res.ok) return 'transactie geweigerd';
  return S().tasks.find(t => t.id === taskId)!.time.durationMinutes ?? -1;
}

// ── Opzet: urenplanning aan, een urentaak van 80 uur en een opvolger met 2 uur lag ──
S().newProject();
S().setUI({ enableHourPlanning: true });
S().setProject({ startDate: '2026-06-01', name: 'Uren zonder spatie' });
const A = S().addTask({ name: 'A ontwerp', time: { durationUnit: 'hours', durationMinutes: 80 * H } as TaskTime });
const B = S().addTask({ name: 'B uitvoering', time: { scheduleDuration: 3 } as TaskTime });
S().addSequence({ predecessorId: A, successorId: B, type: 'FINISH_START', lagDays: 0, lagMinutes: 2 * H });
S().runCPM();
const wbsA = S().tasks.find(t => t.id === A)!.wbsCode;

for (const [lang, u] of [['nl', 'u'], ['en', 'h']] as const) {
  await setLocale(lang);
  eq(`${lang} 0 taal staat goed`, i18n.language, lang);

  // 1. Weergave: kolom Duur, kopieertekst, voorgangerscel.
  const cell = durationCell(A)!;
  eq(`${lang} 1a kolom Duur toont 80${u}`, cell.text, `80${u}`);
  eq(`${lang} 1b kopieertekst Duur is 80${u}`, cell.copyText, `80${u}`);
  const pred = adapter().getCell(rowKeyOf(B), PREDECESSORS)!;
  eq(`${lang} 1c voorgangerscel toont de lag als +2${u}`, pred.text, `${wbsA} FS+2${u}`);

  // 2. Restwerkmelding (de tekst van het meldingenkanaal met de parameters uit de store).
  eq(`${lang} 2 restwerkmelding zonder spatie`,
    i18n.t('common:notifications.remainingWorkRecomputed', { name: 'A', before: 320, after: 88 }).includes(`320${u} → 88${u}`),
    true);

  // 3. Invoer blijft taalonafhankelijk: "80u" én "80h" werken, ook in de cel.
  eq(`${lang} 3a cel: "72u" ⇒ 72 uur`, typeDuration(A, '72u'), 72 * H);
  eq(`${lang} 3b cel: "80h" ⇒ 80 uur`, typeDuration(A, '80h'), 80 * H);
  eq(`${lang} 3c cel: "72h" ⇒ 72 uur`, typeDuration(A, '72h'), 72 * H);
  eq(`${lang} 3d cel: "80u" ⇒ 80 uur`, typeDuration(A, '80u'), 80 * H);
  eq(`${lang} 3e na de invoer toont de cel 80${u}`, durationCell(A)!.text, `80${u}`);
}

// 4. De parsers zelf (taalonafhankelijk).
eq('4a parseDuration "80u"', parseDuration('80u', 8), 80 * H);
eq('4b parseDuration "80h"', parseDuration('80h', 8), 80 * H);
eq('4c parseTaskDurationInput "80u"', parseTaskDurationInput('80u', 'hours'), { unit: 'hours', durationMinutes: 80 * H, explicitUnit: true });
eq('4d parseTaskDurationInput "80h"', parseTaskDurationInput('80h', 'days'), { unit: 'hours', durationMinutes: 80 * H, explicitUnit: true });
eq('4e parseLagInput "+2u" en "+2h" gelijk', parseLagInput('+2u'), parseLagInput('+2h'));

// 5. Andere talen volgen in de vertaalronde: een afkorting die de parser niet kent ("ч") houdt de lag
//    leesbaar als "+2u", zodat bewerken en plakken blijven werken.
await setLocale('ru');
const ruPred = adapter().getCell(rowKeyOf(B), PREDECESSORS)!;
eq('5 ru: lag blijft parsebaar (+2u)', ruPred.text, `${wbsA} FS+2u`);

if (diffs.length) {
  for (const d of diffs) console.log(`XX  uren-zonder-spatie: ${d}`);
  console.log(`XX  uren-zonder-spatie: ${diffs.length} van ${checks} checks faalden`);
  process.exit(1);
}
console.log(`OK  uren-zonder-spatie: ${checks} checks groen`);
