import type { Project } from '@/types/project';
import type { XerImportMetadata } from '@/services/importTypes';
import { xerProjectCode } from '@/utils/xerDocumentName';

/**
 * De P6 Project-ID van een document, los van de projectnaam.
 *
 * Eigenaarsbesluit 2026-10-13 (vervolg op B21, documentnaam "Projectnaam (Project-ID)"): de code
 * blijft altijd, los van de naam, zoals bij XER. In *Projectinfo* staat alleen de naam ("Bid for
 * Facility Extension"). Hernoem je naar "Uitbreiding hal", dan toont het tabblad "Uitbreiding hal
 * (OZB-05)". Bij een export naar P6 gaat OZB-05 terug als Project-ID, zodat P6 het project herkent;
 * de code overleeft opslaan als IFC.
 *
 * Dit is de ENE bron voor de code: tabblad, projectbalk/overzicht, titelbalk, venstertitel,
 * sluitdialoog, herstelvenster, bezettingsoverzicht, `getOpenDocuments` (ook MCP), rapportkop, de
 * voorgestelde bestandsnamen (opslaan, export, PDF) en de P6 XML-writer (`<Id>`). De naamregel
 * "Naam (code)" staat in `nameWithProjectCode` (`projectCodeName.ts`).
 *
 * - P6 XML: `project.p6ProjectCode` (de lezer bewaart `<Project><Id>` apart; IFC round-tript hem via
 *   `OPS_ProjectSettings/P6ProjectCode`). Ook een XER-document na een extensie-load draagt hem hier
 *   (`retainActiveDocument`), omdat de broncache dan vervalt.
 * - XER: `PROJECT.proj_short_name` uit de broncache (`xerProjectCode`).
 *
 * Geen van beide ⇒ `undefined` (geen code).
 */
export function documentProjectCode(
  project: Pick<Project, 'p6ProjectCode'> | null | undefined,
  xerMeta?: XerImportMetadata | null,
): string | undefined {
  return project?.p6ProjectCode?.trim() || xerProjectCode(xerMeta);
}
