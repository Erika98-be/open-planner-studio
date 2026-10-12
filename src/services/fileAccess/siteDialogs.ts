/**
 * De twee vragen van opslag via de site (issue #309): "Openen van de site" en "Opslaan op de site".
 *
 * Zelfde opzet als de toestemmingsvraag bij extensies (`extensions/consent.ts`): de opslaanroute in de
 * store STELT de vraag via een injecteerbare vrager, de UI BEANTWOORDT hem. Zo importeert `fileSlice`
 * geen componenten en blijft elk pad headless te draaien. De UI installeert de echte vragers bij het
 * opstarten (`state/siteDialogBridge.ts`, aangeroepen vanuit `App.tsx`).
 *
 * TERUGVAL ZONDER VRAGER: "van/op deze pc", dus de gewone bestandskiezer. Dat is precies het gedrag
 * van vóór deze functie; een ontbrekende vrager kan zo nooit werk naar een onverwachte plek sturen.
 */

/** De vraag "Openen van de site". `extensions`: wat de tool kan openen (zonder punt, kleine letters). */
export interface SiteOpenRequest {
  extensions: string[];
}

/** Het antwoord op "Openen van de site". `null` = geannuleerd. */
export type SiteOpenChoice =
  /** Een bestand van de site. Zonder `version`: de nieuwste versie, met de site als opslagdoel.
   *  Met `version`: een oudere versie, die opent als KOPIE zonder opslagdoel onder `copyName`. */
  | { kind: 'site'; id: string; version?: string; copyName?: string }
  /** "Van deze pc…": de gewone bestandskiezer. */
  | { kind: 'local' }
  | null;

/** De vraag "Opslaan op de site". `defaultName`: voorgevulde naam, eindigt op `.ifc`. */
export interface SiteSaveRequest {
  defaultName: string;
}

/** Het antwoord op "Opslaan op de site". `null` = geannuleerd. */
export type SiteSaveChoice =
  /** Als NIEUW bestand op de site, onder deze naam (eindigt op `.ifc`). */
  | { kind: 'site'; name: string }
  /** "Op deze pc…": de bestaande opslaanroute met de gewone kiezer of download. */
  | { kind: 'local' }
  | null;

export type SiteOpenAsker = (request: SiteOpenRequest) => Promise<SiteOpenChoice>;
export type SiteSaveAsker = (request: SiteSaveRequest) => Promise<SiteSaveChoice>;

const localOpen: SiteOpenAsker = () => Promise.resolve({ kind: 'local' });
const localSave: SiteSaveAsker = () => Promise.resolve({ kind: 'local' });

let openAsker: SiteOpenAsker = localOpen;
let saveAsker: SiteSaveAsker = localSave;

/** Installeer de vrager voor "Openen van de site" (de dialoog, of een override in tests). */
export function setSiteOpenAsker(fn: SiteOpenAsker): void {
  openAsker = fn;
}

/** Installeer de vrager voor "Opslaan op de site". */
export function setSiteSaveAsker(fn: SiteSaveAsker): void {
  saveAsker = fn;
}

/** Terug naar de terugval (van/op deze pc). Voor tests. */
export function resetSiteAskers(): void {
  openAsker = localOpen;
  saveAsker = localSave;
}

/** Stel de vraag "Openen van de site". */
export function askSiteOpen(request: SiteOpenRequest): Promise<SiteOpenChoice> {
  return openAsker(request);
}

/** Stel de vraag "Opslaan op de site". */
export function askSiteSave(request: SiteSaveRequest): Promise<SiteSaveChoice> {
  return saveAsker(request);
}
