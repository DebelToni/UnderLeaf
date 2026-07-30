import { Unzip, UnzipInflate } from 'fflate';
import { HttpError } from './errors.js';

export interface SafeZipLimits {
  maxFiles: number;
  maxUnpackedBytes: number;
}

export function safeUnzip(bytes: Uint8Array, limits: SafeZipLimits): Record<string, Uint8Array> {
  const output: Record<string, Uint8Array> = {};
  const active = new Set<{ terminate(): void }>();
  let fileCount = 0;
  let total = 0;
  let failure: Error | null = null;

  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    for (const file of active) file.terminate();
  };

  const archive = new Unzip((file) => {
    if (failure) {
      file.terminate();
      return;
    }
    const isDirectory = file.name.endsWith('/');
    if (!isDirectory) {
      fileCount += 1;
      if (fileCount > limits.maxFiles) {
        fail(new HttpError(413, 'The archive contains too many files', 'archive_too_large'));
        return;
      }
      if (file.originalSize != null && total + file.originalSize > limits.maxUnpackedBytes) {
        fail(new HttpError(413, 'The unpacked archive is too large', 'archive_too_large'));
        return;
      }
    }

    const chunks: Uint8Array[] = [];
    active.add(file);
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        fail(new HttpError(400, 'The ZIP archive could not be decompressed', 'invalid_archive'));
        return;
      }
      if (!isDirectory) {
        total += chunk.byteLength;
        if (total > limits.maxUnpackedBytes) {
          fail(new HttpError(413, 'The unpacked archive is too large', 'archive_too_large'));
          return;
        }
        chunks.push(chunk);
      }
      if (final) {
        active.delete(file);
        if (!isDirectory) output[file.name] = concat(chunks);
      }
    };
    try {
      file.start();
    } catch {
      fail(new HttpError(400, 'The ZIP archive uses an unsupported compression method', 'invalid_archive'));
    }
  });
  archive.register(UnzipInflate);

  try {
    archive.push(bytes, true);
  } catch {
    if (!failure) failure = new HttpError(400, 'The uploaded file is not a valid ZIP archive', 'invalid_archive');
  }
  if (failure) throw failure;
  if (active.size) throw new HttpError(400, 'The ZIP archive ended unexpectedly', 'invalid_archive');
  return output;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
