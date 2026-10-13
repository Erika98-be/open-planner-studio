import type { XerImportMetadata } from '@/services/importTypes';

/**
 * Het P6 Project-ID van een XER-document (XER-bron van `documentProjectCode`; de documentnaam maakt
 * `nameWithProjectCode`), afgeleid uit de PROJECT-bronrij die de XER-broncache
 * (`scheduleOptions.sourceRows`) al per document draagt en die het IFC-bronarchief round-tript.
 * Daardoor is er geen nieuw metadataveld of archiefschema nodig. Geen XER ⇒ `undefined`.
 */
export function xerProjectCode(meta: XerImportMetadata | null | undefined): string | undefined {
  if (!meta?.sourceProjectId) return undefined;
  const row = meta.scheduleOptions?.sourceRows?.find(r =>
    r.table === 'PROJECT' && r.cells.proj_id === meta.sourceProjectId);
  const code = row?.cells.proj_short_name?.trim();
  return code || undefined;
}
