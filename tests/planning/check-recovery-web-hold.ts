// Web-crashherstel "later" (audit 2026-09-26): kiest de gebruiker in het herstel-venster voor
// uitstellen, dan moeten de gevonden snapshots de volgende crashherstel-rondes overleven. Op het web
// deelt een herlaad dezelfde sessie-id; `saveWeb` overschreef daardoor het manifest en wiste elk
// documentrecord dat niet meer open was — precies de uitgestelde snapshots.
// Loopt door de publieke grens van `recoveryStore` tegen een minimale IndexedDB-/sessionStorage-dubbel.
// Het tweede deel doet hetzelfde voor de desktop (Tauri), tegen een nep-`invoke` voor plugin-fs.
//
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen — alleen de exitcode telt.
import { ownRecoveryNames, type RecoveryManifest } from '@/hooks/recoveryPaths';
import {
  clearOwnRecovery, clearRecovery, fullRecoverySave, holdRecoveryForLater, loadRecovery, saveRecovery,
  RECOVERY_MANIFEST_VERSION,
} from '@/services/recovery/recoveryStore';
import { installFakeRecoveryIndexedDb } from './fakeRecoveryIndexedDb';

const diffs: string[] = [];
let checks = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
};

const idb = installFakeRecoveryIndexedDb();
const session = new Map<string, string>();
(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
  getItem: (k: string) => session.get(k) ?? null,
  setItem: (k: string, v: string) => { session.set(k, v); },
  removeItem: (k: string) => { session.delete(k); },
};

// Knownbug 99: op een HTTP-adres ontbreekt randomUUID. Forceer bovendien een bezette
// eerste sessieclaim, zodat ook het duplicaat-tabpad een nieuwe id moet maken.
const uuidDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
const randomDescriptor = Object.getOwnPropertyDescriptor(Math, 'random')!;
Object.defineProperty(Math, 'random', {
  configurable: true,
  value: () => { throw new Error('Herstelidentiteiten mogen geen Math.random gebruiken'); },
});
const valuesDescriptor = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
const getRandomValues = crypto.getRandomValues.bind(crypto);
const randomByteLengths: number[] = [];
Object.defineProperty(crypto, 'getRandomValues', {
  configurable: true,
  value: (bytes: Uint8Array) => {
    randomByteLengths.push(bytes.byteLength);
    return getRandomValues(bytes);
  },
});
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const claimed: string[] = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { locks: {
    request: (name: string, _options: unknown, callback: (lock: object | null) => unknown) => {
      claimed.push(name);
      callback(claimed.length <= 2 ? null : { name });
      return Promise.resolve();
    },
  } },
});

const doc = (id: string) => ({ id, ifc: `ISO-10303-21; /* ${id} */`, filePath: null, isDirty: true, datesAsRecorded: false });
const ids = async () => (await loadRecovery()).docs.map((d) => d.id).sort();

// Vorige sessie liet document A achter.
await saveRecovery(fullRecoverySave('A', [doc('A')]));
eq('voorwaarde: A staat klaar voor herstel', await ids(), ['A']);
const firstSession = session.get('ops-recovery-session');
eq('zonder randomUUID ontstaat een eigen opgeslagen sessie-id', !!firstSession && firstSession !== 'default', true);
eq('de HTTP-terugval bewaart alle 128 willekeurige bits als hex', /^inst-[0-9a-f]{32}$/.test(firstSession ?? ''), true);
eq('aanmaken en duplicaat-tabrotatie gebruiken elk 16 cryptografische bytes', randomByteLengths, [16, 16]);
eq('een bezette claim krijgt precies één retry en een nieuwe id', claimed.length, 3);
eq('de retry gebruikt dezelfde eerste id', claimed[0], claimed[1]);
eq('het gedupliceerde tab krijgt een andere id', claimed[2] !== claimed[0], true);


// Gebruiker kiest "later"; daarna schrijft de crashherstel-ronde het nieuwe (lege) document B.
// Ook een aanwezige maar werpende randomUUID gebruikt de sterke HTTP-terugval.
Object.defineProperty(crypto, 'randomUUID', {
  configurable: true,
  value: () => { throw new Error('randomUUID is niet beschikbaar'); },
});
await holdRecoveryForLater();
eq('uitstellen roteert de sessie ook zonder randomUUID', session.get('ops-recovery-session') !== firstSession, true);
eq('uitstellen na een werpende randomUUID gebruikt opnieuw 16 cryptografische bytes', randomByteLengths, [16, 16, 16]);
await saveRecovery(fullRecoverySave('B', [doc('B')]));
eq('A overleeft de volgende crashherstel-ronde', await ids(), ['A', 'B']);

// Nog een ronde met een ander document: A blijft, B's generatie volgt het open-venster.
await saveRecovery(fullRecoverySave('C', [doc('C')]));
eq('A blijft vastgehouden, eigen generatie ruimt B op', await ids(), ['A', 'C']);

// Een tweede keer uitstellen stapelt, niet vervangen.
await holdRecoveryForLater();
await saveRecovery(fullRecoverySave('D', [doc('D')]));
eq('twee vastgehouden generaties + de eigen', await ids(), ['A', 'C', 'D']);

// Hetzelfde document in eigen én vastgehouden generatie: één keer, de eigen (nieuwste) wint.
await saveRecovery(fullRecoverySave('A', [doc('A'), doc('D')]));
eq('dubbele id wordt één keer aangeboden', await ids(), ['A', 'C', 'D']);

// "Niet herstellen" / schone exit wist alles, ook de vastgehouden generaties.
await clearRecovery();
eq('clearRecovery wist eigen + vastgehouden', await ids(), []);
eq('geen records meer over', idb.store('records').size + idb.store('xer-archives').size, 0);

if (uuidDescriptor) Object.defineProperty(crypto, 'randomUUID', uuidDescriptor);
else Reflect.deleteProperty(crypto, 'randomUUID');
Object.defineProperty(Math, 'random', randomDescriptor);
if (valuesDescriptor) Object.defineProperty(crypto, 'getRandomValues', valuesDescriptor);
else Reflect.deleteProperty(crypto, 'getRandomValues');
if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
else Reflect.deleteProperty(globalThis, 'navigator');

// ── Desktop (Tauri): gedeeltelijk herstel houdt de onleesbare snapshot vast (knownbug 37) ──────
// De echte `saveTauri`/`loadTauri`/`holdTauri` tegen een nep-`invoke` met een map als schijf.
// Nagebootst wordt wat `useRecoveryRestore` doet: laden, het leesbare document herstellen, het
// onleesbare niet, `holdRecoveryForLater()`, en daarna gewone auto-saverondes met alleen het
// herstelde document open.
const DIR = '/appdata';
const disk = new Map<string, Uint8Array>();
let failManifestCommit = false;
const enc = new TextEncoder();
const dec = new TextDecoder();
type TauriArgs = { path: string; paths: string[]; oldPath: string; newPath: string };
(globalThis as unknown as { window: unknown }).window = { __TAURI_INTERNALS__: {
  invoke: async (cmd: string, args: TauriArgs & Uint8Array, options?: { headers?: { path?: string } }) => {
    const need = (p: string) => { const b = disk.get(p); if (!b) throw new Error(`No such file: ${p}`); return b; };
    switch (cmd) {
      case 'plugin:path|resolve_directory': return DIR;
      case 'plugin:path|join': return args.paths.join('/');
      case 'plugin:fs|mkdir': return null;
      case 'plugin:fs|exists': return disk.has(args.path);
      case 'plugin:fs|read_dir': return [...disk.keys()].map((p) => ({ name: p.slice(DIR.length + 1) }));
      case 'plugin:fs|read_text_file': case 'plugin:fs|read_file': return need(args.path);
      case 'plugin:fs|stat': need(args.path); return { mtime: 0, atime: null, birthtime: null };
      case 'plugin:fs|write_text_file': case 'plugin:fs|write_file':
        disk.set(decodeURIComponent(options!.headers!.path!), new Uint8Array(args)); return null;
      case 'plugin:fs|rename':
        if (failManifestCommit && args.newPath === DIR + '/' + ownRecoveryNames.manifest) {
          throw new Error('Gesimuleerde mislukte manifestcommit');
        }
        disk.set(args.newPath, need(args.oldPath)); disk.delete(args.oldPath); return null;
      case 'plugin:fs|remove': need(args.path); disk.delete(args.path); return null;
      default: throw new Error(`nep-Tauri kent ${cmd} niet`);
    }
  },
} };

const N = ownRecoveryNames;
const BROKEN = 'BROKEN_RECOVERY_FIXTURE';
const put = (name: string, text: string) => { disk.set(`${DIR}/${name}`, enc.encode(text)); };
const bytesOf = (name: string) => { const b = disk.get(`${DIR}/${name}`); return b ? dec.decode(b) : null; };
const manifestRefs = () => (JSON.parse(bytesOf(N.manifest) ?? '{"documents":[]}') as RecoveryManifest)
  .documents.map((d) => `${d.id}=${d.ifc}`).sort();
const offered = async () => (await loadRecovery()).docs.map((d) => `${d.id}:${d.ifc}`).sort();
const restored = (ifc: string) => ({ ...doc('doc-a'), ifc });
/** Na elke ronde: bytes, manifestverwijzing en aanbod van het onleesbare document doc-b. */
const expectHeld = async (label: string, brokenName: string) => {
  eq(`${label}: bytes van doc-b staan nog op schijf`, bytesOf(brokenName), BROKEN);
  eq(`${label}: manifest verwijst nog naar doc-b`, manifestRefs().includes(`doc-b=${brokenName}`), true);
  eq(`${label}: loadRecovery biedt doc-b nog aan`, (await offered()).includes(`doc-b:${BROKEN}`), true);
};

// 1. v1-manifest zonder ownerId (legacy). Zonder vasthouden ruimde de eerste ronde doc-b op.
{
  put(N.manifest, JSON.stringify({ version: 1, activeDocumentId: 'doc-a', documents: [
    { id: 'doc-a', ifc: N.ifcName('doc-a'), filePath: null, isDirty: true },
    { id: 'doc-b', ifc: N.ifcName('doc-b'), filePath: null, isDirty: true },
  ] }));
  put(N.ifcName('doc-a'), 'ISO-10303-21; /* A0 */');
  put(N.ifcName('doc-b'), BROKEN);
  eq('tauri v1: voorwaarde, beide worden aangeboden', (await offered()).map((s) => s.split(':')[0]), ['doc-a', 'doc-b']);
  await holdRecoveryForLater();
  await saveRecovery(fullRecoverySave('doc-a', [restored('ISO-10303-21; /* A1 */')]));
  await expectHeld('tauri v1 ronde 1', N.ifcName('doc-b'));
  await saveRecovery(fullRecoverySave('doc-a', [restored('ISO-10303-21; /* A2 */')]));
  await expectHeld('tauri v1 ronde 2', N.ifcName('doc-b'));
  eq('tauri v1: zonder bevestigde herstel-ids blijft oude doc-a beschermd', bytesOf(N.ifcName('doc-a')), 'ISO-10303-21; /* A0 */');
  // Schone afsluiting haalt alleen de eigen snapshots weg; doc-b blijft voor de volgende start.
  await clearOwnRecovery();
  eq('tauri v1: na schone afsluiting alleen doc-b', (await offered()), [`doc-b:${BROKEN}`]);
  // Verwerpen blijft de uitweg: alles van deze base weg.
  await clearRecovery();
  eq('tauri v1: verwerpen wist alles', [...disk.keys()].filter((p) => N.isOwnFile(p.slice(DIR.length + 1))), []);
}

// 2. Huidig manifest van een vorige start (`foreign`). De eerste ronde droeg doc-b al mee; de
//    tweede ronde (manifest nu van ons) liet de verwijzing vallen en hield weesbytes over.
{
  const brokenName = N.generationIfcName('doc-b', 'g0');
  put(N.manifest, JSON.stringify({
    version: RECOVERY_MANIFEST_VERSION, activeDocumentId: 'doc-a', ownerId: 'vorige-start', heartbeatAt: 1,
    documents: [
      { id: 'doc-a', ifc: N.generationIfcName('doc-a', 'g0'), filePath: null, isDirty: true, datesAsRecorded: false },
      { id: 'doc-b', ifc: brokenName, filePath: null, isDirty: true, datesAsRecorded: false },
    ],
  }));
  put(N.generationIfcName('doc-a', 'g0'), 'ISO-10303-21; /* A0 */');
  put(brokenName, BROKEN);
  eq('tauri v5: voorwaarde, beide worden aangeboden', (await offered()).map((s) => s.split(':')[0]), ['doc-a', 'doc-b']);
  await holdRecoveryForLater();
  await saveRecovery(fullRecoverySave('doc-a', [restored('ISO-10303-21; /* A1 */')]));
  await expectHeld('tauri v5 ronde 1', brokenName);
  await saveRecovery(fullRecoverySave('doc-a', [restored('ISO-10303-21; /* A2 */')]));
  await expectHeld('tauri v5 ronde 2', brokenName);
  // Ronde 3 zonder nieuwe inhoud (alleen metadata): doc-a houdt zijn generatie, doc-b gaat mee.
  await saveRecovery({
    activeDocumentId: 'doc-a',
    documents: [{ id: 'doc-a', filePath: null, isDirty: false, datesAsRecorded: false }],
    upserts: [],
  });
  await expectHeld('tauri v5 ronde 3', brokenName);
  await clearRecovery();
}
// 3. Geslaagd gedeeltelijk herstel: alleen de bevestigde gezonde generatie mag verdwijnen,
//    en pas ná de nieuwe manifestcommit. De onleesbare kopie blijft ook na 250 rondes aangeboden.
for (const legacy of [true, false]) {
  const label = legacy ? 'v1' : 'v5';
  const healthyName = legacy ? N.ifcName('doc-a') : N.generationIfcName('doc-a', 'herstel');
  const brokenName = legacy ? N.ifcName('doc-b') : N.generationIfcName('doc-b', 'herstel');
  const healthy = 'ISO-10303-21; /* herstelde oude A */';
  put(N.manifest, JSON.stringify({
    version: legacy ? 1 : RECOVERY_MANIFEST_VERSION,
    ...(legacy ? {} : { ownerId: 'vorige-start', heartbeatAt: 1 }),
    activeDocumentId: 'doc-a',
    documents: [
      { id: 'doc-a', ifc: healthyName, filePath: null, isDirty: true, datesAsRecorded: false },
      { id: 'doc-b', ifc: brokenName, filePath: null, isDirty: true, datesAsRecorded: false },
    ],
  }));
  put(healthyName, healthy);
  put(brokenName, BROKEN);
  await holdRecoveryForLater(['doc-a']);
  eq(label + ': vasthouden verwijdert nog niets', bytesOf(healthyName), healthy);
  const oldManifest = bytesOf(N.manifest);
  failManifestCommit = true;
  let rejected = false;
  try { await saveRecovery(fullRecoverySave('doc-a', [restored('ISO-10303-21; /* poging */')])); }
  catch { rejected = true; }
  finally { failManifestCommit = false; }
  eq(label + ': de gesimuleerde commitfout bereikt de aanroeper', rejected, true);
  eq(label + ': oude manifest blijft intact bij commitfout', bytesOf(N.manifest), oldManifest);
  eq(label + ': gezonde oude snapshot blijft intact bij commitfout', bytesOf(healthyName), healthy);
  await expectHeld(label + ' mislukte commit', brokenName);
  for (let round = 0; round < 250; round++) {
    await saveRecovery(fullRecoverySave('doc-a', [restored('ISO-10303-21; /* ronde ' + round + ' */')]));
    eq(label + ': vervangen gezonde snapshot weg in ronde ' + round, bytesOf(healthyName), null);
    await expectHeld(label + ' ronde ' + round, brokenName);
  }
  eq(label + ': alleen actuele gezonde en beschermde onleesbare snapshot staan op schijf',
    [...disk.keys()].filter(path => N.snapshotDocId(path.slice(DIR.length + 1)) !== null).length, 2);
  await clearOwnRecovery();
  eq(label + ': na schone afsluiting geen gezonde weesbytes',
    [...disk.keys()].filter(path => N.snapshotDocId(path.slice(DIR.length + 1)) !== null),
    [DIR + '/' + brokenName]);
  await expectHeld(label + ' schone afsluiting', brokenName);
  await clearRecovery();
}
Reflect.deleteProperty(globalThis, 'window');

if (diffs.length === 0) {
  console.log(`OK  recovery-web-hold: alle checks groen (${checks})`);
  process.exit(0);
} else {
  console.log(`XX  recovery-web-hold: ${diffs.length} afwijking(en) van ${checks}`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
