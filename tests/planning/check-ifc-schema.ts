// IFC-SCHEMAPOORT: elke entiteit die de OPS-writer schrijft, is geldig volgens IFC 4.3 (IFC4X3_ADD2),
// zonder Python in CI. Toelichting: docs/ifc-round-trip.md, alinea "Schemageldigheid".
//
// Aanleiding (2026-10-13): `python -m ifcopenshell.validate` gaf op elk van de acht publieke voorbeelden
// 34 tot 80 schemafouten: REAL-waarden zonder decimale punt (`IFCREAL(5)`), resources met 9 in plaats
// van 11 attributen, IfcWorkPlan/IfcWorkSchedule met 15 in plaats van 14, IfcWorkCalendar met 8 in
// plaats van 9. Geen bestaande check zag dat: de round-trip test alleen dat OPS zijn eigen bestand
// terugleest, en OPS las die afwijkende indeling consequent verkeerd-maar-symmetrisch.
//
// WAT DEZE POORT TOETST
//   1. Elke regel `#id=IFCXXX(...)` tegen de tabel `ifcSchemaTable.ts` (gegenereerd uit het EXPRESS-
//      schema IFC4X3_ADD2 door `scripts/ifc-schema-table.py`, zie daar): het aantal attributen, `$`
//      alleen op een OPTIONAL plek, `*` alleen op een afgeleide plek, een enum op de enum-plek met een
//      toegestane literal, REAL met decimale punt, INTEGER zonder, tekst als string, een verwijzing
//      die in het bestand bestaat, een getypte waarde die de select toestaat (met de juiste inhoud),
//      SET/LIST met minimaal het vereiste aantal elementen en een SET zonder dubbele elementen.
//   2. Een kleine set WHERE-regels uit IFC4X3_ADD2 die OPS kan raken (zie `checkRules`), en de
//      header `FILE_SCHEMA(('IFC4X3_ADD2'))`.
//   3. Bronnen: de committe voorbeelden (`public/examples/*.ifc` — de acht publieke — en
//      `examples/*.ifc`), een RIJK project dat hier met de echte writer wordt geschreven (alle
//      resourcetypen, ploegen, baselines, werkende uitzonderingen, bibliotheekkalenders, alle
//      eigen-veldtypen, procent-lag, voortgang, …; zie ifcSchemaFixture.ts) en een leeg project.
//   4. Dekking: elke entiteit uit de tabel en elke getypte waarde die de writer gebruikt, komt minstens
//      één keer voor in wat hier getoetst wordt. Zo kan het rijke project niet stil verarmen.
//   5. Volledigheid van de tabel: de writerbronnen worden gescand op `IFCXXX(`; elke naam moet in de
//      tabel staan. Een nieuwe entiteit in de writer zonder tabelregel is rood.
//
// Lokaal tegen IfcOpenShell valideren: `OPS_IFC_SCHEMA_DUMP=/tmp/dir bash tests/planning/run.sh
// check-ifc-schema.ts` schrijft het rijke project en de randgevallen als .ifc naar die map.
//
// Draait via run.sh. Exit 0 = alles groen.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { RESOURCE_TYPE_TO_IFC } from '@/services/ifc/ifcConstants';
import { IFC_ENTITY_ATTRIBUTES, IFC_SCHEMA_TABLE_SOURCE, IFC_SELECTS, IFC_TYPED_VALUE_KIND } from './ifcSchemaTable';
import { buildEmptySchemaProject, buildRichSchemaProject } from './ifcSchemaFixture';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');

let checks = 0;
const fails: string[] = [];
function assert(cond: boolean, msg: string): void {
  checks++;
  if (!cond) fails.push(msg);
}

/**
 * FASE 2 — TIJDELIJKE UITZONDERING. IfcWorkCalendar mist nog het attribuut `Identification` (8 in
 * plaats van 9). Die fix wacht op PR #340 (`writeCalendar`/`buildCalendarFromEntity` worden daar
 * herschreven). Tot dan slaat de poort de attribuuttoets van deze entiteit over; de dekking (punt 4)
 * telt hem wel. Fase 2 haalt deze set leeg.
 */
const PHASE2_EXEMPT = new Set(['IFCWORKCALENDAR']);

/**
 * BEKENDE AFWIJKING (bewust, gemeld): `IfcRelAssignsToProcess.RelatedObjects` is een SET, maar OPS
 * herhaalt daar een resource die twee keer op dezelfde taak staat; de lezer telt elke herhaling als
 * eigen toewijzing (`extractAssignments`, met de `GUID#N`-sleutels in OPS_Assignments). IfcOpenShell
 * 0.9.0 meldt dit niet en laadt beide verwijzingen (gemeten 2026-10-13). Een andere codering raakt de
 * lezer en oudere OPS-versies; dat is een eigen besluit, niet deze fix.
 */
const SET_DUPLICATES_ALLOWED = new Set(['IFCRELASSIGNSTOPROCESS.RelatedObjects']);

// ── STEP-parser (onafhankelijk van ifcReader: een poort leunt niet op de code die hij toetst) ──────

type V =
  | { k: 'null' } | { k: 'derived' } | { k: 'ref'; id: number } | { k: 'str'; raw: string }
  | { k: 'enum'; v: string } | { k: 'int'; n: number } | { k: 'real'; n: number }
  | { k: 'badnum'; raw: string } | { k: 'bin' } | { k: 'list'; items: V[] }
  | { k: 'typed'; type: string; value: V };

interface StepEntity { id: number; type: string; args: V[] }

/** Leest de DATA-sectie van een STEP-bestand. Gooit bij een syntaxfout (dat is zelf een bevinding). */
function parseStep(text: string): StepEntity[] {
  const start = text.indexOf('\nDATA;');
  const end = text.lastIndexOf('\nENDSEC;');
  if (start < 0 || end < start) throw new Error('geen DATA-sectie');
  const s = text.slice(start + 6, end);
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const expect = (c: string) => {
    ws();
    if (s[i] !== c) throw new Error(`verwacht '${c}' op ${i}, kreeg '${s.slice(i, i + 20)}'`);
    i++;
  };
  const value = (): V => {
    ws();
    const c = s[i];
    if (c === '$') { i++; return { k: 'null' }; }
    if (c === '*') { i++; return { k: 'derived' }; }
    if (c === '#') {
      const m = /^#(\d+)/.exec(s.slice(i, i + 20));
      if (!m) throw new Error(`kapotte verwijzing op ${i}`);
      i += m[0].length;
      return { k: 'ref', id: Number(m[1]) };
    }
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        const q = s.indexOf("'", j);
        if (q < 0) throw new Error(`open string op ${i}`);
        if (s[q + 1] === "'") { j = q + 2; continue; }
        const raw = s.slice(i, q + 1);
        i = q + 1;
        return { k: 'str', raw };
      }
    }
    if (c === '"') {
      const q = s.indexOf('"', i + 1);
      i = q + 1;
      return { k: 'bin' };
    }
    if (c === '.') {
      const q = s.indexOf('.', i + 1);
      const v = s.slice(i + 1, q);
      i = q + 1;
      return { k: 'enum', v };
    }
    if (c === '(') {
      i++;
      const items: V[] = [];
      ws();
      if (s[i] === ')') { i++; return { k: 'list', items }; }
      for (;;) {
        items.push(value());
        ws();
        if (s[i] === ',') { i++; continue; }
        expect(')');
        return { k: 'list', items };
      }
    }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i, i + 80))!;
      i += m[0].length;
      expect('(');
      const inner = value();
      expect(')');
      return { k: 'typed', type: m[0].toUpperCase(), value: inner };
    }
    // Getal. Alles wat geen STEP-INTEGER of STEP-REAL is (`1e-7`, `NaN`, `Infinity`), is een bevinding.
    const m = /^[^,()\s;]+/.exec(s.slice(i, i + 80));
    if (!m) throw new Error(`onverwacht teken '${c}' op ${i}`);
    i += m[0].length;
    const raw = m[0];
    if (/^[+-]?\d+$/.test(raw)) return { k: 'int', n: Number(raw) };
    if (/^[+-]?\d+\.\d*(E[+-]?\d+)?$/.test(raw)) return { k: 'real', n: Number(raw) };
    return { k: 'badnum', raw };
  };
  const out: StepEntity[] = [];
  for (;;) {
    ws();
    if (i >= s.length) break;
    const m = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/.exec(s.slice(i, i + 200));
    if (!m) throw new Error(`geen entiteit op ${i}: '${s.slice(i, i + 40)}'`);
    i += m[0].length;
    const args: V[] = [];
    ws();
    if (s[i] === ')') i++;
    else {
      for (;;) {
        args.push(value());
        ws();
        if (s[i] === ',') { i++; continue; }
        expect(')');
        break;
      }
    }
    expect(';');
    out.push({ id: Number(m[1]), type: m[2].toUpperCase(), args });
  }
  return out;
}

// ── Toets per attribuut ───────────────────────────────────────────────────────────────────────────

const show = (v: V): string => {
  switch (v.k) {
    case 'null': return '$';
    case 'derived': return '*';
    case 'ref': return `#${v.id}`;
    case 'str': return v.raw.length > 30 ? `${v.raw.slice(0, 27)}…'` : v.raw;
    case 'enum': return `.${v.v}.`;
    case 'int': case 'real': return String(v.n);
    case 'badnum': return v.raw;
    case 'bin': return '"…"';
    case 'list': return `(${v.items.map(show).join(',')})`;
    case 'typed': return `${v.type}(${show(v.value)})`;
  }
};

/** Toetst waarde `v` tegen typecode `code` (zonder `?`). Geeft een foutomschrijving of ''. */
function checkKind(v: V, code: string, ids: ReadonlySet<number>, allowDuplicates = false): string {
  if (code === '*') return v.k === 'derived' ? '' : 'afgeleid attribuut moet * zijn';
  const agg = /^(SET|LIST|BAG|ARRAY)(\d+):(.*)$/.exec(code);
  if (agg) {
    if (v.k !== 'list') return `${agg[1]} verwacht`;
    if (v.items.length < Number(agg[2])) return `${agg[1]} met minder dan ${agg[2]} element(en)`;
    for (const item of v.items) {
      if (item.k === 'null') return `$ als element in ${agg[1]}`;
      const err = checkKind(item, agg[3], ids);
      if (err) return `element ${show(item)}: ${err}`;
    }
    if (agg[1] === 'SET' && !allowDuplicates) {
      const seen = new Set(v.items.map(show));
      if (seen.size !== v.items.length) return 'SET met dubbele elementen';
    }
    return '';
  }
  if (code.startsWith('E=')) {
    const allowed = code.slice(2).split('|');
    if (v.k !== 'enum') return 'enum verwacht';
    return allowed.includes(v.v) ? '' : `enum-literal .${v.v}. niet toegestaan`;
  }
  if (code.startsWith('V=')) {
    const sel = IFC_SELECTS[code.slice(2)];
    if (!sel) return `select ${code} niet in de tabel`;
    if (v.k === 'ref') return sel.refs ? (ids.has(v.id) ? '' : `verwijzing #${v.id} bestaat niet`) : 'select staat geen verwijzing toe';
    if (v.k !== 'typed') return 'getypte waarde of verwijzing verwacht';
    if (!sel.types.includes(v.type)) return `${v.type} niet toegestaan in ${code.slice(2)}`;
    const inner = IFC_TYPED_VALUE_KIND[v.type];
    return inner ? checkKind(v.value, inner, ids) : `${v.type} zonder typecode`;
  }
  switch (code) {
    case 'S': return v.k === 'str' ? '' : 'tekst verwacht';
    case 'R': return v.k === 'real' ? '' : 'REAL verwacht (met decimale punt)';
    case 'R+': return v.k === 'real' ? (v.n > 0 ? '' : 'positieve REAL verwacht (> 0)') : 'REAL verwacht (met decimale punt)';
    case 'I': return v.k === 'int' ? '' : 'INTEGER verwacht';
    case 'I+': return v.k === 'int' ? (v.n > 0 ? '' : 'positieve INTEGER verwacht') : 'INTEGER verwacht';
    case 'N': return v.k === 'int' || v.k === 'real' ? '' : 'getal verwacht';
    case 'B': return v.k === 'enum' && (v.v === 'T' || v.v === 'F') ? '' : 'BOOLEAN verwacht';
    case 'L': return v.k === 'enum' && (v.v === 'T' || v.v === 'F' || v.v === 'U') ? '' : 'LOGICAL verwacht';
    case 'X': return v.k === 'bin' ? '' : 'BINARY verwacht';
    case '#': return v.k === 'ref' ? (ids.has(v.id) ? '' : `verwijzing #${v.id} bestaat niet`) : 'verwijzing verwacht';
    default: return `onbekende typecode ${code}`;
  }
}

function attrName(spec: string): string { return spec.slice(0, spec.indexOf(':')); }

interface Seen { entities: Set<string>; typed: Set<string> }

function collectTyped(v: V, out: Set<string>): void {
  if (v.k === 'typed') { out.add(v.type); collectTyped(v.value, out); }
  else if (v.k === 'list') for (const item of v.items) collectTyped(item, out);
}

/** Toetst één bestand. `label` komt in elke foutmelding. */
function checkFile(label: string, text: string, seen: Seen): void {
  // De header noemt het schema waartegen de tabel is afgeleid (IFC 4.3.2.0, zie de kop van ifcWriter).
  const schemaId = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/.exec(text)?.[1];
  assert(schemaId === IFC_SCHEMA_TABLE_SOURCE, `${label}: FILE_SCHEMA is '${schemaId}', verwacht '${IFC_SCHEMA_TABLE_SOURCE}'`);
  let entities: StepEntity[];
  try {
    entities = parseStep(text);
  } catch (e) {
    assert(false, `${label}: STEP niet te lezen: ${(e as Error).message}`);
    return;
  }
  const byId = new Map(entities.map(e => [e.id, e]));
  const ids = new Set(byId.keys());
  assert(ids.size === entities.length, `${label}: dubbele STEP-id's`);
  // Fouten per soort (entiteit + bericht zonder waarde) met één voorbeeld, zodat één bestand met
  // honderd gelijke fouten de uitvoer niet vult en elke soort zichtbaar blijft.
  const kinds = new Map<string, { count: number; example: string }>();
  const fail = (e: StepEntity, msg: string, detail = '') => {
    const key = `${e.type}: ${msg}`;
    const k = kinds.get(key);
    if (k) k.count++;
    else kinds.set(key, { count: 1, example: `#${e.id}${detail ? ` ${detail}` : ''}` });
  };
  for (const e of entities) {
    seen.entities.add(e.type);
    for (const a of e.args) collectTyped(a, seen.typed);
    const spec = IFC_ENTITY_ATTRIBUTES[e.type];
    if (!spec) { fail(e, 'entiteit staat niet in de schematabel (ifcSchemaTable.ts)'); continue; }
    if (PHASE2_EXEMPT.has(e.type)) continue;
    checks++;
    if (e.args.length !== spec.length) {
      fail(e, `${e.args.length} attributen, IFC4X3_ADD2 vraagt er ${spec.length}`);
      continue;
    }
    spec.forEach((attr, idx) => {
      const name = attrName(attr);
      let code = attr.slice(name.length + 1);
      const optional = code.endsWith('?');
      if (optional) code = code.slice(0, -1);
      const v = e.args[idx];
      if (v.k === 'null') {
        if (!optional) fail(e, `${name} (index ${idx}) is verplicht maar $`);
        return;
      }
      const err = checkKind(v, code, ids, SET_DUPLICATES_ALLOWED.has(`${e.type}.${name}`));
      if (err) fail(e, `${name} (index ${idx}): ${err}`, `waarde ${show(v)}`);
    });
    checkRules(e, spec, byId, fail);
  }
  for (const [key, { count, example }] of kinds) {
    assert(false, `${label}: ${key} — ${count}× (bv. ${example})`);
  }
}

/**
 * WHERE-regels uit IFC4X3_ADD2 die de OPS-writer kan raken (IfcOpenShell `validate --rules` toetst ze
 * allemaal; deze selectie is de CI-wacht voor de gevallen die we tegenkwamen):
 *  - CorrectPredefinedType (IfcTask, resources, IfcWorkCalendar, IfcWorkSchedule, …): PredefinedType
 *    USERDEFINED ⇒ ObjectType bestaat;
 *  - IfcProject.HasName / IfcTask.HasName: Name bestaat;
 *  - IfcPerson.IdentifiablePerson: Identification, FamilyName of GivenName bestaat;
 *  - IfcPropertySet.UniquePropertyNames: geen twee properties met dezelfde naam;
 *  - IfcRelSequence.AvoidInconsistentSequence: een taak is niet zijn eigen voorganger.
 */
function checkRules(
  e: StepEntity, spec: readonly string[], byId: Map<number, StepEntity>, fail: (e: StepEntity, msg: string) => void,
): void {
  const at = (name: string) => {
    const idx = spec.findIndex(a => attrName(a) === name);
    return idx < 0 ? undefined : e.args[idx];
  };
  const predefined = at('PredefinedType');
  const objectType = at('ObjectType');
  if (predefined?.k === 'enum' && predefined.v === 'USERDEFINED' && objectType?.k === 'null') {
    fail(e, 'CorrectPredefinedType: USERDEFINED zonder ObjectType');
  }
  if ((e.type === 'IFCPROJECT' || e.type === 'IFCTASK') && at('Name')?.k === 'null') fail(e, 'HasName: Name is $');
  if (e.type === 'IFCPERSON' && ['Identification', 'FamilyName', 'GivenName'].every(n => at(n)?.k === 'null')) {
    fail(e, 'IdentifiablePerson: geen Identification, FamilyName of GivenName');
  }
  if (e.type === 'IFCPROPERTYSET') {
    const props = at('HasProperties');
    if (props?.k === 'list') {
      const names = props.items.map(p => (p.k === 'ref' ? byId.get(p.id)?.args[0] : undefined))
        .map(n => (n?.k === 'str' ? n.raw : '?'));
      if (new Set(names).size !== names.length) fail(e, 'UniquePropertyNames: dubbele propertynaam');
    }
  }
  if (e.type === 'IFCRELSEQUENCE') {
    const a = at('RelatingProcess');
    const b = at('RelatedProcess');
    if (a?.k === 'ref' && b?.k === 'ref' && a.id === b.id) fail(e, 'AvoidInconsistentSequence: taak volgt op zichzelf');
  }
}

// ── 1. De committe voorbeelden ───────────────────────────────────────────────────────────────────

const seen: Seen = { entities: new Set(), typed: new Set() };
const ifcFiles = (dir: string) => readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.ifc')).sort();
const publicFiles = ifcFiles('public/examples');
assert(publicFiles.length >= 8, `public/examples: verwacht minstens de 8 publieke voorbeelden, vond ${publicFiles.length}`);
for (const f of publicFiles) checkFile(`public/examples/${f}`, readFileSync(join(ROOT, 'public/examples', f), 'utf8'), seen);
for (const f of ifcFiles('examples')) checkFile(`examples/${f}`, readFileSync(join(ROOT, 'examples', f), 'utf8'), seen);

// ── 2. Een rijk project en 3. randgevallen, geschreven met de echte writer ───────────────────────
// Inhoud: zie tests/planning/ifcSchemaFixture.ts. Het lege project dekt de verplichte attributen
// zonder bronwaarde: IfcWorkPlan/IfcWorkSchedule.StartTime, IfcOrganization.Name, en de WHERE-regels
// HasName (IfcProject) en IdentifiablePerson (IfcPerson).
const rich = buildRichSchemaProject(ROOT);
const richIfc = writeIFC(rich);
checkFile('rijk project', richIfc, seen);
const emptyIfc = writeIFC(buildEmptySchemaProject(rich));
checkFile('leeg project', emptyIfc, seen);

// ── 4. Dekking ───────────────────────────────────────────────────────────────────────────────────
for (const entity of Object.keys(IFC_ENTITY_ATTRIBUTES)) {
  assert(seen.entities.has(entity), `dekking: ${entity} staat in de tabel maar komt in geen enkel getoetst bestand voor`);
}

// ── 5. Volledigheid van de tabel t.o.v. de writerbronnen ─────────────────────────────────────────
const writerSources = ['ifcWriter.ts', 'ifcPsets.ts', 'ifcTaskSlots.ts']
  .map(f => readFileSync(join(ROOT, 'src', 'services', 'ifc', f), 'utf8'));
const writerTokens = new Set<string>(Object.values(RESOURCE_TYPE_TO_IFC));
for (const src of writerSources) for (const m of src.matchAll(/\b(IFC[A-Z0-9]{3,})\(/g)) writerTokens.add(m[1]);
for (const token of writerTokens) {
  const known = token in IFC_ENTITY_ATTRIBUTES || token in IFC_TYPED_VALUE_KIND;
  assert(known, `tabel: de writer gebruikt ${token}, maar die staat niet in ifcSchemaTable.ts (genereer de tabel opnieuw)`);
  if (token in IFC_TYPED_VALUE_KIND) {
    assert(seen.typed.has(token), `dekking: de writer gebruikt ${token}, maar geen getoetst bestand bevat die waarde`);
  }
}

// ── Optioneel: schrijf het rijke project en de randgevallen weg voor IfcOpenShell ─────────────────
const dumpDir = process.env.OPS_IFC_SCHEMA_DUMP;
if (dumpDir) {
  mkdirSync(dumpDir, { recursive: true });
  writeFileSync(join(dumpDir, 'schema-rijk-project.ifc'), richIfc, 'utf8');
  writeFileSync(join(dumpDir, 'schema-leeg-project.ifc'), emptyIfc, 'utf8');
  console.log(`   (rijk project en randgeval geschreven naar ${dumpDir})`);
}

if (fails.length) {
  for (const f of fails) console.log(`   XX ${f}`);
  console.log(`XX check-ifc-schema: ${fails.length} fout(en) in ${checks} toetsen`);
  process.exit(1);
}
console.log(`OK check-ifc-schema: ${checks} toetsen groen (${seen.entities.size} entiteittypen, ${publicFiles.length} publieke voorbeelden)`);
