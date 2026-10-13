/** Halve pixel speling: zoom en subpixelbreedtes laten `scrollLeft` zelden exact op de rand eindigen. */
const EDGE_TOLERANCE = 1;

export interface DocumentTabScrollState {
  /** De tabbladen passen niet in de viewport; alleen dan staan de pijlknoppen er. */
  overflowing: boolean;
  /** De viewport staat aan het begin (LTR links, RTL rechts): de knop naar het begin is uit. */
  atStart: boolean;
  /** De viewport staat aan het eind: de knop naar het eind is uit. */
  atEnd: boolean;
}

export interface DocumentTabScrollMetrics {
  /** `scrollLeft` van de viewport. In RTL is die 0 aan het begin en negatief richting het eind. */
  scrollLeft: number;
  /** Breedte van alle tabbladen samen (de tablist op max-content). */
  contentWidth: number;
  /** Zichtbare breedte van de viewport. */
  viewportWidth: number;
  /** Breedte die de pijlknoppen nu innemen (0 als ze er niet staan). Zonder pijlen krijgt de
   *  viewport die ruimte terug; past alles dan, dan zijn de pijlen niet nodig. */
  arrowsWidth: number;
}

/** Bepaal of de pijlknoppen nodig zijn en welke uit staat. Werkt in LTR en RTL gelijk via |scrollLeft|. */
export function documentTabScrollState(metrics: DocumentTabScrollMetrics): DocumentTabScrollState {
  const overflowing = metrics.contentWidth > metrics.viewportWidth + metrics.arrowsWidth + EDGE_TOLERANCE;
  const offset = Math.abs(metrics.scrollLeft);
  const maxOffset = Math.max(0, metrics.contentWidth - metrics.viewportWidth);
  return {
    overflowing,
    atStart: offset <= EDGE_TOLERANCE,
    atEnd: offset >= maxOffset - EDGE_TOLERANCE,
  };
}

/** Aantal tabbladen dat één klik op een pijl opschuift (eigenaar, 2026-10-13: "twee projecten"). */
export const DOCUMENT_TABS_PER_SCROLL_STEP = 2;

/**
 * Doel-offset (logisch, vanaf het begin) voor één klik op een pijl. `tabStarts` zijn de logische
 * beginposities van de tabbladen, oplopend. De klik schuift precies `count` tabbladen en lijnt uit
 * op de rand van een tabblad: daarna staat aan de beginrand een heel tabblad. Zijn er minder dan
 * `count` tabbladen over, dan stopt de klik aan het eind of het begin.
 */
export function documentTabScrollTarget(
  tabStarts: readonly number[],
  offset: number,
  maxOffset: number,
  towards: 'start' | 'end',
  count = DOCUMENT_TABS_PER_SCROLL_STEP,
): number {
  if (tabStarts.length === 0) return towards === 'end' ? maxOffset : 0;
  // Het tabblad dat nu aan de beginrand staat (ook als het half zichtbaar is).
  let current = 0;
  for (let i = 0; i < tabStarts.length; i += 1) {
    if (tabStarts[i]! <= offset + EDGE_TOLERANCE) current = i;
  }
  // Staat dat tabblad half buiten beeld, dan telt naar het begin het halve tabblad als eerste stap.
  const partial = tabStarts[current]! < offset - EDGE_TOLERANCE;
  const target = towards === 'end'
    ? current + count
    : current - count + (partial ? 1 : 0);
  if (target >= tabStarts.length) return maxOffset;
  if (target <= 0) return 0;
  return Math.min(Math.max(tabStarts[target]!, 0), maxOffset);
}

/** `WheelEvent.deltaMode`: 0 = pixels, 1 = regels, 2 = pagina's. */
export function wheelDeltaInPixels(delta: number, deltaMode: number, pageWidth: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageWidth;
  return delta;
}
