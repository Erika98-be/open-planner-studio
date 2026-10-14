import './domStub';
// Projectstart en -einde met tijd, door opslaan als IFC en heropenen.
//
// Na een XER-import hebben `project.startDate` en `project.endDate` een tijd (`2012-12-17T07:00`). De
// writer schreef `ProjectStartDate`/`ProjectEndDate` als IFCDATE met alleen de datum, en de lezer nam
// alleen de eerste 10 tekens. Na heropenen was de tijd weg: de P6- en MSPDI-export schreven dan 08:00, en
// met `useProjectEndDateForFloat` rekende de motor de late kant vanaf middernacht. Nu schrijft de writer
// mét tijd IFCDATETIME, en neemt de lezer de tijd alleen uit IFCDATETIME over. Zie docs/ifc-round-trip.md,
// "Projectstart en -einde met tijd".
//
//  §1 de vorm in het bestand: met tijd IFCDATETIME met seconden, zonder tijd IFCDATE (zoals main), leeg `$`,
//     een onleesbare tijd IFCDATE met de datum.
//  §2 round-trip van start en einde (readIFC): met tijd, middernacht, zonder tijd, leeg einde.
//  §3 oude bestanden lezen zoals main ze las: IFCDATE zonder tijd, IFCDATE mét tijd (main vóór #344),
//     en de fixture `xer-archief-herschreven.ifc`.
//  §4 de echte open- en opslaanroute (store, doorrekenen): projectdatums, alle taakdatums en speling gelijk
//     vóór en na, met `useProjectEndDateForFloat`. Controle: zonder de tijd van het einde rekent de motor
//     echt anders, dus §4 toetst iets.
//  §5 de P6- en MSPDI-export: de projectregels gelijk vóór en na.
//  §6 schemapoort: het geschreven bestand heeft 0 fouten.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import { buildWriteIFCInput } from '@/state/ifcSaveInput';
import { parseOpenedFile } from '@/services/formatRegistry';
import { createAppStoreContext } from '@/state/appStore';
import { createDefaultProject } from '@/state/defaults';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import { writeP6XMLWithReport } from '@/services/p6/p6xmlWriter';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
import type { DocumentPayload } from '@/state/documentContract';
import type { ImportResult, OpenedImport } from '@/services/importTypes';
import type { WorkCalendar, WorkTimeBands } from '@/types/calendar';
import type { Task } from '@/types/task';
import { checkIfcSchema } from './ifcSchemaCheck';

declare const process: { exit(code: number): never };

const HERE = fileURLToPath(new URL('.', import.meta.url));

let checks = 0;
const failures: string[] = [];
function same(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures.push(`${label}\n        verwacht ${JSON.stringify(want)}\n        kreeg    ${JSON.stringify(got)}`);
  }
}
function differs(label: string, a: unknown, b: unknown): void {
  checks++;
  if (JSON.stringify(a) === JSON.stringify(b)) failures.push(`${label}\n        beide ${JSON.stringify(a)}`);
}

// Uurkalender ma–vr 07:00–16:00 (9 klokuren), zoals de XER-lezer een P6-kalender met blokken zet.
const bands = (s: number, e: number) => [{ start: s, end: e }];
const WEEK: WorkTimeBands = { byWeekday: { 1: bands(420, 960), 2: bands(420, 960), 3: bands(420, 960), 4: bands(420, 960), 5: bands(420, 960), 6: [], 7: [] } };
const CAL: WorkCalendar = {
  id: 'cal-uur', name: 'Uur 07-16', description: '', workDays: [1, 2, 3, 4, 5],
  workStartHour: 7, workEndHour: 16, hoursPerDay: 9, holidays: [], workTime: WEEK,
};

function hourTask(id: string, start: string, minutes: number): Task {
  const time = createDefaultTaskTime(start, minutes / 60, 'hours', CAL);
  time.durationMinutes = minutes;
  time.scheduleDuration = minutes / (CAL.hoursPerDay * 60);
  return {
    id, name: `Taak ${id}`, description: '', wbsCode: id, taskType: 'CONSTRUCTION', status: 'NOT_STARTED',
    isMilestone: false, priority: 500, parentId: null, childIds: [], resourceIds: [], time,
  } as Task;
}

/** Twee urentaken in serie en één losse, plus een resource met tarief (P6 `ResourceRate.EffectiveDate`
 *  is de projectstart). Het einde ligt ná het netwerkeinde, zodat het de late kant bepaalt. */
function buildProject(startDate: string, endDate: string): ImportResult {
  const project = {
    ...createDefaultProject(), id: 'proj-projectdatum', calendarId: CAL.id, startDate, endDate,
    schedulingOptions: { useProjectEndDateForFloat: true },
  };
  const tasks = [hourTask('a', '2026-03-02T07:00', 1080), hourTask('b', '2026-03-04T07:00', 540), hourTask('c', '2026-03-02T07:00', 270)];
  return {
    project, calendar: CAL, tasks,
    sequences: [{ id: 's-ab', predecessorId: 'a', successorId: 'b', type: 'FINISH_START', lagDays: 0 }],
    resources: [{ id: 'r1', name: 'Ploeg', type: 'LABOR', description: '', costPerHour: 55, maxUnits: 1 }],
    assignments: [],
  } as ImportResult;
}

/** De twee projectdatums in `OPS_ProjectSettings`, als ruwe STEP-waarde. */
function contractDates(ifc: string): { start?: string; end?: string } {
  const value = (name: string) => new RegExp(`IFCPROPERTYSINGLEVALUE\\('${name}',\\$,(.*),\\$\\);$`, 'm').exec(ifc)?.[1];
  return { start: value('ProjectStartDate'), end: value('ProjectEndDate') };
}

const OPEN = { filePath: null, fileHandle: null, recompute: true, fit: false, hourDataNotice: false, linkedOpen: true } as const;
function openInStore(parsed: OpenedImport): DocumentPayload {
  const store = createAppStoreContext().store;
  store.getState().applyOpenedImport(parsed, OPEN);
  return store.getState().getOpenDocumentPayloads()[0].payload;
}
async function reopen(p: DocumentPayload): Promise<DocumentPayload> {
  return openInStore(await parseOpenedFile({ name: 'rondgang.ifc', text: writeIFC(buildWriteIFCInput(p)) }));
}
const taskDates = (p: DocumentPayload) => p.tasks.map((t) => {
  const x = t.time;
  return [t.id, x.earlyStart, x.earlyFinish, x.lateStart, x.lateFinish, x.totalFloat, x.isCritical];
});
// De console van de exportschrijvers (meldingen over niet-exporteerbare opties) hoort niet in de log.
const quiet = <T>(fn: () => T): T => {
  const warn = console.warn;
  console.warn = () => {};
  try { return fn(); } finally { console.warn = warn; }
};
/** Alleen de projectregels: P6 `<Project>`-velden en `ResourceRate`, MSPDI de kop vóór `<Calendars>`. */
function projectExportLines(p: DocumentPayload): string[] {
  const p6 = quiet(() => writeP6XMLWithReport(p.project, p.calendar, p.tasks, p.sequences, p.resources, p.assignments,
    p.calendars, p.customTaskTypes).xml);
  const msp = quiet(() => writeMSPDI(p.project, p.calendar, p.tasks, p.sequences, p.resources, p.assignments, p.calendars,
    p.baselines, p.activeBaselineId, p.customTaskTypes));
  const p6Project = /<Project>[\s\S]*?<\/Project>/.exec(p6)?.[0] ?? '';
  const p6Own = p6Project.replace(/<(WBS|Activity|Relationship|ResourceAssignment|Calendar)>[\s\S]*?<\/\1>/g, '');
  const p6Rates = [...p6.matchAll(/<ResourceRate>[\s\S]*?<\/ResourceRate>/g)].map((m) => m[0]).join('');
  const mspHead = msp.slice(0, Math.max(0, msp.indexOf('<Calendars>')));
  const pick = (src: string, tags: string) => [...src.matchAll(new RegExp(`<(${tags})>([^<]*)</\\1>`, 'g'))].map((m) => `${m[1]}=${m[2]}`);
  return [...pick(p6Own, 'PlannedStartDate|MustFinishByDate').map((l) => `P6 ${l}`),
    ...pick(p6Rates, 'EffectiveDate').map((l) => `P6 rate ${l}`),
    ...pick(mspHead, 'StartDate|FinishDate').map((l) => `MSPDI ${l}`)];
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §1 De vorm in het bestand
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  same('§1 start en einde met tijd: IFCDATETIME met seconden',
    contractDates(writeIFC(buildProject('2026-03-02T07:00', '2026-03-13T12:00'))),
    { start: "IFCDATETIME('2026-03-02T07:00:00')", end: "IFCDATETIME('2026-03-13T12:00:00')" });
  same('§1 middernacht is een tijd: IFCDATETIME',
    contractDates(writeIFC(buildProject('2026-03-02T00:00', '2026-03-13T00:00'))),
    { start: "IFCDATETIME('2026-03-02T00:00:00')", end: "IFCDATETIME('2026-03-13T00:00:00')" });
  same('§1 zonder tijd: IFCDATE, zoals main', contractDates(writeIFC(buildProject('2026-03-02', '2026-03-13'))),
    { start: "IFCDATE('2026-03-02')", end: "IFCDATE('2026-03-13')" });
  same('§1 leeg einde: `$`', contractDates(writeIFC(buildProject('2026-03-02T07:00', ''))),
    { start: "IFCDATETIME('2026-03-02T07:00:00')", end: '$' });
  same('§1 met seconden: zoals gegeven', contractDates(writeIFC(buildProject('2026-03-02T07:00:30', ''))).start,
    "IFCDATETIME('2026-03-02T07:00:30')");
  // Geen geldige IfcDateTime: dan de datum, zoals main (het bestand blijft schemageldig).
  same('§1 onleesbare tijd: IFCDATE met de datum', contractDates(writeIFC(buildProject('2026-03-02T7:00', ''))).start,
    "IFCDATE('2026-03-02')");
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §2 Round-trip van start en einde
// ════════════════════════════════════════════════════════════════════════════════════════════════
for (const [start, end] of [
  ['2026-03-02T07:00', '2026-03-13T12:00'],
  ['2026-03-02T00:00', '2026-03-13T00:00'],
  ['2026-03-02T16:30', '2026-03-13T17:00'],
  ['2026-03-02', '2026-03-13'],
  ['2026-03-02T07:00', ''],
] as const) {
  const once = readIFC(writeIFC(buildProject(start, end)));
  same(`§2 ${start} / ${end || 'leeg'}: start`, once.project.startDate, start);
  same(`§2 ${start} / ${end || 'leeg'}: einde`, once.project.endDate, end);
  const twice = readIFC(writeIFC({ ...buildProject(start, end), project: once.project }));
  same(`§2 ${start} / ${end || 'leeg'}: tweede round-trip`, [twice.project.startDate, twice.project.endDate], [start, end]);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §3 Oude bestanden lezen zoals main
// ════════════════════════════════════════════════════════════════════════════════════════════════
{
  const ifc = writeIFC(buildProject('2026-03-02T07:00', '2026-03-13T12:00'));
  const asMain = ifc.replace("IFCDATETIME('2026-03-02T07:00:00')", "IFCDATE('2026-03-02')")
    .replace("IFCDATETIME('2026-03-13T12:00:00')", "IFCDATE('2026-03-13')");
  const preB5 = ifc.replace("IFCDATETIME('2026-03-02T07:00:00')", "IFCDATE('2026-03-02T07:00')")
    .replace("IFCDATETIME('2026-03-13T12:00:00')", "IFCDATE('2026-03-13T12:00')");
  same('§3 controle: de vervanging raakt beide regels', [asMain, preB5].map((t) => t.includes('IFCDATETIME(\'2026-03-')), [false, false]);
  const m = readIFC(asMain).project;
  same('§3 main (IFCDATE zonder tijd): datum', [m.startDate, m.endDate], ['2026-03-02', '2026-03-13']);
  const o = readIFC(preB5).project;
  same('§3 main vóór #344 (IFCDATE met tijd): datum, zoals main hem las', [o.startDate, o.endDate], ['2026-03-02', '2026-03-13']);
  const fixture = readFileSync(join(HERE, 'fixtures', 'xer-archief-herschreven.ifc'), 'utf8');
  same('§3 controle: de fixture draagt IFCDATE met tijd', fixture.includes("'ProjectStartDate',$,IFCDATE('2026-08-03T08:00')"), true);
  same('§3 fixture xer-archief-herschreven.ifc: projectstart zoals main', readIFC(fixture).project.startDate, '2026-08-03');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §4 De echte open- en opslaanroute, met de motor
// §5 De P6- en MSPDI-export
// ════════════════════════════════════════════════════════════════════════════════════════════════
for (const [start, end] of [
  ['2026-03-02T07:00', '2026-03-13T12:00'],
  ['2026-03-02T00:00', '2026-03-13T16:00'],
] as const) {
  const label = `${start} / ${end}`;
  const before = openInStore(buildProject(start, end));
  same(`§4 ${label}: controle, de optie staat aan`, before.project.schedulingOptions?.useProjectEndDateForFloat, true);
  const after = await reopen(before);
  same(`§4 ${label}: projectdatums`, [after.project.startDate, after.project.endDate], [start, end]);
  same(`§4 ${label}: taakdatums, speling en kritiek`, taskDates(after), taskDates(before));
  const again = await reopen(after);
  same(`§4 ${label}: taakdatums na een tweede round-trip`, taskDates(again), taskDates(before));
  // Controle: zonder de tijd van het einde (wat main na heropenen had) rekent de motor anders.
  const dateOnly = openInStore(buildProject(start.slice(0, 10), end.slice(0, 10)));
  differs(`§4 ${label}: controle, de tijd van het einde verandert de late kant`, taskDates(dateOnly), taskDates(before));

  const lines = projectExportLines(before);
  same(`§5 ${label}: controle, de export heeft de projectregels`, lines.map((l) => l.split('=')[0]),
    ['P6 MustFinishByDate', 'P6 PlannedStartDate', 'P6 rate EffectiveDate', 'MSPDI StartDate', 'MSPDI FinishDate']);
  same(`§5 ${label}: projectregels in de P6- en MSPDI-export`, projectExportLines(after), lines);
  differs(`§5 ${label}: controle, zonder tijd schrijft de export andere regels`, projectExportLines(dateOnly), lines);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §6 Schemapoort
// ════════════════════════════════════════════════════════════════════════════════════════════════
for (const [start, end] of [['2026-03-02T07:00', '2026-03-13T12:00'], ['2026-03-02', '']] as const) {
  const r = checkIfcSchema(`projectdatum ${start} / ${end || 'leeg'}`, writeIFC(buildProject(start, end)));
  checks += r.checks;
  failures.push(...r.failures.map((f) => `§6 ${f}`));
}

if (failures.length) {
  console.log(`XX  ifc-projectdatum-tijd: ${failures.length} van ${checks} checks faalden`);
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
console.log(`OK  ifc-projectdatum-tijd: ${checks} checks`);
