import { walk, type ScanCandidate, type WalkerProgress } from "./walker.ts";
import { parseKeypairFile, type ParsedKeypair } from "./parseKeypair.ts";

/**
 * Concurrency limit for the parse stage. Each parse is a small file read
 * plus an Ed25519 derive (roughly 1ms on commodity hardware). 32 in flight
 * keeps the event loop saturated without thrashing the FS or WebCrypto.
 */
const PARSE_CONCURRENCY = 32;

export interface ScanProgress extends WalkerProgress {
  readonly keypairsFound: number;
  readonly done: boolean;
}

export interface ScanCallbacks {
  readonly onKeypair: (kp: ParsedKeypair) => void;
  readonly onProgress: (p: ScanProgress) => void;
}

/**
 * Run a full scan: walk the roots, parse candidates in a bounded pool,
 * stream keypairs and progress updates to the caller.
 *
 * The walker's progress reflects filesystem traversal. We layer
 * `keypairsFound` on top so the UI can show "scanned X files, Y keypairs".
 */
export async function runScan(roots: readonly string[], callbacks: ScanCallbacks): Promise<void> {
  let walkerProgress: WalkerProgress = {
    dirsScanned: 0,
    filesSeen: 0,
    candidatesFound: 0,
  };
  let keypairsFound = 0;

  const emit = (done: boolean): void => {
    callbacks.onProgress({
      ...walkerProgress,
      keypairsFound,
      done,
    });
  };

  const inFlight = new Set<Promise<void>>();

  const launch = (candidate: ScanCandidate): void => {
    const task = (async (): Promise<void> => {
      const result = await parseKeypairFile(candidate.path);
      if (result !== null) {
        keypairsFound += 1;
        callbacks.onKeypair(result);
        emit(false);
      }
    })();
    const wrapped = task.finally(() => {
      inFlight.delete(wrapped);
    });
    inFlight.add(wrapped);
  };

  const walker = walk(roots, {
    onProgress: (p) => {
      walkerProgress = p;
      emit(false);
    },
  });

  for await (const candidate of walker) {
    if (inFlight.size >= PARSE_CONCURRENCY) {
      await Promise.race(inFlight);
    }
    launch(candidate);
  }

  while (inFlight.size > 0) {
    await Promise.race(inFlight);
  }

  emit(true);
}
