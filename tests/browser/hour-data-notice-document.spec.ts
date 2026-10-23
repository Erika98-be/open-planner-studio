// Review #364 punt 4: de strook "dit bestand bevat urenplanning" bleef na Nieuw › Maken op het lege
// project staan, ook na Ctrl+1/Ctrl+2. De strook hoort bij het document met uur-data: een nieuw of
// ander document toont hem niet, terug naar dat document wel. Echte klikken en toetsen.
import type { Page } from '@playwright/test';
import { expect, state, test } from './fixtures/ops';

// MS Project XML met één uur-taak (4 uur, DurationFormat 5 = uren).
const HOUR_MSPDI = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>Urenplan</Name><StartDate>2026-01-05T08:00:00</StartDate>
<MinutesPerDay>480</MinutesPerDay>
<Tasks><Task><UID>1</UID><ID>1</ID><Name>Uurtaak</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Finish>2026-01-05T12:00:00</Finish><Duration>PT4H0M0S</Duration><DurationFormat>5</DurationFormat></Task></Tasks>
</Project>`;

const notice = (page: Page) => page.locator('[data-ops-hour-data-notice]');

test('urenstrook hoort bij het document met uur-data, niet bij een nieuw project', async ({ page, ops: _ops }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ }).click();
  await (await chooser).setFiles({ name: 'urenplan.xml', mimeType: 'application/xml', buffer: Buffer.from(HOUR_MSPDI) });
  await expect.poll(() => state(page).then(s => s.tasks.length)).toBe(1);
  await expect(notice(page)).toBeVisible();
  const hourDoc = (await state(page)).activeDocumentId;
  // Eventuele bestandsuitleg sluiten, zodat hij de knoppen niet afdekt.
  const formatClose = page.locator('[data-ops-format-notice-close]');
  if (await formatClose.count()) await formatClose.first().click();

  await page.locator('[data-ops-ribbon-item="new"]').click();
  const dialog = page.locator('[data-ops-project-dialog="new"]');
  await dialog.locator('[data-ops-project-primary]').click();
  await expect(dialog).toBeHidden();
  const newDoc = (await state(page)).activeDocumentId;
  expect(newDoc).not.toBe(hourDoc);
  await expect(notice(page)).toHaveCount(0);

  // Terug naar het document met uur-data: de strook komt terug. Dan weer naar het nieuwe project.
  await page.locator(`[data-ops-tab="${hourDoc}"]`).click();
  await expect.poll(() => state(page).then(s => s.activeDocumentId)).toBe(hourDoc);
  await expect(notice(page)).toBeVisible();
  await page.locator(`[data-ops-tab="${newDoc}"]`).click();
  await expect.poll(() => state(page).then(s => s.activeDocumentId)).toBe(newDoc);
  await expect(notice(page)).toHaveCount(0);

  // Wegklikken op het document met uur-data blijft weg, ook na heen en weer wisselen.
  await page.locator(`[data-ops-tab="${hourDoc}"]`).click();
  await notice(page).getByRole('button', { name: /(Sluiten|Close|Dismiss)/i }).first().click();
  await expect(notice(page)).toHaveCount(0);
  await page.locator(`[data-ops-tab="${newDoc}"]`).click();
  await page.locator(`[data-ops-tab="${hourDoc}"]`).click();
  await expect.poll(() => state(page).then(s => s.activeDocumentId)).toBe(hourDoc);
  await expect(notice(page)).toHaveCount(0);
});
