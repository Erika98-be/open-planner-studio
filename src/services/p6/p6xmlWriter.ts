import { Task, TaskConstraint } from '@/types/task';
import { Sequence, SequenceType } from '@/types/sequence';
import { Resource, ResourceAssignment, ResourceType, ResourceCurve } from '@/types/resource';
import {
  CONTOUR_SHAPE_VALUES, CURVE_TO_SHAPE, isFlatCurveValues, matchContoursToAssignments,
} from '@/engine/contour/contourEngine';
import { contourPeriodsToP6Spread, countSplitTasksWithoutContour } from '@/services/contourIo';
import { Project } from '@/types/project';
import { holidayEndDate, WorkCalendar } from '@/types/calendar';
import { exportCalendarLayout, minutesToClock, taskMinutesForWrite } from '@/services/subdayIo';
import { effectiveWorkTimeBands } from '@/utils/effectiveWorkTime';
import { projectFileBase } from '@/utils/documents';
import { isLeafTask, isSummaryTask } from '@/utils/taskHierarchy';
import { flattenOrder } from '@/utils/wbs';
import type { CustomTaskType } from '@/types/taskType';
import { encodeCustomTaskType, OPS_DURATION_UNIT_NAME, toXmlDateTime } from '@/services/xmlInterchange';
import { leaf, node, renderP6Xml, P6_ID_MAX_LENGTH, type P6Node } from './p6xmlSchemaOrder';
import { taskDurationUnit } from '@/engine/scheduler/duration';
import { shownStart, shownFinish } from '@/utils/taskDates';
import { P6_DURATION_TYPE_NAME, XER_DURATION_TYPE_TOKEN } from '@/engine/work/workRuleMapping';

/** P6-UDF die de OPS-taaktypemarker draagt; geëxporteerd voor de reader. */
export const OPS_CUSTOM_TASK_TYPE_UDF_TITLE = 'OPS Custom Task Type';
const OPS_CUSTOM_TASK_TYPE_UDF_OBJECT_ID = 900000001;

/** OPS-eigen, schema-native P6-UDF (titel `OPS_DURATION_UNIT_NAME`) waarmee gemengde
 *  dag-/urentaken exact terugkomen. */
const OPS_P6_DURATION_UNIT_UDF_OBJECT_ID = 1;

// Curve-/contour-naammapping. De curve wordt SCHEMA-NATIEF geschreven als `<ResourceCurve>`-object
// (21 waarden, MPXJ `XmlContextWriter.writeResourceCurves`) plus `<ResourceCurveObjectId>` op de
// toewijzing; de naam hieronder is alleen het `<Name>`-veld van dat object. `<PlannedCurve>` is een
// spreidingsstring (zie `contourIo.ts`), geen curvenaam.
const P6_CURVE_TO_NAME: Record<ResourceCurve, string | undefined> = {
  UNIFORM: undefined,
  FRONT_LOADED: 'Front Loaded',
  BACK_LOADED: 'Back Loaded',
  BELL: 'Bell Shaped',
  EARLY_PEAK: 'Early Peak',
  LATE_PEAK: 'Late Peak',
  // LET OP: dit is alleen het LABEL van het `<ResourceCurve>`-object; de 21 waarden zijn de MS
  // Project-tabel (`CONTOUR_SHAPE_VALUES`), niet P6's eigen "Double Peak"/"Trapezoidal"-tabel — de
  // lezer matcht eerst op waarden, pas dan op naam.
  DOUBLE_PEAK: 'Double Peak',
  TURTLE: 'Turtle',
};

// Inkomende richting (P6-curvenaam → OPS-curve), gebruikt door de reader. Niet afleidbaar uit
// P6_CURVE_TO_NAME: P6's default-naam 'Linear' → UNIFORM, terwijl de writer UNIFORM juist als afwezig
// element schrijft.
export const P6_NAME_TO_CURVE: Record<string, ResourceCurve> = {
  'Linear': 'UNIFORM',
  'Front Loaded': 'FRONT_LOADED',
  'Back Loaded': 'BACK_LOADED',
  'Bell Shaped': 'BELL',
  'Early Peak': 'EARLY_PEAK',
  'Late Peak': 'LATE_PEAK',
  'Double Peak': 'DOUBLE_PEAK',
  'Turtle': 'TURTLE',
};

function resourceTypeToP6(type: ResourceType): 'Labor' | 'Nonlabor' | 'Material' {
  switch (type) {
    case 'LABOR':
    case 'CREW':
      return 'Labor';
    case 'MATERIAL':
      return 'Material';
    case 'EQUIPMENT':
    case 'SUBCONTRACTOR':
      return 'Nonlabor';
  }
}

/** P6-relatietype per OPS-relatietype, zoals PMXML het schrijft (`<Type>Finish to Start</Type>`;
 *  MPXJ `RelationTypeHelper`). De reader leest de inverse, plus de XER-tokens (`PR_FS` …) die
 *  oudere OPS-exports in P6 XML schreven (`P6_LEGACY_LINK_TYPE`). */
export const P6_LINK_TYPE: Record<SequenceType, string> = {
  FINISH_START: 'Finish to Start',
  FINISH_FINISH: 'Finish to Finish',
  START_START: 'Start to Start',
  START_FINISH: 'Start to Finish',
};

/** XER-tokens die OPS vóór 2026-10 in P6 XML schreef; alleen voor de reader. */
export const P6_LEGACY_LINK_TYPE: Record<SequenceType, string> = {
  FINISH_START: 'PR_FS',
  FINISH_FINISH: 'PR_FF',
  START_START: 'PR_SS',
  START_FINISH: 'PR_SF',
};

/** NotebookTopic voor de taakbeschrijving (`<ActivityNote>`); de reader herkent hem aan de naam. */
export const OPS_DESCRIPTION_TOPIC_NAME = 'OPS Description';
const OPS_DESCRIPTION_TOPIC_OBJECT_ID = 900000002;

/**
 * OPS-constraint → P6 `CS_*`-code. Soft-typen mappen 1-op-1 op P6's soft constraints
 * (`CS_MSO/MSOA/MSOB/MEO/MEOA/MEOB/ALAP`); de logica-brekende harde MSO/MFO-pin op
 * `CS_MANDSTART`/`CS_MANDFIN` (P6 kent soft én hard native). `ASAP` ⇒ geen constraint ⇒ `undefined`.
 * De P6-XML-elementnamen (`PrimaryConstraintType` etc.) volgen de MPXJ-PMXML-conventie
 * (github.com/joniles/mpxj — PrimaveraPMFileWriter); alleen de XER-kolomnamen (`cstr_type`) zijn
 * tegen Oracle-documentatie geverifieerd.
 */
function p6ConstraintCode(c: TaskConstraint): string | undefined {
  switch (c.type) {
    case 'ASAP': return undefined;
    case 'ALAP': return 'CS_ALAP';
    case 'SNET': return 'CS_MSOA';
    case 'SNLT': return 'CS_MSOB';
    case 'FNET': return 'CS_MEOA';
    case 'FNLT': return 'CS_MEOB';
    case 'MSO': return c.hard ? 'CS_MANDSTART' : 'CS_MSO';
    case 'MFO': return c.hard ? 'CS_MANDFIN' : 'CS_MEO';
  }
}

/** Status zoals P6 hem leest: in lijn met voortgang en actuals (in OPS kan `task.status` achterlopen
 *  op een gewijzigd percentage; P6 laat de status leiden). */
function taskStatusToP6(task: Task): string {
  if (task.status === 'COMPLETED' || task.time.actualFinish || task.time.completion >= 1) return 'Completed';
  if (task.status === 'STARTED' || task.time.actualStart || task.time.completion > 0) return 'In Progress';
  return 'Not Started';
}

/** XER-token → PMXML-label, via de gedeelde tabel in `workRuleMapping.ts` (Oracle-datamap). */
function p6LabelForToken(token: string): string | undefined {
  for (const [rule, t] of Object.entries(XER_DURATION_TYPE_TOKEN) as [keyof typeof P6_DURATION_TYPE_NAME, string][]) {
    if (t === token) return P6_DURATION_TYPE_NAME[rule];
  }
  return undefined;
}

function taskTypeToP6(task: Task): string {
  if (task.isMilestone) {
    // De expliciete soort bepaalt het P6-activitytype; automatisch ⇒ Start Milestone (P6's eigen
    // default bij import).
    return task.milestoneKind === 'FINISH' ? 'Finish Milestone' : 'Start Milestone';
  }
  if (isSummaryTask(task)) return 'WBS Summary';
  return 'Task Dependent';
}

function durationToP6Hours(days: number, hoursPerDay: number): number {
  return days * hoursPerDay;
}

// ISO-dagnummer (1=maandag..7=zondag) -> P6/Engelse dagnaam. Geëxporteerd zodat de reader de naam
// terug naar een ISO-dagnummer kan resolven.
export const P6_DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** P6-eindtijd = de LAATSTE minuut van een blok (08:00–16:00 ⇒ `15:59:00`), zoals P6 en MPXJ
 *  (`XmlWriter`: einde − 1 minuut). De reader telt er bij een OPS-export weer één minuut bij op. */
function p6FinishClock(endMinutes: number): string {
  return minutesToClock(endMinutes - 1);
}

function workTimeNodes(bands: readonly { start: number; end: number }[]): P6Node[] {
  return bands.map(b => node('WorkTime', [...leaf('Start', minutesToClock(b.start)), ...leaf('Finish', p6FinishClock(b.end))]));
}

/** De banden van één weekdag: de uurbanden, anders het scalaire blok op een werkdag. */
function weekdayBands(cal: WorkCalendar, workTime: ReturnType<typeof effectiveWorkTimeBands> | undefined, day: number): { start: number; end: number }[] {
  if (workTime) return [...(workTime.byWeekday[day as 1] ?? [])];
  return cal.workDays.includes(day) ? [{ start: cal.workStartHour * 60, end: cal.workEndHour * 60 }] : [];
}

/** Werkweek: `<StandardWorkWeek>` met per dag een `<StandardWorkHours>` (Oracle-schema). Een
 *  niet-werkdag krijgt `<WorkTime xsi:nil="true"/>` (WorkTime is verplicht in het schema). Een
 *  wrap-band (`end > 1440`) emitteert het eind als tijd-van-de-dag; de reader herkent de wrap. */
function standardWorkWeekNode(cal: WorkCalendar, includeEffectiveScalarBands: boolean): P6Node {
  const workTime = cal.workTime ?? (includeEffectiveScalarBands ? effectiveWorkTimeBands(cal) : undefined);
  const days: P6Node[] = [];
  for (let day = 1; day <= 7; day++) {
    const bands = weekdayBands(cal, workTime, day);
    days.push(node('StandardWorkHours', [
      ...leaf('DayOfWeek', P6_DAY_NAMES[day]),
      ...(bands.length > 0 ? workTimeNodes(bands) : [{ tag: 'WorkTime', nil: true }]),
    ]));
  }
  return node('StandardWorkWeek', days);
}

/** Alle ISO-datums van `start` t/m `end` (UTC-rekenen, tijdzone-onafhankelijk; begrensd). */
function isoDaysInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let d = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const last = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  while (Number.isFinite(d) && d <= last && out.length < 3660) {
    out.push(new Date(d).toISOString().slice(0, 10));
    d += 86_400_000;
  }
  return out;
}

const isoWeekdayOf = (iso: string): number => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Uitzonderingen: `<HolidayOrExceptions>` zoals P6 ze schrijft — één `<HolidayOrException>` per
 *  DATUM (het schema kent geen naam en geen einddatum). Een vrije dag ⇒ `<WorkTime xsi:nil="true"/>`;
 *  een werkende uitzondering ⇒ haar banden, of zonder eigen banden de banden van die weekdag
 *  (anders van de eerste werkdag; zelfde terugval als `WorkingException.bands`). Geen
 *  uitzonderingen ⇒ geen element. Verlies: de naam van een feestdag (P6 kent er geen). */
function holidayOrExceptionsNode(cal: WorkCalendar, includeEffectiveScalarBands: boolean): P6Node[] {
  const workTime = cal.workTime ?? (includeEffectiveScalarBands ? effectiveWorkTimeBands(cal) : undefined);
  const byDate = new Map<string, P6Node>();
  for (const h of cal.holidays) {
    for (const date of isoDaysInclusive(h.startDate, holidayEndDate(h))) {
      byDate.set(date, node('HolidayOrException', [...leaf('Date', toXmlDateTime(date)), { tag: 'WorkTime', nil: true }]));
    }
  }
  const firstWorkday = [...cal.workDays].sort((a, b) => a - b)[0] ?? 1;
  for (const w of cal.workingExceptions ?? []) {
    for (const date of isoDaysInclusive(w.startDate, w.endDate || w.startDate)) {
      let bands = w.bands && w.bands.length > 0 ? w.bands : weekdayBands(cal, workTime, isoWeekdayOf(date));
      if (bands.length === 0) bands = weekdayBands(cal, workTime, firstWorkday);
      if (bands.length === 0) bands = [{ start: cal.workStartHour * 60, end: cal.workEndHour * 60 }];
      byDate.set(date, node('HolidayOrException', [...leaf('Date', toXmlDateTime(date)), ...workTimeNodes(bands)]));
    }
  }
  if (byDate.size === 0) return [];
  return [node('HolidayOrExceptions', [...byDate.keys()].sort().map(date => byDate.get(date)!))];
}

export function writeP6XML(
  project: Project,
  calendar: WorkCalendar,
  tasks: Task[],
  sequences: Sequence[],
  resources: Resource[],
  assignments: ResourceAssignment[],
  resourceCalendars: WorkCalendar[] = [],
  customTaskTypes: readonly CustomTaskType[] = [],
): string {
  // Externe (cross-project) dependencies zijn in P6-XML niet uitdrukbaar buiten de
  // master/subproject-context ⇒ weggelaten (de ghost-weergave blijft in-app). Één warn.
  const extLinkCount = tasks.reduce((n, t) => n + (t.externalLinks?.length ?? 0), 0);
  if (extLinkCount > 0) {
    console.warn(`P6-export: ${extLinkCount} externe (cross-project) dependency(s) weggelaten — niet uitdrukbaar in P6-XML (§6).`);
  }

  // P6 kent native LOE-activity's, maar de exacte `task_type`-code is niet geverifieerd ⇒ niet
  // gokken: een hammock exporteert als gewone taak met de berekende datums. Eén warn.
  const hammockCount = tasks.filter(t => t.isHammock).length;
  if (hammockCount > 0) {
    console.warn(`P6-export: ${hammockCount} hammock/LOE-taak/-taken geëxporteerd als gewone taak met berekende datums — P6 native LOE-type UNVERIFIED, niet gegokt (§6).`);
  }

  // Native P6 SCHEDOPTIONS-velden zijn niet geverifieerd ⇒ niet geschreven; alleen een warn wanneer
  // een niet-lege optieset verloren gaat (de volle set round-tript via IFC OPS_SchedulingOptions).
  if (project.schedulingOptions && Object.keys(project.schedulingOptions).length > 0) {
    console.warn('P6-export: scheduling-opties niet geëxporteerd — P6 SCHEDOPTIONS-mapping UNVERIFIED (aspiratie, §6).');
  }

  // Taakaantekeningen zijn in P6-XML niet uitdrukbaar ⇒ weggelaten (blijven in-app), met warn.
  const noteCount = tasks.reduce((n, t) => n + (t.notes?.length ?? 0), 0);
  if (noteCount > 0) {
    console.warn(`P6-export: ${noteCount} taak-aantekening(en) weggelaten — niet uitdrukbaar in P6-XML (§6).`);
  }

  // P6 kent per activity geen "24/7, negeer de kalender"-duurtype (geen geverifieerd
  // ELAPSEDTIME-equivalent in het P6-XML-schema); een ELAPSEDTIME-taak (bv. uit een `.mpp`-import)
  // exporteert als gewone werktijdduur ⇒ weggelaten-met-warn.
  const elapsedTaskCount = tasks.filter(t => t.time.durationType === 'ELAPSEDTIME').length;
  if (elapsedTaskCount > 0) {
    console.warn(`P6-export: ${elapsedTaskCount} taak/taken met ELAPSEDTIME-duur (24/7-klokrekenen) geëxporteerd als gewone werktijd-duur — geen P6-equivalent (§6).`);
  }

  // Velden zonder geverifieerde P6-representatie: weglaten-met-warn i.p.v. gokken op een P6-veldnaam.
  const manualCount = tasks.filter(t => t.manuallyScheduled).length;
  if (manualCount > 0) {
    console.warn(`P6-export: ${manualCount} handmatig geplande taak/taken geëxporteerd als gewone taak met berekende datums — geen geverifieerd P6-equivalent (§6).`);
  }
  const levelingPrecisionCount = tasks.filter(t => t.levelingDelayMinutes != null).length;
  if (levelingPrecisionCount > 0) {
    console.warn(`P6-export: ${levelingPrecisionCount} taak/taken met sub-dag-nivelleervertraging (levelingDelayMinutes) weggelaten — niet uitdrukbaar in P6-XML (§6).`);
  }
  // Gecontoureerde toewijzingen (`Task.timephasedContours`) gaan schema-natief mee als
  // `<PlannedCurve>`/`<RemainingCurve>`/`<ActualCurve>`-spreiding en de lezer leest ze terug. Alleen
  // een gesplitste taak ZONDER contour (bv. een nivelleergat) heeft geen per-toewijzingverdeling —
  // die blijft een warn (P6 kent een onderbreking alleen als spreiding van een toewijzing).
  const splitWithoutContour = countSplitTasksWithoutContour(tasks);
  if (splitWithoutContour > 0) {
    console.warn(`P6-export: ${splitWithoutContour} onderbroken taak/taken zonder urenverdeling geëxporteerd ZONDER hun onderbrekingen (gebruikers-, nivelleer- of importsplits) — alleen een contour wordt als spreiding geschreven (§6; de gebruiker krijgt een melding via exportAs).`);
  }
  const resumeStopCount = tasks.filter(t => t.time.resume || t.time.stop).length;
  if (resumeStopCount > 0) {
    console.warn(`P6-export: ${resumeStopCount} taak/taken met resume/stop (uit-volgorde-hervatting) weggelaten — niet uitdrukbaar in P6-XML (§6).`);
  }

  // Deze adapter is doelbewust asymmetrisch met XER. Een XER-import bewaart zijn P6-velden en exacte
  // bron alleen via IFC; dit XML-profiel claimt daarvoor geen equivalent.
  // TODO(X9/P6XML): pas na een gevalideerde Oracle-schema-/corpusmapping eventueel individuele
  // DurationType/ActivityType/progressvelden lezen/schrijven, met een nieuwe parity-test.

  // Build object ID maps
  const taskObjMap = new Map<string, number>();
  let nextObjId = 1;
  for (const task of tasks) {
    taskObjMap.set(task.id, nextObjId++);
  }

  // Resource- en resource-kalender-ObjectIds: eigen, aparte teller-ruimtes (net als
  // Relationship hieronder al een eigen `relObjId`-teller heeft — ObjectId-uniciteit is in
  // echte P6-XML per entiteitstype, niet globaal over het bestand).
  const resObjMap = new Map<string, number>();
  let nextResObjId = 1;
  for (const res of resources) {
    resObjMap.set(res.id, nextResObjId++);
  }
  // Kalender-ObjectIds: 1 = projectkalender; het project wijst hem aan via
  // `<ActivityDefaultCalendarObjectId>`.
  const {
    libraryCalendars, calendarNumber: calObjMap, effCalByTask, hourTaskCalendarIds,
  } = exportCalendarLayout(tasks, calendar, resourceCalendars);

  // WBS elements (parent tasks). Diepte-eerst: een ouder staat vóór zijn kinderen en broers/zussen
  // staan in weergavevolgorde — P6 sorteert WBS-broers op `SequenceNumber`, dat uit deze volgorde
  // komt; de store-volgorde zegt daar niets over. Een lege P6-WBS-rij (`isSummary`, geen kinderen)
  // is óók een WBS-element, geen activiteit.
  tasks = [...flattenOrder(tasks)];
  const wbsTasks = tasks.filter(isSummaryTask);
  const leafTasks = tasks.filter(isLeafTask);
  const sequenceNumberByTask = new Map(tasks.map((t, i) => [t.id, i + 1]));

  // Structuur zoals echte P6 XML: globale objecten (UDF-typen, notitieonderwerp, kalenders, curves,
  // resources, tarieven) op het hoogste niveau; alle projectobjecten (WBS, activiteiten,
  // toewijzingen, notities, relaties) BINNEN <Project>. Elementvolgorde: `p6xmlSchemaOrder.ts`.
  const top: P6Node[] = [];
  const inProject: P6Node[] = [];

  // P6 heeft geen native dag/uur-vlag per activity: PlannedDuration staat altijd in uren. Een
  // Text-UDF is een officiële uitbreidingsroute. De reader vertrouwt deze waarden alleen wanneer ook
  // deze exacte definitie aanwezig is; andere P6-bestanden houden de kalenderprecisie-classificatie.
  // De definitie is ook de herkenning "OPS-export" in de reader.
  top.push(node('UDFType', [
    ...leaf('DataType', 'Text'),
    ...leaf('ObjectId', OPS_P6_DURATION_UNIT_UDF_OBJECT_ID),
    ...leaf('SubjectArea', 'Activity'),
    ...leaf('Title', OPS_DURATION_UNIT_NAME),
  ]));
  const customTasks = leafTasks.filter(task => task.customTaskTypeId);
  if (customTasks.length > 0) {
    top.push(node('UDFType', [
      ...leaf('DataType', 'Text'),
      ...leaf('ObjectId', OPS_CUSTOM_TASK_TYPE_UDF_OBJECT_ID),
      ...leaf('SubjectArea', 'Activity'),
      ...leaf('Title', OPS_CUSTOM_TASK_TYPE_UDF_TITLE),
    ]));
  }
  // Taakbeschrijving: P6 kent geen beschrijvingsveld op een activiteit; een notitie
  // (`<ActivityNote>`) onder een eigen notitieonderwerp is de P6-vorm.
  const describedTasks = leafTasks.filter(task => task.description);
  if (describedTasks.length > 0) {
    top.push(node('NotebookTopic', [
      ...leaf('AvailableForActivity', 1),
      ...leaf('AvailableForEPS', 0),
      ...leaf('AvailableForProject', 0),
      ...leaf('AvailableForWBS', 0),
      ...leaf('Name', OPS_DESCRIPTION_TOPIC_NAME),
      ...leaf('ObjectId', OPS_DESCRIPTION_TOPIC_OBJECT_ID),
    ]));
  }

  // Calendar. Bibliotheekkalenders: zelfde element als de projectkalender maar met Type="Resource" en
  // een eigen ObjectId (de reader neemt een Resource-kalender altijd mee in de bibliotheek).
  for (const cal of [calendar, ...libraryCalendars]) {
    const hourBands = hourTaskCalendarIds.has(cal.id);
    top.push(node('Calendar', [
      ...leaf('HoursPerDay', cal.hoursPerDay),
      ...leaf('HoursPerMonth', cal.hoursPerDay * 20),
      ...leaf('HoursPerWeek', cal.hoursPerDay * cal.workDays.length),
      ...leaf('Name', cal.name),
      ...leaf('ObjectId', calObjMap.get(cal.id)!),
      ...leaf('Type', cal === calendar ? 'Global' : 'Resource'),
      standardWorkWeekNode(cal, hourBands),
      ...holidayOrExceptionsNode(cal, hourBands),
    ]));
  }

  // `<ResourceCurve>`-catalogus. Eén object per UNIEKE 21-waardenlijst die een toewijzing gebruikt:
  // `curveValues` (exacte P6-/MSPDI-data) of anders de tabel van `curve`.
  const curveObjIdByKey = new Map<string, number>();
  const curveDefs: { objId: number; name: string; values: readonly number[] }[] = [];
  const curveObjIdFor = (a: ResourceAssignment): number | undefined => {
    const values = a.curveValues ?? (a.curve && a.curve !== 'UNIFORM' ? CONTOUR_SHAPE_VALUES[CURVE_TO_SHAPE[a.curve]] : undefined);
    if (!values || isFlatCurveValues(values)) return undefined;
    const key = values.map(v => String(v)).join(',');
    let objId = curveObjIdByKey.get(key);
    if (objId === undefined) {
      objId = curveDefs.length + 1;
      curveObjIdByKey.set(key, objId);
      const name = (a.curve ? P6_CURVE_TO_NAME[a.curve] : undefined) ?? `Curve ${objId}`;
      curveDefs.push({ objId, name, values });
    }
    return objId;
  };
  const curveObjIdByAssignment = new Map<string, number>();
  for (const a of assignments) {
    const objId = curveObjIdFor(a);
    if (objId !== undefined) curveObjIdByAssignment.set(a.id, objId);
  }
  for (const def of curveDefs) {
    top.push(node('ResourceCurve', [
      ...leaf('Name', def.name),
      ...leaf('ObjectId', def.objId),
      node('Values', def.values.flatMap((v, i) => leaf(`Value${i * 5}`, v))),
    ]));
  }

  // Resources
  for (const res of resources) {
    top.push(node('Resource', [
      ...leaf('CalendarObjectId', (res.calendarId && calObjMap.get(res.calendarId)) || 1),
      ...leaf('Id', res.id),
      // MaxUnitsPerTime: in P6-XML een dimensieloze FRACTIE (1.0 = 100% = één volle eenheid), GEEN
      // uren/dag (MPXJ: XmlContextWriter.writeResource schrijft `getDefaultUnits() / 100.0`). Ons
      // `maxUnits` is al een fractie, dus 1:1.
      ...leaf('MaxUnitsPerTime', res.maxUnits),
      ...leaf('Name', res.name),
      ...leaf('ObjectId', resObjMap.get(res.id)!),
      ...(res.parentId && resObjMap.has(res.parentId) ? leaf('ParentObjectId', resObjMap.get(res.parentId)) : []),
      ...leaf('ResourceType', resourceTypeToP6(res.type)),
      ...(res.type === 'MATERIAL' && res.unitOfMeasure ? leaf('UnitOfMeasureAbbreviation', res.unitOfMeasure) : []),
    ]));
  }

  // ResourceRates: P6-XML draagt het tarief NIET op <Resource> maar in aparte top-level
  // <ResourceRate>-elementen met ResourceObjectId + PricePerUnit (tarief per uur) + EffectiveDate —
  // zoals MPXJ (XmlContextWriter.writeResourceRates). OPS heeft één vlak tarief, dus één rate-rij
  // per resource, effectief vanaf de projectstart.
  let rateObjId = 1;
  for (const res of resources) {
    if (res.costPerHour === undefined) continue;
    top.push(node('ResourceRate', [
      ...leaf('EffectiveDate', toXmlDateTime(project.startDate)),
      ...leaf('ObjectId', rateObjId++),
      ...leaf('PricePerUnit', res.costPerHour),
      ...leaf('ResourceObjectId', resObjMap.get(res.id)!),
    ]));
  }

  // WBS elements
  for (const wbsTask of wbsTasks) {
    const parentObjId = wbsTask.parentId ? taskObjMap.get(wbsTask.parentId) : undefined;
    inProject.push(node('WBS', [
      ...leaf('Code', wbsTask.wbsCode),
      ...leaf('Name', wbsTask.name),
      ...leaf('ObjectId', taskObjMap.get(wbsTask.id)!),
      ...(parentObjId !== undefined ? leaf('ParentObjectId', parentObjId) : []),
      ...leaf('ProjectObjectId', 1),
      ...leaf('SequenceNumber', sequenceNumberByTask.get(wbsTask.id)),
    ]));
  }

  // Activities (leaf tasks only in P6)
  let noteObjId = 1;
  for (const task of leafTasks) {
    const objId = taskObjMap.get(task.id)!;
    const wbsObjId = task.parentId ? taskObjMap.get(task.parentId) : undefined;
    // <DurationType> uit de werkregel; zonder werkregel valt een taak met alleen een bewaard P6-token
    // op dat token terug. Zonder beide schrijft de export niets.
    const durationTypeLabel = task.workRule
      ? P6_DURATION_TYPE_NAME[task.workRule]
      : task.p6DurationType ? p6LabelForToken(task.p6DurationType) : undefined;
    // Uur-taak ⇒ PlannedDuration in fractionele uren uit de minuten (geen dag-afronding); dag-taak ⇒
    // `dagen × hpd`.
    const effCal = effCalByTask.get(task.id);
    const isHour = taskDurationUnit(task) === 'hours';
    const effHpd = effCal?.hoursPerDay ?? calendar.hoursPerDay;
    const plannedDur = isHour ? taskMinutesForWrite(task, effHpd) / 60 : durationToP6Hours(task.time.scheduleDuration, effHpd);
    // RemainingDuration in uren; zelfde `effHpd` als PlannedDuration (P6 rekent de restduur op de
    // activity-kalender).
    const remainingHours = isHour && task.time.remainingMinutes != null ? task.time.remainingMinutes / 60
      : task.time.remainingTime != null ? durationToP6Hours(task.time.remainingTime, effHpd) : undefined;
    // Datumconstraints: primair + secundair als P6 `CS_*`-codes. ASAP ⇒ geen element. Secundair is
    // altijd soft (P6 native `SecondaryConstraintType`).
    const code = task.constraint ? p6ConstraintCode(task.constraint) : undefined;
    const code2 = task.constraint2 ? p6ConstraintCode(task.constraint2) : undefined;
    const udfs: P6Node[] = [
      // De duurwaarde in P6 is altijd uren. Deze Activity-Text-UDF bewaart apart of OPS de taak als
      // werkdag of als exacte werkuren moet herlezen. P6 zet de UDF-waarde van een activiteit IN de
      // activiteit (`<UDF><TypeObjectId/><TextValue/></UDF>`).
      node('UDF', [...leaf('TypeObjectId', OPS_P6_DURATION_UNIT_UDF_OBJECT_ID), ...leaf('TextValue', taskDurationUnit(task))]),
      ...(task.customTaskTypeId
        ? [node('UDF', [
          ...leaf('TypeObjectId', OPS_CUSTOM_TASK_TYPE_UDF_OBJECT_ID),
          ...leaf('TextValue', encodeCustomTaskType(task.customTaskTypeId, customTaskTypes)),
        ])]
        : []),
    ];
    inProject.push(node('Activity', [
      // Actuals — alleen wanneer gezet (golden rule).
      ...leaf('ActualFinishDate', task.time.actualFinish ? toXmlDateTime(task.time.actualFinish) : undefined),
      ...leaf('ActualStartDate', task.time.actualStart ? toXmlDateTime(task.time.actualStart) : undefined),
      // Taakkalender: effectieve kalender-ObjectId; onbekende/verwijderde calendarId valt terug op 1
      // (projectkalender).
      ...leaf('CalendarObjectId', (task.calendarId && calObjMap.get(task.calendarId)) || 1),
      ...(durationTypeLabel && !task.isMilestone ? leaf('DurationType', durationTypeLabel) : []),
      ...leaf('Id', task.wbsCode || task.id),
      ...leaf('Name', task.name),
      ...leaf('ObjectId', objId),
      // Voortgang zoals P6: soort Physical en het percentage als FRACTIE (0.5 = 50 %).
      ...leaf('PercentCompleteType', 'Physical'),
      ...(task.time.completion > 0 ? leaf('PhysicalPercentComplete', task.time.completion) : []),
      ...leaf('PlannedDuration', plannedDur),
      ...leaf('PlannedFinishDate', toXmlDateTime(shownFinish(task))),
      ...leaf('PlannedStartDate', toXmlDateTime(shownStart(task))),
      ...(code && task.constraint?.date ? leaf('PrimaryConstraintDate', toXmlDateTime(task.constraint.date)) : []),
      ...leaf('PrimaryConstraintType', code),
      ...leaf('ProjectObjectId', 1),
      ...leaf('RemainingDuration', remainingHours),
      ...(code2 && task.constraint2?.date ? leaf('SecondaryConstraintDate', toXmlDateTime(task.constraint2.date)) : []),
      ...leaf('SecondaryConstraintType', code2),
      ...leaf('Status', taskStatusToP6(task)),
      ...leaf('Type', taskTypeToP6(task)),
      ...(wbsObjId !== undefined ? leaf('WBSObjectId', wbsObjId) : []),
      ...udfs,
    ]));
    if (task.description) {
      inProject.push(node('ActivityNote', [
        ...leaf('ActivityObjectId', objId),
        ...leaf('Note', task.description),
        ...leaf('NotebookTopicObjectId', OPS_DESCRIPTION_TOPIC_OBJECT_ID),
        ...leaf('ObjectId', noteObjId++),
        ...leaf('ProjectObjectId', 1),
      ]));
    }
  }

  // Relationships (sequences). P6 kent geen procent-lag en geen lag-eenheid per relatie
  // (de lag-kalender is in P6 een projectbrede scheduling-optie): procent-lag wordt hier
  // uitgebakken naar vaste uren op basis van de huidige voorgangerduur, en kalenderdag-lag
  // exporteert als gewone uren — beide met een waarschuwing in de log.
  const taskById = new Map(tasks.map(t => [t.id, t]));
  let relObjId = 1;
  for (const seq of sequences) {
    const predObjId = taskObjMap.get(seq.predecessorId);
    const succObjId = taskObjMap.get(seq.successorId);
    if (predObjId === undefined || succObjId === undefined) continue;

    let lagDays = Number.isFinite(seq.lagDays) ? seq.lagDays : 0;
    if (typeof seq.lagPercent === 'number' && Number.isFinite(seq.lagPercent)) {
      const pred = taskById.get(seq.predecessorId);
      const predDur = pred && !pred.isMilestone ? pred.time.scheduleDuration : 0;
      lagDays = Math.round((predDur * seq.lagPercent) / 100);
      console.warn(`P6-export: procent-lag (${seq.lagPercent}%) uitgebakken naar ${lagDays} dagen — P6 kent geen procent-lag.`);
    }
    if (seq.lagUnit === 'ELAPSEDTIME') {
      console.warn('P6-export: kalenderdag-lag geëxporteerd als gewone lag-uren — P6 heeft geen lag-eenheid per relatie.');
    }

    // Uur-lag (`lagMinutes`, bron van waarheid) als fractionele uren, mits geen procent-lag (die is
    // al uitgebakken). Anders het `lagDays × hpd`-uren-pad.
    const hourLag = typeof seq.lagMinutes === 'number' && Number.isFinite(seq.lagMinutes)
      && !(typeof seq.lagPercent === 'number' && Number.isFinite(seq.lagPercent));
    const lagHours = hourLag ? seq.lagMinutes! / 60 : durationToP6Hours(lagDays, calendar.hoursPerDay);

    inProject.push(node('Relationship', [
      ...leaf('Lag', lagHours),
      ...leaf('ObjectId', relObjId++),
      ...leaf('PredecessorActivityObjectId', predObjId),
      ...leaf('PredecessorProjectObjectId', 1),
      ...leaf('SuccessorActivityObjectId', succObjId),
      ...leaf('SuccessorProjectObjectId', 1),
      ...leaf('Type', P6_LINK_TYPE[seq.type]),
    ]));
  }

  // ResourceAssignments: alleen bladtaken dragen assignments, dus taskObjMap/leafTasks dekt alle
  // mogelijke ActivityObjectId's. Contourkoppeling per taak voor de spreidingsstrings
  // (`contourPeriodsToP6Spread`, anker = taakstart).
  const assignmentsByTask = new Map<string, ResourceAssignment[]>();
  for (const a of assignments) {
    const list = assignmentsByTask.get(a.taskId) ?? [];
    list.push(a);
    assignmentsByTask.set(a.taskId, list);
  }
  const contourMatchCache = new Map<string, ReturnType<typeof matchContoursToAssignments>>();
  const contourOf = (task: Task, a: ResourceAssignment) => {
    if (!task.timephasedContours || task.timephasedContours.length === 0) return undefined;
    let m = contourMatchCache.get(task.id);
    if (!m) {
      m = matchContoursToAssignments(task.timephasedContours, assignmentsByTask.get(task.id) ?? [a]);
      contourMatchCache.set(task.id, m);
    }
    return m.get(a.id);
  };

  let asgnObjId = 1;
  for (const a of assignments) {
    const actObjId = taskObjMap.get(a.taskId);
    const resObjId = resObjMap.get(a.resourceId);
    if (actObjId === undefined || resObjId === undefined) continue;
    const task = taskById.get(a.taskId);
    const contour = task ? contourOf(task, a) : undefined;
    const taskStartIso = task ? shownStart(task) : '';
    const taskFinishIso = task ? shownFinish(task) : '';
    // Spreidingsstrings (MPXJ `TimephasedHelper.write`): actual/remaining apart, en `PlannedCurve`
    // als de volledige as. Alle drie ankeren op de TAAKSTART, en de bijbehorende ankervelden
    // (`PlannedStartDate`/`RemainingStartDate`/`ActualStartDate`) worden meegeschreven — zonder
    // anker leest P6/MPXJ de spreiding niet.
    const actualPeriods = contour ? contour.periods.filter(p => p.kind === 'actual') : [];
    const remainingPeriods = contour ? contour.periods.filter(p => p.kind === 'remaining') : [];
    const actualSpread = actualPeriods.length > 0 ? contourPeriodsToP6Spread(actualPeriods) : null;
    const remainingSpread = remainingPeriods.length > 0 ? contourPeriodsToP6Spread(remainingPeriods) : null;
    const plannedSpread = contour ? contourPeriodsToP6Spread(contour.periods) : null;
    const anchorIso = taskStartIso ? toXmlDateTime(taskStartIso) : '';
    const curveObjId = curveObjIdByAssignment.get(a.id);

    inProject.push(node('ResourceAssignment', [
      ...leaf('ActivityObjectId', actObjId),
      ...(actualSpread && anchorIso ? [...leaf('ActualCurve', actualSpread), ...leaf('ActualStartDate', anchorIso)] : []),
      // De drie werkvelden in UREN, alleen wanneer gezet.
      ...(a.actualWorkMinutes !== undefined ? leaf('ActualUnits', a.actualWorkMinutes / 60) : []),
      ...leaf('ObjectId', asgnObjId++),
      ...(plannedSpread && anchorIso
        ? [
          ...leaf('PlannedCurve', plannedSpread),
          ...(taskFinishIso ? leaf('PlannedFinishDate', toXmlDateTime(taskFinishIso)) : []),
          ...leaf('PlannedStartDate', anchorIso),
        ]
        : []),
      ...(a.plannedWorkMinutes !== undefined ? leaf('PlannedUnits', a.plannedWorkMinutes / 60) : []),
      // PlannedUnitsPerTime: fractie, 1.0 = 100% (zelfde semantiek als MaxUnitsPerTime hierboven).
      ...leaf('PlannedUnitsPerTime', a.unitsPerDay),
      ...leaf('ProjectObjectId', 1),
      ...(remainingSpread && anchorIso ? [...leaf('RemainingCurve', remainingSpread), ...leaf('RemainingStartDate', anchorIso)] : []),
      ...(a.remainingWorkMinutes !== undefined ? leaf('RemainingUnits', a.remainingWorkMinutes / 60) : []),
      ...(curveObjId !== undefined ? leaf('ResourceCurveObjectId', curveObjId) : []),
      ...leaf('ResourceObjectId', resObjId),
    ]));
  }

  // Project. Zelfde afweging als in mspdiWriter: een leeg <Name> gaf P6 een naamloos project, terwijl
  // de projectnaam in P6 juist een dragend, verplicht ingevuld veld is. Dezelfde neutrale,
  // taalonafhankelijke terugval als de bestandsnaam en de STEP-header.
  const projectIdentity = p6ProjectIdentity(projectFileBase(project.name));
  top.push(node('Project', [
    ...leaf('ActivityDefaultCalendarObjectId', 1),
    // Data date — P6's peildatum. Alleen wanneer gezet (golden rule).
    ...(project.statusDate ? leaf('DataDate', toXmlDateTime(project.statusDate)) : []),
    ...leaf('Description', project.description),
    ...leaf('Id', projectIdentity.id),
    ...(project.endDate ? leaf('MustFinishByDate', toXmlDateTime(project.endDate)) : []),
    ...leaf('Name', projectIdentity.name),
    ...leaf('ObjectId', 1),
    ...leaf('PlannedStartDate', toXmlDateTime(project.startDate)),
    ...leaf('Status', project.endDate ? 'Active' : 'Planned'),
    ...inProject,
  ]));

  return renderP6Xml(
    node('APIBusinessObjects', top),
    'xmlns="http://xmlns.oracle.com/Primavera/P6/V23.12/API/BusinessObjects" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  );
}

/**
 * Naam en `Id` van het P6-project. Een geïmporteerd P6-project heet "Naam (Id)" (zie
 * `nameWithProjectCode`); die code gaat terug naar `<Id>` en de naam zonder code naar `<Name>`, zodat
 * heropenen dezelfde naam geeft. Zonder code is het Id de naam, afgekapt op de schemagrens. Vroeger
 * stond hier het interne project-id (`proj-…`), dat P6 als projectcode toonde.
 */
export function p6ProjectIdentity(displayName: string): { name: string; id: string } {
  const match = / \(([^()]+)\)$/.exec(displayName);
  if (match && match[1].trim().length <= P6_ID_MAX_LENGTH && match.index > 0) {
    return { name: displayName.slice(0, match.index), id: match[1].trim() };
  }
  return { name: displayName, id: displayName.slice(0, P6_ID_MAX_LENGTH).trim() };
}
