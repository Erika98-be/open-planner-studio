// P6 XML openen via de echte open-pijplijn: `parseOpenedFile` (formatRegistry) → `applyOpenedImport`
// (store). Bewaakt de ene openingsmelding van een P6 XML-bestand (`p6xmlImportNotice`):
// - geen leesbare activiteit ⇒ foutmelding "geen activiteiten", met de reden als die bekend is
//   (activiteiten zonder ObjectId; XER-kolomnamen in XML);
// - een gewoon bestand met één project ⇒ geen melding.
// Corpusloos (CI). Fixtures: inline, zelf geschreven.
import { readFileSync } from 'node:fs';
import { parseOpenedFile } from '@/services/formatRegistry';
import { useAppStore } from '@/state/appStore';
import { p6xmlImportNotice } from '@/state/slices/fileSlice';
import { activeImportResult, isMultiDocumentImport, type OpenedImport } from '@/services/importTypes';
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

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>
<APIBusinessObjects xmlns="http://xmlns.oracle.com/Primavera/P6/V8.3/API/BusinessObjects">${inner}</APIBusinessObjects>`;

// Zoals Hospital_GW_Programme: activiteiten zonder ObjectId, relaties via ActivityId.
const NO_OBJECT_IDS = wrap(`<Project><Name>Zonder ObjectId</Name><PlannedStartDate>2026-02-02T08:00:00</PlannedStartDate>
  <Activity><Id>A1</Id><Name>Fundering</Name><PlannedDuration>40</PlannedDuration>
    <PlannedStartDate>2026-02-02T08:00:00</PlannedStartDate><PlannedFinishDate>2026-02-06T17:00:00</PlannedFinishDate></Activity>
  <Relationship><PredecessorActivityId>A1</PredecessorActivityId><SuccessorActivityId>A2</SuccessorActivityId></Relationship>
</Project>`);
// Zoals MER-1-2026: XER-kolomnamen in een XML-jas.
const XER_COLUMNS = wrap(`<Project><ObjectId>1001</ObjectId><Name>XER in XML</Name>
  <Activity><task_id>1</task_id><task_code>A-1</task_code><task_name>Inkoop</task_name></Activity>
</Project>`);
const NO_ACTIVITIES = wrap(`<Project><ObjectId>7</ObjectId><Name>Leeg</Name></Project>`);
const ONE_PROJECT = wrap(`<Project><ObjectId>7</ObjectId><Name>Gewoon</Name><PlannedStartDate>2026-02-02T08:00:00</PlannedStartDate>
  <Activity><ObjectId>70</ObjectId><Id>A1</Id><Name>Fundering</Name><PlannedDuration>40</PlannedDuration>
    <PlannedStartDate>2026-02-02T08:00:00</PlannedStartDate><PlannedFinishDate>2026-02-06T17:00:00</PlannedFinishDate></Activity>
</Project>`);

async function open(name: string, text: string): Promise<OpenedImport> {
  const parsed = await parseOpenedFile({ name, text });
  S().newProject();
  useAppStore.setState(st => { st.ui.notifications = []; });
  S().applyOpenedImport(parsed, { filePath: null, recompute: true, fit: false, hourDataNotice: false, linkedOpen: true });
  return parsed;
}
const lastNotice = () => S().ui.notifications[S().ui.notifications.length - 1];
const noticeOf = (parsed: OpenedImport) => p6xmlImportNotice(isMultiDocumentImport(parsed) ? parsed.results : [parsed]);

async function main(): Promise<void> {
  // (1) Activiteiten zonder ObjectId.
  let parsed = await open('zonder-objectid.xml', NO_OBJECT_IDS);
  eq('1a geen taken', activeImportResult(parsed).tasks.filter(t => t.childIds.length === 0).length, 0);
  eq('1b reden', activeImportResult(parsed).p6xmlReport?.emptyReason, 'no-object-ids');
  eq('1c melding (store)', [lastNotice()?.severity, lastNotice()?.messageKey, lastNotice()?.detailLines?.map(l => l.messageKey)],
    ['error', 'notifications.p6xmlImportEmpty', ['notifications.p6xmlImportEmptyNoObjectIds']]);

  // (2) XER-kolomnamen in XML.
  parsed = await open('xer-in-xml.xml', XER_COLUMNS);
  eq('2a reden', activeImportResult(parsed).p6xmlReport?.emptyReason, 'xer-columns');
  eq('2b melding (store)', [lastNotice()?.messageKey, lastNotice()?.detailLines?.map(l => l.messageKey)],
    ['notifications.p6xmlImportEmpty', ['notifications.p6xmlImportEmptyXerColumns']]);

  // (3) Geen activiteiten: melding zonder reden-regel.
  parsed = await open('leeg.xml', NO_ACTIVITIES);
  eq('3 melding zonder detailregel', [noticeOf(parsed)?.messageKey, noticeOf(parsed)?.detailLines], ['notifications.p6xmlImportEmpty', undefined]);

  // (4) Gewoon bestand met één project: geen P6 XML-melding.
  parsed = await open('gewoon.xml', ONE_PROJECT);
  eq('4a één taak', activeImportResult(parsed).tasks.length, 1);
  eq('4b geen melding', noticeOf(parsed), undefined);
  eq('4c geen p6xml-melding in de store', S().ui.notifications.some(n => n.messageKey.startsWith('notifications.p6xml')), false);

  // (6) Meerdere projecten: één tabblad per project mét activiteiten, actief = meeste activiteiten,
  //     één verslag (geen melding per document).
  const fixture = readFileSync(new URL('./fixtures/p6xml-genest-meerdere-projecten.xml', import.meta.url), 'utf8');
  useAppStore.setState(st => { st.ui.notifications = []; });
  S().newProject();
  const docsBefore = S().documents.length;
  const multi = await parseOpenedFile({ name: 'meerdere.xml', text: fixture });
  const outcome = S().applyOpenedImport(multi, { filePath: null, recompute: true, fit: false, hourDataNotice: false, linkedOpen: true });
  eq('6a twee documenten geopend (leeg tabblad hergebruikt)', [outcome.documentIds.length, S().documents.length - docsBefore], [2, 1]);
  eq('6b actief document = B', S().project.name, 'Project B & bouw');
  eq('6c B: actieve baseline', S().activeBaselineId?.startsWith('p6xml-baseline:200:201'), true);
  const p6Notices = S().ui.notifications.filter(n => n.messageKey.startsWith('notifications.p6xml'));
  eq('6d één verslag', p6Notices.map(n => [n.severity, n.messageKey, n.params]), [['info', 'notifications.p6xmlImportOpened', { count: 2 }]]);
  eq('6e detailregels', p6Notices[0]?.detailLines?.map(l => [l.messageKey, l.params?.count]), [
    ['notifications.xerImportProjectsSeen', 3],
    ['notifications.xerImportEmptyProjectsSkipped', 1],
    ['notifications.xerImportBaselinesMaterialized', 2],
    ['notifications.p6xmlImportCrossProjectRelations', 1],
  ]);

  // (5) De sleutels bestaan in nl en en (geen lege toast).
  for (const loc of ['nl', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${loc}/common.json`, import.meta.url), 'utf8')) as { notifications: Record<string, string> };
    for (const key of ['p6xmlImportEmpty', 'p6xmlImportEmptyNoObjectIds', 'p6xmlImportEmptyXerColumns', 'p6xmlImportOpened_one', 'p6xmlImportOpened_other', 'p6xmlImportCrossProjectRelations_one', 'p6xmlImportCrossProjectRelations_other']) {
      eq(`5 ${loc}: ${key}`, typeof json.notifications[key], 'string');
    }
  }
}

main().then(() => {
  if (fails.length > 0) {
    for (const f of fails) console.log(`XX  p6xml-open-notice: ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`OK  p6xml-open-notice: ${checks} controles groen`);
  }
}, (e: unknown) => {
  console.log(`XX  p6xml-open-notice: uitzondering ${(e as Error).stack}`);
  process.exitCode = 1;
});
