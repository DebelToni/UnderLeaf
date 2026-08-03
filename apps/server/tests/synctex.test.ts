import { describe, expect, it } from 'vitest';
import { locateSyncTex, parseSyncTex } from '../src/synctex.js';

const fixture = `SyncTeX Version:1
Input:1:/work/job/main.tex
Input:2:/work/job/sections/intro.tex
Input:3:/packages/main.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,10:6578176,13156352:26312704,6578176,0
(1,10:6578176,13156352:13156352,657818,131564
h1,10:6578176,13156352:13156352,0,0
)
]
(2,7:13156352,19734528:6578176,328909,65782
h2,7:13156352,19734528:6578176,0,0
)
(3,10:19734528,26312704:6578176,328909,65782
h3,10:19734528,26312704:6578176,0,0
)
}1
`;

describe('SyncTeX source mapping', () => {
  const index = parseSyncTex(fixture);

  it('maps a source line to top-origin PDF point geometry', () => {
    expect(locateSyncTex(index, 'main.tex', 10)).toEqual({
      mappedLine: 10,
      highlights: [{ page: 1, x: 100, y: 190, width: 200, height: 12 }]
    });
  });

  it('matches nested project paths without confusing equal basenames', () => {
    expect(locateSyncTex(index, 'sections/intro.tex', 7)).toEqual({
      mappedLine: 7,
      highlights: [{ page: 1, x: 200, y: 295, width: 100, height: 6 }]
    });
    expect(locateSyncTex(index, 'missing/main.tex', 10)).toEqual({ mappedLine: null, highlights: [] });
  });

  it('uses a nearby mapped line only for small structural gaps', () => {
    expect(locateSyncTex(index, 'main.tex', 8).mappedLine).toBe(10);
    expect(locateSyncTex(index, 'main.tex', 2)).toEqual({ mappedLine: null, highlights: [] });
  });
});
