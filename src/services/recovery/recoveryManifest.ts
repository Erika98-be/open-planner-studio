import type { RecoveryManifestDoc } from '@/hooks/recoveryPaths';

/** 1/2: stabiele snapshots; 3: generaties; 4: datumstand; 5: XER-archiefverwijzing. */
export const RECOVERY_MANIFEST_VERSION = 5;

export class RecoveryManifestError extends Error {
  constructor(readonly reason: 'invalid-version' | 'unsupported-version' | 'invalid-shape') {
    super(`Recovery: manifest geweigerd (${reason}).`);
    this.name = 'RecoveryManifestError';
  }
}

/** Geen migratie: alleen de werkelijk geschreven versies zijn leesbaar. */
export function checkRecoveryManifestVersion(version: unknown): void {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new RecoveryManifestError('invalid-version');
  }
  if (version > RECOVERY_MANIFEST_VERSION) throw new RecoveryManifestError('unsupported-version');
}

/** Eén manifest mag een document maar één keer vertegenwoordigen, ook in de oude docIds-vorm. */
export function checkRecoveryDocumentIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== 'string' || !id)
    || new Set(ids).size !== ids.length) throw new RecoveryManifestError('invalid-shape');
}

/** Identiteiten zijn nodig om metadata en bytes te koppelen; optionele sitevelden blijven tolerant. */
export function checkRecoveryDocuments(documents: unknown): asserts documents is RecoveryManifestDoc[] {
  if (!Array.isArray(documents) || documents.some((d: unknown) => {
    if (!d || typeof d !== 'object') return true;
    const record = d as Record<string, unknown>;
    return typeof record.id !== 'string' || record.id.length === 0
      || typeof record.ifc !== 'string' || record.ifc.length === 0;
  })) throw new RecoveryManifestError('invalid-shape');
  checkRecoveryDocumentIds(documents.map((document: RecoveryManifestDoc) => document.id));
}
