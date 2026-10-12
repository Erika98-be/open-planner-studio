import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { isActivePristine } from '@/state/slices/fileSlice';
import { buildImportLabels } from '@/i18n/importLabels';
import { SITE_HOST_READY_EVENT, siteHostWindows, siteInitialFileId } from '@/services/fileAccess/siteHost';
import type { RecoveryState } from './useRecoveryRestore';

/**
 * Bestand van de host bij de start (issue #309). Zet de site `window.openaecHost.initialFileId`, dan
 * opent de tool dat bestand (nieuwste versie, met de site als opslagdoel) — maar pas NA de herstelkeuze
 * en alleen als het actieve document nog leeg en ongewijzigd is. Zo overschrijft de host nooit werk
 * van de gebruiker, ook niet een net hersteld document.
 *
 * Zet de site de host pas na het laden, dan wacht de hook één keer op het event
 * `openaec-host-ready` (`SITE_HOST_READY_EVENT`). De site stuurt dat op het venster waar de host
 * staat; de hook luistert daarom op het eigen venster én, in een iframe, op een same-origin parent.
 * Zonder site gebeurt er niets.
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
    // Eigen venster en een same-origin parent (een cross-origin parent laat `siteHostWindows` weg).
    // Het afmelden staat in een try: de parent kan intussen weg of van origin gewisseld zijn.
    // Een luisteraar op de PARENT verdwijnt niet met dit iframe: de pagina van de site leeft door
    // (Frappe desk is een single-page-app) en zou via de closure deze hele app vasthouden. Daarom
    // afmelden zodra het startbestand gevonden is, én bij `pagehide` van het eigen venster (iframe weg
    // of herladen), niet alleen bij de React-cleanup.
    const targets = siteHostWindows();
    let attached = true;
    const detach = () => {
      if (!attached) return;
      attached = false;
      for (const target of targets) {
        try { target.removeEventListener(SITE_HOST_READY_EVENT, onReady); } catch { /* parent weg */ }
      }
      window.removeEventListener('pagehide', detach);
    };
    const onReady = () => {
      if (started.current || tryOpen()) detach();
    };
    for (const target of targets) target.addEventListener(SITE_HOST_READY_EVENT, onReady);
    window.addEventListener('pagehide', detach);
    return detach;
  }, [recoveryResolved, recovery, t]);
}
