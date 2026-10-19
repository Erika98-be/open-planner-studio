import type { Locator, Page } from '@playwright/test';
import { expect, seedProject, test } from './fixtures/ops';

// Delete en Backspace mogen de geselecteerde taak niet verwijderen terwijl een modaal venster
// openstaat. Gemeten fout (2026-10-19, showcase, 16 taken): met de focus op een knop in het
// kalendervenster, in *Taak bewerken* of in *Projectinstellingen* gaf Delete/Backspace 15 taken,
// terwijl het venster openbleef. Fixtures (taken, selectie, venster openen) gaan via de brug; de
// geteste handeling is steeds een echte toetsaanslag.

const taskCount = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().tasks.length);

async function seedAndSelect(page: Page): Promise<string> {
  const ids = await seedProject(page, [
    { name: 'Set up site', start: '2026-09-07', finish: '2026-09-08', durationDays: 2 },
    { name: 'Foundations', start: '2026-09-09', finish: '2026-09-11', durationDays: 3 },
    { name: 'Walls', start: '2026-09-14', finish: '2026-09-18', durationDays: 5 },
  ]);
  await page.evaluate((id) => window.__OPS__!.store.getState().selectTask(id), ids[0]!);
  return ids[0]!;
}

async function pressDeleteKeys(page: Page, focusTarget: Locator) {
  await focusTarget.focus();
  await expect(focusTarget).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
}

test('Delete en Backspace in het kalendervenster verwijderen de taak niet', async ({ page, ops: _ops }) => {
  await seedAndSelect(page);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true }));
  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();

  await pressDeleteKeys(page, dialog.getByRole('button', { name: 'Mon–Fri' }));
  expect(await taskCount(page)).toBe(3);
  await expect(dialog).toBeVisible();
});

test('Delete en Backspace op Cancel in Taak bewerken verwijderen de taak niet', async ({ page, ops: _ops }) => {
  const id = await seedAndSelect(page);
  await page.evaluate((taskId) => window.__OPS__!.store.getState().setUI({ showTaskDialog: true, editingTaskId: taskId }), id);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await pressDeleteKeys(page, dialog.getByRole('button', { name: 'Cancel', exact: true }));
  expect(await taskCount(page)).toBe(3);
  expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.editingTaskId)).toBe(id);
});

test('Delete en Backspace in een tekstveld van Taak bewerken wissen gewoon tekens', async ({ page, ops: _ops }) => {
  const id = await seedAndSelect(page);
  await page.evaluate((taskId) => window.__OPS__!.store.getState().setUI({ showTaskDialog: true, editingTaskId: taskId }), id);
  const dialog = page.getByRole('dialog');
  const name = dialog.locator('input[type="text"], input:not([type])').first();
  await expect(name).toHaveValue('Set up site');

  await name.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await expect(name).toHaveValue('et up sit');
  expect(await taskCount(page)).toBe(3);
});

for (const [label, flag] of [
  ['Projectinstellingen', 'showProjectInfoDialog'],
  ['App-instellingen', 'showSettingsDialog'],
] as const) {
  test(`Delete en Backspace in ${label} verwijderen de taak niet`, async ({ page, ops: _ops }) => {
    await seedAndSelect(page);
    await page.evaluate((key) => window.__OPS__!.store.getState().setUI({ [key]: true }), flag);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await pressDeleteKeys(page, dialog.getByRole('button', { name: 'Help on this topic' }).first());
    expect(await taskCount(page)).toBe(3);
    await expect(dialog).toBeVisible();
  });
}

test('zonder venster verwijdert Delete de geselecteerde taak wel', async ({ page, ops: _ops }) => {
  const id = await seedAndSelect(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Delete');
  await expect.poll(() => taskCount(page)).toBe(2);
  expect(await page.evaluate((taskId) => window.__OPS__!.store.getState().tasks.some(t => t.id === taskId), id)).toBe(false);
});
