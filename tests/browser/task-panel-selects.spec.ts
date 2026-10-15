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

/** Undo zoals een gebruiker: eerst klikken op een kop buiten de keuzelijst (de focus verlaat de
 *  trigger), dan Ctrl+Z. De brug doet hier niets. */
async function undo(page: Page): Promise<void> {
  await page.locator('[data-ops-rail] .ui-card-header').first().click();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') ?? null)).toBeNull();
  await page.keyboard.press('Control+z');
}

const SECONDARY = /^(Secondary constraint|Secundaire constraint)$/;
const MILESTONE_KIND = /^(Milestone kind|Soort mijlpaal)$/;

test('taakpaneel: constraint, secundaire constraint, mijlpaalsoort en code zijn de eigen keuzelijst', async ({ page, ops: _ops }) => {
  await seedPanelTask(page);
  await page.evaluate(() => {
    const s = window.__OPS__!.store.getState();
    const id = s.selectedTaskIds[0];
    s.updateTask(id, { constraint: { type: 'SNET', date: '2026-09-07' }, isMilestone: true });
  });
  // Alleen de vier velden van deze PR; andere secties van het paneel vallen hier buiten.
  const rail = page.locator('[data-ops-rail]');
  for (const name of [/^Constraint$/, SECONDARY, MILESTONE_KIND, new RegExp(`^${CODE_NAME}$`)]) {
    const field = rail.getByRole('button', { name });
    await expect(field).toHaveCount(1);
    await expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  }
  await expect(rail.getByRole('combobox', { name: /^(Constraint|Secondary constraint|Secundaire constraint|Milestone kind|Soort mijlpaal)$/ })).toHaveCount(0);
  await expect(rail.getByRole('combobox', { name: CODE_NAME })).toHaveCount(0);
});

test('taakpaneel: ongeldige combinatie geeft rode rand, aria-invalid en verwijst naar de fouttekst', async ({ page, ops: _ops }) => {
  const { taskId, codeTypeId } = await seedPanelTask(page);
  await choose(page, /^Constraint$/, 'SNET');
  const secondary = page.locator('[data-ops-rail]').getByRole('button', { name: SECONDARY });
  await expect(secondary).not.toHaveAttribute('aria-invalid', /.*/);
  await expect(secondary).not.toHaveAttribute('aria-describedby', /.*/);

  // SNET + FNET liggen aan dezelfde kant: ongeldig.
  await choose(page, SECONDARY, 'FNET');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.constraint2)).toBe('FNET');
  const error = page.locator('[data-ops-constraint2-error]');
  await expect(error).toBeVisible();
  await expect(secondary).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await secondary.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  expect(await error.getAttribute('id')).toBe(describedBy);
  await expect(secondary).toHaveAccessibleDescription((await error.textContent())!.trim());
  const colors = await secondary.evaluate(el => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--error)';
    document.body.appendChild(probe);
    const errorColor = getComputedStyle(probe).color;
    probe.remove();
    return { border: getComputedStyle(el).borderTopColor, errorColor };
  });
  expect(colors.border).toBe(colors.errorColor);

  // Weer geldig: alles weg.
  await choose(page, SECONDARY, 'SNLT');
  await expect(error).toHaveCount(0);
  await expect(secondary).not.toHaveAttribute('aria-invalid', /.*/);
  await expect(secondary).not.toHaveAttribute('aria-describedby', /.*/);
});

test('taakpaneel: een secundair type buiten de lijst (bv. MSO uit IFC) toont zijn naam', async ({ page, ops: _ops }) => {
  const { taskId } = await seedPanelTask(page);
  // Fixture: zo'n waarde komt alleen via import binnen (ifcPsets leest elk geldig type).
  await page.evaluate(id => window.__OPS__!.store.getState().updateTask(id, {
    constraint: { type: 'SNET', date: '2026-09-07' },
    constraint2: { type: 'MSO', date: '2026-09-10' },
  }), taskId);
  const secondary = page.locator('[data-ops-rail]').getByRole('button', { name: SECONDARY });
  await expect(secondary).toHaveAttribute('data-value', 'MSO');
  await expect(secondary).toHaveText(/\(MSO\)$/);
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

  // Een herhaalde keuze (ASAP terwijl ASAP al geldt) is geen undo-stap (de store doet niets).
  const depth0 = (await state(page)).undoDepth;
  await choose(page, /^Constraint$/, 'ASAP');
  expect((await state(page)).undoDepth).toBe(depth0);

  await choose(page, /^Constraint$/, 'SNET');
  await expect.poll(() => taskFacts(page, taskId, codeTypeId).then(f => f.constraint)).toBe('SNET');

  const secondaryLabel = SECONDARY;
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

  const label = MILESTONE_KIND;
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
