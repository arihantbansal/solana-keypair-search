import { create } from "zustand/react";
import type { Address } from "@solana/kit";
import type { Cluster } from "../rpc/clients.ts";
import type { ProgramRecord, BufferRecord } from "../rpc/programs.ts";
import type {
  FocusRegion,
  LoadState,
  RowState,
  RpcStatusView,
  ScanProgressView,
  SortKey,
} from "./types.ts";

interface AppActions {
  readonly initRpcStatus: (status: RpcStatusView) => void;
  readonly addOrMergeKeypair: (address: Address, path: string) => void;
  readonly setScanProgress: (progress: ScanProgressView) => void;
  readonly setBalance: (address: Address, cluster: Cluster, next: LoadState<bigint>) => void;
  readonly markProgramKeypair: (address: Address) => void;
  readonly setPrograms: (address: Address, next: LoadState<readonly ProgramRecord[]>) => void;
  readonly setBuffers: (address: Address, next: LoadState<readonly BufferRecord[]>) => void;
  readonly toggleSelection: (address: Address) => void;
  readonly clearSelection: () => void;
  readonly setCursor: (cursor: number) => void;
  readonly setFocusRegion: (region: FocusRegion) => void;
  readonly setSort: (key: SortKey) => void;
  readonly setFilter: (text: string) => void;
  readonly setHelpVisible: (visible: boolean) => void;
}

export interface AppState {
  readonly rpc: RpcStatusView;
  readonly scan: ScanProgressView;
  readonly rows: ReadonlyMap<Address, RowState>;
  readonly selection: ReadonlySet<Address>;
  readonly cursor: number;
  readonly focusRegion: FocusRegion;
  readonly sortKey: SortKey;
  readonly sortDescending: boolean;
  readonly filter: string;
  readonly helpVisible: boolean;
  readonly actions: AppActions;
}

const INITIAL_SCAN: ScanProgressView = {
  dirsScanned: 0,
  filesSeen: 0,
  candidatesFound: 0,
  keypairsFound: 0,
  done: false,
};

const INITIAL_RPC: RpcStatusView = {
  canQueryPrograms: false,
  clustersEnabled: new Set<Cluster>(),
  mainnetEndpoint: "",
};

function emptyBalances(): RowState["balances"] {
  const pending: LoadState<bigint> = { status: "pending" };
  return {
    mainnet: { state: pending },
    devnet: { state: pending },
    testnet: { state: pending },
  };
}

export const useAppStore = create<AppState>((set) => ({
  rpc: INITIAL_RPC,
  scan: INITIAL_SCAN,
  rows: new Map(),
  selection: new Set(),
  cursor: 0,
  focusRegion: "list",
  sortKey: "buffers",
  sortDescending: true,
  filter: "",
  helpVisible: false,
  actions: {
    initRpcStatus: (status) => set({ rpc: status }),

    addOrMergeKeypair: (address, path) =>
      set((state) => {
        const next = new Map(state.rows);
        const existing = next.get(address);
        if (existing) {
          if (existing.paths.includes(path)) {
            return state;
          }
          next.set(address, {
            ...existing,
            paths: [...existing.paths, path],
          });
        } else {
          next.set(address, {
            address,
            paths: [path],
            isProgramKeypair: false,
            balances: emptyBalances(),
            programs: { status: "pending" },
            buffers: { status: "pending" },
          });
        }
        return { rows: next };
      }),

    setScanProgress: (progress) => set({ scan: progress }),

    setBalance: (address, cluster, next) =>
      set((state) => {
        const row = state.rows.get(address);
        if (!row) {
          return state;
        }
        const updated: RowState = {
          ...row,
          balances: {
            ...row.balances,
            [cluster]: { state: next },
          },
        };
        const rows = new Map(state.rows);
        rows.set(address, updated);
        return { rows };
      }),

    markProgramKeypair: (address) =>
      set((state) => {
        const row = state.rows.get(address);
        if (!row || row.isProgramKeypair) {
          return state;
        }
        const rows = new Map(state.rows);
        rows.set(address, { ...row, isProgramKeypair: true });
        return { rows };
      }),

    setPrograms: (address, next) =>
      set((state) => {
        const row = state.rows.get(address);
        if (!row) {
          return state;
        }
        const rows = new Map(state.rows);
        rows.set(address, { ...row, programs: next });
        return { rows };
      }),

    setBuffers: (address, next) =>
      set((state) => {
        const row = state.rows.get(address);
        if (!row) {
          return state;
        }
        const rows = new Map(state.rows);
        rows.set(address, { ...row, buffers: next });
        return { rows };
      }),

    toggleSelection: (address) =>
      set((state) => {
        const next = new Set(state.selection);
        if (next.has(address)) {
          next.delete(address);
        } else {
          next.add(address);
        }
        return { selection: next };
      }),

    clearSelection: () => set({ selection: new Set() }),

    setCursor: (cursor) => set({ cursor }),

    setFocusRegion: (region) => set({ focusRegion: region }),

    setSort: (key) =>
      set((state) =>
        state.sortKey === key
          ? { sortDescending: !state.sortDescending }
          : { sortKey: key, sortDescending: true },
      ),

    setFilter: (text) => set({ filter: text }),

    setHelpVisible: (visible) => set({ helpVisible: visible }),
  },
}));

/** Selectors — computed views over the store, memoized at the call site. */

export function selectVisibleRows(state: AppState): readonly RowState[] {
  const all = Array.from(state.rows.values()).filter((r) => !r.isProgramKeypair);

  const filtered = state.filter
    ? all.filter((r) => r.address.toLowerCase().includes(state.filter.toLowerCase()))
    : all;

  const sorted = [...filtered].toSorted((a, b) => compareRows(a, b, state.sortKey));
  if (state.sortDescending) {
    sorted.reverse();
  }
  return sorted;
}

function compareRows(a: RowState, b: RowState, key: SortKey): number {
  switch (key) {
    case "address":
      return a.address.localeCompare(b.address);
    case "mainnet":
      return compareLoadedBigint(a.balances.mainnet.state, b.balances.mainnet.state);
    case "devnet":
      return compareLoadedBigint(a.balances.devnet.state, b.balances.devnet.state);
    case "testnet":
      return compareLoadedBigint(a.balances.testnet.state, b.balances.testnet.state);
    case "programs":
      return countOf(a.programs) - countOf(b.programs);
    case "buffers":
      return reclaimableLamports(a) - reclaimableLamports(b) > 0n ? 1 : -1;
  }
}

function compareLoadedBigint(a: LoadState<bigint>, b: LoadState<bigint>): number {
  const av = a.status === "loaded" ? a.value : 0n;
  const bv = b.status === "loaded" ? b.value : 0n;
  if (av === bv) return 0;
  return av < bv ? -1 : 1;
}

function countOf<T>(state: LoadState<readonly T[]>): number {
  return state.status === "loaded" ? state.value.length : 0;
}

export function reclaimableLamports(row: RowState): bigint {
  let total = 0n;
  if (row.programs.status === "loaded") {
    for (const p of row.programs.value) {
      total += p.lamports;
    }
  }
  if (row.buffers.status === "loaded") {
    for (const b of row.buffers.value) {
      total += b.lamports;
    }
  }
  return total;
}
