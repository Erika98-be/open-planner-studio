// IFC-SCHEMAPOORT: elke entiteit die de OPS-writer schrijft, is geldig volgens IFC 4.3 (IFC4X3_ADD2),
// zonder Python in CI. Toelichting en geschiedenis: docs/ifc-round-trip.md, alinea "Schemageldigheid".
//
// WAT DEZE POORT TOETST (de toets per bestand staat in `ifcSchemaCheck.ts`)
//   1. Elke regel `#id=IFCXXX(...)` tegen de tabel `ifcSchemaTable.ts` (gegenereerd uit het EXPRESS-
//      schema IFC4X3_ADD2 door `scripts/ifc-schema-table.py`, zie daar): het aantal attributen, `$`
//      alleen op een OPTIONAL plek, `*` alleen op een afgeleide plek, een enum op de enum-plek met een
//      toegestane literal, REAL met decimale punt, INTEGER zonder, tekst als string, de vorm van
//      GlobalId, IfcDateTime (met seconden), IfcDate, IfcTime en IfcDuration, een verwijzing die bestaat
//      en naar een toegestaan entiteittype wijst, een getypte waarde die de select toestaat (met de
//      juiste inhoud), SET/LIST met minimaal het vereiste aantal elementen en een SET zonder dubbele
//      elementen.
//   2. Een kleine set WHERE-regels uit IFC4X3_ADD2 die OPS kan raken (zie `checkRules`), en de
//      header `FILE_SCHEMA(('IFC4X3_ADD2'))`.
//   3. Bronnen: de committe voorbeelden (`public/examples/*.ifc` — de acht publieke — en
//      `examples/*.ifc`); een RIJK project dat hier met de echte writer wordt geschreven (alle
//      resourcetypen, ploegen, baselines (ook een zonder taken), werkende uitzonderingen,
//      bibliotheekkalenders, alle eigen-veldtypen, procent-lag, voortgang, …), in BEIDE standen van de
//      schakelaar `IFC_WORK_CALENDAR_ATTRIBUTES`; een leeg project; kalenderrandgevallen; en een
//      XER-import met bronarchief (`OPS_XerSourceArchive`). Zie ifcSchemaFixture.ts. De round-trip-
//      fixture (splits, contouren, timephased, P6-voortgang) toetst `check-ifc-roundtrip.ts` (19).
//   4. Dekking: elke entiteit uit de tabel en elke getypte waarde die de writer gebruikt, komt minstens
//      één keer voor in wat hier getoetst wordt. Zo kan het rijke project niet stil verarmen.
//   5. Volledigheid van de tabel: de writerbronnen worden gescand op `IFCXXX(`; elke naam moet in de
//      tabel staan. Een nieuwe entiteit in de writer zonder tabelregel is rood.
//
// Lokaal tegen IfcOpenShell valideren: `OPS_IFC_SCHEMA_DUMP=/tmp/dir bash tests/planning/run.sh
// check-ifc-schema.ts` schrijft de geschreven bronnen als .ifc naar die map.
//
// Draait via run.sh. Exit 0 = alles groen.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IFC_WORK_CALENDAR_ATTRIBUTES, writeIFC } from '@/services/ifc/ifcWriter';
import { RESOURCE_TYPE_TO_IFC } from '@/services/ifc/ifcConstants';
import { IFC_ENTITY_ATTRIBUTES, IFC_TYPED_VALUE_KIND } from './ifcSchemaTable';
import { checkIfcSchema, newSeen, type SchemaCheckOptions, type Seen } from './ifcSchemaCheck';
import {
  buildEdgeCalendarProject, buildEmptySchemaProject, buildRichSchemaProject, buildXerSchemaProject,
} from './ifcSchemaFixture';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');

let checks = 0;
const fails: string[] = [];
function assert(cond: boolean, msg: string): void {
  checks++;
  if (!cond) fails.push(msg);
}
function checkFile(label: string, text: string, seen: Seen, opts?: SchemaCheckOptions): void {
  const result = checkIfcSchema(label, text, seen, opts);
  checks += result.checks;
  fails.push(...result.failures);
}

// ── 1. De committe voorbeelden (geschreven in de standaardstand van de schakelaar) ───────────────

const seen = newSeen();
const ifcFiles = (dir: string) => readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.ifc')).sort();
const publicFiles = ifcFiles('public/examples');
assert(publicFiles.length >= 8, `public/examples: verwacht minstens de 8 publieke voorbeelden, vond ${publicFiles.length}`);
for (const f of publicFiles) checkFile(`public/examples/${f}`, readFileSync(join(ROOT, 'public/examples', f), 'utf8'), seen);
for (const f of ifcFiles('examples')) checkFile(`examples/${f}`, readFileSync(join(ROOT, 'examples', f), 'utf8'), seen);

// ── 2. Geschreven met de echte writer ────────────────────────────────────────────────────────────
// Inhoud: zie tests/planning/ifcSchemaFixture.ts. Het lege project dekt de verplichte attributen
// zonder bronwaarde: IfcWorkPlan/IfcWorkSchedule.StartTime, IfcOrganization.Name, en de WHERE-regels
// HasName (IfcProject) en IdentifiablePerson (IfcPerson). De kalenderrandgevallen dekken lege
// WeekdayComponent/TimePeriods (`$`, geen `()`). Het rijke project draait in beide standen van de
// schakelaar: de standaardstand zoals de app schrijft, en de andere stand streng op zijn eigen
// indeling.
const rich = buildRichSchemaProject(ROOT);
const written: [string, string][] = [];
for (const layout of [IFC_WORK_CALENDAR_ATTRIBUTES, IFC_WORK_CALENDAR_ATTRIBUTES === 8 ? 9 : 8] as const) {
  const label = layout === IFC_WORK_CALENDAR_ATTRIBUTES ? 'rijk project' : `rijk project (kalender ${layout})`;
  const ifc = writeIFC(rich, { workCalendarAttributes: layout });
  checkFile(label, ifc, seen, { workCalendarAttributes: layout });
  written.push([`schema-${label.replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.ifc`, ifc]);
}
const emptyIfc = writeIFC(buildEmptySchemaProject(rich));
checkFile('leeg project', emptyIfc, seen);
written.push(['schema-leeg-project.ifc', emptyIfc]);
const edgeIfc = writeIFC(buildEdgeCalendarProject(rich));
checkFile('kalenderrandgevallen', edgeIfc, seen);
written.push(['schema-kalenderrandgevallen.ifc', edgeIfc]);
assert(/IFCRECURRENCEPATTERN\(\.WEEKLY\.,\$,\$,/.test(edgeIfc) && /IFCRECURRENCEPATTERN\([^\n]*,\$\);/.test(edgeIfc),
  'kalenderrandgevallen: testvoorwaarde — een patroon zonder weekdagen en een patroon zonder tijdvakken');
const xerIfc = writeIFC(buildXerSchemaProject());
checkFile('XER-import met bronarchief', xerIfc, seen);
written.push(['schema-xer-bronarchief.ifc', xerIfc]);
assert(xerIfc.includes("'OPS_XerSourceArchive'"), 'XER-import: testvoorwaarde — het bestand draagt OPS_XerSourceArchive');
assert(rich.baselines?.some(b => b.tasks.length === 0) === true, 'rijk project: testvoorwaarde — een baseline zonder taken');

// ── 3. De vormtoets zelf: een fout GlobalId en een tijd zonder seconden zijn rood ─────────────────
{
  const tamper = (from: RegExp, to: string) => {
    const out = emptyIfc.replace(from, to);
    assert(out !== emptyIfc, `vormtoets: testvoorwaarde — ${from} komt voor in het lege project`);
    return checkIfcSchema('gemanipuleerd', out).failures.length > 0;
  };
  assert(tamper(/IFCPROJECT\('[0-3]/, "IFCPROJECT('4"), 'vormtoets: een GlobalId dat met 4 begint, is rood');
  assert(tamper(/IFCPROJECT\('([^']{22})'/, "IFCPROJECT('$1x'"), 'vormtoets: een GlobalId van 23 tekens is rood');
  assert(tamper(/(IFCWORKPLAN\([^\n]*?'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}'/, "$1'"), 'vormtoets: een IfcDateTime zonder seconden is rood');
  assert(tamper(/IFCAPPLICATION\(#(\d+),/, 'IFCAPPLICATION(#1,'), 'vormtoets: IfcApplication.ApplicationDeveloper naar een IfcPerson is rood');
}

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

// ── Optioneel: schrijf de geschreven bronnen weg voor IfcOpenShell ────────────────────────────────
const dumpDir = process.env.OPS_IFC_SCHEMA_DUMP;
if (dumpDir) {
  mkdirSync(dumpDir, { recursive: true });
  for (const [name, ifc] of written) writeFileSync(join(dumpDir, name), ifc, 'utf8');
  console.log(`   (${written.length} geschreven bronnen naar ${dumpDir})`);
}

if (fails.length) {
  for (const f of fails) console.log(`   XX ${f}`);
  console.log(`XX check-ifc-schema: ${fails.length} fout(en) in ${checks} toetsen`);
  process.exit(1);
}
console.log(`OK check-ifc-schema: ${checks} toetsen groen (${seen.entities.size} entiteittypen, ${publicFiles.length} publieke voorbeelden)`);
