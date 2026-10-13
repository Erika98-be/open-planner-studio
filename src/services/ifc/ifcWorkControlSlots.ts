/**
 * Posities van de slots die de lezer gebruikt in `IfcWorkPlan`/`IfcWorkSchedule` (beide
 * `IfcWorkControl`) en `IfcWorkCalendar`, per lay-out (issue #292).
 *
 * Het schema (IFC4, IFC4X3 en IFC4X3_ADD2 zijn hier gelijk):
 *   - IfcWorkPlan/IfcWorkSchedule, 14 attributen: GlobalId, OwnerHistory, Name, Description, ObjectType,
 *     Identification, CreationDate, Creators, Purpose, Duration, TotalFloat, StartTime (11),
 *     FinishTime (12), PredefinedType (13).
 *   - IfcWorkCalendar, 9 attributen: GlobalId, OwnerHistory, Name, Description, ObjectType,
 *     Identification, WorkingTimes (6), ExceptionTimes (7), PredefinedType (8).
 *
 * Oudere OPS-versies schreven beide verkeerd: het werkplan en de werkschema's met 15 argumenten (één `$`
 * te veel vóór StartTime, dus StartTime op 12, FinishTime op 13 en PredefinedType op 14) en de
 * kalender met 8 (Identification ontbrak, dus WorkingTimes op 5, ExceptionTimes op 6 en
 * PredefinedType op 7). De lezer kiest de lay-out op de ARGUMENTEN van de entiteit zelf, niet op de
 * appversie: zo leest hij die oude bestanden zoals altijd, en een schemaconform bestand (de huidige
 * writer, of een ander pakket) op de juiste plek.
 *
 * Eén geval heeft het schema-aantal maar de oude indeling: IfcOpenShell (MergeProjects, 0.9.0) leest
 * een oud bestand met het schema en schrijft het schema-aantal, maar laat de waarden op hun oude plek.
 * De kalender krijgt dan 9 argumenten met de werkweek (een lijst) op Identification (5); het werkplan
 * en de werkschema's krijgen 14 argumenten met de einddatum (tekst) op PredefinedType (13). Beide zijn
 * nooit schemageldig: Identification is een `IfcIdentifier` (tekst), PredefinedType een enumeratie
 * (`.X.`) of `$`. Daaraan herkent de lezer de oude indeling. Het oude PredefinedType zelf is dan al weg
 * (IfcOpenShell laat het vallen); die slot is leeg, zoals in een bestand zonder type.
 *
 * Bladmodule: geen imports, zodat lezer en schrijver hem zonder cyclus delen.
 */

/** Het argumentaantal van IfcWorkPlan/IfcWorkSchedule volgens het schema. */
export const WORK_CONTROL_ARITY = 14;
/** Het argumentaantal dat oudere OPS-versies voor IfcWorkPlan/IfcWorkSchedule schreven. */
export const LEGACY_OPS_WORK_CONTROL_ARITY = 15;
/** Het argumentaantal van IfcWorkCalendar volgens het schema. */
export const WORK_CALENDAR_ARITY = 9;
/** Het argumentaantal dat oudere OPS-versies voor IfcWorkCalendar schreven. */
export const LEGACY_OPS_WORK_CALENDAR_ARITY = 8;

export interface WorkControlSlots {
  startTime: number;
  finishTime: number;
  predefinedType: number;
}

export interface WorkCalendarSlots {
  workingTimes: number;
  exceptionTimes: number;
  predefinedType: number;
}

const WORK_CONTROL_SCHEMA: WorkControlSlots = { startTime: 11, finishTime: 12, predefinedType: 13 };
const WORK_CONTROL_LEGACY_OPS: WorkControlSlots = { startTime: 12, finishTime: 13, predefinedType: 14 };
const WORK_CALENDAR_SCHEMA: WorkCalendarSlots = { workingTimes: 6, exceptionTimes: 7, predefinedType: 8 };
const WORK_CALENDAR_LEGACY_OPS: WorkCalendarSlots = { workingTimes: 5, exceptionTimes: 6, predefinedType: 7 };
/** Identification van IfcWorkCalendar in het schema: een `IfcIdentifier` (tekst), nooit een lijst. */
const CALENDAR_IDENTIFICATION = 5;

/** Slotposities van een IfcWorkPlan/IfcWorkSchedule met deze argumenten. Oude OPS-lay-out bij 15 of
 *  meer argumenten (zo las de lezer elk bestand vóór #292), en bij 14 argumenten met tekst op
 *  PredefinedType (13): een oud bestand na MergeProjects. Anders het schema. */
export function workControlSlots(args: readonly string[]): WorkControlSlots {
  if (args.length >= LEGACY_OPS_WORK_CONTROL_ARITY) return WORK_CONTROL_LEGACY_OPS;
  if (args.length === WORK_CONTROL_ARITY && (args[WORK_CONTROL_SCHEMA.predefinedType] ?? '').trim().startsWith("'")) {
    return WORK_CONTROL_LEGACY_OPS;
  }
  return WORK_CONTROL_SCHEMA;
}

/** Slotposities van een IfcWorkCalendar met deze argumenten. Oude OPS-lay-out bij 8 of minder
 *  argumenten (zo las de lezer elk bestand vóór #292), en bij 9 argumenten met een lijst op
 *  Identification (5): een oud bestand na MergeProjects. Anders het schema. */
export function workCalendarSlots(args: readonly string[]): WorkCalendarSlots {
  if (args.length <= LEGACY_OPS_WORK_CALENDAR_ARITY) return WORK_CALENDAR_LEGACY_OPS;
  if (args.length === WORK_CALENDAR_ARITY && (args[CALENDAR_IDENTIFICATION] ?? '').trim().startsWith('(')) {
    return WORK_CALENDAR_LEGACY_OPS;
  }
  return WORK_CALENDAR_SCHEMA;
}
