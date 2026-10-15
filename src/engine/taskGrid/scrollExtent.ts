/**
 * Eén bron voor de verticale schuifruimte van de takenlijst en de Gantt.
 *
 * De takenlijst en de Gantt delen één verticale schuifstand (`view.scrollY`). Ze lopen alleen rij
 * op rij gelijk als hun maximale schuifstand ook gelijk is. Daarom rekenen beide met dezelfde
 * inhoudshoogte: alle zichtbare rijen, plus de spookregel onderaan (alleen in de boomweergave,
 * zie `ghostRow.ts`), plus een eindstrook ter dikte van de zwevende balk. Die strook houdt de laatste
 * rij vrij van de horizontale balk die over de onderrand ligt.
 *
 * Eigenaarsbevinding 2026-10-15 (checkstap 18, PR #362): zonder dit kon de takenlijst één rij verder
 * schuiven dan de Gantt. De store klemde de stand dan op de Gantt-grens; bij de volgende
 * horizontale scroll zette het raster zijn eigen stand daarop terug en sprong hij omhoog.
 */

/** Dikte van de zwevende schuifbalken over takenlijst en Gantt (gelijk aan `SCROLLBAR_GUTTER`). */
export const TASK_LIST_OVERLAY_SCROLLBAR_SIZE = 8;

/** Lege strook onder de laatste rij: precies één zwevende balk hoog. */
export const TASK_LIST_SCROLL_END_PADDING = TASK_LIST_OVERLAY_SCROLLBAR_SIZE;

/** Aantal rijen dat meetelt voor de schuifhoogte: de zichtbare rijen plus eventueel de spookregel. */
export function taskListScrollRowCount(viewRowCount: number, hasGhostRow: boolean): number {
  return Math.max(0, viewRowCount) + (hasGhostRow ? 1 : 0);
}

/** Schuifbare inhoudshoogte ONDER de kop, gelijk voor takenlijst en Gantt. */
export function taskListScrollContentHeight(viewRowCount: number, rowHeight: number, hasGhostRow: boolean): number {
  return taskListScrollRowCount(viewRowCount, hasGhostRow) * rowHeight + TASK_LIST_SCROLL_END_PADDING;
}
