import type { Page } from '@playwright/test';
import { expect, seedProject, state, test } from './fixtures/ops';

// Taakpaneel: de keuzelijsten voor constraint, secundaire constraint, soort mijlpaal en
// activiteitcode zijn de eigen `Select` (eigenaarsregel: keuzelijsten nooit native). Fixture via de
// brug; de geteste handeling is steeds een echte klik op de trigger en daarna op een optie.
// Asserties op de store en op de undo-stap.

const CODE_NAME = 'Locatie';

async function seedPanelTask(page: Page): Promise<{ taskId: string; codeTypeId: string; noordId: string }> {
  const [taskId] = await seedProject(page, [
    { name: 'Fundering', start: '2026-09-07', finish: '2026-09-18', durationDays: 10 },
  ]);
  return page.evaluate(({ id, codeName }) => {
    const s = window.__OPS__!.store.getState();
    const codeTypeId = s.addActivityCodeType(codeName);
    const noordId = s.addActivityCodeValue(codeTypeId, { code: 'N.1', description: 'Noordvleugel' });
    s.addActivityCodeValue(codeTypeId, { code: 'Z.2' });
    s.setUI({ showPropertiesPanel: true, rightPanelCollapsed: false });
    s.selectTask(id);
    return { taskId: id, codeTypeId, noordId };
  }, { id: taskId, codeName: CODE_NAME });
}

type TaskFacts = {
  constraint?: string;
  constraint2?: string;
  milestoneKind?: string;
  code?: string;
};

function taskFacts(page: Page, taskId: string, codeTypeId: string): Promise<TaskFacts> {
  return page.evaluate(({ id, typeId }) => {
    const t = window.__OPS__!.store.getState().tasks.find(x => x.id === id)!;
    return {
      constraint: t.constraint?.type,
      constraint2: t.constraint2?.type,
      milestoneKind: t.milestoneKind,
      code: t.activityCodes?.[typeId],
    };
  }, { id: taskId, typeId: codeTypeId });
}

/** Open de eigen keuzelijst met een klik op de trigger en klik de optie met deze waarde aan. */
async function choose(page: Page, label: RegExp, value: string): Promise<void> {
  const trigger = page.locator('[data-ops-rail]').getByRole('button', { name: label });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator(`.ops-select__menu [role="option"][data-value="${value}"]`).click();
  await expect(page.locator('.ops-select__menu')).toHaveCount(0);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(() => window.__OPS__!.store.getState().undo());
}

test('taakpaneel: geen native keuzelijst meer bij constraint, mijlpaal en code', async ({ page, ops: _ops }) => {
  await seedPanelTask(page);
  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    const id = s.selectedTaskIds[0];
    s.updateTask(id, { constraint: { type: 'SNET', date: '2026-09-07' }, isMilestone: true });
  });
  const rail = page.locator('[data-ops-rail]');
  await expect(rail.getByRole('button', { name: /^(Secondary constraint|Secundaire constraint)$/ })).toBeVisible();
  await expect(rail.getByRole('button', { name: /^(Milestone kind|Soort mijlpaal)$/ })).toBeVisible();
  await expect(rail.getByRole('button', { name: CODE_NAME })).toBeVisible();
  await expect(rail.locator('select')).toHaveCount(0);
});

test('taakpaneel: constraint en secundaire constraint kiezen via de eigen keuzelijst; undo zet terug', async ({ page, ops: _ops }) => {
  const { taskId, codeTypeId } = await seedPanelTask(page);
  expect((await taskFacts(page, taskId, codeTypeId)).constraint).toBeUndefined();

  // Dezelfde opties in dezelfde volgorde als de native lijst.
  const primary = page.locator('[data-ops-rail]').getByRole('button', { name: /^Constraint$/ });
  await primary.click();
  await expect(page.locator('.ops-select__menu')).toBeVisible();
  expect(await page.locator('.ops-select__menu [role="option"]').evaluateAll(els => els.map(e => e.getAttribute('data-value'))))
    .toEqual(['ASAP', 'ALAP', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO']);
  await page.keyboard.press('Escape');

  // Een herhaalde keuze (ASAP terwijl ASAP al geldt) is net als bij de native lijst geen undo-stap.
  const depth0 = (await state(page)).undoDepth;
  await choose(page, /^Constraint$/, 'ASAP');
  expect((await state(page)).undoDepth).toBe(depth0);

  await choose(page, /^Constraint$/, 'SNET');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.constraint)).toBe('SNET');

  const secondaryLabel = /^(Secondary constraint|Secundaire constraint)$/;
  const secondary = page.locator('[data-ops-rail]').getByRole('button', { name: secondaryLabel });
  await expect(secondary).toHaveAttribute('data-value', '');
  await secondary.click();
  expect(await page.locator('.ops-select__menu [role="option"]').evaluateAll(els => els.map(e => e.getAttribute('data-value'))))
    .toEqual(['', 'SNET', 'FNET', 'SNLT', 'FNLT']);
  await page.keyboard.press('Escape');

  await choose(page, secondaryLabel, 'FNLT');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.constraint2)).toBe('FNLT');

  // Undo neemt alleen de secundaire keuze terug; de primaire SNET blijft staan. (Het paneel
  // coalesceert opeenvolgende bewerkingen van HETZELFDE veld tot één undo-stap, net als op main.)
  await undo(page);
  await expect.poll(() => taskFacts(page, taskId, codeTypeId)).toMatchObject({ constraint: 'SNET', constraint2: undefined });
  await expect(secondary).toHaveAttribute('data-value', '');

  // De "geen"-optie wist de secundaire constraint.
  await choose(page, secondaryLabel, 'SNLT');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.constraint2)).toBe('SNLT');
  await choose(page, secondaryLabel, '');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.constraint2)).toBeUndefined();
  await expect(secondary).toHaveAttribute('data-value', '');
});

test('taakpaneel: soort mijlpaal kiezen via de eigen keuzelijst; undo zet terug', async ({ page, ops: _ops }) => {
  const { taskId, codeTypeId } = await seedPanelTask(page);
  await page.evaluate(id => window.__OPS__!.store.getState().updateTask(id, { isMilestone: true }), taskId);

  const label = /^(Milestone kind|Soort mijlpaal)$/;
  const trigger = page.locator('[data-ops-rail]').getByRole('button', { name: label });
  await expect(trigger).toHaveAttribute('data-value', 'AUTO');

  await choose(page, label, 'START');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.milestoneKind)).toBe('START');
  await expect(trigger).toHaveAttribute('data-value', 'START');

  await undo(page);
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.milestoneKind)).toBeUndefined();
  await expect(trigger).toHaveAttribute('data-value', 'AUTO');
});

test('taakpaneel: activiteitcode kiezen via de eigen keuzelijst; undo zet terug', async ({ page, ops: _ops }) => {
  const { taskId, codeTypeId, noordId } = await seedPanelTask(page);

  const trigger = page.locator('[data-ops-rail]').getByRole('button', { name: CODE_NAME });
  await expect(trigger).toHaveAttribute('data-value', '');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await expect(page.locator('.ops-select__menu [role="option"]')).toHaveText([/^\((none|geen)\)$/, 'N.1 — Noordvleugel', 'Z.2']);
  await page.keyboard.press('Escape');

  await choose(page, new RegExp(`^${CODE_NAME}$`), noordId);
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.code)).toBe(noordId);
  await expect(trigger).toHaveText('N.1 — Noordvleugel');

  await undo(page);
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.code)).toBeUndefined();
  await expect(trigger).toHaveAttribute('data-value', '');
});
