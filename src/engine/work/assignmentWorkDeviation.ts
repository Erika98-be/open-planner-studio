// assignmentWorkDeviation.ts — de voorwaarde van het waarschuwingsteken naast *Werk (rest)* in het
// toewijzingenblok (`TaskAssignmentsSection`). Puur, geen store, zodat de planningssuite precies de
// regel toetst die de UI toont.
import type { Task } from '@/types/task';
import { remainingMinutesOf } from './workRuleApply';
import { storedWorkDeviates } from './workDeviation';

/**
 * Opgeslagen restwerk dat afwijkt van inzet × restduur krijgt een markering — géén stille
 * aanpassing van de inzet (brondata). Niet bij een contour: die vormt de inzet per dag zelf.
 * Tolerantie 1 % (en minstens een minuut) tegen afronding. Geeft de twee getallen in uren (twee
 * decimalen) voor de tooltip, of `null` als er niets te melden is.
 */
export function assignmentWorkDeviation(
  task: Task,
  unitsPerDay: number,
  storedRemainingMinutes: number | undefined,
  hoursPerDay: number,
  contoured: boolean,
): { stored: number; derived: number } | null {
  if (storedRemainingMinutes === undefined || contoured) return null;
  const derived = remainingMinutesOf(task, { hoursPerDay }) * unitsPerDay;
  const stored = storedRemainingMinutes;
  if (!storedWorkDeviates(stored, derived)) return null;
  const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
  return { stored: hours(stored), derived: hours(derived) };
}
