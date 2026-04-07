import { opendir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Filesystem walker for keypair candidates.
 *
 * Strategy (cheapest gate first):
 *   1. Prune ignored directories before recursing (never even readdir them).
 *   2. Skip files with extensions that cannot be a keypair JSON.
 *   3. Stat survivors and gate on size (a 64-element u8 JSON array fits in ~130-260 bytes).
 *   4. Yield candidates upstream for parsing.
 */

/** Directories we never descend into. */
const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "target",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vite",
  ".cargo",
  ".rustup",
  ".npm",
  ".pnpm-store",
  ".yarn",
  "Library",
  ".Trash",
  ".local",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
]);

/** File extensions that cannot possibly hold a Solana keypair JSON. */
const SKIP_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".go",
  ".rs",
  ".py",
  ".rb",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".m",
  ".mm",
  ".sh",
  ".zsh",
  ".bash",
  ".md",
  ".mdx",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".txt",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".csv",
  ".tsv",
  ".env",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".bmp",
  ".tiff",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".dmg",
  ".iso",
  ".pdf",
  ".so",
  ".dylib",
  ".wasm",
  ".a",
  ".o",
  ".bin",
  ".exe",
  ".dll",
  ".lock",
  ".log",
  ".map",
  ".min.js",
]);

/**
 * A Solana keypair JSON is `[n, n, ..., n]` of 64 unsigned bytes.
 * Smallest realistic encoding (all zeros): `[0,0,...,0]` = 129 bytes.
 * Largest realistic encoding (all 255s): `[255,255,...,255]` = 321 bytes.
 * Allow some slack for whitespace and line breaks.
 */
const MIN_KEYPAIR_BYTES = 100;
const MAX_KEYPAIR_BYTES = 600;

export interface ScanCandidate {
  readonly path: string;
  readonly size: number;
}

export interface WalkerProgress {
  readonly dirsScanned: number;
  readonly filesSeen: number;
  readonly candidatesFound: number;
}

export interface WalkOptions {
  readonly onProgress?: (progress: WalkerProgress) => void;
  /** How often (in files seen) to emit progress. */
  readonly progressInterval?: number;
}

function fastSkipByExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return false;
  }
  const ext = name.slice(dot).toLowerCase();
  return SKIP_EXTENSIONS.has(ext);
}

/**
 * Walk one or more root directories, yielding keypair candidates.
 * Roots are deduplicated by realpath. Symlink loops are prevented.
 */
export async function* walk(
  roots: readonly string[],
  options: WalkOptions = {},
): AsyncGenerator<ScanCandidate, void, void> {
  const visited = new Set<string>();
  const progress: { dirsScanned: number; filesSeen: number; candidatesFound: number } = {
    dirsScanned: 0,
    filesSeen: 0,
    candidatesFound: 0,
  };
  const interval = options.progressInterval ?? 250;
  const emit = (): void => {
    if (options.onProgress) {
      options.onProgress({ ...progress });
    }
  };

  for (const root of roots) {
    let canonical: string;
    try {
      canonical = await realpath(root);
    } catch {
      continue;
    }
    if (visited.has(canonical)) {
      continue;
    }
    yield* walkDir(canonical, visited, progress, interval, emit);
  }
  emit();
}

async function* walkDir(
  dir: string,
  visited: Set<string>,
  progress: { dirsScanned: number; filesSeen: number; candidatesFound: number },
  interval: number,
  emit: () => void,
): AsyncGenerator<ScanCandidate, void, void> {
  if (visited.has(dir)) {
    return;
  }
  visited.add(dir);
  progress.dirsScanned += 1;

  let handle: Awaited<ReturnType<typeof opendir>>;
  try {
    handle = await opendir(dir);
  } catch {
    return;
  }

  try {
    for await (const entry of handle) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        const childPath = join(dir, entry.name);
        let canonicalChild: string;
        try {
          canonicalChild = await realpath(childPath);
        } catch {
          continue;
        }
        yield* walkDir(canonicalChild, visited, progress, interval, emit);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      progress.filesSeen += 1;
      if (progress.filesSeen % interval === 0) {
        emit();
      }

      if (fastSkipByExtension(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      let size: number;
      try {
        const s = await stat(fullPath);
        size = s.size;
      } catch {
        continue;
      }

      if (size < MIN_KEYPAIR_BYTES || size > MAX_KEYPAIR_BYTES) {
        continue;
      }

      progress.candidatesFound += 1;
      yield { path: fullPath, size };
    }
  } catch {
    // readdir iteration errors (perms, etc.) — skip the rest of this dir.
  }
}
