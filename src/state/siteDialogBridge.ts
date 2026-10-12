/**
 * Bedrading tussen de twee site-vragen (`services/fileAccess/siteDialogs.ts`) en de dialogen die ze
 * stellen (`SiteOpenDialog`, `SiteSaveDialog`). Zelfde opzet als `extensions/consentBridge.ts` en
 * `state/actualStartQuestion.ts`: de store draagt alleen de VRAAG (`ui.pendingSiteOpen` /
 * `ui.pendingSiteSave`, zodat de dialoog er reactief op rendert en `hasBlockingDialogOpen` de rest
 * van de app stil legt); de RESOLVER staat in module-state — een promise-resolver is geen
 * documentdata en hoort niet in een snapshot.
 *
 * Eager geïmporteerd door `App.tsx` (de dialogen zelf laden lazy): zonder deze registratie valt de
 * vraag terug op "van/op deze pc", en dat is veilig maar niet de bedoeling als er een site is.
 *
 * Er staat per soort hooguit één vraag open. Komt er toch een tweede binnen, dan wordt de eerste als
 * geannuleerd beantwoord (er gebeurt dan niets) in plaats van eeuwig te blijven hangen.
 */
import { useAppStore } from '@/state/appStore';
import {
  setSiteOpenAsker, setSiteSaveAsker, type SiteOpenChoice, type SiteSaveChoice,
} from '@/services/fileAccess/siteDialogs';

let resolveOpen: ((choice: SiteOpenChoice) => void) | null = null;
let resolveSave: ((choice: SiteSaveChoice) => void) | null = null;

/** Beantwoord "Openen van de site" (`null` = annuleren). Geen open vraag ⇒ no-op (dubbelklik). */
export function answerSiteOpen(choice: SiteOpenChoice): void {
  const resolve = resolveOpen;
  if (!resolve) return;
  resolveOpen = null;
  useAppStore.getState().setUI({ pendingSiteOpen: null });
  resolve(choice);
}

/** Beantwoord "Opslaan op de site" (`null` = annuleren). Geen open vraag ⇒ no-op (dubbelklik). */
export function answerSiteSave(choice: SiteSaveChoice): void {
  const resolve = resolveSave;
  if (!resolve) return;
  resolveSave = null;
  useAppStore.getState().setUI({ pendingSiteSave: null });
  resolve(choice);
}

/** Registreer de dialogen als vragers. Eén keer aanroepen bij het opstarten. */
export function installSiteDialogAskers(): void {
  setSiteOpenAsker((request) => new Promise<SiteOpenChoice>((resolve) => {
    if (resolveOpen) {
      const previous = resolveOpen;
      resolveOpen = null;
      previous(null);
    }
    resolveOpen = resolve;
    useAppStore.getState().setUI({ pendingSiteOpen: request });
  }));
  setSiteSaveAsker((request) => new Promise<SiteSaveChoice>((resolve) => {
    if (resolveSave) {
      const previous = resolveSave;
      resolveSave = null;
      previous(null);
    }
    resolveSave = resolve;
    useAppStore.getState().setUI({ pendingSiteSave: request });
  }));
}
