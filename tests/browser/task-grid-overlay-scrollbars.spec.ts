// Zwevende balken in de takenlijst (eigenaarsbesluit 2026-10-15). Het raster reserveert geen
// strook meer voor zijn balken; twee dunne overlays liggen over de rand, net als de Gantt-balk.
// De headless shell verbergt schuifbalken standaard (`--hide-scrollbars`): dan is elke strook al 0
// en zegt de meting niets. Deze spec zet dat argument uit en controleert dat ook.
import type { Locator, Page } from '@playwright/test';
import { barPoint, expect, seedProject, state, test } from './fixtures/ops';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  return found!;
}

/** Is precies de taak van deze rij geselecteerd? De rijsleutel bevat de taak-id. */
async function selectedRowIs(page: Page, rowKey: string): Promise<boolean> {
  const ids = (await state(page)).selectedTaskIds;
  return ids.length === 1 && rowKey.includes(ids[0]);
}

/** Klik op (x, y) en geef de rijsleutel terug van de rij die daar lag. */
async function clickRowAt(page: Page, x: number, y: number): Promise<string> {
  const rowKey = await page.evaluate(({ px, py }) => {
    const hit = document.elementFromPoint(px, py);
    return hit?.closest<HTMLElement>('[data-grid-data-row]')?.dataset.gridRowKey ?? null;
  }, { px: x, py: y });
  expect(rowKey, `geen rastercel op (${x}, ${y})`).not.toBeNull();
  await page.mouse.click(x, y);
  return rowKey!;
}

test('takenlijst heeft zwevende balken zonder gereserveerde strook; schuiven en klikken blijven werken', async ({ page, ops: _ops }) => {
  const taskIds = await seedProject(page, Array.from({ length: 80 }, (_, index) => ({
    name: `Zweefrij ${index + 1}`,
    start: '2026-09-07',
    finish: '2026-09-11',
    durationDays: 5,
  })));

  // De browser toont echt schuifbalken: een gewone scroller reserveert wél ruimte.
  const nativeGutter = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;width:100px;height:100px;overflow:scroll';
    document.body.append(probe);
    const gutter = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return gutter;
  });
  expect(nativeGutter).toBeGreaterThan(0);

  const core = page.locator('.gantt-task-grid .task-grid-core');
  await expect(core).toBeVisible();
  // Geen gereserveerde strook, verticaal noch horizontaal.
  expect(await core.evaluate((node: HTMLElement) => ({
    x: node.offsetWidth - node.clientWidth,
    y: node.offsetHeight - node.clientHeight,
    overflowsY: node.scrollHeight > node.clientHeight,
  }))).toEqual({ x: 0, y: 0, overflowsY: true });

  // De verticale overlay ligt aan de rechterrand (kant van de Gantt), onder de kop.
  const vBar = page.locator('.gantt-task-grid [data-testid="task-grid-vscroll"]');
  await expect(vBar).toBeVisible();
  const coreBox = await box(core);
  const vBox = await box(vBar);
  expect(Math.round(vBox.x + vBox.width)).toBe(Math.round(coreBox.x + coreBox.width));
  expect(vBox.width).toBe(8);

  // Muiswiel boven het raster: de rijen schuiven en de Gantt schuift precies even ver mee.
  const barBefore = await barPoint(page, taskIds[0]);
  await page.mouse.move(coreBox.x + coreBox.width / 2, coreBox.y + coreBox.height / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => state(page).then(snapshot => snapshot.view.scrollY)).toBeGreaterThan(0);
  const scrolled = (await state(page)).view.scrollY;
  await expect.poll(() => core.evaluate((node: HTMLElement) => node.scrollTop)).toBe(scrolled);
  await expect.poll(() => vBar.evaluate((node: HTMLElement) => node.scrollTop)).toBe(scrolled);
  await expect.poll(async () => Math.round(barBefore.y - (await barPoint(page, taskIds[0])).y)).toBe(Math.round(scrolled));

  // Terug naar boven, dan de duim slepen: het raster en de store volgen de overlay.
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => state(page).then(snapshot => snapshot.view.scrollY)).toBe(0);
  await page.mouse.move(vBox.x + vBox.width / 2, vBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(vBox.x + vBox.width / 2, vBox.y + 124, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => state(page).then(snapshot => snapshot.view.scrollY)).toBeGreaterThan(0);
  const dragged = (await state(page)).view.scrollY;
  expect(await core.evaluate((node: HTMLElement) => node.scrollTop)).toBe(dragged);

  // Klik in de track onder de duim: een pagina verder.
  await page.mouse.click(vBox.x + vBox.width / 2, vBox.y + vBox.height - 12);
  await expect.poll(() => state(page).then(snapshot => snapshot.view.scrollY)).toBeGreaterThan(dragged);
  // De track-klik schuift geanimeerd; wacht tot het raster stilstaat, anders verschuift de rij
  // tussen het opzoeken en de klik.
  let lastTop = -1;
  await expect.poll(async () => {
    const top = await core.evaluate((node: HTMLElement) => node.scrollTop);
    const settled = top === lastTop;
    lastTop = top;
    return settled;
  }, { intervals: [100] }).toBe(true);

  // Een cel direct naast de verticale balk en direct boven de horizontale balk is gewoon klikbaar.
  const rowY = vBox.y + 3 * 25;
  const besideThumb = await clickRowAt(page, vBox.x - 2, rowY);
  await expect.poll(() => selectedRowIs(page, besideThumb)).toBe(true);
  const hBar = page.locator('.gantt-task-grid [data-testid="task-grid-hscroll"]');
  await expect(hBar).toBeVisible();
  {
    const hBox = await box(hBar);
    expect(hBox.height).toBe(8);
    expect(Math.round(hBox.y + hBox.height)).toBe(Math.round(coreBox.y + coreBox.height));
    // De verticale balk stopt boven de horizontale: geen hoekvlakje, geen overlap.
    expect(Math.round(vBox.y + vBox.height)).toBe(Math.round(hBox.y));
    const aboveThumb = await clickRowAt(page, coreBox.x + 40, hBox.y - 2);
    await expect.poll(() => selectedRowIs(page, aboveThumb)).toBe(true);
  }
});
