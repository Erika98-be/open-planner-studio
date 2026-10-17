// Weigeringen in het meldingenkanaal (eigenaarsbesluit 2026-10-17) — headless tegen de ECHTE store.
//
// Een weigering = een melding dat de app een handeling van de gebruiker NIET heeft uitgevoerd. Die is
// rood (`severity: 'error'`, vlag `refusal`) en blijft staan. Drie dingen kunnen stil afdrijven:
//   1. EEN BRON VALT TERUG NAAR INFO. Elke weigeringsbron hieronder (gedrag), en een bronscan die eist
//      dat geen enkele weigeringssleutel nog met een losse `severity:` wordt gebouwd: alleen via
//      `refusalNotice`/`partialRefusalNotice` (`src/state/refusalNotice.ts`).
//   2. DEELS GELUKT. Ook als de rest van dezelfde handeling wél lukte, is een weigering rood
//      (eigenaarsbesluit 2026-10-17, "weigering = rood"), en noemt een detailregel welke taken of
//      relaties niet zijn aangepast.
//   3. STAPELEN EN WEGDUWEN. Herhaalde weigeringen vouwen samen, en duwen bij een volle stapel nooit
//      een echte fout of een blijvende info weg.
//
// Draait vanzelf mee via run.sh. Exit 0 = alles groen.
import './domStub';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useAppStore } from '@/state/appStore';
import { MAX_NOTIFICATIONS } from '@/state/slices/uiSlice';
import { durationBelowDoneWorkNotice } from '@/state/progressEntryNotice';
import { startEditNotifications } from '@/state/startConstraintNotice';
import { milestoneRefusalNotices, phaseRefusalNotice } from '@/state/structuralTransition';
import { notifyHierarchyCycle } from '@/state/hierarchyRelationNotice';
import { createRelationWithFeedback } from '@/state/relationActions';
import { PARTIAL_REFUSAL_SEVERITY, REFUSED_NAMES_SHOWN } from '@/state/refusalNotice';
import { notifyRelationsSkipped } from '@/state/insertedBranch';
import type { NotifyInput } from '@/state/slices/types';

const S = () => useAppStore.getState();
const N = () => S().ui.notifications;
const diffs: string[] = [];
let checks = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
};
const clearAll = () => { for (const n of [...N()]) S().dismissNotification(n.id); };
const kind = (n: NotifyInput | undefined) => n && { severity: n.severity, refusal: n.refusal === true };
const RED = { severity: 'error', refusal: true };
const PARTIAL = RED;
eq('0 de schakelaar voor deels gelukt staat op rood', PARTIAL_REFUSAL_SEVERITY, 'error');

// ── 1. Elke weigeringsbron is rood ──────────────────────────────────────────
eq('1a durationBelowDoneWork', kind(durationBelowDoneWorkNotice({ id: 't', name: 'T', time: { completion: 0.5 } })), RED);

const mso = { type: 'MSO', date: '2026-06-10' } as const;
const one = startEditNotifications([{ kind: 'blocked', name: 'B', constraint: mso, taskId: 'b' }], 'dmy', '24h');
eq('1b startBlockedByConstraint', [one[0]?.messageKey, kind(one[0])], ['notifications.startBlockedByConstraint', RED]);
const noDate = startEditNotifications([{ kind: 'blocked', name: 'B', constraint: { type: 'ALAP' } }], 'dmy', '24h');
eq('1c startBlockedByConstraintNoDate', [noDate[0]?.messageKey, kind(noDate[0])], ['notifications.startBlockedByConstraintNoDate', RED]);
const many = startEditNotifications([
  { kind: 'blocked', name: 'B', constraint: mso }, { kind: 'blocked', name: 'C', constraint: mso },
], 'dmy', '24h');
eq('1d startBlockedByConstraintMany', [many[0]?.messageKey, kind(many[0])], ['notifications.startBlockedByConstraintMany', RED]);
eq('1e SNET blijft info (geen weigering)',
  kind(startEditNotifications([{ kind: 'snet', name: 'B', date: '2026-06-15', change: 'created' }], 'dmy', '24h')[0]),
  { severity: 'info', refusal: false });

const ms = milestoneRefusalNotices([{ name: 'A', refusal: 'assignments' }, { name: 'F', refusal: 'summary' }]);
eq('1f milestoneRefusedAssignments + Summary', ms.map(n => [n.messageKey, kind(n)]), [
  ['notifications.milestoneRefusedAssignments', RED], ['notifications.milestoneRefusedSummary', RED],
]);

const describe = { tasks: [], resources: [], assignments: [] };
eq('1g phaseRefusedNoAssignableChild',
  kind(phaseRefusalNotice(describe, { kind: 'noAssignableChild', phaseId: 'p' })), RED);
eq('1h phaseRefusedDuplicateResource',
  kind(phaseRefusalNotice(describe, { kind: 'duplicateResource', phaseId: 'p', childId: 'c', resourceId: 'r' })), RED);

const captured: NotifyInput[] = [];
notifyHierarchyCycle({ tasks: [], notify: (n) => captured.push(n) }, ['a', 'b', 'a']);
eq('1i hierarchyCycle', [captured[0]?.messageKey, kind(captured[0])], ['notifications.hierarchyCycle', RED]);

S().newProject();
clearAll();
const rA = S().addTask({ name: 'A' });
const rB = S().addTask({ name: 'B' });
createRelationWithFeedback(rA, rB);
eq('1j een geslaagde relatie meldt niets', N().length, 0);
createRelationWithFeedback(rA, rB);
eq('1k relationDuplicate', [N()[0]?.messageKey, kind(N()[0])], ['notifications.relationDuplicate', RED]);
clearAll();
createRelationWithFeedback(rB, rA);
eq('1l relationCycle', [N()[0]?.messageKey, kind(N()[0])], ['notifications.relationCycle', RED]);
clearAll();

// ── 2. Deels gelukt ⇒ de ene schakelaar ─────────────────────────────────────
eq('2a startBlocked deels gelukt (plakken)',
  kind(startEditNotifications([{ kind: 'blocked', name: 'B', constraint: mso }], 'dmy', '24h', true)[0]), PARTIAL);
eq('2b startBlockedMany deels gelukt',
  kind(startEditNotifications([{ kind: 'blocked', name: 'B', constraint: mso }, { kind: 'blocked', name: 'C', constraint: mso }], 'dmy', '24h', true)[0]), PARTIAL);
eq('2c mijlpaal deels gelukt (contextmenu)',
  kind(milestoneRefusalNotices([{ name: 'A', refusal: 'assignments' }], true)[0]), PARTIAL);

// Welke taken niet zijn aangepast.
eq('2d Many noemt de taken', many[0]?.detailLines, [{ messageKey: 'notifications.refusedTaskNames', params: { names: 'B, C' } }]);
const msMany = milestoneRefusalNotices([{ name: 'A', refusal: 'assignments' }, { name: 'B', refusal: 'assignments' }], true);
eq('2e mijlpaal _other noemt de taken', msMany[0]?.detailLines, [{ messageKey: 'notifications.refusedTaskNames', params: { names: 'A, B' } }]);
const seven = Array.from({ length: REFUSED_NAMES_SHOWN + 2 }, (_, i) => ({ kind: 'blocked' as const, name: `T${i}`, constraint: mso }));
eq('2f meer dan vijf namen ⇒ "en nog N"', startEditNotifications(seven, 'dmy', '24h', true)[0]?.detailLines,
  [{ messageKey: 'notifications.refusedTaskNamesMore', params: { names: 'T0, T1, T2, T3, T4', count: 2 } }]);
const skippedRel: NotifyInput[] = [];
notifyRelationsSkipped((n) => skippedRel.push(n), ['A → B'], 'k');
eq('2g relationsSkippedOnInsert is rood en noemt de relatie',
  [skippedRel[0]?.messageKey, kind(skippedRel[0]), skippedRel[0]?.detailLines],
  ['notifications.relationsSkippedOnInsert', RED, [{ messageKey: 'notifications.refusedRelationNames', params: { names: 'A → B' } }]]);
const none: NotifyInput[] = [];
notifyRelationsSkipped((n) => none.push(n), [], 'k');
eq('2h geen overgeslagen relaties ⇒ geen melding', none.length, 0);

// ── 3. Samenvouwen en wegduwen ──────────────────────────────────────────────
for (let i = 0; i < 10; i++) for (const n of one) S().notify(n);
eq('3a tien keer dezelfde startweigering ⇒ één regel ×10', N().map(n => [n.messageKey, n.count]),
  [['notifications.startBlockedByConstraint', 10]]);
clearAll();
for (let i = 0; i < 10; i++) for (const n of many) S().notify(n);
eq('3b tien keer Many ⇒ één regel ×10', N().map(n => n.count), [10]);
clearAll();

const refusals = (n: number) => {
  for (let i = 0; i < n; i++) S().notify({ ...durationBelowDoneWorkNotice({ id: `t${i}`, name: `T${i}`, time: { completion: 0.5 } }) });
};
S().notify({ severity: 'error', messageKey: 'notifications.saveFailed', detail: 'disk full' });
refusals(MAX_NOTIFICATIONS);
eq('3c saveFailed + 3 weigeringen ⇒ saveFailed blijft',
  N().map(n => n.messageKey), ['notifications.saveFailed', 'notifications.durationBelowDoneWork', 'notifications.durationBelowDoneWork']);
clearAll();
S().notify({ severity: 'info', messageKey: 'notifications.summaryRelationsDropped', params: { total: 4 }, sticky: true });
refusals(MAX_NOTIFICATIONS);
eq('3d sticky info + 3 weigeringen ⇒ sticky blijft', N()[0]?.messageKey, 'notifications.summaryRelationsDropped');
eq('3e daarna nog twee weigeringen', N().length, MAX_NOTIFICATIONS);
clearAll();
S().notify({ severity: 'info', messageKey: 'notifications.templateSaved', params: { name: 'x' } });
S().notify({ severity: 'error', messageKey: 'notifications.saveFailed' });
refusals(2);
eq('3f gewone info gaat vóór een weigering', N().map(n => n.messageKey),
  ['notifications.saveFailed', 'notifications.durationBelowDoneWork', 'notifications.durationBelowDoneWork']);
clearAll();
for (let i = 0; i < MAX_NOTIFICATIONS; i++) S().notify({ severity: 'error', messageKey: 'notifications.saveFailed', dedupeKey: `s${i}` });
refusals(1);
eq('3g drie echte fouten + een weigering ⇒ de fouten blijven', N().map(n => n.messageKey),
  Array(MAX_NOTIFICATIONS).fill('notifications.saveFailed'));
clearAll();

// ── 4. Bronscan: geen weigeringssleutel met een losse severity ──────────────
// Dekt ook de bronnen die alleen via de UI lopen (sleep op een voltooide balk, plakken, annuleren
// van de taakdialoog).
const REFUSAL_KEYS = [
  'durationBelowDoneWork', 'relationDuplicate', 'relationAncestorEndpoint', 'relationCycle', 'hierarchyCycle',
  'startBlockedByConstraint', 'startBlockedByConstraintNoDate', 'startBlockedByConstraintMany',
  'dragStartIsActual', 'dragDatesAreActual', 'milestoneRefusedAssignments', 'milestoneRefusedSummary',
  'phaseRefusedNoAssignableChild', 'phaseRefusedDuplicateResource', 'taskEditRevertBlocked', 'pasteSkippedReadOnly',
  'relationsSkippedOnInsert',
];
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!/[/\\](i18n|services[/\\]mcp)$/.test(p)) walk(p); }
    else if (/\.(ts|tsx)$/.test(name) && !p.endsWith(join('slices', 'types.ts'))) files.push(p);
  }
};
walk(SRC);
const found = new Set<string>();
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const key of REFUSAL_KEYS) {
      if (!new RegExp(`'notifications\\.${key}'`).test(line)) continue;
      found.add(key);
      const before = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
      if (/severity\s*:/.test(before)) diffs.push(`4 ${file.slice(SRC.length + 1)}:${i + 1}: ${key} met een losse severity — gebruik refusalNotice/partialRefusalNotice`);
      if (!/(partialRefusalNotice|refusalNotice)\(/.test(before) && !/REJECTION_MESSAGE/.test(lines.slice(Math.max(0, i - 12), i).join('\n'))) {
        diffs.push(`4 ${file.slice(SRC.length + 1)}:${i + 1}: ${key} niet via refusalNotice/partialRefusalNotice`);
      }
    }
  });
}
eq('4z elke weigeringssleutel is in de bron gevonden', REFUSAL_KEYS.filter(k => !found.has(k)), []);

if (diffs.length > 0) {
  for (const d of diffs) console.log(`XX  ${d}`);
  console.log(`check-refusal-notices: ${diffs.length} afwijking(en) op ${checks} checks`);
  process.exit(1);
}
console.log(`OK  check-refusal-notices: ${checks} checks + bronscan van ${files.length} bestanden groen`);
