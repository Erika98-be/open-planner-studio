import type { MilestoneKind } from './task';

/** Eén taak zoals hij in de baseline vastligt. Keyed op de stabiele Task.id zodat matching over
 *  hernoemingen heen werkt; in IFC reist per taak het gebruikte GlobalId mee (`writeBaselineMeta`). */
export interface BaselineTask {
  taskId: string;
  /** Oorspronkelijke bronidentiteit als deze baseline uit een extern bronproject is opgebouwd.
   *  `taskId` blijft bewust de koppeling naar de huidige OPS-taak voor varianceweergave. */
  sourceTaskId?: string;
  sourceTaskCode?: string;
  start: string;           // ISO 8601 — snapshot van de getoonde start t.t.v. opslaan (`shownStart`: werkelijke start, anders earlyStart, anders scheduleStart)
  finish: string;          // ISO 8601 — snapshot van het getoonde einde (`shownFinish`: werkelijk einde bij voltooid, anders earlyFinish, anders scheduleFinish)
  duration: number;        // werkdagen (task.time.scheduleDuration)
  isMilestone: boolean;
  milestoneKind?: MilestoneKind;
}

/** De compacte tekeninvoer voor de actieve baseline. Zowel Gantt als rapport gebruiken deze
 * afleiding, zodat ze per taak altijd exact dezelfde opgeslagen datums tonen. */
export interface BaselineOverlayEntry {
  start: string;
  finish: string;
  isMilestone: boolean;
}

export type BaselineOverlay = Map<string, BaselineOverlayEntry>;

/** Een P6-stijl baseline: onbeperkt aantal; precies één is "actief" (activeBaselineId in de slice). */
export interface Baseline {
  id: string;
  /** Projectidentiteit van een gematerialiseerd extern baselineproject (bv. een XER-baselineproject). */
  sourceProjectId?: string;
  name: string;
  createdAt: string;       // ISO datetime — de snapshot-datum (ook getoond in het rapport)
  tasks: BaselineTask[];   // keyed op taskId
  projectEnd: string;      // ISO — projecteinde t.t.v. de snapshot (voor de variance-samenvatting)
  projectDuration: number; // werkdagen
}

/** Bouw de taak-id-index van de actieve baseline; geen actieve of onbekende baseline = geen overlay. */
export function buildBaselineOverlay(
  baselines: Baseline[],
  activeBaselineId: string | null | undefined,
): BaselineOverlay | undefined {
  if (!activeBaselineId) return undefined;
  const active = baselines.find(b => b.id === activeBaselineId);
  if (!active) return undefined;
  const map: BaselineOverlay = new Map();
  for (const task of active.tasks) {
    map.set(task.taskId, { start: task.start, finish: task.finish, isMilestone: task.isMilestone });
  }
  return map;
}

// ── PROTOTYPE (issue #391): meerdere baselines tegelijk in de Gantt ─────────────────────────────

/** Vaste kleurplaats van een baselinelaag: 0 = de actieve baseline (grijs, zoals altijd),
 *  1 en 2 = de twee vergelijkingsbaselines, elk met een eigen kleur. */
export type BaselineLayerSlot = 0 | 1 | 2;

/** Eén getekende baselinelaag in de Gantt. */
export interface BaselineLayer {
  slot: BaselineLayerSlot;
  baselineId: string;
  name: string;
  overlay: BaselineOverlay;
}

/** Maximaal aantal extra baselines naast de actieve. */
export const MAX_COMPARED_BASELINES = 2;

/** De lagen die de Gantt tekent, van boven naar onder: eerst de actieve baseline, dan de
 *  vergelijkingsplaatsen 1 en 2. Een plaats met een onbekend id of met het id van de actieve
 *  baseline telt niet mee (die staat al bovenaan); de andere plaats houdt haar kleur. */
export function buildBaselineLayers(
  baselines: Baseline[],
  activeBaselineId: string | null | undefined,
  compared: readonly (string | null)[],
): BaselineLayer[] {
  const layers: BaselineLayer[] = [];
  const add = (id: string | null | undefined, slot: BaselineLayerSlot) => {
    if (!id) return;
    if (slot !== 0 && id === activeBaselineId) return;
    const baseline = baselines.find(b => b.id === id);
    if (!baseline) return;
    const overlay = buildBaselineOverlay(baselines, id);
    if (!overlay) return;
    layers.push({ slot, baselineId: id, name: baseline.name, overlay });
  };
  add(activeBaselineId, 0);
  compared.slice(0, MAX_COMPARED_BASELINES).forEach((id, i) => add(id, (i + 1) as BaselineLayerSlot));
  return layers;
}

/** Zet een baseline in of uit de vergelijking. Aan: de eerste lege plaats (vol = geen wijziging).
 *  Uit: alleen die plaats wordt leeg, zodat de andere baseline haar kleur houdt. */
export function toggleComparedBaseline(
  compared: readonly [string | null, string | null],
  id: string,
): [string | null, string | null] {
  const next: [string | null, string | null] = [compared[0], compared[1]];
  const at = next.indexOf(id);
  if (at >= 0) {
    next[at] = null;
    return next;
  }
  const free = next.indexOf(null);
  if (free < 0) return next;
  next[free] = id;
  return next;
}
