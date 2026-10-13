/** Halve pixel speling: zoom en subpixelbreedtes laten `scrollLeft` zelden exact op de rand eindigen. */
const EDGE_TOLERANCE = 1;

/**
 * Marge voor het weghalen van de pijlen. Ze verschijnen zodra de tabbladen niet passen, maar
 * verdwijnen pas als er minstens zoveel pixels over zijn. Een meetfout van een paar pixels
 * (subpixels, zoom, een knop die één pixel krimpt) kan zo nooit een aan-uit-lus geven.
 */
export const DOCUMENT_TAB_HIDE_MARGIN = 4;

/**
 * Hebben de tabbladen de pijlknoppen nodig?
 *
 * `availableWidth` is de ruimte die de tabbladen zónder pijlen zouden krijgen: de strook min de
 * vaste knoppen (menu, "+") en hun tussenruimte. Die maat hangt dus niet af van of de pijlen er
 * staan. Daardoor kan het verschijnen van de pijlen de uitkomst nooit omkeren.
 */
export function documentTabNeedsArrows(
  contentWidth: number,
  availableWidth: number,
  arrowsShown: boolean,
): boolean {
  if (arrowsShown) return contentWidth > availableWidth - DOCUMENT_TAB_HIDE_MARGIN;
  return contentWidth > availableWidth + EDGE_TOLERANCE / 2;
}

export interface DocumentTabScrollEdges {
  /** De viewport staat aan het begin (LTR links, RTL rechts): de knop naar het begin is uit. */
  atStart: boolean;
  /** De viewport staat aan het eind: de knop naar het eind is uit. */
  atEnd: boolean;
}

/** Randen uit `scrollLeft`. In RTL is die 0 aan het begin en negatief richting het eind. */
export function documentTabScrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): DocumentTabScrollEdges {
  const offset = Math.abs(scrollLeft);
  const maxOffset = Math.max(0, scrollWidth - clientWidth);
  return {
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
  // Het tabblad dat nu aan de beginrand staat (ook als het half zichtbaar is).
  let current = 0;
  for (let i = 0; i < tabStarts.length; i += 1) {
    if (tabStarts[i]! <= offset + EDGE_TOLERANCE) current = i;
  }
  // Staat dat tabblad half buiten beeld, dan telt naar het begin het halve tabblad als eerste stap.
  const partial = (tabStarts[current] ?? 0) < offset - EDGE_TOLERANCE;
  const target = towards === 'end'
    ? current + count
    : current - count + (partial ? 1 : 0);
  if (target >= tabStarts.length) return maxOffset;
  if (target <= 0) return 0;
  return Math.min(Math.max(tabStarts[target]!, 0), maxOffset);
}

/** `WheelEvent.deltaMode` 1 = regels (Firefox met muiswiel); anders pixels. */
export function wheelDeltaInPixels(delta: number, deltaMode: number): number {
  return deltaMode === 1 ? delta * 16 : delta;
}
