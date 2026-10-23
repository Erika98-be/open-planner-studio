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
eq('mislukte solve houdt vlag', minuteModelTransition(raw, { ...computed, cpmResult: { ...computed.cpmResult!, error: { code: 'invalidStartDate', taskName: 'A' } } }).after.minuteModelPending, true);
const normalized = normalizeRecordedTimes(raw, { times: { [raw.tasks[0].id]: { start: '2026-03-02', finish: '2026-03-06' } }, total: 1 });
eq('vastlegging start wordt D1', normalized.times[raw.tasks[0].id].start, '2026-03-02T07:00');
eq('vastlegging einde wordt D2', normalized.times[raw.tasks[0].id].finish, '2026-03-06T16:00');
if (errors.length) { for (const e of errors) console.log(`XX ${e}`); process.exitCode = 1; }
console.log(`minutenovergang: ${checks - errors.length}/${checks} groen`);
