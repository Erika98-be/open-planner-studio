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

/** Geef het raster tijd om uit te rollen; klaar als twee lezingen achter elkaar gelijk zijn. */
async function settledScrollTop(core: Locator): Promise<number> {
  let last = -1;
  await expect.poll(async () => {
    const top = await core.evaluate((node: HTMLElement) => node.scrollTop);
    const settled = top === last;
    last = top;
    return settled;
  }, { intervals: [120] }).toBe(true);
  return last;
}

async function bottomGeometry(page: Page, lastTaskId: string) {
  const geometry = await page.evaluate(() => {
    const core = document.querySelector<HTMLElement>('.gantt-task-grid .task-grid-core')!;
    const rows = [...core.querySelectorAll<HTMLElement>('[data-grid-data-row]')];
    const ghost = rows.find(row => row.dataset.gridRowKey === 'ops-ghost-row');
    const real = rows.filter(row => row !== ghost);
    const last = real[real.length - 1].getBoundingClientRect();
    // Niet gemount (niet onderaan): NaN laat de verwachtingen hieronder leesbaar falen.
    const ghostBox = ghost?.getBoundingClientRect() ?? { top: Number.NaN, bottom: Number.NaN };
    const hBar = document.querySelector('.gantt-task-grid [data-testid="task-grid-hscroll"]')!.getBoundingClientRect();
    return {
      scrollTop: core.scrollTop,
      maxScrollTop: core.scrollHeight - core.clientHeight,
      scrollLeft: core.scrollLeft,
      storeScrollY: window.__OPS__!.store.getState().view.scrollY,
      lastRowMid: last.top + last.height / 2,
      rowHeight: last.height,
      ghostTop: ghostBox.top,
      ghostBottom: ghostBox.bottom,
      hBarTop: hBar.top,
    };
  });
  const bar = await barPoint(page, lastTaskId);
  return { ...geometry, ganttBarMid: bar.y };
}

test('helemaal onderaan: spookregel zichtbaar, opzij schuiven houdt de stand, tabel en Gantt op één hoogte', async ({ page, ops: _ops }) => {
  const taskIds = await seedProject(page, Array.from({ length: 80 }, (_, index) => ({
    name: `Onderrij ${index + 1}`,
    start: '2026-09-07',
    finish: '2026-09-11',
    durationDays: 5,
  })));
  const lastTaskId = taskIds[taskIds.length - 1];
  const core = page.locator('.gantt-task-grid .task-grid-core');
  await expect(core).toBeVisible();
  await expect(page.locator('.gantt-task-grid [data-testid="task-grid-hscroll"]')).toBeVisible();
  const coreBox = await box(core);

  // 1. Wiel boven de tabel tot helemaal onderaan.
  await page.mouse.move(coreBox.x + coreBox.width / 2, coreBox.y + coreBox.height / 2);
  for (let step = 0; step < 12; step++) await page.mouse.wheel(0, 600);
  await settledScrollTop(core);
  const bottom = await bottomGeometry(page, lastTaskId);
  expect(bottom.scrollTop).toBe(bottom.maxScrollTop);
  // De store (en dus de Gantt) staat op precies dezelfde stand: geen klem op een kleinere grens.
  expect(bottom.storeScrollY).toBe(bottom.scrollTop);
  // De spookregel staat volledig boven de zwevende horizontale balk.
  expect(bottom.ghostBottom).toBeLessThanOrEqual(bottom.hBarTop + 0.5);
  // Laatste taak: tabelrij en Gantt-balk op dezelfde hoogte (≤ 1 px), en de spookregel er direct onder.
  expect(Math.abs(bottom.lastRowMid - bottom.ganttBarMid)).toBeLessThanOrEqual(1);
  expect(Math.abs(bottom.ghostTop - (bottom.ganttBarMid + bottom.rowHeight / 2))).toBeLessThanOrEqual(1);

  // 2. Opzij schuiven (Shift+wiel en de duim van de horizontale balk slepen): verticaal verandert niets.
  // Eerst de duim naar rechts slepen, daarna met Shift+wiel boven de tabel een stuk terug.
  const hBox = await box(page.locator('.gantt-task-grid [data-testid="task-grid-hscroll"]'));
  await page.mouse.move(hBox.x + 24, hBox.y + hBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hBox.x + 64, hBox.y + hBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => core.evaluate((node: HTMLElement) => node.scrollLeft)).toBeGreaterThan(0);
  const afterDrag = await core.evaluate((node: HTMLElement) => node.scrollLeft);
  expect(await core.evaluate((node: HTMLElement) => node.scrollTop)).toBe(bottom.scrollTop);
  await page.mouse.move(coreBox.x + coreBox.width / 2, coreBox.y + coreBox.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -20);
  await page.keyboard.up('Shift');
  await expect.poll(() => core.evaluate((node: HTMLElement) => node.scrollLeft)).toBeLessThan(afterDrag);
  await page.waitForTimeout(300);
  const sideways = await bottomGeometry(page, lastTaskId);
  expect(sideways.scrollLeft).toBeGreaterThan(0);
  expect(sideways.scrollTop).toBe(bottom.scrollTop);
  expect(sideways.storeScrollY).toBe(bottom.scrollTop);
  expect(sideways.ghostBottom).toBeLessThanOrEqual(sideways.hBarTop + 0.5);
  expect(Math.abs(sideways.lastRowMid - sideways.ganttBarMid)).toBeLessThanOrEqual(1);

  // 3. Terug naar boven, dan met het wiel boven de Gantt helemaal naar beneden: zelfde eindstand.
  for (let step = 0; step < 12; step++) await page.mouse.wheel(0, -600);
  await expect.poll(() => core.evaluate((node: HTMLElement) => node.scrollTop)).toBe(0);
  // Boven de Gantt schuift Shift+wiel de rijen (standaard wielmodus, zie gantt-split-scroll.spec.ts).
  await page.mouse.move(coreBox.x + coreBox.width + 300, coreBox.y + coreBox.height / 2);
  await page.keyboard.down('Shift');
  for (let step = 0; step < 12; step++) await page.mouse.wheel(0, 600);
  await page.keyboard.up('Shift');
  await settledScrollTop(core);
  const viaGantt = await bottomGeometry(page, lastTaskId);
  expect(viaGantt.scrollTop).toBe(viaGantt.maxScrollTop);
  expect(viaGantt.storeScrollY).toBe(viaGantt.scrollTop);
  expect(Math.abs(viaGantt.lastRowMid - viaGantt.ganttBarMid)).toBeLessThanOrEqual(1);
});
