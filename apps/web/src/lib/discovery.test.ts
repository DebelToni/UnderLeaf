import { describe, expect, it, vi } from 'vitest';
import { resolveApiBase, ServerOfflineError } from './discovery';

describe('resolveApiBase', () => {
  it('uses an explicit local API base without discovery', async () => {
    const fetcher = vi.fn();
    await expect(resolveApiBase({ envBase: 'http://127.0.0.1:4317/', discoveryUrl: '/api.json', fetcher })).resolves.toBe('http://127.0.0.1:4317');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches the Pages discovery document without caching and verifies the backend', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ online: true, apiBase: 'https://paper-tree.trycloudflare.com/' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const base = await resolveApiBase({ discoveryUrl: 'https://debeltoni.github.io/UnderLeaf/api.json', fetcher });
    expect(base).toBe('https://paper-tree.trycloudflare.com');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: 'no-store' });
    expect(String(fetcher.mock.calls[0]![0])).toContain('ts=');
  });

  it('reports an explicitly offline discovery document', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ online: false, apiBase: '' }), { status: 200 }));
    await expect(resolveApiBase({ discoveryUrl: '/api.json', fetcher })).rejects.toBeInstanceOf(ServerOfflineError);
  });
});
