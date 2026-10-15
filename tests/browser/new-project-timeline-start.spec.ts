// Checkstap 14 (2026-10-15): na Home › Nieuw › Maken toonde de tijdlijn december 2024 in plaats
// van de projectstart. Oorzaak: een lege Gantt legt zijn oorsprong op de vroegste feestdag van de
// wizardkalender (startjaar − 1), en scrollX bleef 0. Een nieuw project gebruikt nu hetzelfde
// `pendingFit`-signaal als een geopend bestand. De test leest de positie bij de renderer zelf
// (`__OPS__.gantt.dateX`, alleen lezen); alle handelingen zijn echte klikken.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, state, test } from './fixtures/ops';

const EXAMPLE = join(process.cwd(), 'public/examples/03-kantoorgebouw-zuidas.ifc');

/** Canvas-x waar de renderer `isoDate` tekent; 0 = linkerrand van de tijdlijn. */
const dateX = (page: Page, isoDate: string) => page.evaluate(
  date => window.__OPS__!.gantt.dateX(date),
  isoDate,
);

async function openExample(page: Page): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ }).click();
  await (await chooser).setFiles({
    name: '03-kantoorgebouw-zuidas.ifc',
    mimeType: 'application/octet-stream',
    buffer: readFileSync(EXAMPLE),
  });
  await expect.poll(() => state(page).then(s => s.tasks.length)).toBeGreaterThan(0);
  await expect.poll(() => state(page).then(s => s.view.pendingFit)).toBe(false);
}

async function createEmptyProject(page: Page): Promise<string> {
  await page.locator('[data-ops-ribbon-item="new"]').click();
  const dialog = page.locator('[data-ops-project-dialog="new"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-ops-project-primary]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => state(page).then(s => s.tasks.length)).toBe(0);
  return page.evaluate(() => window.__OPS__!.store.getState().project.startDate);
}

async function expectStartAtLeftEdge(page: Page, startDate: string): Promise<void> {
  // De wizardkalender heeft feestdagen vanaf (startjaar − 1). Zonder fix lag de projectstart daardoor
  // honderden dagen rechts van de linkerrand (bij 30 px/dag: ver buiten beeld).
  await expect.poll(() => dateX(page, startDate), {
    message: `projectstart ${startDate} staat niet links in de tijdlijn`,
  }).toBeCloseTo(0, 0);
}

test('nieuw project na een geopend bestand: de tijdlijn begint bij de projectstart', async ({ page, ops: _ops }) => {
  await openExample(page);
  const before = await state(page);

  const startDate = await createEmptyProject(page);
  const after = await state(page);
  expect(after.documentIds.length).toBe(before.documentIds.length + 1);
  expect(after.view.viewStartDate).toBe(startDate);
  await expectStartAtLeftEdge(page, startDate);
});

test('nieuw project zonder ander document: de tijdlijn begint bij de projectstart', async ({ page, ops: _ops }) => {
  const startDate = await createEmptyProject(page);
  await expectStartAtLeftEdge(page, startDate);
});
