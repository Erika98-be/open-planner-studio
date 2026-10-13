// P6 Project-ID los van de projectnaam (eigenaarsbesluit 2026-10-13): het tabblad toont "Naam (code)",
// Projectinfo toont alleen de naam, en hernoemen houdt de code.
// Echte gebruikersflow: het bestand via de ribbonknop Openen en de bestandskiezer, hernoemen in
// Instellingen → Projectinfo met echte toetsaanslagen, sluiten via het kruisje van het tabblad.
// `window.__OPS__` LEEST alleen de uitkomst; hij zet hier niets.
// Fixture: een klein P6 XML-bestand met drie projecten (A leeg, B "Project B & bouw" / B-BOUW,
// C "Project C" / C-AFBOUW), dat twee tabbladen opent.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures/ops';

const P6XML_MULTI = readFileSync(join(process.cwd(), 'tests/planning/fixtures/p6xml-genest-meerdere-projecten.xml'));

test('P6 XML: tabblad "Naam (code)", Projectinfo toont alleen de naam, hernoemen houdt de code',
  async ({ page, ops: _ops }) => {
    // 1. Openen via de ribbonknop en de bestandskiezer: twee tabbladen, elk "Naam (code)".
    const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
    const chooser = page.waitForEvent('filechooser');
    await openButton.click();
    await (await chooser).setFiles({ name: 'meerdere-projecten.xml', mimeType: 'application/xml', buffer: P6XML_MULTI });
    const tabB = page.getByRole('tab', { name: 'Project B & bouw (B-BOUW)', exact: true });
    const tabC = page.getByRole('tab', { name: 'Project C (C-AFBOUW)', exact: true });
    await expect(tabB).toBeVisible();
    await expect(tabC).toBeVisible();
    await expect(tabB).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-ops-title-file-name]')).toHaveText('Project B & bouw (B-BOUW)');

    // 2. Instellingen → Projectinfo: het naamveld toont alleen de naam, zonder code.
    await page.locator('button.ribbon-tab').filter({ hasText: /^(Settings|Instellingen)$/ }).click();
    await page.locator('button.ribbon-btn').filter({ hasText: /^(Project info|Projectinfo)$/ }).click();
    const dialog = page.locator('[data-ops-project-dialog="info"]');
    await expect(dialog).toBeVisible();
    const nameField = dialog.locator('[data-ops-project-name]');
    await expect(nameField).toHaveValue('Project B & bouw');

    // 3. Hernoemen met echte toetsaanslagen en de primaire knop.
    await nameField.press('ControlOrMeta+A');
    await nameField.press('Backspace');
    await nameField.pressSequentially('Nieuwe naam');
    await expect(nameField).toHaveValue('Nieuwe naam');
    await dialog.locator('[data-ops-project-primary]').click();
    await expect(dialog).toHaveCount(0);

    // 4. Het tabblad en de titelbalk tonen "Nieuwe naam (B-BOUW)"; het andere tabblad blijft gelijk.
    const renamed = page.getByRole('tab', { name: 'Nieuwe naam (B-BOUW)', exact: true });
    await expect(renamed).toBeVisible();
    await expect(renamed).toHaveAttribute('aria-selected', 'true');
    await expect(tabB).toHaveCount(0);
    await expect(tabC).toBeVisible();
    await expect(page.locator('[data-ops-title-file-name]')).toHaveText('* Nieuwe naam (B-BOUW)');
    expect(await page.evaluate(() => {
      const p = window.__OPS__!.store.getState().project;
      return [p.name, p.p6ProjectCode];
    })).toEqual(['Nieuwe naam', 'B-BOUW']);

    // 5. Projectinfo opnieuw: nog steeds alleen de (nieuwe) naam.
    await page.locator('button.ribbon-btn').filter({ hasText: /^(Project info|Projectinfo)$/ }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-ops-project-name]')).toHaveValue('Nieuwe naam');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // 6. De sluitdialoog noemt het document met code (het is gewijzigd); Annuleren laat het open.
    await page.getByRole('button', { name: /^(Close|Sluiten) Nieuwe naam \(B-BOUW\)$/ }).click();
    const closeDialog = page.locator('[data-ops-close-dialog]');
    await expect(closeDialog).toBeVisible();
    await expect(closeDialog).toContainText("'Nieuwe naam (B-BOUW)'");
    await closeDialog.getByRole('button', { name: /^(Cancel|Annuleren)$/ }).click();
    await expect(closeDialog).toHaveCount(0);
    await expect(renamed).toBeVisible();
  });
