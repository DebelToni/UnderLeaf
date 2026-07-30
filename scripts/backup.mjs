#!/usr/bin/env node
import { backup, DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.umask(0o077);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(join(root, '.env'));

const configuredData = process.env.UNDERLEAF_DATA_DIR ?? './data';
const dataDir = isAbsolute(configuredData) ? configuredData : resolve(root, configuredData);
const destinationRoot = process.env.UNDERLEAF_BACKUP_DIR ?? '/Volumes/SSD/backups/UnderLeaf';
const databasePath = join(dataDir, 'underleaf.sqlite3');
const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const staging = join(destinationRoot, `.${timestamp}.tmp`);
const destination = join(destinationRoot, timestamp);

await mkdir(destinationRoot, { recursive: true, mode: 0o700 });
await chmod(destinationRoot, 0o700);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true, mode: 0o700 });

let source;
try {
  source = new DatabaseSync(databasePath, { readOnly: true });
  await backup(source, join(staging, 'underleaf.sqlite3'));
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
} finally {
  source?.close();
}

await chmod(join(staging, 'underleaf.sqlite3'), 0o600);
const copied = new DatabaseSync(join(staging, 'underleaf.sqlite3'), { readOnly: true });
const integrity = copied.prepare('PRAGMA integrity_check').get()?.integrity_check;
copied.close();
await rm(join(staging, 'underleaf.sqlite3-wal'), { force: true });
await rm(join(staging, 'underleaf.sqlite3-shm'), { force: true });
if (integrity !== 'ok') {
  await rm(staging, { recursive: true, force: true });
  throw new Error(`Backup integrity check failed: ${String(integrity)}`);
}

const compileCache = join(dataDir, 'compile-cache');
if (await exists(compileCache)) await cp(compileCache, join(staging, 'compile-cache'), { recursive: true });
await writeFile(
  join(staging, 'manifest.json'),
  `${JSON.stringify({ createdAt: new Date().toISOString(), source: databasePath, integrity, secretsIncluded: false }, null, 2)}\n`,
  { mode: 0o600 }
);
await rename(staging, destination);

const snapshots = (await readdir(destinationRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
  .reverse();
for (const old of snapshots.slice(3)) await rm(join(destinationRoot, old), { recursive: true, force: true });

console.log(`UnderLeaf backup complete: ${destination}`);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function loadEnv(path) {
  try {
    const text = requireText(path);
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] != null) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch {
    // A .env file is optional.
  }
}

function requireText(path) {
  return readFileSync(path, 'utf8');
}
