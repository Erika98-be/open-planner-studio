// IFC-ARITEIT (issue #292). STEP is positioneel: een argument te veel of te weinig schuift elk volgend
// attribuut één plek op, en ons eigen leesprogramma merkt dat niet, want dat leest dezelfde verkeerde
// plekken terug. Zo schreef de writer jarenlang IfcWorkPlan/IfcWorkSchedule met 15 argumenten (schema:
// 14), IfcWorkCalendar met 8 (schema: 9) en de vijf resource-entiteiten met 9 (schema: 11). IfcOpenShell
// las daardoor een lege StartTime, een einddatum in PredefinedType en de werkweek in Identification.
//
// Deze check schrijft het RIJKE project (`ifcSchemaFixture.ts`, dezelfde fixture als de schemapoort) in
// elk van de drie schema's en toetst per regel het argumentaantal tegen `arity(schema)`. Daarnaast:
//   - elk type uit de tabel komt in het rijke project voor (anders toetst de tabel niets meer), en elk
//     geschreven type staat in de tabel (een nieuw type dwingt een nieuwe tabelregel af);
//   - de kop draagt precies het gekozen schema, en `readIFC` zet het terug op `project.ifcSchema`.
//
// DE AANTALLEN komen uit de gegenereerde schematabel (`ifcSchemaTable.ts`, door
// `scripts/ifc-schema-table.py` uit de EXPRESS-schema's afgeleid): het aantal attributen per entiteit,
// inclusief de geërfde, precies zoals STEP ze positioneel verwacht. Een eigen handgeschreven tabel is er
// niet meer; een nieuwe entiteit in de writer zet je in `OPS_ENTITIES` van dat script.
//
// Bewaar de geschreven bestanden met OPS_IFC_ARITY_OUT=<map> (bijvoorbeeld voor een validatie met
// IfcOpenShell `ifcopenshell.validate`). Draait via run.sh. Exit 0 = alles groen.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readFileSchema, readIFC } from '@/services/ifc/ifcReader';
import { DEFAULT_IFC_SCHEMA, IFC_SCHEMAS, type IfcSchemaId, type Project } from '@/types/project';
import { IFC_SCHEMA_TABLES } from './ifcSchemaTable';
import { buildRichSchemaProject } from './ifcSchemaFixture';

/** Argumentaantal per entiteit in `schema`, uit de gegenereerde tabel. */
function arity(schema: IfcSchemaId): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(IFC_SCHEMA_TABLES[schema].attributes).map(([type, attrs]) => [type, attrs.length]));
}

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');

let checks = 0;
const diffs: string[] = [];
function ok(label: string, cond: boolean): void {
  checks++;
  if (!cond) diffs.push(label);
}
function eq(label: string, got: unknown, want: unknown): void {
  ok(`${label} (kreeg ${JSON.stringify(got)}, verwacht ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want));
}

/** Aantal argumenten op topniveau van `inner` (de tekst tussen de buitenste haakjes). Quote-bewust:
 *  een `''` binnen een string wisselt twee keer en laat de stand dus gelijk. */
function countArgs(inner: string): number {
  if (inner.trim() === '') return 0;
  let depth = 0;
  let quoted = false;
  let count = 1;
  for (const ch of inner) {
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === '(') depth++;
    else if (!quoted && ch === ')') depth--;
    else if (!quoted && depth === 0 && ch === ',') count++;
  }
  return count;
}

/** Alle entiteitregels uit de datasectie: type + argumentaantal. De writer zet één entiteit per regel. */
function entities(ifc: string): { type: string; args: number; line: string }[] {
  const data = ifc.slice(ifc.indexOf('\nDATA;') + 1);
  const out: { type: string; args: number; line: string }[] = [];
  for (const line of data.split('\n')) {
    const m = /^#\d+=([A-Z0-9]+)\((.*)\);$/.exec(line);
    if (m) out.push({ type: m[1], args: countArgs(m[2]), line });
  }
  return out;
}

const rich = buildRichSchemaProject(ROOT);
const outDir = process.env.OPS_IFC_ARITY_OUT;
if (outDir) mkdirSync(outDir, { recursive: true });

const seenTypes = new Set<string>();
for (const schema of IFC_SCHEMAS) {
  const ARITY = arity(schema);
  const ifc = writeIFC({ ...rich, project: { ...rich.project, ifcSchema: schema } });
  if (outDir) writeFileSync(join(outDir, `rijk-${schema}.ifc`), ifc, 'utf8');

  // (1) De kop draagt precies het gekozen schema, en het leest terug.
  eq(`1a ${schema}: één FILE_SCHEMA-regel met dit schema`,
    ifc.split('\n').filter(l => l.startsWith('FILE_SCHEMA(')), [`FILE_SCHEMA(('${schema}'));`]);
  eq(`1b ${schema}: readFileSchema`, readFileSchema(ifc), schema);
  eq(`1c ${schema}: readIFC zet project.ifcSchema`, readIFC(ifc).project.ifcSchema, schema);

  // (2) Elke entiteit heeft het argumentaantal van het schema.
  const wrong = new Map<string, { got: number; line: string }>();
  for (const e of entities(ifc)) {
    seenTypes.add(e.type);
    const want = ARITY[e.type];
    if (want === undefined) {
      wrong.set(e.type, { got: e.args, line: '(type staat niet in de schematabel — zie de kop)' });
    } else if (e.args !== want && !wrong.has(e.type)) {
      wrong.set(e.type, { got: e.args, line: e.line.slice(0, 160) });
    }
  }
  for (const [type, w] of wrong) ok(`2 ${schema}: ${type} heeft ${w.got} argumenten, schema ${ARITY[type] ?? '?'} — ${w.line}`, false);
  // (3) Dekking: elk type uit de tabel komt in het rijke project voor.
  const types = new Set(entities(ifc).map(e => e.type));
  eq(`3 ${schema}: elk type uit de schematabel komt in het rijke project voor`, Object.keys(ARITY).filter(t => !types.has(t)), []);
  ok(`2 ${schema}: er zijn entiteiten gelezen`, entities(ifc).length > 100);
}

// (4) Standaard en onbekende waarde: afwezig ⇒ IFC4X3_ADD2 (besluit eigenaar 2026-10-13), een vrije
// tekst komt nooit in de kop.
{
  eq('4 de standaard is IFC4X3_ADD2', DEFAULT_IFC_SCHEMA, 'IFC4X3_ADD2');
  const { ifcSchema: _drop, ...withoutSchema } = rich.project;
  void _drop;
  const plain = writeIFC({ ...rich, project: withoutSchema as Project });
  eq('4a afwezig ifcSchema ⇒ de standaard in de kop', readFileSchema(plain), DEFAULT_IFC_SCHEMA);
  const bogus = writeIFC({ ...rich, project: { ...rich.project, ifcSchema: 'IFC2X3' as unknown as IfcSchemaId } });
  ok('4b onbekende waarde ⇒ de standaard in de kop, nooit de vrije tekst',
    bogus.includes(`FILE_SCHEMA(('${DEFAULT_IFC_SCHEMA}'));`) && !bogus.includes('IFC2X3'));
}

// (5) Lezen van de kop: alleen de drie, quote-bewust, en een ander schema laat het veld weg.
{
  const plain = writeIFC({ ...rich, project: { ...rich.project, ifcSchema: 'IFC4' } });
  const swap = (s: string) => plain.replace("FILE_SCHEMA(('IFC4'));", s);
  eq('5a IFC2X3 in de kop ⇒ project.ifcSchema afwezig', readIFC(swap("FILE_SCHEMA(('IFC2X3'));")).project.ifcSchema, undefined);
  eq('5b IFC4X3_ADD1 in de kop ⇒ afwezig', readIFC(swap("FILE_SCHEMA(('IFC4X3_ADD1'));")).project.ifcSchema, undefined);
  eq('5c kleine letters en spaties ⇒ toch herkend', readFileSchema(swap("FILE_SCHEMA (( 'ifc4x3_add2' ));")), 'IFC4X3_ADD2');
  // De tekst FILE_SCHEMA binnen de FILE_NAME-string (bijvoorbeeld uit een bestandsnaam) telt niet.
  const add2 = writeIFC({ ...rich, project: { ...rich.project, ifcSchema: 'IFC4X3_ADD2' } });
  const named = add2.replace("FILE_NAME('", "FILE_NAME('FILE_SCHEMA((''IFC4'')) ");
  ok('5d controle: de nep-tekst staat in FILE_NAME', named !== add2 && named.includes("FILE_SCHEMA((''IFC4''))"));
  eq('5d FILE_SCHEMA-tekst in een string van de kop telt niet', readFileSchema(named), 'IFC4X3_ADD2');
}

if (diffs.length === 0) {
  console.log(`OK  ifc-arity: alle checks groen (${checks}; ${seenTypes.size} entiteittypen in ${IFC_SCHEMAS.length} schema's)`);
  process.exit(0);
} else {
  console.log(`XX  ifc-arity: ${diffs.length} afwijking(en) van ${checks}`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
