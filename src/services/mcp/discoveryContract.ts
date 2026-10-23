// Ontdekkingscontract app ↔ MCP-plugin (issue #570, "Ontwerp: één plugin, drie situaties").
//
// De desktop-app schrijft twee kleine JSON-bestanden in `<appDataDir>/mcp/`. De plugin (een headless
// MCP-server die buiten de app draait) leest ze en kiest daarmee per aanvraag:
//   - `runtime.json`    — bestaat zolang de MCP-bridge van de app draait. Daarmee vindt de plugin poort
//                         en token zelf; plakken is niet meer nodig. Draait de bridge, dan stuurt de
//                         plugin alles door naar de app.
//   - `open-files.json` — bestaat zolang de desktop-app draait, ook met de MCP-koppeling uit. Een
//                         plugin die zelf op bestanden werkt, weigert elk pad dat hierin staat.
//
// Deze module is HET contract: typen, bestandsnamen, de opbouw van de inhoud en de leesregels. Hij
// importeert niets (geen store, geen Tauri, geen i18n), zodat de plugin hem ongewijzigd kan bundelen.
// Uitleg voor mensen: `docs/mcp-ontdekking.md`. Een wijziging hier is een contractwijziging: een
// nieuw verplicht veld of een andere betekenis vraagt een hogere `formatVersion`.

/** Huidige versie van beide bestandsformaten. Een lezer negeert elk bestand met een andere waarde. */
export const MCP_DISCOVERY_FORMAT_VERSION = 1;

/** Submap van `appDataDir` waarin beide bestanden staan. */
export const MCP_DISCOVERY_DIR = 'mcp';

/** Unix-rechten van beide bestanden: alleen de eigenaar mag lezen en schrijven (het token is geheim). */
export const MCP_DISCOVERY_FILE_MODE = 0o600;

/** Unix-rechten van de map `mcp/`: alleen de eigenaar. */
export const MCP_DISCOVERY_DIR_MODE = 0o700;

/** Achtervoegsel van een halffabricaat. Een lezer slaat namen met dit achtervoegsel over. */
export const MCP_DISCOVERY_TMP_SUFFIX = '.tmp';

/** Inhoud van `runtime.json`. */
export interface McpRuntimeFile {
  formatVersion: 1;
  /** Proces-id van de app (het Rust-proces, niet de webview). */
  pid: number;
  /** TCP-poort van de bridge op `127.0.0.1`. */
  port: number;
  /** Bearer-token voor `Authorization: Bearer <token>`. */
  token: string;
  /** Versie van de app, zoals `2026.43.1`. */
  appVersion: string;
  /** Moment waarop deze bridge startte, ISO 8601 in UTC. */
  startedAt: string;
}

/** Inhoud van `open-files.json`. */
export interface McpOpenFilesFile {
  formatVersion: 1;
  /** Proces-id van de app (het Rust-proces, niet de webview). */
  pid: number;
  /** Versie van de app. */
  appVersion: string;
  /** Moment van de laatste schrijfactie, ISO 8601 in UTC. */
  updatedAt: string;
  /** Absolute, lexicaal genormaliseerde paden van de open documenten met een pad op schijf. Uniek, gesorteerd. */
  files: string[];
}

/** Bestandsnamen. Een productiebuild gebruikt de canonieke namen; een dev-instantie (worktree-slug,
 *  `OPS_DEV_INSTANCE`) schrijft `runtime.<slug>.json` en `open-files.<slug>.json`, zodat twee
 *  dev-builds naast elkaar elkaars bestanden niet overschrijven (zelfde reden als de recovery-namen). */
export interface McpDiscoveryNames {
  runtime: string;
  openFiles: string;
}

export function mcpDiscoveryNames(devInstance: string | null | undefined): McpDiscoveryNames {
  const suffix = devInstance ? `.${devInstance}` : '';
  return { runtime: `runtime${suffix}.json`, openFiles: `open-files${suffix}.json` };
}

// --- Inhoud opbouwen --------------------------------------------------------------------------------

export interface RuntimeFileInput {
  pid: number;
  port: number;
  token: string;
  appVersion: string;
  startedAt: Date;
}

export function buildRuntimeFile(input: RuntimeFileInput): McpRuntimeFile {
  return {
    formatVersion: MCP_DISCOVERY_FORMAT_VERSION,
    pid: input.pid,
    port: input.port,
    token: input.token,
    appVersion: input.appVersion,
    startedAt: input.startedAt.toISOString(),
  };
}

export interface OpenFilesInput {
  pid: number;
  appVersion: string;
  updatedAt: Date;
  /** Ruwe paden (al gefilterd op `FileRef` van de soort `path`); worden hier genormaliseerd. */
  paths: readonly string[];
}

export function buildOpenFilesFile(input: OpenFilesInput): McpOpenFilesFile {
  return {
    formatVersion: MCP_DISCOVERY_FORMAT_VERSION,
    pid: input.pid,
    appVersion: input.appVersion,
    updatedAt: input.updatedAt.toISOString(),
    files: normalizeOpenFileList(input.paths),
  };
}

/** Bestandstekst: JSON met twee spaties inspringing en een slot-newline. */
export function serializeDiscoveryFile(file: McpRuntimeFile | McpOpenFilesFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// --- Paden normaliseren -----------------------------------------------------------------------------
//
// De app normaliseert LEXICAAL: geen bestandssysteemtoegang. Symlinks lost de app niet op: plugin-fs
// kent geen `realpath`, en een eigen Rust-command daarvoor zou nieuw publiek oppervlak zijn. De paden
// komen bovendien uit de bestandskiezer van het OS en zijn dus al absoluut. Een lezer die zeker wil
// zijn, vergelijkt daarom met `realpath` aan BEIDE kanten (zie `docs/mcp-ontdekking.md`).
//
// Regels:
//  - POSIX: moet met `/` beginnen; dubbele `/` worden één; `.` valt weg; `..` haalt één map weg (nooit
//    boven de wortel); geen slot-`/`.
//  - Windows (`C:\…`, `C:/…`, UNC `\\server\share\…`, ook met het voorvoegsel `\\?\` of `\\?\UNC\`):
//    `/` wordt `\`; het voorvoegsel `\\?\` valt weg; de stationsletter wordt een hoofdletter; verder
//    dezelfde regels als POSIX. Hoofd- en kleine letters in de rest blijven zoals ze zijn.
//  - Alles wat niet absoluut is (leeg, relatief, `C:foo`), geeft `null` en komt niet in het register.

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

function resolveSegments(segments: string[]): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return out;
}

/** Normaliseer één pad volgens de regels hierboven; `null` als het geen absoluut pad is. */
export function normalizeOpenFilePath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let p = raw.trim();
  if (p === '' || p.includes('\0')) return null;

  // Windows-voorvoegsel voor lange paden.
  if (/^\\\\\?\\UNC\\/i.test(p)) p = `\\\\${p.slice(8)}`;
  else if (/^\\\\\?\\/.test(p)) p = p.slice(4);

  if (WINDOWS_DRIVE.test(p)) {
    const drive = p[0].toUpperCase();
    const rest = resolveSegments(p.slice(3).split(/[\\/]/));
    return `${drive}:\\${rest.join('\\')}`;
  }
  if (/^\\\\[^\\/]/.test(p)) {
    // UNC: \\server\share\pad. Server en share zijn de wortel; `..` gaat daar niet boven.
    const parts = p.slice(2).split(/[\\/]/).filter((s) => s !== '');
    if (parts.length < 2) return null;
    const [server, share, ...rest] = parts;
    const tail = resolveSegments(rest);
    return `\\\\${server}\\${share}${tail.length ? `\\${tail.join('\\')}` : ''}`;
  }
  if (p.startsWith('/')) {
    const rest = resolveSegments(p.split('/'));
    return `/${rest.join('/')}`;
  }
  return null;
}

/** Normaliseer, laat niet-absolute paden weg, ontdubbel en sorteer (vaste volgorde ⇒ geen onnodige schrijfactie). */
export function normalizeOpenFileList(paths: readonly string[]): string[] {
  const set = new Set<string>();
  for (const raw of paths) {
    const n = normalizeOpenFilePath(raw);
    if (n !== null) set.add(n);
  }
  return [...set].sort();
}

// --- Welke documenten tellen mee ------------------------------------------------------------------

/** De opslagvelden van één open document (live state van het actieve document, of de payload). */
export interface DiscoveryDocumentFields {
  filePath: string | null;
  fileHandle: unknown;
  siteFileId: string | null;
}

/**
 * De ruwe paden van de open documenten met een `FileRef` van de soort `path`. Dezelfde voorrang als
 * `saveTargetRef` in `src/services/fileAccess/index.ts`: een site-bestand of een browserhandle is
 * geen pad op schijf. Alleen in de desktop-app (`tauri`) is `filePath` een echt pad; in de browser is
 * het alleen de bestandsnaam.
 */
export function openFilePathsFromDocuments(docs: readonly DiscoveryDocumentFields[], tauri: boolean): string[] {
  if (!tauri) return [];
  const out: string[] = [];
  for (const d of docs) {
    if (d.siteFileId) continue;
    if (d.fileHandle) continue;
    if (d.filePath) out.push(d.filePath);
  }
  return out;
}

// --- Lezen (voor de plugin) -----------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPid(v: unknown): v is number {
  return Number.isSafeInteger(v) && (v as number) > 0;
}

/**
 * Lees `runtime.json`-tekst. `null` bij onleesbare JSON, een andere `formatVersion` of een veld van
 * het verkeerde type: de lezer behandelt het bestand dan als afwezig. Extra velden mogen (en worden
 * weggelaten); dat laat de app later velden toevoegen zonder versiesprong.
 */
export function parseRuntimeFile(text: string): McpRuntimeFile | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!isRecord(v) || v.formatVersion !== MCP_DISCOVERY_FORMAT_VERSION) return null;
  const { pid, port, token, appVersion, startedAt } = v;
  if (!isPid(pid)) return null;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) return null;
  if (typeof token !== 'string' || token === '') return null;
  if (typeof appVersion !== 'string' || typeof startedAt !== 'string') return null;
  return { formatVersion: 1, pid, port: port as number, token, appVersion, startedAt };
}

/** Lees `open-files.json`-tekst; zelfde regels als `parseRuntimeFile`. */
export function parseOpenFilesFile(text: string): McpOpenFilesFile | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (!isRecord(v) || v.formatVersion !== MCP_DISCOVERY_FORMAT_VERSION) return null;
  const { pid, appVersion, updatedAt, files } = v;
  if (!isPid(pid)) return null;
  if (typeof appVersion !== 'string' || typeof updatedAt !== 'string') return null;
  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string')) return null;
  return { formatVersion: 1, pid, appVersion, updatedAt, files: files as string[] };
}
