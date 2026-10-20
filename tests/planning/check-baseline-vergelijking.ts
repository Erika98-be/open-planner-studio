/**
 * Meerdere baselines vergelijken in de Gantt (issue #391) — regressiebatterij.
 *
 * Bewaakt:
 *  A. DE OPDELING (puur, `baselineStrip.ts`): 1, 2 en 3 baselines; overlappend, samenvallend,
 *     aansluitend en niet-rakend; ronde kanten alleen aan een buitenkant; mijlpalen op dezelfde datum
 *     delen één ruit. De tekenregel gebruikt per stuk precies de kleuren van zijn baselines, blijft
 *     binnen het stuk en de strepen schuiven mee met de strook (vast aan de linkerkant).
 *  B. HET DOCUMENTVELD `comparedBaselineIds`: aan/uit, maximaal twee naast de actieve, de actieve en
 *     een onbekende id doen niets, een baseline die actief wordt of verdwijnt gaat uit de vergelijking,
 *     undo/redo (zoals `setActiveBaseline`), documentwissel, IFC schrijven en lezen
 *     (`OPS_Baselines.ComparedBaselineIds`), een oud bestand zonder het veld, en crashherstel.
 *  C. SCHERM = AFDRUK: de echte `GanttRenderer` en de echte `renderReport` tekenen voor dezelfde
 *     baselines dezelfde stukken (relatieve plaats, kleur van de ondergrond, streepkleuren) en ruiten.
 */
import { useAppStore } from '@/state/appStore';
import { recoveryInputFromParsed } from '@/state/documentContract';
import { buildWriteIFCInput } from '@/state/ifcSaveInput';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import { GanttRenderer } from '@/engine/renderer/GanttRenderer';
import { computeEffectiveViewStart, computeFitToProject, computeScrollToDate } from '@/utils/ganttViewport';
import { buildSharedAxis, computeContentSpanDays } from '@/components/canvas/ganttRenderOptions';
import { PRINT_PALETTE } from '@/engine/renderer/themePalette';
import { barLayout, MIN_BAR_HEIGHT_PX, MIN_BAR_HEIGHT_RATIO } from '@/engine/renderer/rowGeometry';
import {
  baselineDiamonds, baselineStripPieces, paintBaselineStrip,
  baselineSpanX, type BaselineBar, type BaselineSlot, type StripPainter,
} from '@/engine/renderer/baselineStrip';
import { renderReport, type PrintOptions } from '@/services/print/printPreview';
import type { Draw2D, TextAlign, TextBaseline } from '@/services/pdf/draw2d';
import { shownBaselineReach, type Baseline, type BaselineOverlay } from '@/types/baseline';
import type { Task } from '@/types/task';

// Node-shim (zelfde als check-resource-accent): readGanttPalette leest CSS-variabelen.
const g = globalThis as unknown as Record<string, unknown>;
g.document = { documentElement: {} };
g.getComputedStyle = () => ({ getPropertyValue: () => '' });

const S = () => useAppStore.getState();
let failures = 0;
let checks = 0;
const J = (v: unknown) => JSON.stringify(v);
const ok = (cond: boolean, msg: string) => { checks++; if (!cond) { console.log(`   XX ${msg}`); failures++; } };
const eq = (got: unknown, want: unknown, msg: string) => ok(J(got) === J(want), `${msg}: verwacht ${J(want)}, kreeg ${J(got)}`);

// ══ A. De opdeling van de strook ═══════════════════════════════════════════════════════════════
const sig = (bars: BaselineBar[]) => baselineStripPieces(bars).map(p =>
  `${p.x1}-${p.x2}:${p.slots.join('')}${p.roundLeft ? 'L' : ''}${p.roundRight ? 'R' : ''}`);

eq(sig([{ slot: 0, x1: 10, x2: 50 }]), ['10-50:0LR'], 'A 1 baseline: één stuk, rond aan beide kanten');
eq(sig([]), [], 'A geen baselines: geen stukken');
eq(sig([{ slot: 0, x1: 10, x2: 10 }]), [], 'A lege strook (x2 = x1) telt niet mee');
eq(sig([{ slot: 0, x1: 10, x2: 50 }, { slot: 1, x1: 30, x2: 70 }]),
  ['10-30:0L', '30-50:01', '50-70:1R'], 'A 2 baselines overlappend: effen, gestreept, effen');
eq(sig([{ slot: 1, x1: 10, x2: 50 }, { slot: 0, x1: 10, x2: 50 }]),
  ['10-50:01LR'], 'A 2 baselines samenvallend: één gestreept stuk, plaatsen oplopend');
eq(sig([{ slot: 0, x1: 10, x2: 30 }, { slot: 2, x1: 60, x2: 90 }]),
  ['10-30:0LR', '60-90:2LR'], 'A 2 baselines niet-rakend: twee losse stukken, elk rond');
eq(sig([{ slot: 0, x1: 10, x2: 30 }, { slot: 1, x1: 30, x2: 50 }]),
  ['10-30:0L', '30-50:1R'], 'A 2 baselines aansluitend: geen ronde kant op de naad');
eq(sig([{ slot: 0, x1: 0, x2: 10 }, { slot: 1, x1: 5, x2: 15 }, { slot: 2, x1: 8, x2: 20 }]),
  ['0-5:0L', '5-8:01', '8-10:012', '10-15:12', '15-20:2R'], 'A 3 baselines trapsgewijs: vijf stukken');
eq(sig([{ slot: 0, x1: 0, x2: 20 }, { slot: 1, x1: 0, x2: 20 }, { slot: 2, x1: 0, x2: 20 }]),
  ['0-20:012LR'], 'A 3 baselines samenvallend: één stuk met drie kleuren');
eq(sig([{ slot: 0, x1: 0, x2: 10 }, { slot: 1, x1: 20, x2: 30 }, { slot: 2, x1: 40, x2: 50 }]),
  ['0-10:0LR', '20-30:1LR', '40-50:2LR'], 'A 3 baselines niet-rakend: drie losse stukken');

eq(baselineDiamonds([{ slot: 1, x: 40 }, { slot: 0, x: 40 }]), [{ x: 40, slots: [0, 1] }],
  'A mijlpaal op dezelfde datum: één ruit met beide baselines');
eq(baselineDiamonds([{ slot: 0, x: 40 }, { slot: 1, x: 40.2 }, { slot: 2, x: 80 }]),
  [{ x: 40, slots: [0, 1] }, { x: 80, slots: [2] }], 'A mijlpalen: op 0,5 px samen, verder los');
eq(baselineDiamonds([{ slot: 0, x: 40 }, { slot: 0, x: 40 }]), [{ x: 40, slots: [0] }],
  'A mijlpaal: dezelfde baseline twee keer telt één keer');

// Tekenregel met een opnemende painter.
interface Fill { color: string; pts: [number, number][] }
function recordPainter(): { d: StripPainter; fills: Fill[] } {
  const fills: Fill[] = [];
  let path: [number, number][] = [];
  const d: StripPainter = {
    fillStyle: '',
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    closePath() {},
    fill() { fills.push({ color: String(d.fillStyle), pts: path }); },
  };
  return { d, fills };
}
const COLOR: Record<BaselineSlot, string> = { 0: 'k0', 1: 'k1', 2: 'k2' };
const paintOpts = { top: 100, height: 6, stripeWidth: 3, diamondSize: 5, colorOf: (s: BaselineSlot) => COLOR[s] };
const bbox = (pts: [number, number][]) => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
};
{
  const { d, fills } = recordPainter();
  paintBaselineStrip(d, baselineStripPieces([{ slot: 0, x1: 10, x2: 60 }]), [], paintOpts);
  eq(fills.map(f => f.color), ['k0'], 'A teken 1 baseline: één effen vulling');
}
{
  const { d, fills } = recordPainter();
  const pieces = baselineStripPieces([{ slot: 0, x1: 10, x2: 60 }, { slot: 1, x1: 10, x2: 60 }, { slot: 2, x1: 10, x2: 60 }]);
  paintBaselineStrip(d, pieces, [], paintOpts);
  eq(fills[0]?.color, 'k0', 'A teken 3 samenvallend: ondergrond in de kleur van de actieve');
  eq([...new Set(fills.map(f => f.color))].sort(), ['k0', 'k1', 'k2'], 'A teken 3 samenvallend: alle drie de kleuren');
  const out = fills.filter(f => { const b = bbox(f.pts); return b.x1 < 10 - 1e-6 || b.x2 > 60 + 1e-6 || b.y1 < 100 - 1e-6 || b.y2 > 106 + 1e-6; });
  eq(out.length, 0, 'A teken 3 samenvallend: geen vulling buiten de strook');
  // Band k heeft kleur k mod 3: twee opeenvolgende strepen hebben nooit dezelfde kleur.
  const stripes = fills.slice(1).map(f => f.color);
  ok(stripes.every((c, i) => i === 0 || c !== stripes[i - 1] || c === 'k0'), 'A teken 3: strepen wisselen van kleur');
}
{
  const { d, fills } = recordPainter();
  paintBaselineStrip(d, baselineStripPieces([{ slot: 0, x1: 10, x2: 40 }, { slot: 1, x1: 25, x2: 60 }]), [], paintOpts);
  const k2 = fills.filter(f => f.color === 'k2');
  eq(k2.length, 0, 'A teken 2 baselines: geen kleur van een baseline die er niet is');
  const k1InFirst = fills.filter(f => f.color === 'k1' && bbox(f.pts).x2 <= 25 - 1e-6);
  eq(k1InFirst.length, 0, 'A teken 2 baselines: het effen eerste stuk heeft geen strepen');
}
{
  // Strepen liggen vast aan de strook: alles 37 px verschuiven verschuift elke vulling precies mee.
  const bars: BaselineBar[] = [{ slot: 0, x1: 10, x2: 40 }, { slot: 1, x1: 25, x2: 60 }];
  const a = recordPainter();
  const b = recordPainter();
  paintBaselineStrip(a.d, baselineStripPieces(bars), [], paintOpts);
  paintBaselineStrip(b.d, baselineStripPieces(bars.map(x => ({ ...x, x1: x.x1 + 37, x2: x.x2 + 37 }))), [], paintOpts);
  const shifted = a.fills.map(f => ({ color: f.color, pts: f.pts.map(([x, y]) => [Math.round((x + 37) * 1000) / 1000, Math.round(y * 1000) / 1000]) }));
  const round = b.fills.map(f => ({ color: f.color, pts: f.pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) }));
  eq(round, shifted, 'A pannen: de strepen schuiven mee met de strook');
}
{
  const { d, fills } = recordPainter();
  paintBaselineStrip(d, [], baselineDiamonds([{ slot: 0, x: 50 }, { slot: 1, x: 50 }]), paintOpts);
  eq(fills[0]?.color, 'k0', 'A ruit 2 baselines: ondergrond actief');
  ok(fills.some(f => f.color === 'k1'), 'A ruit 2 baselines: strepen in de tweede kleur');
  const b = bbox(fills[0]?.pts ?? [[0, 0]]);
  eq([b.x1, b.x2, b.y1, b.y2], [45, 55, 98, 108], 'A ruit: midden op de strook, halve diagonaal 5');
}
{
  // Strepen en ruitranden lopen allebei onder 45°: een afrondfout gaf eerder een driehoekje
  // buiten de ruit (gevonden bij halve diagonaal 4, streep 3). Elke vulling blijft binnen de ruit.
  for (const s of [2.4, 3.2, 4, 4.8, 5, 5.6, 7]) {
    for (const w of [2, 3, 4]) {
      const { d, fills } = recordPainter();
      paintBaselineStrip(d, [], baselineDiamonds([{ slot: 0, x: 123.5 }, { slot: 1, x: 123.5 }, { slot: 2, x: 123.5 }]),
        { ...paintOpts, top: 77.3, height: 7, stripeWidth: w, diamondSize: s });
      const cy = 77.3 + 3.5;
      const outside = fills.some(f => f.pts.some(([x, y]) => Math.abs(x - 123.5) + Math.abs(y - cy) > s + 1e-6));
      ok(!outside, `A ruit s=${s} w=${w}: geen streep buiten de ruit`);
    }
  }
}
{
  // Op het scherm: een stuk dat ver buiten beeld loopt, wordt ingekort tot rond het zichtbare deel.
  const { d, fills } = recordPainter();
  paintBaselineStrip(d, baselineStripPieces([{ slot: 0, x1: -5000, x2: 9000 }]), [], { ...paintOpts, visibleX: [0, 800] });
  const b = bbox(fills[0]?.pts ?? [[0, 0]]);
  ok(b.x1 >= -6 - 1e-6 && b.x2 <= 806 + 1e-6, `A zichtbaar bereik: stuk ingekort tot het canvas, kreeg ${b.x1}..${b.x2}`);
}

// ══ B. Het documentveld ════════════════════════════════════════════════════════════════════════
S().newProject();
S().addTask({ name: 'Ruwbouw' });
S().addTask({ name: 'Oplevering', isMilestone: true });
S().runCPM();
const blA = S().saveBaseline('A');
const blB = S().saveBaseline('B');
const blC = S().saveBaseline('C');
const blD = S().saveBaseline('D');
eq(S().activeBaselineId, blD, 'B setup: de laatste baseline is actief');
eq(S().comparedBaselineIds, [null, null], 'B setup: nieuw document vergelijkt niets');

S().toggleComparedBaseline(blB);
eq(S().comparedBaselineIds, [blB, null], 'B aan: eerste plaats');
ok(S().isDirty, 'B aan: document gewijzigd');
S().toggleComparedBaseline(blC);
eq(S().comparedBaselineIds, [blB, blC], 'B aan: tweede plaats');
S().toggleComparedBaseline(blA);
eq(S().comparedBaselineIds, [blB, blC], 'B vol (actief + 2): een vierde gaat er niet bij');
S().toggleComparedBaseline(blD);
eq(S().comparedBaselineIds, [blB, blC], 'B de actieve baseline kan niet in de vergelijking');
S().toggleComparedBaseline('bestaat-niet');
eq(S().comparedBaselineIds, [blB, blC], 'B onbekende id doet niets');

S().undo();
eq(S().comparedBaselineIds, [blB, null], 'B undo: één stap terug (vol, actief en onbekend gaven geen stap)');
S().redo();
eq(S().comparedBaselineIds, [blB, blC], 'B redo');

S().toggleComparedBaseline(blB);
eq(S().comparedBaselineIds, [null, blC], 'B uit: de plaats wordt leeg, de andere blijft');
S().undo();
eq(S().comparedBaselineIds, [blB, blC], 'B undo uitzetten');

S().setActiveBaseline(blB);
eq(S().comparedBaselineIds, [null, blC], 'B vergeleken baseline wordt actief: uit de vergelijking');
S().undo();
eq([S().activeBaselineId, S().comparedBaselineIds], [blD, [blB, blC]], 'B undo actief maken: beide terug');

S().deleteBaseline(blC);
eq(S().comparedBaselineIds, [blB, null], 'B verwijderde baseline: uit de vergelijking');
S().undo();
eq(S().comparedBaselineIds, [blB, blC], 'B undo verwijderen: vergelijking terug');

S().deleteBaseline(blD);
eq(S().activeBaselineId, blC, 'B actieve verwijderd: de laatste wordt actief');
eq(S().comparedBaselineIds, [blB, null], 'B actieve verwijderd: de nieuwe actieve gaat uit de vergelijking');
S().undo();
eq([S().activeBaselineId, S().comparedBaselineIds], [blD, [blB, blC]], 'B undo: actief en vergelijking terug');

// Documentwissel: de keuze hoort bij het document.
const doc1 = S().activeDocumentId;
S().newDocument();
eq(S().comparedBaselineIds, [null, null], 'B documentwissel: een nieuw document vergelijkt niets');
S().switchDocument(doc1);
eq(S().comparedBaselineIds, [blB, blC], 'B documentwissel: terug in document 1 is de keuze er weer');

// IFC schrijven en lezen.
const ifc = writeIFC(buildWriteIFCInput(S()));
ok(ifc.includes(`'ComparedBaselineIds'`), 'B IFC: OPS_Baselines bevat ComparedBaselineIds');
const parsed = readIFC(ifc);
eq(parsed.comparedBaselineIds, [blB, blC], 'B IFC: keuze terug na lezen');
eq(parsed.activeBaselineId, blD, 'B IFC: actieve baseline terug na lezen');

// Een id die niet meer bestaat (handmatig bewerkt bestand) valt weg bij het lezen.
const broken = readIFC(ifc.replace(new RegExp(`"${blC}"\\]`), '"weg"]'));
eq(broken.comparedBaselineIds, [blB, null], 'B IFC: onbekende id in het bestand valt weg');

// Crashherstel: dezelfde keten als de herstel-hook.
const input = recoveryInputFromParsed(parsed, { id: 'herstel-391', filePath: '/tmp/391.ifc', isDirty: true, datesAsRecorded: false });
S().restoreDocuments([input], 'herstel-391');
eq(S().comparedBaselineIds, [blB, blC], 'B crashherstel: keuze terug');

// Oud bestand: zonder keuze schrijft de writer het veld niet, en lezen geeft geen vergelijking.
S().toggleComparedBaseline(blB);
S().toggleComparedBaseline(blC);
eq(S().comparedBaselineIds, [null, null], 'B setup oud bestand: niets gekozen');
const oldIfc = writeIFC(buildWriteIFCInput(S()));
ok(!oldIfc.includes('ComparedBaselineIds'), 'B IFC zonder keuze: geen ComparedBaselineIds (bestand zoals vóór #391)');
ok(oldIfc.includes(`'ActiveBaselineId'`), 'B IFC zonder keuze: OPS_Baselines staat er wel');
eq(readIFC(oldIfc).comparedBaselineIds, [null, null], 'B IFC oud bestand: geen vergelijking');

// ══ C. Scherm = afdruk ═════════════════════════════════════════════════════════════════════════
S().newProject();
const cBar = S().addTask({ name: 'Balk' });
const cMs = S().addTask({ name: 'Mijlpaal', isMilestone: true });
S().runCPM();
const bar = S().tasks.find(t => t.id === cBar) as Task;
const ms = S().tasks.find(t => t.id === cMs) as Task;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const s0 = bar.time.earlyStart.slice(0, 10);
const m0 = ms.time.earlyStart.slice(0, 10);
const layer = (barFrom: number, barTo: number, msDay: number): BaselineOverlay => new Map([
  [bar.id, { start: addDays(s0, barFrom), finish: addDays(s0, barTo), isMilestone: false }],
  [ms.id, { start: addDays(m0, msDay), finish: addDays(m0, msDay), isMilestone: true }],
]);
// Actief dag 0–4; vergelijking 1 dag 2–7; vergelijking 2 dag 12–14 (los). Mijlpaal: actief en 1
// op dezelfde dag (één gestreepte ruit), 2 drie dagen later.
const overlay0 = layer(0, 4, 0);
const comparisons = [{ slot: 1 as const, overlay: layer(2, 7, 0) }, { slot: 2 as const, overlay: layer(12, 14, 3) }];
const BASE_COLORS = new Set([PRINT_PALETTE.baseline, PRINT_PALETTE.baselineCompare1, PRINT_PALETTE.baselineCompare2]);

interface Piece { x1: number; x2: number; base: string; stripes: string[] }
/** Groepeert opgenomen baselinevullingen per rij en per stuk: een vulling die niet binnen het
 *  vorige stuk valt, begint een nieuw stuk (strepen liggen altijd binnen hun stuk). */
function piecesPerRow(fills: Fill[]): Piece[][] {
  const mine = fills.filter(f => BASE_COLORS.has(f.color) && f.pts.length >= 3);
  const rows: { cy: number; fills: Fill[] }[] = [];
  for (const f of mine) {
    const b = bbox(f.pts);
    const cy = (b.y1 + b.y2) / 2;
    const row = rows.find(r => Math.abs(r.cy - cy) < 4);
    if (row) row.fills.push(f); else rows.push({ cy, fills: [f] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  return rows.map(r => {
    const pieces: (Piece & { b: ReturnType<typeof bbox> })[] = [];
    for (const f of r.fills) {
      const b = bbox(f.pts);
      const cur = pieces[pieces.length - 1];
      const inside = cur && b.x1 >= cur.b.x1 - 0.5 && b.x2 <= cur.b.x2 + 0.5 && b.y1 >= cur.b.y1 - 0.5 && b.y2 <= cur.b.y2 + 0.5;
      if (inside) { if (!cur.stripes.includes(f.color)) cur.stripes.push(f.color); continue; }
      pieces.push({ x1: b.x1, x2: b.x2, base: f.color, stripes: [], b });
    }
    // Plaats relatief aan de hele rij (scherm en afdruk hebben een andere schaal).
    const lo = Math.min(...pieces.map(p => p.x1));
    const hi = Math.max(...pieces.map(p => p.x2));
    const span = hi - lo || 1;
    return pieces.map(p => ({
      x1: Math.round(((p.x1 - lo) / span) * 50) / 50,
      x2: Math.round(((p.x2 - lo) / span) * 50) / 50,
      base: p.base,
      stripes: p.stripes.filter(c => c !== p.base).sort(),
    }));
  });
}

type Comparisons = { slot: 1 | 2; overlay: BaselineOverlay }[];
/** Scherm: de echte GanttRenderer met een opnemende context. */
function renderScreen(tasks: Task[], ov0: BaselineOverlay, comps: Comparisons, over: { zoom?: number; compress?: boolean } = {}): Fill[] {
  const fills: Fill[] = [];
  let path: [number, number][] = [];
  const st = { fillStyle: '', strokeStyle: '' };
  const noop = () => {};
  const ctx = {
    lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineCap: '', lineJoin: '', shadowBlur: 0, shadowColor: '',
    set fillStyle(v: string) { st.fillStyle = v; }, get fillStyle() { return st.fillStyle; },
    set strokeStyle(v: string) { st.strokeStyle = v; }, get strokeStyle() { return st.strokeStyle; },
    fillRect: noop, strokeRect: noop, clearRect: noop, beginPath: () => { path = []; }, closePath: noop,
    moveTo: (x: number, y: number) => { path.push([x, y]); }, lineTo: (x: number, y: number) => { path.push([x, y]); },
    arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop,
    fill: () => { fills.push({ color: st.fillStyle, pts: path }); },
    stroke: noop, save: noop, restore: noop, clip: noop, translate: noop, scale: noop, rotate: noop,
    setLineDash: noop, getLineDash: () => [], fillText: noop, strokeText: noop,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    createLinearGradient: () => ({ addColorStop: noop }), createPattern: () => null,
    quadraticCurveTo: noop, bezierCurveTo: noop, drawImage: noop,
  };
  const st0 = S();
  const renderer = new GanttRenderer(ctx as unknown as CanvasRenderingContext2D, {
    rows: tasks.map(t => ({ kind: 'task' as const, rowKey: t.id, task: t, depth: 0, dimmed: false })),
    sequences: [], calendar: st0.calendar,
    view: { ...st0.view, scrollX: 0, scrollY: 0, zoom: over.zoom ?? 30 },
    compressNonWorkdays: over.compress,
    selectedTaskIds: [], canvasWidth: 4000, canvasHeight: 300, rowHeight: 32, headerHeight: 60,
    showBaselineOverlay: true, baselineOverlay: ov0, baselineComparisons: comps,
    activityCodeTypes: [], customFieldDefs: [], taskTypeLabels: {}, barColorNoneLabel: '(geen)',
    resources: [], assignments: [],
  });
  renderer.render();
  return fills;
}

/** Afdruk: de echte renderReport (raster-preview én vector-PDF) met een opnemende Draw2D. */
function renderPrint(tasks: Task[], ov0: BaselineOverlay, comps: Comparisons, over: { zoom?: number; compress?: boolean } = {}) {
  const fills: Fill[] = [];
  let path: [number, number][] | null = null;
  const st = { font: '10px x', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: 'left' as TextAlign, textBaseline: 'alphabetic' as TextBaseline };
  const noop = () => {};
  const d2d: Draw2D = {
    get font() { return st.font; }, set font(v) { st.font = v; },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; },
    setLineDash: noop, fillRect: noop, strokeRect: noop,
    beginPath() { path = []; }, moveTo(x, y) { (path ??= []).push([x, y]); }, lineTo(x, y) { (path ??= []).push([x, y]); },
    closePath: noop, fill() { if (path) fills.push({ color: st.fillStyle, pts: path }); path = null; },
    stroke() { path = null; }, roundRect: noop, fillText: noop,
    measureText: (t: string) => ({ width: t.length * 6 }),
  };
  const options = {
    showCritical: false, showFloat: false, showDeps: false, showWeekends: true, showLegend: false,
    showTaskNames: false, showCompletion: false, autoFit: false, customZoom: over.zoom ?? 22,
    compressNonWorkdays: over.compress,
    paperSize: 'A3', orientation: 'landscape', companyName: 'Test',
    barColorSelection: { mode: 'critical' }, activityCodeTypes: [], customFieldDefs: [],
    taskTypeLabels: {}, barColorNoneLabel: '(geen)',
    showBaselineOverlay: true, baselineOverlay: ov0, baselineComparisons: comps,
    labels: { noTasks: '-', printed: '-', today: '-', statusDate: '-', progressDate: '-', legend: {}, tableHeaders: {} },
  } as unknown as PrintOptions;
  const dims = renderReport(() => d2d, tasks, [], S().calendar, 'P', options);
  return { fills, dims };
}

const screenFills = renderScreen([bar, ms], overlay0, comparisons);
const printFills = renderPrint([bar, ms], overlay0, comparisons).fills;

const screen = piecesPerRow(screenFills);
const print = piecesPerRow(printFills);
eq(screen.length, 2, 'C scherm: baselinestrook op beide rijen');
eq(print, screen, 'C afdruk tekent dezelfde stukken, ondergronden en streepkleuren als het scherm');
// En dat beeld is het verwachte: vier stukken op de balkrij, twee ruiten op de mijlpaalrij.
const P = PRINT_PALETTE;
eq(screen[0]?.map(p => [p.base, p.stripes]), [
  [P.baseline, []], [P.baseline, [P.baselineCompare1]], [P.baselineCompare1, []], [P.baselineCompare2, []],
], 'C balkrij: effen, gestreept (actief + 1), effen 1, los stuk 2');
eq(screen[1]?.map(p => [p.base, p.stripes]), [
  [P.baseline, [P.baselineCompare1]], [P.baselineCompare2, []],
], 'C mijlpaalrij: één gestreepte ruit op de gedeelde datum, één losse ruit');

// ══ D. Baselines met tijd (urentaken) ═════════════════════════════════════════════════════════
// Een baseline mét tijd staat op haar tijdstip, zoals de taakbalk (`barGeometry`): A 09:00–10:00 en
// B 14:00–15:00 op dezelfde dag raken elkaar niet. Een datum zonder tijd blijft een hele dag.
{
  const dayX = (d: Date) => (d.getTime() - Date.UTC(2026, 9, 20)) / 86_400_000 * 240;
  eq(baselineSpanX({ start: '2026-10-20T09:00', finish: '2026-10-20T10:00', isMilestone: false }, dayX, 240),
    { kind: 'bar', x1: 90, x2: 100 }, 'D uurbaseline 09:00–10:00 bij 240 px/dag: [90, 100]');
  eq(baselineSpanX({ start: '2026-10-20T14:00', finish: '2026-10-20T15:00', isMilestone: false }, dayX, 240),
    { kind: 'bar', x1: 140, x2: 150 }, 'D uurbaseline 14:00–15:00: [140, 150]');
  eq(baselineSpanX({ start: '2026-10-20', finish: '2026-10-21', isMilestone: false }, dayX, 240),
    { kind: 'bar', x1: 0, x2: 480 }, 'D dagbaseline 20–21 okt: twee hele dagen');
  eq(baselineSpanX({ start: '2026-10-20T15:30', finish: '2026-10-20T15:30', isMilestone: true }, dayX, 240),
    { kind: 'milestone', x: 155 }, 'D uurmijlpaal op 15:30');
  eq(baselineSpanX({ start: '2026-10-20', finish: '2026-10-20', isMilestone: true }, dayX, 240),
    { kind: 'milestone', x: 120 }, 'D dagmijlpaal midden op de dag');
  eq(baselineSpanX({ start: '2026-10-20T09:00', finish: '2026-10-21', isMilestone: false }, dayX, 240),
    { kind: 'bar', x1: 90, x2: 480 }, 'D uurstart met dag-einde (21 okt): tot het einde van die dag');
  eq(baselineSpanX({ start: 'kapot', finish: 'kapot', isMilestone: false }, dayX, 240), null, 'D onleesbare datum: niets');

  // Echte renderer en echte afdruk: twee losse stukken, en twee losse ruiten.
  const day = s0;
  const hourOv = (from: string, to: string, msAt: string): BaselineOverlay => new Map([
    [bar.id, { start: `${day}T${from}`, finish: `${day}T${to}`, isMilestone: false }],
    [ms.id, { start: `${m0}T${msAt}`, finish: `${m0}T${msAt}`, isMilestone: true }],
  ]);
  const hA = hourOv('09:00', '10:00', '09:00');
  const hB = [{ slot: 1 as const, overlay: hourOv('14:00', '15:00', '15:00') }];
  for (const compress of [false, true]) {
    const label = compress ? 'werkdag-as' : 'kalender-as';
    const scr = piecesPerRow(renderScreen([bar, ms], hA, hB, { zoom: 240, compress }));
    const prt = piecesPerRow(renderPrint([bar, ms], hA, hB, { zoom: 240, compress }).fills);
    eq(scr[0]?.map(p => [p.x1, p.x2, p.base, p.stripes.length]), [[0, 0.16, P.baseline, 0], [0.84, 1, P.baselineCompare1, 0]],
      `D scherm (${label}): 09–10 en 14–15 zijn twee losse effen stukken, geen valse overlap`);
    eq(scr[1]?.length, 2, `D scherm (${label}): mijlpalen om 09:00 en 15:00 zijn twee ruiten`);
    eq(prt[0], scr[0], `D afdruk (${label}): dezelfde stukken als het scherm`);
    // Ruiten: scherm en papier hebben een andere ruitgrootte, dus alleen het aantal vergelijken.
    eq(prt[1]?.length, 2, `D afdruk (${label}): mijlpalen om 09:00 en 15:00 zijn twee ruiten`);
  }
}

// ══ E. Een vergelijkingsbaseline ver van de taken blijft bereikbaar ══════════════════════════════
// Taak 20–21 okt, vergelijkingsbaseline 1–31 juli. De tijdas (oorsprong), Ctrl+Home, Inpassen en het
// rapport nemen de getoonde baselines mee; zonder baselines verandert er niets.
{
  const octTime = { ...bar.time, earlyStart: '2026-10-20', earlyFinish: '2026-10-21', scheduleStart: '2026-10-20', scheduleFinish: '2026-10-21' };
  const t = { ...bar, time: octTime, actualStart: undefined, actualFinish: undefined } as Task;
  const julyBl: Baseline = { id: 'bl-juli', name: 'Juli', createdAt: '2026-06-01T00:00:00Z', projectEnd: '', projectDuration: 0,
    tasks: [{ taskId: t.id, start: '2026-07-01', finish: '2026-07-31', duration: 31, isMilestone: false }] };
  const octBl: Baseline = { id: 'bl-okt', name: 'Okt', createdAt: '2026-09-01T00:00:00Z', projectEnd: '', projectDuration: 0,
    tasks: [{ taskId: t.id, start: '2026-10-20', finish: '2026-10-21', duration: 2, isMilestone: false }] };
  const reach = shownBaselineReach([octBl, julyBl], octBl.id, [julyBl.id, null]);
  eq(reach, { earliest: '2026-07-01', latest: '2026-10-21' }, 'E bereik: actief okt + vergelijking juli');
  eq(shownBaselineReach([octBl, julyBl], octBl.id, [null, null]), { earliest: '2026-10-20', latest: '2026-10-21' },
    'E bereik zonder vergelijking: alleen de actieve');
  eq(computeEffectiveViewStart([t], '2026-10-20'), '2026-10-06', 'E oorsprong zonder baselines: ongewijzigd (taakstart − 14)');
  eq(computeEffectiveViewStart([t], '2026-10-20', reach.earliest), '2026-06-17', 'E oorsprong met juli-baseline: 1 juli − 14');

  const zoom = 30;
  const state = { tasks: [t], view: { viewStartDate: '2026-10-20', zoom }, project: {}, baselines: [octBl, julyBl], activeBaselineId: octBl.id, comparedBaselineIds: [julyBl.id, null] };
  eq(computeScrollToDate('2026-07-01', state), (14 - 3) * zoom, 'E Ctrl+Home-rekenregel: 1 juli ligt op de nieuwe oorsprong');
  eq(computeScrollToDate('2026-10-20', { ...state, baselines: undefined }), (14 - 3) * zoom, 'E Ctrl+Home zonder baselines: ongewijzigd');

  const fit = computeFitToProject([t], 600, false, false, undefined, reach.earliest);
  const fitPlain = computeFitToProject([t], 600, false, false);
  ok(!!fit && !!fitPlain && fit.zoom === fitPlain.zoom && fit.viewStartDate === fitPlain.viewStartDate,
    'E Inpassen: zoom en eerste dag blijven de taken');
  eq(fit && Math.round(fit.scrollX / fit.zoom), 14 + 111, 'E Inpassen: scroll vanaf de nieuwe oorsprong (17 juni) naar 20 okt');

  // Scrollbereik: een baseline NA de taken telt mee als laatste dag.
  const spanAxis = buildSharedAxis({ calendar: S().calendar, compressNonWorkdays: false, viewStartDate: '2026-10-06', chartOriginX: 0, zoom: 1, scrollX: 0 });
  const span = computeContentSpanDays([t], '2026-10-06', false, spanAxis, ['2028-01-31']);
  ok((span ?? 0) >= 482, `E scrollbereik reikt tot de laatste baselinedag, kreeg ${span}`);

  // Rapport: de julistrook valt niet onder de tabel.
  const julyOv: BaselineOverlay = new Map([[t.id, { start: '2026-07-01', finish: '2026-07-31', isMilestone: false }]]);
  const octOv: BaselineOverlay = new Map([[t.id, { start: '2026-10-20', finish: '2026-10-21', isMilestone: false }]]);
  const rep = renderPrint([t], octOv, [{ slot: 1, overlay: julyOv }]);
  const julyFills = rep.fills.filter(f => f.color === PRINT_PALETTE.baselineCompare1);
  const julyBox = julyFills.length ? bbox(julyFills.flatMap(f => f.pts)) : null;
  ok(!!julyBox && julyBox.x1 >= rep.dims.tableWidth - 0.5 && julyBox.x2 <= rep.dims.width + 0.5,
    `E rapport: de julistrook ligt in het tijdgebied (tabel tot ${rep.dims.tableWidth}), kreeg ${julyBox ? `${julyBox.x1}..${julyBox.x2}` : 'niets'}`);
  const plain = renderPrint([t], octOv, []);
  ok(rep.dims.width > plain.dims.width, 'E rapport: met juli-vergelijking is de as breder dan zonder');
}

// ══ F. Resource-accent én baselines (eigenaarsbesluit 2026-10-20) ══════════════════════════════
// De balk wordt iets lager; accent en baselinestrook houden hun eigen dikte. Eén van beide aan:
// niets verandert. Alles blijft binnen de rij.
for (const rh of [16, 20, 24, 32, 40, 48]) {
  const plain = barLayout(rh);
  const accentOnly = barLayout(rh, { resourceAccent: true });
  const baselineOnly = barLayout(rh, { baselines: true });
  const both = barLayout(rh, { resourceAccent: true, baselines: true });
  eq(accentOnly, plain, `F rij ${rh}: alleen accent verandert niets`);
  eq(baselineOnly, plain, `F rij ${rh}: alleen baselines verandert niets`);
  eq(both.baselineHeight, plain.baselineHeight, `F rij ${rh}: strook even hoog als zonder accent`);
  eq(both.accentHeight, plain.accentHeight, `F rij ${rh}: accent even hoog als zonder baselines`);
  const bottom = both.barOffset + both.barHeight + 1 + both.accentHeight + both.baselineHeight;
  ok(bottom <= rh + 1e-9, `F rij ${rh}: balk + 1 px + accent + strook past in de rij (eindigt ${bottom})`);
  ok(both.barHeight <= plain.barHeight && both.barHeight >= Math.max(MIN_BAR_HEIGHT_PX, rh * MIN_BAR_HEIGHT_RATIO) - 1e-9,
    `F rij ${rh}: balk krimpt, niet onder de ondergrens (${both.barHeight})`);
  if (rh >= 24) eq(both.barOffset, plain.barOffset, `F rij ${rh}: de balk houdt zijn bovenkant`);
}
eq(Math.round(barLayout(32, { resourceAccent: true, baselines: true }).barHeight * 10) / 10, 16.6, 'F rij 32: balk 16,6 px (was 19,2)');
{
  // De echte renderer: met accent én baselines liggen accent en strook onder een lagere balk, de
  // strook even dik als zonder accent; elke balk in de weergave is even hoog.
  const rh = 32;
  const lay = barLayout(rh, { resourceAccent: true, baselines: true });
  const fills: Fill[] = [];
  const rects: { y: number; h: number; color: string }[] = [];
  const round: { y: number; h: number }[] = [];
  let path: [number, number][] = [];
  const st = { fillStyle: '' };
  const noop = () => {};
  const ctx = {
    lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineCap: '', lineJoin: '', shadowBlur: 0, shadowColor: '',
    set fillStyle(v: string) { st.fillStyle = v; }, get fillStyle() { return st.fillStyle; }, strokeStyle: '',
    fillRect: (_x: number, y: number, _w: number, h: number) => { rects.push({ y, h, color: st.fillStyle }); },
    strokeRect: noop, clearRect: noop, beginPath: () => { path = []; }, closePath: noop,
    moveTo: (x: number, y: number) => { path.push([x, y]); }, lineTo: (x: number, y: number) => { path.push([x, y]); },
    arc: noop, arcTo: noop, ellipse: noop, rect: noop,
    roundRect: (_x: number, y: number, _w: number, h: number) => { round.push({ y, h }); },
    fill: () => { fills.push({ color: st.fillStyle, pts: path }); },
    stroke: noop, save: noop, restore: noop, clip: noop, translate: noop, scale: noop, rotate: noop,
    setLineDash: noop, getLineDash: () => [], fillText: noop, strokeText: noop,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    createLinearGradient: () => ({ addColorStop: noop }), createPattern: () => null,
    quadraticCurveTo: noop, bezierCurveTo: noop, drawImage: noop,
  };
  const st0 = S();
  const withRes = { ...bar, id: bar.id };
  const other = { ...bar, id: 'zonder-resource', name: 'Zonder resource' } as Task;
  const ov: BaselineOverlay = new Map([[bar.id, { start: s0, finish: addDays(s0, 3), isMilestone: false }], [other.id, { start: s0, finish: addDays(s0, 3), isMilestone: false }]]);
  const renderer = new GanttRenderer(ctx as unknown as CanvasRenderingContext2D, {
    rows: [withRes, other].map(t => ({ kind: 'task' as const, rowKey: t.id, task: t, depth: 0, dimmed: false })),
    sequences: [], calendar: st0.calendar, view: { ...st0.view, scrollX: 0, scrollY: 0, zoom: 30 },
    selectedTaskIds: [], canvasWidth: 2000, canvasHeight: 200, rowHeight: rh, headerHeight: 60,
    showBaselineOverlay: true, baselineOverlay: ov, showResourceAccent: true,
    resources: [{ id: 'r1', name: 'Ploeg', type: 'LABOR', description: '', maxUnits: 1, color: '#111111' }],
    assignments: [{ id: 'a1', taskId: bar.id, resourceId: 'r1', unitsPerDay: 1 }],
    activityCodeTypes: [], customFieldDefs: [], taskTypeLabels: {}, barColorNoneLabel: '(geen)',
  });
  renderer.render();
  const bars = round.filter(r => Math.abs(r.h - lay.barHeight) < 1e-6);
  eq(bars.length >= 2, true, 'F renderer: beide rijen (met en zonder resource) hebben een balk van de lagere hoogte');
  const accent = rects.find(r => r.color === '#111111' && Math.abs(r.h - lay.accentHeight) < 1e-6);
  ok(!!accent && Math.abs(accent.y - (60 + lay.barOffset + lay.barHeight + 1)) < 1e-6, 'F renderer: accent 1 px onder de balk');
  const strips = fills.filter(f => f.color === PRINT_PALETTE.baseline).map(f => bbox(f.pts));
  ok(strips.length >= 2 && strips.every(b => Math.abs((b.y2 - b.y1) - lay.baselineHeight) < 1e-6),
    `F renderer: elke strook is ${lay.baselineHeight} px, ook onder het accent`);
  ok(strips.every(b => b.y2 <= 60 + 2 * rh + 1e-6) && strips[0].y2 <= 60 + rh + 1e-6, 'F renderer: strook blijft binnen de rij');
}

if (failures > 0) {
  console.log(`   XX check-baseline-vergelijking: ${failures} van ${checks} controles mislukt`);
  process.exit(1);
}
console.log(`   ok check-baseline-vergelijking: ${checks} controles groen`);
