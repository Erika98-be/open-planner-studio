/**
 * Het HOSTCONTRACT voor opslag via de site (issue #309, onderdeel van #307).
 *
 * OpenAEC zet de tools in één Frappe-app. Een tool draait daar in de browser, binnen een pagina van
 * een ingelogde site. Openen en opslaan lopen dan via dit kleine contract: de SITE levert het, de
 * tool gebruikt het. Uploaden en downloaden van de eigen pc blijven gewoon bestaan.
 *
 * Deze tool definieert het contract als eerste. Het is daarom bewust klein en algemeen gehouden, zonder
 * iets wat alleen voor planningen geldt; een andere tool kan het letterlijk overnemen.
 *
 * ## Hoe de site het aanbiedt
 *
 * De site zet `window.openaecHost` (een `OpenAECHost`). Dat mag vóór of na het laden van de tool: de
 * tool kijkt pas op het moment van gebruik (`getSiteStorage()`), niet één keer bij de start. Draait de
 * tool in een iframe van dezelfde origin, dan mag het object ook op `window.parent` staan. Een
 * cross-origin parent is niet bereikbaar en telt als "geen site".
 *
 * Gebruikt de site `initialFileId` en zet ze de host pas ná het laden, dan stuurt ze daarna één keer
 * het event `openaec-host-ready` op `window` (zie `SITE_HOST_READY_EVENT`). Anders mist de tool het
 * startbestand als zijn opstartcontrole al voorbij is.
 *
 * ## De vier functies
 *
 * - `list({ extensions })` — de bestanden die de tool kan openen. `extensions` zijn extensies zonder
 *   punt, in kleine letters (`['ifc', 'csv', 'xml', 'mpp', 'xer']`); de site mag erop filteren.
 * - `open(id, version?)` — de inhoud van een bestand. Zonder `version` de nieuwste versie. `data` mag
 *   een `Blob`, `ArrayBuffer`, `Uint8Array` of tekst zijn; tekstformaten leest de tool als UTF-8
 *   (zoals `File.text()`).
 * - `save({ id?, name, data, baseVersion? })` — opslaan. ZONDER `id` maakt dit een NIEUW bestand; MET
 *   `id` schrijft het een nieuwe versie van dat bestand en geeft het hetzelfde `id` terug.
 *   `baseVersion` is de versie die de tool van dat bestand het laatst las of schreef. Is het bestand
 *   intussen verder (iemand anders sloeg op), dan mag de site weigeren met een fout waarvan
 *   `code === 'conflict'`; de tool meldt dat dan apart en het document blijft gewijzigd. Elke andere
 *   fout meldt de tool met de tekst (`message`) van de site erbij.
 * - `versions(id)` — de versies van een bestand, nieuwste eerst.
 *
 * Alle vier geven een Promise terug. Een geweigerde Promise is een fout; de tool vangt hem af.
 *
 * Staat de host op `window.parent`, dan komen objecten uit twee vensters. De tool controleert de
 * inhoud daarom zonder `instanceof`; de site doet er goed aan hetzelfde te doen met de `Blob` die de
 * tool bij `save` meegeeft (gebruik `data.arrayBuffer()`/`data.text()`, niet `data instanceof Blob`).
 * Een `save` zonder `id` met een naam die al bestaat: wat er dan gebeurt (nieuw bestand of weigeren)
 * beslist de site.
 */

/** Eén bestand op de site. */
export interface SiteFileInfo {
  /** Vaste id van het bestand op de site. Verandert niet bij een nieuwe versie. */
  id: string;
  /** Bestandsnaam inclusief extensie (bijv. `Planning.ifc`). De extensie bepaalt het formaat. */
  name: string;
  /** De versie die deze info beschrijft (na `open`/`save`: de gelezen of net geschreven versie). */
  version?: string;
  /** Laatst gewijzigd, bij voorkeur ISO 8601. Alleen voor weergave. */
  modified?: string;
  /** Grootte in bytes. Alleen voor weergave. */
  size?: number;
}

/** Eén versie van een bestand. */
export interface SiteVersionInfo {
  version: string;
  /** Moment van deze versie, bij voorkeur ISO 8601. Alleen voor weergave. */
  modified?: string;
  /** Wie deze versie opsloeg. Alleen voor weergave. */
  author?: string;
  /** Leesbaar label (bijv. `3`); zonder label toont de tool `version`. */
  label?: string;
}

/** De opslag die de site aanbiedt. Zie de kop van deze module. */
export interface SiteStorage {
  list(query?: { extensions?: string[] }): Promise<SiteFileInfo[]>;
  open(id: string, version?: string): Promise<{ file: SiteFileInfo; data: Blob | ArrayBuffer | Uint8Array | string }>;
  save(request: { id?: string; name: string; data: Blob; baseVersion?: string }): Promise<SiteFileInfo>;
  versions(id: string): Promise<SiteVersionInfo[]>;
}

/** Wat de site op `window.openaecHost` zet. */
export interface OpenAECHost {
  storage?: SiteStorage;
  /** Open dit bestand (nieuwste versie) bij de start, als de tool nog een leeg document heeft. */
  initialFileId?: string;
}

/** Event op `window` waarmee een site meldt dat `window.openaecHost` er nu staat. */
export const SITE_HOST_READY_EVENT = 'openaec-host-ready';

/** De `code` waarmee een site een opslag weigert omdat het bestand intussen verder is. */
export const SITE_CONFLICT_CODE = 'conflict';

declare global {
  interface Window {
    /** Gezet door de site die de tool host. Bewust `unknown`: de tool valideert de vorm zelf. */
    openaecHost?: unknown;
  }
}

/** Heeft `value` de vorm van een `SiteStorage` (vier functies)? */
export function isSiteStorage(value: unknown): value is SiteStorage {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.list === 'function' && typeof s.open === 'function'
    && typeof s.save === 'function' && typeof s.versions === 'function';
}

/**
 * Lees de host uit één venster. Een cross-origin `window.parent` gooit al bij het lezen van een
 * eigenschap (`SecurityError`); dat telt als "geen host".
 */
function readHost(read: () => unknown): Record<string, unknown> | null {
  try {
    const host = read();
    return typeof host === 'object' && host !== null ? host as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** De kandidaat-hosts in volgorde: eerst het eigen venster, dan de parent (alleen in een iframe). */
function candidateHosts(): Record<string, unknown>[] {
  if (typeof window === 'undefined') return [];
  // Desktop (Tauri) heeft nooit een site. Zo blijft de desktop-app gegarandeerd zoals hij was, ook
  // als er ooit per ongeluk iets op `window.openaecHost` staat.
  if ('__TAURI_INTERNALS__' in window) return [];
  const hosts: Record<string, unknown>[] = [];
  const own = readHost(() => window.openaecHost);
  if (own) hosts.push(own);
  const parent = readHost(() => {
    const p = window.parent;
    // Geen iframe: `window.parent === window`. Ook dat kan bij een vreemde omgeving gooien.
    return p && p !== window ? p.openaecHost : undefined;
  });
  if (parent) hosts.push(parent);
  return hosts;
}

/**
 * De opslag van de site, of `null` als er geen (geldige) is. Kijkt op het moment van aanroepen —
 * een site mag de host dus ook later zetten. Een host zonder vier functies telt als "geen site".
 */
export function getSiteStorage(): SiteStorage | null {
  for (const host of candidateHosts()) {
    if (isSiteStorage(host.storage)) return host.storage;
  }
  return null;
}

/** Is er nu opslag via de site? De ene vraag waarop de UI en de opslaanroute beslissen. */
export function siteStorageAvailable(): boolean {
  return getSiteStorage() !== null;
}

/**
 * Het bestand dat de site bij de start geopend wil hebben, of `null`. Alleen als dezelfde host ook
 * een geldige opslag levert: zonder opslag kan de tool het bestand niet openen.
 */
export function siteInitialFileId(): string | null {
  for (const host of candidateHosts()) {
    if (!isSiteStorage(host.storage)) continue;
    const id = host.initialFileId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
  return null;
}

/** Weigerde de site een opslag omdat het bestand intussen verder is? (`code === 'conflict'`) */
export function isSiteConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === SITE_CONFLICT_CODE;
}

/** De tekst van een fout van de site, voor het detail van een melding. */
export function siteErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}
