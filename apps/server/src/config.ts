import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.umask(0o077);

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '../../..');

try {
  const envPath = resolve(repoRoot, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
} catch {
  // Environment variables still work when .env loading is unavailable.
}

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

const configuredDataDir = process.env.UNDERLEAF_DATA_DIR ?? './data';
export const config = {
  host: process.env.UNDERLEAF_HOST ?? '127.0.0.1',
  port: integer('UNDERLEAF_PORT', 4317),
  dataDir: isAbsolute(configuredDataDir) ? configuredDataDir : resolve(repoRoot, configuredDataDir),
  allowedOrigins: (process.env.UNDERLEAF_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://debeltoni.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  publicDiscoveryUrl:
    process.env.UNDERLEAF_PUBLIC_DISCOVERY_URL ?? 'https://debeltoni.github.io/UnderLeaf/api.json',
  sessionDays: integer('UNDERLEAF_SESSION_DAYS', 30),
  compileTimeoutSeconds: integer('UNDERLEAF_COMPILE_TIMEOUT_SECONDS', 45),
  dockerImage: process.env.UNDERLEAF_DOCKER_IMAGE ?? 'underleaf-tectonic:0.16.9',
  dockerContainer: process.env.UNDERLEAF_DOCKER_CONTAINER ?? 'underleaf-tectonic-worker',
  fakeCompiler: bool('UNDERLEAF_FAKE_COMPILER', false),
  trustProxy: bool('UNDERLEAF_TRUST_PROXY', true),
  webDist: resolve(repoRoot, 'apps/web/dist'),
  dockerfileDir: resolve(repoRoot, 'docker/tectonic')
};

mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
chmodSync(config.dataDir, 0o700);
