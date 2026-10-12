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

// Wacht op PR #296: pas die laat de XER-lezer een ontbrekende geplande start melden
// (`notifications.xerImportMissingPlannedStarts`, al opgenomen in `openNoticeSticky.ts`). Op main
// zonder #296 heeft deze melding geen regel die data noemt, dus verdwijnt hij na 5 s. Zet `fixme` om
// naar `test` zodra #296 op main staat.
test.fixme('XER met een ontbrekende geplande start: de openingsmelding blijft staan tot het kruisje', async ({ page, ops: _ops }) => {
  await openXer(page, 'zonder-geplande-start.xer');
  const toast = openToast(page);
  await expect(toast).toBeVisible();
  await page.waitForTimeout(6000);
  await expect(toast).toBeVisible();
  await toast.locator('[data-ops-toast-close]').click();
  await expect(toast).toHaveCount(0);
});

test('XER met een onbekend taaktype (enum-terugval): de openingsmelding blijft staan tot het kruisje', async ({ page, ops: _ops }) => {
  await openXer(page, 'onbekend-taaktype.xer');
  const toast = openToast(page);
  await expect(toast).toBeVisible();
  await page.waitForTimeout(6000);
  await expect(toast).toBeVisible();
  await toast.locator('[data-ops-toast-close]').click();
  await expect(toast).toHaveCount(0);
});

test('XER zonder bijzonderheden: de openingsmelding verdwijnt vanzelf na 5 s', async ({ page, ops: _ops }) => {
  await openXer(page, 'zonder-bijzonderheden.xer');
  const toast = openToast(page);
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCount(0, { timeout: 8000 });
});
