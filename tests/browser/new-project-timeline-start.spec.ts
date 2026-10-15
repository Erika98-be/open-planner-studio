// Checkstap 14 (2026-10-15): na Home › Nieuw › Maken toonde de tijdlijn de vroegste feestdag van
// de kalender in plaats van de projectstart. Hetzelfde gold voor de app-start, een nieuw document en
// het sluiten van het laatste tabblad. De test leest de positie bij de renderer zelf
// (`__OPS__.gantt.dateX`, alleen lezen); de geteste handelingen zijn echte klikken en toetsen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, state, test } from './fixtures/ops';
import { ORIGIN_PADDING_DAYS } from '@/utils/ganttViewport';

const EXAMPLE = join(process.cwd(), 'public/examples/03-kantoorgebouw-zuidas.ifc');
const canvas = (page: Page) => page.getByTestId('gantt-primary-canvas');

/** Canvas-x waar de renderer `isoDate` tekent; 0 = linkerrand van de tijdlijn. */
const dateX = (page: Page, isoDate: string) => page.evaluate(
  date => window.__OPS__!.gantt.dateX(date),
  isoDate,
);
const projectView = (page: Page) => page.evaluate(() => {
  const s = window.__OPS__!.store.getState();
  return { startDate: s.project.startDate, zoom: s.view.zoom };
});

/** De projectstart staat in beeld, met dezelfde marge als een project met taken (14 dagen). Zonder
 *  fix lag de oorsprong op de vroegste feestdag (startjaar − 1) en stond de start honderden dagen
 *  rechts van de linkerrand. */
async function expectProjectStartAtOrigin(page: Page): Promise<void> {
  const { startDate, zoom } = await projectView(page);
  await expect.poll(() => dateX(page, startDate), {
    message: `projectstart ${startDate} staat niet op de oorsprong van de tijdlijn`,
  }).toBeCloseTo(ORIGIN_PADDING_DAYS * zoom, 0);
}

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

/** Home › Nieuw › (startdatum typen) › Maken. `startDate` als dd-mm-jjjj, zoals de gebruiker typt. */
async function createEmptyProject(page: Page, startDate?: string): Promise<void> {
  await page.locator('[data-ops-ribbon-item="new"]').click();
  const dialog = page.locator('[data-ops-project-dialog="new"]');
  await expect(dialog).toBeVisible();
  if (startDate) {
    await dialog.getByRole('group', { name: /^(Startdatum|Start date)$/i }).locator('input').first().click();
    await page.keyboard.type(startDate.replace(/-/g, ''));
    await page.keyboard.press('Tab');
  }
  await dialog.locator('[data-ops-project-primary]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => state(page).then(s => s.tasks.length)).toBe(0);
}

/** Pan met het echte muiswiel weg van de oorsprong, zodat een herstel-actie iets te doen heeft. */
async function panAway(page: Page): Promise<void> {
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ scrollMode: 'position', positionDivision: 'left-right' }));
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => state(page).then(s => s.view.scrollX)).toBeGreaterThan(500);
}

test('app-start: de lege tijdlijn begint bij de projectstart', async ({ page, ops: _ops }) => {
  await expectProjectStartAtOrigin(page);
});

test('nieuw project na een geopend bestand, met eigen startdatum: tijdlijn op de projectstart', async ({ page, ops: _ops }) => {
  await openExample(page);
  const before = await state(page);
  await createEmptyProject(page, '01-03-2027');
  const after = await state(page);
  expect(after.documentIds.length).toBe(before.documentIds.length + 1);
  expect((await projectView(page)).startDate).toBe('2027-03-01');
  expect(after.view.zoom).toBe(30);
  await expectProjectStartAtOrigin(page);
});

test('nieuw project zonder ander document: tijdlijn op de projectstart', async ({ page, ops: _ops }) => {
  await createEmptyProject(page, '01-03-2027');
  await expectProjectStartAtOrigin(page);
});

test('laatste tabblad sluiten en newDocument: het verse document begint bij de projectstart', async ({ page, ops: _ops }) => {
  await openExample(page);
  // Het voorbeeld hergebruikt het lege tabblad; sluit dat ene tabblad met de echte sluitknop.
  expect((await state(page)).documentIds.length).toBe(1);
  await page.locator('[data-ops-tabstrip] .ops-tab-close').first().click();
  await expect.poll(() => state(page).then(s => s.tasks.length)).toBe(0);
  await expectProjectStartAtOrigin(page);

  // `planner_new_document` (MCP) heeft geen eigen knop; de dev-brug roept dezelfde storeactie aan.
  await openExample(page);
  await page.evaluate(() => window.__OPS__!.store.getState().newDocument());
  await expectProjectStartAtOrigin(page);
});

test('lege tijdlijn: Ctrl+0, kale 0 en Ctrl+Home brengen de projectstart terug in beeld', async ({ page, ops: _ops }) => {
  await createEmptyProject(page, '01-03-2027');

  await panAway(page);
  await canvas(page).click({ position: { x: 200, y: 200 } });
  await page.keyboard.press('Control+0');
  await expectProjectStartAtOrigin(page);

  await panAway(page);
  await canvas(page).click({ position: { x: 200, y: 200 } });
  await page.keyboard.press('0');
  await expectProjectStartAtOrigin(page);

  // Ctrl+Home springt naar de statusdatum (anders vandaag) met drie dagen marge, in dezelfde
  // oorsprong als de renderer.
  await page.evaluate(() => window.__OPS__!.store.getState().setProject({ statusDate: '2027-03-10' }));
  await panAway(page);
  await canvas(page).click({ position: { x: 200, y: 200 } });
  await page.keyboard.press('Control+Home');
  const { zoom } = await projectView(page);
  await expect.poll(() => dateX(page, '2027-03-10')).toBeCloseTo(3 * zoom, 0);
});

test('nieuw project: de eerste taak via de rij "Nieuwe taak" blijft in beeld', async ({ page, ops: _ops }) => {
  await createEmptyProject(page, '01-03-2027');
  await page.locator('text=/^(Nieuwe taak|New task)$/').first().click();
  await page.keyboard.type('Eerste taak');
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page).then(s => s.tasks.length)).toBe(1);
  const start = (await state(page)).tasks[0]!.scheduleStart.slice(0, 10);
  const width = (await canvas(page).boundingBox())!.width;
  await expect.poll(() => dateX(page, start)).toBeGreaterThanOrEqual(0);
  expect(await dateX(page, start)).toBeLessThan(width);
});

test('sjabloon met fasen: zoom blijft gelijk en elke fase staat in raster en Gantt', async ({ page, ops: _ops }) => {
  await page.locator('[data-ops-ribbon-item="new"]').click();
  const dialog = page.locator('[data-ops-project-dialog="new"]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^(Fasering-template|Phasing template|Template)/i }).first().click();
  await page.getByRole('option', { name: /^(Woningbouw|Residential)/i }).click();
  await dialog.locator('[data-ops-project-primary]').click();
  await expect(dialog).toBeHidden();

  const after = await state(page);
  expect(after.tasks.length).toBeGreaterThan(0);
  expect(after.view.zoom).toBe(30);
  // Zonder herberekende rijen bleef het raster leeg en tekende de Gantt geen balken.
  expect(after.viewRows.map(row => row.kind === 'task' ? row.taskId : null)).toEqual(after.tasks.map(task => task.id));
  await expect(page.locator(
    `[data-task-grid-surface-id="gantt-task-grid"] [data-grid-data-row="true"][data-grid-row-key="${after.tasks[0]!.id}"]`,
  )).toBeVisible();
  const first = after.tasks[0]!;
  await expect.poll(() => page.evaluate(id => window.__OPS__!.gantt.taskBarPoint(id), first.id)).not.toBeNull();
});
