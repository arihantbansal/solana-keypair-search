import type { Address } from "@solana/kit";
import type { ParsedKeypair } from "./scan/parseKeypair.ts";
import { runScan } from "./scan/runScan.ts";
import type { Cluster, RpcClients } from "./rpc/clients.ts";
import { fetchAccountSnapshots } from "./rpc/balances.ts";
import { fetchBuffersByAuthority, fetchProgramsByAuthority } from "./rpc/programs.ts";
import { PROGRAM_OWNERS } from "./rpc/constants.ts";
import { useAppStore } from "./state/store.ts";

/**
 * Orchestrate the full pipeline: scan → balances → programs/buffers.
 * Each phase streams its results into the store as they arrive.
 */
export async function runPipeline(opts: {
  readonly roots: readonly string[];
  readonly clients: RpcClients;
  readonly clustersEnabled: ReadonlySet<Cluster>;
  readonly canQueryPrograms: boolean;
}): Promise<void> {
  const { actions } = useAppStore.getState();

  // Phase 1 — scan filesystem; queue addresses for balance fetch.
  const pendingAddresses: Address[] = [];
  const seenAddresses = new Set<Address>();

  const flushBalances = async (): Promise<void> => {
    if (pendingAddresses.length === 0) {
      return;
    }
    const batch = pendingAddresses.splice(0, pendingAddresses.length);
    await Promise.all(
      [...opts.clustersEnabled].map((cluster) =>
        fetchClusterBalances(opts.clients, cluster, batch),
      ),
    );
    // After mainnet balance lands, kick off programs/buffers for the same batch.
    if (opts.canQueryPrograms) {
      await fetchProgramsForBatch(opts.clients, batch);
    }
  };

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleFlush = (): void => {
    if (flushTimer !== null) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushBalances();
    }, 250);
  };

  const onKeypair = (kp: ParsedKeypair): void => {
    actions.addOrMergeKeypair(kp.address, kp.path);
    if (!seenAddresses.has(kp.address)) {
      seenAddresses.add(kp.address);
      pendingAddresses.push(kp.address);
      if (pendingAddresses.length >= 50) {
        void flushBalances();
      } else {
        scheduleFlush();
      }
    }
  };

  await runScan(opts.roots, {
    onKeypair,
    onProgress: (p) => actions.setScanProgress(p),
  });

  // Final flush to drain whatever's left.
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushBalances();

  // Mark any clusters the user didn't enable as skipped, so the UI shows "—".
  const allClusters: Cluster[] = ["mainnet", "devnet", "testnet"];
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
  // Programs/buffers query is per-address (memcmp on authority); fan out
  // with a small concurrency cap so we don't blow through the RPC budget.
  const CONCURRENCY = 4;
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
  await Promise.all(Array.from({ length: CONCURRENCY }, () => next()));
}
