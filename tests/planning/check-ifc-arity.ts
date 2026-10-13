// IFC-ARITEIT (issue #292). STEP is positioneel: een argument te veel of te weinig schuift elk volgend
// attribuut één plek op, en ons eigen leesprogramma merkt dat niet, want dat leest dezelfde verkeerde
// plekken terug. Zo schreef de writer jarenlang IfcWorkPlan/IfcWorkSchedule met 15 argumenten (schema:
// 14), IfcWorkCalendar met 8 (schema: 9) en de vijf resource-entiteiten met 9 (schema: 11). IfcOpenShell
// las daardoor een lege StartTime, een einddatum in PredefinedType en de werkweek in Identification.
//
// Deze check schrijft een RIJK project (`fixtures/ifc-arity-rich.ts`: elke entiteit die de writer kan
// schrijven) in elk van de drie schema's en toetst per regel het argumentaantal tegen `ARITY`. Daarnaast:
//   - elk type in `ARITY` komt in het rijke project voor (anders toetst de tabel niets meer), en elk
//     geschreven type staat in `ARITY` (een nieuw type dwingt een nieuwe tabelregel af);
//   - de kop draagt precies het gekozen schema, en `readIFC` zet het terug op `project.ifcSchema`.
//
// HOE `ARITY` IS GEMAAKT. Eenmalig met IfcOpenShell 0.9.0 (Python), zonder Python in CI:
//
//   import ifcopenshell.ifcopenshell_wrapper as w
//   for n in [...]:  # de entiteiten hieronder, in IfcCamelCase
//       counts = {s: len(w.schema_by_name(s).declaration_by_name(n).all_attributes())
//                 for s in ("IFC4", "IFC4X3", "IFC4X3_ADD2")}
//       assert len(set(counts.values())) == 1   # in alle drie gelijk
//       print(f"{n.upper()}: {counts['IFC4X3']},")
//
// `all_attributes()` telt de geërfde attributen mee, precies zoals STEP ze positioneel verwacht. Voeg je
// een entiteit aan de writer toe, draai dan hetzelfde voor die entiteit en zet de regel hieronder bij.
//
// Bewaar de geschreven bestanden met OPS_IFC_ARITY_OUT=<map> (bijvoorbeeld voor een validatie met
// IfcOpenShell `ifcopenshell.validate`). Draait via run.sh. Exit 0 = alles groen.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readFileSchema, readIFC } from '@/services/ifc/ifcReader';
import { DEFAULT_IFC_SCHEMA, IFC_SCHEMAS, type IfcSchemaId, type Project } from '@/types/project';
import { buildRichIfcProject } from './fixtures/ifc-arity-rich';

const ARITY: Readonly<Record<string, number>> = {
  IFCAPPLICATION: 4,
  IFCAXIS2PLACEMENT3D: 3,
  IFCCARTESIANPOINT: 1,
  IFCCONSTRUCTIONEQUIPMENTRESOURCE: 11,
  IFCCONSTRUCTIONMATERIALRESOURCE: 11,
  IFCCREWRESOURCE: 11,
  IFCGEOMETRICREPRESENTATIONCONTEXT: 6,
  IFCLABORRESOURCE: 11,
  IFCLAGTIME: 5,
  IFCORGANIZATION: 5,
  IFCOWNERHISTORY: 8,
  IFCPERSON: 8,
  IFCPERSONANDORGANIZATION: 3,
  IFCPROJECT: 9,
  IFCPROPERTYENUMERATEDVALUE: 4,
  IFCPROPERTYENUMERATION: 3,
  IFCPROPERTYSET: 5,
  IFCPROPERTYSETTEMPLATE: 7,
  IFCPROPERTYSINGLEVALUE: 4,
  IFCRECURRENCEPATTERN: 8,
  IFCRELAGGREGATES: 6,
  IFCRELASSIGNSTOCONTROL: 7,
  IFCRELASSIGNSTOPROCESS: 8,
  IFCRELDECLARES: 6,
  IFCRELDEFINESBYPROPERTIES: 6,
  IFCRELNESTS: 6,
  IFCRELSEQUENCE: 9,
  IFCSIMPLEPROPERTYTEMPLATE: 12,
  IFCSIUNIT: 4,
  IFCSUBCONTRACTRESOURCE: 11,
  IFCTASK: 13,
  IFCTASKTIME: 20,
  IFCTIMEPERIOD: 2,
  IFCUNITASSIGNMENT: 1,
  IFCWORKCALENDAR: 9,
  IFCWORKPLAN: 14,
  IFCWORKSCHEDULE: 14,
  IFCWORKTIME: 6,
};

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BASE_EXAMPLE = join(HERE, '..', '..', 'public', 'examples', 'showcase-verbouwing-eengezinswoning.ifc');

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

const base = readIFC(readFileSync(BASE_EXAMPLE, 'utf8'));
const rich = buildRichIfcProject(base);
const outDir = process.env.OPS_IFC_ARITY_OUT;
if (outDir) mkdirSync(outDir, { recursive: true });

const seenTypes = new Set<string>();
for (const schema of IFC_SCHEMAS) {
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
      wrong.set(e.type, { got: e.args, line: '(type staat niet in ARITY — zet de regel erbij, zie de kop)' });
    } else if (e.args !== want && !wrong.has(e.type)) {
      wrong.set(e.type, { got: e.args, line: e.line.slice(0, 160) });
    }
  }
  for (const [type, w] of wrong) ok(`2 ${schema}: ${type} heeft ${w.got} argumenten, schema ${ARITY[type] ?? '?'} — ${w.line}`, false);
  ok(`2 ${schema}: er zijn entiteiten gelezen`, entities(ifc).length > 100);
}

// (3) Dekking: elk type uit de tabel komt in het rijke project voor.
const unseen = Object.keys(ARITY).filter(t => !seenTypes.has(t));
eq('3 elk type uit ARITY komt in het rijke project voor', unseen, []);

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
