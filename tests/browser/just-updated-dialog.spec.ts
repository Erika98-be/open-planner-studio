import { expect, test } from './fixtures/ops';
import type { Page } from '@playwright/test';
import { completeTour, freshStart, startTourFromWelcome, tutorialOffer } from './fixtures/onboarding';

declare global {
  interface Window {
    openedReleaseUrls?: string[];
    updaterProbe: {
      kind: 'aur' | 'snap' | 'native';
      delayed: boolean;
      detections: Array<() => void>;
      calls: string[];
      installDone: boolean;
    };
  }
}

/**
 * De dialoog bevraagt de GitHub Releases-API voor de releasevergelijking (grootteverschil, tijd
 * tussen releases). Onbevoegd is die API op een gedeelde CI-runner rate-limited (403) en achter
 * een sandboxproxy niet vertrouwd (ERR_CERT_AUTHORITY_INVALID); beide geven een console.error die
 * de harness als fout telt, terwijl deze tests niets uit die vergelijking asserteren. Antwoord
 * daarom deterministisch met een lege lijst — de pure functies erachter zijn headless getest in
 * tests/planning/check-just-updated.ts.
 */
async function stubReleasesApi(page: Page): Promise<void> {
  await page.route('https://api.github.com/repos/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

async function selectLocale(page: Page, option: string, expectedLocale: string): Promise<void> {
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showSettingsDialog: true }));
  const settings = page.locator('.settings-dialog');
  await expect(settings).toBeVisible();
  // Taal zit sinds U1 op de Weergave-tab (tab 0, standaard al actief) samen met andere Selects,
  // dus scopen op de aria-label i.p.v. de eerste listbox-knop op de tab.
  await settings.locator('.settings-tab').nth(0).click();
  await settings.getByRole('button', { name: /^(Language|Taal)$/, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(expectedLocale);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ showSettingsDialog: false }));
}

test('update-highlights volgen de app-ready route en houden externe link open', async ({ page, ops: _ops }) => {
  await stubReleasesApi(page);
  await page.evaluate(() => {
    window.openedReleaseUrls = [];
    window.open = ((url?: string | URL) => {
      window.openedReleaseUrls!.push(String(url));
      return window;
    }) as typeof window.open;
  });
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ justUpdated: { from: '2026.8.0', to: '2026.8.1' } }));
  const dialog = page.locator('[data-ops-just-updated-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("You've been updated!", { exact: true })).toBeVisible();
  await expect(dialog.locator('pre')).toHaveCount(0);
  await expect(dialog.locator('article')).toHaveCount(5);
  await expect(dialog.getByRole('button', { name: 'Read the guide' })).toHaveCount(1);
  await expect(dialog.locator('article').nth(0).getByRole('button', { name: 'Read the guide' })).toHaveCount(1);
  await expect(dialog.locator('article').nth(1).getByRole('button')).toHaveCount(0);
  await expect(dialog.locator('article').nth(2).getByRole('button')).toHaveCount(0);
  await expect(dialog.locator('article').nth(3).getByRole('button')).toHaveCount(0);
  await expect(dialog.locator('article').nth(4).getByRole('button')).toHaveCount(0);
  await page.getByText('See full release notes').click({ noWaitAfter: true });
  await expect.poll(() => page.evaluate(() => window.openedReleaseUrls ?? [])).toEqual(['https://github.com/OpenAEC-Foundation/open-planner-studio/wiki/Changelog']);
  await expect(dialog).toBeVisible();
  await page.evaluate(() => { window.open = (() => null) as typeof window.open; });
  await page.getByText('See full release notes').click({ noWaitAfter: true });
  await expect(dialog.getByRole('alert')).toHaveText('The release notes could not be opened.');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('update-highlights werken smal, licht/donker en RTL', async ({ page, ops: _ops }) => {
  await stubReleasesApi(page);
  await page.setViewportSize({ width: 390, height: 420 });
  await selectLocale(page, 'NL — Nederlands', 'nl');
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ uiTheme: 'light', justUpdated: { from: null, to: '2026.8.1' } }));
  const dialog = page.locator('[data-ops-just-updated-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Importeer met de datums uit je planning')).toBeVisible();
  await expect(dialog.getByText('RESOURCEBIBLIOTHEKEN', { exact: true })).toBeVisible();
  await expect(dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ justUpdated: null }));
  await expect(dialog).toHaveCount(0);
  await selectLocale(page, 'AR — العربية', 'ar');
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ uiTheme: 'dark', justUpdated: { from: null, to: '2026.8.1' } }));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('إشغال مكتبة الموارد')).toBeVisible();
  await expect(dialog.getByText('الموارد', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expect(dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
});

// Besluit eigenaar 2026-10-19: vanaf 2026.10.0 hebben de hoogtepunten alle 28 UI-talen; oudere
// blokken houden hun veertien en vallen voor een nieuwere taal terug op Engels.
test('update-highlights: nieuwe taal toont 2026.10.0, een ouder blok valt terug op Engels', async ({ page, ops: _ops }) => {
  await stubReleasesApi(page);
  await selectLocale(page, 'SV — Svenska', 'sv');
  const dialog = page.locator('[data-ops-just-updated-dialog]');
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ justUpdated: { from: null, to: '2026.10.0' } }));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Öppna Primavera P6-filer')).toBeVisible();
  await expect(dialog.locator('article')).toHaveCount(5);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ justUpdated: null }));
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({ justUpdated: { from: null, to: '2026.9.0' } }));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Edit faster in one shared task grid')).toBeVisible();
});

// Eerste start met een bestaande `ops-lastVersion` maar zonder `ops-welcomeSeen` (bv. opslag
// gedeeltelijk gewist): "Net bijgewerkt" wacht op de hele eerste-startervaring (`isOnboardingActive`)
// — eerst welkom, rondleiding en tutorialvraag, pas daarna de updatehoogtepunten. De detectie zelf
// (`useUpdateCheck`) is Tauri-only en headless getest in check-just-updated.ts; hier zet de dev-brug
// haar uitkomst, direct na het laden, nog vóór de welkomst open is.
test('"Net bijgewerkt" pas na welkomst, rondleiding en tutorialvraag', async ({ page, ops: _ops }) => {
  await stubReleasesApi(page);
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  const justUpdated = page.locator('[data-ops-just-updated-dialog]');
  await freshStart(page, {
    seed: { 'ops-lastVersion': JSON.stringify('2026.8.0') },
    afterLoad: async p => {
      await p.evaluate(() => window.__OPS__!.store.getState().setUI({ justUpdated: { from: '2026.8.0', to: '2026.8.1' } }));
    },
  });
  await expect(justUpdated).toHaveCount(0);

  await startTourFromWelcome(page);
  await completeTour(page, async () => { await expect(justUpdated).toHaveCount(0); });
  await expect(tutorialOffer(page)).toBeVisible();
  await expect(justUpdated).toHaveCount(0);

  await tutorialOffer(page).getByRole('button', { name: /^(No|Nee)$/ }).click();
  await expect(tutorialOffer(page)).toHaveCount(0);
  await expect(justUpdated).toBeVisible();
});

// Andere route dan de highlights hierboven: een beschikbare update installeren. De desktop-API's
// krijgen testdoubles; de echte UpdateDialog en updaterService blijven draaien in de browser.
test('installeren wacht op detectie en laat AUR en Snap aan het pakketbeheer', async ({ page, ops: _ops }) => {
  await page.addInitScript(() => {
    window.updaterProbe = { kind: 'aur', delayed: true, detections: [], calls: [], installDone: false };
  });
  const doubles: Record<string, string> = {
    platform: 'export const isTauri = () => true;',
    recovery: 'export const flushRecoveryNow = async () => {};',
    core: `export async function invoke() {
      const probe = window.updaterProbe;
      if (!probe.delayed) return probe.kind;
      return new Promise(resolve => probe.detections.push(() => resolve(probe.kind)));
    }`,
    updater: `export async function check() {
      return {
        version: '2099.1.0', body: 'Test release',
        download: async () => { window.updaterProbe.calls.push('download'); },
        install: async () => { window.updaterProbe.calls.push('install'); },
      };
    }`,
    process: `export async function relaunch() { window.updaterProbe.calls.push('relaunch'); }`,
  };
  await page.route('**/__updater_probe__/*.js', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!.replace('.js', '');
    return route.fulfill({ contentType: 'text/javascript', body: doubles[name] });
  });
  await page.route('**/src/services/updater/updaterService.ts*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    // Alleen de externe afhankelijkheden van deze service vervangen; de app blijft een webbuild.
    for (const [pattern, name] of [
      [/(["'])\/src\/utils\/platform\.ts(?:\?[^"']*)?\1/g, 'platform'],
      [/(["'])\/src\/services\/recovery\/recoveryFlush\.ts(?:\?[^"']*)?\1/g, 'recovery'],
      [/(["'])[^"']*@tauri-apps_api_core[^"']*\1/g, 'core'],
      [/(["'])[^"']*@tauri-apps_plugin-updater[^"']*\1/g, 'updater'],
      [/(["'])[^"']*@tauri-apps_plugin-process[^"']*\1/g, 'process'],
    ] as const) {
      body = body.replace(pattern, `"/__updater_probe__/${name}.js"`);
    }
    await route.fulfill({ response, body });
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!window.__OPS__)).toBe(true);
  await page.evaluate(() => window.__OPS__!.store.getState().setUI({
    showWelcomeDialog: false, showTourOverlay: false, showUpdateDialog: true,
  }));
  const dialog = page.getByRole('dialog').filter({ hasText: 'Software update' });
  const install = dialog.getByRole('button', { name: 'Download & install', exact: true });
  await expect(dialog.getByText('A new version is available', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.updaterProbe.detections.length)).toBeGreaterThan(0);
  const detections = await page.evaluate(() => window.updaterProbe.detections.length);
  // De updatecheck is al klaar, de Arch-detectie nog niet: er is geen installeerknop.
  await expect(install).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.updaterProbe.calls)).toEqual([]);

  // Onafhankelijke servicecontrole: ook een rechtstreekse aanroep moet op detectie wachten.
  await page.evaluate(async () => {
    const moduleUrl = '/src/services/updater/updaterService.ts';
    const service = await import(moduleUrl) as typeof import('@/services/updater/updaterService');
    void service.downloadAndInstall().then(() => { window.updaterProbe.installDone = true; });
  });
  await expect.poll(() => page.evaluate(expected => (
    window.updaterProbe.installDone || window.updaterProbe.detections.length === expected
  ), detections + 1)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.updaterProbe.calls)).toEqual([]);
  await page.evaluate(() => {
    window.updaterProbe.delayed = false;
    window.updaterProbe.detections.forEach(resolve => resolve());
  });
  await expect.poll(() => page.evaluate(() => window.updaterProbe.installDone)).toBe(true);
  await expect(dialog.getByText('Update through your package manager (for example yay -Syu).')).toBeVisible();
  await expect(install).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.updaterProbe.calls)).toEqual([]);

  // Snap houdt dezelfde blokkade; een bekende native installatie hoeft geen tijdslimiet af te wachten.
  for (const kind of ['snap', 'native'] as const) {
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.evaluate(kind => {
      window.updaterProbe.kind = kind;
      window.__OPS__!.store.getState().setUI({ showUpdateDialog: true });
    }, kind);
    await expect(dialog.getByText('A new version is available', { exact: true })).toBeVisible();
    if (kind === 'snap') {
      await expect(dialog.getByText(/automatically via the Snap Store/)).toBeVisible();
      await expect(install).toHaveCount(0);
      await page.evaluate(async () => {
        const moduleUrl = '/src/services/updater/updaterService.ts';
        const service = await import(moduleUrl) as typeof import('@/services/updater/updaterService');
        await service.downloadAndInstall();
      });
      await expect.poll(() => page.evaluate(() => window.updaterProbe.calls)).toEqual([]);
    } else {
      await install.click();
      await expect.poll(() => page.evaluate(() => window.updaterProbe.calls)).toEqual(['download', 'install', 'relaunch']);
    }
  }
});
