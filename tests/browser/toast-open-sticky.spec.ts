// Openingsmelding blijft staan als de app data invulde, verving, repareerde of wegliet (eigenaarsbesluit
// 2026-10-12, optie 1; regel in `src/state/openNoticeSticky.ts`). Zonder zulke regels verdwijnt hij na
// 5 s. Echte flow: lint-knop Openen en de bestandskiezer; daarna echte klikken. `__OPS__` leest alleen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', 'xer', name));

async function openXer(page: Page, name: string): Promise<void> {
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  await expect(openButton).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer: fixture(name) });
}

const openToast = (page: Page) => page.locator('.ops-toast', { hasText: /XER file opened/ });

// De tijd loopt via `page.clock` (geen echte wachttijd, testaudit 2026-10-20). De klok gaat aan vóór het
// openen, zodat de 5s-timer van de melding al op de nepklok staat. Zodra de melding staat, zetten we de
// klok stil: daarna verloopt een timer alleen nog via `runFor`, en telt de echte tijd die een assertion
// wacht niet mee (review PR #399). Controle dat de klok die timerroute echt vooruitzet: een gewone info
// die er tegelijk staat, is na dezelfde 6 s wel weg (zelfde opzet als refusal-red.spec.ts).

/** Zet de nepklok stil. `pauseAt` mag niet naar het verleden, dus een kleine sprong van 500 ms. */
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 500);
}

async function stickyAfterSixSeconds(page: Page): Promise<void> {
  const toast = openToast(page);
  await expect(toast).toBeVisible();
  await pauseClock(page);
  await page.evaluate(() => window.__OPS__!.store.getState().notify({ severity: 'info', messageKey: 'notifications.templateSaved', params: { name: 'klokcontrole' } }));
  const control = page.locator('.ops-toast.toast-info', { hasText: /klokcontrole/ });
  await expect(control).toBeVisible();
  await page.clock.runFor(6_000);
  await expect(control).toHaveCount(0);
  await expect(toast).toBeVisible();
  await toast.locator('[data-ops-toast-close]').click();
  await expect(toast).toHaveCount(0);
}

// PR #296 (op main) laat de XER-lezer een ontbrekende geplande start melden
// (`notifications.xerImportMissingPlannedStarts`, opgenomen in `openNoticeSticky.ts`).
test('XER met een ontbrekende geplande start: de openingsmelding blijft staan tot het kruisje', async ({ page, ops: _ops }) => {
  await page.clock.install();
  await openXer(page, 'zonder-geplande-start.xer');
  await stickyAfterSixSeconds(page);
});

test('XER met een onbekend taaktype (enum-terugval): de openingsmelding blijft staan tot het kruisje', async ({ page, ops: _ops }) => {
  await page.clock.install();
  await openXer(page, 'onbekend-taaktype.xer');
  await stickyAfterSixSeconds(page);
});

test('XER zonder bijzonderheden: de openingsmelding verdwijnt vanzelf na 5 s', async ({ page, ops: _ops }) => {
  await page.clock.install();
  await openXer(page, 'zonder-bijzonderheden.xer');
  const toast = openToast(page);
  await expect(toast).toBeVisible();
  await pauseClock(page);
  // Na 3,5 s (pauze + 3 s) staat hij er nog (niet te vroeg weg), na 5,5 s is hij weg. Met de stilgezette
  // klok wacht de laatste assertion niet alsnog tot de echte tijd de timer haalt.
  await page.clock.runFor(3_000);
  await expect(toast).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(toast).toHaveCount(0);
});
