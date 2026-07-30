export interface PdfViewState {
  scrollTop: number;
  scrollLeft: number;
  zoom: number;
  page: number;
}

export interface ScrollElement {
  scrollTop: number;
  scrollLeft: number;
}

export function capturePdfViewState(element: ScrollElement | null, zoom: number, page: number): PdfViewState {
  return {
    scrollTop: element?.scrollTop ?? 0,
    scrollLeft: element?.scrollLeft ?? 0,
    zoom,
    page
  };
}

export function restorePdfViewState(element: ScrollElement | null, state: PdfViewState): void {
  if (!element) return;
  element.scrollTop = state.scrollTop;
  element.scrollLeft = state.scrollLeft;
}

export function afterLayout(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}
