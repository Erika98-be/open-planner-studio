// Bestandstoegang van de headless MCP-server: de `McpFileFs`-naad van `planner_export_ifc` en
// `planner_import_schedule` (`src/services/mcp/tools/fileTools.ts`) op Node `fs`, opgesloten in één
// werkmap (`--root`).
//
// Twee poorten, net als in de app:
//  1. LEXICAAL — `checkScope` in fileTools: het pad wordt genormaliseerd (`..`, `.`, dubbele scheiders,
//     `~`) en moet onder `homeDir()` liggen. Hier is `homeDir()` de werkmap, dus `~/plan.ifc` is
//     `<root>/plan.ifc`.
//  2. FYSIEK — `confine()` hieronder: wat staat er echt op schijf? De app laat dat aan de Tauri-
//     capability over; die bestaat hier niet. Daarom: `realpath` van het pad (of van de dichtstbijzijnde
//     bestaande bovenmap) moet binnen de `realpath` van de werkmap liggen. Een symlink of junction naar
//     buiten, een dode link en een bestand met meer dan één harde link worden geweigerd (van een harde
//     link is niet te bewijzen dat alle namen binnen de werkmap liggen; de app schrijft zo'n bestand
//     bovendien direct, zie `replaceUserFile`).
// Elke bestandsoperatie hieronder herhaalt poort 2 vlak vóór de operatie (verdediging in de diepte).
// Dit is een controle, geen slot: een ander proces kan tussen controle en operatie een link plaatsen.
// Wie meer wil, draait de server als eigen gebruiker of in een container met alleen de werkmap.
//
// Schrijven loopt via `replaceUserFile` (`src/services/fileAccess/atomicWrite.ts`, #522): eerst een
// exclusief aangemaakt halffabricaat naast het doel, dan een atomaire `rename`.
import { constants as fsConstants, promises as fsp } from 'node:fs';
import path from 'node:path';
import type { McpFileFs } from '@/services/mcp/tools/fileTools';
import { replaceUserFile, type UserFileFs } from '@/services/fileAccess/atomicWrite';
import type { FileIdentityInfo } from '@/services/fileAccess/fileIdentity';
import { isPathOpenInApp as noAppLock, type IsPathOpenInApp } from './appLock';

/** Is `child` gelijk aan of binnen `parent`? Beide zijn absolute, door `realpath` opgeloste paden. */
export function isInside(parent: string, child: string, platform: NodeJS.Platform = process.platform): boolean {
  // Windows en macOS zijn standaard hoofdletterongevoelig: vergelijk dan zonder hoofdletters.
  const fold = platform === 'win32' || platform === 'darwin';
  const p = fold ? parent.toLowerCase() : parent;
  const c = fold ? child.toLowerCase() : child;
  if (c === p) return true;
  const rel = path.relative(p, c);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function errCode(e: unknown): string | undefined {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

/** Een eigen fouttype, zodat een scopeweigering in een bestandsoperatie herkenbaar blijft. */
export class ScopeEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeEscapeError';
  }
}

/**
 * Maak de bestandstoegang voor één werkmap. `root` moet een bestaande map zijn; de aanroeper
 * (`host.ts`) controleert dat en geeft hier de `realpath` door. `isOpenInApp` is de slot-haak
 * (`appLock.ts`): een bestand dat in de desktop-app open staat, wordt niet gelezen of geschreven.
 */
export function createNodeFileFs(root: string, isOpenInApp: IsPathOpenInApp = noAppLock): McpFileFs & { root: string } {
  const realRoot = root;

  /** Waar komt `target` echt uit? `null` = binnen de werkmap; anders de uitleg (Engels, voor de agent). */
  async function confine(target: string): Promise<string | null> {
    const native = path.resolve(target);
    // Loop omhoog tot een bestaand deel; alles daaronder bestaat (nog) niet en kan dus geen link zijn.
    let existing = native;
    const missing: string[] = [];
    for (;;) {
      try {
        // Ook een dode link bestaat voor `lstat`; `realpath` hieronder weigert hem dan.
        await fsp.lstat(existing);
        break;
      } catch (e) {
        if (errCode(e) !== 'ENOENT' && errCode(e) !== 'ENOTDIR') throw e;
        const parent = path.dirname(existing);
        if (parent === existing) break;
        missing.unshift(path.basename(existing));
        existing = parent;
      }
    }
    let real: string;
    try {
      real = await fsp.realpath(existing);
    } catch (e) {
      if (errCode(e) === 'ENOENT') {
        return `Path '${target}' contains a link that points to nothing (a dangling symbolic link). ` +
          'The server refuses it, because writing there would create a file wherever the link points.';
      }
      throw e;
    }
    const resolved = missing.length > 0 ? path.join(real, ...missing) : real;
    if (!isInside(realRoot, resolved)) {
      return `Path '${target}' leads outside the working folder '${realRoot}' (through a symbolic link, ` +
        'junction or other alias). The headless server may only read and write inside its working folder.';
    }
    if (await isOpenInApp(resolved)) {
      return `'${target}' is open in Open Planner Studio. Close it there first, or let the user work on it in ` +
        'the app; two programs writing one file lose each other\'s changes.';
    }
    if (missing.length === 0) {
      const info = await fsp.stat(real);
      if (info.isFile() && info.nlink > 1) {
        return `Path '${target}' is a file with ${info.nlink} hard links. The server cannot prove that every ` +
          'name of that file is inside its working folder, so it does not read or write it. Copy the file first.';
      }
    }
    return null;
  }

  async function guard(target: string): Promise<void> {
    const reason = await confine(target);
    if (reason) throw new ScopeEscapeError(reason);
  }

  const userFs: UserFileFs<string> = {
    lstat: async (p) => {
      const info = await fsp.lstat(p);
      return { isSymlink: info.isSymbolicLink(), nlink: info.nlink, mode: info.mode };
    },
    createNew: async (p, mode) => {
      // `wx` = O_CREAT | O_EXCL: weigert elk bestaand bestand, elke map en elke (ook dode) link.
      const handle = await fsp.open(p, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, mode ?? 0o666);
      return {
        write: async (data) => {
          await handle.writeFile(data, 'utf8');
          await handle.sync(); // de data staat op schijf vóór de rename
        },
        close: () => handle.close(),
      };
    },
    write: (p, data, mode) => fsp.writeFile(p, data, mode === undefined ? 'utf8' : { encoding: 'utf8', mode }),
    rename: (from, to) => fsp.rename(from, to),
    remove: (p) => fsp.unlink(p),
  };

  return {
    root: realRoot,
    homeDir: async () => realRoot,
    confine,
    exists: async (p) => {
      await guard(p);
      try {
        await fsp.stat(p);
        return true;
      } catch (e) {
        if (errCode(e) === 'ENOENT') return false;
        throw e;
      }
    },
    stat: async (p): Promise<FileIdentityInfo> => {
      await guard(p);
      let info;
      try {
        info = await fsp.stat(p, { bigint: true });
      } catch (e) {
        // `compareFilePaths` (fileIdentity.ts) herkent een ontbrekend doel alleen aan de foutvorm van
        // Tauri plugin-fs. Geef ENOENT in precies die vorm door, anders telt een nieuw bestand als
        // "onbekend" en weigert de export het.
        if (errCode(e) === 'ENOENT') {
          throw new Error(`failed to get metadata of path: ${p} with error: No such file or directory (os error 2)`);
        }
        throw e;
      }
      const safe = (n: bigint): number | null => (n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null);
      return { isFile: info.isFile(), dev: safe(info.dev), ino: safe(info.ino) };
    },
    readTextFile: async (p) => {
      await guard(p);
      return fsp.readFile(p, 'utf8');
    },
    readFile: async (p) => {
      await guard(p);
      return new Uint8Array(await fsp.readFile(p));
    },
    writeTextFile: async (p, content) => {
      await guard(p);
      await fsp.mkdir(path.dirname(path.resolve(p)), { recursive: true });
      await guard(p); // de nieuwe mappen kunnen geen link zijn, maar een bestaande wel vervangen zijn
      await replaceUserFile(userFs, p, content);
    },
  };
}
