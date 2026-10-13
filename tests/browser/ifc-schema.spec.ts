// Issue #292 — het IFC-schema kiezen in Projectinfo, in de echte gebruikersflow: Bestand › Projectinfo,
// de keuzelijst met echte klikken, Toepassen, en daarna Ctrl+S. In de browser zonder bestand wordt
// opslaan een download; de test leest de kop van dat bestand. `window.__OPS__` zet alleen de beginstand
// (één taak) en leest de store; de geteste handelingen zijn klikken en toetsen.
//
// OPS_IFC_SCHEMA_SHOTS=<map> bewaart schermbeelden van het formulier, licht en donker.
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures/ops';

const SHOTS = process.env.OPS_IFC_SCHEMA_SHOTS;

const schemaOf = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().project.ifcSchema ?? null);
const isDirty = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().isDirty);
const activeTab = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().ui.activeRibbonTab);

async function toProjectInfo(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(File|Bestand)$/ }).first().click();
  await page.locator('.backstage-sidebar').getByRole('button', { name: /^(Project info|Projectinfo)$/ }).click();
  await expect(page.locator('[data-ops-project-ifc-schema]')).toBeVisible();
}

const trigger = (page: Page) =>
  page.locator('[data-ops-project-ifc-schema]').getByRole('button', { name: /^(IFC schema when saving|IFC-schema bij opslaan)$/ });

async function pick(page: Page, option: RegExp): Promise<void> {
  await trigger(page).click();
  await page.getByRole('option', { name: option }).click();
  await expect(trigger(page)).toHaveText(option);
}

async function apply(page: Page): Promise<void> {
  await page.locator('[data-ops-project-info-actions]').getByRole('button', { name: /^(Apply|Toepassen)$/ }).click();
  // Toepassen in Backstage keert terug naar het lint (onApply = Backstage sluiten).
  await expect.poll(() => activeTab(page)).not.toBe('file');
}

/** Ctrl+S zonder bestand in de browser ⇒ een download; geef de FILE_SCHEMA-regel van dat bestand terug. */
async function saveAndReadSchemaLine(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const path = await (await download).path();
  const text = await readFile(path!, 'utf8');
  return text.split('\n').find(line => line.startsWith('FILE_SCHEMA(')) ?? '(geen FILE_SCHEMA-regel)';
}

test('IFC-schema: kiezen in Projectinfo, toepassen, opslaan schrijft het in de kop; ongedaan maken zet het terug',
  async ({ page, ops: _ops }) => {
    // Beginstand: een nieuw project met één taak, nog op de standaard.
    await page.evaluate(() => {
      const s = window.__OPS__!.store.getState();
      s.setProject({ name: 'Schemaproef' });
      s.addTask({ name: 'Ruwbouw' });
    });
    expect(await schemaOf(page)).toBeNull();

    await toProjectInfo(page);
    // De standaard is IFC 4.3 ADD2 (besluit eigenaar 2026-10-13).
    await expect(trigger(page)).toHaveText(/^(IFC 4\.3 ADD2 \(default\)|IFC 4\.3 ADD2 \(standaard\))$/);
    if (SHOTS) {
      // Alleen voor de schermbeelden: het thema via de store (`ui.uiTheme`), zoals de instelling het zet.
      const before = await page.evaluate(() => window.__OPS__!.store.getState().ui.uiTheme);
      await page.locator('[data-ops-project-ifc-schema]').scrollIntoViewIfNeeded();
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((t) => window.__OPS__!.store.getState().setUI({ uiTheme: t }), theme);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/projectinfo-ifc-schema-${theme === 'light' ? 'licht' : 'donker'}.png` });
      }
      await page.evaluate((t) => window.__OPS__!.store.getState().setUI({ uiTheme: t }), before);
    }

    // Kiezen is een concept: de store verandert pas bij Toepassen.
    await pick(page, /^IFC4$/);
    await expect(page.locator('[data-ops-project-info-unapplied]')).toBeVisible();
    expect(await schemaOf(page)).toBeNull();
    await apply(page);
    await expect.poll(() => schemaOf(page)).toBe('IFC4');
    expect(await isDirty(page)).toBe(true);

    // Opslaan (echte Ctrl+S) schrijft het gekozen schema in de kop.
    expect(await saveAndReadSchemaLine(page)).toBe("FILE_SCHEMA(('IFC4'));");

    // Ongedaan maken zet de keuze terug (één stap), opnieuw doen zet hem weer.
    await page.keyboard.press('Control+z');
    await expect.poll(() => schemaOf(page)).toBeNull();
    await page.keyboard.press('Control+y');
    await expect.poll(() => schemaOf(page)).toBe('IFC4');

    // Het formulier toont de opgeslagen keuze; IFC 4.3 kiezen en opslaan.
    await toProjectInfo(page);
    await expect(trigger(page)).toHaveText(/^IFC4$/);
    await pick(page, /^IFC 4\.3$/);
    await apply(page);
    await expect.poll(() => schemaOf(page)).toBe('IFC4X3');
    expect(await saveAndReadSchemaLine(page)).toBe("FILE_SCHEMA(('IFC4X3'));");

    // Terug naar de standaard.
    await toProjectInfo(page);
    await pick(page, /^(IFC 4\.3 ADD2 \(default\)|IFC 4\.3 ADD2 \(standaard\))$/);
    await apply(page);
    await expect.poll(() => schemaOf(page)).toBe('IFC4X3_ADD2');
    expect(await saveAndReadSchemaLine(page)).toBe("FILE_SCHEMA(('IFC4X3_ADD2'));");
    // Een nieuw project kreeg nooit een schemavraag.
    await expect(page.locator('[data-ops-ifc-schema-question]')).toHaveCount(0);
  });
