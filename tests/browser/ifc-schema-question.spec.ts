// Issue #292, besluit eigenaar 2026-10-13: de app slaat standaard op als IFC4X3_ADD2, maar verandert een
// bestandstype nooit stil. Het eerste expliciete opslaan van een geopend IFC-bestand met een ander
// schema vraagt eerst: naar IFC 4.3 ADD2, of het schema houden.
//
// Echte gebruikersflow: bestanden via de ribbonknop Openen en de bestandskiezer, opslaan met Ctrl+S (in
// de browser zonder bestandstoegang een download), de vraag met echte klikken en Esc, een wijziging via
// Projectinfo met echte invoer. `window.__OPS__` zet alleen de beginstand (één taak in een nieuw project)
// en LEEST de uitkomst; de kop van elk bestand komt uit de echte download.
//
// OPS_IFC_SCHEMA_SHOTS=<map> bewaart schermbeelden van de vraag, licht en donker.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

const SHOTS = process.env.OPS_IFC_SCHEMA_SHOTS;
// Een bestand van een oudere app-versie (kop IFC4X3, geen schemamarkering). Met de kop op IFC4 gezet is
// het een IFC4-bestand van een ander pakket: ook geen markering, dus de app moet vragen.
const OLD_OPS_FILE = readFileSync(join(process.cwd(), 'tests/planning/fixtures/ifc-arity-oude-writer.ifc'), 'utf8');
const IFC4_FILE = Buffer.from(OLD_OPS_FILE.replace("FILE_SCHEMA(('IFC4X3'));", "FILE_SCHEMA(('IFC4'));"));

const question = (page: Page) => page.locator('[data-ops-ifc-schema-question]');
const state = (page: Page) => page.evaluate(() => {
  const s = window.__OPS__!.store.getState();
  return {
    filePath: s.filePath,
    ifcSchema: s.project.ifcSchema ?? null,
    unconfirmed: s.project.ifcSchemaUnconfirmed ?? null,
    pending: s.ui.pendingIfcSchemaQuestion,
    isDirty: s.isDirty,
    name: s.project.name,
  };
});

/** Open via de ribbonknop en de bestandskiezer; wacht tot dit bestand het actieve document is. */
async function openFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect.poll(() => state(page).then(s => s.filePath)).toBe(name);
}

/** Ctrl+S die een download moet geven; geeft de inhoud terug. Een eventuele vraag beantwoordt `answer`. */
async function saveWithDownload(page: Page, answer?: (page: Page) => Promise<void>): Promise<string> {
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  if (answer) await answer(page);
  const path = await (await download).path();
  return readFile(path!, 'utf8');
}

const fileSchema = (ifc: string) => /FILE_SCHEMA\(\('([A-Z0-9_]+)'\)\);/.exec(ifc)?.[1] ?? '(geen kop)';
const hasProp = (ifc: string, name: string) => ifc.includes(`IFCPROPERTYSINGLEVALUE('${name}'`);

test('IFC-schema: nieuw project zonder vraag; IFC4 houden, ADD2 kiezen, Esc slaat niets op; heropenen vraagt niet opnieuw',
  async ({ page, ops: _ops }) => {
    test.setTimeout(120_000);
    // Elke download telt: na Esc mag er niets komen.
    let downloads = 0;
    page.on('download', () => { downloads++; });

    // (a) Nieuw project: Ctrl+S zonder vraag, kop IFC4X3_ADD2.
    await page.evaluate(() => {
      const s = window.__OPS__!.store.getState();
      s.setProject({ name: 'Nieuw schemaproject' });
      s.addTask({ name: 'Ruwbouw' });
    });
    const a = await saveWithDownload(page);
    await expect(question(page)).toHaveCount(0);
    expect(fileSchema(a)).toBe('IFC4X3_ADD2');
    expect(hasProp(a, 'IfcSchemaConfirmed')).toBe(true);

    // (b) Een IFC4-bestand: Ctrl+S ⇒ de vraag ⇒ "IFC4 houden" ⇒ kop IFC4.
    await openFile(page, 'model-ifc4.ifc', IFC4_FILE);
    expect((await state(page)).unconfirmed).toBe('IFC4');
    const b = await saveWithDownload(page, async (p) => {
      await expect(question(p)).toBeVisible();
      await expect(question(p)).toHaveAttribute('data-file-schema', 'IFC4');
      // De focus staat op "IFC4 houden": Enter verandert het bestandstype nooit.
      await expect.poll(() => p.evaluate(() => document.activeElement?.getAttribute('data-ops-ifc-schema-choice') ?? null)).toBe('IFC4');
      if (SHOTS) {
        const before = await p.evaluate(() => window.__OPS__!.store.getState().ui.uiTheme);
        for (const theme of ['light', 'dark'] as const) {
          await p.evaluate((t) => window.__OPS__!.store.getState().setUI({ uiTheme: t }), theme);
          // Kleurovergangen van knoppen eerst laten uitlopen.
          await p.waitForTimeout(400);
          await p.screenshot({ path: `${SHOTS}/schemavraag-ifc4-${theme === 'light' ? 'licht' : 'donker'}.png` });
        }
        await p.evaluate((t) => window.__OPS__!.store.getState().setUI({ uiTheme: t }), before);
      }
      await question(p).getByRole('button', { name: /^(Keep IFC4|IFC4 houden)$/ }).click();
    });
    await expect(question(page)).toHaveCount(0);
    expect(fileSchema(b)).toBe('IFC4');
    expect(hasProp(b, 'IfcSchemaConfirmed')).toBe(true);
    expect(await state(page)).toMatchObject({ ifcSchema: 'IFC4', unconfirmed: null, isDirty: false });

    // Heropenen van dat bewaarde bestand en weer opslaan: geen vraag, kop IFC4.
    await openFile(page, 'bewaard-ifc4.ifc', Buffer.from(b));
    expect((await state(page)).unconfirmed).toBeNull();
    const b2 = await saveWithDownload(page);
    await expect(question(page)).toHaveCount(0);
    expect(fileSchema(b2)).toBe('IFC4');

    // (c) Hetzelfde IFC4-bestand, nu met de keuze ADD2 ⇒ kop IFC4X3_ADD2.
    await openFile(page, 'model-ifc4-c.ifc', IFC4_FILE);
    const c = await saveWithDownload(page, async (p) => {
      await expect(question(p)).toBeVisible();
      await question(p).getByRole('button', { name: /^(Save as IFC 4\.3 ADD2|Opslaan als IFC 4\.3 ADD2)$/ }).click();
    });
    expect(fileSchema(c)).toBe('IFC4X3_ADD2');
    expect(await state(page)).toMatchObject({ ifcSchema: 'IFC4X3_ADD2', unconfirmed: null });

    // (d) Esc ⇒ niets opgeslagen; de vraag staat bij het volgende opslaan weer klaar.
    await openFile(page, 'model-ifc4-d.ifc', IFC4_FILE);
    const before = downloads;
    await page.keyboard.press('Control+s');
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    // Een download na Esc zou binnen een paar honderd ms komen; wacht ruim en tel.
    await page.waitForTimeout(1_500);
    expect(downloads).toBe(before);
    expect(await state(page)).toMatchObject({ unconfirmed: 'IFC4', pending: null });

    // (e) Automatisch opslaan (crashherstel) vraagt niets en bewaart de open vraag. Een echte wijziging
    // via Projectinfo (naam), dan wachten op de herstelsnapshot in IndexedDB.
    await page.getByRole('button', { name: /^(File|Bestand)$/ }).first().click();
    await page.locator('.backstage-sidebar').getByRole('button', { name: /^(Project settings|Project\u00ad?instellingen)$/ }).click();
    await page.locator('[data-ops-project-name]').fill('Herstelproef schemavraag');
    await page.locator('[data-ops-project-info-actions]').getByRole('button', { name: /^(Apply|Toepassen)$/ }).click();
    await expect.poll(() => state(page).then(s => [s.name, s.isDirty])).toEqual(['Herstelproef schemavraag', true]);
    let snapshot: string | null = null;
    await expect.poll(async () => {
      snapshot = await readRecoverySnapshot(page, 'Herstelproef schemavraag');
      return snapshot !== null;
    }, { timeout: 40_000, intervals: [1_000] }).toBe(true);
    await expect(question(page)).toHaveCount(0);
    expect(await state(page)).toMatchObject({ unconfirmed: 'IFC4', pending: null });
    expect(fileSchema(snapshot!)).toBe('IFC4');
    expect(hasProp(snapshot!, 'IfcSchemaUnconfirmed')).toBe(true);
    expect(downloads).toBe(before);
  });

/** De IFC-tekst van de herstelsnapshot met deze projectnaam uit de echte IndexedDB `ops-recovery`, of null. */
function readRecoverySnapshot(page: Page, needle: string): Promise<string | null> {
  return page.evaluate((name) => new Promise<string | null>((resolve) => {
    const request = indexedDB.open('ops-recovery');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (![...db.objectStoreNames].includes('records')) { db.close(); resolve(null); return; }
      const all = db.transaction('records', 'readonly').objectStore('records').getAll();
      all.onsuccess = () => {
        db.close();
        const records = all.result as Array<{ kind: string; ifc?: string }>;
        resolve(records.find(r => r.kind === 'doc' && typeof r.ifc === 'string' && r.ifc.includes(name))?.ifc ?? null);
      };
      all.onerror = () => { db.close(); resolve(null); };
    };
  }), needle);
}
