// Bladmodule zonder imports: de formaten met een eigen uitleg na het openen (`formatNotice.ts`) en
// de validator van de instelling `ops-formatNoticeHidden`. Los van `formatNotice.ts`, zodat het
// instellingenregister en `slices/types.ts` niet de hele lezerketen van `formatRegistry` meetrekken.

/** De formaten met een eigen uitleg. Volgorde = volgorde in Instellingen. */
export const FORMAT_NOTICE_KINDS = ['xer', 'mpp', 'mspdi', 'p6xml', 'csv'] as const;
export type FormatNoticeKind = (typeof FORMAT_NOTICE_KINDS)[number];

/** Validator voor `ops-formatNoticeHidden`: een lijst bekende formaten, zonder dubbele, in de vaste
 *  volgorde. Iets anders dan een array ⇒ `undefined` (de store-default blijft staan). */
export function parseFormatNoticeHidden(raw: unknown): FormatNoticeKind[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return FORMAT_NOTICE_KINDS.filter((kind) => raw.includes(kind));
}

/** `hidden` met `kind` aan (tonen) of uit (verborgen), in de vaste volgorde. */
export function withFormatNoticeShown(
  hidden: readonly FormatNoticeKind[],
  kind: FormatNoticeKind,
  shown: boolean,
): FormatNoticeKind[] {
  return FORMAT_NOTICE_KINDS.filter((k) => (k === kind ? !shown : hidden.includes(k)));
}
