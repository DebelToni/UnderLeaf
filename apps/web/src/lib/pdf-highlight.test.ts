import { describe, expect, it } from 'vitest';
import { paintPdfHighlights } from './pdf-highlight';

describe('PDF source highlights', () => {
  it('paints scaled overlays on the mapped PDF pages and replaces stale overlays', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="pdf-page" data-page="1"></div><div class="pdf-page" data-page="2"></div>';

    paintPdfHighlights(root, [{ page: 2, x: 70, y: 120, width: 220, height: 10 }], 1.5);
    const overlay = root.querySelector<HTMLElement>('[data-page="2"] .pdf-source-highlight');
    expect(overlay).not.toBeNull();
    expect(overlay!.style.left).toBe('103px');
    expect(overlay!.style.top).toBe('179px');
    expect(overlay!.style.width).toBe('334px');
    expect(overlay!.style.height).toBe('17px');

    paintPdfHighlights(root, [], 1.5);
    expect(root.querySelector('.pdf-source-highlight')).toBeNull();
  });
});
