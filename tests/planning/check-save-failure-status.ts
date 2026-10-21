// Een mislukte schrijfactie geeft nooit een successtatus (issue #405 deel 2, criteria 1 en 2).
//
// Wat hier vastligt, voor elke foutroute van Opslaan en Opslaan als:
//   - de fout komt als `notifications.saveFailed` (ernst `error`), met de reden in het detail;
//   - er komt geen andere melding bij (geen info over een download, geen "opgeslagen");
//   - `isDirty` blijft `true` (titelbalk `* `, statusbalk "Niet opgeslagen");
//   - het opslagdoel van het document en de recente bestanden veranderen niet;
//   - het doelbestand houdt zijn oude inhoud.
//
// Routes:
//   §1  de schrijf-en-vervang-kern (`replaceUserFile`) tegen een alleen-lezen doel (nep-fs);
//   §1R dezelfde kern tegen het ECHTE bestandssysteem (Linux/macOS; overgeslagen als root);
//   §2  Tauri via de echte store-actie: een nep-`__TAURI_INTERNALS__.invoke` speelt plugin-fs en
//       plugin-dialog na, met de fouttekst die plugin-fs echt geeft (een string, geen Error);
//   §3  web met een FileSystemFileHandle: `createWritable` gooit `NoModificationAllowedError` of
//       `NotAllowedError`;
//   §4  de site (`window.openaecHost`): Opslaan als naar een nieuw site-bestand mislukt, en Opslaan
//       naar een bestaand site-bestand mislukt.
//
// Wat hier NIET kan: de echte Tauri-desktopapp en een echte Chromium-bestandskiezer. De nep-randen
// spelen exact de aanroepen na die de app doet (`plugin:fs|…`, `showSaveFilePicker`, `createWritable`).
//
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen — alleen de exitcode telt.
import { installFakeRecoveryIndexedDb } from './fakeRecoveryIndexedDb';

type AnyRecord = Record<string, unknown>;
const g = globalThis as unknown as AnyRecord;
const win: AnyRecord = {};
win.parent = win;
g.window = win;
const downloads: string[] = [];
g.document = {
  createElement: (tag: string) => {
    if (tag !== 'a') throw new Error(`onverwacht element ${tag}`);
    const el = { href: '', download: '', click: () => { downloads.push(el.download); } };
    return el;
  },
};
(globalThis.URL as unknown as AnyRecord).createObjectURL = () => 'blob:test';
(globalThis.URL as unknown as AnyRecord).revokeObjectURL = () => undefined;
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
};
g.sessionStorage = storage;
g.localStorage = storage;
installFakeRecoveryIndexedDb();

const { replaceUserFile, USER_FILE_TMP_SUFFIX } = await import('@/services/fileAccess/atomicWrite');
type UserFileFs<D> = import('@/services/fileAccess/atomicWrite').UserFileFs<D>;
const { useAppStore } = await import('@/state/appStore');
const { resetWebWriteRefusalForTests } = await import('@/services/fileAccess/webBackend');
const { setSiteSaveAsker, resetSiteAskers } = await import('@/services/fileAccess/siteDialogs');
const nodeFs = await import('node:fs');
const nodePath = await import('node:path');
const nodeOs = await import('node:os');

declare const process: { exit(code: number): never; getuid?: () => number };

const S = () => useAppStore.getState();
const diffs: string[] = [];
let checks = 0;
const J = (v: unknown) => JSON.stringify(v);
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (J(got) !== J(want)) diffs.push(`${label}: verwacht ${J(want)}, kreeg ${J(got)}`);
};
const truthy = (label: string, cond: unknown) => {
  checks++;
  if (!cond) diffs.push(label);
};

/**
 * De vier vaste toetsen na een mislukte opslag. `run` doet de opslag; `target` leest het doelbestand.
 * `detail` moet in de foutmelding staan (de reden die de gebruiker te zien krijgt).
 */
async function eistMislukt(label: string, run: () => Promise<unknown>, opts: {
  target: () => unknown; targetBefore: unknown; detail: RegExp;
}) {
  const voor = {
    dirty: S().isDirty,
    filePath: S().filePath,
    fileHandle: S().fileHandle,
    siteFileId: S().siteFileId,
    siteFileVersion: S().siteFileVersion,
    recents: S().recentFiles.map((r) => r.id),
  };
  truthy(`${label} voorwaarde: het document is gewijzigd`, voor.dirty);
  leegMeldingen();
  downloads.length = 0;
  await run();
  const nieuw = S().ui.notifications;
  eq(`${label} (1) precies één melding, en dat is saveFailed`,
    nieuw.map((n) => [n.severity, n.messageKey]), [['error', 'notifications.saveFailed']]);
  truthy(`${label} (1b) de melding noemt de reden (kreeg ${J(nieuw[0]?.detail)})`, opts.detail.test(String(nieuw[0]?.detail ?? '')));
  eq(`${label} (2) isDirty blijft true`, S().isDirty, true);
  eq(`${label} (3) geen opgeslagen-toestand: opslagdoel en recente bestanden ongewijzigd`,
    [S().filePath, S().fileHandle === voor.fileHandle, S().siteFileId, S().siteFileVersion, S().recentFiles.map((r) => r.id)],
    [voor.filePath, true, voor.siteFileId, voor.siteFileVersion, voor.recents]);
  eq(`${label} (3b) geen download als stille terugval`, downloads, []);
  eq(`${label} (4) het doelbestand is ongewijzigd`, opts.target(), opts.targetBefore);
}

/** Begin elke toets met een lege meldingenlijst: de lijst is begrensd (MAX_NOTIFICATIONS), dus een
 *  nieuwe fout kan een oude wegduwen en "wat kwam erbij" is dan niet aan de lengte te zien. */
const leegMeldingen = () => useAppStore.setState((s) => { s.ui.notifications = []; });

const OUD = 'ISO-10303-21; OUD-PROJECT-COMPLEET END-ISO-10303-21;';

// ═══ §1 De kern: alleen-lezen doel tegen een nep-fs ════════════════════════════════════════════
// Unix: map én bestand alleen-lezen ⇒ het halffabricaat ernaast mag niet ontstaan (EACCES).
// Windows: het bestand heeft het kenmerk "alleen-lezen" ⇒ het halffabricaat lukt, de rename over het
// doel wordt geweigerd, en de terugval (direct schrijven) ook — vóór er iets afgekapt is.
interface Entry { data: string; readonly: boolean }
function fakeFs(initial: Record<string, Entry>, roDirs: string[], windows: boolean) {
  const files = new Map<string, Entry>(Object.entries(initial));
  const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
  const denied = (p: string) => (windows
    ? `failed to open file at path: ${p} with error: Access is denied. (os error 5)`
    : `failed to open file at path: ${p} with error: Permission denied (os error 13)`);
  const fs: UserFileFs<string> = {
    lstat: async (p) => {
      const e = files.get(p);
      if (!e) throw `No such file or directory (os error 2)`;
      return { isSymlink: false, nlink: 1, mode: 0o100000 | (e.readonly ? 0o444 : 0o644) };
    },
    write: async (p, data, mode) => {
      const prev = files.get(p);
      if (prev?.readonly || (!prev && roDirs.includes(dirOf(p)))) throw denied(p);
      void mode;
      files.set(p, { data, readonly: false });
    },
    rename: async (a, b) => {
      if (roDirs.includes(dirOf(b))) throw 'Permission denied (os error 13)';
      if (windows && files.get(b)?.readonly) throw 'Access is denied. (os error 5)';
      const e = files.get(a);
      if (!e) throw 'No such file or directory (os error 2)';
      files.set(b, e);
      files.delete(a);
    },
    remove: async (p) => {
      if (roDirs.includes(dirOf(p))) throw 'Permission denied (os error 13)';
      files.delete(p);
    },
  };
  return { fs, files };
}
{
  const P = '/data/ro/project.ifc';
  for (const windows of [false, true]) {
    const naam = windows ? 'Windows (alleen-lezen-kenmerk)' : 'Unix (map en bestand alleen-lezen)';
    const { fs, files } = fakeFs({ [P]: { data: OUD, readonly: true } }, windows ? [] : ['/data/ro'], windows);
    const err = await replaceUserFile(fs, P, 'NIEUW').then(() => null, (e: unknown) => e);
    truthy(`1a ${naam}: de weigering komt als fout terug`, /Permission denied|Access is denied/.test(String(err)));
    eq(`1b ${naam}: het doel heeft nog de complete oude inhoud`, files.get(P)?.data, OUD);
    eq(`1c ${naam}: geen halffabricaat achtergebleven`, files.has(P + USER_FILE_TMP_SUFFIX), false);
  }
}

// ═══ §1R Dezelfde kern tegen het echte bestandssysteem ═════════════════════════════════════════
// Root negeert bestandsrechten; dan bewijst dit deel niets en slaat het zich over (met een regel).
{
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const isWindows = nodePath.sep === '\\';
  if (isRoot || isWindows) {
    console.log(`   save-failure-status §1R overgeslagen (${isRoot ? 'root negeert bestandsrechten' : 'Windows-rechtenmodel'})`);
  } else {
    const realFs: UserFileFs<string> = {
      lstat: async (p) => {
        const st = nodeFs.lstatSync(p);
        return { isSymlink: st.isSymbolicLink(), nlink: st.nlink, mode: st.mode };
      },
      write: async (p, data, mode) => { nodeFs.writeFileSync(p, data, mode === undefined ? {} : { mode }); },
      rename: async (a, b) => { nodeFs.renameSync(a, b); },
      remove: async (p) => { nodeFs.rmSync(p, { force: true }); },
    };
    const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'ops-alleen-lezen-'));
    try {
      // 1R-a: map en bestand alleen-lezen ⇒ EACCES, doel ongewijzigd, niets ernaast.
      const dir = nodePath.join(root, 'ro');
      nodeFs.mkdirSync(dir);
      const file = nodePath.join(dir, 'project.ifc');
      nodeFs.writeFileSync(file, OUD);
      nodeFs.chmodSync(file, 0o444);
      nodeFs.chmodSync(dir, 0o555);
      const err = await replaceUserFile(realFs, file, 'NIEUW').then(() => null, (e: unknown) => e);
      truthy(`1R-a echte fs, alleen-lezen map: EACCES komt als fout terug (kreeg ${String(err)})`, /EACCES/.test(String(err)));
      eq('1R-b echte fs: het doel heeft nog de complete oude inhoud', nodeFs.readFileSync(file, 'utf8'), OUD);
      eq('1R-c echte fs: geen halffabricaat in de map', nodeFs.readdirSync(dir), ['project.ifc']);
      nodeFs.chmodSync(dir, 0o755);

      // 1R-d (meting, geen poort): alleen het BESTAND alleen-lezen, de map schrijfbaar. Op POSIX mag
      // een rename een alleen-lezen bestand vervangen; de app overschrijft het dan. Zie knownbugs.
      const file2 = nodePath.join(root, 'alleen-bestand.ifc');
      nodeFs.writeFileSync(file2, OUD);
      nodeFs.chmodSync(file2, 0o444);
      const err2 = await replaceUserFile(realFs, file2, 'NIEUW').then(() => null, (e: unknown) => e);
      const inhoud = nodeFs.readFileSync(file2, 'utf8');
      const rechten = (nodeFs.statSync(file2).mode & 0o777).toString(8);
      console.log(`   save-failure-status MEETING 1R-d alleen-lezen bestand in schrijfbare map: fout=${err2 === null ? 'geen' : String(err2)}, inhoud=${inhoud === OUD ? 'oud' : 'NIEUW (overschreven)'}, rechten na afloop=${rechten}`);
    } finally {
      nodeFs.chmodSync(root, 0o755);
      for (const p of nodeFs.readdirSync(root)) { try { nodeFs.chmodSync(nodePath.join(root, p), 0o755); } catch { /* weg */ } }
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  }
}

// ═══ §2 Tauri via de echte store-actie ═════════════════════════════════════════════════════════
// Een nep-`__TAURI_INTERNALS__` met precies de plugin-commando's die Opslaan/Opslaan als aanroepen.
// Fouten zijn strings, zoals plugin-fs ze echt teruggeeft (`Error` serialiseert naar zijn tekst).
const tauri = {
  files: new Map<string, Entry>(),
  roDirs: [] as string[],
  windows: false,
  dialogAnswer: null as string | null,
  calls: [] as string[],
};
const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
const deniedText = (p: string) => (tauri.windows
  ? `failed to open file at path: ${p} with error: Access is denied. (os error 5)`
  : `failed to open file at path: ${p} with error: Permission denied (os error 13)`);
function installTauri() {
  win.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: AnyRecord, options?: { headers?: Record<string, string> }) => {
      tauri.calls.push(cmd);
      switch (cmd) {
        case 'plugin:dialog|save': return tauri.dialogAnswer;
        case 'plugin:fs|lstat': {
          const e = tauri.files.get(String(args.path));
          if (!e) throw 'No such file or directory (os error 2)';
          return {
            isFile: true, isDirectory: false, isSymlink: false, size: e.data.length, mtime: null, atime: null,
            birthtime: null, readonly: e.readonly, fileAttributes: null, dev: 1, ino: 1,
            mode: 0o100000 | (e.readonly ? 0o444 : 0o644), nlink: 1, uid: 1000, gid: 1000, rdev: 0, blksize: 4096, blocks: 1,
          };
        }
        case 'plugin:fs|write_text_file': {
          const p = decodeURIComponent(options?.headers?.path ?? '');
          const prev = tauri.files.get(p);
          if (prev?.readonly || (!prev && tauri.roDirs.includes(dirOf(p)))) throw deniedText(p);
          tauri.files.set(p, { data: new TextDecoder().decode(args as unknown as Uint8Array), readonly: false });
          return null;
        }
        case 'plugin:fs|rename': {
          const a = String(args.oldPath);
          const b = String(args.newPath);
          if (tauri.roDirs.includes(dirOf(b))) throw 'Permission denied (os error 13)';
          if (tauri.windows && tauri.files.get(b)?.readonly) throw 'Access is denied. (os error 5)';
          const e = tauri.files.get(a);
          if (!e) throw 'No such file or directory (os error 2)';
          tauri.files.set(b, e);
          tauri.files.delete(a);
          return null;
        }
        case 'plugin:fs|remove': {
          const p = String(args.path);
          if (tauri.roDirs.includes(dirOf(p))) throw 'Permission denied (os error 13)';
          tauri.files.delete(p);
          return null;
        }
        default: throw new Error(`onverwacht Tauri-commando in deze check: ${cmd}`);
      }
    },
    transformCallback: () => 0,
  };
}
const uninstallTauri = () => { delete win.__TAURI_INTERNALS__; };

{
  installTauri();
  const RO = '/home/u/alleen-lezen/project.ifc';
  const RW = '/home/u/werk/project.ifc';

  // 2-controle: een schrijfbaar doel slaagt via dezelfde nep-route (anders bewijzen de rode routes niets).
  tauri.files.set(RW, { data: OUD, readonly: false });
  S().newProject();
  S().setProject({ name: 'Tauri-proef', startDate: '2026-06-01' });
  S().addTask({ name: 'Fundering' });
  useAppStore.setState({ filePath: RW });
  await S().saveFile();
  eq('2-controle schrijfbaar doel: opgeslagen (isDirty false)', S().isDirty, false);
  truthy('2-controle het bestand heeft de nieuwe IFC-inhoud', tauri.files.get(RW)!.data.includes('Fundering'));
  eq('2-controle geen saveFailed', S().ui.notifications.filter((n) => n.messageKey === 'notifications.saveFailed').length, 0);
  truthy('2-controle de route liep via plugin-fs (halffabricaat + rename)',
    tauri.calls.includes('plugin:fs|write_text_file') && tauri.calls.includes('plugin:fs|rename'));

  for (const windows of [false, true]) {
    const naam = windows ? 'Windows-kenmerk' : 'Unix-rechten';
    tauri.windows = windows;
    tauri.roDirs = windows ? [] : ['/home/u/alleen-lezen'];
    tauri.files.set(RO, { data: OUD, readonly: true });

    // 2a Opslaan (Ctrl+S) naar een bestaand, alleen-lezen projectbestand.
    S().newDocument();
    S().setProject({ name: `Alleen-lezen ${naam}`, startDate: '2026-06-01' });
    S().addTask({ name: 'Wijziging' });
    useAppStore.setState({ filePath: RO });
    await eistMislukt(`2a Tauri Opslaan, ${naam}`, () => S().saveFile(), {
      target: () => tauri.files.get(RO)?.data, targetBefore: OUD, detail: /Permission denied|Access is denied/,
    });
    eq(`2a Tauri Opslaan, ${naam}: geen halffabricaat`, tauri.files.has(RO + USER_FILE_TMP_SUFFIX), false);

    // 2b Opslaan als: de gebruiker kiest in de dialoog het alleen-lezen bestand.
    S().newDocument();
    S().addTask({ name: 'Nieuw document' });
    tauri.dialogAnswer = RO;
    await eistMislukt(`2b Tauri Opslaan als, ${naam}`, () => S().saveFileAs(), {
      target: () => tauri.files.get(RO)?.data, targetBefore: OUD, detail: /Permission denied|Access is denied/,
    });

    // 2c De sluitvraag ("Opslaan" in CloseDocumentDialog en bij afsluiten) krijgt `false` terug: dan
    // breekt het sluiten af en blijft het document open.
    useAppStore.setState({ filePath: RO });
    const ok = await S().saveFileForDocument(S().activeDocumentId);
    eq(`2c Tauri sluitvraag-opslaan, ${naam}: meldt false (sluiten breekt af)`, [ok, S().isDirty], [false, true]);
  }
  uninstallTauri();
  tauri.windows = false;
}

// ═══ §3 Web met een bestandshandle ═════════════════════════════════════════════════════════════
type HandleState = { data: string; writeError: () => DOMException };
const makeHandle = (state: HandleState): FileSystemFileHandle => ({
  kind: 'file',
  name: 'project.ifc',
  isSameEntry: () => Promise.resolve(false),
  getFile: () => Promise.resolve(new File([state.data], 'project.ifc')),
  queryPermission: () => Promise.resolve('granted'),
  requestPermission: () => Promise.resolve('granted'),
  createWritable: () => Promise.reject(state.writeError()),
} as unknown as FileSystemFileHandle);
let pickerCalls = 0;
const installPicker = (answer: () => Promise<FileSystemFileHandle>) => {
  pickerCalls = 0;
  win.showOpenFilePicker = () => Promise.resolve([]);
  win.showSaveFilePicker = () => { pickerCalls++; return answer(); };
};
const vergrendeld = () => new DOMException('The object can not be modified in this way.', 'NoModificationAllowedError');
const geweigerd = () => new DOMException(
  "Failed to execute 'createWritable' on 'FileSystemFileHandle': The request is not allowed by the user agent or the platform in the current context.",
  'NotAllowedError',
);
{
  // 3a Opslaan naar een handle van een vergrendeld/alleen-lezen bestand. In-place schrijven mislukt;
  // de app biedt dan de bestandskiezer aan. Kiest de gebruiker hetzelfde bestand: saveFailed.
  resetWebWriteRefusalForTests();
  const ro: HandleState = { data: OUD, writeError: vergrendeld };
  const handle = makeHandle(ro);
  installPicker(() => Promise.resolve(handle));
  S().newDocument();
  S().addTask({ name: 'Web-wijziging' });
  useAppStore.setState({ filePath: 'project.ifc', fileHandle: handle });
  await eistMislukt('3a web Opslaan, NoModificationAllowedError', () => S().saveFile(), {
    target: () => ro.data, targetBefore: OUD, detail: /can not be modified/,
  });
  eq('3a de app bood na de mislukte in-place-schrijfactie de bestandskiezer aan', pickerCalls, 1);

  // 3b Zelfde, maar de gebruiker annuleert de kiezer: niets opgeslagen, geen melding, nog gewijzigd.
  installPicker(() => Promise.reject(new DOMException('The user aborted a request.', 'AbortError')));
  leegMeldingen();
  await S().saveFile();
  eq('3b annuleren na een mislukte schrijfactie: geen melding en geen successtatus',
    [S().ui.notifications.length, S().isDirty, S().fileHandle === handle], [0, true, true]);

  // 3c Opslaan als: de kiezer geeft een alleen-lezen bestand terug.
  installPicker(() => Promise.resolve(makeHandle(ro)));
  S().newDocument();
  S().addTask({ name: 'Web opslaan als' });
  await eistMislukt('3c web Opslaan als, NoModificationAllowedError', () => S().saveFileAs(), {
    target: () => ro.data, targetBefore: OUD, detail: /can not be modified/,
  });

  // 3d NotAllowedError: de app behandelt dit BEWUST als weigering door de omgeving (embedded webview
  // zonder schrijfrecht; check-web-save-fallback §1 en §7) en levert het project als download, met
  // een uitleg. Dat is geen stille successtatus: het bestand op de oude plek blijft ongewijzigd, de
  // download bevat het project en de melding zegt waar het bestand staat.
  resetWebWriteRefusalForTests();
  const na: HandleState = { data: OUD, writeError: geweigerd };
  const handleNa = makeHandle(na);
  installPicker(() => Promise.resolve(handleNa));
  S().newDocument();
  S().setProject({ name: 'Web geweigerd', startDate: '2026-06-01' });
  S().addTask({ name: 'X' });
  useAppStore.setState({ filePath: 'project.ifc', fileHandle: handleNa });
  downloads.length = 0;
  leegMeldingen();
  await S().saveFile();
  const added3d = S().ui.notifications;
  eq('3d NotAllowedError: geen saveFailed, wel één uitleg (info)', added3d.map((n) => n.severity), ['info']);
  eq('3d de download is gebeurd', downloads.length, 1);
  eq('3d het bestand achter de handle is ongewijzigd', na.data, OUD);
  eq('3d de handle is daarna geen opslagdoel meer (volgende Ctrl+S schrijft niet stil naar de oude plek)', S().fileHandle, null);
  resetWebWriteRefusalForTests();
  delete win.showSaveFilePicker;
  delete win.showOpenFilePicker;
}

// ═══ §4 De site ════════════════════════════════════════════════════════════════════════════════
{
  const versions = new Map<string, string[]>([['p1', [OUD]]]);
  let saveCalls = 0;
  const failing = {
    list: async () => [],
    open: async () => { throw { code: 'other', message: 'niet gebruikt' }; },
    save: async () => { saveCalls++; throw { code: 'other', message: 'Geen schrijfrecht op deze map van de site' }; },
    versions: async (id: string) => (versions.get(id) ?? []).map((_, i) => ({ version: `v${i + 1}` })),
  };
  win.openaecHost = { storage: failing };

  // 4a Opslaan als → "Opslaan op de site" → de site weigert.
  resetSiteAskers();
  setSiteSaveAsker(async () => ({ kind: 'site', name: 'Nieuw.ifc' }));
  S().newDocument();
  S().addTask({ name: 'Site' });
  await eistMislukt('4a site Opslaan als, de site weigert', () => S().saveFileAs(), {
    target: () => [...versions.keys()], targetBefore: ['p1'], detail: /Geen schrijfrecht/,
  });
  eq('4a de site kreeg één opslagpoging', saveCalls, 1);

  // 4b Opslaan naar een bestaand site-bestand → de site weigert (aanvulling op check-site-storage G4).
  useAppStore.setState({ filePath: 'Project.ifc', siteFileId: 'p1', siteFileVersion: 'v1' });
  await eistMislukt('4b site Opslaan, de site weigert', () => S().saveFile(), {
    target: () => versions.get('p1'), targetBefore: [OUD], detail: /Geen schrijfrecht/,
  });
  resetSiteAskers();
  delete win.openaecHost;
}

if (diffs.length === 0) {
  console.log(`OK  save-failure-status: alle checks groen (${checks})`);
  process.exit(0);
} else {
  console.log(`XX  save-failure-status: ${diffs.length} afwijking(en) van ${checks}`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
