// Gedeelde opbouw van een baseline uit een ingelezen BRONproject (een P6-baselineproject), voor
// de XER-lezer (`xerMultiProject.ts`, PROJECT.sum_base_proj_id) en de P6 XML-lezer
// (`<BaselineProject>` met `OriginalProjectObjectId`). Eén regel voor beide formaten: elke bladtaak
// van de bron wordt een baselinetaak, gekoppeld aan de taak van het eigenaarproject met dezelfde
// id, anders met dezelfde unieke code (`wbsCode` = activity-id); datums = de getoonde (`shownStart`/
// `shownFinish`: werkelijk zodra gestart/voltooid, anders early, anders gepland).
import type { BaselineTask } from '@/types/baseline';
import type { Task } from '@/types/task';
import { isLeafTask } from '@/utils/taskHierarchy';
import { shownFinish, shownStart } from '@/utils/taskDates';

function uniqueTaskByCode(tasks: readonly Task[]): Map<string, Task> {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.wbsCode) continue;
    const matches = grouped.get(task.wbsCode) ?? [];
    matches.push(task);
    grouped.set(task.wbsCode, matches);
  }
  return new Map(
    [...grouped]
      .filter(([, matches]) => matches.length === 1)
      .map(([code, matches]) => [code, matches[0]]),
  );
}

/** Baselinetaken + projecteinde uit de bladtaken van een bronproject, gekoppeld aan de eigenaar. */
export function baselineTasksFromSource(
  ownerTasks: readonly Task[],
  sourceTasks: readonly Task[],
): { tasks: BaselineTask[]; projectEnd: string } {
  const ownerLeaves = ownerTasks.filter(isLeafTask);
  const ownerById = new Map(ownerLeaves.map(task => [task.id, task]));
  const ownerByCode = uniqueTaskByCode(ownerLeaves);
  const tasks = sourceTasks.filter(isLeafTask).map(task => {
    const matched = ownerById.get(task.id) ?? ownerByCode.get(task.wbsCode);
    return {
      taskId: matched?.id ?? task.id,
      sourceTaskId: task.id,
      sourceTaskCode: task.wbsCode,
      // Zoals P6's BL Project Start/Finish: de geplande datums tot de basislijntaak gestart is, daarna
      // de werkelijke start (en bij voltooid het werkelijke einde) — de getoonde datums, dezelfde
      // bron als `saveBaseline` en de afwijking (`variance.ts`).
      start: shownStart(task),
      finish: shownFinish(task),
      duration: task.time.scheduleDuration,
      isMilestone: task.isMilestone,
      ...(task.milestoneKind ? { milestoneKind: task.milestoneKind } : {}),
    };
  });
  const finishes = tasks.map(task => task.finish).filter(Boolean).sort();
  return { tasks, projectEnd: finishes[finishes.length - 1] ?? '' };
}
