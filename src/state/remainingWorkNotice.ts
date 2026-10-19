import type { RecomputedRemainingWork } from '@/engine/work/workRuleApply';
import type { NotifyInput } from './slices/types';
import { TASK_TYPES_HELP_ARTICLE_ID } from './helpArticles';

/** Twee zinnen met getallen en een sneltoets: de standaard 5 s is te kort om ze te lezen. */
const READ_TIME_MS = 10_000;

/**
 * De melding wanneer een duurbewerking een bewaard restwerk opnieuw uitrekende dat afweek van
 * inzet × restduur (eigenaarsbesluit 2026-10-19, spec taaktypes §3.5; criterium en verzameling:
 * `settleDurationEdit` in engine/work/workRuleApply.ts). Eén melding per transactie, voor elke route:
 * `updateTask` (paneel, dialoog, Gantt, extensies), `setTaskSplits`, het taakraster (cel, plakken,
 * doorvullen) en de MCP-transactie. Eén taak ⇒ naam en oud → nieuw in uren (som over haar
 * herschreven toewijzingen, in de getalnotatie van de app-taal via `numberParams`); meer taken ⇒
 * alleen het aantal. Geen melding als er niets herschreven is. Ctrl+Z zet de bewaarde waarde terug,
 * want de herschrijving zit in dezelfde undo-stap als de duurbewerking.
 */
export function remainingWorkRecomputedNotice(items: readonly RecomputedRemainingWork[]): NotifyInput | null {
  if (items.length === 0) return null;
  const byTask = new Map<string, { name: string; before: number; after: number }>();
  for (const item of items) {
    const sum = byTask.get(item.taskId) ?? { name: item.taskName, before: 0, after: 0 };
    sum.before += item.beforeMinutes;
    sum.after += item.afterMinutes;
    byTask.set(item.taskId, sum);
  }
  if (byTask.size === 1) {
    const [only] = byTask.values();
    return {
      severity: 'info',
      messageKey: 'notifications.remainingWorkRecomputed',
      params: { name: only.name },
      numberParams: { before: only.before / 60, after: only.after / 60 },
      helpArticleId: TASK_TYPES_HELP_ARTICLE_ID,
      durationMs: READ_TIME_MS,
    };
  }
  return {
    severity: 'info',
    messageKey: 'notifications.remainingWorkRecomputedMany',
    params: { count: byTask.size },
    helpArticleId: TASK_TYPES_HELP_ARTICLE_ID,
    durationMs: READ_TIME_MS,
  };
}
