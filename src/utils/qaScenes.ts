// Kijkscènes voor handmatige controle, alleen in DEV: `?qaScene=<naam>` zet de app via echte klikken op
// het punt dat de eigenaar moet zien, scrolt erheen en omlijnt het doel. Zo kan een checkstap een link
// zijn in plaats van een klikinstructie. Valt uit elke productiebouw (dynamische import achter
// `import.meta.env.DEV` in main.tsx). Geen testhaak: browsertests doen hun eigen handelingen.
import { useAppStore } from '@/state/appStore';

type Scene = {
  /** Eigen verloop zonder Projectinfo; geeft het doel-selector terug. */
  run?: () => Promise<string>;
  /** Voorbereiding in de store vóór Projectinfo opengaat (alleen beginstand, geen geteste handeling). */
  setup?: () => void;
  /** Klikken binnen Projectinfo voordat het doel zichtbaar is. */
  steps?: () => Promise<void>;
  /** Het element dat de eigenaar moet zien. */
  target?: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(selector: string, timeoutMs = 10000): Promise<HTMLElement> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    if (Date.now() > end) throw new Error(`qaScene: ${selector} niet gevonden`);
    await sleep(100);
  }
}

/** Knop op zichtbare tekst (nl of en), binnen `scope`. */
async function clickText(scope: string, texts: readonly string[], timeoutMs = 10000): Promise<void> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const btn = [...document.querySelectorAll<HTMLElement>(`${scope} button`)]
      .find(b => texts.includes(b.textContent?.trim() ?? ''));
    if (btn) { btn.click(); return; }
    if (Date.now() > end) throw new Error(`qaScene: knop ${texts.join('/')} niet gevonden`);
    await sleep(100);
  }
}

async function openProjectInfo(): Promise<void> {
  await clickText('body', ['Bestand', 'File']);
  await clickText('.backstage-sidebar', ['Projectinfo', 'Project info']);
  await waitFor('[data-ops-scheduling-profile-section]');
}

async function chooseProfile(value: string): Promise<void> {
  (await waitFor('[data-ops-scheduling-profile-select] .ops-select__trigger')).click();
  (await waitFor(`[role="option"][data-value="${value}"]`)).click();
}

/** Opent een bestand van een oudere app-versie (geen schemamarkering) met kop `schema`, en drukt Ctrl+S:
 *  de schemavraag (#292) verschijnt. Het bestand is de fixture van de arity-test. */
async function openOldFileAndSave(schema: 'IFC4' | 'IFC4X3'): Promise<string> {
  const raw = await (await fetch('/tests/planning/fixtures/ifc-arity-oude-writer.ifc')).text();
  const text = raw.replace("FILE_SCHEMA(('IFC4X3'));", `FILE_SCHEMA(('${schema}'));`);
  await useAppStore.getState().openExampleFromString(text, schema === 'IFC4' ? 'bouwmodel-ifc4.ifc' : 'oude-planning-ifc43.ifc');
  await sleep(500);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }));
  return '[data-ops-ifc-schema-question]';
}

const SCENES: Record<string, Scene> = {
  // Blauwe (nu oranje) infoblokken in Projectinfo › Rekenprofiel.
  'info-uitleg': {
    steps: async () => { (await waitFor('[data-ops-convention-help-toggle]')).click(); },
    target: '[data-ops-convention-help]',
  },
  'info-eigen-profielen': { target: '[data-ops-convention-own-only-note]' },
  'info-sslag-conventie': { target: '[data-ops-ss-lag-needs-convention]' },
  'info-sslag-uurplanning': {
    steps: () => chooseProfile('builtin:p6'),
    target: '[data-ops-ss-lag-needs-hour-planning]',
  },
  'info-bronbestand': {
    setup: () => {
      const s = useAppStore.getState();
      s.setProject({ schedulingOptions: { ...s.project.schedulingOptions, useExpectedFinishDates: true } });
    },
    target: '[data-ops-scheduling-source-options]',
  },
  // Info-labels (badge--blue) bij de conventies.
  'label-uurplanning': { target: '[data-ops-convention-requires="hourPlanning"]' },
  // Info (oranje) naast waarschuwing (geel + icoon): een conventie aanzetten maakt de groep "afwijkend"
  // en geeft onderaan "Wijzigingen niet toegepast".
  'waarschuwing-naast-info': {
    steps: async () => {
      (await waitFor('[data-ops-convention-group="completedWork"] input[type="checkbox"]')).click();
      await waitFor('[data-ops-project-info-unapplied]');
    },
    target: '[data-ops-convention-group="completedWork"]',
  },
  // De IFC-schemakeuze (#292).
  'ifc-schema': { target: '[data-ops-project-ifc-schema]' },
  // De schemavraag bij opslaan (#292): een IFC4-bestand, en een IFC 4.3-bestand van een oudere app.
  'ifc-vraag-ifc4': { run: () => openOldFileAndSave('IFC4') },
  'ifc-vraag-ifc43': { run: () => openOldFileAndSave('IFC4X3') },
};

export async function runQaScene(name: string): Promise<void> {
  const scene = SCENES[name];
  if (!scene) {
    console.warn(`qaScene: onbekend "${name}"; bekend: ${Object.keys(SCENES).join(', ')}`);
    return;
  }
  // PROTOTYPE (2026-10-14): `&warningVariant=rood` toont de rode waarschuwingsvariant (globals.css).
  const variant = new URLSearchParams(window.location.search).get('warningVariant');
  if (variant) document.documentElement.dataset.opsWarningVariant = variant;
  // Welkomstvenster (eerste start in een schone browser) wegklikken.
  await sleep(300);
  if (document.querySelector('[data-ops-welcome-dialog]')) await clickText('[data-ops-welcome-dialog]', ['Overslaan', 'Skip']);
  let target: string;
  if (scene.run) {
    target = await scene.run();
  } else {
    scene.setup?.();
    await openProjectInfo();
    await scene.steps?.();
    target = scene.target!;
  }
  const el = await waitFor(target);
  el.scrollIntoView({ block: 'center' });
  el.style.outline = '3px dashed var(--theme-accent)';
  el.style.outlineOffset = '3px';
}
