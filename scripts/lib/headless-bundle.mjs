// Gedeelde bouwstenen voor de headless bundels: de kern (`scripts/build-core.mjs`) en de headless
// MCP-server (`scripts/build-mcp-server.mjs`). Beide bundelen app-code voor Node zonder React, Tauri,
// de app-singleton en de i18n-UI-config; deze module houdt die grens op één plek.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Modules die een headless bundel niet nodig heeft en die alleen bereikbaar zijn via een dynamische
// import of binnen een React-hook. De stub gooit pas bij GEBRUIK, niet bij het laden.
export const STUBBED = [
  /^react$/, /^react-dom(\/.*)?$/, /^react-i18next$/, /^@tauri-apps\//, /^@\/i18n\/config$/,
];

// Inputs die nooit in een headless bundel mogen landen (padfragmenten, relatief aan de metafile).
export const FORBIDDEN_INPUTS = [
  'src/state/appStore.ts',
  'src/components/',
  'src/i18n/config.ts',
  'src/i18n/locales/',
  'node_modules/react/',
  'node_modules/react-dom/',
  'node_modules/@tauri-apps/',
];

/** esbuild-plugin: zustand zonder React-hook, en een gooiende stub voor elke module uit `STUBBED`. */
export function headlessStubPlugin(root, label) {
  return {
    name: 'ops-headless-stubs',
    setup(build) {
      // zustand: alleen de vanilla store, zonder React-hook (`create` geeft een functie-object met de
      // store-API, net als zustand zelf, maar zonder `useSyncExternalStore`).
      build.onResolve({ filter: /^zustand$/ }, () => ({ path: 'zustand', namespace: 'ops-core-zustand' }));
      build.onLoad({ filter: /.*/, namespace: 'ops-core-zustand' }, () => ({
        resolveDir: root,
        contents: `
          import { createStore } from 'zustand/vanilla';
          const bind = (api) => Object.assign(() => {
            throw new Error(${JSON.stringify(`React hooks are not available in ${label}`)});
          }, api);
          export const create = (init) => (init ? bind(createStore(init)) : (i) => bind(createStore(i)));
          export { createStore };`,
      }));
      for (const filter of STUBBED) {
        build.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'ops-core-stub' }));
      }
      build.onLoad({ filter: /.*/, namespace: 'ops-core-stub' }, (args) => ({
        contents: `
          const fail = () => { throw new Error(${JSON.stringify(`"${args.path}" is not available in ${label}`)}); };
          const stub = new Proxy(function () {}, { get: (_t, k) => (k === '__esModule' ? true : k === 'then' ? undefined : fail()), apply: fail, construct: fail });
          export default stub;`,
      }));
    },
  };
}

/** De inputpaden van een esbuild-metafile, met voorwaartse slashes. */
export function metafileInputs(metafile) {
  return Object.keys(metafile.inputs).map((p) => p.replace(/\\/g, '/'));
}

/** Inputs die op de verboden lijst staan (leeg = in orde). */
export function forbiddenInputs(inputs, extra = []) {
  const list = [...FORBIDDEN_INPUTS, ...extra];
  return inputs.filter((p) => list.some((f) => p.includes(f)));
}

/**
 * Licenties van de MEEGEBUNDELDE dependencies (afgeleid uit de metafile, niet uit een vaste lijst):
 * per pakket naam, versie, licentie en de volledige licentietekst uit node_modules. Gooit als een
 * gebundeld pakket geen licentiebestand heeft.
 */
export function bundledLicenses(inputs) {
  const bundledPackages = new Map();
  for (const input of inputs) {
    const m = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (!m) continue;
    const dir = resolve(process.cwd(), input.slice(0, m.index + m[0].length - 1));
    if (!bundledPackages.has(m[1])) bundledPackages.set(m[1], dir);
  }
  const parts = [];
  for (const [name, dir] of [...bundledPackages].sort(([a], [b]) => a.localeCompare(b))) {
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    if (!licenseFile || !existsSync(join(dir, licenseFile))) {
      throw new Error(`gebundeld pakket ${name} heeft geen licentiebestand in ${dir}`);
    }
    parts.push(`## ${name} ${meta.version}\n\nLicense: ${meta.license ?? 'see below'}\n\n\`\`\`text\n${readFileSync(join(dir, licenseFile), 'utf8').trim()}\n\`\`\`\n`);
  }
  return { names: [...bundledPackages.keys()].sort(), text: parts.join('\n') };
}
