// Uitleg na het openen van een ander formaat dan IFC (eigenaarsbesluit 2026-10-12, optie 1).
// Echte gebruikersflow: bestanden via de ribbonknop Openen en de bestandskiezer, de dialoog en de
// instelling met echte klikken. `window.__OPS__` zet alleen de beginstand (uitleg aan; de fixture
// zet hem voor de rest van de suite uit) en LEEST de uitkomst.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

const XER = [
  'ERMHDR\t23.12\t2026-01-01\t\t\t\t\t\tEUR',
  '%T\tCALENDAR', '%F\tclndr_id\tclndr_name\tclndr_type\tday_hr_cnt\tweek_hr_cnt\tclndr_data',
  '%R\tC1\tStandaard 8u\tCA_Base\t8\t40\t',
  '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tclndr_id\tlast_recalc_date\tplan_start_date',
  '%R\tP1\tUitlegBrowser\tC1\t2026-03-02\t2026-01-05',
  '%T\tTASK',
  '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\tduration_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date',
  '%R\tT1\tP1\tC1\tA1\tNiet gestart\tTT_Task\tDT_FixedDUR\tTK_NotStart\t40\t40\t2026-01-05\t2026-01-09',
  '%E',
].join('\n');
const IFC = readFileSync(join(process.cwd(), 'public/examples/10-villa-wassenaar.ifc'));

const notice = (page: Page) => page.locator('[data-ops-format-notice]');
const documentCount = (page: Page) => page.evaluate(() => window.__OPS__!.store.getState().documents.length);

/** Open via de ribbonknop en de bestandskiezer. Het eerste bestand hergebruikt het lege tabblad
 *  van de fixture; elk volgend bestand krijgt een nieuw tabblad. Wacht tot het project er staat. */
async function openFile(page: Page, name: string, buffer: Buffer, firstFile = false): Promise<void> {
  const before = await documentCount(page);
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer });
  if (firstFile) {
    await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().tasks.length)).toBeGreaterThan(0);
  } else {
    await expect.poll(() => documentCount(page)).toBe(before + 1);
  }
}

async function setXerNoticeInSettings(page: Page, shown: boolean): Promise<void> {
  await page.getByTitle(/^(Settings|Instellingen)$/, { exact: true }).click();
  const settings = page.locator('.settings-dialog');
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: /^(Advanced|Geavanceerd)$/ }).click();
  const box = settings.locator('[data-ops-setting-format-notice-kind="xer"]');
  await expect(box).toBeChecked({ checked: !shown });
  await box.click();
  await expect(box).toBeChecked({ checked: shown });
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
}

test('formaatuitleg: XER toont hem, "niet meer tonen" werkt, Instellingen zet hem terug, IFC nooit',
  async ({ page, ops: _ops }) => {
    await page.evaluate(() => {
      localStorage.setItem('ops-formatNoticeHidden', '[]');
      window.__OPS__!.store.getState().setUI({ formatNoticeHidden: [] });
    });

    // 1. XER openen ⇒ de uitleg voor XER, met de drie blokken.
    await openFile(page, 'uitleg.xer', Buffer.from(XER), true);
    await expect(notice(page)).toHaveAttribute('data-ops-format-notice', 'xer');
    await expect(notice(page)).toContainText(/(Primavera file \(\.xer\) opened|Primavera-bestand \(\.xer\) geopend)/);
    await expect(notice(page).locator('[data-ops-format-notice-kept]')).toContainText(/(activity codes|activiteitcodes)/);
    await expect(notice(page).locator('[data-ops-format-notice-save]')).toContainText(/(Writing back to \.xer is not possible|Terugschrijven naar \.xer kan niet)/);

    // 2. "Niet meer tonen" aanvinken en sluiten ⇒ bewaard.
    await notice(page).locator('[data-ops-format-notice-dont-show]').check();
    await notice(page).locator('[data-ops-format-notice-close]').click();
    await expect(notice(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ops-formatNoticeHidden'))).toBe('["xer"]');

    // 3. Opnieuw een XER ⇒ geen uitleg.
    await openFile(page, 'uitleg-2.xer', Buffer.from(XER));
    await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().ui.pendingFormatNotice)).toBeNull();
    await expect(notice(page)).toHaveCount(0);

    // 4. Instellingen → Geavanceerd: XER weer aan ⇒ de uitleg komt terug.
    await setXerNoticeInSettings(page, true);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ops-formatNoticeHidden'))).toBe('[]');
    await openFile(page, 'uitleg-3.xer', Buffer.from(XER));
    await expect(notice(page)).toHaveAttribute('data-ops-format-notice', 'xer');
    // Escape sluit zonder vinkje: de uitleg blijft aan.
    await page.keyboard.press('Escape');
    await expect(notice(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('ops-formatNoticeHidden'))).toBe('[]');

    // 5. IFC openen ⇒ nooit een uitleg.
    await openFile(page, 'villa.ifc', IFC);
    expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.pendingFormatNotice)).toBeNull();
    await expect(notice(page)).toHaveCount(0);

    // 6. Opnieuw een XER, dan "Lees meer" sluit de uitleg en opent de XER-gids in Help (zonder vinkje: blijft aan).
    await openFile(page, 'uitleg-4.xer', Buffer.from(XER));
    await expect(notice(page)).toHaveAttribute('data-ops-format-notice', 'xer');
    await notice(page).locator('[data-ops-format-notice-read-more]').click();
    await expect(notice(page)).toHaveCount(0);
    await expect(page.locator('.help-panel')).toBeVisible();
    await expect(page.locator('.help-article-body')).toHaveAttribute('data-help-current', 'howto-xer-openen');
    expect(await page.evaluate(() => localStorage.getItem('ops-formatNoticeHidden'))).toBe('[]');
  });
