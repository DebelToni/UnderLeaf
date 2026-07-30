import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors.js';
import { safeUnzip } from '../src/safe-zip.js';

 describe('safeUnzip', () => {
  it('extracts ordinary files', () => {
    const archive = zipSync({ 'paper/main.tex': new TextEncoder().encode('hello') });
    const files = safeUnzip(archive, { maxFiles: 10, maxUnpackedBytes: 100 });
    expect(new TextDecoder().decode(files['paper/main.tex'])).toBe('hello');
  });

  it('rejects highly compressed content before allocating beyond the limit', () => {
    const archive = zipSync({ 'large.tex': new Uint8Array(1_000_000) }, { level: 9 });
    expect(() => safeUnzip(archive, { maxFiles: 10, maxUnpackedBytes: 1_000 })).toThrowError(HttpError);
  });

  it('rejects excessive file counts', () => {
    const archive = zipSync({ 'a.tex': new Uint8Array(), 'b.tex': new Uint8Array() });
    expect(() => safeUnzip(archive, { maxFiles: 1, maxUnpackedBytes: 100 })).toThrowError(HttpError);
  });
});
