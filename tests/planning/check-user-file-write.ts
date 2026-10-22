// Veilig opslaan van een GEBRUIKERSbestand (Opslaan, Opslaan als, automatisch opslaan, export) —
// headless tegen een nep-fs, want er is geen Tauri-runtime in Node.
//
// Waarom deze batterij bestaat. `saveToRefTauri` en de opslaan-als-kiezers schreven met een kale
// `writeTextFile`/`writeFile`. plugin-fs opent het doel met `truncate: true` en schrijft daarna
// (tauri-plugin-fs 2.5.0, commands.rs `write_file_inner`), dus een volle schijf, I/O-fout of crash
// midden in die write liet het projectbestand van de gebruiker leeg of afgekapt achter. De nep-fs
// hieronder doet precies dat: `write` truncate't eerst en kan daarna "vol raken".
//
// Draaien: bundel met esbuild zoals run.sh dat doet en start met node. Exit 0 = alles groen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  replaceUserFile, isForbiddenPathError, USER_FILE_TMP_SUFFIX, type UserFileFs,
} from '@/services/fileAccess/atomicWrite';
import { compareFilePaths, type FileIdentityInfo, type FileIdentityFs } from '@/services/fileAccess/fileIdentity';

declare const process: { exit(code: number): never };

const diffs: string[] = [];
let checks = 0;
const J = (v: unknown) => JSON.stringify(v);
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (J(got) !== J(want)) diffs.push(`${label}: verwacht ${J(want)}, kreeg ${J(got)}`);
};
const truthy = (label: string, cond: boolean) => { checks++; if (!cond) diffs.push(label); };

interface Entry { data: string; mode: number; link?: 'sym' | 'hard' }

/** Nep-fs met de truncate-then-write-semantiek van plugin-fs. */
function fakeFs(initial: Record<string, Entry>) {
  const files = new Map<string, Entry>(Object.entries(initial));
  const calls: string[] = [];
  const opts = {
    /** Paden waarvoor schrijven een scope-weigering geeft. */
    forbidden: new Set<string>(),
    /** Na zoveel tekens raakt de schijf vol (per write). */
    diskFullAfter: null as number | null,
    renameFails: false,
  };
  const fs: UserFileFs<string> = {
    lstat: async (p) => {
      calls.push(`lstat ${p}`);
      const e = files.get(p);
      if (!e) throw new Error(`No such file or directory: ${p}`);
      return { isSymlink: e.link === 'sym', nlink: e.link === 'hard' ? 2 : 1, mode: 0o100000 | e.mode };
    },
    write: async (p, data, mode) => {
      calls.push(`write ${p}${mode === undefined ? '' : ` mode=${mode.toString(8)}`}`);
      if (opts.forbidden.has(p)) {
        throw `forbidden path: ${p}, maybe it is not allowed on the scope for \`allow-write-text-file\` permission in your capability file`;
      }
      const prev = files.get(p);
      const entry: Entry = { data: '', mode: mode ?? prev?.mode ?? 0o644, link: prev?.link };
      files.set(p, entry); // truncate: de oude inhoud is vanaf hier weg
      if (opts.diskFullAfter !== null && data.length > opts.diskFullAfter) {
        entry.data = data.slice(0, opts.diskFullAfter);
        throw new Error('No space left on device (os error 28)');
      }
      entry.data = data;
    },
    rename: async (a, b) => {
      calls.push(`rename ${a} -> ${b}`);
      if (opts.renameFails) throw new Error('Access is denied. (os error 5)');
      const e = files.get(a);
      if (!e) throw new Error(`No such file or directory: ${a}`);
      files.set(b, { ...e, link: undefined });
      files.delete(a);
    },
    remove: async (p) => {
      calls.push(`remove ${p}`);
      if (opts.forbidden.has(p)) throw `forbidden path: ${p}`;
      files.delete(p);
    },
  };
  return { fs, files, calls, opts };
}

const P = '/home/u/project.ifc';
const TMP = P + USER_FILE_TMP_SUFFIX;
const OUD = 'OUD-PROJECT-COMPLEET';
const NIEUW = 'NIEUW-PROJECT-COMPLEET';

// 1. Normaal vervangen: via het halffabricaat, en er blijft niets naast staan.
{
  const { fs, files, calls } = fakeFs({ [P]: { data: OUD, mode: 0o600 } });
  await replaceUserFile(fs, P, NIEUW);
  eq('1a het doel heeft de nieuwe inhoud', files.get(P)?.data, NIEUW);
  eq('1b geen halffabricaat achtergebleven', [...files.keys()], [P]);
  truthy('1c het doel zelf is nooit direct beschreven', !calls.includes(`write ${P}`));
  truthy('1d het halffabricaat kreeg de rechten van het origineel (0600)', calls.includes(`write ${TMP} mode=600`));
  eq('1e en het vervangen bestand houdt die rechten', files.get(P)?.mode, 0o600);
}

// 2. De kern van de fix: de schijf raakt vol tijdens het schrijven.
{
  const { fs, files, opts } = fakeFs({ [P]: { data: OUD, mode: 0o644 } });
  opts.diskFullAfter = 5;
  const err = await replaceUserFile(fs, P, NIEUW).then(() => null, (e: unknown) => e);
  truthy('2a een volle schijf komt als fout terug', err instanceof Error && /No space left/.test(err.message));
  eq('2b het projectbestand is daarna nog het complete oude bestand', files.get(P)?.data, OUD);
  truthy('2c het halve halffabricaat is opgeruimd', !files.has(TMP));
}

// 2'. Ter vergelijking: exact wat de oude code deed (kale write op het doel) — het bestand is stuk.
{
  const { fs, files, opts } = fakeFs({ [P]: { data: OUD, mode: 0o644 } });
  opts.diskFullAfter = 5;
  await fs.write(P, NIEUW).catch(() => undefined);
  eq('2d (oude route) een kale write op het doel laat een afgekapt bestand achter', files.get(P)?.data, NIEUW.slice(0, 5));
}

// 3. Buiten de scope (map buiten $HOME, alleen het bestand zelf vrijgegeven): terugval op direct.
{
  const Q = '/mnt/netwerk/project.ifc';
  const { fs, files, opts } = fakeFs({ [Q]: { data: OUD, mode: 0o644 } });
  opts.forbidden.add(Q + USER_FILE_TMP_SUFFIX);
  await replaceUserFile(fs, Q, NIEUW);
  eq('3a zonder recht op een halffabricaat wordt er gewoon opgeslagen', files.get(Q)?.data, NIEUW);
  eq('3b en er staat niets naast', [...files.keys()], [Q]);
  truthy('3c isForbiddenPathError herkent de plugin-fs-tekst',
    isForbiddenPathError('forbidden path: /x, maybe it is not allowed on the scope')
      && isForbiddenPathError(new Error('forbidden path: /x'))
      && !isForbiddenPathError(new Error('No space left on device (os error 28)')));
}

// 4. Vervangen geweigerd (Windows: doel geopend zonder deel-toegang): terugval op direct.
{
  const { fs, files, opts } = fakeFs({ [P]: { data: OUD, mode: 0o644 } });
  opts.renameFails = true;
  await replaceUserFile(fs, P, NIEUW);
  eq('4a opslaan lukt zoals vroeger', files.get(P)?.data, NIEUW);
  truthy('4b het halffabricaat is opgeruimd', !files.has(TMP));
}

// 5. Links: nooit vervangen, want dat zou de link breken.
for (const link of ['sym', 'hard'] as const) {
  const { fs, files, calls } = fakeFs({ [P]: { data: OUD, mode: 0o644, link } });
  await replaceUserFile(fs, P, NIEUW);
  eq(`5 ${link}link: direct beschreven`, files.get(P)?.data, NIEUW);
  eq(`5 ${link}link: de link blijft een link`, files.get(P)?.link, link);
  truthy(`5 ${link}link: geen halffabricaat en geen rename`, !calls.some(c => c.startsWith('rename')) && !files.has(TMP));
}

// 6. Opslaan als naar een nieuwe naam (lstat faalt): gewoon via het halffabricaat.
{
  const N = '/home/u/nieuw.ifc';
  const { fs, files } = fakeFs({});
  await replaceUserFile(fs, N, NIEUW);
  eq('6 een nieuw bestand wordt aangemaakt', files.get(N)?.data, NIEUW);
  eq('6b zonder resten', [...files.keys()], [N]);
}

// 7. Elke Tauri-schrijfroute naar een gebruikersbestand loopt via de veilige route, niet via een
//    kale `writeTextFile(`/`writeFile(` (die faalde op de code vóór deze fix).
{
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel: string) => readFileSync(join(here, '..', '..', 'src', rel), 'utf8');
  const backend = read('services/fileAccess/tauriBackend.ts');
  truthy('7a tauriBackend: geen kale writeTextFile( of writeFile(', !/\b(writeTextFile|writeFile)\(/.test(backend));
  truthy('7b tauriBackend: Opslaan, Opslaan als en export via writeUser…Tauri',
    (backend.match(/writeUserTextFileTauri\(/g) ?? []).length >= 2 && backend.includes('writeUserBytesTauri('));
  const fileTools = read('services/mcp/tools/fileTools.ts');
  truthy('7c MCP export_ifc (overwrite) via writeUserTextFileTauri', fileTools.includes('writeUserTextFileTauri(')
    && !/\bwriteTextFile\(p,/.test(fileTools));
}

// 8. Identiteitsbewaking vóór een stille MCP-export. `stat` volgt links; de fixture beschrijft
//    daarom OS-objecten (dev+ino), niet de tekst van een pad of de bytes van een bestand.
{
  const source = '/volume/Model.ifc';
  const entries = new Map<string, FileIdentityInfo>([
    [source, { isFile: true, dev: 1, ino: 20 }],
    ['/volume/model.ifc', { isFile: true, dev: 1, ino: 21 }], // case-sensitive: ander bestand
    ['/volume/link.ifc', { isFile: true, dev: 1, ino: 20 }],
    ['/volume/maplink/Model.ifc', { isFile: true, dev: 1, ino: 20 }],
    ['/ander-volume/Model.ifc', { isFile: true, dev: 2, ino: 20 }],
  ]);
  const fs: FileIdentityFs = {
    stat: async path => {
      const entry = entries.get(path);
      if (!entry) throw `failed to get metadata of path: ${path} with error: No such file or directory (os error 2)`;
      return entry;
    },
  };
  eq('8a hetzelfde pad is hetzelfde bestand', await compareFilePaths(fs, source, source), 'same');
  eq('8b twee bestaande case-sensitive namen zijn verschillend',
    await compareFilePaths(fs, '/volume/model.ifc', source), 'different');
  for (const alias of ['/volume/link.ifc', '/volume/maplink/Model.ifc']) {
    eq(`8c ${alias} volgt de bronidentiteit`, await compareFilePaths(fs, alias, source), 'same');
  }
  entries.set('/volume/model.ifc', entries.get(source)!); // case-insensitive: hetzelfde OS-object
  eq('8d een case-alias met dezelfde identiteit is hetzelfde bestand',
    await compareFilePaths(fs, '/volume/model.ifc', source), 'same');
  eq('8e hetzelfde inode-nummer op een ander device is een ander bestand',
    await compareFilePaths(fs, '/ander-volume/Model.ifc', source), 'different');
  eq('8f een nieuw exportpad is vrij zonder metadata van een mogelijk ontoegankelijke bron',
    await compareFilePaths(fs, '/volume/nieuw.ifc', '/ontoegankelijk/bron.ifc'), 'different');
  const missingAsError: FileIdentityFs = { stat: async () => {
    throw new Error('failed to get metadata of path: /volume/nieuw.ifc with error: No such file or directory (os error 2)');
  } };
  eq('8f een Error met ENOENT wordt net als de native string als nieuw doel herkend',
    await compareFilePaths(missingAsError, '/volume/nieuw.ifc', source), 'different');

  // Ontbrekende en onbetrouwbare IDs zijn geen bewijs van verschil, ook als het andere veld verschilt.
  for (const info of [
    { isFile: true, dev: null, ino: null },
    { isFile: true, dev: 2, ino: null },
    { isFile: true, dev: null, ino: 30 },
    { isFile: true, dev: 2, ino: 0 },
    { isFile: true, dev: 2, ino: Number.MAX_SAFE_INTEGER + 1 },
    { isFile: true, dev: Number.MAX_SAFE_INTEGER + 1, ino: 30 },
    { isFile: true, dev: 2, ino: NaN },
    { isFile: true, dev: -1, ino: 30 },
    { isFile: true, dev: 2, ino: 1.5 },
    { isFile: false, dev: 2, ino: 30 },
  ]) {
    entries.set('/volume/onbekend.ifc', info);
    eq(`8g onbetrouwbare doelmetadata ${J(info)}`, await compareFilePaths(fs, '/volume/onbekend.ifc', source), 'unknown');
    eq(`8h onbetrouwbare bronmetadata ${J(info)}`, await compareFilePaths(fs, source, '/volume/onbekend.ifc'), 'unknown');
  }

  for (const error of [
    'forbidden path: /volume/model.ifc',
    new Error('failed to get metadata of path: /volume/model.ifc with error: Permission denied (os error 13)'),
    'failed to get metadata of path: /volume/model.ifc with error: Too many levels of symbolic links (os error 40)',
    'failed to get metadata of path: /volume/model.ifc with error: I/O error (os error 5)',
    'failed to get metadata of path: /volume/model.ifc with error: Unknown failure (os error 3)',
    'unknown metadata error (os error 2)', // niet de concrete plugin-fs-foutvorm
  ]) {
    const failing: FileIdentityFs = { stat: async () => { throw error; } };
    eq(`8i fout is geen bewijs van een vrij doel: ${String(error)}`,
      await compareFilePaths(failing, '/volume/model.ifc', source), 'unknown');
  }
  eq('8j een ontbrekende bron bewijst niet dat een bestaand exportdoel veilig is',
    await compareFilePaths(fs, source, '/volume/verdwenen.ifc'), 'unknown');
}

if (diffs.length === 0) {
  console.log(`OK  user-file-write: alle checks groen (${checks})`);
  process.exit(0);
} else {
  console.log(`XX  user-file-write: ${diffs.length} afwijking(en) van ${checks}`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
