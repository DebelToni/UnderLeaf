import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('touch viewport lock', () => {
  it('disables page-level scaling with the locked mobile viewport', () => {
    expect(index).toContain(
      'width=device-width, height=device-height, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
    );
  });

  it('locks the document while retaining pane-level touch scrolling', () => {
    expect(styles).toMatch(/@media \(any-pointer: coarse\)[\s\S]*body \{[\s\S]*position: fixed;[\s\S]*touch-action: none;/);
    expect(styles).toMatch(/\.auth-shell, \.dashboard-shell \{[\s\S]*overflow-y: auto;[\s\S]*touch-action: pan-y;/);
    expect(styles).toMatch(/\.pdf-scroll,[\s\S]*touch-action: pan-x pan-y;/);
  });
});
