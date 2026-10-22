import type { NotifyInput } from './slices/types';
import { RECOVERY_HELP_ARTICLE_ID } from './helpArticles';
import { RecoveryManifestError } from '@/services/recovery/recoveryManifest';

// Startup, uitstellen en de ~10s-schrijfrondes delen één melding, ook na wegklikken.
let notified = false;

/** `true` betekent afgehandeld, ook als deze sessie al eerder een melding gaf. */
export function notifyRecoveryManifestError(error: unknown, notify: (notice: NotifyInput) => void): boolean {
  if (!(error instanceof RecoveryManifestError)) return false;
  if (!notified) {
    notified = true;
    notify({
      severity: 'error', messageKey: 'notifications.recoveryManifestBlocked',
      dedupeKey: 'recovery-manifest', helpArticleId: RECOVERY_HELP_ARTICLE_ID,
    });
  }
  return true;
}
