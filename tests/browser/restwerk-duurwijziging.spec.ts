import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';

// Restwerk bij een duurwijziging (eigenaarsbesluit 2026-10-19, optie 2). De fixture bootst E-1010 uit
// Harbour Point DCP-03 na: een niet-gestarte uurtaak van 80 h met een expliciete restduur en een
// Design Engineer op inzet 1 met een bewaard restwerk van 320 h (wijkt af van 1 × 80 h, dus het
// waarschuwingsteken staat). `__OPS__` zet alleen die fixture en leest state; de duur typen, Ctrl+Z,
// cellen kiezen, Ctrl+C en Ctrl+V zijn echte browser-events.

const H = 60;
const BAND = [{ start: 480, end: 960 }];

interface SeedTask { name: string; hours: number; workHours?: number }

async function seed(page: Page, tasks: SeedTask[]): Promise<string[]> {
  return page.evaluate(({ inputs, band }) => {
    const ops = window.__OPS__!;
    const s = ops.store.getState();
    s.setUI({ enableHourPlanning: true, showPropertiesPanel: true, rightPanelCollapsed: false, showTaskTypes: true });
    s.setProject({ name: 'DCP-03 nagebootst', startDate: '2026-09-07' });
    s.setViewStartDate('2026-09-07');
    s.setCalendar({
      ...s.calendar, workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, workStartHour: 8, workEndHour: 16,
      workTime: { byWeekday: { 1: band, 2: band, 3: band, 4: band, 5: band, 6: [], 7: [] } },
    });
    const resourceId = ops.store.getState().addResource({ name: 'Design Engineer', type: 'LABOR', description: '', maxUnits: 1 });
    const ids = inputs.map((input) => {
      const id = ops.store.getState().addTask({ name: input.name });
      const current = ops.store.getState().tasks.find(t => t.id === id)!;
      ops.store.getState().updateTask(id, {
        time: {
          ...current.time, durationUnit: 'hours', durationMinutes: input.hours * 60, scheduleDuration: input.hours / 8,
          scheduleStart: '2026-09-07', earlyStart: '2026-09-07T08:00',
        },
      });
      if (input.workHours !== undefined) ops.store.getState().assignResource(id, resourceId, 1);
      // Zoals na een P6-import: een expliciete restduur en een bewaard restwerk.
      ops.store.setState((st) => {
        st.tasks.find(t => t.id === id)!.time.remainingMinutes = input.hours * 60;
        const a = st.assignments.find(x => x.taskId === id);
        if (a && input.workHours !== undefined) a.remainingWorkMinutes = input.workHours * 60;
      });
      return id;
    });
    ops.store.getState().runCPM();
    ops.store.setState((st) => { st.ui.notifications = []; });
    return ids;
  }, { inputs: tasks, band: BAND });
}

function workOf(page: Page, taskId: string): Promise<{ duration?: number; rest?: number; work?: number }> {
  return page.evaluate((id) => {
    const s = window.__OPS__!.store.getState();
    const t = s.tasks.find(x => x.id === id)!;
    const a = s.assignments.find(x => x.taskId === id);
    return { duration: t.time.durationMinutes, rest: t.time.remainingMinutes, work: a?.remainingWorkMinutes };
  }, taskId);
}

const ONE = /(Remaining work of ‘Mobilise Design Team’ recalculated: 320 h → 72 h \(the value came from the file\)\. Ctrl\+Z restores it\.|Restwerk van ‘Mobilise Design Team’ opnieuw uitgerekend: 320 u → 72 u \(de waarde kwam uit het bestand\)\. Ctrl\+Z zet het terug\.)/;
const MANY = /(Remaining work of 2 tasks recalculated|Restwerk van 2 taken opnieuw uitgerekend)/;

test('paneel: duur 80 → 72 h ⇒ restwerk 72 h, één melding; Ctrl+Z zet 320 h en het waarschuwingsteken terug', async ({ page, ops: _ops }) => {
  const [taskId] = await seed(page, [{ name: 'Mobilise Design Team', hours: 80, workHours: 320 }]);
  await page.evaluate((id) => window.__OPS__!.store.getState().selectTask(id), taskId);

  const warning = page.locator('[data-ops-assignment-work-deviates]');
  await expect(warning).toHaveAttribute('data-ops-assignment-work-deviates', '320/80');

  const duration = page.locator('[data-ops-task-duration] [data-ops-duration-value]').first();
  await expect(duration).toHaveValue('80');
  await duration.click();
  await duration.press('Control+a');
  await duration.pressSequentially('72');
  await duration.press('Enter');

  await expect.poll(() => workOf(page, taskId)).toEqual({ duration: 72 * H, rest: 72 * H, work: 72 * H });
  await expect(page.locator('.ops-toast', { hasText: ONE })).toHaveCount(1);
  await expect(warning).toHaveCount(0);

  // Ctrl+Z op de pagina (de invoer is na Enter niet meer actief).
  await expect(duration).not.toBeFocused();
  await page.keyboard.press('Control+z');
  await expect.poll(() => workOf(page, taskId)).toEqual({ duration: 80 * H, rest: 80 * H, work: 320 * H });
  await expect(warning).toHaveAttribute('data-ops-assignment-work-deviates', '320/80');
});

test('tabel: één waarde plakken in twee rijen ⇒ beide herrekend, één melding met het aantal; Ctrl+Z zet beide terug', async ({ page, ops: _ops }) => {
  const [sourceId, firstId, secondId] = await seed(page, [
    { name: 'Bron 72 h', hours: 72 },
    { name: 'Mobilise Design Team', hours: 80, workHours: 320 },
    { name: 'Concept Design', hours: 40, workHours: 160 },
  ]);
  await page.getByRole('button', { name: /^(Table|Tabel)$/ }).click();
  const cell = (id: string) => page.locator(
    `[data-task-grid-surface-id="full-task-grid"] [data-grid-data-row="true"][data-grid-row-key="${id}"] [data-grid-data-cell="true"][data-grid-column-id="task.time.scheduleDuration"]`,
  );
  await expect(cell(sourceId)).toBeVisible();

  // Kopieer de duur van de bronrij.
  await cell(sourceId).click();
  await expect(cell(sourceId)).toBeFocused();
  await page.keyboard.press('Control+c');

  // Kies de duurcellen van de twee doelrijen (klik + Shift-klik) en plak.
  await cell(firstId).click();
  await expect(cell(firstId)).toBeFocused();
  await cell(secondId).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+v');

  await expect.poll(() => workOf(page, firstId)).toEqual({ duration: 72 * H, rest: 72 * H, work: 72 * H });
  await expect.poll(() => workOf(page, secondId)).toEqual({ duration: 72 * H, rest: 72 * H, work: 72 * H });
  await expect(page.locator('.ops-toast', { hasText: MANY })).toHaveCount(1);
  await expect(page.locator('.ops-toast', { hasText: ONE })).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect.poll(() => workOf(page, firstId)).toEqual({ duration: 80 * H, rest: 80 * H, work: 320 * H });
  await expect.poll(() => workOf(page, secondId)).toEqual({ duration: 40 * H, rest: 40 * H, work: 160 * H });
});
