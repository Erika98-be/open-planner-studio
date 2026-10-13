import type { Project } from '@/types/project';
import type { XerImportMetadata } from '@/services/importTypes';
import { xerProjectCode } from '@/utils/xerDocumentName';

/**
 * De P6 Project-ID van een document, los van de projectnaam (eigenaarsbesluit 2026-10-13): de ENE
 * bron voor elke plek die "Naam (code)" toont (tabblad, titelbalk, sluitdialoog, crashherstel,
 * bezettingsoverzicht, projectbalk/overzicht, voorgestelde bestandsnaam) én voor de P6 XML-writer,
 * die hem terugschrijft als `<Id>`.
 *
 * - P6 XML: `project.p6ProjectCode` (de lezer bewaart `<Project><Id>` apart; IFC round-tript hem).
 * - XER: `PROJECT.proj_short_name` uit de broncache (`xerProjectCode`), zoals vóór dit besluit.
 *
 * Een document heeft hooguit één van de twee; geen van beide ⇒ `undefined` (geen code). De naamregel
 * zelf staat in `nameWithProjectCode` (`projectCodeName.ts`).
 */
export function documentProjectCode(
  project: Pick<Project, 'p6ProjectCode'> | null | undefined,
  xerMeta?: XerImportMetadata | null,
): string | undefined {
  return project?.p6ProjectCode?.trim() || xerProjectCode(xerMeta);
}
