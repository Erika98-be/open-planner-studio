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
 *  - `ifcGlobalIds`: niet ⇒ van het document;
 *  - `customTaskTypes`: alleen wat de extensie meestuurt (lijst plus de typen op haar taken) ⇒ de
 *    documententries die zij niet meestuurt, komen erbij. Botst een documententry met een entry van de
 *    extensie op id of op naam (dezelfde sleutels als `fromExtImportResult`: id getrimd, naam
 *    hoofdletterongevoelig), dan wint de extensie en valt de documententry weg; `fromExtImportResult`
 *    gooit alleen bij botsingen BINNEN de invoer van de extensie;
 *  - bronvelden op taken en relaties (`TASK_SOURCE_FIELDS`, `SEQUENCE_SOURCE_FIELDS`): zichtbaar maar
 *    alleen-lezen (`fromExtTask`/`fromExtSequence` nemen ze niet over) ⇒ van de taak of relatie met
 *    hetzelfde id in het document. De solver leest ze (P6-route), dus zonder dit rekent een P6-project
 *    na een ONGEWIJZIGDE lees-wijzig-laad anders. De lijsten zijn gelijk aan `LEES_ALLEEN_EXT` in
 *    check-ext-contract; daar staat ook dat er geen niet-publieke taak-/relatievelden zijn
 *    (`NIET_PUBLIEK`). De .mpp-/MSP-velden (`mspTaskType`, `timephased*`, …) reizen al gewoon mee.
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
import type { Task } from '@/types/task';
import type { Sequence } from '@/types/sequence';
import { sameValue } from '@/utils/sameValue';
import type { ExtImportResult } from './extTypes';
import { PUBLIC_SCHEDULING_OPTION_KEYS, toExtCalendar } from './extMappers';

/** Alleen-lezen bronvelden: `toExt*` geeft ze door, `fromExt*` neemt ze niet over. */
export const TASK_SOURCE_FIELDS = [
  'p6DurationType', 'p6ActivityType', 'p6ProjectId', 'p6TaskId', 'p6ExplicitTargetWindow',
  'p6CompletePctType', 'p6ExpectedFinish', 'p6SuspendResume',
] as const satisfies readonly (keyof Task)[];
export const SEQUENCE_SOURCE_FIELDS = ['p6StartAtPredecessorFinishBoundary'] as const satisfies readonly (keyof Sequence)[];

/** Zet de bronvelden van het documentitem met hetzelfde id terug op het geladen item. */
function withSourceFields<T extends { id: string }>(items: T[], own: readonly T[], fields: readonly (keyof T)[]): T[] {
  const byId = new Map(own.map((item) => [item.id, item]));
  return items.map((item) => {
    const source = byId.get(item.id);
    if (!source) return item;
    const extra: Partial<T> = {};
    for (const field of fields) if (source[field] !== undefined) extra[field] = source[field];
    return Object.keys(extra).length > 0 ? { ...item, ...extra } : item;
  });
}

/** Documententries die de extensie niet meestuurt, achter die van de extensie (zie de kop). */
function mergeCustomTaskTypes(
  fromExtension: readonly { id: string; name: string }[],
  own: readonly { id: string; name: string }[],
): { id: string; name: string }[] {
  const ids = new Set(fromExtension.map((t) => t.id.trim()));
  const names = new Set(fromExtension.map((t) => t.name.trim().toLocaleLowerCase()));
  return [
    ...fromExtension,
    ...own.filter((t) => !ids.has(t.id.trim()) && !names.has(t.name.trim().toLocaleLowerCase())),
  ];
}

/** Het deel van het actieve document dat deze stap leest. */
export type ActiveDocument = Pick<AppState,
  'project' | 'tasks' | 'sequences' | 'customTaskTypes' | 'calendars' | 'baselines' | 'activeBaselineId' | 'activityCodeTypes' | 'customFieldDefs' | 'ifcGlobalIds'>;

export function retainActiveDocument(ext: ExtImportResult, loaded: ImportResult, active: ActiveDocument): ImportResult {
  // Ander id: een nieuw project; het resultaat gaat ongewijzigd door, precies zoals vóór deze stap.
  if (loaded.project.id !== active.project.id) return loaded;

  // Reken-opties: die van het document, met de publieke sleutels vervangen door die van de extensie.
  const options: Record<string, unknown> = { ...active.project.schedulingOptions };
  for (const key of PUBLIC_SCHEDULING_OPTION_KEYS) delete options[key];
  Object.assign(options, loaded.project.schedulingOptions);
  const project = {
    ...loaded.project,
    schedulingProfile: active.project.schedulingProfile,
    schedulingOptions: Object.keys(options).length > 0 ? options as ProjectSchedulingOptions : undefined,
  };

  // Kalenders. Eerst gaat de kalender die de extensie meestuurt (`calendar`) de bibliotheek in: stuurt
  // zij hem ongewijzigd terug, dan blijft de entry van het document, met de velden die `ExtCalendar`
  // niet naar binnen draagt (`p6Source`, `p6NonWorkPenaltyDates`, …). Daarna is de projectkalender de
  // entry met `project.calendarId`: wisselt de extensie daarmee van kalender, dan blijft de oude
  // gewoon in de bibliotheek. De projectkalender staat NIET ook in `resourceCalendars`: dan hernoemde
  // `ensureUniqueImportIds` hem als dubbel id (`…-dup-2`); het laden zet hem zelf weer in de
  // bibliotheek (`promoteProjectCalendarToLibrary`).
  const own = active.calendars.find((c) => c.id === loaded.calendar.id);
  const sent = own && sameValue(ext.calendar, toExtCalendar(own)) ? own : loaded.calendar;
  const library = [...active.calendars.map((c) => (c.id === sent.id ? sent : c)), ...(own ? [] : [sent])];
  const calendar = library.find((c) => c.id === project.calendarId) ?? sent;
  const resourceCalendars = library.filter((c) => c.id !== calendar.id);

  return cleanDanglingReferences({
    ...loaded,
    project,
    tasks: withSourceFields(loaded.tasks, active.tasks, TASK_SOURCE_FIELDS),
    sequences: withSourceFields(loaded.sequences, active.sequences, SEQUENCE_SOURCE_FIELDS),
    calendar,
    resourceCalendars,
    baselines: active.baselines,
    activeBaselineId: active.activeBaselineId,
    activityCodeTypes: active.activityCodeTypes,
    customFieldDefs: active.customFieldDefs,
    customTaskTypes: mergeCustomTaskTypes(loaded.customTaskTypes ?? [], active.customTaskTypes),
    ...(active.ifcGlobalIds ? { ifcGlobalIds: active.ifcGlobalIds } : {}),
  });
}

/** Alleen bij hetzelfde id: een resource of taak met een `calendarId` naar een kalender die niet in
 *  het geladen resultaat staat (de extensie wees naar een onbekend id), krijgt geen `calendarId` meer
 *  en rekent dus op de projectkalender. De berekening verandert daardoor niet: de solver viel bij een
 *  onbekend id al terug op de projectkalender (`resolveCalendar`). */
export function cleanDanglingReferences(loaded: ImportResult): ImportResult {
  const calendarIds = new Set([loaded.calendar.id, ...(loaded.resourceCalendars ?? []).map((c) => c.id)]);
  const known = (id: string | undefined) => !id || calendarIds.has(id);
  return {
    ...loaded,
    resources: loaded.resources.map((r) => (known(r.calendarId) ? r : { ...r, calendarId: undefined })),
    tasks: loaded.tasks.map((t) => (known(t.calendarId) ? t : { ...t, calendarId: undefined })),
  };
}
