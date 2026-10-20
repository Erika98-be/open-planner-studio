// PROTOTYPE (issue #391): meerdere baselines tegelijk in de Gantt. Opent de kijkscène
// `?qaScene=meerdere-baselines` (drie baselines; "Contract" actief, twee in "Vergelijk met") en
// controleert met echte klikken en hovers: de keuzelijst met vinkjes, de legenda en de tooltip op een
// baselinelaag. `__OPS__` leest alleen. Met `OPS_QA_SHOTS=<map>` legt de spec schermbeelden vast
// (licht, donker, open keuzelijst) voor de ontwerpbeoordeling.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

const SHOTS = process.env.OPS_QA_SHOTS;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name) });
}

const compared = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().ui.comparedBaselineIds);
const idOf = (page: Page, name: string) => page.evaluate(n => window.__OPS__!.store.getState().baselines
  .find(b => b.name === n)!.id, name);

test('meerdere baselines: Vergelijk met, legenda en tooltip per laag', async ({ page, ops: _ops }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?qaScene=meerdere-baselines');
  const picker = page.locator('[data-ops-compare-baselines]');
  await expect(picker).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().baselines.map(b => b.name)))
    .toEqual(['Contract', 'Herplanning maart', 'Herplanning juni']);
  const maart = await idOf(page, 'Herplanning maart');
  const juni = await idOf(page, 'Herplanning juni');
  expect(await compared(page)).toEqual([maart, juni]);

  // Legenda in de statusbalk: de actieve baseline eerst, dan de twee vergelijkingen, elk met een eigen kleurblokje.
  const legend = page.locator('[data-ops-baseline-legend]');
  await expect(legend).toHaveText(/Contract.*Herplanning maart.*Herplanning juni/);
  await expect(legend.locator('[data-ops-baseline-swatch]')).toHaveCount(3);

  // Het welkomstvenster kan ná de scène nog opkomen (verse browser); het hoort niet bij deze check.
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showWelcomeDialog: false, showTourOverlay: false }));
  await expect(page.locator('[data-ops-welcome-dialog]')).toHaveCount(0);
  // Weg met de omlijning van de kijkscène voor de schermbeelden.
  await picker.evaluate(el => { el.style.outline = ''; });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(t => window.__OPS__!.store.getState().setUI({ uiTheme: t }), theme);
    await page.waitForTimeout(400);
    await shot(page, `meerdere-baselines-${theme}.png`);
  }
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ uiTheme: 'light' }));

  // Hover op elke baselinelaag van één taak: per laag op een x binnen die laag (uit de eigen as van
  // de renderer), en een paar y-waarden onder de balk. De tooltip noemt de laag.
  const probe = await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    const g = window.__OPS__!.gantt;
    const byName = (n: string) => s.baselines.find(b => b.name === n)!;
    const layers = [byName('Contract'), byName('Herplanning maart'), byName('Herplanning juni')];
    // Een taak waarvan alle drie de lagen binnen de tijdlijn vallen (canvas-x tussen 5 en 900).
    const startOf = (l: typeof layers[number], id: string) => l.tasks.find(x => x.taskId === id)?.start;
    const task = s.tasks.find(t => !t.isMilestone && g.taskBarPoint(t.id, 'left', 'primary') !== null
      && layers.every(l => { const st = startOf(l, t.id); const x = st ? g.dateX(st) : null; return x !== null && x > 5 && x < 900; }))!;
    const left = g.taskBarPoint(task.id, 'left', 'primary')!;
    const barX = g.dateX(task.time.earlyStart ?? task.time.scheduleStart)!;
    const xs = layers.map(l => left.x - barX + g.dateX(startOf(l, task.id)!)! + 3);
    return { id: task.id, y: left.y, xs };
  });
  const seen = new Set<string>();
  for (const [slot, x] of probe.xs.entries()) {
    for (let dy = 8; dy <= 18; dy += 0.5) {
      await page.mouse.move(x, probe.y + dy);
      const tip = page.locator(`[data-ops-baseline-tooltip="${slot}"]`);
      if (await tip.count()) {
        seen.add(String(slot));
        if (slot === 2) await shot(page, 'meerdere-baselines-tooltip.png');
        break;
      }
    }
  }
  expect([...seen].sort()).toEqual(['0', '1', '2']);
  await page.mouse.move(5, 5);

  // Keuzelijst: alleen de niet-actieve baselines, beide aangevinkt; uitvinken laat de lijst open en
  // maakt alleen die plaats leeg.
  await picker.locator('.ops-select__trigger').click();
  const list = page.getByRole('listbox');
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option', { name: 'Herplanning maart' })).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('option', { name: 'Herplanning juni' })).toHaveAttribute('aria-selected', 'true');
  await shot(page, 'meerdere-baselines-keuzelijst.png');
  await list.getByRole('option', { name: 'Herplanning maart' }).click();
  await expect(list).toBeVisible();
  expect(await compared(page)).toEqual([null, juni]);
  await expect(legend).toHaveText(/Contract.*Herplanning juni/);
  await list.getByRole('option', { name: 'Herplanning maart' }).click();
  expect(await compared(page)).toEqual([maart, juni]);
});
