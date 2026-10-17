// Eigenaarsbesluit 2026-10-17: elke weigering is een RODE melding (`toast-error`, `role="alert"`)
// die blijft staan tot de gebruiker hem wegklikt. Een blauwe info verdween na 5 s, en de eigenaar
// miste zo een geweigerde duur.
//
// Plus de fout in hetzelfde onderwerp: na een geweigerde duur bleef het getypte getal in het veld
// *Duur* van het taakpaneel staan. Het veld hoort dan weer de echte duur te tonen.
//
// Echte events: het voorbeeld opent via Bestand → Voorbeelden, de duur via klik + typen + Enter,
// het mijlpaalvinkje via een klik, de melding sluit via het kruisje. De `__OPS__`-brug kiest alleen
// de taak (fixture) en leest state.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

async function openAkkers(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('.ribbon-tab--file').first().click();
  await page.locator('button.backstage-nav-item[data-tour-anchor="backstage-examples"]').click();
  const card = page.locator('button.backstage-export-card')
    .filter({ has: page.locator('h4', { hasText: /De Akkers/ }) }).first();
  await card.click();
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().tasks.length)).toBeGreaterThan(20);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showPropertiesPanel: true, rightPanelCollapsed: false }));
}

/** Kies een taak (fixture) en geef haar id terug. */
async function selectTask(page: Page, find: string): Promise<string> {
  const id = await page.evaluate((name) => {
    const s = window.__OPS__!.store.getState();
    const task = s.tasks.find(t => t.name === name);
    if (!task) throw new Error(`taak ${name} niet gevonden`);
    s.selectTask(task.id);
    return task.id;
  }, find);
  return id;
}

const taskTime = (page: Page, id: string) => page.evaluate((taskId) => {
  const task = window.__OPS__!.store.getState().tasks.find(t => t.id === taskId)!;
  return { duration: task.time.scheduleDuration, completion: task.time.completion, milestone: !!task.isMilestone };
}, id);

test('geweigerde duur: rode melding blijft na 6 s, sluit via het kruisje, en het veld toont de echte duur', async ({ page, ops: _ops }) => {
  await openAkkers(page);
  const id = await selectTask(page, 'Upper floor slab — House 4');
  const before = await taskTime(page, id);
  expect(before.duration).toBe(4);
  expect(before.completion).toBeCloseTo(0.5, 5);

  const field = page.locator('[data-ops-rail] [data-ops-duration-value]');
  await expect(field).toHaveValue('4');
  await field.click();
  await field.fill('');
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');

  const refusal = page.locator('.ops-toast', { hasText: /Upper floor slab — House 4/ });
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toHaveClass(/toast-error/);
  await expect(refusal).toHaveAttribute('role', 'alert');
  await expect(refusal).toContainText("'Upper floor slab — House 4'");
  // Het veld toont direct weer de echte duur, niet de getypte 1.
  await expect(field).toHaveValue('4');
  expect((await taskTime(page, id)).duration).toBe(4);

  // Een info zou na 5 s weg zijn; een weigering staat er na 6 s nog.
  await page.waitForTimeout(6_000);
  await expect(refusal).toBeVisible();

  await refusal.locator('[data-ops-toast-close]').click();
  await expect(refusal).toHaveCount(0);
  await expect(field).toHaveValue('4');
});

test('geweigerde mijlpaal (taak met toewijzing): rode melding met role=alert', async ({ page, ops: _ops }) => {
  await openAkkers(page);
  const name = await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    const assigned = new Set(s.assignments.map(a => a.taskId));
    const task = s.tasks.find(t => assigned.has(t.id) && t.childIds.length === 0 && !t.isMilestone)!;
    return task.name;
  });
  const id = await selectTask(page, name);
  const checkbox = page.locator('[data-ops-rail] label', { hasText: /^Milestone$/ }).first().locator('input[type=checkbox]');
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();

  const refusal = page.locator('.ops-toast', { hasText: /cannot become a milestone/ });
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toHaveClass(/toast-error/);
  await expect(refusal).toHaveAttribute('role', 'alert');
  await expect(checkbox).not.toBeChecked();
  expect((await taskTime(page, id)).milestone).toBe(false);
});
