import type { Locator, Page } from '@playwright/test';
import { expect, test, waitForOps } from './fixtures/ops';
import { blocksOf, mspdiWithBlocks, openMspdiAndCalendarDialog } from './fixtures/mspdiBlocks';

/**
 * Instelling Tijdnotatie (24 of 12 uur). Alle geteste handelingen gaan via echte muis- en
 * toetsenbordevents: de instelling omzetten in het instellingenpaneel, het MSPDI-bestand openen via de
 * echte bestandskiezer, tijden typen en Toepassen. De dev-brug opent alleen het kalendervenster (zoals
 * de bestaande kalendertests), zet de Gantt-zoom als fixture en leest state.
 */

const TIME_FORMAT = /^(Time format|Tijdnotatie)$/;

async function chooseTimeFormat(page: Page, option: RegExp): Promise<void> {
  await page.getByTitle(/^(Settings|Instellingen)$/, { exact: true }).click();
  const settings = page.locator('.settings-dialog');
  await expect(settings).toBeVisible();
  await settings.getByLabel(TIME_FORMAT).click();
  await page.getByRole('option', { name: option }).click();
  await settings.locator('.modal-close-btn').click();
  await expect(settings).toBeHidden();
}

const mondayBlocks = (page: Page) => page.evaluate(() =>
  window.__OPS__!.store.getState().calendar.workTime?.byWeekday[1] ?? null);

const band = (dialog: Locator, day: number, index: number, edge: 'start' | 'end') =>
  dialog.locator(`[data-ops-worktime-day="${day}"] [data-ops-band]`).nth(index)
    .locator(`[data-ops-time-input="band-${edge}"]`);

async function typeTime(field: Locator, text: string): Promise<void> {
  await field.click();
  await field.fill(text);
  await field.press('Enter');
}

/** Tekst van de Einde-cel van de enige taak in de Tabel-weergave. */
async function finishCellText(page: Page): Promise<string> {
  await page.getByRole('button', { name: /^(Table|Tabel)$/ }).click();
  const surface = page.locator('[data-task-grid-surface-id="full-task-grid"]');
  const cell = surface.locator('[data-grid-data-row="true"] [data-grid-data-cell="true"][data-grid-column-id="task.time.finish"]').first();
  await expect(cell).toBeVisible();
  return (await cell.innerText()).trim();
}

/** Teksten die de Gantt-canvas tekent, na een nieuwe tekenbeurt met de uurschaal. */
async function ganttHourLabels(page: Page): Promise<string[]> {
  // Terug naar de Gantt: het lint-tabblad Start (het tabblad Tabel toont het volledige raster).
  await page.locator('.ribbon-tab').filter({ hasText: /^(Home|Start)$/ }).click();
  await expect(page.locator('[data-task-grid-surface-id="full-task-grid"]')).toHaveCount(0);
  await page.evaluate(() => {
    const drawn: string[] = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text: string, x: number, y: number, maxWidth?: number) {
      drawn.push(String(text));
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
    Object.defineProperty(window, '__opsDrawnText', { configurable: true, value: drawn });
    const s = window.__OPS__!.store.getState();
    s.setUI({ enableHourPlanning: true });
    window.__OPS__!.store.getState().setZoom(1000);
    window.__OPS__!.store.getState().setViewStartDate('2026-01-06');
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as Window & { __opsDrawnText?: string[] }).__opsDrawnText ?? []).length)).toBeGreaterThan(10);
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as Window & { __opsDrawnText?: string[] }).__opsDrawnText ?? []);
}

test('Tijdnotatie: kalendervenster, tabel en Gantt volgen de instelling, ook na herladen', async ({ page, ops: _ops }) => {
  // Standaard 24 uur.
  expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.timeNotation)).toBe('24h');

  // 1) 12 uur kiezen in het instellingenpaneel.
  await chooseTimeFormat(page, /^(12-hour \(1:00 PM\)|12 uur \(1:00 PM\))$/);
  expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.timeNotation)).toBe('12h');

  // 2) Kalendervenster met werkblokken (MSPDI via de echte bestandskiezer).
  let dialog = await openMspdiAndCalendarDialog(page, mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']]));
  await expect.poll(() => blocksOf(dialog, 1)).toEqual(['8:00 AM', '12:00 PM', '1:00 PM', '5:00 PM']);
  await expect(dialog.locator('input[type="time"]')).toHaveCount(0);

  // Typen in 12-uursnotatie: "7:30 am" en "3 pm"; 12:00 PM blijft het middaguur.
  await typeTime(band(dialog, 1, 0, 'start'), '7:30 am');
  await expect(band(dialog, 1, 0, 'start')).toHaveValue('7:30 AM');
  await typeTime(band(dialog, 1, 1, 'end'), '3 pm');
  await expect(band(dialog, 1, 1, 'end')).toHaveValue('3:00 PM');
  // Ongeldige invoer valt bij afronden terug op de laatste geldige waarde.
  await typeTime(band(dialog, 1, 1, 'start'), '13:00 PM');
  await expect(band(dialog, 1, 1, 'start')).toHaveValue('1:00 PM');
  await expect.poll(() => blocksOf(dialog, 1)).toEqual(['7:30 AM', '12:00 PM', '1:00 PM', '3:00 PM']);
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => mondayBlocks(page)).toEqual([{ start: 450, end: 720 }, { start: 780, end: 900 }]);

  // 3) Eén weergaveplek buiten het kalendervenster: de taaktijd in de tabel, en de Gantt-uurschaal.
  expect(await finishCellText(page)).toMatch(/^\d{2}-\d{2}-\d{4} \d{1,2}:\d{2} (AM|PM)$/);
  const labels12 = await ganttHourLabels(page);
  expect(labels12.some(text => /^\d{1,2} (AM|PM)$/.test(text)), labels12.join(' | ')).toBe(true);
  expect(labels12.some(text => /^\d{2}:00$/.test(text))).toBe(false);

  // 4) Terug naar 24 uur: dezelfde blokken in 24-uursnotatie, en typen als "1630".
  await chooseTimeFormat(page, /^(24-hour \(13:00\)|24 uur \(13:00\))$/);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true }));
  dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  await expect.poll(() => blocksOf(dialog, 1)).toEqual(['07:30', '12:00', '13:00', '15:00']);
  await typeTime(band(dialog, 1, 1, 'end'), '1630');
  await expect(band(dialog, 1, 1, 'end')).toHaveValue('16:30');
  await typeTime(band(dialog, 1, 0, 'end'), '12');
  await expect(band(dialog, 1, 0, 'end')).toHaveValue('12:00');
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => mondayBlocks(page)).toEqual([{ start: 450, end: 720 }, { start: 780, end: 990 }]);
  expect(await finishCellText(page)).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);
  const labels24 = await ganttHourLabels(page);
  expect(labels24.some(text => /^\d{2}:00$/.test(text)), labels24.join(' | ')).toBe(true);
  expect(labels24.some(text => /^\d{1,2} (AM|PM)$/.test(text))).toBe(false);

  // 5) Weer 12 uur, en herladen: de instelling blijft staan.
  await chooseTimeFormat(page, /^(12-hour \(1:00 PM\)|12 uur \(1:00 PM\))$/);
  await page.reload();
  await waitForOps(page);
  const skipWelcome = page.getByRole('button', { name: /^(Skip|Overslaan)$/ });
  await expect(skipWelcome).toBeVisible();
  await skipWelcome.click();
  expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.timeNotation)).toBe('12h');
  await page.getByTitle(/^(Settings|Instellingen)$/, { exact: true }).click();
  await expect(page.locator('.settings-dialog').getByLabel(TIME_FORMAT)).toContainText(/12/);
  await page.locator('.settings-dialog .modal-close-btn').click();

  // 6) Begin en Einde van een gewone kalender in 12 uur; 24:00 als einde is 12:00 AM.
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true }));
  dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog.locator('[data-ops-work-start]')).toHaveValue('7:00 AM');
  await expect(dialog.locator('[data-ops-work-end]')).toHaveValue('4:00 PM');
  await expect(dialog.locator('[data-ops-work-start]')).toHaveAttribute('placeholder', 'h:mm AM');
  await dialog.locator('[data-ops-calendar-preset-continuous]').click();
  await expect(dialog.locator('[data-ops-work-start]')).toHaveValue('12:00 AM');
  await expect(dialog.locator('[data-ops-work-end]')).toHaveValue('12:00 AM');
  // Einde typen als "5 pm" en daarna "12 am" (= 24:00, einde van de dag).
  await typeTime(dialog.locator('[data-ops-work-end]'), '5 pm');
  await expect(dialog.locator('[data-ops-work-end]')).toHaveValue('5:00 PM');
  await typeTime(dialog.locator('[data-ops-work-end]'), '12 am');
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => {
    const c = window.__OPS__!.store.getState().calendar;
    return [c.workStartHour, c.workEndHour];
  })).toEqual([0, 24]);
});
