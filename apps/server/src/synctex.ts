import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const POINTS_PER_SYNC_UNIT = 65_781.76;
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 12;

export interface SyncTexHighlight {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SyncTexLocation {
  mappedLine: number | null;
  highlights: SyncTexHighlight[];
}

interface Candidate extends SyncTexHighlight {
  level: number;
}

interface LineCandidates {
  horizontal: Candidate[];
  vertical: Candidate[];
  parent: Candidate[];
}

interface SourceIndex {
  path: string;
  lines: Map<number, LineCandidates>;
}

export interface SyncTexIndex {
  sources: SourceIndex[];
}

interface Frame extends Candidate {
  kind: '(' | '[';
}

const cache = new Map<string, SyncTexIndex>();

export async function locateSyncTexFile(artifactPath: string, sourcePath: string, line: number): Promise<SyncTexLocation> {
  let index = cache.get(artifactPath);
  if (!index) {
    const compressed = await readFile(artifactPath);
    if (compressed.byteLength > MAX_COMPRESSED_BYTES) throw new Error('SyncTeX artifact is too large');
    const text = gunzipSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }).toString('utf8');
    index = parseSyncTex(text);
    cache.set(artifactPath, index);
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  return locateSyncTex(index, sourcePath, line);
}

export function parseSyncTex(text: string): SyncTexIndex {
  const inputPaths = new Map<number, string>();
  const sourceLines = new Map<number, Map<number, LineCandidates>>();
  const stack: Frame[] = [];
  let page = 0;
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;

  const lineCandidates = (tag: number, line: number): LineCandidates => {
    let lines = sourceLines.get(tag);
    if (!lines) {
      lines = new Map();
      sourceLines.set(tag, lines);
    }
    let candidates = lines.get(line);
    if (!candidates) {
      candidates = { horizontal: [], vertical: [], parent: [] };
      lines.set(line, candidates);
    }
    return candidates;
  };

  for (const rawLine of text.split('\n')) {
    let match = rawLine.match(/^Input:(\d+):(.*)$/);
    if (match) {
      if (match[2]) inputPaths.set(Number(match[1]), normalizePath(match[2]));
      continue;
    }
    match = rawLine.match(/^Unit:(\d+)$/);
    if (match) { unit = Number(match[1]); continue; }
    match = rawLine.match(/^Magnification:(\d+)$/);
    if (match) { magnification = Number(match[1]); continue; }
    match = rawLine.match(/^X Offset:(-?\d+)$/);
    if (match) { xOffset = Number(match[1]); continue; }
    match = rawLine.match(/^Y Offset:(-?\d+)$/);
    if (match) { yOffset = Number(match[1]); continue; }
    match = rawLine.match(/^\{(\d+)$/);
    if (match) { page = Number(match[1]); stack.length = 0; continue; }
    if (/^}\d+$/.test(rawLine)) { page = 0; stack.length = 0; continue; }

    match = rawLine.match(/^([[(])(\d+),(\d+):(-?\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+)/);
    if (match && page) {
      const scale = unit * (1000 / magnification) / POINTS_PER_SYNC_UNIT;
      const frame: Frame = {
        kind: match[1] as '(' | '[',
        page,
        x: (Number(match[4]) + xOffset) * scale,
        y: (Number(match[5]) - Number(match[7]) + yOffset) * scale,
        width: Number(match[6]) * scale,
        height: (Number(match[7]) + Number(match[8])) * scale,
        level: stack.length
      };
      stack.push(frame);
      const candidates = lineCandidates(Number(match[2]), Number(match[3]));
      (frame.kind === '(' ? candidates.horizontal : candidates.vertical).push(frame);
      continue;
    }
    if (rawLine === ')' || rawLine === ']') {
      stack.pop();
      continue;
    }

    match = rawLine.match(/^[a-z$](\d+),(\d+):(-?\d+),(-?\d+)/);
    if (match && page) {
      const parent = [...stack].reverse().find((frame) => frame.kind === '(');
      if (parent) lineCandidates(Number(match[1]), Number(match[2])).parent.push(parent);
    }
  }

  return {
    sources: [...inputPaths.entries()].flatMap(([tag, path]) => {
      const lines = sourceLines.get(tag);
      return lines ? [{ path, lines }] : [];
    })
  };
}

export function locateSyncTex(index: SyncTexIndex, sourcePath: string, requestedLine: number): SyncTexLocation {
  const normalized = normalizePath(sourcePath).replace(/^\.\//, '');
  const source = index.sources
    .filter((item) => item.path === normalized || item.path.endsWith(`/${normalized}`))
    .sort((left, right) => left.path.length - right.path.length)[0];
  if (!source) return { mappedLine: null, highlights: [] };

  let mappedLine = requestedLine;
  let candidates = source.lines.get(mappedLine);
  if (!usable(candidates)) {
    const nearest = [...source.lines.keys()]
      .filter((line) => usable(source.lines.get(line)) && Math.abs(line - requestedLine) <= 3)
      .sort((left, right) => Math.abs(left - requestedLine) - Math.abs(right - requestedLine) || left - right)[0];
    if (nearest == null) return { mappedLine: null, highlights: [] };
    mappedLine = nearest;
    candidates = source.lines.get(nearest)!;
  }

  const preferred = valid(candidates!.horizontal);
  const fallback = preferred.length ? preferred : valid(candidates!.vertical);
  const selected = fallback.length ? fallback : valid(candidates!.parent);
  return { mappedLine, highlights: maximal(selected).slice(0, 12).map(publicHighlight) };
}

function usable(candidates: LineCandidates | undefined): boolean {
  return Boolean(candidates && (valid(candidates.horizontal).length || valid(candidates.vertical).length || valid(candidates.parent).length));
}

function valid(candidates: Candidate[]): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (
      candidate.page < 1 || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) ||
      !Number.isFinite(candidate.width) || !Number.isFinite(candidate.height) ||
      candidate.width < 2 || candidate.height < 2 || candidate.width > 2_000 || candidate.height > 2_000
    ) continue;
    const key = [candidate.page, candidate.x, candidate.y, candidate.width, candidate.height]
      .map((value) => Math.round(value * 10)).join(':');
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function maximal(candidates: Candidate[]): Candidate[] {
  return candidates
    .filter((candidate, index) => !candidates.some((other, otherIndex) =>
      index !== otherIndex && area(other) > area(candidate) * 1.05 && contains(other, candidate)
    ))
    .sort((left, right) => left.page - right.page || left.y - right.y || left.x - right.x);
}

function contains(outer: Candidate, inner: Candidate): boolean {
  const tolerance = 0.75;
  return outer.page === inner.page &&
    outer.x <= inner.x + tolerance && outer.y <= inner.y + tolerance &&
    outer.x + outer.width >= inner.x + inner.width - tolerance &&
    outer.y + outer.height >= inner.y + inner.height - tolerance;
}

function area(candidate: Candidate): number {
  return candidate.width * candidate.height;
}

function publicHighlight(candidate: Candidate): SyncTexHighlight {
  return {
    page: candidate.page,
    x: round(candidate.x),
    y: round(candidate.y),
    width: round(candidate.width),
    height: round(candidate.height)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+/g, '/');
}
