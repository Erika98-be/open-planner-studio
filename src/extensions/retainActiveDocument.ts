/**
 * `api.data.loadProject` op HETZELFDE project (lees-wijzig-laad, het gedocumenteerde pad om
 * toewijzingen te zetten): houd vast wat `ExtImportResult` niet kan dragen. Anders verdwijnt dat stil
 * bij elke extensie-load (review #169, N3 en de fixronde van 2026-10-12). Reden, net als B29: een
 * extensie mag het project niet stil veranderen.
 *
 * Wat het contract (`ExtImportResult`, contract 1.4.0) draagt en wat niet:
 *  - rekenprofiel en niet-publieke reken-opties: niet ⇒ `retainActiveScheduling` (extMappers);
 *  - baselines en `activeBaselineId`: niet ⇒ vastgehouden;
 *  - resourcekalenders (`calendars`): niet (alleen de projectkalender `calendar`) ⇒ vastgehouden;
 *    de projectkalender zelf volgt de extensie, tenzij zij hem ongewijzigd terugstuurt;
 *  - `activityCodeTypes` en `customFieldDefs`: niet (taken dragen alleen de waarden) ⇒ vastgehouden;
 *  - `ifcGlobalIds`: niet ⇒ vastgehouden.
 * Draagt een latere contractversie een van deze velden wél, dan hoort die waarde hier de extensie te
 * volgen (ook leeg) in plaats van het document.
 *
 * Bewust NIET vastgehouden (ook niet bij hetzelfde id):
 *  - XER-bron (`xerImportMetadata`, `xerSourceArchive`): een generieke load is geen XER-document meer;
 *    tests 47/48 en D1 in check-ext-contract pinnen dat.
 *  - `companyId`/`companyName`: `applyLoadedProject` wist de bibliotheekkoppeling bewust bij elke
 *    niet-gekoppelde load (`silent-switch`), net als de herkomststempels.
 *  - `importPristine`: na een wijziging door een extensie is het project niet meer onbewerkt.
 *
 * Ander project-id: een nieuw project; dan geldt niets hiervan en rekent het als OPS.
 *
 * Verweesde verwijzingen ruimt `cleanDanglingReferences` op, voor elk id, met het bestaande gedrag van
 * de store (`removeCalendar`): een resource of taak met een `calendarId` naar een kalender die er na
 * de load niet is, valt terug op de projectkalender. De solver deed dat al (`resolveCalendar`), dus de
 * berekening verandert niet; alleen de verwijzing klopt weer. Bij een ander id vallen de resource-
 * kalenders weg, bij hetzelfde id kan de extensie naar een onbekend id wijzen.
 * Niet nodig voor `activeBaselineId`: baselines en het actieve id komen altijd uit dezelfde bron
 * (beide van het document, of beide leeg). Codes en eigen velden op taken (`activityCodes`,
 * `customFields`) blijven ongemoeid: bij een ander id is er geen catalogus en zou opschonen
 * importerdata wissen; dat gedrag is ongewijzigd.
 */
import type { Project } from '@/types/project';
import type { WorkCalendar } from '@/types/calendar';
import type { Baseline } from '@/types/baseline';
import type { ActivityCodeType, CustomFieldDef } from '@/types/structure';
import type { ImportResult } from '@/services/importTypes';
import { sameValue } from '@/utils/sameValue';
import type { ExtImportResult } from './extTypes';
import { retainActiveScheduling, toExtCalendar } from './extMappers';

/** Het deel van het actieve document dat deze stap leest; `AppState` voldoet er structureel aan. */
export interface ActiveDocumentData {
  project: Project;
  calendars: readonly WorkCalendar[];
  baselines: readonly Baseline[];
  activeBaselineId: string | null;
  activityCodeTypes: readonly ActivityCodeType[];
  customFieldDefs: readonly CustomFieldDef[];
  ifcGlobalIds: Readonly<Record<string, string>> | null;
}

export function retainActiveDocument(
  ext: ExtImportResult,
  loaded: ImportResult,
  active: ActiveDocumentData,
): ImportResult {
  if (loaded.project.id !== active.project.id) return cleanDanglingReferences(loaded);
  const result = retainActiveScheduling(loaded, active.project);

  // Resourcekalenders blijven, ZONDER de projectkalender: die gaat als `calendar` mee en wordt bij het
  // laden weer bibliotheek-entry (`promoteProjectCalendarToLibrary`). Stond hij ook in
  // `resourceCalendars`, dan hernoemde `ensureUniqueImportIds` hem als dubbel id (`…-dup-2`). Stuurt de
  // extensie de projectkalender ongewijzigd terug, dan blijft de entry van het document, met de velden
  // die `ExtCalendar` niet naar binnen draagt (`p6Source`, `p6NonWorkPenaltyDates`, …).
  const own = active.calendars.find((c) => c.id === result.calendar.id);
  const calendar = own && sameValue(ext.calendar, toExtCalendar(own)) ? structuredClone(own) : result.calendar;
  const calendars = active.calendars.filter((c) => c.id !== calendar.id).map((c) => structuredClone(c));

  return cleanDanglingReferences({
    ...result,
    calendar,
    resourceCalendars: calendars,
    baselines: active.baselines.map((b) => structuredClone(b)),
    activeBaselineId: active.activeBaselineId,
    activityCodeTypes: active.activityCodeTypes.map((t) => structuredClone(t)),
    customFieldDefs: active.customFieldDefs.map((d) => structuredClone(d)),
    ...(active.ifcGlobalIds ? { ifcGlobalIds: { ...active.ifcGlobalIds } } : {}),
  });
}

/** Zie de kop: bestaand opruimgedrag van de store, toegepast op het te laden resultaat. */
export function cleanDanglingReferences(loaded: ImportResult): ImportResult {
  const calendarIds = new Set([loaded.calendar.id, ...(loaded.resourceCalendars ?? []).map((c) => c.id)]);
  const known = (id: string | undefined) => !id || calendarIds.has(id);
  return {
    ...loaded,
    resources: loaded.resources.map((r) => (known(r.calendarId) ? r : { ...r, calendarId: undefined })),
    tasks: loaded.tasks.map((t) => (known(t.calendarId) ? t : { ...t, calendarId: undefined })),
  };
}
