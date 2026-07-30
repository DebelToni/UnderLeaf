export interface DiscoveryDocument {
  online: boolean;
  apiBase: string;
  updatedAt?: string | null;
}

export interface ResolveApiOptions {
  envBase?: string;
  discoveryUrl: string;
  fetcher?: typeof fetch;
}

export class ServerOfflineError extends Error {
  constructor(message = 'The UnderLeaf server is offline') {
    super(message);
    this.name = 'ServerOfflineError';
  }
}

export async function resolveApiBase({ envBase, discoveryUrl, fetcher = fetch }: ResolveApiOptions): Promise<string> {
  if (envBase?.trim()) return normalizeApiBase(envBase);

  let response: Response;
  try {
    const url = new URL(discoveryUrl, window.location.href);
    url.searchParams.set('ts', String(Date.now()));
    response = await fetcher(url, { cache: 'no-store', headers: { Accept: 'application/json, text/plain' } });
  } catch {
    throw new ServerOfflineError('Could not reach the server discovery document');
  }
  if (!response.ok) throw new ServerOfflineError(`Discovery returned ${response.status}`);

  const text = (await response.text()).trim();
  let online = true;
  let apiBase = '';
  try {
    const document = JSON.parse(text) as Partial<DiscoveryDocument> & { url?: string; backend?: string };
    online = document.online !== false;
    apiBase = document.apiBase ?? document.url ?? document.backend ?? '';
  } catch {
    apiBase = text;
  }
  if (!online || !apiBase) throw new ServerOfflineError();
  const normalized = normalizeApiBase(apiBase);

  try {
    const status = await fetcher(`${normalized}/api/v1/status`, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    if (!status.ok) throw new Error();
  } catch {
    throw new ServerOfflineError('The local UnderLeaf server did not answer');
  }
  return normalized;
}

export function normalizeApiBase(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ServerOfflineError('The API endpoint is not secure');
  }
  return url.toString().replace(/\/$/, '');
}
