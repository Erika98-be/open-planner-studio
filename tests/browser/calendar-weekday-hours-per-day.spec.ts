// Uren per dag bij een werkdagknop in het kalendervenster (review PR #352, punt 1).
//
// XER "Late ploeg": blokken 14:00–24:00 op ma–vr (10 klokuren) met `day_hr_cnt` 8. `hoursPerDay` is de
// omrekening tussen dagen en uren en mag afwijken van de blokken. Vóór de fix zette de knop *Za* hem stil op
// 10 (de modale dagsom van de blokken). Nu blijft een afwijkende waarde staan; alleen een waarde die gelijk
// was aan de blokken volgt ze. Corpusloze kern: `tests/planning/check-urenperdag-dagwissel.ts`.
//
// De .xer gaat via de ribbonknop Openen en de bestandskiezer; daarna alleen echte klikken. `window.__OPS__`
// wordt uitsluitend gebruikt om de uitkomst te LEZEN (patroon `xer-wbs-tree.spec.ts`).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

const day = (n: number, band?: string) => (band ? `(0||${n}()((0||0(${band})())))` : `(0||${n}()())`);
// P6 telt de dagen vanaf zondag (1); 2..6 = ma..vr. Een blok tot middernacht eindigt op 00:00.
const LATE_PLOEG = `(0||CalendarData()((0||DaysOfWeek()(${[1, 2, 3, 4, 5, 6, 7]
  .map((n) => day(n, n >= 2 && n <= 6 ? 's|14:00|f|00:00' : undefined)).join('')}))(0||Exceptions()())))`;

const XER = [
  'ERMHDR\t8.4\t2026-07-18\t\t\t\t\t\tEUR',
  '%T\tCALENDAR', '%F\tclndr_id\tclndr_name\tclndr_type\tday_hr_cnt\tweek_hr_cnt\tclndr_data',
  `%R\tC1\tLate ploeg\tCA_Base\t8\t40\t${LATE_PLOEG}`,
  '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tclndr_id\tlast_recalc_date\tplan_start_date',
  '%R\tP1\tLatePloeg\tC1\t2026-06-01\t2026-06-01',
  '%T\tPROJWBS', '%F\twbs_id\tproj_id\tparent_wbs_id\tseq_num\twbs_short_name\twbs_name',
  '%R\t1\tP1\t0\t1\tLP\tLate ploeg',
  '%T\tTASK',
  '%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date',
  '%R\tA1\tP1\t1\tC1\tA-1\tUrentaak\tTT_Task\tTK_NotStart\t40\t40\t2026-06-01 14:00\t2026-06-05 00:00',
  '%E',
].join('\n');

const LATE = [{ start: 840, end: 1440 }];

async function openXer(page: Page): Promise<void> {
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  await expect(openButton).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name: 'late-ploeg.xer', mimeType: 'application/octet-stream', buffer: Buffer.from(XER) });
}

async function calendarState(page: Page) {
  return page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    const task = s.tasks.find((t) => t.id === 'A1');
    return {
      name: s.calendar.name,
      workDays: s.calendar.workDays,
      hoursPerDay: s.calendar.hoursPerDay,
      sat: s.calendar.workTime?.byWeekday[6] ?? null,
      taskMinutes: task?.time.durationMinutes ?? null,
      taskDays: task?.time.scheduleDuration ?? null,
    };
  });
}

test('kalendervenster: Za aan bij Late ploeg (14–24, 8 u/dag) houdt de uren per dag op 8', async ({ page, ops: _ops }) => {
  await openXer(page);
  await expect.poll(() => calendarState(page)).toEqual({
    name: 'Late ploeg', workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, sat: [], taskMinutes: 2400, taskDays: 5,
  });

  await page.locator('.ribbon-tab').filter({ hasText: /^Planning$/ }).click();
  await page.locator('[data-ops-ribbon-item="calendar"]').first().click();
  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  const netHours = dialog.locator('[data-ops-simple-break-net-hours]');
  await expect(netHours).toHaveText('8.00 h');

  const sat = dialog.getByRole('button', { name: 'Sat', exact: true });
  await expect(sat).toHaveCount(1);
  await sat.click();
  await expect(sat).toHaveClass(/bg-accent/);
  // Zaterdag krijgt de blokken van de eerste werkdag (14–24, 10 klokuren); de uren per dag blijven 8.
  await expect(dialog.locator('[data-ops-worktime-day="6"]')).toContainText('10.00h');
  await expect(netHours).toHaveText('8.00 h');

  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => calendarState(page)).toEqual({
    name: 'Late ploeg', workDays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, sat: LATE, taskMinutes: 2400, taskDays: 5,
  });
});
