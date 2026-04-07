import { create } from "zustand/react";
import { lamports } from "@solana/kit";
import type { Address, Lamports } from "@solana/kit";
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
  readonly setBalance: (address: Address, cluster: Cluster, next: LoadState<Lamports>) => void;
  readonly markProgramKeypair: (address: Address) => void;
  readonly setPrograms: (address: Address, next: LoadState<readonly ProgramRecord[]>) => void;
  readonly setBuffers: (address: Address, next: LoadState<readonly BufferRecord[]>) => void;
  readonly toggleSelection: (address: Address) => void;
  readonly moveCursor: (delta: number) => void;
  readonly setCursorToAddress: (address: Address) => void;
  readonly setFocusRegion: (region: FocusRegion) => void;
  readonly setSort: (key: SortKey) => void;
}

export interface AppState {
  readonly rpc: RpcStatusView;
  readonly scan: ScanProgressView;
  readonly rows: ReadonlyMap<Address, RowState>;
  readonly selection: ReadonlySet<Address>;
  /**
   * Identity-based cursor. Anchored to a specific keypair so the cursor
   * never points at "row N" of a stale list — when sort or visibility
   * changes, we either keep the same row focused or fall back to the first
   * visible row. Eliminates a whole class of off-by-one bugs.
   */
  readonly cursorAddress: Address | null;
  readonly focusRegion: FocusRegion;
  readonly sortKey: SortKey;
  readonly sortDescending: boolean;
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
  const pending: LoadState<Lamports> = { status: "pending" };
  return {
    mainnet: { state: pending },
    devnet: { state: pending },
    testnet: { state: pending },
  };
}

/**
 * After mutating something that affects the visible row set (rows, sort,
 * hide), reconcile the cursor: keep it where it is if still visible,
 * otherwise snap to the first visible row. Calls `selectVisibleRows` (not
 * `computeVisibleRows`) so the memoization cache is warmed for the render
 * that follows this mutation.
 */
function reconcileCursor(state: AppState): Address | null {
  const visible = selectVisibleRows(state);
  if (visible.length === 0) {
    return null;
  }
  if (state.cursorAddress !== null && visible.some((r) => r.address === state.cursorAddress)) {
    return state.cursorAddress;
  }
  return visible[0]?.address ?? null;
}

export const useAppStore = create<AppState>((set) => ({
  rpc: INITIAL_RPC,
  scan: INITIAL_SCAN,
  rows: new Map(),
  selection: new Set(),
  cursorAddress: null,
  focusRegion: "list",
  sortKey: "buffers",
  sortDescending: true,
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
        // Adding a row never invalidates an existing cursor — that row is
        // still in the map. The only case worth reconciling is when the cursor
        // is unset, where we want to anchor it to the first visible row.
        // Reconciling on every add would be O(N²) on a scan that finds many
        // keypairs, since each call sorts the (growing) visible list.
        if (state.cursorAddress !== null) {
          return { rows: next };
        }
        const cursorAddress = reconcileCursor({ ...state, rows: next });
        return { rows: next, cursorAddress };
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
        const cursorAddress = reconcileCursor({ ...state, rows });
        return { rows, cursorAddress };
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

    moveCursor: (delta) =>
      set((state) => {
        const visible = selectVisibleRows(state);
        if (visible.length === 0) {
          return state;
        }
        const currentIdx =
          state.cursorAddress === null
            ? 0
            : visible.findIndex((r) => r.address === state.cursorAddress);
        const startIdx = currentIdx === -1 ? 0 : currentIdx;
        const nextIdx = Math.max(0, Math.min(visible.length - 1, startIdx + delta));
        const nextAddress = visible[nextIdx]?.address ?? null;
        if (nextAddress === state.cursorAddress) {
          return state;
        }
        return { cursorAddress: nextAddress };
      }),

    setCursorToAddress: (address) => set({ cursorAddress: address }),

    setFocusRegion: (region) => set({ focusRegion: region }),

    setSort: (key) =>
      set((state) => {
        const sortKey = key;
        const sortDescending = state.sortKey === key ? !state.sortDescending : true;
        const updated = { ...state, sortKey, sortDescending };
        return { sortKey, sortDescending, cursorAddress: reconcileCursor(updated) };
      }),
  },
}));

/** ─── Selectors ──────────────────────────────────────────────────────────
 *
 * `selectVisibleRows` is closure-memoized so multiple subscribers receive
 * the SAME array reference until the inputs change. Without this, every
 * call returns a fresh array → zustand's Object.is equality always sees
 * inequality → every subscriber re-renders on every store mutation.
 *
 * The cache key is the conjunction of every state slice that affects the
 * result. When any of them changes, we recompute and cache the new array.
 */

interface SelectVisibleCache {
  readonly rows: ReadonlyMap<Address, RowState>;
  readonly sortKey: SortKey;
  readonly sortDescending: boolean;
  readonly result: readonly RowState[];
}

let visibleCache: SelectVisibleCache | null = null;

function computeVisibleRows(state: AppState): readonly RowState[] {
  const all = Array.from(state.rows.values()).filter((r) => !r.isProgramKeypair);
  const sorted = all.toSorted((a, b) => compareRows(a, b, state.sortKey));
  if (state.sortDescending) {
    sorted.reverse();
  }
  return sorted;
}

export function selectVisibleRows(state: AppState): readonly RowState[] {
  if (
    visibleCache !== null &&
    visibleCache.rows === state.rows &&
    visibleCache.sortKey === state.sortKey &&
    visibleCache.sortDescending === state.sortDescending
  ) {
    return visibleCache.result;
  }
  const result = computeVisibleRows(state);
  visibleCache = {
    rows: state.rows,
    sortKey: state.sortKey,
    sortDescending: state.sortDescending,
    result,
  };
  return result;
}

export function selectCursorRow(state: AppState): RowState | null {
  if (state.cursorAddress === null) {
    return null;
  }
  return state.rows.get(state.cursorAddress) ?? null;
}

function compareRows(a: RowState, b: RowState, key: SortKey): number {
  switch (key) {
    case "address":
      return a.address.localeCompare(b.address);
    case "mainnet":
      return compareLoadedLamports(a.balances.mainnet.state, b.balances.mainnet.state);
    case "devnet":
      return compareLoadedLamports(a.balances.devnet.state, b.balances.devnet.state);
    case "testnet":
      return compareLoadedLamports(a.balances.testnet.state, b.balances.testnet.state);
    case "programs":
      return countOf(a.programs) - countOf(b.programs);
    case "buffers": {
      // Use sign comparison over subtraction so the Lamports brand is
      // preserved on the operands — consistent with compareLoadedLamports.
      const la = reclaimableLamports(a);
      const lb = reclaimableLamports(b);
      if (la === lb) return 0;
      return la < lb ? -1 : 1;
    }
  }
}

function compareLoadedLamports(a: LoadState<Lamports>, b: LoadState<Lamports>): number {
  const av = a.status === "loaded" ? a.value : lamports(0n);
  const bv = b.status === "loaded" ? b.value : lamports(0n);
  if (av === bv) return 0;
  return av < bv ? -1 : 1;
}

function countOf<T>(state: LoadState<readonly T[]>): number {
  return state.status === "loaded" ? state.value.length : 0;
}

export function reclaimableLamports(row: RowState): Lamports {
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
  return lamports(total);
}
