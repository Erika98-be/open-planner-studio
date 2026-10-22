// .mpp openen via de echte open-pijplijn: `parseOpenedFile` (formatRegistry) → `applyOpenedImport`
// (store). Bewaakt het importverslag (issue #391, `mppImportLoss.ts` + `msProjectImportNotice`):
// - een bestand met in elke categorie iets dat de lezer niet overneemt ⇒ één melding met per
//   categorie een regel en de juiste telling, samen met de rekenprofielregel van .mpp;
// - die melding blijft staan tot het kruisje (`sticky`), want er is data weggelaten;
// - een schoon bestand (ook met een lege aantekening, een NB-baseline en lege eigen velden) ⇒ geen
//   verslag en geen melding;
// - de RTF-aantekeningregel telt zichtbare tekst en echte afbeeldingen/objecten, geen metadata.
// Corpusloos (CI): de fixtures zijn synthetische MPP14-containers (zelfde bouw als `mppFixtures.ts`).
// De sleutels komen uit MPXJ (`FieldMap14.java`); de tellingen zijn lokaal ook nagemeten tegen de
// MPP14-testbestanden van MPXJ (`junit/data/mpp14*.mpp`), zie de PR.
import { readFileSync } from 'node:fs';
import { parseOpenedFile } from '@/services/formatRegistry';
import { useAppStore } from '@/state/appStore';
import { msProjectImportNotice } from '@/state/msProjectImportNotice';
import { rtfHasVisibleText } from '@/services/mpp/mppImportLoss';
import { readMPP } from '@/services/mpp/mppReader';
import { Var2Data } from '@/services/mpp/mppPrimitives';
import { activeImportResult, isMultiDocumentImport, type OpenedImport } from '@/services/importTypes';
import {
  buildNestedCfb, buildVarMetaBytes, concatBytes, encodeCompObjFileFormat, encodePropsEntries,
  encodePropsSingleByteEntry, minimalMpp14Bytes, mppTimestampBytes, type CfbTreeNode,
} from './mppFixtures';

declare const process: { exitCode?: number };
const S = () => useAppStore.getState();

const fails: string[] = [];
let checks = 0;
function eq(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
  }
}

// ── Bytes ────────────────────────────────────────────────────────────────────────────────────────
const utf16 = (s: string, terminate = false) => {
  const out = new Uint8Array((s.length + (terminate ? 1 : 0)) * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < s.length; i++) view.setUint16(i * 2, s.charCodeAt(i), true);
  return out;
};
const latin1 = (s: string) => Uint8Array.from([...s].map(c => c.charCodeAt(0)));
const int32 = (v: number) => { const o = new Uint8Array(4); new DataView(o.buffer).setInt32(0, v, true); return o; };
const double = (v: number) => { const o = new Uint8Array(8); new DataView(o.buffer).setFloat64(0, v, true); return o; };
const NA_TIMESTAMP = Uint8Array.from([0xff, 0xff, 0xff, 0xff]);
/** `HyperlinkReader.java`: 24 bytes kop, dan weergave, 12 bytes, adres, 12 bytes, subadres. */
const hyperlink = (text: string, address: string) =>
  concatBytes(new Uint8Array(24), utf16(text, true), new Uint8Array(12), utf16(address, true), new Uint8Array(12), utf16('', true));
/** `CostRateTableFactory.java`: 16 bytes kop, dan records van 44 bytes (standaardtarief @0). */
const rateTable = (standardRate: number) => {
  const out = new Uint8Array(16 + 44);
  new DataView(out.buffer).setFloat64(16, standardRate, true);
  return out;
};

/** Var2Data + VarMeta uit `{ uid: { key: bytes } }`. Dezelfde bytearray binnen één storage
 *  betekent een echte gedeelde offset; een kopie met gelijke inhoud blijft een apart blok. */
function varBlocks(entries: Record<number, Record<number, Uint8Array>>): { meta: Uint8Array; data: Uint8Array } {
  const metaEntries: { uniqueId: number; offset: number; type: number }[] = [];
  const parts: Uint8Array[] = [];
  const offsets = new Map<Uint8Array, number>();
  let offset = 0;
  for (const [uid, fields] of Object.entries(entries)) {
    for (const [key, bytes] of Object.entries(fields)) {
      let blockOffset = offsets.get(bytes);
      if (blockOffset === undefined) {
        blockOffset = offset;
        offsets.set(bytes, blockOffset);
        parts.push(int32(bytes.length), bytes);
        offset += 4 + bytes.length;
      }
      metaEntries.push({ uniqueId: Number(uid), offset: blockOffset, type: Number(key) });
    }
  }
  return { meta: buildVarMetaBytes(metaEntries), data: concatBytes(...parts) };
}

/** Een TASK_FIELD_MAP (Props 131092) met de velden van de lezer plus FIXED_COST op offset 130, zodat
 *  de vaste kosten in de data-gedreven veldkaart staan (`FieldMap.createFieldMap`, 28 bytes/entry). */
function taskFieldMap(): Uint8Array {
  const fixed: [number, number][] = [[86, 0], [23, 4], [249, 40], [29, 42], [17, 56], [35, 64], [36, 68], [401, 118], [8, 130]];
  const entries = [...fixed.map(([typeValue, dataBlockOffset]) => ({ typeValue, dataBlockOffset })),
    { typeValue: 14, dataBlockOffset: 65535 }];
  const out = new Uint8Array(entries.length * 28);
  const view = new DataView(out.buffer);
  entries.forEach((e, i) => { view.setUint16(i * 28 + 4, e.dataBlockOffset, true); view.setInt32(i * 28 + 12, e.typeValue, true); });
  return out;
}

interface FixtureAssignment { uid: number; deleted?: boolean; vars: Record<number, Uint8Array> }
interface FixtureTask { uid: number; name: string; fixedCost?: number; vars?: Record<number, Uint8Array> }
interface FixtureResource { uid: number; name: string; vars?: Record<number, Uint8Array> }
interface Fixture {
  tasks: FixtureTask[];
  resourceVars: Record<number, Uint8Array>;
  /** Optioneel meerdere resources in plaats van de standaardresource (uid 1). */
  resources?: FixtureResource[];
  /** Toewijzingen aan taak 10 en resource 1; `deleted` zet de verwijdermarkering (FixedMeta-byte 0). */
  assignments: FixtureAssignment[];
  criticalSlackLimit?: number;
}

const RECORD = 140;
const TASK_META_ITEM = 47;
const RESOURCE_META_ITEM = 37;
const ASSIGNMENT_META_ITEM = 34;
const ASSIGNMENT_RECORD = 110;
const START_DAYS = 15000;

function buildMpp(fx: Fixture): Uint8Array {
  // Taken: drie lege meta-items (FIRST_TASK_INDEX = 3), dan één record per taak.
  const records = fx.tasks.map((task, i) => {
    const record = new Uint8Array(RECORD);
    const rv = new DataView(record.buffer);
    rv.setInt32(0, task.uid, true); rv.setInt32(4, i + 1, true); rv.setInt16(40, 1, true);
    rv.setInt32(42, 2 * 4800, true);
    rv.setUint16(64, 0, true); rv.setUint16(66, START_DAYS, true);
    rv.setUint16(68, 0, true); rv.setUint16(70, START_DAYS + 1, true);
    rv.setInt32(118, -1, true);
    rv.setFloat64(130, task.fixedCost ?? 0, true);
    return record;
  });
  const items = 3 + fx.tasks.length;
  const meta = new Uint8Array(16 + items * TASK_META_ITEM);
  const mv = new DataView(meta.buffer);
  mv.setUint32(0, 0xfadfadba, true); mv.setInt32(8, items, true);
  fx.tasks.forEach((_, i) => mv.setInt32(16 + (3 + i) * TASK_META_ITEM + 4, i * RECORD, true));
  const taskVars = varBlocks(Object.fromEntries(fx.tasks.map(task => [task.uid, { 14: utf16(task.name), ...(task.vars ?? {}) }])));

  // Resources: uid @0 (SHORT) en MaxUnits @44.
  const resources = fx.resources ?? [{ uid: 1, name: 'Timmerman', vars: fx.resourceVars }];
  const rscMeta = new Uint8Array(16 + resources.length * RESOURCE_META_ITEM);
  new DataView(rscMeta.buffer).setUint32(0, 0xfadfadba, true);
  new DataView(rscMeta.buffer).setInt32(8, resources.length, true);
  const rscRecords = resources.map((resource, i) => {
    new DataView(rscMeta.buffer).setInt32(16 + i * RESOURCE_META_ITEM + 4, i * 60, true);
    const record = new Uint8Array(60);
    new DataView(record.buffer).setInt16(0, resource.uid, true);
    new DataView(record.buffer).setFloat64(44, 10000, true);
    return record;
  });
  const rscVars = varBlocks(Object.fromEntries(resources.map(resource =>
    [resource.uid, { 1: utf16(resource.name), ...(resource.vars ?? {}) }])));
  // Toewijzingen: FixedMeta (34 bytes/item, byte 0 = verwijderd, offset @4) en FixedData (110 bytes/record:
  // uid @0, taak @4, resource @8, eenheden @46), zoals `readAssignments` ze leest.
  const asnMeta = new Uint8Array(16 + fx.assignments.length * ASSIGNMENT_META_ITEM);
  const amv = new DataView(asnMeta.buffer);
  amv.setUint32(0, 0xfadfadba, true); amv.setInt32(8, fx.assignments.length, true);
  const asnRecords = fx.assignments.map((assignment, i) => {
    asnMeta[16 + i * ASSIGNMENT_META_ITEM] = assignment.deleted ? 1 : 0;
    amv.setInt32(16 + i * ASSIGNMENT_META_ITEM + 4, i * ASSIGNMENT_RECORD, true);
    const record = new Uint8Array(ASSIGNMENT_RECORD);
    const view = new DataView(record.buffer);
    view.setInt32(0, assignment.uid, true); view.setInt32(4, 10, true); view.setInt32(8, 1, true);
    view.setFloat64(46, 10000, true);
    return record;
  });
  const asnVars = varBlocks(Object.fromEntries(fx.assignments.map(a => [a.uid, a.vars])));

  const props = encodePropsEntries([
    { key: 37748738, data: mppTimestampBytes(0, START_DAYS) },
    { key: 37748739, data: mppTimestampBytes(0, START_DAYS + 30) },
    { key: 37748765, data: int32(480) },
    { key: 37748744, data: utf16('Verslag') },
    { key: 131092, data: taskFieldMap() },
    ...(fx.criticalSlackLimit !== undefined ? [{ key: 37748756, data: int32(fx.criticalSlackLimit) }] : []),
  ]);
  const tree: Record<string, CfbTreeNode> = {
    '\x01CompObj': { data: encodeCompObjFileFormat('MSProject.MPP14') },
    Props14: { data: encodePropsSingleByteEntry(893386752, 0) },
    '   114': {
      children: {
        Props: { data: props },
        TBkndTask: { children: {
          FixedMeta: { data: meta }, FixedData: { data: concatBytes(...records) },
          VarMeta: { data: taskVars.meta }, Var2Data: { data: taskVars.data },
        } },
        TBkndRsc: { children: {
          FixedMeta: { data: rscMeta }, FixedData: { data: concatBytes(...rscRecords) },
          VarMeta: { data: rscVars.meta }, Var2Data: { data: rscVars.data },
        } },
        TBkndAssn: { children: {
          FixedMeta: { data: asnMeta }, FixedData: { data: concatBytes(...asnRecords) },
          VarMeta: { data: asnVars.meta }, Var2Data: { data: asnVars.data },
        } },
      },
    },
  };
  return buildNestedCfb(tree);
}

const NOTE = latin1('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\viewkind4\\pard\\f0\\fs20 Let op: wapening keuren\\par}');
/** Alleen een geplakte afbeelding (Word/RichEdit-vorm) en alleen Unicode-tekst (`\\uN`). */
const PICTURE_NOTE = latin1('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\pard{\\*\\shppict{\\pict\\pngblip 89504e47}}{\\nonshppict{\\pict\\wmetafile8 0100}}\\par}');
const UNICODE_NOTE = latin1('{\\rtf1\\ansi\\uc0\\u9629\\u20013\\par}');
const EMPTY_NOTE = latin1('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\*\\generator Riched20;}\\viewkind4\\pard\\f0\\fs20\\par}');

/** Knownbug 159: de backslashes zijn ge-escapete tekst in verborgen metadata, geen afbeeldingen. */
const METADATA_NOTE = latin1(String.raw`{\rtf1\ansi{\info{\title \\pict}{\comment {\\object}}}\par}`);
const OBJECT_NOTE = latin1('{\\rtf1\\ansi{\r\n\\object\\objemb{\\*\\objclass Package}{\\*\\objdata 0100}}\\par}');
const BINARY_PICTURE_NOTE = latin1(String.raw`{\rtf1{\*\private\bin1 {}{\pict\pngblip 00}}`);

const LOSSY: Fixture = {
  tasks: [
    { uid: 10, name: 'Fundering', fixedCost: 250, vars: {
      15: NOTE, // NOTES
      215: hyperlink('Tekening', 'https://example.org/fundering.pdf'), // HYPERLINK_DATA
      43: mppTimestampBytes(4800, START_DAYS), // baseline 0 (BASELINE_ESTIMATED_START)
      483: mppTimestampBytes(10200, START_DAYS + 2), // baseline 1 (BASELINE1_ESTIMATED_FINISH)
      51: utf16('Kavel 3', true), // TEXT1
    } },
    // SUBPROJECT_TASKS_UNIQUEID_OFFSET; alleen baselinewerk in baseline 2 (BASELINE2_WORK).
    { uid: 11, name: 'Deelproject installaties', vars: { 458: int32(1000), 496: double(48000) } },
    // SUBPROJECT_TASK_ID; een aantekening met alleen een afbeelding.
    { uid: 12, name: 'Oplevering (extern)', vars: { 255: int32(7), 15: PICTURE_NOTE } },
  ],
  resourceVars: {
    20: NOTE, // NOTES
    136: hyperlink('Cv', 'https://example.org/cv'), // HYPERLINK_DATA
    62: rateTable(55), // COST_RATE_B
    8: utf16('Ploeg A', true), // TEXT1
  },
  assignments: [
    // NOTES, TEXT1, en alleen baselinekosten in baseline 3 (BASELINE3_COST).
    { uid: 1, vars: { 71: NOTE, 88: utf16('Ploeg A', true), 308: double(500) } },
    // Verwijderd: de lezer slaat hem over, dus het verslag ook (NOTES, TEXT2).
    { uid: 2, deleted: true, vars: { 71: NOTE, 89: utf16('Ploeg B', true) } },
  ],
  criticalSlackLimit: 3,
};

const CLEAN: Fixture = {
  tasks: [
    { uid: 10, name: 'Fundering', fixedCost: 0, vars: { 15: EMPTY_NOTE, 1: double(0), 6: double(0), 43: NA_TIMESTAMP, 44: NA_TIMESTAMP, 51: utf16('', true), 87: double(0), 458: int32(0), 255: int32(0) } },
    { uid: 11, name: 'Metselwerk' },
  ],
  resourceVars: { 20: EMPTY_NOTE, 62: rateTable(0) },
  assignments: [{ uid: 1, vars: { 71: EMPTY_NOTE, 16: double(0), 32: double(0), 146: NA_TIMESTAMP } }],
  criticalSlackLimit: 0,
};

async function open(name: string, bytes: Uint8Array): Promise<OpenedImport> {
  const parsed = await parseOpenedFile({ name, bytes });
  S().newProject();
  useAppStore.setState(st => { st.ui.notifications = []; });
  S().applyOpenedImport(parsed, { filePath: null, recompute: true, fit: false, hourDataNotice: false, linkedOpen: true });
  return parsed;
}
const resultsOf = (parsed: OpenedImport) => isMultiDocumentImport(parsed) ? parsed.results : [parsed];

/** Dezelfde blokken op echte taak-, resource- en toewijzingsrecords. De eerste notitie staat in
 *  alle drie storages op offset 12, na een 4-byte lengte + vier UTF-16-tekens. */
function noteFixture(
  taskNotes: readonly (Uint8Array | null)[],
  resourceNotes = taskNotes,
  assignmentNotes = taskNotes,
): Fixture {
  return {
    tasks: taskNotes.map<FixtureTask>((note, i) => ({ uid: 10 + i, name: 'Taak', vars: note ? { 15: note } : {} })),
    resourceVars: {},
    resources: resourceNotes.map<FixtureResource>((note, i) => ({ uid: 1 + i, name: 'Mens', vars: note ? { 20: note } : {} })),
    assignments: assignmentNotes.map<FixtureAssignment>((note, i) => ({
      uid: 1 + i, vars: { 1: utf16('Slot'), ...(note ? { 71: note } : {}) },
    })),
  };
}

/** Observeer echte bytelezingen via de bestaande Var2Data-grens, zonder productiehaak of klok.
 *  Eén proxy per byteview bewaart de identiteit van de gedeelde datablokken. */
function readWithNoteReads(bytes: Uint8Array) {
  const notes: { type: number; length: number; byteReads: number }[] = [];
  const views = new Map<Uint8Array, Uint8Array>();
  const original = Var2Data.prototype.getByteArray;
  Var2Data.prototype.getByteArray = function (this: Var2Data, uid: number, type: number): Uint8Array | null {
    const raw = original.call(this, uid, type);
    if (!raw || ![15, 20, 71].includes(type)) return raw;
    let view = views.get(raw);
    if (!view) {
      const note = { type, length: raw.length, byteReads: 0 };
      notes.push(note);
      view = new Proxy(raw, {
        get(target, key) {
          if (typeof key === 'string' && /^\d+$/.test(key)) note.byteReads++;
          return Reflect.get(target, key, target);
        },
      });
      views.set(raw, view);
    }
    return view;
  };
  try {
    return { result: readMPP(bytes), notes };
  } finally {
    Var2Data.prototype.getByteArray = original;
  }
}

async function main(): Promise<void> {
  // (1) RTF-aantekening: zichtbare tekst en echte afbeeldingen/objecten tellen.
  eq('1a aantekening met tekst', rtfHasVisibleText(NOTE), true);
  eq('1b aantekening zonder tekst (alleen opmaak)', rtfHasVisibleText(EMPTY_NOTE), false);
  eq('1c escape telt als tekst', rtfHasVisibleText(latin1('{\\rtf1\\ansi \\\'e9\\par}')), true);
  eq('1d alleen een afbeelding telt als inhoud', rtfHasVisibleText(PICTURE_NOTE), true);
  eq('1e alleen Unicode-tekst telt als tekst', rtfHasVisibleText(UNICODE_NOTE), true);

  // Knownbug 159: groepsbestemmingen herkennen zonder escaped tekst of metadata als inhoud te tellen.
  eq('1f escaped pict/object in metadata', rtfHasVisibleText(METADATA_NOTE), false);
  eq('1g object met CR/LF vóór bestemming', rtfHasVisibleText(OBJECT_NOTE), true);
  eq('1h afbeelding na binaire accolade in verborgen groep', rtfHasVisibleText(BINARY_PICTURE_NOTE), true);
  const noteCases: readonly [string, string, boolean][] = [
    ['oorspronkelijke title-repro', String.raw`{\rtf1{\info{\title \\pict}}\par}`, false],
    ['escaped object in titel', String.raw`{\rtf1{\info{\title \\object}}\par}`, false],
    ['geneste metadata en generator', String.raw`{\rtf1{\info{\title {\\pict}{\\object}}}{\*\generator \\pict \\object;}\par}`, false],
    ['echte groepen binnen metadata blijven verborgen', String.raw`{\rtf1{\info{\title {\*\shppict{\pict\pngblip 00}}}{\comment {\object\objemb}}}\par}`, false],
    ['onbekende destination blijft verborgen', String.raw`{\rtf1{\*\private{\pict\pngblip 00}{\object\objemb}}\par}`, false],
    ['langere controlwoorden zijn geen pict/object', String.raw`{\rtf1{\picture}{\objectives}\par}`, false],
    ['lege afbeeldingswrappers', String.raw`{\rtf1{\*\shppict}{\nonshppict}\par}`, false],
    ['losse afbeelding zonder tekst', String.raw`{\rtf1{\pict\pngblip 00}\par}`, true],
    ['alleen shppict zonder fallback', String.raw`{\rtf1{\*\shppict{\pict\pngblip 00}}\par}`, true],
    ['alleen nonshppict', String.raw`{\rtf1{\nonshppict{\pict\wmetafile8 00}}\par}`, true],
    ['ster bij echte pict-bestemming', String.raw`{\rtf1{\*\pict\pngblip 00}\par}`, true],
    ['ster bij echte object-bestemming', String.raw`{\rtf1{\*\object\objemb{\*\objdata 00}}\par}`, true],
    ['afbeelding na metadata', String.raw`{\rtf1{\info{\title \\pict}}{\*\shppict{\pict\pngblip 00}}\par}`, true],
    ['zichtbare tekst na metadata', String.raw`{\rtf1{\info{\title \\object}}Let op: wapening keuren\par}`, true],
    ['zichtbare letterlijke controlwoorden en accolades', String.raw`{\rtf1{\info{\title \\pict}}\\pict \\object \{tekst\}\par}`, true],
    ['binaire sluitaccolade maakt verborgen tekst niet zichtbaar', String.raw`{\rtf1{\*\private\bin1 }verborgen}}`, false],
    ['binaire backslash verbergt geen zichtbare tekst', String.raw`{\rtf1{\*\private\bin1 \}Zichtbaar\par}`, true],
    ['binaire payload is geen pict-groep', String.raw`{\rtf1\bin7 {\pict}\par}`, false],
    ['nulbytes in binaire payload verbergen geen afbeelding', String.raw`{\rtf1{\*\private\bin1 ${'\0'}}{\pict\pngblip 00}}`, true],
    ['CR/LF tellen mee in binaire payload', String.raw`{\rtf1{\*\private\bin2 ${'\r\n'}}{\pict\pngblip 00}}`, true],
    ['afgekapt bin-blok blijft ruwe payload', String.raw`{\rtf1\bin100 {\pict}}`, false],
    ['lege binaire payload verbergt geen afbeelding', String.raw`{\rtf1{\*\private\bin0 }{\pict\pngblip 00}}`, true],
    ['CR vóór object', String.raw`{\rtf1{${'\r'}\object\objemb{\*\objdata 00}}}`, true],
    ['LF vóór object', String.raw`{\rtf1{${'\n'}\object\objemb{\*\objdata 00}}}`, true],
    ['CR/LF vóór metadata en object blijft verborgen', String.raw`{\rtf1{${'\r\n'}\info{\title {${'\r\n'}\object\objemb{\*\objdata 00}}}}}`, false],
    ['CR/LF rondom ster en afbeeldingsbestemming', String.raw`{\rtf1{${'\r\n'}\*${'\r\n'}\shppict{${'\r\n'}\pict\pngblip 00}}}`, true],
    ['CR/LF vóór RTF-header en verborgen metadata', String.raw`{${'\r\n'}\rtf1{\info{\title \\pict}}}`, false],
    ['RTF-terminator buiten binaire payload', String.raw`{\rtf1\par}${'\0'}{\pict\pngblip 00}`, false],
    ['niet-RTF-terminator blijft gelden', '\0tekst na terminator', false],
    ['platte tekst met controlwoordnamen', String.raw`Controleer \pict en \object in de handleiding.`, true],
    ['lege niet-RTF-tekst', ' \t\r\n', false],
    ['alleen RTF-opmaak', String.raw`{\rtf1{\fonttbl{\f0 Arial;}}\pard\f0\par}`, false],
    ['Unicode blijft zichtbaar', String.raw`{\rtf1\uc0\u9629\u20013\par}`, true],
    ['8-bit escape blijft zichtbaar', String.raw`{\rtf1\ansi \'e9\par}`, true],
    ['leeg bronblok', '', false],
  ];
  for (const [label, text, want] of noteCases) eq(`1i ${label}`, rtfHasVisibleText(latin1(text)), want);

  // Knownbug 157: alle tokenizergevallen uit #505 ook via gedeelde VarMeta-offsets inlezen.
  const repeatedCases = noteCases.flatMap(([, text]) => {
    const block = latin1(text);
    return [block, block];
  });
  const sharedCases = readWithNoteReads(buildMpp(noteFixture(repeatedCases)));
  eq('1j gedeelde tokenizergevallen tellen per entiteit', sharedCases.result.msProjectReport?.notes,
    noteCases.filter(([, , content]) => content).length * 2 * 3);
  eq('1j één datablok per geval per storage', sharedCases.notes.length, noteCases.length * 3);
  eq('1j alle notitiebytes eenmaal gelezen, ook bij false',
    sharedCases.notes.every(note => note.byteReads === note.length), true);

  // Lange zichtbare tekst én lange verborgen metadata: veel verwijzingen, drie bronblokken.
  // De tweede import hergebruikt offsets met andere inhoud; geen resultaat uit het vorige document.
  const longNotes: readonly [string, Uint8Array, boolean][] = [
    ['tekst', latin1(String.raw`{\rtf1 ${'x'.repeat(64 * 1024)}\par}`), true],
    ['metadata', latin1(String.raw`{\rtf1{\info{\title ${'x'.repeat(64 * 1024)}}}\par}`), false],
  ];
  for (const [label, block, content] of longNotes) {
    const shared = readWithNoteReads(buildMpp(noteFixture(Array<Uint8Array>(12).fill(block))));
    eq(`1k ${label}: alle entiteiten blijven ingelezen`,
      [shared.result.tasks.length, shared.result.resources.length, shared.result.assignments.length], [12, 12, 12]);
    eq(`1k ${label}: verlies per entiteit`, shared.result.msProjectReport?.notes ?? 0, content ? 36 : 0);
    eq(`1k ${label}: drie gedeelde blokken eenmaal gedecodeerd`,
      shared.notes.map(note => [note.type, note.byteReads]), [[15, block.length], [20, block.length], [71, block.length]]);
  }

  // Gelijke offsets in verschillende storages hebben andere inhoud. Binnen één storage blijven
  // ontbrekende notities, andere offsets en aparte blokken met gelijke inhoud onafhankelijk.
  const mixed = noteFixture(
    [METADATA_NOTE, NOTE, NOTE, NOTE.slice(), null],
    [BINARY_PICTURE_NOTE, METADATA_NOTE, BINARY_PICTURE_NOTE],
    [OBJECT_NOTE, METADATA_NOTE, OBJECT_NOTE],
  );
  // Hetzelfde blok mag ook een ander veld bedienen; die interpretatie hoort niet in de notitiecache.
  mixed.tasks[0].vars = { ...mixed.tasks[0].vars, 51: NOTE };
  mixed.assignments.push({ uid: 4, deleted: true, vars: { 71: NOTE.slice() } });
  const mixedBytes = buildMpp(mixed);
  for (let pass = 1; pass <= 2; pass++) {
    const imported = readWithNoteReads(mixedBytes);
    eq(`1l ${pass}: verlies per entiteit, verwijderd record telt niet`, imported.result.msProjectReport?.notes, 7);
    eq(`1l ${pass}: eigen veld blijft apart geteld`, imported.result.msProjectReport?.customFields, 1);
    eq(`1l ${pass}: zeven verschillende notitieblokken`, imported.notes.length, 7);
    eq(`1l ${pass}: ieder blok eenmaal gelezen`, imported.notes.every(note => note.byteReads === note.length), true);
    eq(`1l ${pass}: zichtbare taaktekst blijft gelijk`, imported.result.tasks.map(task => [task.name, task.description]),
      Array.from({ length: 5 }, () => ['Taak', '']));
    eq(`1l ${pass}: zichtbare resourcetekst blijft gelijk`, imported.result.resources.map(resource => [resource.name, resource.description]),
      Array.from({ length: 3 }, () => ['Mens', '']));
    eq(`1l ${pass}: drie actieve toewijzingen`, imported.result.assignments.length, 3);
  }

  // (2) Elke categorie: de telling uit de lezer.
  let parsed = await open('verslag.mpp', buildMpp(LOSSY));
  const result = activeImportResult(parsed);
  eq('2a2 één toewijzing ingelezen (de verwijderde niet)', result.assignments.length, 1);
  eq('2a drie taken ingelezen', result.tasks.map(t => t.name), ['Fundering', 'Deelproject installaties', 'Oplevering (extern)']);
  eq('2b verslag', result.msProjectReport, {
    format: 'mpp', baselines: 4, baselineWorkCost: 0, assignmentBaselineDates: 0, customFields: 3, notes: 4, hyperlinks: 2, fixedCosts: 1, resourceRates: 1,
    subprojects: 1, externalTasks: 1, manualTasks: 0, levelingDelays: 0, inactiveTasks: 0, criticalSlackLimitDays: 3,
  });
  // De lezer neemt geen aantekening, baseline of kritiek-drempel over (het verslag klopt dus).
  eq('2c taakaantekening niet overgenomen', result.tasks[0]?.description ?? '', '');
  eq('2d geen baseline overgenomen', result.baselines ?? [], []);
  eq('2e kritiek-drempel niet als projectinstelling', result.project.schedulingOptions?.criticalDefinition?.threshold ?? 0, 0);

  // (3) Eén melding, met per categorie een regel; de rekenprofielregel van .mpp staat erboven.
  const notices = S().ui.notifications.filter(n => n.messageKey === 'notifications.msProjectImportLoss');
  eq('3a één verslag', notices.length, 1);
  const notice = notices[0];
  eq('3b regels', notice?.detailLines?.filter(l => l.messageKey !== 'notifications.importDatesAsRecorded')
    .map(l => [l.messageKey, l.params?.count]), [
    ['notifications.schedulingProfileApplied', undefined],
    ['notifications.msProjectLostSubprojects', 1],
    ['notifications.msProjectLostExternalTasks', 1],
    ['notifications.msProjectLostCriticalSlack', 3],
    ['notifications.msProjectLostBaselines', 4],
    ['notifications.msProjectLostCustomFields', 3],
    ['notifications.msProjectLostNotes', 4],
    ['notifications.msProjectLostHyperlinks', 2],
    ['notifications.msProjectLostFixedCosts', 1],
    ['notifications.msProjectLostResourceRates', 1],
  ]);
  eq('3c info, blijft staan, gids', [notice?.severity, notice?.sticky, notice?.helpArticleId], ['info', true, 'howto-mpp-openen']);
  eq('3d geen tweede melding met hetzelfde verslag', S().ui.notifications.filter(n => n.messageKey.startsWith('notifications.msProject')).length, 1);

  // (4) Schoon bestand: geen verslag, geen melding.
  parsed = await open('schoon.mpp', buildMpp(CLEAN));
  eq('4a geen verslag', activeImportResult(parsed).msProjectReport, undefined);
  eq('4b geen melding', msProjectImportNotice(resultsOf(parsed)), undefined);
  eq('4c geen verslag in de store', S().ui.notifications.some(n => n.messageKey === 'notifications.msProjectImportLoss'), false);
  parsed = await open('minimaal.mpp', minimalMpp14Bytes({ startDays: 11328, finishDays: 11330, projectStartDays: 11328 }));
  eq('4d minimaal bestand: geen verslag', activeImportResult(parsed).msProjectReport, undefined);

  // (4e) Alleen verborgen metadata op taak, resource en toewijzing: geen verliesmelding.
  const metadataOnly: Fixture = {
    tasks: [{ uid: 10, name: 'Fundering', vars: { 15: METADATA_NOTE } }],
    resourceVars: { 20: METADATA_NOTE },
    assignments: [{ uid: 1, vars: { 71: METADATA_NOTE } }],
  };
  parsed = await open('metadata.mpp', buildMpp(metadataOnly));
  eq('4e1 metadata: geen verslag', activeImportResult(parsed).msProjectReport, undefined);
  eq('4e2 metadata: geen melding', msProjectImportNotice(resultsOf(parsed)), undefined);
  eq('4e3 metadata: geen melding in de store', S().ui.notifications.some(n => n.messageKey === 'notifications.msProjectImportLoss'), false);

  // (4f) Gedeelde tokenizer voor taak/resource/toewijzing: zichtbare tekst, bin-grenzen en CR/LF.
  parsed = await open('inhoud.mpp', buildMpp({
    ...metadataOnly,
    tasks: [...metadataOnly.tasks, { uid: 11, name: 'Metselwerk', vars: { 15: NOTE } }],
    resourceVars: { 20: BINARY_PICTURE_NOTE },
    assignments: [{ uid: 1, vars: { 71: OBJECT_NOTE } }],
  }));
  const contentResult = activeImportResult(parsed);
  eq('4f1 drie aantekeningen met inhoud', contentResult.msProjectReport?.notes, 3);
  const contentNotices = S().ui.notifications.filter(n => n.messageKey === 'notifications.msProjectImportLoss');
  eq('4f2 één verliesmelding', contentNotices.length, 1);
  eq('4f3 juiste aantekeningentelling in melding', contentNotices[0]?.detailLines
    ?.filter(l => l.messageKey === 'notifications.msProjectLostNotes').map(l => l.params?.count), [3]);
  eq('4f4 import blijft twee taken en één toewijzing lezen',
    [contentResult.tasks.length, contentResult.assignments.length], [2, 1]);
  eq('4f5 de lezer neemt nog steeds geen aantekeningen over', contentResult.tasks.map(t => t.description ?? ''), ['', '']);

  // (4g) De cache verandert de melding niet: twee verwijzingen per storage blijven zes verliezen.
  parsed = await open('gedeelde-notities.mpp', buildMpp(noteFixture([NOTE, NOTE])));
  eq('4g1 gedeelde notities tellen per entiteit', activeImportResult(parsed).msProjectReport?.notes, 6);
  eq('4g2 één melding met zes verloren notities', S().ui.notifications
    .filter(n => n.messageKey === 'notifications.msProjectImportLoss')
    .map(n => n.detailLines?.filter(line => line.messageKey === 'notifications.msProjectLostNotes').map(line => line.params?.count)), [[6]]);

  // (5) De sleutels bestaan in nl en en (geen lege toast).
  for (const loc of ['nl', 'en']) {
    const json = JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${loc}/common.json`, import.meta.url), 'utf8')) as { notifications: Record<string, string> };
    const keys = ['msProjectImportLoss', ...['Baselines', 'BaselineWorkCost', 'ExtraBaselines', 'CustomFields', 'Notes', 'Hyperlinks', 'FixedCosts', 'ResourceRates',
      'Subprojects', 'ExternalTasks', 'ManualTasks', 'LevelingDelays', 'InactiveTasks', 'CriticalSlack']
      .flatMap(c => [`msProjectLost${c}_one`, `msProjectLost${c}_other`])];
    for (const key of keys) eq(`5 ${loc}: ${key}`, typeof json.notifications[key], 'string');
  }
}

main().then(() => {
  if (fails.length > 0) {
    for (const f of fails) console.log(`XX  mpp-open-notice: ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`OK  mpp-open-notice: ${checks} controles groen`);
  }
}, (e: unknown) => {
  console.log(`XX  mpp-open-notice: uitzondering ${(e as Error).stack}`);
  process.exitCode = 1;
});
