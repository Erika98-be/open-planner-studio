/**
 * OPS-markeringen in een XER die de app zelf schreef (`xerWriter.ts`), gelezen door `readXER`.
 *
 * P6 rekent altijd in uren; een XER-kalender draagt dus altijd kloktijden, en de lezer opent elke
 * XER-kalender daarom in uurmodus. Voor een project dat in OPS in dagen rekende, zou een rondgang
 * OPS → XER → OPS dan andere datums en speling geven (een begin-mijlpaal aan het einde van de dag,
 * een SF-relatie). Daarom schrijft de app twee eigen UDF's, net als de P6 XML-export
 * (`OPS_TaskDurationUnit`, `p6xmlWriter.ts`):
 *
 *  - `OPS_TaskDurationUnit` op TASK: per activiteit `days` of `hours`;
 *  - `OPS_HourCalendars` op PROJECT: de `clndr_id`'s van de kalenders die in OPS in uurmodus rekenden.
 *
 * Alleen als de TASK-definitie precies zo bestaat (label, tabel en tekst-type), leest de lezer het
 * bestand als OPS-export: hij zet dan per kalender de modus uit deze lijst in plaats van uit de
 * kloktijden, en per taak de eenheid uit de UDF. Een echt P6-bestand heeft deze UDF niet en leest
 * precies zoals voorheen. P6 zelf toont de twee velden als gewone eigen velden en negeert ze verder.
 * De metadatalezer (`xerMetadata.ts`) laat ze weg uit de eigen velden van de taak.
 */
import { OPS_DURATION_UNIT_NAME, isTaskDurationUnit } from '@/services/xmlInterchange';
import type { XerRow, XerTables } from './xerTables';

export const OPS_XER_DURATION_UNIT_LABEL = OPS_DURATION_UNIT_NAME;
export const OPS_XER_HOUR_CALENDARS_LABEL = 'OPS_HourCalendars';

export interface XerOpsMarkers {
  /** `task_id` → eenheid van de taak in OPS. */
  taskUnits: ReadonlyMap<string, 'days' | 'hours'>;
  /** `clndr_id`'s van de kalenders die in OPS in uurmodus rekenden. */
  hourCalendarIds: ReadonlySet<string>;
}

/** Is deze UDFTYPE-rij een OPS-markering (en dus geen eigen veld van de gebruiker)? */
export function isOpsMarkerUdfType(row: XerRow): boolean {
  const label = row.cells.udf_type_label?.trim();
  const table = row.cells.table_name?.trim().toUpperCase();
  const type = row.cells.logical_data_type?.trim().toUpperCase();
  if (type !== 'FT_TEXT') return false;
  return (label === OPS_XER_DURATION_UNIT_LABEL && table === 'TASK')
    || (label === OPS_XER_HOUR_CALENDARS_LABEL && table === 'PROJECT');
}

/** De OPS-markeringen van dit bestand, of `undefined` als het geen OPS-export is. */
export function readXerOpsMarkers(tables: XerTables): XerOpsMarkers | undefined {
  const types = (tables.tables.get('UDFTYPE')?.rows ?? []).filter(isOpsMarkerUdfType);
  const unitType = types.find(row => row.cells.udf_type_label?.trim() === OPS_XER_DURATION_UNIT_LABEL);
  if (!unitType) return undefined;
  const unitTypeId = unitType.cells.udf_type_id?.trim();
  const calendarTypeIds = new Set(types
    .filter(row => row.cells.udf_type_label?.trim() === OPS_XER_HOUR_CALENDARS_LABEL)
    .map(row => row.cells.udf_type_id?.trim()));
  const taskUnits = new Map<string, 'days' | 'hours'>();
  const hourCalendarIds = new Set<string>();
  for (const row of tables.tables.get('UDFVALUE')?.rows ?? []) {
    const typeId = row.cells.udf_type_id?.trim();
    const text = (row.cells.udf_text ?? '').trim();
    if (typeId === unitTypeId) {
      const taskId = (row.cells.fk_id || row.cells.task_id || '').trim();
      if (taskId && isTaskDurationUnit(text)) taskUnits.set(taskId, text);
    } else if (calendarTypeIds.has(typeId)) {
      for (const id of text.split(',')) if (id.trim()) hourCalendarIds.add(id.trim());
    }
  }
  return { taskUnits, hourCalendarIds };
}
