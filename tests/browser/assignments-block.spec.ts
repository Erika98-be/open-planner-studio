import type { Page } from '@playwright/test';
import { expect, seedProject, test } from './fixtures/ops';

// Het blok *Toewijzingen* in het taakpaneel (eigenaar 2026-10-15, testversie met Roads A10530):
// 1. de inzet toont hooguit twee decimalen; de opgeslagen waarde blijft exact tot de gebruiker hem
//    zelf wijzigt;
// 2. bij de standaard- én de smalste paneelbreedte is geen veld of knop afgeknipt, ook niet in een
//    rij met ⚠ (afwijkend opgeslagen werk);
// 3. curve, "Verplaatsen naar…" en "Resource toewijzen" zijn de eigen keuzelijst, nooit native.
// De brug zet alleen fixtures (taken, resources, toewijzingen, paneelbreedte) en leest state; de
// geteste handelingen zijn echte klikken en toetsaanslagen.

const EXACT = 1.77777777777778;

async function seedBlock(page: Page, panelWidth: number) {
  const [taskId, otherId] = await seedProject(page, [
    { name: 'Metselwerk', start: '2026-09-07', finish: '2026-09-10', durationDays: 4 },
    { name: 'Voegwerk', start: '2026-09-11', finish: '2026-09-14', durationDays: 2 },
  ]);
  const ids = await page.evaluate(({ id, panelWidth, exact }) => {
    const ops = window.__OPS__!;
    const s = ops.store.getState();
    const a = s.addResource({ name: 'Transit mixer', type: 'LABOR', description: '', maxUnits: 4 });
    const b = s.addResource({ name: 'Foreman', type: 'LABOR', description: '', maxUnits: 4 });
    s.addResource({ name: 'Opperman', type: 'LABOR', description: '', maxUnits: 4 });
    s.assignResource(id, a, 1);
    s.assignResource(id, b, 1);
    const [asgA, asgB] = ops.store.getState().assignments.filter(x => x.taskId === id);
    s.updateAssignment(asgA.id, { unitsPerDay: exact });
    // Fixture: opgeslagen restwerk dat afwijkt van inzet × restduur ⇒ ⚠ op de rij van Foreman,
    // zoals na een P6-import.
    ops.store.setState(st => {
      const target = st.assignments.find(x => x.id === asgB.id)!;
      target.remainingWorkMinutes = 306 * 60;
    });
    s.runCPM();
    s.setUI({ showPropertiesPanel: true, rightPanelCollapsed: false, showTaskTypes: true, rightPanelWidth: panelWidth });
    s.selectTask(id);
    return { unitsId: asgA.id, warnId: asgB.id };
  }, { id: taskId, panelWidth, exact: EXACT });
  return { taskId, otherId, ...ids };
}

const assignmentOf = (page: Page, id: string) => page.evaluate(
  (aid) => {
    const a = window.__OPS__!.store.getState().assignments.find(x => x.id === aid);
    return a ? { units: a.unitsPerDay, curve: a.curve ?? 'UNIFORM', taskId: a.taskId } : null;
  },
  id,
);

test('inzet: toont twee decimalen, focus en blur zonder wijziging laten de opslag exact', async ({ page, ops: _ops }) => {
  const { unitsId } = await seedBlock(page, 280);
  const row = page.locator(`[data-ops-assignment-row="${unitsId}"]`);
  const input = row.locator('input').first();
  const lang = await page.evaluate(() => document.documentElement.lang);
  const expected = new Intl.NumberFormat(`${lang}-u-nu-latn`, { maximumFractionDigits: 2, useGrouping: false }).format(EXACT);
  await expect(input).toHaveValue(expected);
  expect(expected).toMatch(/^1[.,]78$/);
  // De title draagt de exacte waarde.
  await expect(input).toHaveAttribute('title', /1\.77777777777778/);

  // Klik erin, verlaat met Tab: geen wijziging ⇒ de opslag blijft exact.
  await input.click();
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).not.toBeFocused();
  expect((await assignmentOf(page, unitsId))!.units).toBe(EXACT);
  // Nog een keer met een klik ernaast als blur.
  await input.click();
  await page.locator('[data-ops-assignment-name]').first().click();
  expect((await assignmentOf(page, unitsId))!.units).toBe(EXACT);
  await expect(input).toHaveValue(expected);

  // Een echte wijziging commit wel, ook met een komma als decimaalteken.
  await input.click();
  await input.press('Control+a');
  await page.keyboard.type('2,5');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await assignmentOf(page, unitsId))!.units).toBe(2.5);
});

for (const width of [280, 200]) {
  test(`rij: niets afgeknipt bij paneelbreedte ${width} px, ook in een rij met ⚠`, async ({ page, ops: _ops }) => {
    const { warnId } = await seedBlock(page, width);
    await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().ui.rightPanelWidth)).toBe(width);
    const warnRow = page.locator(`[data-ops-assignment-row="${warnId}"]`);
    await expect(warnRow.locator('[data-ops-assignment-work-deviates]')).toBeVisible();
    // Elke toewijzingsrij heeft een "Verplaatsen naar…" (Voegwerk is een kandidaat).
    await expect(page.locator('[data-ops-assignment-move]')).toHaveCount(2);

    const report = await page.evaluate(() => {
      const rail = document.querySelector('[data-ops-rail]')!.getBoundingClientRect();
      const els = [...document.querySelectorAll<HTMLElement>(
        '[data-ops-assignment-row] input, [data-ops-assignment-row] button, [data-ops-assignment-row] .ops-select__value, [data-ops-assignment-row] .ops-select__value-text, [data-ops-assignment-add] .ops-select__value',
      )];
      return {
        count: els.length,
        clipped: els.filter(el => el.scrollWidth > el.clientWidth + 0.5).map(el => el.outerHTML.slice(0, 100)),
        outside: els.filter(el => {
          const r = el.getBoundingClientRect();
          return r.width < 1 || r.left < rail.left - 0.5 || r.right > rail.right + 0.5;
        }).map(el => el.outerHTML.slice(0, 100)),
        // De zichtbare curvetekst in de trigger: hele label, geen ellips.
        curveText: [...document.querySelectorAll<HTMLElement>('[data-ops-assignment-curve] .ops-select__value-text')]
          .map(el => ({ text: el.textContent, fits: el.scrollWidth <= el.clientWidth + 0.5 })),
      };
    });
    expect(report.count).toBeGreaterThan(10);
    expect(report.clipped).toEqual([]);
    expect(report.outside).toEqual([]);
    expect(report.curveText.length).toBe(2);
    for (const c of report.curveText) expect(c.fits).toBe(true);
  });
}

test('keuzelijsten: geen native select; curve, verplaatsen en toewijzen werken met muis en toetsenbord', async ({ page, ops: _ops }) => {
  const { taskId, otherId, unitsId, warnId } = await seedBlock(page, 280);
  const block = page.locator('[data-ops-assignment-row]');
  await expect(block).toHaveCount(2);
  // In het hele paneel staat in dit blok geen enkele native keuzelijst meer.
  await expect(page.locator('[data-ops-assignment-row] select, [data-ops-assignment-add] select')).toHaveCount(0);

  // Curve met de muis: trigger openen, optie aanklikken.
  const curve = page.locator(`[data-ops-assignment-row="${unitsId}"] [data-ops-assignment-curve] button`);
  await curve.click();
  await expect(curve).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('listbox').locator('[data-value="BELL"]').click();
  await expect.poll(async () => (await assignmentOf(page, unitsId))!.curve).toBe('BELL');
  await expect(curve).toHaveAttribute('data-value', 'BELL');

  // Curve met het toetsenbord: focus, ArrowDown opent, Home + Enter kiest de eerste vorm (Uniform).
  await curve.focus();
  await page.keyboard.press('ArrowDown');
  await expect(curve).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(curve).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await assignmentOf(page, unitsId))!.curve).toBe('UNIFORM');
  // Escape sluit zonder keuze.
  await page.keyboard.press('Enter');
  await expect(curve).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(curve).toHaveAttribute('aria-expanded', 'false');
  expect((await assignmentOf(page, unitsId))!.curve).toBe('UNIFORM');

  // Verplaatsen met het toetsenbord: focus bouwt de lijst, Enter opent, Enter kiest Voegwerk.
  const move = page.locator(`[data-ops-assignment-row="${warnId}"] [data-ops-assignment-move]`);
  const moveTrigger = move.getByRole('button');
  await moveTrigger.focus();
  await expect(move).toHaveAttribute('data-ops-assignment-move', 'open');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await assignmentOf(page, warnId))!.taskId).toBe(otherId);
  await expect(block).toHaveCount(1);

  // Resource toewijzen met de muis: Foreman staat weer vrij, Opperman ook.
  const add = page.locator('[data-ops-assignment-add] button');
  await add.click();
  await page.getByRole('listbox').getByRole('option', { name: 'Opperman' }).click();
  await expect(block).toHaveCount(2);
  // En met het toetsenbord: Foreman.
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(block).toHaveCount(3);
  const names = await page.evaluate((id) => {
    const s = window.__OPS__!.store.getState();
    return s.assignments.filter(a => a.taskId === id).map(a => s.resources.find(r => r.id === a.resourceId)!.name).sort();
  }, taskId);
  expect(names).toEqual(['Foreman', 'Opperman', 'Transit mixer']);
});
