// Opslag via de site (issue #309) als echte gebruikershandeling: Ctrl+O, Ctrl+S, klikken in de
// dialogen en in Recent. De SITE is hier een nep-host die `page.addInitScript` vóór de app op
// `window.openaecHost` zet, precies zoals een echte site dat doet. Hij bewaart zijn bestanden in
// `sessionStorage`, zodat ze een herlaadbeurt overleven, en telt elke aanroep. De brug
// (`window.__OPS__`) leest alleen state en maakt een document gewijzigd; openen en opslaan zelf
// gaan altijd via toetsen en klikken.
//
// Zonder host (laatste test) moet alles blijven zoals het was: geen site-dialoog, de gewone
// bestandskiezer en download.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test, waitForOps, waitForWelcomeDialog } from './fixtures/ops';

const HOST_KEY = 'ops-test-site-host';
const IFC = readFileSync(resolve(process.cwd(), 'public/examples/showcase-verbouwing-eengezinswoning.ifc'), 'utf8');

interface HostFile { id: string; name: string; versions: { version: string; data: string; author: string }[] }
interface HostCall {
  fn: 'list' | 'open' | 'save' | 'versions';
  id?: string | null;
  version?: string | null;
  name?: string;
  baseVersion?: string | null;
  type?: string;
  extensions?: string[] | null;
}

/** Eén bestand `Planning.ifc` (id `p1`) met twee versies. */
const SEED: HostFile[] = [{
  id: 'p1',
  name: 'Planning.ifc',
  versions: [
    { version: '1', data: IFC, author: 'Anna' },
    { version: '2', data: IFC, author: 'Bram' },
  ],
}];

/** De nep-host. Draait in de pagina, vóór de app, bij elke (her)laadbeurt. */
async function installSiteHost(page: Page, seed: HostFile[]): Promise<void> {
  await page.addInitScript(({ key, seedFiles }) => {
    interface V { version: string; data: string; author: string }
    interface F { id: string; name: string; versions: V[] }
    interface Db { files: F[]; seq: number; calls: Record<string, unknown>[] }
    const read = (): Db => {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) as Db : { files: seedFiles, seq: 0, calls: [] };
    };
    const write = (db: Db) => sessionStorage.setItem(key, JSON.stringify(db));
    const log = (call: Record<string, unknown>) => { const db = read(); db.calls.push(call); write(db); };
    const latest = (f: F) => f.versions[f.versions.length - 1];
    const info = (f: F, v: V = latest(f)) => ({ id: f.id, name: f.name, version: v.version });
    const find = (db: Db, id: string): F => {
      const f = db.files.find((x) => x.id === id);
      if (!f) throw new Error(`Bestand ${id} bestaat niet op de site.`);
      return f;
    };
    const storage = {
      async list(query?: { extensions?: string[] }) {
        log({ fn: 'list', extensions: query?.extensions ?? null });
        return read().files.map((f) => info(f));
      },
      async open(id: string, version?: string) {
        log({ fn: 'open', id, version: version ?? null });
        const f = find(read(), id);
        const v = version === undefined ? latest(f) : f.versions.find((x) => x.version === version);
        if (!v) throw new Error(`Versie ${version} bestaat niet.`);
        return { file: info(f, v), data: new Blob([v.data]) };
      },
      async save(request: { id?: string; name: string; data: Blob; baseVersion?: string }) {
        const text = await request.data.text();
        log({ fn: 'save', id: request.id ?? null, name: request.name, baseVersion: request.baseVersion ?? null, type: request.data.type });
        const db = read();
        if (request.id === undefined) {
          db.seq += 1;
          const created: F = { id: `nieuw-${db.seq}`, name: request.name, versions: [{ version: '1', data: text, author: 'Test' }] };
          db.files.push(created);
          write(db);
          return info(created);
        }
        const f = find(db, request.id);
        if (request.baseVersion !== undefined && request.baseVersion !== latest(f).version) {
          throw Object.assign(new Error(`Op de site staat al versie ${latest(f).version}.`), { code: 'conflict' });
        }
        f.versions.push({ version: String(f.versions.length + 1), data: text, author: 'Test' });
        write(db);
        return info(f);
      },
      async versions(id: string) {
        log({ fn: 'versions', id });
        return [...find(read(), id).versions].reverse().map((v) => ({ version: v.version, author: v.author }));
      },
    };
    (window as unknown as { openaecHost: unknown }).openaecHost = { storage };
  }, { key: HOST_KEY, seedFiles: seed });
}

/** Testscenario "iemand anders slaat op": een nieuwe versie direct in de opslag van de host. */
async function otherUserSaves(page: Page, id: string): Promise<void> {
  await page.evaluate(({ key, fileId }) => {
    const db = JSON.parse(sessionStorage.getItem(key)!) as { files: HostFile[] };
    const f = db.files.find((x) => x.id === fileId)!;
    f.versions.push({ version: String(f.versions.length + 1), data: f.versions[f.versions.length - 1].data, author: 'Collega' });
    sessionStorage.setItem(key, JSON.stringify(db));
  }, { key: HOST_KEY, fileId: id });
}

async function hostCalls(page: Page): Promise<HostCall[]> {
  return page.evaluate((key) => (JSON.parse(sessionStorage.getItem(key) ?? '{"calls":[]}') as { calls: HostCall[] }).calls, HOST_KEY);
}
const saves = async (page: Page) => (await hostCalls(page)).filter((c) => c.fn === 'save');

async function doc(page: Page) {
  return page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    return { siteFileId: s.siteFileId, filePath: s.filePath, isDirty: s.isDirty, tasks: s.tasks.length };
  });
}

/** Maak het actieve document gewijzigd (fixture, niet de handeling onder test). */
async function makeDirty(page: Page, name: string): Promise<void> {
  await page.evaluate((taskName) => { window.__OPS__!.store.getState().addTask({ name: taskName }); }, name);
  await expect.poll(() => doc(page).then((d) => d.isDirty)).toBe(true);
}

/** Aantal records in de crashherstel-database (web). */
async function recoveryRecords(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((done) => {
    const request = indexedDB.open('ops-recovery');
    request.onerror = () => done(0);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('records')) { db.close(); done(0); return; }
      const count = db.transaction('records', 'readonly').objectStore('records').count();
      count.onsuccess = () => { db.close(); done(count.result); };
      count.onerror = () => { db.close(); done(0); };
    };
  }));
}

/**
 * Na een herlaadbeurt: wacht op het herstelvenster of de welkomst (die komt pas na de herstelcontrole).
 * Een herstelvenster beantwoorden we met "niet herstellen"; daarna gaat de welkomst weg zoals in de
 * fixture.
 */
async function settleAfterReload(page: Page): Promise<void> {
  await waitForOps(page);
  const recovery = page.locator('[data-ops-recovery-dialog]');
  const welcome = page.locator('[data-ops-welcome-dialog]');
  await expect(recovery.or(welcome).first()).toBeAttached({ timeout: 15_000 });
  if (await recovery.count() > 0) {
    await recovery.getByRole('button', { name: /^(Don't restore|Niet herstellen)$/ }).click();
    await expect(recovery).toHaveCount(0);
  }
  await waitForWelcomeDialog(page);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showWelcomeDialog: false, showTourOverlay: false }));
}

const openDialog = (page: Page) => page.locator('[data-ops-site-open-dialog]');
const saveDialog = (page: Page) => page.locator('[data-ops-site-save-dialog]');

/** Ctrl+O → "Openen van de site" → klik op het bestand. */
async function openFromSiteDialog(page: Page, id: string): Promise<void> {
  await page.keyboard.press('Control+o');
  await expect(openDialog(page)).toBeVisible();
  await openDialog(page).locator(`[data-ops-site-file="${id}"] [data-ops-site-file-open]`).click();
  await expect(openDialog(page)).toHaveCount(0);
  await expect.poll(() => doc(page).then((d) => d.siteFileId)).toBe(id);
}

const siteTest = test.extend({
  page: async ({ page }, use) => {
    await installSiteHost(page, SEED);
    await use(page);
  },
});

siteTest('openen van de site, Ctrl+S schrijft zonder dialoog, en Recent heropent na herladen', async ({ page, ops: _ops }) => {
  await openFromSiteDialog(page, 'p1');
  const opened = await doc(page);
  expect(opened.filePath).toBe('Planning.ifc');
  expect(opened.tasks).toBeGreaterThan(0);
  // `list` kan in DEV twee keer komen (React StrictMode draait het effect dubbel); het telt dat
  // hij de open-extensies meekreeg en dat er precies één bestand gelezen is.
  const calls = await hostCalls(page);
  expect(calls.filter((c) => c.fn === 'list').every((c) => c.extensions?.includes('ifc'))).toBe(true);
  expect(calls.filter((c) => c.fn === 'list').length).toBeGreaterThan(0);
  expect(calls.filter((c) => c.fn === 'open')).toEqual([{ fn: 'open', id: 'p1', version: null }]);

  await makeDirty(page, 'Extra werk');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves(page).then((s) => s.length)).toBe(1);
  expect((await saves(page))[0]).toEqual({
    fn: 'save', id: 'p1', name: 'Planning.ifc', baseVersion: '2', type: 'application/x-step',
  });
  await expect(saveDialog(page)).toHaveCount(0);
  await expect.poll(() => doc(page).then((d) => d.isDirty)).toBe(false);

  // Nog een keer: de basis is nu de net geschreven versie 3.
  await makeDirty(page, 'Nog meer werk');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves(page).then((s) => s.length)).toBe(2);
  expect((await saves(page))[1].baseVersion).toBe('3');
  await expect(saveDialog(page)).toHaveCount(0);

  // Recent toont het site-bestand met het label "Op de site".
  await page.locator('.ribbon-tab--file').click();
  const recent = page.locator('.backstage-recent-item').filter({ hasText: 'Planning.ifc' });
  await expect(recent).toHaveCount(1);
  await expect(recent.locator('[data-ops-recent-site]')).toHaveText(/^(On the site|Op de site)$/);

  // Herladen. Recent moet het bestand heropenen, dus geen crashherstel: komt dat venster (de
  // auto-save kan tussendoor een kopie hebben gemaakt), dan kiezen we "niet herstellen".
  page.on('dialog', (d) => { void d.accept(); });
  await page.reload();
  await settleAfterReload(page);
  expect((await doc(page)).siteFileId).toBeNull();

  const opensBefore = (await hostCalls(page)).filter((c) => c.fn === 'open').length;
  await page.locator('.ribbon-tab--file').click();
  const recentAfterReload = page.locator('.backstage-recent-item').filter({ hasText: 'Planning.ifc' });
  await expect(recentAfterReload).toHaveCount(1);
  await recentAfterReload.click();
  await expect.poll(() => doc(page).then((d) => d.siteFileId)).toBe('p1');
  const opens = (await hostCalls(page)).filter((c) => c.fn === 'open');
  expect(opens.length).toBe(opensBefore + 1);
  expect(opens.at(-1)).toEqual({ fn: 'open', id: 'p1', version: null });

  // Na heropenen weer Ctrl+S: naar hetzelfde bestand, met de nieuwste versie (4) als basis.
  await makeDirty(page, 'Na herladen');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves(page).then((s) => s.length)).toBe(3);
  expect((await saves(page))[2]).toMatchObject({ id: 'p1', baseVersion: '4' });
});

siteTest('nieuw document: Ctrl+S vraagt een naam en maakt een nieuw bestand op de site', async ({ page, ops: _ops }) => {
  await page.evaluate(() => window.__OPS__!.store.getState().setProject({ name: 'Nieuwbouw school' }));
  await makeDirty(page, 'Fundering');

  await page.keyboard.press('Control+s');
  await expect(saveDialog(page)).toBeVisible();
  const nameField = saveDialog(page).locator('[data-ops-site-save-name]');
  await expect(nameField).toBeFocused();
  await expect(nameField).toHaveValue('Nieuwbouw school.ifc');
  // De naam zonder `.ifc` is geselecteerd: typen vervangt hem.
  await page.keyboard.type('School Noord');
  await expect(nameField).toHaveValue('School Noord.ifc');
  // Ctrl+S in het naamveld start geen tweede opslagronde.
  await page.keyboard.press('Control+s');
  await saveDialog(page).locator('[data-ops-site-save-confirm]').click();
  await expect(saveDialog(page)).toHaveCount(0);

  await expect.poll(() => saves(page).then((s) => s.length)).toBe(1);
  expect((await saves(page))[0]).toEqual({
    fn: 'save', id: null, name: 'School Noord.ifc', baseVersion: null, type: 'application/x-step',
  });
  await expect.poll(() => doc(page)).toMatchObject({ siteFileId: 'nieuw-1', filePath: 'School Noord.ifc', isDirty: false });

  // Daarna is de site het doel: Ctrl+S schrijft zonder vraag een nieuwe versie.
  await makeDirty(page, 'Ruwbouw');
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves(page).then((s) => s.length)).toBe(2);
  expect((await saves(page))[1]).toMatchObject({ id: 'nieuw-1', baseVersion: '1' });
  await expect(saveDialog(page)).toHaveCount(0);
});

siteTest('conflict: iemand anders sloeg op; eigen melding en het document blijft gewijzigd', async ({ page, ops }) => {
  ops.acceptError('Opslaan op de site mislukt');
  await openFromSiteDialog(page, 'p1');
  await makeDirty(page, 'Mijn wijziging');
  await otherUserSaves(page, 'p1');

  await page.keyboard.press('Control+s');
  await expect.poll(() => saves(page).then((s) => s.length)).toBe(1);
  expect((await saves(page))[0]).toMatchObject({ id: 'p1', baseVersion: '2' });

  const toast = page.locator('.ops-toast[role="alert"]').filter({ hasText: 'Planning.ifc' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Op de site staat al versie 3.');
  expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.notifications.at(-1)?.messageKey))
    .toBe('notifications.siteSaveConflict');
  expect(await doc(page)).toMatchObject({ siteFileId: 'p1', isDirty: true });
  await expect(saveDialog(page)).toHaveCount(0);
});

siteTest('oudere versie opent als kopie zonder doel; Ctrl+S vraagt dan een naam', async ({ page, ops: _ops }) => {
  await page.keyboard.press('Control+o');
  await expect(openDialog(page)).toBeVisible();
  const file = openDialog(page).locator('[data-ops-site-file="p1"]');
  await file.locator('[data-ops-site-versions-toggle]').click();
  const versions = file.locator('[data-ops-site-versions]');
  await expect(versions.locator('[data-ops-site-version]')).toHaveCount(2);
  await versions.locator('[data-ops-site-version="1"] [data-ops-site-version-open]').click();
  await expect(openDialog(page)).toHaveCount(0);

  await expect.poll(() => doc(page).then((d) => d.tasks)).toBeGreaterThan(0);
  const copy = await doc(page);
  expect(copy.siteFileId).toBeNull();
  expect(copy.filePath).toMatch(/^Planning \((version|versie) 1\)\.ifc$/);
  expect((await hostCalls(page)).filter((c) => c.fn === 'open')).toEqual([{ fn: 'open', id: 'p1', version: '1' }]);

  // Geen doel: Ctrl+S overschrijft de nieuwste versie niet, maar vraagt een naam.
  await makeDirty(page, 'Op de kopie');
  await page.keyboard.press('Control+s');
  await expect(saveDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(saveDialog(page)).toHaveCount(0);
  expect(await saves(page)).toEqual([]);
  expect((await doc(page)).isDirty).toBe(true);

  // Niet in Recent: de kopie is geen site-bestand.
  await page.locator('.ribbon-tab--file').click();
  await expect(page.locator('.backstage-recent-list, .backstage-empty').first()).toBeVisible();
  await expect(page.locator('[data-ops-recent-site]')).toHaveCount(0);
});

siteTest('"Van deze pc…" in de open-dialoog opent de gewone bestandskiezer', async ({ page, ops: _ops }) => {
  await page.keyboard.press('Control+o');
  await expect(openDialog(page)).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await openDialog(page).locator('[data-ops-site-open-local]').click();
  await chooser;
  await expect(openDialog(page)).toHaveCount(0);
  expect((await hostCalls(page)).filter((c) => c.fn === 'open')).toEqual([]);
});

siteTest('herstel na een crash houdt het site-doel en de basisversie', async ({ page, ops: _ops }) => {
  await openFromSiteDialog(page, 'p1');
  await makeDirty(page, 'Niet opgeslagen');
  await expect.poll(() => recoveryRecords(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.evaluate(() => localStorage.setItem('ops-welcomeSeen', 'true'));
  page.on('dialog', (d) => { void d.accept(); });
  await page.reload();
  await waitForOps(page);

  const recovery = page.locator('[data-ops-recovery-dialog]');
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  await recovery.getByRole('button', { name: /^(Restore|Herstellen)$/ }).click();
  await expect(recovery).toHaveCount(0);
  await expect.poll(() => doc(page)).toMatchObject({ siteFileId: 'p1', isDirty: true });

  // Ctrl+S schrijft weer naar de site, met de versie van vóór de crash als basis (geen dialoog).
  await page.keyboard.press('Control+s');
  await expect.poll(() => saves(page).then((s) => s.length)).toBe(1);
  expect((await saves(page))[0]).toMatchObject({ id: 'p1', name: 'Planning.ifc', baseVersion: '2' });
  await expect(saveDialog(page)).toHaveCount(0);
  await expect.poll(() => doc(page).then((d) => d.isDirty)).toBe(false);
});

test('zonder site: Ctrl+O en Ctrl+S gaan als vanouds naar bestandskiezer en download', async ({ page, ops: _ops }) => {
  expect(await page.evaluate(() => 'openaecHost' in window)).toBe(false);

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await chooser;
  await expect(openDialog(page)).toHaveCount(0);

  await page.evaluate(() => window.__OPS__!.store.getState().setProject({ name: 'Lokaal plan' }));
  await makeDirty(page, 'Taak');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await download).suggestedFilename()).toBe('Lokaal plan.ifc');
  await expect(saveDialog(page)).toHaveCount(0);
  expect((await doc(page)).siteFileId).toBeNull();
});
