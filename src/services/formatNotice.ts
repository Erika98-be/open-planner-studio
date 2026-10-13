// Uitleg bij het openen van een ander formaat dan IFC (eigenaarsbesluit 2026-10-12, optie 1).
//
// Opent de gebruiker zelf een bestand dat geen IFC is, dan legt een korte dialoog uit wat de app uit
// dat formaat overnam, wat niet, en hoe opslaan en terugschrijven werken. Per formaat kan de
// gebruiker de uitleg uitzetten ("niet meer tonen"); Instellingen zet hem weer aan.
//
// Deze module is puur: de beslissing "welke uitleg, of geen" staat hier, zodat
// `tests/planning/check-format-notice.ts` hem zonder store of DOM kan testen. De store-kant
// (`fileSlice`) roept hem alleen aan op de open-routes die de GEBRUIKER start (Bestand → Openen,
// Recente bestanden, Openen van de site); MCP, extensies, crashherstel en voorbeelden niet.

import { detectXmlFlavor, readFormatForFile } from '@/services/formatRegistry';
import type { FormatNoticeKind } from '@/services/formatNoticeKinds';

/**
 * Welk formaat had het geopende bestand, voor de uitleg? `null` = geen uitleg (IFC, of een
 * onbekende extensie: die leest de app als IFC). Een `.xml` kiest net als de lezer zelf op het
 * root-element (`detectXmlFlavor`); zonder tekst of bij een onbekend root-element: geen uitleg.
 */
export function formatNoticeKindFor(name: string, text?: string): FormatNoticeKind | null {
  switch (readFormatForFile(name).id) {
    case 'xer': return 'xer';
    case 'mpp': return 'mpp';
    case 'csv': return 'csv';
    case 'xml': {
      const flavor = text === undefined ? null : detectXmlFlavor(text);
      return flavor === 'p6' ? 'p6xml' : flavor === 'mspdi' ? 'mspdi' : null;
    }
    default: return null;
  }
}

/** De uitleg die na deze open-actie verschijnt, of `null`: geen uitleg voor dit formaat, of de
 *  gebruiker zette hem voor dit formaat uit. */
export function formatNoticeToShow(
  name: string,
  text: string | undefined,
  hidden: readonly FormatNoticeKind[],
): FormatNoticeKind | null {
  const kind = formatNoticeKindFor(name, text);
  return kind !== null && !hidden.includes(kind) ? kind : null;
}
