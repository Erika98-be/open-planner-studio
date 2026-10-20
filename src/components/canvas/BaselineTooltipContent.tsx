import { useTranslation } from 'react-i18next';
import { useDisplayDate } from '@/hooks/displayDate';
import type { Task } from '@/types/task';
import type { BaselineLayer, BaselineLayerSlot } from '@/types/baseline';
import { TooltipRow } from './TaskTooltipContent';

/** PROTOTYPE (issue #391): CSS-kleur per baselinelaag; dezelfde thema-tokens als de tekenlaag. */
export const BASELINE_SLOT_COLOR: Record<BaselineLayerSlot, string> = {
  0: 'var(--theme-bar-baseline, #6B7280)',
  1: 'var(--theme-bar-baseline-compare-1, #0891B2)',
  2: 'var(--theme-bar-baseline-compare-2, #C026D3)',
};

/** Klein kleurblokje dat laat zien welke baselinelaag (kleur) bedoeld is. */
export function BaselineSwatch({ slot }: { slot: BaselineLayerSlot }) {
  return (
    <span
      aria-hidden="true"
      data-ops-baseline-swatch={slot}
      style={{
        display: 'inline-block', width: 14, height: 4, borderRadius: 1, marginInlineEnd: 6,
        verticalAlign: 'middle', background: BASELINE_SLOT_COLOR[slot],
      }}
    />
  );
}

/**
 * PROTOTYPE (issue #391): hovertooltip op een baselinelaag in de Gantt. Laat zien welke baseline
 * (naam + kleur) bij deze laag hoort, en de datums van de taak in die baseline.
 */
export function BaselineTooltipContent({ task, slot, layers }: {
  task: Task;
  slot: BaselineLayerSlot;
  layers: BaselineLayer[];
}) {
  const { t: tTask } = useTranslation('task');
  const dd = useDisplayDate();
  const layer = layers.find(l => l.slot === slot);
  const entry = layer?.overlay.get(task.id);
  if (!layer || !entry) return null;
  const format = (iso: string) => (iso ? dd.date(iso) : '-');
  return (
    <div data-ops-baseline-tooltip={slot}>
      <div className="tooltip-title"><BaselineSwatch slot={slot} />{layer.name}</div>
      <TooltipRow
        label={slot === 0 ? tTask('tooltip.baselineActive') : tTask('tooltip.baselineCompared')}
        colon={false}
      />
      <TooltipRow label={tTask('tooltip.baselineTask')} value={task.name} />
      <TooltipRow label={tTask('table.start')} value={format(entry.start)} />
      {!entry.isMilestone && <TooltipRow label={tTask('table.finish')} value={format(entry.finish)} />}
    </div>
  );
}
