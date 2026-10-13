// OUDE EN NIEUWE ARITEIT LEZEN HETZELFDE (issue #292). Oudere versies schreven IfcWorkPlan/IfcWorkSchedule
// met 15 argumenten, IfcWorkCalendar met 8 en de resources met 9; de huidige writer volgt het schema (14,
// 9 en 11). De lezer kiest de slotposities op het argumentaantal per entiteit (`ifcWorkControlSlots.ts`),
// niet op de appversie. Deze check bewijst dat beide vormen exact hetzelfde opleveren.
//
// De fixture `fixtures/ifc-arity-oude-writer.ifc` is het rijke project (`fixtures/ifc-arity-rich.ts`, op
// basis van `showcase-verbouwing-eengezinswoning.ifc`), geschreven met de writer van origin/main
// 1e192b31a, dus vóór deze fix: het basisvoorbeeld ingelezen en het rijke project geschreven met de
// toenmalige `readIFC`/`writeIFC` (esbuild-bundel met `@` naar die `src/`).
//
//   1. De fixture heeft echt de oude ariteit (anders bewijst de rest niets).
//   2. Oud bestand → lezen → schrijven met de huidige writer (nieuwe ariteit) → lezen: identiek.
//   3. Hetzelfde oude bestand, alleen mechanisch naar de nieuwe ariteit omgezet: identiek.
//   4. Zonder OPS-pset komen projectstart en -einde uit IfcWorkPlan: gelijk in beide vormen.
//   5. Het baselinewerkschema wordt in beide vormen herkend, ook als het vóór het gewone staat.
//   6. Een schemaconform bestand van een ander pakket (14 argumenten) leest StartTime/FinishTime goed.
// Draait via run.sh. Exit 0 = alles groen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import type { ImportResult } from '@/services/importTypes';
import { RICH_CALENDAR_IDS } from './fixtures/ifc-arity-rich';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OLD = readFileSync(join(HERE, 'fixtures', 'ifc-arity-oude-writer.ifc'), 'utf8');

let checks = 0;
const diffs: string[] = [];
function ok(label: string, cond: boolean): void {
  checks++;
  if (!cond) diffs.push(label);
}
function eq(label: string, got: unknown, want: unknown): void {
  ok(`${label} (kreeg ${JSON.stringify(got)}, verwacht ${JSON.stringify(want)})`, isDeepStrictEqual(got, want));
}
/** Eerste paden waarop twee waarden verschillen, voor een leesbare foutmelding. */
function firstDiffs(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 5 || isDeepStrictEqual(a, b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      firstDiffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    }
  } else {
    out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`);
  }
  return out;
}
/** Toewijzingen krijgen bij elk inlezen een vers id (`generateId`, ook zonder deze wijziging): die
 *  laten we buiten de vergelijking. Al het andere moet letterlijk gelijk zijn. */
const comparable = (r: ImportResult): ImportResult => ({ ...r, assignments: r.assignments.map(a => ({ ...a, id: '' })) });
function same(label: string, got: ImportResult, want: ImportResult): void {
  const [g, w] = [comparable(got), comparable(want)];
  ok(`${label}: ${firstDiffs(g, w).join('; ')}`, isDeepStrictEqual(g, w));
}

const RESOURCE_TYPES = ['IFCLABORRESOURCE', 'IFCCONSTRUCTIONEQUIPMENTRESOURCE', 'IFCCONSTRUCTIONMATERIALRESOURCE',
  'IFCSUBCONTRACTRESOURCE', 'IFCCREWRESOURCE'];

/** Splits de argumenten van één regel op topniveau (quote- en haakjesbewust). */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0, quoted = false, cur = '';
  for (const ch of inner) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
type Line = { id: string; type: string; args: string[] };
function lines(ifc: string): Line[] {
  const out: Line[] = [];
  for (const l of ifc.split('\n')) {
    const m = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(l);
    if (m) out.push({ id: m[1], type: m[2], args: splitArgs(m[3]) });
  }
  return out;
}
/** Argumentaantallen per type: { IFCWORKPLAN: [15], … } (uniek, gesorteerd). */
function arities(ifc: string, types: string[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const t of types) out[t] = [...new Set(lines(ifc).filter(l => l.type === t).map(l => l.args.length))].sort();
  return out;
}
/** Herschrijf elke regel van `type` met `fn` (die de argumentlijst krijgt). */
function rewrite(ifc: string, pick: (type: string) => boolean, fn: (args: string[]) => string[]): string {
  return ifc.split('\n').map((l) => {
    const m = /^(#\d+)=([A-Z0-9]+)\((.*)\);$/.exec(l);
    if (!m || !pick(m[2])) return l;
    return `${m[1]}=${m[2]}(${fn(splitArgs(m[3])).join(',')});`;
  }).join('\n');
}
/** Laat de OPS-projectdatums weg: dan komen start en einde uit IfcWorkPlan (zoals bij een ander pakket). */
const withoutProjectDates = (ifc: string) => ifc.replace("'ProjectStartDate'", "'Onbekend1'").replace("'ProjectEndDate'", "'Onbekend2'");

// ── 1. De fixture is echt oud ─────────────────────────────────────────────────────────────────────
const CONTROL = ['IFCWORKPLAN', 'IFCWORKSCHEDULE', 'IFCWORKCALENDAR', ...RESOURCE_TYPES];
const OLD_ARITY = { IFCWORKPLAN: [15], IFCWORKSCHEDULE: [15], IFCWORKCALENDAR: [8], ...Object.fromEntries(RESOURCE_TYPES.map(t => [t, [9]])) };
const NEW_ARITY = { IFCWORKPLAN: [14], IFCWORKSCHEDULE: [14], IFCWORKCALENDAR: [9], ...Object.fromEntries(RESOURCE_TYPES.map(t => [t, [11]])) };
eq('1 fixture heeft de oude ariteit', arities(OLD, CONTROL), OLD_ARITY);

const rOld = readIFC(OLD);
// Het rijke project moet het ook echt zijn, anders vergelijken we lege lijsten met elkaar.
{
  const lib = (id: string) => (rOld.resourceCalendars ?? []).find(c => c.name === { [RICH_CALENDAR_IDS.twoShift]: 'Tweeploegen', [RICH_CALENDAR_IDS.night]: 'Nachtploeg', [RICH_CALENDAR_IDS.unused]: 'Eigen rooster' }[id]);
  ok('1a projectkalender: feestdagen gelezen', rOld.calendar.holidays.length > 10);
  eq('1b projectkalender: werkende uitzondering met banden', rOld.calendar.workingExceptions,
    [{ name: 'Inhaalzaterdag', startDate: '2027-06-12', endDate: '2027-06-12', bands: [{ start: 420, end: 720 }] }]);
  eq('1c bibliotheek: ploeg per kalender', [lib(RICH_CALENDAR_IDS.twoShift)?.shift, lib(RICH_CALENDAR_IDS.night)?.shift, lib(RICH_CALENDAR_IDS.unused)?.shift],
    ['SECOND', 'THIRD', 'USERDEFINED']);
  ok('1d bibliotheek: tweeploegenkalender is een uurkalender met twee banden',
    lib(RICH_CALENDAR_IDS.twoShift)?.workTime?.byWeekday[1]?.length === 2);
  eq('1e bibliotheek: werkende uitzondering op de tweeploegenkalender', lib(RICH_CALENDAR_IDS.twoShift)?.workingExceptions?.map(e => e.name), ['Zaterdagdienst']);
  eq('1f baselines', (rOld.baselines ?? []).map(b => b.name), ['Baseline plan', 'Herplanning']);
  eq('1g vijf resourcesoorten', [...new Set(rOld.resources.map(r => r.type))].sort(), ['CREW', 'EQUIPMENT', 'LABOR', 'MATERIAL', 'SUBCONTRACTOR']);
  ok('1h projectdatums uit het pset', rOld.project.startDate === '2027-05-06');
}

// ── 2. Lezen → schrijven (nieuwe ariteit) → lezen: identiek ────────────────────────────────────────
const NEW = writeIFC(rOld);
eq('2a de huidige writer schrijft de schema-ariteit', arities(NEW, CONTROL), NEW_ARITY);
same('2b oud bestand en nieuw equivalent lezen identiek', readIFC(NEW), rOld);

// ── 3. Mechanisch omgezet naar de nieuwe ariteit: identiek ────────────────────────────────────────
const converted = rewrite(
  rewrite(
    rewrite(OLD, t => t === 'IFCWORKPLAN' || t === 'IFCWORKSCHEDULE', a => [...a.slice(0, 11), ...a.slice(12)]),
    t => t === 'IFCWORKCALENDAR', a => [...a.slice(0, 5), '$', ...a.slice(5)]),
  t => RESOURCE_TYPES.includes(t), a => [...a.slice(0, 8), '$', '$', ...a.slice(8)]);
eq('3a omzetting levert de schema-ariteit', arities(converted, CONTROL), NEW_ARITY);
same('3b zelfde inhoud in oude en nieuwe ariteit leest identiek', readIFC(converted), rOld);

// ── 4. Projectstart en -einde uit IfcWorkPlan (zonder OPS-pset) ────────────────────────────────────
{
  const fromOld = readIFC(withoutProjectDates(OLD)).project;
  const fromNew = readIFC(withoutProjectDates(NEW)).project;
  const fromConverted = readIFC(withoutProjectDates(converted)).project;
  ok('4a controle: de pset-namen zijn echt weg', !withoutProjectDates(OLD).includes("'ProjectStartDate'"));
  eq('4b oud: start/einde uit het WORKPLAN-slot', [fromOld.startDate, fromOld.endDate], ['2027-05-06', '2027-05-13']);
  eq('4c nieuw: zelfde start/einde', [fromNew.startDate, fromNew.endDate], [fromOld.startDate, fromOld.endDate]);
  eq('4d omgezet: zelfde start/einde', [fromConverted.startDate, fromConverted.endDate], [fromOld.startDate, fromOld.endDate]);
}

// ── 5. Het baselinewerkschema wordt herkend, ook als het vóór het gewone werkschema staat ──────────
for (const [label, ifc] of [['oud', OLD], ['nieuw', NEW]] as const) {
  const all = ifc.split('\n');
  const isBaseline = (l: string) => l.includes('=IFCWORKSCHEDULE(') && l.includes('.BASELINE.');
  const isPlanned = (l: string) => l.includes('=IFCWORKSCHEDULE(') && l.includes('.PLANNED.');
  const planned = all.find(isPlanned)!;
  const plannedGuid = /\('([^']+)'/.exec(planned)![1];
  // Zet de baseline-regels vóór de gewone: `find` pakt dan eerst een baseline als de lezer hem niet herkent.
  const rest = all.filter(l => !isBaseline(l));
  const at = rest.indexOf(planned);
  const reordered = [...rest.slice(0, at), ...all.filter(isBaseline), ...rest.slice(at)].join('\n');
  ok(`5a ${label}: controle, de baseline staat nu vóór het gewone werkschema`,
    reordered.indexOf('.BASELINE.') >= 0 && reordered.indexOf('.BASELINE.') < reordered.indexOf(planned));
  const r = readIFC(reordered);
  eq(`5b ${label}: het werkschema-GlobalId is dat van het gewone schema`, r.ifcGlobalIds?.[`ws:${r.project.id}`], plannedGuid);
}

// ── 6. Een schemaconform bestand van een ander pakket ─────────────────────────────────────────────
{
  const ext = [
    'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('x.ifc','',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('0proj000000000000000001',$,'Extern',$,$,$,$,$,$);",
    "#2=IFCWORKPLAN('0plan000000000000000001',$,'Plan',$,$,$,'2026-01-01T00:00:00',$,$,$,$,'2026-03-02T08:00:00','2026-04-30T17:00:00',.PLANNED.);",
    'ENDSEC;', 'END-ISO-10303-21;', '',
  ].join('\n');
  const p = readIFC(ext).project;
  eq('6a 14-argument-IfcWorkPlan: StartTime en FinishTime op hun schemaplek', [p.startDate, p.endDate], ['2026-03-02', '2026-04-30']);
  eq('6b het schema uit de kop', p.ifcSchema, 'IFC4');
}

if (diffs.length === 0) {
  console.log(`OK  ifc-legacy-arity: alle checks groen (${checks})`);
  process.exit(0);
} else {
  console.log(`XX  ifc-legacy-arity: ${diffs.length} afwijking(en) van ${checks}`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
