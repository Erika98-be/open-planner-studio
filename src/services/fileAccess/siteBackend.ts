import type { FileRef, OpenDialogOpts, OpenedFile } from './index';
import { getSiteStorage, type SiteFileInfo, type SiteStorage, type SiteVersionInfo } from './siteHost';
import { extensionOf } from '@/utils/filePath';

/**
 * De backend voor `FileRef`s van de soort `site` (issue #309). `fileAccess/index.ts` stuurt elke
 * site-ref hierheen, vóór de keuze tussen Tauri en web. Het contract zelf staat in `siteHost.ts`.
 *
 * Twee afspraken die de rest van de app aangaan:
 *  - Een FOUT van de site (ook een conflict) gooit hier gewoon door. De aanroeper meldt hem; er is
 *    geen stille terugval naar een andere opslagplek, want dan belandt werk ongemerkt ergens anders.
 *  - Ontbreekt de site-opslag (de host is weg), dan geeft schrijven `false` en lezen `null` — net als
 *    een web-handle zonder rechten. De aanroeper valt dan terug op zijn gewone route.
 */

/** MIME-type van een opgeslagen IFC-bestand (de tool schrijft altijd IFC). */
export const SITE_SAVE_MIME = 'application/x-step';

// ── Laatst bekende versie en naam per bestand ──────────────────────────────────────────────────
//
// Per bestand-id de versie die de tool het laatst las (nieuwste versie geopend) of schreef. Die gaat
// als `baseVersion` mee bij de volgende opslag, zodat de site een conflict kan herkennen. Alleen in het
// geheugen van deze sessie; crashherstel zet hem terug via `rememberSiteVersion` (zie
// `useRecoveryRestore`). Bewust per id en niet per document: twee tabbladen op hetzelfde bestand delen
// dus één basis, net zoals twee tabbladen op hetzelfde lokale bestand elkaar overschrijven.
const knownVersions = new Map<string, string>();
// De laatste naam die de site voor een id gaf; terugval voor het verplichte `name`-veld bij een
// nieuwe versie wanneer de aanroeper geen naam meegeeft.
const knownNames = new Map<string, string>();

/** De laatst bekende versie van dit bestand, of `undefined`. */
export function knownSiteVersion(id: string): string | undefined {
  return knownVersions.get(id);
}

/**
 * Leg de laatst bekende versie vast. `undefined` wist hem (de site gaf geen versie terug).
 * `onlyIfUnknown`: alleen zetten als er nog niets bekend is (crashherstel mag een verse lezing in
 * deze sessie niet overschrijven).
 */
export function rememberSiteVersion(id: string, version: string | undefined, opts?: { onlyIfUnknown?: boolean }): void {
  if (opts?.onlyIfUnknown && knownVersions.has(id)) return;
  if (version === undefined || version === '') knownVersions.delete(id);
  else knownVersions.set(id, version);
}

/** Alleen voor tests: vergeet alle versies en namen. */
export function resetSiteVersionsForTests(): void {
  knownVersions.clear();
  knownNames.clear();
}

// ── Inhoud omzetten ────────────────────────────────────────────────────────────────────────────

type SiteData = Blob | ArrayBuffer | Uint8Array | string;

/**
 * Inhoud van de site als bytes. Bewust zonder `instanceof`: een host op `window.parent` maakt zijn
 * `Uint8Array`/`ArrayBuffer`/`Blob` in een ANDER venster, en `instanceof` geeft dan `false`.
 * `ArrayBuffer.isView` en `Object.prototype.toString` werken wel over vensters heen.
 */
export async function siteDataToBytes(data: SiteData): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') return new Uint8Array(data as ArrayBuffer);
  if (data && typeof (data as Blob).arrayBuffer === 'function') return new Uint8Array(await (data as Blob).arrayBuffer());
  throw new Error('De site leverde inhoud in een onbekende vorm.');
}

/** Inhoud van de site als tekst: UTF-8, zoals `File.text()` (een BOM aan het begin valt weg). */
export async function siteDataToText(data: SiteData): Promise<string> {
  if (typeof data === 'string') return data;
  return new TextDecoder('utf-8').decode(await siteDataToBytes(data));
}

function requireStorage(): SiteStorage {
  const storage = getSiteStorage();
  if (!storage) throw new Error('Er is geen opslag via de site beschikbaar.');
  return storage;
}

/**
 * De ene leesroute: haal een versie op en, alleen bij de NIEUWSTE versie, onthoud versie en naam.
 * Een oudere versie raakt de basis nooit: die mag geen opslagdoel worden.
 */
async function readSiteFile(id: string, version?: string): Promise<{ file: SiteFileInfo; data: SiteData }> {
  const { file, data } = await requireStorage().open(id, version);
  const info: SiteFileInfo = { ...file, id, name: file?.name || id };
  if (version === undefined) {
    rememberSiteVersion(id, file?.version);
    if (file?.name) knownNames.set(id, file.name);
  }
  return { file: info, data };
}

// ── Openen en opslaan ──────────────────────────────────────────────────────────────────────────

/** Een geopend site-bestand: de gewone `OpenedFile` plus de info van de site. */
export interface OpenedSiteFile extends OpenedFile {
  file: SiteFileInfo;
}

/**
 * Open een bestand van de site. Zonder `version`: de nieuwste versie, met een site-ref als opslagdoel
 * en de versie onthouden als basis. Met `version`: die (oudere) versie, ZONDER ref en zonder de basis
 * te raken — een oudere versie mag nooit het opslagdoel worden. Gooit bij een fout of zonder opslag.
 */
export async function openSiteFile(id: string, opts?: OpenDialogOpts & { version?: string }): Promise<OpenedSiteFile> {
  const version = opts?.version;
  const { file, data } = await readSiteFile(id, version);
  const ref: FileRef | null = version === undefined ? { kind: 'site', id } : null;
  if ((opts?.binaryExtensions ?? []).includes(extensionOf(file.name))) {
    return { name: file.name, content: '', bytes: await siteDataToBytes(data), ref, file };
  }
  return { name: file.name, content: await siteDataToText(data), ref, file };
}

/** Sla een NIEUW bestand op de site op (geen `id`). Onthoudt versie en naam. Gooit bij een fout. */
export async function saveNewSiteFile(name: string, content: string): Promise<SiteFileInfo> {
  const storage = requireStorage();
  const info = await storage.save({ name, data: new Blob([content], { type: SITE_SAVE_MIME }) });
  if (!info || typeof info.id !== 'string' || info.id.length === 0) {
    throw new Error('De site gaf geen bestand-id terug na het opslaan.');
  }
  rememberSiteVersion(info.id, info.version);
  knownNames.set(info.id, info.name || name);
  return { ...info, name: info.name || name };
}

/**
 * De lijst van bestanden die de tool kan openen. De site MAG op `extensions` filteren; doet ze dat
 * niet, dan filtert de tool zelf, zodat de lijst nooit bestanden toont die niet te openen zijn.
 * Gooit bij een fout of zonder opslag.
 */
export async function listSiteFiles(extensions: string[]): Promise<SiteFileInfo[]> {
  const files = await requireStorage().list({ extensions });
  if (!Array.isArray(files)) return [];
  const wanted = new Set(extensions.map((e) => e.toLowerCase()));
  return files.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string'
    && (wanted.size === 0 || wanted.has(extensionOf(f.name))));
}

/** De versies van één bestand, in de volgorde van de site. Gooit bij een fout of zonder opslag. */
export async function listSiteVersions(id: string): Promise<SiteVersionInfo[]> {
  const versions = await requireStorage().versions(id);
  return Array.isArray(versions) ? versions.filter((v) => v && typeof v.version === 'string') : [];
}

// ── De FileRef-functies voor `fileAccess/index.ts` ─────────────────────────────────────────────

/**
 * Schrijf een nieuwe versie van een bestaand site-bestand. `false` zonder site-opslag; een fout van
 * de site (ook `code === 'conflict'`) gooit door. `name` is de bestandsnaam die het document kent;
 * het contract vraagt hem altijd, maar bij een bestaand `id` mag de site hem negeren. Zonder `name`
 * gaat de laatste naam mee die de site zelf gaf (openen of opslaan), anders het id.
 */
export async function saveToRefSite(ref: FileRef, content: string, name?: string): Promise<boolean> {
  if (ref.kind !== 'site') return false;
  const storage = getSiteStorage();
  if (!storage) return false;
  const baseVersion = knownSiteVersion(ref.id);
  const info = await storage.save({
    id: ref.id,
    name: name || knownNames.get(ref.id) || ref.id,
    data: new Blob([content], { type: SITE_SAVE_MIME }),
    ...(baseVersion !== undefined ? { baseVersion } : {}),
  });
  rememberSiteVersion(ref.id, info?.version);
  if (info?.name) knownNames.set(ref.id, info.name);
  return true;
}

/** Timerpad (echte AutoSave): de site kent geen permissieprompt, dus "schrijfbaar" = opslag aanwezig. */
export function canWriteToRefWithoutPromptSite(ref: FileRef): boolean {
  return ref.kind === 'site' && getSiteStorage() !== null;
}

/** Lees de nieuwste versie als tekst; `null` bij een fout of zonder opslag (recents ruimt dan op). */
export async function readFromRefSite(ref: FileRef): Promise<string | null> {
  if (ref.kind !== 'site') return null;
  try {
    return await siteDataToText((await readSiteFile(ref.id)).data);
  } catch {
    return null;
  }
}

/** Lees de nieuwste versie als bytes; `null` bij een fout of zonder opslag. */
export async function readBytesFromRefSite(ref: FileRef): Promise<Uint8Array | null> {
  if (ref.kind !== 'site') return null;
  try {
    return await siteDataToBytes((await readSiteFile(ref.id)).data);
  } catch {
    return null;
  }
}
