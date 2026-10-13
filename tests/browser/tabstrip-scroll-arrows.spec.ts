// Documenttabstrook zonder scrollbalk: pijlknoppen < > bij overloop, twee tabbladen per klik
// (uitgelijnd op de rand van een tabblad), het scrollwiel schuift horizontaal, en RTL spiegelt.
// De brug zet alleen de fixture (twaalf open projecten); klikken en scrollwiel zijn echte events.
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';
import { LOCALE_CASES, chooseLocale } from './fixtures/locale';

const viewportSel = '[data-ops-tabstrip-viewport]';
const startSel = '[data-ops-tabstrip-scroll-start]';
const endSel = '[data-ops-tabstrip-scroll-end]';

async function openProjects(page: Page, count: number): Promise<void> {
  await page.evaluate((n) => {
    const s = () => window.__OPS__!.store.getState();
    s().setProject({ name: 'Project 1' });
    for (let i = 2; i <= n; i += 1) {
      s().newDocument();
      s().setProject({ name: `Project ${i}` });
    }
  }, count);
  await expect(page.locator('[data-testid="document-tab"]')).toHaveCount(count);
}

/** Afstand tussen de beginrand van de viewport en de beginrand van tabblad `index` (0-based). */
async function startEdgeGap(page: Page, index: number, rtl: boolean): Promise<number> {
  return page.evaluate(({ sel, i, isRtl }) => {
    const viewport = document.querySelector(sel)!;
    const group = viewport.querySelectorAll('.ops-tab-group')[i]!;
    const v = viewport.getBoundingClientRect();
    const g = group.getBoundingClientRect();
    return isRtl ? v.right - g.right : g.left - v.left;
  }, { sel: viewportSel, i: index, isRtl: rtl });
}

async function scrollOffset(page: Page): Promise<number> {
  return page.locator(viewportSel).evaluate(el => Math.abs(el.scrollLeft));
}

async function expectTabAtStartEdge(page: Page, index: number, rtl: boolean): Promise<void> {
  await expect.poll(async () => Math.abs(await startEdgeGap(page, index, rtl)), {
    message: `tabblad ${index + 1} staat aan de beginrand`,
  }).toBeLessThanOrEqual(1);
  // Het schuiven moet tot rust gekomen zijn (vloeiend), niet toevallig voorbij komen.
  const settled = await scrollOffset(page);
  await page.waitForTimeout(150);
  expect(await scrollOffset(page)).toBeCloseTo(settled, 0);
  expect(Math.abs(await startEdgeGap(page, index, rtl))).toBeLessThanOrEqual(1);
}

async function activateViaOverview(page: Page, index: number): Promise<void> {
  await page.locator('.ops-tabstrip-menu').click();
  await page.locator('[data-ops-overview-card]').nth(index).click();
  await expect(page.locator('[data-testid="document-tab"]').nth(index)).toHaveAttribute('aria-selected', 'true');
}

async function expectNoScrollbar(viewport: Locator): Promise<void> {
  const metrics = await viewport.evaluate(el => ({
    gutter: (el as HTMLElement).offsetHeight - el.clientHeight,
    scrollbarWidth: getComputedStyle(el).scrollbarWidth,
  }));
  expect(metrics.gutter, 'scrollbalk neemt hoogte in').toBe(0);
  expect(metrics.scrollbarWidth).toBe('none');
}

test('geen scrollbalk; pijlen alleen bij overloop; klik schuift twee tabbladen; wiel schuift', async ({ page, ops: _ops }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const viewport = page.locator(viewportSel);

  // Eén tabblad: geen overloop, geen pijlen.
  await expect(page.locator('[data-testid="document-tab"]')).toHaveCount(1);
  await expect(page.locator('[data-ops-tabstrip-scroll]')).toHaveCount(0);
  await expectNoScrollbar(viewport);

  await openProjects(page, 12);
  await expect(page.locator(startSel)).toBeVisible();
  await expect(page.locator(endSel)).toBeVisible();
  await expectNoScrollbar(viewport);
  await expect(page.locator(startSel)).toHaveAttribute('aria-label', 'Scroll tabs towards the start');
  await expect(page.locator(startSel)).toHaveAttribute('title', 'Scroll tabs towards the start');
  await expect(page.locator(endSel)).toHaveAttribute('aria-label', 'Scroll tabs towards the end');

  // De pijlen staan tussen de tabbladen en de "+", de "+" aan de eindrand.
  const vBox = (await viewport.boundingBox())!;
  const sBox = (await page.locator(startSel).boundingBox())!;
  const eBox = (await page.locator(endSel).boundingBox())!;
  const addBox = (await page.locator('.ops-tabstrip-add').boundingBox())!;
  expect(sBox.x).toBeGreaterThanOrEqual(vBox.x + vBox.width - 0.5);
  expect(eBox.x).toBeGreaterThan(sBox.x);
  expect(addBox.x).toBeGreaterThanOrEqual(eBox.x + eBox.width - 0.5);
  await expect(page.locator('.ops-tabstrip-add')).toBeInViewport({ ratio: 1 });

  // Het laatst geopende project is actief en in beeld: aan het eind, dus ">" uit.
  await expect(page.locator('[data-testid="document-tab"]').nth(11)).toBeInViewport({ ratio: 0.99 });
  await expect(page.locator(endSel)).toBeDisabled();
  await expect(page.locator(startSel)).toBeEnabled();

  // Activeren via het overzicht brengt tabblad 1 in beeld; aan het begin is "<" uit.
  await activateViaOverview(page, 0);
  await expect(page.locator('[data-testid="document-tab"]').nth(0)).toBeInViewport({ ratio: 0.99 });
  await expect.poll(() => scrollOffset(page)).toBeLessThanOrEqual(1);
  await expect(page.locator(startSel)).toBeDisabled();
  await expect(page.locator(endSel)).toBeEnabled();

  // ">" schuift precies twee tabbladen: tabblad 3 staat heel aan de beginrand.
  await page.locator(endSel).click();
  await expectTabAtStartEdge(page, 2, false);
  await expect(page.locator(startSel)).toBeEnabled();
  await page.locator(endSel).click();
  await expectTabAtStartEdge(page, 4, false);
  // "<" schuift twee terug.
  await page.locator(startSel).click();
  await expectTabAtStartEdge(page, 2, false);
  await page.locator(startSel).click();
  await expectTabAtStartEdge(page, 0, false);
  await expect(page.locator(startSel)).toBeDisabled();

  // Klikken tot het eind: ">" wordt uitgeschakeld en het laatste tabblad staat in beeld.
  for (let i = 0; i < 8 && await page.locator(endSel).isEnabled(); i += 1) {
    await page.locator(endSel).click();
    await page.waitForTimeout(700);
  }
  await expect(page.locator(endSel)).toBeDisabled();
  await expect(page.locator('[data-testid="document-tab"]').nth(11)).toBeInViewport({ ratio: 0.99 });

  // Activeren via het overzicht van een tabblad buiten beeld brengt het in beeld.
  await activateViaOverview(page, 1);
  await expect(page.locator('[data-testid="document-tab"]').nth(1)).toBeInViewport({ ratio: 0.99 });

  // Verticaal scrollwiel boven de tabstrook schuift horizontaal.
  await activateViaOverview(page, 0);
  await expect.poll(() => scrollOffset(page)).toBeLessThanOrEqual(1);
  await viewport.hover();
  await page.mouse.wheel(0, 240);
  await expect.poll(() => scrollOffset(page)).toBeGreaterThan(100);
  await page.mouse.wheel(0, -240);
  await expect.poll(() => scrollOffset(page)).toBeLessThanOrEqual(1);

  // Venster breed genoeg: alles past, de pijlen verdwijnen en de "+" volgt het laatste tabblad.
  await page.setViewportSize({ width: 2600, height: 800 });
  await expect(page.locator('[data-ops-tabstrip-scroll]')).toHaveCount(0);
  const last = (await page.locator('.ops-tab-group').last().boundingBox())!;
  const plus = (await page.locator('.ops-tabstrip-add').boundingBox())!;
  expect(Math.abs(plus.x - (last.x + last.width))).toBeLessThanOrEqual(8);
  await expectNoScrollbar(viewport);

  // En weer smaller: de pijlen komen terug.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(endSel)).toBeVisible();
});

test('RTL: pijlen gespiegeld, klik schuift twee tabbladen, wiel schuift', async ({ page, ops: _ops }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const ar = LOCALE_CASES.find(locale => locale.code === 'ar')!;
  await chooseLocale(page, ar);
  await openProjects(page, 12);
  const viewport = page.locator(viewportSel);
  await expectNoScrollbar(viewport);

  await activateViaOverview(page, 0);
  await expect.poll(() => scrollOffset(page)).toBeLessThanOrEqual(1);
  await expectTabAtStartEdge(page, 0, true);
  await expect(page.locator(startSel)).toBeDisabled();

  // Gespiegeld: de pijlen staan links van de tabbladen, de knop naar het begin rechts van die naar
  // het eind, en wijst naar rechts.
  const vBox = (await viewport.boundingBox())!;
  const sBox = (await page.locator(startSel).boundingBox())!;
  const eBox = (await page.locator(endSel).boundingBox())!;
  expect(sBox.x + sBox.width).toBeLessThanOrEqual(vBox.x + 0.5);
  expect(sBox.x).toBeGreaterThan(eBox.x);
  await expect(page.locator(`${startSel} svg`)).toHaveClass(/lucide-chevron-right/);
  await expect(page.locator(`${endSel} svg`)).toHaveClass(/lucide-chevron-left/);

  await page.locator(endSel).click();
  await expectTabAtStartEdge(page, 2, true);
  await page.locator(startSel).click();
  await expectTabAtStartEdge(page, 0, true);
  await expect(page.locator(startSel)).toBeDisabled();

  await viewport.hover();
  await page.mouse.wheel(0, 240);
  await expect.poll(() => scrollOffset(page)).toBeGreaterThan(100);
  await expect(page.locator(startSel)).toBeEnabled();
});
