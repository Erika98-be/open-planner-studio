import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { isActivePristine } from '@/state/slices/fileSlice';
import { buildImportLabels } from '@/i18n/importLabels';
import { SITE_HOST_READY_EVENT, siteInitialFileId } from '@/services/fileAccess/siteHost';
import type { RecoveryState } from './useRecoveryRestore';

/**
 * Bestand van de host bij de start (issue #309). Zet de site `window.openaecHost.initialFileId`, dan
 * opent de tool dat bestand (nieuwste versie, met de site als opslagdoel) — maar pas NA de herstelkeuze
 * en alleen als het actieve document nog leeg en ongewijzigd is. Zo overschrijft de host nooit werk
 * van de gebruiker, ook niet een net hersteld document.
 *
 * Zet de site de host pas na het laden, dan wacht de hook één keer op het event
 * `openaec-host-ready` (`SITE_HOST_READY_EVENT`). Zonder site gebeurt er niets.
 */
export function useSiteInitialFile(recoveryResolved: boolean, recovery: RecoveryState | null): void {
  const { t } = useTranslation('common');
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !recoveryResolved || recovery !== null) return;

    const tryOpen = (): boolean => {
      const id = siteInitialFileId();
      if (!id) return false;
      started.current = true;
      if (!isActivePristine(useAppStore.getState())) return true;
      void useAppStore.getState().openFromSite(id, buildImportLabels(t));
      return true;
    };

    if (tryOpen()) return;
    if (typeof window === 'undefined') return;
    const onReady = () => {
      if (started.current) return;
      tryOpen();
    };
    window.addEventListener(SITE_HOST_READY_EVENT, onReady);
    return () => window.removeEventListener(SITE_HOST_READY_EVENT, onReady);
  }, [recoveryResolved, recovery, t]);
}
