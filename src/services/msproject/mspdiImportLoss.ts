// Importverslag voor MSPDI (MS Project XML): wat `readMSPDI` NIET overneemt (issue #391, "exchange
// without silent loss"). Puur tellen op de DOM; de lezer zelf blijft ongewijzigd.
//
// Elke categorie hieronder is een element dat `mspdiReader.ts` aantoonbaar niet leest (zie het
// commentaar per regel). Wat de lezer wel overneemt, telt niet: taaknotities (`<Notes>` → omschrijving),
// baseline 0, taak- en resourcekalenders, deadlines, `CriticalSlackLimit`, constraints, het
// standaardtarief (`<StandardRate>` → kostprijs per uur) en de onderbrekingen uit `<TimephasedData>`.
// Terugkerende taken tellen bewust niet: MS Project schrijft de keren als gewone subtaken mee.
import { directChildText } from '@/services/xmlDom';
import { emptyMsProjectImportReport, type MsProjectImportReport } from '@/services/importTypes';

/** Directe kinderen van `parent` met deze tag. MSPDI nest `<Baseline>`, `<ExtendedAttribute>` en
 *  `<TimephasedData>` onder taak, resource en toewijzing; alleen directe kinderen horen bij dit object. */
function directChildren(parent: Element, tagName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (child.localName === tagName || child.tagName === tagName) out.push(child);
  }
  return out;
}

function directChild(parent: Element | undefined, tagName: string): Element | undefined {
  return parent ? directChildren(parent, tagName)[0] : undefined;
}

const nonZero = (text: string): boolean => {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n !== 0;
};

/** Of een `<ExtendedAttribute>` door de lezer zelf is gebruikt (de OPS-transportvelden). */
export type ConsumedExtendedAttribute = (fieldId: string, value: string) => boolean;

/**
 * Telt per categorie wat `readMSPDI` niet overneemt. `isConsumed` zegt welke extended attributes de
 * lezer zelf gebruikte (de OPS-markers), zodat een bestand dat de app zelf schreef geen melding geeft.
 */
export function scanMspdiImportLoss(root: Element, isConsumed: ConsumedExtendedAttribute): MsProjectImportReport {
  const report = emptyMsProjectImportReport('mspdi');
  const customFieldIds = new Set<string>();
  const baselineNumbers = new Set<number>();

  const hasHyperlink = (el: Element) => ['Hyperlink', 'HyperlinkAddress', 'HyperlinkSubAddress']
    .some(tag => directChildText(el, tag) !== '');
  const collectExtendedAttributes = (el: Element) => {
    for (const attr of directChildren(el, 'ExtendedAttribute')) {
      const fieldId = directChildText(attr, 'FieldID');
      const value = directChildText(attr, 'Value');
      if (!fieldId || value === '' || isConsumed(fieldId, value)) continue;
      customFieldIds.add(fieldId);
    }
  };

  const tasks = directChildren(directChild(root, 'Tasks') ?? root, 'Task');
  for (const task of tasks) {
    const uid = Number.parseInt(directChildText(task, 'UID'), 10);
    // Dezelfde regel als de lezer: de projectsamenvattingstaak (UID 0, niveau 0) wordt overgeslagen.
    if (!Number.isFinite(uid) || uid < 0) continue;
    if (uid === 0 && directChildText(task, 'OutlineLevel') === '0') continue;

    // Baselines 1–10: de lezer neemt alleen `<Number>0</Number>` (mspdiReader.ts, "Baseline 0").
    for (const baseline of directChildren(task, 'Baseline')) {
      const number = Number.parseInt(directChildText(baseline, 'Number'), 10);
      if (!Number.isFinite(number) || number < 1 || number > 10) continue;
      if (['Start', 'Finish', 'Duration', 'Work'].some(tag => directChildText(baseline, tag) !== '')) {
        baselineNumbers.add(number);
      }
    }
    collectExtendedAttributes(task);
    if (hasHyperlink(task)) report.hyperlinks++;
    // `<FixedCost>`: de lezer leest geen kosten.
    if (nonZero(directChildText(task, 'FixedCost'))) report.fixedCosts++;
    // `<IsSubproject>`/`<SubprojectName>`: de lezer leest de taak als gewone taak.
    if (directChildText(task, 'IsSubproject') === '1') report.subprojects++;
    // `<ExternalTask>`: een taak uit een ander project; de lezer leest hem als gewone taak.
    if (directChildText(task, 'ExternalTask') === '1') report.externalTasks++;
    // `<Manual>`: de lezer kent het element niet (zie ook de waarschuwing in mspdiWriter.ts).
    if (directChildText(task, 'Manual') === '1') report.manualTasks++;
    // `<LevelingDelay>`: idem.
    if (nonZero(directChildText(task, 'LevelingDelay'))) report.levelingDelays++;
    // `<Active>0`: de lezer kent geen inactieve taak; de taak rekent gewoon mee.
    if (directChildText(task, 'Active') === '0') report.inactiveTasks++;
  }

  for (const resource of directChildren(directChild(root, 'Resources') ?? root, 'Resource')) {
    const uid = Number.parseInt(directChildText(resource, 'UID'), 10);
    if (!Number.isFinite(uid) || uid < 0) continue;
    // Resourcenotities: de lezer zet `description` op ''.
    if (directChildText(resource, 'Notes') !== '') report.notes++;
    collectExtendedAttributes(resource);
    if (hasHyperlink(resource)) report.hyperlinks++;
    // Tarieven: alleen `<StandardRate>` komt mee (kostprijs per uur).
    const rates = directChildren(directChild(resource, 'Rates') ?? resource, 'Rate');
    const tableA = rates.filter(rate => (directChildText(rate, 'RateTable') || '0') === '0');
    const otherTables = rates.filter(rate => (directChildText(rate, 'RateTable') || '0') !== '0');
    const rateLost = nonZero(directChildText(resource, 'OvertimeRate'))
      || nonZero(directChildText(resource, 'CostPerUse'))
      || tableA.length > 1
      || otherTables.some(rate => ['StandardRate', 'OvertimeRate', 'CostPerUse']
        .some(tag => nonZero(directChildText(rate, tag))));
    if (rateLost) report.resourceRates++;
  }

  for (const assignment of directChildren(directChild(root, 'Assignments') ?? root, 'Assignment')) {
    if (directChildText(assignment, 'Notes') !== '') report.notes++;
    collectExtendedAttributes(assignment);
    if (hasHyperlink(assignment)) report.hyperlinks++;
  }

  report.baselines = baselineNumbers.size;
  report.customFields = customFieldIds.size;
  return report;
}
