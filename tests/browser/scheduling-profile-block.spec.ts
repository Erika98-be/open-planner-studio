// Het profielblok na de review van #169 (eigenaar, 2026-10-14), in de echte gebruikersflow:
//  1. een ingebouwd profiel is alleen-lezen (waarde als label, geen vinkje, geen "terug naar basis");
//  2. "Nieuw profiel" vraagt een naam in de app en maakt een bewerkbaar eigen profiel;
//  3. "Conventies van dit profiel" staat standaard ingeklapt;
//  4. de uitleg per conventie staat achter het i-icoon, met een tooltip bij hover en bij focus.
// Een .xer via de ribbonknop Openen en de bestandskiezer; daarna echte klikken en toetsen.
// `window.__OPS__` LEEST alleen de uitkomst, behalve één fixture: het oude-bestandgeval zet het profiel
// vóór het opslaan (zo'n afwijking is in de UI niet meer te maken) en opent het bestand daarna echt.
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/ops';
import { LOCALE_CASES, chooseLocale } from './fixtures/locale';

// Schermbewijs (licht en donker) alleen als deze map is gezet.
const SHOTS = process.env.OPS_PROFIELBLOK_SHOTS;

// Statusdatum 2026-03-02, niet-gestarte taak gepland op 2026-01-05: onder P6 schuift hij naar de
// statusdatum; met A23 (`unstartedIgnoresStatusDate`) aan niet.
const XER = [
  'ERMHDR\t23.12\t2026-01-01\t\t\t\t\t\tEUR',
  '%T\tCALENDAR', '%F\tclndr_id\tclndr_name\tclndr_type\tday_hr_cnt\tweek_hr_cnt\tclndr_data',
  '%R\tC1\tStandaard 8u\tCA_Base\t8\t40\t',
  '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tclndr_id\tlast_recalc_date\tplan_start_date',
  '%R\tP1\tProfielblok\tC1\t2026-03-02\t2026-01-05',
  '%T\tTASK',
  '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\tduration_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date',
  '%R\tT1\tP1\tC1\tA1\tNiet gestart\tTT_Task\tDT_FixedDUR\tTK_NotStart\t40\t40\t2026-01-05\t2026-01-09',
  '%E',
].join('\n');

async function openFile(page: Page, name: string, content: string): Promise<void> {
  const openButton = page.locator('button.ribbon-btn').filter({ hasText: /^(Open|Openen)$/ });
  await expect(openButton).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await openButton.click();
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) });
}
async function toProjectInfo(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(File|Bestand)$/ }).first().click();
  await page.getByRole('button', { name: /^(Project info|Projectinfo)$/ }).first().click();
  await expect(page.locator('[data-ops-scheduling-profile-section]')).toBeVisible();
}
const profileOf = (page: Page) => page.evaluate(() => {
  const p = window.__OPS__!.store.getState().project.schedulingProfile;
  return p ? { id: p.id, baseId: p.baseId, name: p.name, overrides: p.overrides } : null;
});
const earlyStart = (page: Page) => page.evaluate(() =>
  window.__OPS__!.store.getState().tasks.find(task => task.wbsCode === 'A1')?.time.earlyStart?.slice(0, 10));
const tooltip = (page: Page) => page.locator('.ops-tooltip[role="tooltip"]');
const select = (page: Page) => page.locator('[data-ops-scheduling-profile-select] .ops-select__trigger');

// Schermbewijs in het Nederlands (de eigenaar leest nl); de asserties accepteren nl en en.
async function dutchForShots(page: Page): Promise<void> {
  if (!SHOTS) return;
  await page.setViewportSize({ width: 1280, height: 1300 });
  await chooseLocale(page, LOCALE_CASES.find(l => l.code === 'nl')!);
}
async function shoot(page: Page, target: Locator, name: string, scrollToTop = false, maxHeight = 1300): Promise<void> {
  if (!SHOTS) return;
  // Meldingen weg (fixture), en alleen het zichtbare deel van het doel: een schermafbeelding van een
  // element buiten beeld wordt zwart.
  await page.evaluate(() => window.__OPS__!.store.setState(st => { st.ui.notifications = []; }));
  const before = await page.evaluate(() => window.__OPS__!.store.getState().ui.uiTheme);
  const viewport = page.viewportSize()!;
  if (scrollToTop) await target.evaluate(el => el.scrollIntoView({ block: 'start' }));
  const bottom = viewport.height - 40; // de statusbalk onderaan blijft buiten beeld
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(t => window.__OPS__!.store.getState().setUI({ uiTheme: t }), theme);
    await page.waitForTimeout(300);
    const b = (await target.boundingBox())!;
    const top = Math.max(b.y, 0);
    const clip = { x: Math.max(b.x, 0), y: top, width: Math.min(b.width, viewport.width), height: Math.min(b.y + b.height, bottom, top + maxHeight) - top };
    await page.screenshot({ path: `${SHOTS}/${name}-${theme === 'light' ? 'licht' : 'donker'}.png`, clip });
  }
  await page.evaluate(t => window.__OPS__!.store.getState().setUI({ uiTheme: t }), before);
}

test('profielblok: P6 ingeklapt en alleen-lezen, Nieuw profiel bewerkt en rekent, Ctrl+Z zet terug', async ({ page, ops: _ops }) => {
  await dutchForShots(page);
  await openFile(page, 'profielblok.xer', XER);
  await expect.poll(() => profileOf(page).then(p => p?.id)).toBe('p6');
  await expect.poll(() => earlyStart(page)).toBe('2026-03-02');
  await toProjectInfo(page);
  const section = page.locator('[data-ops-scheduling-profile-section]');

  // Ingeklapt: alleen de kop met het aantal regels, geen rijen.
  const toggle = page.locator('[data-ops-conventions-toggle]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-ops-conventions-count]')).toHaveText('(27)');
  await expect(page.locator('[data-ops-convention-row]')).toHaveCount(0);
  await expect(page.locator('[data-ops-conventions-deviating]')).toHaveCount(0);
  await shoot(page, section, 'p6-ingeklapt', true);

  // Uitklappen: 27 regels, alleen-lezen — waarde als label, geen vinkje, geen "terug naar basis".
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-ops-convention-row]')).toHaveCount(27);
  await expect(page.locator('[data-ops-convention]')).toHaveCount(0);
  await expect(page.locator('input[type="checkbox"][data-ops-convention]')).toHaveCount(0);
  await expect(page.locator('[data-ops-convention-reset]')).toHaveCount(0);
  await expect(page.locator('[data-ops-convention-value]')).toHaveCount(27);
  await expect(page.locator('[data-ops-conventions-readonly-note]')).toBeVisible();
  const a19 = page.locator('[data-ops-convention-row="p6UseRemainingStartForProgress"]');
  await expect(a19.locator('[data-ops-convention-value]')).toHaveAttribute('data-value', 'on');
  await expect(a19.locator('[data-ops-convention-value]')).toHaveText(/^(aan|on)$/i);
  const a23 = page.locator('[data-ops-convention-row="unstartedIgnoresStatusDate"]');
  await expect(a23.locator('[data-ops-convention-value]')).toHaveAttribute('data-value', 'off');

  // Het i-icoon: de uitleg verschijnt meteen bij hover…
  const a19Info = a19.locator('[data-ops-convention-help]');
  const a19Help = await a19Info.getAttribute('title');
  expect(a19Help?.length ?? 0).toBeGreaterThan(20);
  // Eerst in beeld scrollen: een scroll sluit een open tooltip (TooltipHost), net als bij een gebruiker.
  await a19Info.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await a19Info.hover();
  await expect(tooltip(page)).toHaveText(a19Help!);
  await shoot(page, section, 'p6-uitgeklapt-tooltip');
  // …en bij toetsenbordfocus (Tab vanaf het vorige i-icoon), met aria-describedby naar het bubbeltje.
  await page.mouse.move(0, 0);
  await expect(tooltip(page)).toHaveCount(0);
  const infos = page.locator('[data-ops-convention-help]');
  const ids = await infos.evaluateAll(els => els.map(el => el.getAttribute('data-ops-convention-help')));
  const index = ids.indexOf('p6UseRemainingStartForProgress');
  expect(index).toBeGreaterThan(0);
  await infos.nth(index - 1).focus();
  await page.keyboard.press('Tab');
  await expect(a19Info).toBeFocused();
  await expect(tooltip(page)).toHaveText(a19Help!);
  await expect(a19Info).toHaveAttribute('aria-describedby', 'ops-tooltip-bubble');
  // Focus weg ⇒ tooltip weg, het title-attribuut terug.
  await page.keyboard.press('Shift+Tab');
  await expect(tooltip(page)).not.toHaveText(a19Help!);
  await expect(a19Info).toHaveAttribute('title', a19Help!);

  // "Nieuw profiel": de naamvraag in de app, voorgevuld met "Kopie van Primavera P6". Annuleren doet niets.
  await page.locator('[data-ops-scheduling-new-profile]').click();
  const dialog = page.locator('[data-ops-new-profile-dialog]');
  await expect(dialog).toBeVisible();
  const nameField = dialog.locator('[data-ops-new-profile-name]');
  await expect(nameField).toHaveValue(/^(Kopie van|Copy of) Primavera P6$/);
  await expect(nameField).toBeFocused();
  await dialog.locator('[data-ops-new-profile-cancel]').click();
  await expect(dialog).toHaveCount(0);
  await expect(select(page)).toHaveAttribute('data-value', 'builtin:p6');
  await expect(page.locator('[data-ops-convention]')).toHaveCount(0);

  // Opnieuw, nu met een eigen naam: een lege naam kan niet, Enter maakt het profiel.
  await page.locator('[data-ops-scheduling-new-profile]').click();
  await nameField.fill('');
  await expect(dialog.locator('[data-ops-new-profile-create]')).toBeDisabled();
  await expect(dialog.locator('[data-ops-new-profile-name-required]')).toBeVisible();
  await nameField.pressSequentially('Aannemer zonder statusdatum');
  await nameField.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(select(page)).toHaveAttribute('data-value', 'current');
  await expect(select(page)).toHaveText('Aannemer zonder statusdatum');
  await expect(page.locator('[data-ops-scheduling-profile-name]')).toHaveValue('Aannemer zonder statusdatum');
  // Het deel staat open, met vinkjes: dezelfde waarden als P6.
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('input[type="checkbox"][data-ops-convention]')).toHaveCount(27);
  await expect(page.locator('[data-ops-conventions-readonly-note]')).toHaveCount(0);
  await expect(page.locator('[data-ops-convention="p6UseRemainingStartForProgress"]')).toBeChecked();
  // Nog niets in de store: pas Toepassen telt.
  expect((await profileOf(page))?.id).toBe('p6');

  // A23 aanzetten (afwijking met "terug naar basis"), dan Toepassen ⇒ het project rekent met het eigen profiel.
  await page.locator('[data-ops-convention="unstartedIgnoresStatusDate"]').check();
  await expect(a23).toHaveAttribute('data-ops-convention-deviates', 'true');
  await expect(a23.locator('[data-ops-convention-reset]')).toBeVisible();
  await expect(page.locator('[data-ops-conventions-deviating]')).toHaveText(/(afwijkend|changed): 1/);
  await shoot(page, section, 'eigen-profiel-bewerken', true, 760);
  await page.getByRole('button', { name: /^(Apply|Toepassen)$/ }).click();
  await expect.poll(() => profileOf(page)).toMatchObject({
    baseId: 'p6', name: 'Aannemer zonder statusdatum', overrides: { unstartedIgnoresStatusDate: true },
  });
  expect((await profileOf(page))?.id.startsWith('prof')).toBe(true);
  await expect.poll(() => earlyStart(page)).toBe('2026-01-05');

  // Ctrl+Z: één stap terug naar Primavera P6 met de oude datum.
  await page.keyboard.press('Control+z');
  await expect.poll(() => profileOf(page).then(p => p?.id)).toBe('p6');
  await expect.poll(() => earlyStart(page)).toBe('2026-03-02');
});

test('profielblok: een afwijking uit een oud bestand staat alleen-lezen en gaat mee naar Nieuw profiel', async ({ page, ops: _ops }) => {
  // Fixture: een project met een P6-profiel dat een afwijking op het ingebouwde id draagt (A19 uit), zoals
  // de migratie van een oud bestand dat geeft. Opslaan met Ctrl+S geeft het IFC; daarna echt openen.
  await openFile(page, 'oud.xer', XER);
  await expect.poll(() => profileOf(page).then(p => p?.id)).toBe('p6');
  await page.evaluate(() => {
    const s = window.__OPS__!.store;
    s.setState(draft => {
      draft.project.schedulingProfile = { baseId: 'p6', id: 'p6', name: '', overrides: { p6UseRemainingStartForProgress: false } };
    });
  });
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const ifc = await readFile((await (await download).path())!, 'utf8');
  expect(ifc).toContain('OPS_SchedulingProfile');
  await page.evaluate(() => { window.__OPS__!.store.getState().newDocument(); });
  await openFile(page, 'oud-profiel.ifc', ifc);
  await expect.poll(() => profileOf(page)).toMatchObject({ id: 'p6', overrides: { p6UseRemainingStartForProgress: false } });

  await toProjectInfo(page);
  await expect(select(page)).toHaveText(/^(Primavera P6 \(aangepast\)|Primavera P6 \(modified\))$/);
  // Ook ingeklapt is de afwijking te zien in de kop.
  await expect(page.locator('[data-ops-conventions-deviating]')).toHaveText(/(afwijkend|changed): 1/);
  await page.locator('[data-ops-conventions-toggle]').click();
  const a19 = page.locator('[data-ops-convention-row="p6UseRemainingStartForProgress"]');
  await expect(a19).toHaveAttribute('data-ops-convention-deviates', 'true');
  await expect(a19.locator('[data-ops-convention-value]')).toHaveAttribute('data-value', 'off');
  await expect(a19.locator('[data-ops-convention-reset]')).toHaveCount(0);
  await expect(page.locator('[data-ops-convention]')).toHaveCount(0);
  await expect(page.locator('[data-ops-conventions-readonly-note]')).toContainText(/(ouder bestand|older file)/);

  // Toepassen zonder wijziging laat de afwijking staan (nooit stil weg).
  await page.getByRole('button', { name: /^(Apply|Toepassen)$/ }).click();
  await expect.poll(() => profileOf(page)).toMatchObject({ id: 'p6', overrides: { p6UseRemainingStartForProgress: false } });

  // Nieuw profiel neemt de afwijking mee; daar is hij wel te wijzigen.
  await toProjectInfo(page);
  await page.locator('[data-ops-scheduling-new-profile]').click();
  await page.locator('[data-ops-new-profile-create]').click();
  await expect(page.locator('[data-ops-convention="p6UseRemainingStartForProgress"]')).not.toBeChecked();
  await expect(a19).toHaveAttribute('data-ops-convention-deviates', 'true');
  await expect(a19.locator('[data-ops-convention-reset]')).toBeVisible();
});

// Het blok "afwijkende reken-opties" (eigenaar, 2026-10-14). Zoals Roads: een XER die kritiek rekent op
// het langste pad (`critical_path_type` = CT_DrivPath); de rest van de opties is de P6-standaard.
const ROADS_XER = [
  'ERMHDR\t23.12\t2026-01-01\t\t\t\t\t\tEUR',
  '%T\tCALENDAR', '%F\tclndr_id\tclndr_name\tclndr_type\tday_hr_cnt\tweek_hr_cnt\tclndr_data',
  '%R\tC1\tStandaard 8u\tCA_Base\t8\t40\t',
  '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tclndr_id\tlast_recalc_date\tplan_start_date\tcritical_path_type',
  '%R\tP1\tRoads\tC1\t2026-03-02\t2026-01-05\tCT_DrivPath',
  '%T\tSCHEDOPTIONS', '%F\tproj_id\tsched_use_expect_end_flag', '%R\tP1\tY',
  '%T\tTASK',
  '%F\ttask_id\tproj_id\tclndr_id\ttask_code\ttask_name\ttask_type\tduration_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttarget_start_date\ttarget_end_date',
  '%R\tT1\tP1\tC1\tA1\tNiet gestart\tTT_Task\tDT_FixedDUR\tTK_NotStart\t40\t40\t2026-01-05\t2026-01-09',
  '%E',
].join('\n');
const options = (page: Page) => page.evaluate(() => {
  const o = window.__OPS__!.store.getState().project.schedulingOptions;
  return { crit: o?.criticalDefinition?.mode, expect: o?.useExpectedFinishDates };
});
async function chooseProfile(page: Page, value: string): Promise<void> {
  await select(page).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}

test('profielblok: afwijkende reken-opties tonen een blok met kruisje en een knop naar de standaard', async ({ page, ops: _ops }) => {
  // Een nieuw project (OPS, geen opties) toont geen blok.
  await dutchForShots(page);
  await toProjectInfo(page);
  await expect(page.locator('[data-ops-scheduling-options]')).toBeVisible();
  await expect(page.locator('[data-ops-options-deviate-notice]')).toHaveCount(0);
  await expect(page.locator('[data-ops-scheduling-apply-defaults]')).toHaveCount(0);
  await page.locator('[data-ops-backstage-back]').click();

  await openFile(page, 'roads.xer', ROADS_XER);
  await expect.poll(() => options(page)).toEqual({ crit: 'longestPath', expect: true });
  await toProjectInfo(page);
  const notice = page.locator('[data-ops-options-deviate-notice]');
  const lines = notice.locator('[data-ops-options-deviation]');
  // Onder P6 precies één regel: Kritiek-definitie, met de huidige waarde en de standaard. De bronoptie
  // (verwachte einddatums) telt niet mee.
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Primavera P6');
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toHaveAttribute('data-ops-options-deviation', 'criticalDefinition');
  await expect(lines.first()).toHaveText(/^(Kritiek-definitie: Langste pad \(standaard: totale speling ≤ 0 uren\)|Critical definition: Longest path \(default: total float ≤ 0 hours\))$/);
  await shoot(page, page.locator('[data-ops-scheduling-options]'), 'afwijkende-opties-p6', true);

  // Een wissel naar Microsoft Project in het formulier vergelijkt meteen met die standaard.
  await chooseProfile(page, 'builtin:msproject');
  await expect(notice).toContainText('Microsoft Project');
  await expect.poll(() => lines.evaluateAll(els => els.map(el => el.getAttribute('data-ops-options-deviation'))))
    .toEqual(['criticalDefinition', 'totalFloatMode']);
  await chooseProfile(page, 'builtin:p6');
  await expect(lines).toHaveCount(1);

  // Het kruisje verbergt het blok; terug naar de werkruimte en weer naar Projectinfo: het blijft weg.
  await notice.locator('[data-ops-options-deviate-dismiss]').click();
  await expect(notice).toHaveCount(0);
  await page.locator('[data-ops-backstage-back]').click();
  await toProjectInfo(page);
  await expect(notice).toHaveCount(0);
  // Een andere afwijking (de wissel naar MS Project geeft er een tweede) brengt het blok terug.
  await chooseProfile(page, 'builtin:msproject');
  await expect(notice).toBeVisible();
  await chooseProfile(page, 'builtin:p6');
  await expect(notice).toHaveCount(0);
  // De draft is weer gelijk aan het project: Terug vraagt niets.
  await expect(page.locator('[data-ops-project-info-unapplied]')).toHaveCount(0);
  await page.locator('[data-ops-backstage-back]').click();

  // Het bestand opnieuw openen (een nieuw document): het blok is terug. De knop zet de kritiek-definitie
  // in het formulier op de standaard, het blok verdwijnt, de bronoptie blijft; pas Toepassen rekent.
  await openFile(page, 'roads-opnieuw.xer', ROADS_XER);
  await expect.poll(() => options(page)).toEqual({ crit: 'longestPath', expect: true });
  await toProjectInfo(page);
  await expect(lines).toHaveCount(1);
  await notice.locator('[data-ops-scheduling-apply-defaults]').click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Kritiek-definitie|Critical definition)$/ })).toHaveText(/(Totale speling ≤ drempel|Total float ≤ threshold)/);
  await expect(page.locator('[data-ops-scheduling-source-option="useExpectedFinishDates"]')).toBeVisible();
  expect(await options(page)).toEqual({ crit: 'longestPath', expect: true });
  await page.getByRole('button', { name: /^(Apply|Toepassen)$/ }).click();
  await expect.poll(() => options(page)).toEqual({ crit: 'totalFloat', expect: true });
  await expect.poll(() => page.evaluate(() => window.__OPS__!.store.getState().scheduleStale)).toBe(false);
  // Eén undo-stap (B35).
  await page.keyboard.press('Control+z');
  await expect.poll(() => options(page)).toEqual({ crit: 'longestPath', expect: true });
});
