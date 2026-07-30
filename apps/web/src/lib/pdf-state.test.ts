import { describe, expect, it } from 'vitest';
import { capturePdfViewState, restorePdfViewState } from './pdf-state';

describe('PDF view-state preservation', () => {
  it('captures exact scroll coordinates, zoom, and current page', () => {
    const state = capturePdfViewState({ scrollTop: 1834.5, scrollLeft: 127 }, 1.35, 7);
    expect(state).toEqual({ scrollTop: 1834.5, scrollLeft: 127, zoom: 1.35, page: 7 });
  });

  it('restores exact scroll coordinates after replacement', () => {
    const element = { scrollTop: 0, scrollLeft: 0 };
    restorePdfViewState(element, { scrollTop: 991.25, scrollLeft: 83.75, zoom: 1.1, page: 3 });
    expect(element.scrollTop).toBe(991.25);
    expect(element.scrollLeft).toBe(83.75);
  });
});
