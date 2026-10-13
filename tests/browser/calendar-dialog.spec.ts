import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures/ops';

test('kalenderdialoog bewaart gewone enkelregelige velden bij Enter zonder te sluiten', async ({ page, ops: _ops }) => {
  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    s.setUI({ showCalendarDialog: true, enableHourPlanning: true, weekStartDay: 'sunday' });
  });

  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  const name = dialog.locator('input').first();
  await name.fill('Bouwkalender 2026');
  await name.press('Enter');

  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().calendar.name)).toBe('Bouwkalender 2026');

  const startHour = dialog.locator('[data-ops-work-start]');
  await startHour.fill('06:00');
  await startHour.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(startHour).toHaveValue('06:00');

  const continuous = dialog.getByRole('button', { name: 'Continuous (24/7)' });
  await continuous.focus();
  await continuous.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sat' })).toHaveClass(/bg-accent/);

  await dialog.locator('[data-ops-cal-cancel]').click();
});

test('kalenderdialoog rangschikt beide zichtbare weekdagrijen volgens de eerste weekdag', async ({ page, ops: _ops }) => {
  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    s.setUI({ showCalendarDialog: true, enableHourPlanning: true, weekStartDay: 'sunday' });
  });

  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  const name = dialog.locator('input').first();
  await name.fill('Bouwkalender 2026');
  await name.press('Enter');
  await expect.poll(() => dialog.getByRole('button').evaluateAll(buttons => buttons
    .map(button => button.textContent?.trim())
    .filter((label): label is string => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(label))))
    .toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ weekStartDay: 'monday' }));
  await expect.poll(() => dialog.getByRole('button').evaluateAll(buttons => buttons
    .map(button => button.textContent?.trim())
    .filter((label): label is string => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(label))))
    .toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ weekStartDay: 'sunday' }));

  await dialog.locator('button').filter({ hasText: 'Add holiday' }).click();
  const holidayEndSegments = dialog.getByRole('group', { name: 'Until' }).last().locator('input');
  await expect(holidayEndSegments).toHaveCount(3);
  await expect.poll(() => holidayEndSegments.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(['', '', '']);

  await dialog.locator('[data-ops-band-editor-toggle]').click();
  const firstWeekday = dialog.locator('[data-ops-worktime-editor] > div').first().locator('span').first();
  await expect(firstWeekday).toHaveText('Sun');

  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ weekStartDay: 'monday' }));
  await expect(firstWeekday).toHaveText('Mon');
  await expect(dialog.locator('[data-ops-simple-break-net-hours]')).toHaveText('8.00 h');
  await expect(dialog.locator('[data-ops-worktime-editor]')).not.toContainText(/\d(?:\.\d+)?u\b/);

  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const holidays = window.__OPS__!.store.getState().calendar.holidays;
    return holidays[holidays.length - 1];
  })).toMatchObject({ endDate: expect.any(String) });
  await expect.poll(() => page.evaluate(() => {
    const holidays = window.__OPS__!.store.getState().calendar.holidays;
    const holiday = holidays[holidays.length - 1]!;
    return holiday.endDate === holiday.startDate;
  })).toBe(true);

  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    s.setUI({ showTaskDialog: true, editingTaskId: null });
  });
  const taskDialog = page.locator('[data-ops-task-dialog]');
  await expect(taskDialog).toBeVisible();
  await taskDialog.getByLabel('Calendar', { exact: true }).click();
  await expect(page.getByRole('option', { name: 'Project calendar: Bouwkalender 2026' })).toBeVisible();
});

test('scalar HH:MM-bediening leidt netto uren af, stapt per kwartier en blokkeert ongeldige tijden', async ({ page, ops: _ops }) => {
  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    s.setUI({ showCalendarDialog: true, enableHourPlanning: true });
  });

  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  const workStart = dialog.locator('[data-ops-work-start]');
  const workEnd = dialog.locator('[data-ops-work-end]');
  const pauseStart = dialog.locator('[data-ops-simple-break-start]');
  const pauseDuration = dialog.locator('[data-ops-simple-break-duration]');
  const netHours = dialog.locator('[data-ops-simple-break-net-hours]');
  await expect(workStart).toHaveValue('07:00');
  await expect(workEnd).toHaveValue('16:00');
  await expect(pauseStart).toHaveValue('12:00');
  await expect(pauseDuration).toHaveValue('60');
  await expect(workStart).toHaveAttribute('type', 'text');
  await expect(workEnd).toHaveAttribute('type', 'text');
  await expect(pauseStart).toHaveAttribute('type', 'text');
  await expect(workStart).not.toHaveAttribute('type', 'number');
  await expect(workEnd).not.toHaveAttribute('type', 'number');
  await expect(pauseStart).not.toHaveAttribute('type', 'time');
  await expect(pauseDuration).toHaveAttribute('type', 'text');
  await expect(pauseDuration).not.toHaveAttribute('type', 'number');
  await expect(dialog.locator('input[type="time"]')).toHaveCount(0);
  await expect(dialog.locator('[data-ops-scalar-time-step="work-start-up"]')).toHaveCount(1);
  await expect(dialog.locator('[data-ops-scalar-time-step="work-end-up"]')).toHaveCount(1);
  await expect(dialog.locator('[data-ops-scalar-time-step="break-start-up"]')).toHaveCount(1);
  const durationUp = dialog.locator('[data-ops-scalar-time-step="break-duration-up"]');
  const durationDown = dialog.locator('[data-ops-scalar-time-step="break-duration-down"]');
  await expect(durationUp).toHaveCount(1);
  await expect(durationDown).toHaveCount(1);
  await expect(durationUp).toHaveAttribute('title', 'Increase break duration by 15 minutes');
  await expect(durationUp).toHaveAttribute('aria-label', 'Increase break duration by 15 minutes');
  const workStartUp = dialog.locator('[data-ops-scalar-time-step="work-start-up"]');
  await expect(workStartUp).toHaveAttribute('title', 'Increase time by 15 minutes');
  await expect(workStartUp).toHaveAttribute('aria-label', 'Increase time by 15 minutes');
  expect(await dialog.locator('[data-ops-scalar-time-step]').evaluateAll(buttons => buttons.every(button => !/^(calendar|ribbon)\./.test(button.getAttribute('title') ?? '') && !/^(calendar|ribbon)\./.test(button.getAttribute('aria-label') ?? '')))).toBe(true);
  await expect(netHours).toHaveText('8.00 h');
  await expect(netHours.locator('input')).toHaveCount(0);
  await expect(dialog.getByText('Net hours per day', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('ribbon.calendarDialog.netHoursPerDay');

  await dialog.locator('[data-ops-scalar-time-step="work-start-up"]').click();
  await expect(workStart).toHaveValue('07:15');
  await expect(netHours).toHaveText('7.75 h');
  await workStart.press('ArrowDown');
  await expect(workStart).toHaveValue('07:00');
  await expect(netHours).toHaveText('8.00 h');

  await durationUp.click();
  await expect(pauseDuration).toHaveValue('75');
  await expect(netHours).toHaveText('7.75 h');
  await pauseDuration.press('ArrowDown');
  await expect(pauseDuration).toHaveValue('60');
  await expect(netHours).toHaveText('8.00 h');
  await pauseDuration.fill('0');
  await pauseDuration.press('Enter');
  await expect(netHours).toHaveText('9.00 h');
  await pauseDuration.press('ArrowDown');
  await expect(pauseDuration).toHaveValue('0');
  await pauseDuration.fill('60');
  await pauseDuration.press('Enter');

  await dialog.getByRole('button', { name: 'Continuous (24/7)' }).click();
  await expect(workStart).toHaveValue('00:00');
  await expect(workEnd).toHaveValue('24:00');
  await workEnd.press('ArrowUp');
  await expect(workEnd).toHaveValue('24:00');
  await expect(netHours).toHaveText('24.00 h');
  await dialog.getByRole('button', { name: 'Mon–Fri' }).click();
  await expect(workStart).toHaveValue('07:00');
  await expect(workEnd).toHaveValue('16:00');

  await workStart.fill('07:30');
  await workStart.press('Enter');
  await workEnd.fill('16:15');
  await workEnd.press('Enter');
  await pauseStart.fill('12:00');
  await pauseStart.press('Enter');
  await pauseDuration.fill('35');
  await pauseDuration.press('Enter');
  await expect(netHours).toHaveText('8.17 h');
  await pauseDuration.fill('30');
  await pauseDuration.press('Enter');
  await expect(netHours).toHaveText('8.25 h');
  await pauseDuration.fill('60');
  await pauseDuration.press('Enter');
  await expect(netHours).toHaveText('7.75 h');
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const c = window.__OPS__!.store.getState().calendar;
    return { workStart: c.workStartHour, workEnd: c.workEndHour, start: c.simpleBreakStartMinute, duration: c.simpleBreakDurationMinutes, hours: c.hoursPerDay };
  })).toEqual({ workStart: 7.5, workEnd: 16.25, start: 720, duration: 60, hours: 7.75 });

  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true }));
  await expect(dialog).toBeVisible();
  const original = await page.evaluate(() => {
    const c = window.__OPS__!.store.getState().calendar;
    return { workStart: c.workStartHour, workEnd: c.workEndHour, breakStart: c.simpleBreakStartMinute };
  });
  await workStart.fill('16:15');
  await workStart.press('Enter');
  await expect(dialog.locator('[data-ops-simple-break-error]')).toContainText('Start time must be before end time.');
  await expect(dialog.locator('[data-ops-cal-apply]')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => {
    const c = window.__OPS__!.store.getState().calendar;
    return { workStart: c.workStartHour, workEnd: c.workEndHour, breakStart: c.simpleBreakStartMinute };
  })).toEqual(original);
  await workStart.fill('07:30');
  await workStart.press('Enter');
  const originalDuration = await page.evaluate(() => window.__OPS__!.store.getState().calendar.simpleBreakDurationMinutes);
  await pauseDuration.fill('x');
  await pauseDuration.press('Enter');
  await expect(dialog.locator('[data-ops-simple-break-error]')).toBeVisible();
  await expect(dialog.locator('[data-ops-cal-apply]')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().calendar.simpleBreakDurationMinutes)).toBe(originalDuration);
  await pauseDuration.fill('60');
  await pauseDuration.press('Enter');
  await pauseStart.fill('15:30');
  await pauseStart.press('Enter');
  await expect(dialog.locator('[data-ops-simple-break-error]')).toBeVisible();
  await expect(dialog.locator('[data-ops-cal-apply]')).toBeDisabled();
  await pauseStart.fill('15:3');
  await pauseStart.press('Enter');
  await expect(dialog.locator('[data-ops-simple-break-error]')).toBeVisible();
  await expect(dialog.locator('[data-ops-cal-apply]')).toBeDisabled();
  await dialog.locator('[data-ops-cal-cancel]').click();
});

test('netto-uren blijft in beide urenplanningstanden een afgeleide output', async ({ page, ops: _ops }) => {
  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    s.setUI({ showCalendarDialog: true, enableHourPlanning: false });
  });
  const dialog = page.locator('[data-ops-calendar-dialog]');
  const netHours = dialog.locator('[data-ops-simple-break-net-hours]');
  await expect(netHours).toHaveText('8.00 h');
  await expect(netHours.locator('input')).toHaveCount(0);
  await expect(dialog.getByText('Net hours per day', { exact: true })).toBeVisible();
  await expect(dialog.locator('input[type="number"][value="8"]')).toHaveCount(0);

  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ enableHourPlanning: true }));
  await expect(netHours).toHaveText('8.00 h');
  await expect(netHours.locator('input')).toHaveCount(0);
  await expect(dialog.locator('input[type="number"][value="8"]')).toHaveCount(0);
  await dialog.locator('[data-ops-cal-cancel]').click();
});

test('resourcekalender blokkeert lokaal ongeldige scalar-tijden zonder het model te muteren', async ({ page, ops: _ops }) => {
  const resourceCalendarId = await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    const { id: _ignored, ...calendar } = structuredClone(s.calendar);
    void _ignored;
    const calendarId = s.addCalendar({ ...calendar, name: 'Browser resource calendar' });
    s.addResource({
      name: 'Browser planner', type: 'LABOR', description: '', maxUnits: 1, calendarId,
    });
    s.setUI({ activeRibbonTab: 'resources', showResourcePanel: true, resourcePanelDocked: false, resourcesView: 'project' });
    return calendarId;
  });

  const row = page.getByRole('row', { name: /Browser planner/ });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const workStart = dialog.locator('[data-ops-work-start]');
  const pauseDuration = dialog.locator('[data-ops-simple-break-duration]');
  const originalDuration = await page.evaluate((calendarId) => {
    const calendar = window.__OPS__!.store.getState().calendars.find(c => c.id === calendarId)!;
    return calendar.simpleBreakDurationMinutes;
  }, resourceCalendarId);
  await expect(workStart).toHaveValue('07:00');
  await expect(pauseDuration).toHaveAttribute('type', 'text');
  const durationUp = dialog.locator('[data-ops-scalar-time-step="break-duration-up"]');
  await expect(durationUp).toHaveAttribute('title', 'Increase break duration by 15 minutes');
  await expect(durationUp).toHaveAttribute('aria-label', 'Increase break duration by 15 minutes');
  await pauseDuration.fill('x');
  await pauseDuration.press('Enter');
  await expect(dialog.locator('[data-ops-simple-break-error]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await expect.poll(() => page.evaluate((calendarId) => {
    const calendar = window.__OPS__!.store.getState().calendars.find(c => c.id === calendarId)!;
    return calendar.simpleBreakDurationMinutes;
  }, resourceCalendarId)).toBe(originalDuration);
  await pauseDuration.fill('60');
  await pauseDuration.press('Enter');
  await workStart.fill('16:00');
  await workStart.press('Enter');
  await expect(dialog.locator('[data-ops-simple-break-error]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await expect.poll(() => page.evaluate((calendarId) => {
    const calendar = window.__OPS__!.store.getState().calendars.find(c => c.id === calendarId)!;
    return calendar.workStartHour;
  }, resourceCalendarId)).toBe(7);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

// Fix werkdag-einde (2026-10): een kalender met werkblokken (MS Project: 08:00–12:00 + 13:00–17:00) kwam
// binnen als werkdag 08:00–12:00. Open een MSPDI via de knop Openen en de bestandskiezer. Besluit eigenaar
// 2026-10-13 (optie 2): ook met urenplanning uit (standaard) toont het venster dan het blok Werktijden, en
// de gebruiker wijzigt de blokken daar direct. Begin, einde en pauze staan er dan niet.
function mspdiWithBlocks(blocks: [string, string][], fridayBlocks: [string, string][] = blocks): string {
  const times = (list: [string, string][]) => '<WorkingTimes>' + list.map(([from, to]) =>
    `<WorkingTime><FromTime>${from}:00</FromTime><ToTime>${to}:00</ToTime></WorkingTime>`).join('') + '</WorkingTimes>';
  const days = [1, 2, 3, 4, 5, 6, 7].map(n => `<WeekDay><DayType>${n}</DayType><DayWorking>${n >= 2 && n <= 6 ? 1 : 0}</DayWorking>${n >= 2 && n <= 5 ? times(blocks) : n === 6 ? times(fridayBlocks) : ''}</WeekDay>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>Blokken</Name><StartDate>2026-01-05T08:00:00</StartDate>
<MinutesPerDay>480</MinutesPerDay><CalendarUID>1</CalendarUID>
<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${days}</WeekDays></Calendar></Calendars>
<Tasks><Task><UID>1</UID><ID>1</ID><Name>Taak</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Finish>2026-01-09T17:00:00</Finish><Duration>PT40H0M0S</Duration></Task></Tasks>
</Project>`;
}

async function openMspdiAndCalendarDialog(page: import('@playwright/test').Page, xml: string) {
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  await expect(openButton).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name: 'blokken.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().calendar.name)).toBe('Standard');
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true, enableHourPlanning: false }));
  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  return dialog;
}

const blocksOf = (dialog: import('@playwright/test').Locator, day: number) =>
  dialog.locator(`[data-ops-worktime-day="${day}"] [data-ops-band] input[type="time"]`)
    .evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));

test('kalenderdialoog: kalender met werkblokken toont bij urenplanning uit het blok Werktijden',
  async ({ page, ops: _ops }) => {
    const dialog = await openMspdiAndCalendarDialog(page, mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']]));
    expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.enableHourPlanning)).toBe(false);
    await expect(dialog.locator('[data-ops-worktime-section]')).toBeVisible();
    await expect(dialog.locator('[data-ops-worktime-editor]')).toBeVisible();
    await expect.poll(() => blocksOf(dialog, 1)).toEqual(['08:00', '12:00', '13:00', '17:00']);
    await expect(dialog.locator('[data-ops-simple-break-net-hours]')).toHaveText(/^8[.,]00 h$/);
    // Geen gewone velden en geen infoblok uit #334: alleen het blok Werktijden telt.
    for (const sel of ['#ops-work-start', '#ops-work-end', '#ops-simple-break-start', '#ops-simple-break-duration',
      '[data-ops-calendar-blocks-notice]', '[data-ops-calendar-enable-hour-planning]']) {
      await expect(dialog.locator(sel)).toHaveCount(0);
    }
    await expect(dialog.locator('[data-ops-calendar-preset-weekdays]')).toBeEnabled();
    await expect(dialog.locator('[data-ops-calendar-preset-continuous]')).toBeEnabled();
    await dialog.locator('[data-ops-cal-cancel]').click();
  });

test('kalenderdialoog: een eenvoudige kalender houdt bij urenplanning uit de gewone velden', async ({ page, ops: _ops }) => {
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true, enableHourPlanning: false }));
  const dialog = page.locator('[data-ops-calendar-dialog]');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__OPS__!.store.getState().calendar.workTime)).toBeUndefined();
  await expect(dialog.locator('#ops-work-start')).toBeVisible();
  await expect(dialog.locator('#ops-work-end')).toBeVisible();
  await expect(dialog.locator('#ops-simple-break-start')).toBeVisible();
  await expect(dialog.locator('#ops-simple-break-duration')).toBeVisible();
  await expect(dialog.locator('[data-ops-worktime-section]')).toHaveCount(0);
  await dialog.locator('[data-ops-cal-cancel]').click();
});

// Een blok wijzigen met urenplanning uit: de motor rekent ermee. De taak van 40 uur (ma 5 jan 08:00)
// eindigde vr 9 jan 17:00; met vrijdag 13:00–15:00 schuiven twee uur door naar maandag 12 jan 10:00.
const blocksState = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const s = window.__OPS__!.store.getState();
  const task = s.tasks.find(t => t.name === 'Taak');
  return { mon: s.calendar.workTime?.byWeekday[1] ?? null, fri: s.calendar.workTime?.byWeekday[5] ?? null, finish: task?.time.earlyFinish };
});
const MSPDI_BLOCKS = { mon: [{ start: 480, end: 720 }, { start: 780, end: 1020 }], fri: [{ start: 480, end: 720 }, { start: 780, end: 1020 }] };

test('kalenderdialoog: een blok wijzigen bij urenplanning uit telt in de planning', async ({ page, ops: _ops }) => {
  const dialog = await openMspdiAndCalendarDialog(page, mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']]));
  await expect.poll(() => blocksState(page)).toEqual({ ...MSPDI_BLOCKS, finish: '2026-01-09T17:00' });

  const friEnd = dialog.locator('[data-ops-worktime-day="5"] [data-ops-band]').nth(1).locator('input[type="time"]').nth(1);
  await friEnd.fill('15:00');
  await expect.poll(() => blocksOf(dialog, 5)).toEqual(['08:00', '12:00', '13:00', '15:00']);
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => blocksState(page)).toEqual({
    mon: MSPDI_BLOCKS.mon, fri: [{ start: 480, end: 720 }, { start: 780, end: 900 }], finish: '2026-01-12T10:00',
  });
});

// Opslaan (Ctrl+S ⇒ IFC-download) en opnieuw openen via de bestandskiezer. IFC bewaart één blokkenset
// voor alle werkdagen (de schrijver neemt de eerste werkdag), dus deze test wijzigt de middag op ALLE
// werkdagen (ma 13:00–15:00, dan "Kopieer naar alle werkdagen"). 6 uur per dag: de taak van 40 uur
// loopt dan door tot dinsdag 13 jan 12:00, ook na heropenen.
test('kalenderdialoog: gewijzigde blokken bij urenplanning uit blijven na opslaan en heropenen', async ({ page, ops: _ops }) => {
  const dialog = await openMspdiAndCalendarDialog(page, mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']]));
  await expect.poll(() => blocksState(page)).toEqual({ ...MSPDI_BLOCKS, finish: '2026-01-09T17:00' });

  const monEnd = dialog.locator('[data-ops-worktime-day="1"] [data-ops-band]').nth(1).locator('input[type="time"]').nth(1);
  await monEnd.fill('15:00');
  await dialog.locator('[data-ops-worktime-day="1"]').getByTitle('Copy to all workdays').click();
  await expect.poll(() => blocksOf(dialog, 5)).toEqual(['08:00', '12:00', '13:00', '15:00']);
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect(dialog).toHaveCount(0);
  const short = [{ start: 480, end: 720 }, { start: 780, end: 900 }];
  const changed = { mon: short, fri: short, finish: '2026-01-13T12:00' };
  await expect.poll(() => blocksState(page)).toEqual(changed);

  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const ifc = readFileSync(await (await download).path());
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name: 'blokken-heropend.ifc', mimeType: 'application/x-step', buffer: ifc });
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().filePath)).toBe('blokken-heropend.ifc');
  expect(await page.evaluate(() => window.__OPS__!.store.getState().ui.enableHourPlanning)).toBe(false);
  await page.evaluate(() => window.__OPS__!.store.getState().runCPM());
  await expect.poll(() => blocksState(page)).toEqual(changed);

  // Het venster toont na heropenen weer het blok Werktijden met de gewijzigde blokken.
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true }));
  await expect(dialog.locator('[data-ops-worktime-section]')).toBeVisible();
  await expect.poll(() => blocksOf(dialog, 1)).toEqual(['08:00', '12:00', '13:00', '15:00']);
  await dialog.locator('[data-ops-cal-cancel]').click();
});

// Werkdagknoppen bij een kalender met werkblokken (review #334, ronde 2): de motor gebruikt zowel het
// werkdagmasker als de blokken, dus vrijdag uit haalt ook de vrijdagblokken weg — met urenplanning uit
// én aan. Een taak van 5 dagen (ma 5 – vr 9 jan) eindigt dan maandag 12 jan; vrijdag weer aan zet hem
// terug op vrijdag 9 jan.
for (const hourPlanning of [false, true]) {
  test(`kalenderdialoog: werkdag uit en weer aan past de blokken mee aan (urenplanning ${hourPlanning ? 'aan' : 'uit'})`,
    async ({ page, ops: _ops }) => {
      const dialog = await openMspdiAndCalendarDialog(page, mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']]));
      if (hourPlanning) await page.evaluate(() => window.__OPS__!.store.getState().setUI({ enableHourPlanning: true }));
      const friday = () => page.evaluate(() => {
        const s = window.__OPS__!.store.getState();
        return {
          workDays: s.calendar.workDays,
          fri: s.calendar.workTime?.byWeekday[5] ?? null,
          finish: s.tasks.find(t => t.name === 'Taak')?.time.earlyFinish,
        };
      });
      await expect.poll(friday).toEqual({
        workDays: [1, 2, 3, 4, 5], fri: [{ start: 480, end: 720 }, { start: 780, end: 1020 }], finish: '2026-01-09T17:00',
      });

      await dialog.getByRole('button', { name: 'Fri', exact: true }).click();
      await dialog.locator('[data-ops-cal-apply]').click();
      await expect.poll(friday).toEqual({ workDays: [1, 2, 3, 4], fri: [], finish: '2026-01-12T17:00' });

      // Toepassen sluit de dialoog; open hem opnieuw.
      await expect(dialog).toHaveCount(0);
      await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showCalendarDialog: true }));
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Fri', exact: true }).click();
      await dialog.locator('[data-ops-cal-apply]').click();
      await expect.poll(friday).toEqual({
        workDays: [1, 2, 3, 4, 5], fri: [{ start: 480, end: 720 }, { start: 780, end: 1020 }], finish: '2026-01-09T17:00',
      });
    });
}

// Review #334, ronde 3: een korte vrijdag (08–12 + 13–15) die je in het venster uit en weer aan zet, krijgt
// zijn eigen blokken terug zoals bij het openen van het venster, niet die van maandag.
test('kalenderdialoog: korte vrijdag uit en weer aan krijgt zijn eigen blokken terug', async ({ page, ops: _ops }) => {
  const dialog = await openMspdiAndCalendarDialog(page,
    mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']], [['08:00', '12:00'], ['13:00', '15:00']]));
  const fri = () => page.evaluate(() => window.__OPS__!.store.getState().calendar.workTime?.byWeekday[5] ?? null);
  const shortFri = [{ start: 480, end: 720 }, { start: 780, end: 900 }];
  await expect.poll(fri).toEqual(shortFri);
  const button = dialog.getByRole('button', { name: 'Fri', exact: true });
  await button.click();
  await button.click();
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().calendar.workDays)).toEqual([1, 2, 3, 4, 5]);
  await expect.poll(fri).toEqual(shortFri);
});

// Ma–vr en Continu (24/7) bij een kalender met werkblokken en urenplanning uit: de motor rekent met de
// blokken, dus beide knoppen passen de blokken aan (niet alleen de werkdagen). Continu ⇒ alle dagen
// 00:00–24:00; Ma–vr ⇒ za en zo zonder blokken, ma–vr houden hun blokken.
test('kalenderdialoog: Ma–vr en Continu passen bij een kalender met blokken de blokken aan', async ({ page, ops: _ops }) => {
  const dialog = await openMspdiAndCalendarDialog(page, mspdiWithBlocks([['08:00', '12:00'], ['13:00', '17:00']]));
  const cal = () => page.evaluate(() => {
    const c = window.__OPS__!.store.getState().calendar;
    return { workDays: c.workDays, sat: c.workTime?.byWeekday[6] ?? null, mon: c.workTime?.byWeekday[1] ?? null, hpd: c.hoursPerDay };
  });
  await dialog.locator('[data-ops-calendar-preset-continuous]').click();
  await expect.poll(() => blocksOf(dialog, 6)).toEqual(['00:00', '00:00']);
  await dialog.locator('[data-ops-calendar-preset-weekdays]').click();
  await expect.poll(() => blocksOf(dialog, 6)).toEqual([]);
  await expect.poll(() => blocksOf(dialog, 1)).toEqual(['00:00', '00:00']);
  await dialog.locator('[data-ops-cal-apply]').click();
  await expect.poll(cal).toEqual({ workDays: [1, 2, 3, 4, 5], sat: [], mon: [{ start: 0, end: 1440 }], hpd: 24 });
});
