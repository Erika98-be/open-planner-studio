// Opslag via de site (issue #309) — headless checks op de hele keten zonder browser.
//
// Wat hier vastligt:
//   A. Het hostcontract: `getSiteStorage()` vindt een geldige host op het eigen venster en op een
//      same-origin parent, valt stil terug bij een cross-origin parent (die gooit bij lezen), weigert
//      een host zonder vier functies, en ziet in Tauri nooit een site. Plus `siteInitialFileId`.
//   B. De dispatch in `fileAccess/index.ts`: een site-ref gaat naar de site-backend (opslaan, lezen
//      als tekst en bytes, precheck), ook zonder host (dan `false`/`null`), en een handle-ref blijft
//      bij de webbackend.
//   C. `baseVersion`: de laatst gelezen of geschreven versie gaat mee; een oudere versie openen raakt
//      die basis niet; een conflict van de site komt met `code === 'conflict'` door.
//   D. Recente bestanden: site-refs dedupliceren op id (ook over versies heen).
//   E. `saveTargetRef`: alle combinaties van filePath/fileHandle/siteFileId, Tauri en web.
//   F. Crashherstel: manifestronde met en zonder `siteFileId` (web-IndexedDB en het Tauri-plan),
//      een oud manifest zonder veld, de recoverydelta, en `restoreDocuments` zet het doel terug.
//   G. De opslaanroute in de store: Ctrl+S met site-doel (geen vraag), conflict (eigen melding,
//      document blijft gewijzigd), nieuw document naar de site, "Op deze pc…", openen van de
//      nieuwste en van een oudere versie, kopie zonder doel — en ZONDER host geen enkele site-vraag.
//
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen — alleen de exitcode telt.

// ── Omgeving: window, document, IndexedDB en sessionStorage ──────────────────────────────────────
// Eerst de globals, dan pas de app-modules (die lezen sommige globals bij het laden).
type AnyRecord = Record<string, unknown>;
const g = globalThis as unknown as AnyRecord;
const win: AnyRecord = {};
win.parent = win; // geen iframe
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

const session = new Map<string, string>();
g.sessionStorage = {
  getItem: (k: string) => session.get(k) ?? null,
  setItem: (k: string, v: string) => { session.set(k, v); },
  removeItem: (k: string) => { session.delete(k); },
};
g.localStorage = {
  getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
};

/** Kleine IndexedDB-dubbel: per database een eigen Map, één object-store met keyPath `id`. */
const databases = new Map<string, Map<string, unknown>>();
function fakeDb(name: string) {
  if (!databases.has(name)) databases.set(name, new Map());
  const records = databases.get(name)!;
  return {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    close: () => undefined,
    onversionchange: null as (() => void) | null,
    transaction: () => {
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        objectStore: () => ({
          getAll: () => {
            const request = { result: [] as unknown[], error: null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
            queueMicrotask(() => { request.result = [...records.values()].map((r) => structuredClone(r)); request.onsuccess?.(); });
            return request;
          },
          put: (value: { id: string }) => { records.set(value.id, structuredClone(value)); queueMicrotask(() => tx.oncomplete?.()); },
          delete: (id: string) => { records.delete(id); queueMicrotask(() => tx.oncomplete?.()); },
        }),
      };
      return tx;
    },
  };
}
g.indexedDB = {
  open: (name: string) => {
    const request = { result: fakeDb(name), error: null, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
    return request;
  },
};

// ── Imports (na de globals) ────────────────────────────────────────────────────────────────────
const {
  getSiteStorage, isSiteStorage, siteInitialFileId, isSiteConflict, siteStorageAvailable,
} = await import('@/services/fileAccess/siteHost');
const {
  saveToRef, saveToRefWithoutPrompt, canWriteToRefWithoutPrompt, readFromRef, readBytesFromRef, saveTargetRef,
  supportsRecentFiles,
} = await import('@/services/fileAccess');
const {
  knownSiteVersion, resetSiteVersionsForTests, openSiteFile, saveNewSiteFile, rememberSiteVersion, siteDataToText,
  listSiteFiles,
} = await import('@/services/fileAccess/siteBackend');
const { addRecent, loadRecents, sameRef } = await import('@/services/fileAccess/recentFiles');
const {
  saveRecovery, loadRecovery, clearRecovery, fullRecoverySave, planTauriV3RecoverySave, parseRecoveryManifest, recoverySiteMeta,
} = await import('@/services/recovery/recoveryStore');
const { planRecoveryDelta, persistedRecoveryState } = await import('@/services/recovery/recoveryDelta');
const { recoveryNames } = await import('@/hooks/recoveryPaths');
const { setSiteOpenAsker, setSiteSaveAsker, resetSiteAskers } = await import('@/services/fileAccess/siteDialogs');
const { useAppStore } = await import('@/state/appStore');
const { isActivePristine, siteSaveDefaultName, siteVersionCopyName } = await import('@/state/slices/fileSlice');
const { writeIFC } = await import('@/services/ifc/ifcWriter');
const { buildWriteIFCInput } = await import('@/state/ifcSaveInput');
const { readIFC } = await import('@/services/ifc/ifcReader');
const { recoveryInputFromParsed } = await import('@/state/documentContract');
type FileRef = import('@/services/fileAccess').FileRef;
type SiteStorage = import('@/services/fileAccess/siteHost').SiteStorage;
type SiteFileInfo = import('@/services/fileAccess/siteHost').SiteFileInfo;

const diffs: string[] = [];
let checks = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
};
const truthy = (label: string, cond: unknown) => {
  checks++;
  if (!cond) diffs.push(label);
};
const S = () => useAppStore.getState();

// ── Een in-memory site die elke aanroep telt ───────────────────────────────────────────────────
interface Call { fn: string; args: unknown[] }
interface MemFile { id: string; name: string; versions: { version: string; data: string }[] }
function memorySite(opts: { conflict?: boolean; fail?: string } = {}) {
  const calls: Call[] = [];
  const files = new Map<string, MemFile>();
  let seq = 0;
  const latest = (f: MemFile) => f.versions[f.versions.length - 1];
  const info = (f: MemFile, v = latest(f)): SiteFileInfo => ({ id: f.id, name: f.name, version: v.version });
  const storage: SiteStorage = {
    list: async (query) => { calls.push({ fn: 'list', args: [query] }); return [...files.values()].map((f) => info(f)); },
    open: async (id, version) => {
      calls.push({ fn: 'open', args: [id, version] });
      const f = files.get(id);
      if (!f) throw new Error(`geen bestand ${id}`);
      const v = version === undefined ? latest(f) : f.versions.find((x) => x.version === version)!;
      return { file: info(f, v), data: new TextEncoder().encode(v.data) };
    },
    save: async (request) => {
      const text = await request.data.text();
      calls.push({ fn: 'save', args: [{ id: request.id, name: request.name, baseVersion: request.baseVersion, type: request.data.type }] });
      if (opts.fail) throw { code: 'other', message: opts.fail };
      if (request.id === undefined) {
        const f: MemFile = { id: `id-${++seq}`, name: request.name, versions: [{ version: 'v1', data: text }] };
        files.set(f.id, f);
        return info(f);
      }
      const f = files.get(request.id)!;
      if (opts.conflict || (request.baseVersion !== undefined && request.baseVersion !== latest(f).version)) {
        throw Object.assign(new Error('Iemand anders was eerder.'), { code: 'conflict' });
      }
      f.versions.push({ version: `v${f.versions.length + 1}`, data: text });
      return info(f);
    },
    versions: async (id) => { calls.push({ fn: 'versions', args: [id] }); return [...files.get(id)!.versions].reverse().map((v) => ({ version: v.version })); },
  };
  const put = (id: string, name: string, versions: string[]) => {
    files.set(id, { id, name, versions: versions.map((data, i) => ({ version: `v${i + 1}`, data })) });
  };
  return { storage, calls, files, put, latest };
}
const setHost = (host: unknown) => { win.openaecHost = host; };
const clearHost = () => { delete win.openaecHost; win.parent = win; delete win.__TAURI_INTERNALS__; };

// ═══ A. Hostcontract ═══════════════════════════════════════════════════════════════════════════
{
  clearHost();
  eq('A1 geen host ⇒ geen opslag', getSiteStorage(), null);
  eq('A1 geen host ⇒ niet beschikbaar', siteStorageAvailable(), false);
  const site = memorySite();
  setHost({ storage: site.storage });
  truthy('A2 eigen window.openaecHost ⇒ opslag gevonden', getSiteStorage() === site.storage);
  setHost({ storage: { list: () => 0, open: () => 0, save: () => 0 } });
  eq('A3 host met drie functies ⇒ ongeldig', getSiteStorage(), null);
  eq('A3 isSiteStorage(null)', isSiteStorage(null), false);
  setHost('geen object');
  eq('A4 host is geen object ⇒ geen opslag', getSiteStorage(), null);
  clearHost();

  // Same-origin parent.
  const parentSite = memorySite();
  win.parent = { openaecHost: { storage: parentSite.storage, initialFileId: 'start-1' } };
  truthy('A5 same-origin parent ⇒ opslag van de parent', getSiteStorage() === parentSite.storage);
  eq('A5 initialFileId van de parent', siteInitialFileId(), 'start-1');
  // Eigen venster gaat vóór de parent.
  const ownSite = memorySite();
  setHost({ storage: ownSite.storage });
  truthy('A6 eigen venster gaat vóór de parent', getSiteStorage() === ownSite.storage);
  eq('A6 initialFileId volgt de gekozen host (eigen, zonder id)', siteInitialFileId(), null);
  clearHost();

  // Cross-origin parent: lezen gooit.
  const crossOrigin: AnyRecord = {};
  Object.defineProperty(crossOrigin, 'openaecHost', { get() { throw new Error('SecurityError: cross-origin'); } });
  win.parent = crossOrigin;
  let threw = false;
  try { eq('A7 cross-origin parent ⇒ geen opslag, geen fout', getSiteStorage(), null); } catch { threw = true; }
  eq('A7 cross-origin gooit niet door', threw, false);
  eq('A7 cross-origin initialFileId ⇒ null', siteInitialFileId(), null);
  clearHost();

  // Tauri: nooit een site.
  setHost({ storage: memorySite().storage, initialFileId: 'x' });
  win.__TAURI_INTERNALS__ = {};
  eq('A8 Tauri ⇒ nooit site-opslag', getSiteStorage(), null);
  eq('A8 Tauri ⇒ geen startbestand', siteInitialFileId(), null);
  clearHost();

  // Host zonder geldige opslag levert ook geen startbestand.
  setHost({ initialFileId: 'x' });
  eq('A9 startbestand zonder opslag ⇒ null', siteInitialFileId(), null);
  setHost({ storage: memorySite().storage, initialFileId: '' });
  eq('A9 lege initialFileId ⇒ null', siteInitialFileId(), null);
  clearHost();

  eq('A10 isSiteConflict op code', isSiteConflict({ code: 'conflict' }), true);
  eq('A10 andere code is geen conflict', isSiteConflict({ code: 'other' }), false);
  eq('A10 een gewone Error is geen conflict', isSiteConflict(new Error('x')), false);
}

// ═══ B. Dispatch in fileAccess/index.ts ════════════════════════════════════════════════════════
{
  resetSiteVersionsForTests();
  clearHost();
  const ref: FileRef = { kind: 'site', id: 'f1' };
  eq('B1 zonder host: saveToRef(site) ⇒ false', await saveToRef(ref, 'x'), false);
  eq('B1 zonder host: canWrite(site) ⇒ false', await canWriteToRefWithoutPrompt(ref), false);
  eq('B1 zonder host: readFromRef(site) ⇒ null', await readFromRef(ref), null);
  eq('B1 zonder host: readBytesFromRef(site) ⇒ null', await readBytesFromRef(ref), null);
  eq('B1 zonder host: supportsRecentFiles = supportsHandles (web zonder FSA)', supportsRecentFiles(), false);

  const site = memorySite();
  site.put('f1', 'Plan.ifc', ['﻿een', 'twee']);
  setHost({ storage: site.storage });
  eq('B2 met host: supportsRecentFiles', supportsRecentFiles(), true);
  eq('B2 canWrite(site)', await canWriteToRefWithoutPrompt(ref), true);
  eq('B3 readFromRef(site) leest de nieuwste versie als tekst', await readFromRef(ref), 'twee');
  eq('B3 leest via open(id) zonder versie', site.calls.at(-1), { fn: 'open', args: ['f1', undefined] });
  eq('B4 readBytesFromRef(site) ⇒ bytes', [...(await readBytesFromRef(ref))!], [...new TextEncoder().encode('twee')]);
  eq('B5 saveToRef(site) ⇒ true', await saveToRef(ref, 'drie', 'Plan.ifc'), true);
  eq('B5 save met id, naam, baseVersion en IFC-mime', site.calls.at(-1), {
    fn: 'save', args: [{ id: 'f1', name: 'Plan.ifc', baseVersion: 'v2', type: 'application/x-step' }],
  });
  eq('B6 saveToRefWithoutPrompt(site) ⇒ true', await saveToRefWithoutPrompt(ref, 'vier'), true);
  eq('B6 zonder naam: de laatste naam van de site gaat mee', (site.calls.at(-1)!.args[0] as AnyRecord).name, 'Plan.ifc');
  // Een handle-ref blijft bij de webbackend (die leest via getFile).
  const handle = {
    kind: 'file', name: 'h.ifc', isSameEntry: async () => false,
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFile: async () => ({ text: async () => 'handle-inhoud', arrayBuffer: async () => new ArrayBuffer(0) }),
  } as unknown as FileSystemFileHandle;
  const before = site.calls.length;
  eq('B7 handle-ref ⇒ webbackend', await readFromRef({ kind: 'handle', handle }), 'handle-inhoud');
  eq('B7 handle-ref raakt de site niet', site.calls.length, before);
  // UTF-8-BOM valt weg zoals bij File.text().
  eq('B8 BOM valt weg bij tekst', await siteDataToText(new TextEncoder().encode('﻿abc')), 'abc');
  clearHost();
}

// ═══ C. baseVersion ════════════════════════════════════════════════════════════════════════════
{
  resetSiteVersionsForTests();
  const site = memorySite();
  site.put('f2', 'B.ifc', ['1', '2', '3']);
  setHost({ storage: site.storage });
  const opened = await openSiteFile('f2');
  eq('C1 nieuwste openen ⇒ site-ref', opened.ref, { kind: 'site', id: 'f2' });
  eq('C1 basis = gelezen versie', knownSiteVersion('f2'), 'v3');
  const older = await openSiteFile('f2', { version: 'v1' });
  eq('C2 oudere versie ⇒ geen ref', older.ref, null);
  eq('C2 oudere versie ⇒ inhoud van v1', older.content, '1');
  eq('C2 oudere versie raakt de basis niet', knownSiteVersion('f2'), 'v3');
  await saveToRef({ kind: 'site', id: 'f2' }, '4', 'B.ifc');
  eq('C3 na opslaan: basis = geschreven versie', knownSiteVersion('f2'), 'v4');
  await saveToRef({ kind: 'site', id: 'f2' }, '5', 'B.ifc');
  eq('C3 volgende opslag stuurt v4 mee', (site.calls.at(-1)!.args[0] as AnyRecord).baseVersion, 'v4');
  // Iemand anders slaat op: onze basis loopt achter ⇒ conflict, en de basis blijft staan.
  site.files.get('f2')!.versions.push({ version: 'v6', data: 'ander' });
  let err: unknown = null;
  try { await saveToRef({ kind: 'site', id: 'f2' }, '6', 'B.ifc'); } catch (e) { err = e; }
  eq('C4 conflict gooit door met code', isSiteConflict(err), true);
  eq('C4 basis blijft v5 na een conflict', knownSiteVersion('f2'), 'v5');
  // De site filtert niet: de tool toont alleen wat hij kan openen (extensie van de naam).
  site.put('pdf', 'Tekening.PDF', ['x']);
  site.put('xer', 'Bron.XER', ['x']);
  eq('C4b lijst gefilterd op extensie (hoofdletterongevoelig)', (await listSiteFiles(['ifc', 'xer'])).map((f) => f.id), ['f2', 'xer']);
  eq('C4b lijst vraagt de extensies aan de site', site.calls.at(-1), { fn: 'list', args: [{ extensions: ['ifc', 'xer'] }] });
  const created = await saveNewSiteFile('Nieuw.ifc', 'inhoud');
  eq('C5 nieuw bestand: save zonder id en zonder baseVersion', site.calls.at(-1), {
    fn: 'save', args: [{ id: undefined, name: 'Nieuw.ifc', baseVersion: undefined, type: 'application/x-step' }],
  });
  eq('C5 nieuw bestand: basis = v1', knownSiteVersion(created.id), 'v1');
  rememberSiteVersion('x', 'r1');
  rememberSiteVersion('x', 'r0', { onlyIfUnknown: true });
  eq('C6 onlyIfUnknown overschrijft niet', knownSiteVersion('x'), 'r1');
  rememberSiteVersion('x', undefined);
  eq('C6 undefined wist de basis', knownSiteVersion('x'), undefined);
  clearHost();
}

// ═══ D. Recente bestanden ══════════════════════════════════════════════════════════════════════
{
  eq('D1 sameRef op id', await sameRef({ kind: 'site', id: 'a' }, { kind: 'site', id: 'a' }), true);
  eq('D1 ander id ⇒ anders', await sameRef({ kind: 'site', id: 'a' }, { kind: 'site', id: 'b' }), false);
  eq('D1 site vs pad ⇒ anders', await sameRef({ kind: 'site', id: 'a' }, { kind: 'path', path: 'a' }), false);
  await addRecent({ kind: 'site', id: 'r1' }, 'Eén.ifc');
  await addRecent({ kind: 'path', path: '/tmp/x.ifc' }, 'x.ifc');
  await addRecent({ kind: 'site', id: 'r1' }, 'Eén (hernoemd).ifc');
  const list = await loadRecents();
  // Alleen de dedupe telt hier; de volgorde hangt van `addedAt` (Date.now) af en is binnen één
  // milliseconde niet vast.
  eq('D2 één entry per site-bestand, met de nieuwste naam', list.filter((e) => e.ref.kind === 'site').map((e) => e.name), ['Eén (hernoemd).ifc']);
  eq('D2 de pad-entry blijft staan', list.filter((e) => e.ref.kind === 'path').map((e) => e.name), ['x.ifc']);
}

// ═══ E. saveTargetRef ══════════════════════════════════════════════════════════════════════════
{
  const handle = { kind: 'file', name: 'h.ifc' } as unknown as FileSystemFileHandle;
  const none = { filePath: null, fileHandle: null, siteFileId: null };
  eq('E1 niets ⇒ null (web)', saveTargetRef(none, false), null);
  eq('E1 niets ⇒ null (Tauri)', saveTargetRef(none, true), null);
  eq('E2 alleen naam (web) ⇒ geen doel', saveTargetRef({ ...none, filePath: 'a.ifc' }, false), null);
  eq('E2 pad (Tauri) ⇒ pad', saveTargetRef({ ...none, filePath: '/p/a.ifc' }, true), { kind: 'path', path: '/p/a.ifc' });
  truthy('E3 handle ⇒ handle (web)', saveTargetRef({ ...none, filePath: 'a.ifc', fileHandle: handle }, false)?.kind === 'handle');
  truthy('E3 handle ⇒ handle (Tauri, gaat vóór pad)', saveTargetRef({ ...none, filePath: '/p', fileHandle: handle }, true)?.kind === 'handle');
  eq('E4 site ⇒ site (web)', saveTargetRef({ ...none, filePath: 'a.ifc', siteFileId: 's1' }, false), { kind: 'site', id: 's1' });
  eq('E4 site gaat vóór handle en pad', saveTargetRef({ filePath: '/p', fileHandle: handle, siteFileId: 's1' }, true), { kind: 'site', id: 's1' });
  eq('E5 lege siteFileId telt niet', saveTargetRef({ ...none, siteFileId: '' }, false), null);
}

// ═══ F. Crashherstel ═══════════════════════════════════════════════════════════════════════════
{
  const doc = (id: string, site?: { id: string; version?: string }) => ({
    id, ifc: `ISO-10303-21; /* ${id} */`, filePath: `${id}.ifc`, isDirty: true, datesAsRecorded: false,
    ...(site ? { siteFileId: site.id, ...(site.version ? { siteFileVersion: site.version } : {}) } : {}),
  });
  await saveRecovery(fullRecoverySave('A', [doc('A', { id: 'site-a', version: 'v7' }), doc('B')]));
  const loaded = await loadRecovery();
  const byId = new Map(loaded.docs.map((d) => [d.id, d]));
  eq('F1 web: siteFileId komt terug', byId.get('A')?.siteFileId, 'site-a');
  eq('F1 web: siteFileVersion komt terug', byId.get('A')?.siteFileVersion, 'v7');
  eq('F1 web: zonder site geen veld', 'siteFileId' in (byId.get('B') ?? {}), false);
  // Het manifestrecord zelf: zonder site is de regel gelijk aan vóór #309.
  const manifestRecord = [...databases.get('ops-recovery')?.values() ?? databases.values().next().value!.values()]
    .find((r) => (r as AnyRecord).kind === 'manifest') as { version: number; documents: AnyRecord[] } | undefined;
  eq('F2 manifestversie 5', manifestRecord?.version, 5);
  eq('F2 manifestregel zonder site heeft geen site-velden',
    Object.keys(manifestRecord?.documents.find((d) => d.id === 'B') ?? {}).sort(),
    ['datesAsRecorded', 'filePath', 'id', 'ifc', 'isDirty']);
  await clearRecovery();

  // Tauri-plan + een oud manifest zonder veld.
  const names = recoveryNames('recovery.test');
  const plan = planTauriV3RecoverySave(null, fullRecoverySave('A', [doc('A', { id: 'site-a' }), doc('B')]), 'g1', names);
  eq('F3 Tauri-plan: site-doel in de manifestregel', plan.documents.map((d) => d.siteFileId ?? null), ['site-a', null]);
  const old = parseRecoveryManifest(JSON.stringify({
    version: 4, activeDocumentId: 'A', documents: [{ id: 'A', ifc: 'x', filePath: null, isDirty: true, datesAsRecorded: false }],
  }));
  eq('F4 oud manifest (v4) leest zonder site-doel', recoverySiteMeta(old?.documents[0]), { siteFileId: null, siteFileVersion: null });
  eq('F4 vreemde waarden tellen niet', recoverySiteMeta({ siteFileId: 12, siteFileVersion: 'v1' }), { siteFileId: null, siteFileVersion: null });
  eq('F4 versie zonder id telt niet', recoverySiteMeta({ siteFileVersion: 'v1' }), { siteFileId: null, siteFileVersion: null });

  // Recoverydelta: een nieuwe site-versie (na opslaan) is een manifest-only wijziging.
  const source = {} as never;
  const metaA = { id: 'A', filePath: 'A.ifc', isDirty: false, datesAsRecorded: false, siteFileId: 'site-a', siteFileVersion: 'v1', source };
  const persisted = persistedRecoveryState('A', [metaA]);
  const same = planRecoveryDelta('A', [metaA], persisted);
  eq('F5 zelfde site-versie ⇒ geen I/O', same.needsPersist, false);
  const bumped = planRecoveryDelta('A', [{ ...metaA, siteFileVersion: 'v2' }], persisted);
  eq('F5 nieuwe site-versie ⇒ manifest-only', [bumped.manifestChanged, bumped.changedDocuments.length], [true, 0]);
  const noSite = { id: 'A', filePath: 'A.ifc', isDirty: false, datesAsRecorded: false, siteFileId: null, siteFileVersion: null, source };
  const persistedNoSite = persistedRecoveryState('A', [{ id: 'A', filePath: 'A.ifc', isDirty: false, datesAsRecorded: false, source }]);
  eq('F5 null en ontbrekend zijn gelijk', planRecoveryDelta('A', [noSite], persistedNoSite).needsPersist, false);

  // restoreDocuments zet het doel terug.
  S().newProject();
  S().setProject({ name: 'Herstel-site', startDate: '2026-08-03' });
  S().addTask({ name: 'Werk' });
  const ifc = writeIFC(buildWriteIFCInput(S()));
  const parsed = readIFC(ifc);
  S().restoreDocuments([
    recoveryInputFromParsed(parsed, { id: 'rs-1', filePath: 'Herstel.ifc', siteFileId: 'site-r', isDirty: true, datesAsRecorded: false }),
    recoveryInputFromParsed(parsed, { id: 'rs-2', filePath: 'Lokaal.ifc', isDirty: true, datesAsRecorded: false }),
  ], 'rs-1');
  eq('F6 hersteld actief document: siteFileId terug', S().siteFileId, 'site-r');
  eq('F6 hersteld document: opslagdoel is de site', saveTargetRef(S(), false), { kind: 'site', id: 'site-r' });
  S().switchDocument('rs-2');
  eq('F6 hersteld document zonder site: null', S().siteFileId, null);
}

// ═══ G. De opslaanroute in de store ════════════════════════════════════════════════════════════
{
  resetSiteVersionsForTests();
  resetSiteAskers();
  clearHost();
  const asked: string[] = [];
  setSiteOpenAsker(async () => { asked.push('open'); return null; });
  setSiteSaveAsker(async () => { asked.push('save'); return null; });

  // G0 — ZONDER host: geen enkele site-vraag; de gewone route (hier: download-terugval).
  S().newProject();
  S().setProject({ name: 'Zonder site', startDate: '2026-08-03' });
  S().addTask({ name: 'Taak' });
  downloads.length = 0;
  await S().saveFile();
  eq('G0 zonder host: geen site-vraag bij opslaan', asked, []);
  eq('G0 zonder host: gewone route (download)', downloads, ['Zonder site.ifc']);
  eq('G0 zonder host: siteFileId blijft null', S().siteFileId, null);
  await S().saveFileAs();
  eq('G0 zonder host: ook opslaan als vraagt niets', asked, []);
  eq('G0 isActivePristine kijkt ook naar siteFileId', isActivePristine({ ...S(), tasks: [], sequences: [], resources: [], filePath: null, isDirty: false, siteFileId: 'x' }), false);

  // Site met één IFC-bestand.
  const site = memorySite();
  setHost({ storage: site.storage });
  S().newProject();
  S().setProject({ name: 'Site-project', startDate: '2026-08-03' });
  S().addTask({ name: 'Fundering' });
  const ifc = writeIFC(buildWriteIFCInput(S()));
  site.put('p1', 'Site-project.ifc', [ifc, ifc]);

  // G1 — Openen van de site (nieuwste versie).
  asked.length = 0;
  setSiteOpenAsker(async (req) => { asked.push(`open:${req.extensions.includes('ifc')}`); return { kind: 'site', id: 'p1' }; });
  S().newProject();
  await S().openFile();
  eq('G1 openFile stelt de site-vraag met de open-extensies', asked, ['open:true']);
  eq('G1 nieuwste versie ⇒ site-doel', S().siteFileId, 'p1');
  eq('G1 filePath = naam van de site', S().filePath, 'Site-project.ifc');
  eq('G1 taken geladen', S().tasks.map((t) => t.name), ['Fundering']);
  eq('G1 in de recente bestanden', S().recentFiles[0]?.ref, { kind: 'site', id: 'p1' });
  eq('G1 basis = v2', knownSiteVersion('p1'), 'v2');

  // G2 — wijzigen + Ctrl+S ⇒ save met id + baseVersion, zonder vraag.
  asked.length = 0;
  S().addTask({ name: 'Ruwbouw' });
  eq('G2 voorwaarde: gewijzigd', S().isDirty, true);
  await S().saveFile();
  eq('G2 geen vraag bij Ctrl+S met site-doel', asked, []);
  eq('G2 save met id en baseVersion', site.calls.at(-1)?.args[0], {
    id: 'p1', name: 'Site-project.ifc', baseVersion: 'v2', type: 'application/x-step',
  });
  eq('G2 isDirty uit na opslaan', S().isDirty, false);
  eq('G2 nieuwe basis v3', knownSiteVersion('p1'), 'v3');

  // G3 — conflict: eigen melding, document blijft gewijzigd.
  site.files.get('p1')!.versions.push({ version: 'v4', data: ifc });
  S().addTask({ name: 'Afbouw' });
  await S().saveFile();
  const last = S().ui.notifications.at(-1);
  eq('G3 conflictmelding', [last?.messageKey, last?.params?.name], ['notifications.siteSaveConflict', 'Site-project.ifc']);
  eq('G3 document blijft gewijzigd', S().isDirty, true);
  eq('G3 site-doel blijft', S().siteFileId, 'p1');

  // G4 — andere sitefout: saveFailed met de tekst van de site.
  const failing = memorySite({ fail: 'Schijf vol op de site' });
  failing.put('p1', 'Site-project.ifc', [ifc]);
  setHost({ storage: failing.storage });
  await S().saveFile();
  const failNote = S().ui.notifications.at(-1);
  eq('G4 andere fout ⇒ saveFailed met detail', [failNote?.messageKey, failNote?.detail], ['notifications.saveFailed', 'Schijf vol op de site']);
  eq('G4 document blijft gewijzigd', S().isDirty, true);
  setHost({ storage: site.storage });

  // G5 — Opslaan als ⇒ altijd een NIEUW site-bestand.
  asked.length = 0;
  setSiteSaveAsker(async (req) => { asked.push(`save:${req.defaultName}`); return { kind: 'site', name: 'Variant.ifc' }; });
  await S().saveFileAs();
  eq('G5 opslaan als stelt de vraag met de huidige naam', asked, ['save:Site-project.ifc']);
  eq('G5 save zonder id', (site.calls.at(-1)?.args[0] as AnyRecord).id, undefined);
  truthy('G5 nieuw site-doel', S().siteFileId !== null && S().siteFileId !== 'p1');
  eq('G5 filePath = nieuwe naam', S().filePath, 'Variant.ifc');
  eq('G5 isDirty uit', S().isDirty, false);
  eq('G5 nieuw bestand bovenaan in Recent', S().recentFiles[0]?.name, 'Variant.ifc');

  // G6 — nieuw document, Ctrl+S ⇒ site-vraag ⇒ naam ⇒ opgeslagen.
  asked.length = 0;
  S().newDocument();
  S().setProject({ name: 'Nieuw op de site', startDate: '2026-08-03' });
  S().addTask({ name: 'X' });
  setSiteSaveAsker(async (req) => { asked.push(`save:${req.defaultName}`); return { kind: 'site', name: 'Eigen naam.ifc' }; });
  await S().saveFile();
  eq('G6 vraag met voorgestelde naam', asked, ['save:Nieuw op de site.ifc']);
  eq('G6 opgeslagen onder de gekozen naam', [S().filePath, S().isDirty], ['Eigen naam.ifc', false]);
  truthy('G6 site-doel gezet', !!S().siteFileId);

  // G7 — annuleren in de vraag ⇒ niets opgeslagen.
  S().addTask({ name: 'Y' });
  const savesBefore = site.calls.filter((c) => c.fn === 'save').length;
  setSiteSaveAsker(async () => null);
  await S().saveFileAs();
  eq('G7 annuleren ⇒ geen save', site.calls.filter((c) => c.fn === 'save').length, savesBefore);
  eq('G7 annuleren ⇒ blijft gewijzigd', S().isDirty, true);

  // G8 — "Op deze pc…" ⇒ bestaande route; het site-doel vervalt.
  downloads.length = 0;
  setSiteSaveAsker(async () => ({ kind: 'local' }));
  await S().saveFileAs();
  eq('G8 lokale route (download)', downloads.length, 1);
  eq('G8 site-doel vervalt na lokaal opslaan', S().siteFileId, null);

  // G9 — oudere versie openen ⇒ kopie zonder doel, niet in Recent.
  const recentBefore = S().recentFiles.map((e) => e.id);
  setSiteOpenAsker(async () => ({ kind: 'site', id: 'p1', version: 'v1', copyName: 'Site-project (versie v1)' }));
  await S().openFile();
  eq('G9 kopie: geen site-doel', S().siteFileId, null);
  eq('G9 kopie: naam met versie', S().filePath, 'Site-project (versie v1).ifc');
  eq('G9 kopie: geen opslagdoel', saveTargetRef(S(), false), null);
  eq('G9 kopie: Recent ongewijzigd', S().recentFiles.map((e) => e.id), recentBefore);

  // G10 — "Van deze pc…" ⇒ gewone kiezer (hier de input-terugval zonder FSA wordt niet geopend:
  // we kijken alleen dat de site niet gelezen wordt).
  const opensBefore = site.calls.filter((c) => c.fn === 'open').length;
  setSiteOpenAsker(async () => null);
  await S().openFile();
  eq('G10 annuleren ⇒ niets geopend', site.calls.filter((c) => c.fn === 'open').length, opensBefore);

  // G11 — kopie van een document met site-doel krijgt geen site-doel.
  setSiteOpenAsker(async () => ({ kind: 'site', id: 'p1' }));
  await S().openFile();
  eq('G11 voorwaarde: site-doel', S().siteFileId, 'p1');
  S().duplicateDocument();
  eq('G11 duplicaat zonder site-doel', S().siteFileId, null);

  // G12 — openFromSite (startbestand) en een mislukte open.
  S().newDocument();
  eq('G12 openFromSite ⇒ true', await S().openFromSite('p1'), true);
  eq('G12 site-doel gezet', S().siteFileId, 'p1');
  eq('G12 onbekend id ⇒ false + melding', [await S().openFromSite('bestaat-niet'), S().ui.notifications.at(-1)?.messageKey], [false, 'notifications.openFailed']);

  // G13 — recent heropenen via de site; een verdwenen bestand verdwijnt uit Recent.
  S().newDocument();
  const entry = S().recentFiles.find((e) => e.ref.kind === 'site' && e.ref.id === 'p1')!;
  await S().openRecentFile(entry.id);
  eq('G13 heropenen uit Recent ⇒ site-doel', S().siteFileId, 'p1');
  site.files.delete('p1');
  const gone = S().recentFiles.find((e) => e.ref.kind === 'site' && e.ref.id === 'p1')!;
  await S().openRecentFile(gone.id);
  eq('G13 verdwenen site-bestand gaat uit Recent', S().recentFiles.some((e) => e.ref.kind === 'site' && e.ref.id === 'p1'), false);

  // G14 — namen.
  eq('G14 standaardnaam eindigt op .ifc', siteSaveDefaultName({ filePath: 'plan', project: S().project, xerImportMetadata: null }), 'plan.ifc');
  eq('G14 kopienaam behoudt de extensie', siteVersionCopyName('bron.xer', '3', 'bron (versie 3)'), 'bron (versie 3).xer');
  eq('G14 kopienaam zonder label', siteVersionCopyName('a.ifc', '2'), 'a (2).ifc');

  resetSiteAskers();
  clearHost();
}

if (diffs.length === 0) {
  console.log(`OK  site-storage: alle checks groen (${checks})`);
  process.exit(0);
} else {
  console.log(`XX  site-storage: ${diffs.length} afwijking(en) van ${checks}`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
