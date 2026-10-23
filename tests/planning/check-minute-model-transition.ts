import { createAppStoreContext } from '@/state/appStoreFactory';
import { createMcpTransactions } from '@/state/runtime/createMcpTransactions';
import { buildWriteIFCInput } from '@/state/ifcSaveInput';
import { writeIFC } from '@/services/ifc/ifcWriter';
import './domStub';
import { readIFC } from '@/services/ifc/ifcReader';
import { payloadFromImport } from '@/state/documentContract';
import { prepareLoadedPayload } from '@/state/documentActivation';
import { minuteModelTransition, normalizeRecordedTimes } from '@/state/minuteModelTransition';
import { migrateToMinuteModel } from '@/state/migrations/minuteModel';
import { externIfc } from '../fixtures/recordedDatesIfc';

let checks = 0;
const errors: string[] = [];
function eq(label: string, got: unknown, want: unknown) {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`${label}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
}
const parsed = readIFC(externIfc('b5'));
const raw = migrateToMinuteModel(payloadFromImport(parsed, null)).payload;
raw.minuteModelPending = true;
// De eerste commit toetst het protocol los; de motor gaat in de volgende stap naar werkblokken.
const computed = prepareLoadedPayload(raw, { recompute: true });
const source = { times: Object.fromEntries(raw.tasks.map(t => [t.id, {
  start: t.time.earlyStart, finish: t.time.earlyFinish,
}])), total: raw.tasks.length };
const rawJson = JSON.stringify(raw);
const result = minuteModelTransition(raw, computed, source);
eq('invoer blijft intact', JSON.stringify(raw), rawJson);
eq('omzetting afgerond', result.after.minuteModelPending, false);
eq('vóór-toestand is opgeslagen modus', result.before.datesAsRecorded, true);
eq('vóór-toestand is niet verouderd', result.before.scheduleStale, false);
eq('vóór-toestand houdt de vlag', result.before.minuteModelPending, true);
eq('melding en strook tellen dezelfde taken', result.before.recordedDates?.shiftedTaskIds, result.shifted);
eq('verschuiving maakt gewijzigd', result.after.isDirty, true);
eq('zonder vlag geen overgang', minuteModelTransition({ ...raw, minuteModelPending: false }, computed).shifted, []);
eq('mislukte solve houdt vlag', minuteModelTransition(raw, { ...computed, cpmResult: { ...computed.cpmResult!, error: 'invalidStartDate' } }).after.minuteModelPending, true);
const normalized = normalizeRecordedTimes(raw, { times: { [raw.tasks[0].id]: { start: '2026-03-02', finish: '2026-03-06' } }, total: 1 });
eq('vastlegging start wordt D1', normalized.times[raw.tasks[0].id].start, '2026-03-02T07:00');
eq('vastlegging einde wordt D2', normalized.times[raw.tasks[0].id].finish, '2026-03-06T16:00');

// Echte laadroute: het vorige document mag nooit de vóór-snapshot worden.
const context = createAppStoreContext();
const store = context.store;
const load = readIFC(externIfc('b5-store'));
load.recordedTimesOrigin = 'ifc-own';
load.importPristine = false;
store.getState().addTask({ name: 'Vorig document' });
store.getState().applyLoadedProject(load, { recompute: true });
const bId = store.getState().tasks.find(t => t.name === 'B')!.id;
const bStart = () => store.getState().tasks.find(t => t.id === bId)!.time.earlyStart;
eq('laadroute rekent B', bStart(), '2026-03-09T07:00');
eq('laadroute één event', store.getState().historyEvents.length, 1);
eq('laadroute één omzettingsmelding', store.getState().ui.notifications.filter(n => n.messageKey === 'notifications.minuteModelConverted').length, 1);
eq('nieuwe save markeert minutenmodel', readIFC(writeIFC(buildWriteIFCInput(store.getState()))).timeModel, 'MINUTES-1');
store.getState().undo();
eq('undo geeft geladen B terug', bStart(), '2026-03-16T07:00');
eq('undo staat in modus', store.getState().datesAsRecorded, true);
eq('undo houdt vlag', store.getState().minuteModelPending, true);
eq('undo is niet verouderd', store.getState().scheduleStale, false);
eq('save na undo zonder markering', readIFC(writeIFC(buildWriteIFCInput(store.getState()))).timeModel, undefined);
eq('save na undo zonder bronformaat', readIFC(writeIFC(buildWriteIFCInput(store.getState()))).recordedSourceFormat, undefined);
const tx = createMcpTransactions(context);
eq('MCP naam slaagt', tx.run(() => tx.draft.updateTaskFields(bId, { name: 'B gewijzigd' })).ok, true);
eq('MCP naam houdt datums', bStart(), '2026-03-16T07:00');
eq('MCP naam houdt modus', store.getState().datesAsRecorded, true);
store.getState().undo();
eq('MCP undo houdt modus', store.getState().datesAsRecorded, true);
store.getState().runCPM();
eq('F5 rekent opnieuw', bStart(), '2026-03-09T07:00');
eq('F5 rondt vlag af', store.getState().minuteModelPending, false);
store.getState().undo();
eq('F5 undo geeft opgeslagen modus', bStart(), '2026-03-16T07:00');
const saved = writeIFC(buildWriteIFCInput(store.getState()));
store.getState().applyLoadedProject(readIFC(saved), { recompute: true });
eq('heropenen na undo rondt opnieuw af', bStart(), '2026-03-09T07:00');
if (errors.length) { for (const e of errors) console.log(`XX ${e}`); process.exitCode = 1; }
console.log(`minutenovergang: ${checks - errors.length}/${checks} groen`);
