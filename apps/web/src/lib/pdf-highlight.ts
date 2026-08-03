import type { SyncTexHighlight } from '../types';

export function paintPdfHighlights(root: HTMLElement | null, highlights: SyncTexHighlight[], zoom: number): void {
  if (!root) return;
  for (const existing of root.querySelectorAll('.pdf-source-highlight')) existing.remove();
  for (const highlight of highlights) {
    const page = root.querySelector<HTMLElement>(`[data-page="${highlight.page}"]`);
    if (!page) continue;
    const overlay = document.createElement('div');
    overlay.className = 'pdf-source-highlight';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.left = `${Math.max(0, highlight.x * zoom - 2)}px`;
    overlay.style.top = `${Math.max(0, highlight.y * zoom - 1)}px`;
    overlay.style.width = `${Math.max(8, highlight.width * zoom + 4)}px`;
    overlay.style.height = `${Math.max(8, highlight.height * zoom + 2)}px`;
    page.append(overlay);
  }
}
