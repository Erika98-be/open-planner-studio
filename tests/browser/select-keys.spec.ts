import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, seedProject, test } from './fixtures/ops';
import { LOCALE_CASES, chooseLocale } from './fixtures/locale';

// De eigen keuzelijst (`Select`) mag geen toetsen naar de globale sneltoetsen laten lekken, en zijn
// open lijst mag de opties niet afknippen. Gemeten fouten (review PR #368, ook op main):
//  - Delete/Backspace op de trigger of in de open lijst verwijderden de geselecteerde taak;
//  - − en 0 in de open lijst zoomden de Gantt;
//  - Escape in een open lijst in een dialoog sloot de hele dialoog (concept weg);
//  - Escape op een dichte trigger hief de taakselectie op (een native <select> doet dat niet);
//  - de lijst was even breed als de trigger, dus lange opties vielen weg.
// Fixtures (taken, kalender, panelen, dialoog openen) gaan via de brug; elke geteste handeling is
// een echte klik of toetsaanslag.

const zoom = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().view.zoom);
const taskIds = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().tasks.map(t => t.id));
const selected = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().selectedTaskIds);
const menu = (page: Page) => page.locator('.ops-select__menu');

const LONG_TASK = 'Gevelmetselwerk met verdiepte voegen en natuursteen plinten aan de noordzijde, inclusief steigerwerk en voegwerk na de vorstperiode';
/** `dialog.parentTask` uit de taalbestanden: zo volgt de test de vertaling. */
const parentTaskLabel = (locale: 'en' | 'ar'): string =>
  (JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${locale}/task.json`, import.meta.url), 'utf8')) as { dialog: { parentTask: string } }).dialog.parentTask;
const LONG_CALENDAR = 'Kalender met een heel lange naam voor de winterploeg op de bouwplaats Noord';

/** Eén taak, geselecteerd, met het eigenschappenpaneel open. Geeft de kalendertrigger terug. */
async function seedPanel(page: Page, extraCalendar = false): Promise<{ id: string; trigger: Locator }> {
  const [id] = await seedProject(page, [
    { name: 'Metselwerk', start: '2026-09-07', finish: '2026-09-10', durationDays: 4 },
  ]);
  const projectCalendar = await page.evaluate(({ taskId, longName }) => {
    const s = window.__OPS__!.store.getState();
    if (longName) {
      const { id: _drop, ...base } = s.calendar;
      s.addCalendar({ ...base, name: longName });
    }
    s.setUI({ showPropertiesPanel: true, rightPanelCollapsed: false });
    s.selectTask(taskId);
    return s.calendar.name;
  }, { taskId: id, longName: extraCalendar ? LONG_CALENDAR : null });
  // De kalendertrigger toont "<projectkalender>: <naam>"; zo vinden we hem in elke taal.
  const trigger = page.locator('button[aria-haspopup="listbox"]').filter({ hasText: projectCalendar });
  await expect(trigger).toBeVisible();
  return { id, trigger };
}

test('Delete en Backspace in de open lijst en op de dichte trigger verwijderen de taak niet', async ({ page, ops: _ops }) => {
  const { id, trigger } = await seedPanel(page);

  // Open lijst.
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect(await taskIds(page)).toEqual([id]);

  // Kiezen met de muis: de focus gaat terug naar de dichte trigger. Backspace en Delete daar
  // verwijderen de taak ook niet.
  await menu(page).locator('[role="option"]').first().click();
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  // Ook met Ctrl: Delete en Backspace blijven op de trigger afgevangen.
  await page.keyboard.press('Control+Delete');
  await page.keyboard.press('Control+Backspace');
  expect(await taskIds(page)).toEqual([id]);
  expect(await selected(page)).toEqual([id]);

  // En in de open lijst met Ctrl evenmin.
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Control+Delete');
  await page.keyboard.press('Control+Backspace');
  expect(await taskIds(page)).toEqual([id]);
});

test('Ctrl+Z na een muiskeuze zet de keuze terug; in de open lijst doet Ctrl+Z niets', async ({ page, ops: _ops }) => {
  const { id } = await seedPanel(page, true);
  // De trigger toont na de keuze een andere tekst; zoek hem hier op zijn (Engelse) label.
  const trigger = page.locator('button[aria-haspopup="listbox"][aria-label="Calendar"]');
  await expect(trigger).toHaveCount(1);
  const calendarOf = () => page.evaluate(taskId => window.__OPS__!.store.getState().tasks.find(t => t.id === taskId)!.calendarId ?? null, id);
  expect(await calendarOf()).toBeNull();

  // Muiskeuze: de focus staat daarna weer op de dichte trigger.
  await trigger.click();
  await menu(page).getByRole('option', { name: LONG_CALENDAR }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const chosen = await calendarOf();
  expect(chosen).not.toBeNull();

  // Open lijst: Ctrl+Z blijft afgevangen, de keuze staat nog.
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await calendarOf()).toBe(chosen);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Dichte trigger: Ctrl+Z gaat door naar de globale undo.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(calendarOf).toBeNull();
  expect(await taskIds(page)).toEqual([id]);
});

test('− en 0 in de open lijst zoomen de Gantt niet', async ({ page, ops: _ops }) => {
  const { trigger } = await seedPanel(page);

  // Controle vooraf: zonder veldfocus zoomt het min-teken wél.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const start = await zoom(page);
  await page.keyboard.press('-');
  await expect.poll(() => zoom(page)).toBeLessThan(start);

  await trigger.click();
  await expect(menu(page)).toBeVisible();
  const before = await zoom(page);
  await page.keyboard.press('-');
  await page.keyboard.press('0');
  expect(await zoom(page)).toBe(before);
  await expect(menu(page)).toBeVisible();
});

test('Escape op de keuzelijst in het paneel: lijst dicht, taakselectie blijft (zoals een native select)', async ({ page, ops: _ops }) => {
  const { id, trigger } = await seedPanel(page);

  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await selected(page)).toEqual([id]);

  // Dichte, gefocuste trigger: Escape heft de selectie niet op. Op main doet een gefocuste native
  // <select> hetzelfde (het sneltoetsregister slaat een typveld over).
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([id]);
});

test('Escape in een open lijst in de taakdialoog sluit alleen de lijst; het concept blijft', async ({ page, ops: _ops }) => {
  const [first, second] = await seedProject(page, [
    { name: 'Fundering', start: '2026-09-07', finish: '2026-09-10', durationDays: 4 },
    { name: 'Metselwerk', start: '2026-09-11', finish: '2026-09-16', durationDays: 4 },
  ]);
  await page.evaluate(taskId => window.__OPS__!.store.getState().setUI({ showTaskDialog: true, editingTaskId: taskId }), second);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Concept: een nieuwe naam typen.
  const name = dialog.locator('input').first();
  await expect(name).toHaveValue('Metselwerk');
  await name.fill('Metselwerk gevel');

  const parent = dialog.locator(`button[aria-haspopup="listbox"][aria-label="${parentTaskLabel('en')}"]`);
  await parent.click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(name).toHaveValue('Metselwerk gevel');
  await expect(parent).toBeFocused();
  // De taak zelf is niet gewijzigd: het concept is nog niet opgeslagen en niet weggegooid.
  expect(await page.evaluate(id => window.__OPS__!.store.getState().tasks.find(t => t.id === id)!.name, second)).toBe('Metselwerk');
  expect(await taskIds(page)).toEqual([first, second]);

  // Een tweede Escape op de dichte trigger sluit de dialoog wél, net als bij een gefocuste native
  // <select> op main: alleen een open lijst houdt Escape vast.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

/** Elke optie past volledig: geen afgeknipt label, en de lijst ligt binnen het venster. */
async function expectOptionsFit(page: Page): Promise<{ menu: DOMRect; widest: number }> {
  const result = await menu(page).evaluate(el => {
    const labels = [...el.querySelectorAll<HTMLElement>('.ops-select__option-label')];
    return {
      menu: el.getBoundingClientRect().toJSON() as DOMRect,
      clipped: labels.filter(l => l.scrollWidth > l.clientWidth + 0.5).map(l => l.textContent),
      widest: Math.max(...labels.map(l => l.scrollWidth)),
      viewport: window.innerWidth,
    };
  });
  expect(result.clipped).toEqual([]);
  expect(result.menu.width).toBeGreaterThanOrEqual(result.widest);
  expect(result.menu.left).toBeGreaterThanOrEqual(0);
  expect(result.menu.right).toBeLessThanOrEqual(result.viewport);
  return { menu: result.menu, widest: result.widest };
}

/** De taakdialoog met een taak met een naam die breder is dan de (brede) trigger "Bovenliggende taak". De
 *  dialoog staat midden in het venster, dus de lijst heeft aan beide kanten ruimte om te groeien. */
async function openParentSelect(page: Page, locale: 'en' | 'ar'): Promise<Locator> {
  const [, second] = await seedProject(page, [
    { name: LONG_TASK, start: '2026-09-07', finish: '2026-09-10', durationDays: 4 },
    { name: 'Metselwerk', start: '2026-09-11', finish: '2026-09-16', durationDays: 4 },
  ]);
  await page.evaluate(taskId => window.__OPS__!.store.getState().setUI({ showTaskDialog: true, editingTaskId: taskId }), second);
  const label = parentTaskLabel(locale);
  const trigger = page.getByRole('dialog').locator(`button[aria-haspopup="listbox"][aria-label="${label}"]`);
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('option', { name: LONG_TASK })).toBeVisible();
  return trigger;
}

test('de open lijst is minstens zo breed als de langste optie en lijnt links uit', async ({ page, ops: _ops }) => {
  const trigger = await openParentSelect(page, 'en');
  const t = (await trigger.boundingBox())!;
  const { menu: box, widest } = await expectOptionsFit(page);
  // De lange naam is breder dan de trigger; de lijst groeit dus mee, vanaf de linkerrand.
  expect(widest).toBeGreaterThan(t.width);
  expect(box.width).toBeGreaterThan(t.width);
  expect(Math.abs(box.left - t.x)).toBeLessThanOrEqual(1);
});

test('een lijst bij de vensterrand blijft binnen het venster en knipt niets af (paneel)', async ({ page, ops: _ops }) => {
  const { trigger } = await seedPanel(page, true);
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('option', { name: LONG_CALENDAR })).toBeVisible();
  const t = (await trigger.boundingBox())!;
  const { widest } = await expectOptionsFit(page);
  expect(widest).toBeGreaterThan(t.width);
});

test('RTL (ar): de open lijst past de langste optie en lijnt uit op de rechterrand', async ({ page, ops: _ops }) => {
  await chooseLocale(page, LOCALE_CASES.find(c => c.code === 'ar')!);
  const trigger = await openParentSelect(page, 'ar');
  const t = (await trigger.boundingBox())!;
  const { menu: box, widest } = await expectOptionsFit(page);
  expect(widest).toBeGreaterThan(t.width);
  // Rechterrand van lijst en trigger vallen samen (binnen een pixel); de lijst groeit naar links.
  expect(Math.abs(box.right - (t.x + t.width))).toBeLessThanOrEqual(1);
  expect(box.left).toBeLessThan(t.x);
});
