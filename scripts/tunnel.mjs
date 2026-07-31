#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const discoveryPath = join(docsDir, 'api.json');
const localBase = `http://${process.env.UNDERLEAF_HOST ?? '127.0.0.1'}:${process.env.UNDERLEAF_PORT ?? '4317'}`;
const tunnelPattern = /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/g;
let backend;
let tunnel;
let stopping = false;
let replacingTunnel = false;
let stopPromise;

process.once('SIGINT', () => void stop('Stopping UnderLeaf…', 0));
process.once('SIGTERM', () => void stop('Stopping UnderLeaf…', 0));

try {
  run('pnpm', ['--filter', '@underleaf/server', 'build']);
  run('pnpm', ['build:pages']);

  backend = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit']
  });
  backend.once('exit', (code) => {
    if (!stopping) void stop(`Backend exited with status ${String(code)}`, 1);
  });
  await waitForHealth();

  const url = await startReachableTunnel();
  await writeDiscovery(true, url);
  publish('site: publish current tunnel');

  console.log(`\nUnderLeaf is online:\n  App: ${stableAppUrl()}\n  API: ${url}\n\nPress Ctrl+C to stop.\n`);
  await new Promise(() => {});
} catch (error) {
  await stop(error instanceof Error ? error.message : String(error), 1);
}

async function startReachableTunnel() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const url = await startTunnel();
    try {
      await waitForPublicHealth(url);
      return url;
    } catch (error) {
      lastError = error;
      replacingTunnel = true;
      await terminate(tunnel, 5_000);
      tunnel = undefined;
      replacingTunnel = false;
      if (attempt < 3) console.warn(`Tunnel attempt ${attempt} was unreachable; requesting another URL.`);
    }
  }
  throw lastError ?? new Error('Could not create a reachable Cloudflare tunnel');
}

async function startTunnel() {
  return new Promise((resolveUrl, reject) => {
    let settled = false;
    let transcript = '';
    tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', localBase], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const inspect = (chunk) => {
      const text = chunk.toString();
      transcript = `${transcript}${text}`.slice(-30_000);
      const url = transcript.match(tunnelPattern)?.at(-1);
      if (url && !settled) {
        settled = true;
        clearTimeout(timer);
        resolveUrl(url);
      }
    };
    tunnel.stdout.on('data', inspect);
    tunnel.stderr.on('data', inspect);
    tunnel.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    tunnel.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`cloudflared exited with status ${String(code)}\n${transcript.slice(-4000)}`));
      } else if (!stopping && !replacingTunnel) {
        void stop(`cloudflared exited with status ${String(code)}`, 1);
      }
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      tunnel?.kill('SIGTERM');
      reject(new Error(`Timed out waiting for a Cloudflare tunnel URL\n${transcript.slice(-4000)}`));
    }, 60_000);
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (backend?.exitCode != null) throw new Error(`Backend exited with status ${backend.exitCode}`);
    try {
      const response = await fetch(`${localBase}/health`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {
      // Keep waiting while the server starts.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
  }
  throw new Error(`UnderLeaf did not start at ${localBase}`);
}

async function waitForPublicHealth(apiBase) {
  // Avoid caching an NXDOMAIN response while Cloudflare is still publishing the random hostname.
  await new Promise((resolveWait) => setTimeout(resolveWait, 6_000));
  const deadline = Date.now() + 60_000;
  let lastError = '';
  while (Date.now() < deadline) {
    if (tunnel?.exitCode != null) throw new Error(`cloudflared exited with status ${tunnel.exitCode}`);
    try {
      const response = await fetch(`${apiBase}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error(`The public tunnel did not become reachable: ${lastError}`);
}

async function writeDiscovery(online, apiBase) {
  await mkdir(docsDir, { recursive: true });
  await writeFile(
    discoveryPath,
    `${JSON.stringify({ online, apiBase, updatedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

function publish(message) {
  if (!isGitRepository()) return console.warn('Git repository not initialized; discovery was not published.');
  run('git', ['add', 'docs'], false);
  const changed = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root }).status !== 0;
  if (!changed) return;
  run('git', ['commit', '-m', message], false);
  const pushed = spawnSync('git', ['push', 'origin', 'main'], { cwd: root, stdio: 'inherit' });
  if (pushed.status !== 0) throw new Error('Could not push the GitHub Pages discovery update');
}

async function stop(message, code) {
  if (stopPromise) return stopPromise;
  stopping = true;
  stopPromise = (async () => {
    console.log(`\n${message}`);
    await Promise.all([terminate(tunnel, 5_000), terminate(backend, 70_000)]);
    try {
      await writeDiscovery(false, '');
      publish('site: mark server offline');
    } catch (error) {
      console.error('Could not publish the offline state:', error);
      code = 1;
    }
    process.exit(code);
  })();
  return stopPromise;
}

function terminate(child, timeoutMs) {
  if (!child || child.exitCode != null) return Promise.resolve();
  return new Promise((resolveExit) => {
    let finished = false;
    let timer;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolveExit();
    };
    child.once('exit', finish);
    child.kill('SIGTERM');
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      setTimeout(finish, 1_000).unref();
    }, timeoutMs);
  });
}

function run(program, args, inherit = true) {
  const result = spawnSync(program, args, { cwd: root, stdio: inherit ? 'inherit' : 'ignore', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} exited with status ${String(result.status)}`);
}

function isGitRepository() {
  return spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' }).status === 0;
}

function stableAppUrl() {
  try {
    const discovery = process.env.UNDERLEAF_PUBLIC_DISCOVERY_URL ?? 'https://debeltoni.github.io/UnderLeaf/api.json';
    return new URL('.', discovery).toString();
  } catch {
    return 'https://debeltoni.github.io/UnderLeaf/';
  }
}
