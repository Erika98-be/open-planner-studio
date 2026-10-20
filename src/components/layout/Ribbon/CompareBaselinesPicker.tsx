import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { Select, type SelectOption } from '@/components/common/Select';
import { BASELINE_SLOT_COLOR } from '@/components/canvas/BaselineTooltipContent';
import { buildBaselineLayers, toggleComparedBaseline, type BaselineLayerSlot } from '@/types/baseline';

/**
 * PROTOTYPE (issue #391): keuzelijst "Vergelijk met" naast de knop Baseline-overlay. Elke baseline
 * behalve de actieve heeft een vinkje; maximaal twee staan aan. Een aangevinkte baseline toont het
 * kleurblokje van haar laag; de legenda met alle lagen staat in de statusbalk (`BaselineLegend`).
 *
 * De keuze is alleen UI-state (`ui.comparedBaselineIds`): niet in het document, niet in de
 * instellingen.
 */
export function CompareBaselinesPicker() {
  const { t: tMenu } = useTranslation('menu');
  const baselines = useAppStore(s => s.baselines);
  const activeBaselineId = useAppStore(s => s.activeBaselineId);
  const compared = useAppStore(s => s.ui.comparedBaselineIds);
  const showBaselineOverlay = useAppStore(s => s.ui.showBaselineOverlay);
  const setUI = useAppStore(s => s.setUI);

  const layers = useMemo(
    () => buildBaselineLayers(baselines, activeBaselineId, compared),
    [baselines, activeBaselineId, compared],
  );
  const slotOf = (id: string): BaselineLayerSlot | undefined => layers.find(l => l.baselineId === id)?.slot;
  const comparedLayers = layers.filter(l => l.slot !== 0);
  const full = comparedLayers.length >= 2;

  const options: SelectOption[] = baselines
    .filter(b => b.id !== activeBaselineId)
    .map(b => {
      const slot = slotOf(b.id);
      return {
        value: b.id,
        label: b.name,
        swatch: slot !== undefined ? BASELINE_SLOT_COLOR[slot] : undefined,
        // Vol: alleen de aangevinkte zijn nog te kiezen (om ze uit te zetten).
        disabled: full && slot === undefined,
      };
    });

  const selectedValues = comparedLayers.map(l => l.baselineId);
  const valueLabel = comparedLayers.length ? comparedLayers.map(l => l.name).join(', ') : undefined;

  return (
    <div
      data-ops-compare-baselines
      title={tMenu('ribbon.compareBaselinesHint')}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 4px', width: 170 }}
    >
      <span className="ribbon-info">{tMenu('ribbon.compareBaselines')}</span>
      <Select
        value=""
        selectedValues={selectedValues}
        onChange={id => setUI({ comparedBaselineIds: toggleComparedBaseline(compared, id) })}
        options={options}
        valueLabel={valueLabel}
        placeholder={options.length ? tMenu('ribbon.compareBaselinesNone') : tMenu('ribbon.compareBaselinesEmpty')}
        disabled={options.length === 0 || !showBaselineOverlay}
        aria-label={tMenu('ribbon.compareBaselines')}
        className="ops-select__trigger--compact"
      />
    </div>
  );
}
