import type { Baseline } from '@/types/baseline';
import { generateId } from '@/utils/id';
import type { AppSliceFactory } from './types';
import { isLeafTask } from '@/utils/taskHierarchy';
import { shownFinish, shownStart } from '@/utils/taskDates';

export interface BaselineSlice {
  baselines: Baseline[];
  activeBaselineId: string | null;
  /** Snapshot huidige plan → nieuwe Baseline; retourneert het nieuwe id; zet direct als actief.
   *  Pure metadata: pusht ÉÉN undo-snapshot, roept NOOIT runCPM aan, zet NOOIT scheduleStale. */
  saveBaseline: (name: string) => string;
  /** Verwijder een baseline; was het de actieve, dan valt activeBaselineId op de nieuwste (of null). */
  deleteBaseline: (id: string) => void;
  renameBaseline: (id: string, name: string) => void;
  /** Actieve baseline voor overlay/variance; leest alleen, geen runCPM. */
  setActiveBaseline: (id: string | null) => void;
}

export const createBaselineSlice: AppSliceFactory<BaselineSlice> = (runtime) => (set) => ({
  baselines: [],
  activeBaselineId: null,

  saveBaseline: (name) => {
    const id = generateId('baseline');
    set((s) => {
      runtime.beginUndoable(s);
      // Snapshot de GETOONDE datums (= de balk zoals getekend, `shownStart`/`shownFinish`) per
      // leaf-taak: een gestarte taak met haar werkelijke start, een voltooide met haar werkelijke
      // einde — zoals MS Project (Start → Baseline Start) en P6 (BL Project Start). Zo is de
      // afwijking (`variance.ts`, ook op de getoonde datums) direct na opslaan nul. Vóór de eerste
      // runCPM vallen ze terug op de schedule-datums.
      const leaves = s.tasks.filter(isLeafTask);
      s.baselines.push({
        id,
        name,
        createdAt: new Date().toISOString(),
        tasks: leaves.map((t) => ({
          taskId: t.id,
          start: shownStart(t),
          finish: shownFinish(t),
          duration: t.time.scheduleDuration,
          isMilestone: t.isMilestone,
          ...(t.milestoneKind ? { milestoneKind: t.milestoneKind } : {}),
        })),
        projectEnd: s.cpmResult?.projectEnd ?? '',
        projectDuration: s.cpmResult?.projectDuration ?? 0,
      });
      s.activeBaselineId = id;
      runtime.finishMutation(s);
    });
    return id;
  },

  deleteBaseline: (id) =>
    set((s) => {
      if (!s.baselines.some((b) => b.id === id)) return; // onbekend id: geen snapshot, geen loze undo-stap.
      runtime.beginUndoable(s);
      s.baselines = s.baselines.filter((b) => b.id !== id);
      if (s.activeBaselineId === id) {
        s.activeBaselineId = s.baselines.length ? s.baselines[s.baselines.length - 1].id : null;
      }
      runtime.finishMutation(s);
    }),

  renameBaseline: (id, name) =>
    set((s) => {
      const b = s.baselines.find((x) => x.id === id);
      if (!b) return;
      runtime.beginUndoable(s);
      b.name = name;
      runtime.finishMutation(s);
    }),

  setActiveBaseline: (id) =>
    set((s) => {
      if (s.activeBaselineId === id) return;
      runtime.beginUndoable(s);
      s.activeBaselineId = id;
      runtime.finishMutation(s);
    }),
});
