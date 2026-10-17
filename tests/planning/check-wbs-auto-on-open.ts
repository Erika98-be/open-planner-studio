// WBS auto bij het openen (eigenaarsbesluit 2026-10-17). Via de echte open-pijplijn:
// `parseOpenedFile` (formatRegistry) → `openAsDocument` → `applyLoadedProject` (store).
// Regel: draagt het bestand GEEN `wbsAutoNumber`-vlag en is elke WBS-code precies de boomnummering
// (zelfde nummering als `deriveWbsCodes`/"Hernummer WBS"), dan staat "WBS auto" na het openen aan.
// Anders blijft alles zoals het was (vrije tekst; een vlag uit het bestand blijft staan, ook `false`).
// Bewaakt ook: geen undo-stap, document niet gewijzigd, codes ongewijzigd, en export (MSPDI, P6 XML,
// CSV, IFC) schrijft dezelfde codes. Er is geen XER-export (ExportFormat kent hem niet).
// Corpusloos (CI). Fixtures: inline, zelf geschreven.
import './domStub';
import { parseOpenedFile } from '@/services/formatRegistry';
import { useAppStore } from '@/state/appStore';
import { activeImportResult, type ImportResult, type OpenedImport } from '@/services/importTypes';
import { selectUndoHistoryEvent } from '@/state/sessionHistory';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
import { writeP6XMLWithReport } from '@/services/p6/p6xmlWriter';
import { writeCSV } from '@/services/csv/csvWriter';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import { buildExportIFCInput } from '@/state/ifcSaveInput';
import { documentProjectCode } from '@/utils/documentProjectCode';
import { flattenOrder } from '@/utils/wbs';
import { installDOMParser } from './xmldom-shim';

declare const process: { exitCode?: number };
installDOMParser();
const S = () => useAppStore.getState();

const fails: string[] = [];
let checks = 0;
function eq(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
  }
}

// MSPDI met een boom van drie niveaus. `codes[i]` is de <WBS> van taak i (in bestandsvolgorde).
const TREE: { name: string; level: number }[] = [
  { name: 'Voorbereiding', level: 1 },
  { name: 'Ontwerp', level: 2 },
  { name: 'Vergunning', level: 2 },
  { name: 'Aanvraag', level: 3 },
  { name: 'Besluit', level: 3 },
  { name: 'Uitvoering', level: 1 },
  { name: 'Fundering', level: 2 },
];
const TREE_CODES = ['1', '1.1', '1.2', '1.2.1', '1.2.2', '2', '2.1'];
function mspdi(codes: readonly string[]): string {
  const tasks = TREE.map((t, i) => `<Task><UID>${i + 1}</UID><ID>${i + 1}</ID><Name>${t.name}</Name>`
    + `<WBS>${codes[i]}</WBS><OutlineLevel>${t.level}</OutlineLevel>`
    + `<Start>2026-01-05T08:00:00</Start><Finish>2026-01-09T17:00:00</Finish><Duration>PT40H0M0S</Duration></Task>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>WBS</Name><StartDate>2026-01-05T08:00:00</StartDate>
<MinutesPerDay>480</MinutesPerDay><Tasks>${tasks}</Tasks></Project>`;
}

function undoEventCount(): number {
  const doc = S().activeDocumentId;
  return S().historyEvents.filter(event => event.state === 'applied'
    && event.deltas.some(delta => delta.kind !== 'grid-preference' && delta.documentId === doc)).length;
}

async function openParsed(parsed: OpenedImport, name: string): Promise<void> {
  S().newProject();
  S().openAsDocument(parsed, { name, ref: null });
}
async function openText(name: string, text: string): Promise<OpenedImport> {
  const parsed = await parseOpenedFile({ name, text });
  await openParsed(parsed, name);
  return parsed;
}
const codesInTreeOrder = () => flattenOrder(S().tasks).map(t => t.wbsCode);

function exports(): { mspdi: string; p6: string; csv: string; ifcCodes: string[] } {
  const st = S();
  const mspdi = writeMSPDI(st.project, st.calendar, st.tasks, st.sequences, st.resources, st.assignments,
    st.calendars, st.baselines, st.activeBaselineId, st.customTaskTypes);
  const p6 = writeP6XMLWithReport(st.project, st.calendar, st.tasks, st.sequences, st.resources, st.assignments,
    st.calendars, st.customTaskTypes, documentProjectCode(st.project, st.xerImportMetadata)).xml;
  const csv = writeCSV(st.project, st.calendar, st.tasks, st.sequences, st.resources, st.assignments, st.customTaskTypes);
  const ifcCodes = flattenOrder(readIFC(writeIFC(buildExportIFCInput(st))).tasks).map(t => t.wbsCode);
  return { mspdi, p6, csv, ifcCodes };
}

async function main(): Promise<void> {
  // (a) Codes gelijk aan de boom ⇒ vlag true; codes ongewijzigd; geen undo-stap; niet gewijzigd.
  const parsedA = await openText('gelijk.xml', mspdi(TREE_CODES));
  eq('a0 bestand draagt geen vlag', activeImportResult(parsedA).project.wbsAutoNumber, undefined);
  eq('a1 vlag na openen', S().project.wbsAutoNumber, true);
  eq('a2 codes ongewijzigd', codesInTreeOrder(), TREE_CODES);
  eq('a3 geen undo-stap', [undoEventCount(), selectUndoHistoryEvent(S().historyEvents, S().activeDocumentId)?.id ?? null], [0, null]);
  eq('a4 document niet gewijzigd', S().isDirty, false);

  // Export schrijft dezelfde codes als vóór de wijziging (vlag weg = de oude stand na openen).
  const withFlag = exports();
  useAppStore.setState(st => { st.project.wbsAutoNumber = undefined; });
  const without = exports();
  eq('a5 MSPDI-export identiek', withFlag.mspdi === without.mspdi, true);
  eq('a6 P6 XML-export identiek', withFlag.p6 === without.p6, true);
  eq('a7 CSV-export identiek', withFlag.csv === without.csv, true);
  eq('a8 IFC-export: zelfde codes', withFlag.ifcCodes, without.ifcCodes);
  eq('a9 IFC-export: codes = bron', withFlag.ifcCodes, TREE_CODES);

  // (a') Na het openen nummert de app live: een ingevoegde taak krijgt geen dubbele code.
  await openText('gelijk.xml', mspdi(TREE_CODES));
  const besluit = S().tasks.find(t => t.name === 'Besluit')!;
  const nieuw = S().addTask({ name: 'Nieuw', position: { anchorId: besluit.id, where: 'above' } });
  let after = codesInTreeOrder();
  eq('a10 geen dubbele code na invoegen', new Set(after).size, after.length);
  S().indentTasks([nieuw]);
  after = codesInTreeOrder();
  eq('a11 geen dubbele code na inspringen', new Set(after).size, after.length);
  eq('a12 nieuwe taak is kind van Aanvraag', S().tasks.find(t => t.id === nieuw)?.wbsCode, '1.2.1.1');

  // (b) Eén afwijkende code ⇒ undefined; codes blijven vrije tekst.
  const B = [...TREE_CODES]; B[4] = '1.2.3';
  await openText('afwijkend.xml', mspdi(B));
  eq('b1 één afwijking ⇒ geen vlag', S().project.wbsAutoNumber, undefined);
  eq('b2 codes ongewijzigd', codesInTreeOrder(), B);
  // Alleen het eerste niveau gelijk is niet genoeg.
  const B2 = [...TREE_CODES]; B2[1] = '1.9';
  await openText('afwijkend2.xml', mspdi(B2));
  eq('b3 dieper niveau wijkt af ⇒ geen vlag', S().project.wbsAutoNumber, undefined);
  // Eigen opbouw (P6-stijl).
  await openText('eigen.xml', mspdi(TREE_CODES.map((_c, i) => `OCEC97${30 + i}`)));
  eq('b4 eigen opbouw ⇒ geen vlag', S().project.wbsAutoNumber, undefined);

  // (c) IFC van de app met vlag false ⇒ blijft false. En met vlag true ⇒ blijft true.
  await openText('gelijk.xml', mspdi(TREE_CODES));
  useAppStore.setState(st => { st.project.wbsAutoNumber = false; });
  const ifcFalse = writeIFC(buildExportIFCInput(S()));
  eq('c0 IFC draagt de vlag false', readIFC(ifcFalse).project.wbsAutoNumber, false);
  await openText('eigen-false.ifc', ifcFalse);
  eq('c1 IFC met vlag false ⇒ blijft false', S().project.wbsAutoNumber, false);
  // IFC zonder vlag (zoals uit een ander pakket) met boomcodes ⇒ true.
  useAppStore.setState(st => { st.project.wbsAutoNumber = undefined; });
  const ifcNone = writeIFC(buildExportIFCInput(S()));
  eq('c2 IFC zonder vlag', readIFC(ifcNone).project.wbsAutoNumber, undefined);
  await openText('derden.ifc', ifcNone);
  eq('c3 IFC zonder vlag + boomcodes ⇒ true', S().project.wbsAutoNumber, true);

  // (d) Lege code ⇒ undefined. (MSPDI vult een lege <WBS> met de UID, dus de lege code komt
  // rechtstreeks in de geparste payload.)
  const parsedD = await parseOpenedFile({ name: 'leeg.xml', text: mspdi(TREE_CODES) });
  const resD = activeImportResult(parsedD);
  const emptyCode: ImportResult = { ...resD, tasks: resD.tasks.map((t, i) => (i === 3 ? { ...t, wbsCode: '' } : t)) };
  await openParsed(emptyCode, 'leeg.xml');
  eq('d1 lege code ⇒ geen vlag', S().project.wbsAutoNumber, undefined);

  // (e) Leeg project ⇒ undefined.
  const emptyProject: ImportResult = { ...resD, tasks: [], sequences: [], assignments: [] };
  await openParsed(emptyProject, 'leeg-project.xml');
  eq('e1 leeg project ⇒ geen vlag', S().project.wbsAutoNumber, undefined);

  // (f) loadState (IFC-paneel, extensie-import) loopt door dezelfde stap.
  S().newProject();
  S().loadState(resD);
  eq('f1 loadState: boomcodes ⇒ true', S().project.wbsAutoNumber, true);
  eq('f2 loadState: geen undo-stap', undoEventCount(), 0);

  if (fails.length) {
    for (const f of fails) console.log(`XX  ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`OK  check-wbs-auto-on-open: ${checks} checks`);
  }
}

main().catch((e) => { console.log(`XX  check-wbs-auto-on-open crasht: ${(e as Error).stack}`); process.exitCode = 1; });
