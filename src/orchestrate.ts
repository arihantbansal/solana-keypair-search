import type { Address } from "@solana/kit";
import type { ParsedKeypair } from "./scan/parseKeypair.ts";
import { runScan } from "./scan/runScan.ts";
import type { Cluster, RpcClients } from "./rpc/clients.ts";
import { fetchAccountSnapshots } from "./rpc/balances.ts";
import { fetchBuffersByAuthority, fetchProgramsByAuthority } from "./rpc/programs.ts";
import { PROGRAM_OWNERS } from "./rpc/constants.ts";
import { useAppStore } from "./state/store.ts";

/** Max addresses processed per RPC fan-out batch. */
const FLUSH_BATCH_SIZE = 50;
/** Concurrent program/buffer queries (each is a separate getProgramAccounts). */
const PROGRAM_QUERY_CONCURRENCY = 4;

/**
 * Orchestrate the scan → balances → programs/buffers pipeline.
 *
 * Concurrency model: a single `flushInFlight` promise serializes all flush
 * operations. New keypairs accumulate in `pendingAddresses` while a flush is
 * running, and the next flush picks them up after the current one finishes.
 * This eliminates the timer + eager-flush race in the original implementation
 * and provides natural backpressure: scan throughput auto-limits to RPC speed.
 */
export async function runPipeline(opts: {
  readonly roots: readonly string[];
  readonly clients: RpcClients;
  readonly clustersEnabled: ReadonlySet<Cluster>;
  readonly canQueryPrograms: boolean;
}): Promise<void> {
  const { actions } = useAppStore.getState();

  const pendingAddresses: Address[] = [];
  const seenAddresses = new Set<Address>();
  let flushInFlight: Promise<void> | null = null;

  const flushOnce = async (): Promise<void> => {
    if (pendingAddresses.length === 0) {
      return;
    }
    const batch = pendingAddresses.splice(0, FLUSH_BATCH_SIZE);
    await Promise.all(
      [...opts.clustersEnabled].map((cluster) =>
        fetchClusterBalances(opts.clients, cluster, batch),
      ),
    );
    if (opts.canQueryPrograms) {
      await fetchProgramsForBatch(opts.clients, batch);
    }
  };

  const triggerFlush = (): void => {
    if (flushInFlight !== null) {
      return;
    }
    flushInFlight = (async (): Promise<void> => {
      // Drain in a loop so a flush that completes while new addresses
      // arrived during it picks them up immediately.
      while (pendingAddresses.length > 0) {
        await flushOnce();
      }
    })().finally(() => {
      flushInFlight = null;
    });
  };

  const onKeypair = (kp: ParsedKeypair): void => {
    actions.addOrMergeKeypair(kp.address, kp.path);
    if (seenAddresses.has(kp.address)) {
      return;
    }
    seenAddresses.add(kp.address);
    pendingAddresses.push(kp.address);
    triggerFlush();
  };

  await runScan(opts.roots, {
    onKeypair,
    onProgress: (p) => actions.setScanProgress(p),
  });

  // Every keypair that arrived during the scan already called `triggerFlush`.
  // If a flush is still in flight, its drain loop will pick up everything
  // that's still pending. We just need to wait for it to finish.
  if (flushInFlight !== null) {
    await flushInFlight;
  }

  // Mark anything the user opted out of as skipped so the UI shows "—".
  const allClusters: readonly Cluster[] = ["mainnet", "devnet", "testnet"];
  for (const cluster of allClusters) {
    if (opts.clustersEnabled.has(cluster)) {
      continue;
    }
    for (const addr of seenAddresses) {
      actions.setBalance(addr, cluster, {
        status: "skipped",
        reason: `${cluster} disabled`,
      });
    }
  }
  if (!opts.canQueryPrograms) {
    for (const addr of seenAddresses) {
      actions.setPrograms(addr, {
        status: "skipped",
        reason: "set HELIUS_API_KEY to enable",
      });
      actions.setBuffers(addr, {
        status: "skipped",
        reason: "set HELIUS_API_KEY to enable",
      });
    }
  }
}

async function fetchClusterBalances(
  clients: RpcClients,
  cluster: Cluster,
  addresses: readonly Address[],
): Promise<void> {
  const { actions } = useAppStore.getState();
  const rpc = clients[cluster];
  try {
    const snapshots = await fetchAccountSnapshots(rpc, addresses);
    for (const addr of addresses) {
      const snap = snapshots.get(addr);
      if (!snap) {
        continue;
      }
      actions.setBalance(addr, cluster, {
        status: "loaded",
        value: snap.lamports,
      });
      // Mainnet snapshot also tells us if this is a program keypair.
      if (cluster === "mainnet" && PROGRAM_OWNERS.has(snap.owner)) {
        actions.markProgramKeypair(addr);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "rpc error";
    for (const addr of addresses) {
      actions.setBalance(addr, cluster, { status: "error", message });
    }
  }
}

async function fetchProgramsForBatch(
  clients: RpcClients,
  addresses: readonly Address[],
): Promise<void> {
  const { actions } = useAppStore.getState();
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (cursor < addresses.length) {
      const i = cursor++;
      const addr = addresses[i];
      if (!addr) {
        continue;
      }
      try {
        const programs = await fetchProgramsByAuthority(clients.mainnet, addr);
        actions.setPrograms(addr, { status: "loaded", value: programs });
      } catch (err) {
        const message = err instanceof Error ? err.message : "rpc error";
        actions.setPrograms(addr, { status: "error", message });
      }
      try {
        const buffers = await fetchBuffersByAuthority(clients.mainnet, addr);
        actions.setBuffers(addr, { status: "loaded", value: buffers });
      } catch (err) {
        const message = err instanceof Error ? err.message : "rpc error";
        actions.setBuffers(addr, { status: "error", message });
      }
    }
  };
  await Promise.all(Array.from({ length: PROGRAM_QUERY_CONCURRENCY }, () => next()));
}
