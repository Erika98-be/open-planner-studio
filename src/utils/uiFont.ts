// Gedeelde bron van waarheid voor de interface-lettertypefamilie.
//
// WAAROM een aparte module: de keuze `ui.uiFontFamily` wordt op TWEE fundamenteel verschillende
// manieren toegepast. De DOM krijgt hem via de CSS-variabelen --font-heading/--font-body (App.tsx),
// het canvas via `ctx.font` (GanttRenderer/HistogramRenderer) — en een canvas leest GEEN CSS-
// variabelen, dus daar moet de concrete stack als string naartoe. Twee kopieën van diezelfde
// stacks lopen gegarandeerd uit elkaar zodra iemand er één aanpast, en dan toont de Gantt (het
// grootste leesoppervlak van de app) een ander lettertype dan de chrome eromheen. Vandaar: één
// tabel hier, twee consumenten.
import type { UIFontFamily } from '@/state/slices/types';

/** De stylesheet-default voor bodytekst — LETTERLIJK de waarde van `--font-body` in
 *  `src/styles/globals.css`. Bij familie 'default' verwijdert App.tsx de CSS-variabele-override,
 *  zodat de DOM op deze stack terugvalt; het canvas heeft geen variabele om op terug te vallen en
 *  krijgt daarom exact dezelfde string mee. Wijzigt `--font-body` in globals.css, dan MOET deze
 *  constante mee — anders wijkt het canvas af van de DOM. */
export const DEFAULT_UI_FONT_STACK = '"Inter", system-ui, sans-serif';

/**
 * Bepaalt de font-stack voor de expliciete keuze `system`.
 *
 * De systeemlettertypen worden per platform anders afgehandeld:
 *
 * - Windows gebruikt standaard Segoe UI.
 * - macOS gebruikt de native Apple-systeemfont.
 * - Linux gebruikt `-webkit-system-font` met `system-ui` als tweede keus. In WebKitGTK wordt
 *   `-webkit-system-font` gekoppeld aan het GTK-interfacelettertype van de desktopomgeving.
 *   Daardoor wordt bijvoorbeeld het door de gebruiker ingestelde GNOME-interfacelettertype
 *   gebruikt in plaats van een hardgecodeerd Linux-lettertype zoals Ubuntu, Cantarell of
 *   Noto Sans. In een gewone browser doet `system-ui` hetzelfde.
 *
 * De fallback `sans-serif` wordt gebruikt wanneer het platform niet beschikbaar is,
 * bijvoorbeeld tijdens server-side verwerking of bepaalde testomgevingen.
 */
function resolveSystemFontStack(): string {
  if (typeof navigator === 'undefined') {
    return 'sans-serif';
  }
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) {
    return '"Segoe UI", sans-serif';
  }
  if (platform.includes('mac')) {
    return '-apple-system, BlinkMacSystemFont, sans-serif';
  }
  // De VOLGORDE is hier de inhoud. WebKitGTK (de desktop-build) kent `system-ui` wél, maar lost het
  // op naar een vast lettertype en niet naar het GTK-interfacelettertype; alleen
  // `-webkit-system-font` volgt daar de desktopinstelling. Die moet dus vooraan staan, anders wint
  // `system-ui` en komt de tweede naam nooit aan bod. Chromium en Firefox kennen
  // `-webkit-system-font` niet, slaan hem over en nemen `system-ui`, dat bij hen het
  // desktoplettertype is.
  return '-webkit-system-font, system-ui, sans-serif';
}

/**
 * CSS font-stacks voor expliciete lettertypekeuzes.
 *
 * `default` ontbreekt bewust. Dit is geen afzonderlijke font-stack, maar betekent
 * "geen override". De DOM valt dan terug op de stylesheet-default en canvas-renderers
 * gebruiken `DEFAULT_UI_FONT_STACK`.
 *
 * Voor `system` wordt de stack tijdens initialisatie bepaald op basis van het platform.
 */
export const UI_FONT_STACKS: Record<Exclude<UIFontFamily, 'default'>, string> = {
  system: resolveSystemFontStack(),
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

/** De concrete CSS font-stack die bij een keuze hoort, inclusief 'default'. Bedoeld voor
 *  consumenten die géén CSS-variabele kunnen gebruiken — in de praktijk de Canvas-2D-renderers,
 *  die de string in `ctx.font` zetten. */
export function resolveUIFontStack(family: UIFontFamily): string {
  return family === 'default' ? DEFAULT_UI_FONT_STACK : UI_FONT_STACKS[family];
}
