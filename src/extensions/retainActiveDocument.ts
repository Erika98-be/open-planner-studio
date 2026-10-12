/**
 * `api.data.loadProject` op HETZELFDE project (lees-wijzig-laad, het gedocumenteerde pad om
 * toewijzingen te zetten): houd vast wat `ExtImportResult` niet kan dragen. Anders verdwijnt dat stil
 * bij elke extensie-load (review #169, N3 en de fixrondes van 2026-10-12). Reden, net als B29: een
 * extensie mag het project niet stil veranderen.
 *
 * Wat het contract (`ExtImportResult`, contract 1.4.0) draagt en wat niet:
 *  - rekenprofiel: niet (alleen-lezen, B29) ⇒ van het document;
 *  - reken-opties: alleen de zes publieke (`PUBLIC_SCHEDULING_OPTION_KEYS`) ⇒ die volgen de extensie
 *    (ook weglaten), de rest komt van het document;
 *  - baselines en `activeBaselineId`: niet ⇒ van het document;
 *  - resourcekalenders (`calendars`): niet (alleen de projectkalender `calendar`) ⇒ van het document;
 *    de projectkalender zelf volgt de extensie, tenzij zij hem ongewijzigd terugstuurt;
 *  - `activityCodeTypes` en `customFieldDefs`: niet (taken dragen alleen de waarden) ⇒ van het document;
 *  - `ifcGlobalIds`: niet ⇒ van het document.
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
 * Gedeelde referenties: wat van het document komt, gaat ZONDER kopie mee. Dat is veilig omdat de
 * store-objecten bevroren zijn (Immer auto-freeze) en het laadpad (`applyLoadedProject` →
 * `payloadFromImport`/`prepareLoadedPayload`/`stripLibraryOrigins`/`ensureUniqueImportIds`) alleen
 * nieuwe objecten maakt; een mutatie in place zou in strict mode gooien. check-ext-contract N3D-12
 * pint dat de gedeelde objecten bevroren zijn en de load slaagt.
 */
import type { AppState } from '@/state/appStore';
import type { ImportResult } from '@/services/importTypes';
import type { ProjectSchedulingOptions } from '@/types/project';
import { sameValue } from '@/utils/sameValue';
import type { ExtImportResult } from './extTypes';
import { PUBLIC_SCHEDULING_OPTION_KEYS, toExtCalendar } from './extMappers';

/** Het deel van het actieve document dat deze stap leest. */
export type ActiveDocument = Pick<AppState,
  'project' | 'calendars' | 'baselines' | 'activeBaselineId' | 'activityCodeTypes' | 'customFieldDefs' | 'ifcGlobalIds'>;

export function retainActiveDocument(ext: ExtImportResult, loaded: ImportResult, active: ActiveDocument): ImportResult {
  if (loaded.project.id !== active.project.id) return cleanDanglingReferences(loaded);

  // Reken-opties: die van het document, met de publieke sleutels vervangen door die van de extensie.
  const options: Record<string, unknown> = { ...active.project.schedulingOptions };
  for (const key of PUBLIC_SCHEDULING_OPTION_KEYS) delete options[key];
  Object.assign(options, loaded.project.schedulingOptions);
  const project = {
    ...loaded.project,
    schedulingProfile: active.project.schedulingProfile,
    schedulingOptions: Object.keys(options).length > 0 ? options as ProjectSchedulingOptions : undefined,
  };

  // Resourcekalenders blijven, ZONDER de projectkalender: die gaat als `calendar` mee en wordt bij het
  // laden weer bibliotheek-entry (`promoteProjectCalendarToLibrary`). Stond hij ook in
  // `resourceCalendars`, dan hernoemde `ensureUniqueImportIds` hem als dubbel id (`…-dup-2`). Stuurt de
  // extensie de projectkalender ongewijzigd terug, dan blijft de entry van het document, met de velden
  // die `ExtCalendar` niet naar binnen draagt (`p6Source`, `p6NonWorkPenaltyDates`, …).
  const own = active.calendars.find((c) => c.id === loaded.calendar.id);
  const calendar = own && sameValue(ext.calendar, toExtCalendar(own)) ? own : loaded.calendar;

  return cleanDanglingReferences({
    ...loaded,
    project,
    calendar,
    resourceCalendars: active.calendars.filter((c) => c.id !== calendar.id),
    baselines: active.baselines,
    activeBaselineId: active.activeBaselineId,
    activityCodeTypes: active.activityCodeTypes,
    customFieldDefs: active.customFieldDefs,
    ...(active.ifcGlobalIds ? { ifcGlobalIds: active.ifcGlobalIds } : {}),
  });
}

/** Een resource of taak met een `calendarId` naar een kalender die er na de load niet is, valt terug
 *  op de projectkalender (zoals `removeCalendar`). De solver deed dat al (`resolveCalendar`). */
export function cleanDanglingReferences(loaded: ImportResult): ImportResult {
  const calendarIds = new Set([loaded.calendar.id, ...(loaded.resourceCalendars ?? []).map((c) => c.id)]);
  const known = (id: string | undefined) => !id || calendarIds.has(id);
  return {
    ...loaded,
    resources: loaded.resources.map((r) => (known(r.calendarId) ? r : { ...r, calendarId: undefined })),
    tasks: loaded.tasks.map((t) => (known(t.calendarId) ? t : { ...t, calendarId: undefined })),
  };
}
