import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePaths } from '../paths.js';
import { readZipEntries, safeEntryPath } from './archive.js';

export const EXTENSION_FOLDER = 'aevra-extension';
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 60_000;

export function extensionZipUrl(version: string): string {
  return `https://github.com/the-long-ride/aevra-browser/releases/download/v${version}/aevra-browser-extension.zip`;
}

function tooLarge(): Error {
  return new Error('Downloaded archive is larger than aevra-browser will accept');
}

/**
 * Downloads the release archive with a hard size cap on both the declared
 * length and the bytes actually read, and a timeout so a stalled server cannot
 * hang the command.
 */
export async function downloadArchive(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<Buffer> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'No extension archive is published for this version'
        : `Download failed with HTTP ${response.status}`,
    );
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      // The length may have been absent, wrong or chunked: stop reading at the cap.
      if (size > MAX_ARCHIVE_BYTES) throw tooLarge();
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

export interface InstallOptions {
  version: string;
  /** Parent folder. Defaults to `<state>/extension`. */
  dir?: string;
  yes: boolean;
  download(url: string): Promise<Buffer>;
  defaultDir?: string;
  log?(message: string): void;
  error?(message: string): void;
  onInstalled?(parent: string): void;
  /** A same-or-newer copy was kept: record ownership without re-baselining its files. */
  onKept?(parent: string): void;
  /** Why installing into `parent` would fail, checked before anything is downloaded. */
  checkParent?(parent: string): string | null;
  /** True when the recorded copy at `parent` was changed since it was written. */
  modified?(parent: string): boolean;
  /** Runs the copy and the claim together (under the shared integration lock). */
  transaction?<T>(run: () => T): T;
}

function hasContents(directory: string): boolean {
  return existsSync(directory) && readdirSync(directory).length > 0;
}

/** The manifest version, or null when it is missing or not a dotted number. */
function manifestVersion(text: string | undefined): string | null {
  try {
    const version = (JSON.parse(text ?? '') as { version?: unknown }).version;
    return typeof version === 'string' && /^\d+(\.\d+)*$/.test(version) ? version : null;
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number),
    right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

function explain(destination: string, log: (message: string) => void): void {
  log('');
  log('Load it into your browser:');
  log('  1. Open chrome://extensions (edge://extensions on Edge)');
  log('  2. Turn on Developer mode');
  log(`  3. Select Load unpacked and choose ${destination}`);
  log('');
  // Chrome derives an unpacked extension's id from its folder path, and the
  // pairing is bound to that id, so moving the folder silently unpairs it.
  log('Keep that folder where it is - moving it changes the extension id');
  log('and the browser has to be paired again.');
  log('');
  log('Then run `aevra-browser pair` and enter the code in the extension popup.');
}

/**
 * Resolves every destination path before anything is deleted or written, so a
 * hostile archive is refused with the existing install untouched.
 */
export async function installExtension(options: InstallOptions): Promise<number> {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  try {
    const parent = path.resolve(options.dir ?? options.defaultDir ?? resolvePaths().extensionDir);
    const destination = path.join(parent, EXTENSION_FOLDER);
    const conflict = options.checkParent?.(parent);
    if (conflict) {
      error(conflict);
      return 1;
    }
    const occupied = hasContents(destination);
    const manifest = path.join(destination, 'manifest.json');
    const existing =
      occupied && existsSync(manifest) ? manifestVersion(readFileSync(manifest, 'utf8')) : null;
    if (occupied && !existing && !options.yes) {
      error(`${destination} already has files in it. Re-run with --yes to replace it.`);
      return 1;
    }

    const url = extensionZipUrl(options.version);
    log(`Downloading ${url}`);
    const entries = readZipEntries(await options.download(url));
    const planned = entries.map((entry) => {
      if (!entry.name.startsWith(`${EXTENSION_FOLDER}/`)) {
        throw Object.assign(
          new Error(`Archive entry is outside ${EXTENSION_FOLDER}/: ${entry.name}`),
          {
            code: 'EXTENSION_ARCHIVE_INVALID',
          },
        );
      }
      return { file: safeEntryPath(parent, entry.name), data: entry.data };
    });
    const incoming = manifestVersion(
      entries.find((entry) => entry.name === `${EXTENSION_FOLDER}/manifest.json`)?.data.toString(),
    );
    // The folder may be shared with root Aevra: never replace a same-or-newer copy with this one.
    const order = existing && incoming ? compareVersions(existing, incoming) : -1;
    // --yes may still repair a damaged copy of the same version.
    const repair = order === 0 && options.yes && (options.modified?.(parent) ?? false);
    if (order >= 0 && !repair) {
      log(`Keeping extension ${existing} in ${destination} (this release carries ${incoming}).`);
      (options.onKept ?? options.onInstalled)?.(parent);
      explain(destination, log);
      return 0;
    }
    if (occupied && !options.yes) {
      error(`${destination} has extension ${existing}. Re-run with --yes to upgrade it.`);
      return 1;
    }

    const copy = () => {
      if (occupied) {
        log(`Replacing ${destination}`);
        rmSync(destination, { recursive: true, force: true });
      }
      for (const item of planned) {
        mkdirSync(path.dirname(item.file), { recursive: true });
        writeFileSync(item.file, item.data);
      }
      options.onInstalled?.(parent);
    };
    if (options.transaction) options.transaction(copy);
    else copy();
    log(`Unzipped ${planned.length} files into ${destination}`);
    explain(destination, log);
    return 0;
  } catch (cause) {
    error(`extension install failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }
}
