// Importverslag voor MSPDI (MS Project XML): wat `readMSPDI` NIET overneemt (issue #391, "exchange
// without silent loss"). Puur tellen op de DOM; de lezer zelf blijft ongewijzigd.
//
// Elke categorie hieronder is een element dat `mspdiReader.ts` aantoonbaar niet leest (zie het
// commentaar per regel). Wat de lezer wel overneemt, telt niet: taaknotities (`<Notes>` → omschrijving),
// de datums en duur van Baseline 0 van een taak, taak- en resourcekalenders, deadlines, `CriticalSlackLimit`, constraints, het
// standaardtarief (`<StandardRate>` → kostprijs per uur) en de onderbrekingen uit `<TimephasedData>`.
// Terugkerende taken tellen bewust niet: MS Project schrijft de keren als gewone subtaken mee.
import { directChildText } from '@/services/xmlDom';
import { isoDatePrefixOrToday } from '@/services/importDates';
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

/** Een ISO-duur (`PT80H0M0S`) met een getal ≠ 0. */
const nonZeroDuration = (text: string): boolean => /[1-9]/.test(text);

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

  /**
   * Baselines van een taak, resource of toewijzing. De lezer neemt alleen Baseline 0 van een TAAK over,
   * en daarvan alleen `Start`, `Finish` en `Duration` (mspdiReader.ts, "Baseline 0"). Elke andere
   * baseline met gegevens telt als niet overgenomen; werk of kosten in Baseline 0 tellen apart.
   */
  const collectBaselines = (el: Element) => {
    let workCostLost = false;
    for (const baseline of directChildren(el, 'Baseline')) {
      const number = Number.parseInt(directChildText(baseline, 'Number'), 10);
      if (!Number.isFinite(number) || number < 0 || number > 10) continue;
      const hasDates = ['Start', 'Finish'].some(tag => directChildText(baseline, tag) !== '');
      const hasAmounts = nonZeroDuration(directChildText(baseline, 'Duration'))
        || nonZeroDuration(directChildText(baseline, 'Work'))
        || nonZero(directChildText(baseline, 'Cost'));
      if (number === 0) {
        const workCost = nonZeroDuration(directChildText(baseline, 'Work')) || nonZero(directChildText(baseline, 'Cost'));
        // Op een resource of toewijzing neemt de lezer niets van Baseline 0 over. Werk en kosten tellen
        // hier; de datums van een toewijzing vergelijkt de toewijzingslus met die van de taak.
        if (workCost) workCostLost = true;
      } else if (hasDates || hasAmounts) {
        baselineNumbers.add(number);
      }
    }
    if (workCostLost) report.baselineWorkCost++;
  };

  /**
   * Baseline 0-datums van een element, of `undefined`. Volgens de conventie van de lezer: die bewaart van
   * een taakbaseline de WANDKLOKDATUM (`parseMSPDate` → `isoDatePrefixOrToday`, de eerste tien tekens),
   * zonder zone-omrekening. Vergelijk dus die datum, niet het absolute tijdstip (`Date.parse` hing af
   * van de zone-aanduiding en van de systeemtijdzone; review ronde 3 #392).
   */
  const baseline0Dates = (el: Element): { start?: string; finish?: string } | undefined => {
    const baseline = directChildren(el, 'Baseline').find(b => directChildText(b, 'Number') === '0');
    if (!baseline) return undefined;
    const at = (tag: string) => {
      const raw = directChildText(baseline, tag);
      return raw ? isoDatePrefixOrToday(raw) : undefined;
    };
    return { start: at('Start'), finish: at('Finish') };
  };
  /** Baseline 0-datums per taak-UID: die komen WEL over (de taakbaseline van de lezer). */
  const taskBaseline0 = new Map<string, { start?: string; finish?: string }>();

  const hasHyperlink = (el: Element) => ['Hyperlink', 'HyperlinkAddress', 'HyperlinkSubAddress']
    .some(tag => directChildText(el, tag) !== '');
  /** Eigen velden: `<ExtendedAttribute>` met een waarde (`Value`) of een opzoekwaarde (`ValueID`/
   *  `ValueGUID`), en ingevulde overzichtscodes (`<OutlineCode>` met `ValueID`/`ValueGUID`). De lezer
   *  leest van beide alleen de OPS-transportvelden. */
  const collectExtendedAttributes = (el: Element) => {
    for (const attr of directChildren(el, 'ExtendedAttribute')) {
      const fieldId = directChildText(attr, 'FieldID');
      const value = directChildText(attr, 'Value');
      const lookup = directChildText(attr, 'ValueID') !== '' || directChildText(attr, 'ValueGUID') !== '';
      if (!fieldId || (value === '' && !lookup) || isConsumed(fieldId, value)) continue;
      customFieldIds.add(fieldId);
    }
    for (const code of directChildren(el, 'OutlineCode')) {
      const fieldId = directChildText(code, 'FieldID');
      if (!fieldId || (directChildText(code, 'ValueID') === '' && directChildText(code, 'ValueGUID') === '')) continue;
      customFieldIds.add(`outline:${fieldId}`);
    }
  };

  const tasks = directChildren(directChild(root, 'Tasks') ?? root, 'Task');
  for (const task of tasks) {
    const uid = Number.parseInt(directChildText(task, 'UID'), 10);
    // Dezelfde regel als de lezer: de projectsamenvattingstaak (UID 0, niveau 0) wordt overgeslagen.
    if (!Number.isFinite(uid) || uid < 0) continue;
    if (uid === 0 && directChildText(task, 'OutlineLevel') === '0') continue;

    collectBaselines(task);
    const taskDates = baseline0Dates(task);
    if (taskDates) taskBaseline0.set(String(uid), taskDates);
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
    collectBaselines(resource);
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
    collectBaselines(assignment);
    // Baseline 0-datums van een toewijzing: de app bewaart alleen de taakbaseline. Gelijk aan die van
    // de taak ⇒ niets verloren; wijkt een datum af (of heeft de taak er geen), dan gaat die afwijking
    // verloren (orkestratorbesluit fixronde 2 #392: alleen afwijkingen melden, anders krijgt bijna elk
    // bestand met een baseline een melding).
    const own = baseline0Dates(assignment);
    if (own) {
      const ofTask = taskBaseline0.get(directChildText(assignment, 'TaskUID'));
      const differs = (['start', 'finish'] as const)
        .some(key => own[key] !== undefined && own[key] !== ofTask?.[key]);
      if (differs) report.assignmentBaselineDates++;
    }
    collectExtendedAttributes(assignment);
    if (hasHyperlink(assignment)) report.hyperlinks++;
  }

  report.baselines = baselineNumbers.size;
  report.customFields = customFieldIds.size;
  return report;
}
