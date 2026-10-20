// MSPDI (MS Project XML) openen via de echte open-pijplijn: `parseOpenedFile` (formatRegistry) →
// `applyOpenedImport` (store). Bewaakt het importverslag (issue #391, `mspdiImportLoss.ts` +
// `msProjectImportNotice`):
// - een bestand met in elke categorie iets dat `readMSPDI` niet overneemt ⇒ één melding met per
//   categorie een regel en de juiste telling;
// - die melding blijft staan tot het kruisje (`sticky`), want er is data weggelaten;
// - wat de lezer wel overneemt (taakaantekening, baseline 0, standaardtarief) telt niet: een schoon
//   bestand ⇒ geen verslag en geen melding;
// - een bestand dat de app zelf schreef (met haar eigen transportvelden) ⇒ ook geen melding.
// Corpusloos (CI). Fixtures: inline, zelf geschreven; de elementnamen volgen de MSPDI-voorbeelden
// van MPXJ (`junit/data/mspdi*.xml`).
import { readFileSync } from 'node:fs';
import { parseOpenedFile } from '@/services/formatRegistry';
import { useAppStore } from '@/state/appStore';
import { msProjectImportNotice } from '@/state/msProjectImportNotice';
import { readMSPDI } from '@/services/msproject/mspdiReader';
import { writeMSPDI } from '@/services/msproject/mspdiWriter';
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

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Verslag</Name><StartDate>2026-03-02T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay>
  ${inner}
</Project>`;

const task = (uid: number, name: string, extra = '') => `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${name}</Name>
  <OutlineLevel>1</OutlineLevel><Start>2026-03-02T08:00:00</Start><Finish>2026-03-03T17:00:00</Finish>
  <Duration>PT16H0M0S</Duration>${extra}</Task>`;
const baseline = (n: number) => `<Baseline><Number>${n}</Number><Start>2026-03-02T08:00:00</Start>
  <Finish>2026-03-03T17:00:00</Finish><Duration>PT16H0M0S</Duration></Baseline>`;

/** Elke categorie één keer of meer; de verwachte tellingen staan bij (2b). */
const LOSSY = wrap(`<Tasks>
  <Task><UID>0</UID><ID>0</ID><Name>Verslag</Name><OutlineLevel>0</OutlineLevel><Notes>Samenvatting telt niet</Notes></Task>
  ${task(1, 'Fundering', `<Notes>Taakaantekening komt mee</Notes>${baseline(0)}${baseline(1)}${baseline(2)}
    <Hyperlink>Tekening</Hyperlink><HyperlinkAddress>https://example.org/fundering.pdf</HyperlinkAddress>
    <FixedCost>25000</FixedCost><Manual>1</Manual><LevelingDelay>4800</LevelingDelay>
    <ExtendedAttribute><FieldID>188743731</FieldID><Value>Kavel 3</Value></ExtendedAttribute>
    <ExtendedAttribute><FieldID>188743734</FieldID><Value>Noord</Value></ExtendedAttribute>`)}
  ${task(2, 'Deelproject installaties', '<IsSubproject>1</IsSubproject><SubprojectName>C:\\\\plan\\\\installaties.mpp</SubprojectName>')}
  ${task(3, 'Oplevering (extern)', '<ExternalTask>1</ExternalTask>')}
  ${task(4, 'Reserve', '<Active>0</Active><Baseline><Number>1</Number><Start>2026-03-02T08:00:00</Start></Baseline>')}
</Tasks>
<Resources>
  <Resource><UID>0</UID><ID>0</ID><Name>Niet toegekend</Name><Type>1</Type></Resource>
  <Resource><UID>1</UID><ID>1</ID><Name>Timmerman</Name><Type>1</Type><StandardRate>50</StandardRate>
    <OvertimeRate>75</OvertimeRate><Notes>Alleen ochtenden</Notes>
    <ExtendedAttribute><FieldID>205520904</FieldID><Value>Ploeg A</Value></ExtendedAttribute></Resource>
  <Resource><UID>2</UID><ID>2</ID><Name>Kraan</Name><Type>1</Type><StandardRate>120</StandardRate>
    <Rates><Rate><RatesFrom>1984-01-01T00:00:00</RatesFrom><RatesTo>2049-12-31T23:59:00</RatesTo><RateTable>0</RateTable><StandardRate>120</StandardRate></Rate>
      <Rate><RatesFrom>1984-01-01T00:00:00</RatesFrom><RatesTo>2049-12-31T23:59:00</RatesTo><RateTable>1</RateTable><StandardRate>150</StandardRate></Rate></Rates></Resource>
</Resources>
<Assignments>
  <Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units><Notes>Met ploeg A</Notes>
    <HyperlinkAddress>https://example.org/ploeg</HyperlinkAddress></Assignment>
</Assignments>`);

/** Wat de lezer wél overneemt: taakaantekening, baseline 0, standaardtarief, een kalender; plus
 *  lege of nul-waarden in de verliescategorieën. */
const CLEAN = wrap(`<Tasks>
  ${task(1, 'Fundering', `<Notes>Taakaantekening komt mee</Notes>${baseline(0)}<FixedCost>0</FixedCost><Manual>0</Manual>
    <LevelingDelay>0</LevelingDelay><Active>1</Active><IsSubproject>0</IsSubproject><ExternalTask>0</ExternalTask><Hyperlink></Hyperlink>
    <Baseline><Number>1</Number></Baseline>`)}
  ${task(2, 'Metselwerk', '<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink>')}
</Tasks>
<Resources>
  <Resource><UID>1</UID><ID>1</ID><Name>Timmerman</Name><Type>1</Type><StandardRate>50</StandardRate><OvertimeRate>0</OvertimeRate><CostPerUse>0</CostPerUse>
    <Rates><Rate><RatesFrom>1984-01-01T00:00:00</RatesFrom><RatesTo>2049-12-31T23:59:00</RatesTo><RateTable>0</RateTable><StandardRate>50</StandardRate></Rate>
      <Rate><RatesFrom>1984-01-01T00:00:00</RatesFrom><RatesTo>2049-12-31T23:59:00</RatesTo><RateTable>1</RateTable><StandardRate>0</StandardRate></Rate></Rates></Resource>
</Resources>
<Assignments><Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units></Assignment></Assignments>`);

async function open(name: string, text: string): Promise<OpenedImport> {
  const parsed = await parseOpenedFile({ name, text });
  S().newProject();
  useAppStore.setState(st => { st.ui.notifications = []; });
  S().applyOpenedImport(parsed, { filePath: null, recompute: true, fit: false, hourDataNotice: false, linkedOpen: true });
  return parsed;
}
const resultsOf = (parsed: OpenedImport) => isMultiDocumentImport(parsed) ? parsed.results : [parsed];

async function main(): Promise<void> {
  // (1) Elke categorie: de telling uit de lezer.
  let parsed = await open('verslag.xml', LOSSY);
  const result = activeImportResult(parsed);
  eq('1a vier taken ingelezen (ook subproject, externe en inactieve taak)', result.tasks.map(t => t.name),
    ['Fundering', 'Deelproject installaties', 'Oplevering (extern)', 'Reserve']);
  eq('1b verslag', result.msProjectReport, {
    format: 'mspdi', baselines: 2, baselineWorkCost: 0, customFields: 3, notes: 2, hyperlinks: 2, fixedCosts: 1, resourceRates: 2,
    subprojects: 1, externalTasks: 1, manualTasks: 1, levelingDelays: 1, inactiveTasks: 1, criticalSlackLimitDays: 0,
  });
  // Wat de lezer wél overneemt, telt niet: de taakaantekening, baseline 0 en het standaardtarief.
  eq('1c taakaantekening overgenomen', result.tasks[0]?.description, 'Taakaantekening komt mee');
  eq('1d baseline 0 overgenomen', result.baselines?.length, 1);
  eq('1e standaardtarief overgenomen', result.resources.map(r => r.costPerHour), [undefined, 50, 120]);
  eq('1f handmatige taak is automatisch gepland ingelezen', result.tasks[0]?.manuallyScheduled, undefined);

  // (2) Eén melding, met per categorie een regel; geen rekenprofielregel (MSPDI opent als OPS).
  const notices = S().ui.notifications.filter(n => n.messageKey === 'notifications.msProjectImportLoss');
  eq('2a één verslag', notices.length, 1);
  const notice = notices[0];
  eq('2b regels', notice?.detailLines?.filter(l => l.messageKey !== 'notifications.importDatesAsRecorded')
    .map(l => [l.messageKey, l.params?.count]), [
    ['notifications.msProjectLostSubprojects', 1],
    ['notifications.msProjectLostExternalTasks', 1],
    ['notifications.msProjectLostInactiveTasks', 1],
    ['notifications.msProjectLostManualTasks', 1],
    ['notifications.msProjectLostLevelingDelays', 1],
    ['notifications.msProjectLostExtraBaselines', 2],
    ['notifications.msProjectLostCustomFields', 3],
    ['notifications.msProjectLostNotes', 2],
    ['notifications.msProjectLostHyperlinks', 2],
    ['notifications.msProjectLostFixedCosts', 1],
    ['notifications.msProjectLostResourceRates', 2],
  ]);
  eq('2c info, blijft staan, gids', [notice?.severity, notice?.sticky, notice?.helpArticleId], ['info', true, 'howto-mpp-openen']);

  // (3) Schoon bestand: geen verslag, geen melding.
  parsed = await open('schoon.xml', CLEAN);
  eq('3a geen verslag', activeImportResult(parsed).msProjectReport, undefined);
  eq('3b geen melding', msProjectImportNotice(resultsOf(parsed)), undefined);
  eq('3c geen verslag in de store', S().ui.notifications.some(n => n.messageKey === 'notifications.msProjectImportLoss'), false);

  // (4) Een bestand dat de app zelf schreef: haar transportvelden (duureenheid, soort mijlpaal,
  //     eigen taaktype) zijn geen verloren eigen velden.
  const own = readMSPDI(CLEAN);
  const customTaskTypes = [{ id: 'ctt-1', name: 'Keuring' }];
  own.tasks[0]!.customTaskTypeId = 'ctt-1';
  own.tasks[0]!.taskType = 'USERDEFINED';
  own.tasks[1]!.isMilestone = true;
  own.tasks[1]!.milestoneKind = 'FINISH';
  const written = writeMSPDI(own.project, own.calendar, own.tasks, own.sequences, own.resources, own.assignments,
    own.resourceCalendars ?? [], own.baselines ?? [], own.activeBaselineId ?? null, customTaskTypes);
  eq('4a de app schrijft haar eigen velden', ['188744016', '188744015', '188743731'].map(id => written.includes(`<FieldID>${id}</FieldID>`)), [true, true, true]);
  const reread = readMSPDI(written);
  eq('4b eigen taaktype teruggelezen', reread.tasks[0]?.customTaskTypeId, 'ctt-1');
  eq('4c geen verslag bij een eigen bestand', reread.msProjectReport, undefined);

  // (6) Regressies uit de review van #392.
  const only = (inner: string) => readMSPDI(wrap(`<Tasks>${task(1, 'Fundering', inner)}</Tasks>`)).msProjectReport;
  // 6a/6b Overzichtscode en opzoekwaarde: MSPDI bewaart ze zonder `<Value>`; de lezer leest ze niet.
  eq('6a alleen een ingevulde overzichtscode', only(`<OutlineCode><FieldID>188744096</FieldID><ValueID>1</ValueID>
    <ValueGUID>47FA4ABF-2BDE-4397-8F4A-D44F2E2B1ACD</ValueGUID></OutlineCode>`)?.customFields, 1);
  eq('6b alleen een opzoekwaarde (ValueID, geen Value)', only(`<ExtendedAttribute><FieldID>188743734</FieldID><ValueID>3</ValueID></ExtendedAttribute>`)?.customFields, 1);
  // 6c Baseline 0 komt mee met datums en duur, niet met werk en kosten.
  const workCost = only(`<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start><Finish>2026-03-03T17:00:00</Finish>
    <Duration>PT16H0M0S</Duration><Work>PT80H0M0S</Work><Cost>25000</Cost></Baseline>`);
  eq('6c baseline 0 met werk en kosten', [workCost?.baselines, workCost?.baselineWorkCost], [0, 1]);
  eq('6c2 baseline 0 met nul-werk en nul-kosten: niets verloren', only(`<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start>
    <Work>PT0H0M0S</Work><Cost>0</Cost></Baseline>`), undefined);
  // 6d Baselines op toewijzingen en resources.
  const onAssignment = readMSPDI(wrap(`<Tasks>${task(1, 'Fundering')}</Tasks>
    <Resources><Resource><UID>1</UID><ID>1</ID><Name>Timmerman</Name><Type>1</Type>
      <Baseline><Number>0</Number><Work>PT16H0M0S</Work></Baseline></Resource></Resources>
    <Assignments><Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units>
      <Baseline><Number>1</Number><Start>2026-03-02T08:00:00</Start><Work>PT16H0M0S</Work></Baseline></Assignment></Assignments>`)).msProjectReport;
  eq('6d baseline 1 op een toewijzing, baseline 0-werk op een resource', [onAssignment?.baselines, onAssignment?.baselineWorkCost], [1, 1]);
  // 6e De baselinezin beweert niets over Baseline 0.
  for (const loc of ['nl', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${loc}/common.json`, import.meta.url), 'utf8')) as { notifications: Record<string, string> };
    eq(`6e ${loc}: baselinezin noemt Baseline 0 niet`, ['msProjectLostExtraBaselines_one', 'msProjectLostExtraBaselines_other']
      .map(key => json.notifications[key]?.includes('Baseline 0')), [false, false]);
  }

  // (5) De sleutels bestaan in nl en en (geen lege toast).
  for (const loc of ['nl', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${loc}/common.json`, import.meta.url), 'utf8')) as { notifications: Record<string, string> };
    for (const key of ['msProjectImportLoss', 'msProjectLostBaselineWorkCost_one', 'msProjectLostBaselineWorkCost_other', 'msProjectLostExtraBaselines_one', 'msProjectLostExtraBaselines_other',
      'msProjectLostManualTasks_one', 'msProjectLostManualTasks_other', 'msProjectLostInactiveTasks_one', 'msProjectLostInactiveTasks_other']) {
      eq(`5 ${loc}: ${key}`, typeof json.notifications[key], 'string');
    }
  }
}

main().then(() => {
  if (fails.length > 0) {
    for (const f of fails) console.log(`XX  mspdi-open-notice: ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`OK  mspdi-open-notice: ${checks} controles groen`);
  }
}, (e: unknown) => {
  console.log(`XX  mspdi-open-notice: uitzondering ${(e as Error).stack}`);
  process.exitCode = 1;
});
