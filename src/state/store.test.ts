import { beforeEach, describe, expect, test } from "bun:test";
import { address, lamports } from "@solana/kit";
import type { Address } from "@solana/kit";
import { selectVisibleRows, useAppStore } from "./store.ts";

// Three real, distinct base58 program IDs with valid 32-byte decodes.
// Picked and named so they sort in alphabetical order under the test's
// "address ASC" sort: '1' (0x31) < 'A' (0x41) < 'T' (0x54).
const A: Address = address("11111111111111111111111111111111");
const B: Address = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const C: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const INITIAL_STATE = useAppStore.getState();

beforeEach(() => {
  // Reset the singleton store. Sort by address ASC so the visible row order
  // is fully deterministic regardless of insertion order: [A, B, C].
  useAppStore.setState({
    rpc: INITIAL_STATE.rpc,
    scan: INITIAL_STATE.scan,
    rows: new Map(),
    selection: new Set(),
    cursorAddress: null,
    focusRegion: "list",
    sortKey: "address",
    sortDescending: false,
  });
});

describe("addOrMergeKeypair", () => {
  test("inserts a new row with all-pending state", () => {
    useAppStore.getState().actions.addOrMergeKeypair(A, "/path/a.json");
    const row = useAppStore.getState().rows.get(A);
    expect(row).toBeDefined();
    expect(row?.address).toBe(A);
    expect(row?.paths).toEqual(["/path/a.json"]);
    expect(row?.isProgramKeypair).toBe(false);
    expect(row?.balances.mainnet.state.status).toBe("pending");
    expect(row?.programs.status).toBe("pending");
    expect(row?.buffers.status).toBe("pending");
  });

  test("merging a duplicate path is a no-op (same state reference)", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/path/a.json");
    const before = useAppStore.getState().rows;
    actions.addOrMergeKeypair(A, "/path/a.json");
    const after = useAppStore.getState().rows;
    expect(after).toBe(before);
  });

  test("merging a new path appends to the existing row's paths array", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/path/a.json");
    actions.addOrMergeKeypair(A, "/path/a-also.json");
    expect(useAppStore.getState().rows.get(A)?.paths).toEqual([
      "/path/a.json",
      "/path/a-also.json",
    ]);
  });

  test("first add anchors the cursor to the first visible row", () => {
    useAppStore.getState().actions.addOrMergeKeypair(A, "/p");
    expect(useAppStore.getState().cursorAddress).toBe(A);
  });

  test("subsequent adds preserve the existing cursor (no reconcile)", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.addOrMergeKeypair(B, "/q");
    actions.addOrMergeKeypair(C, "/r");
    // Cursor was set to A on the first add and never moved by later adds.
    expect(useAppStore.getState().cursorAddress).toBe(A);
  });
});

describe("markProgramKeypair", () => {
  test("hides the row from selectVisibleRows and snaps cursor", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.addOrMergeKeypair(B, "/q");
    expect(selectVisibleRows(useAppStore.getState())).toHaveLength(2);

    // Move cursor onto A, then mark A as a program keypair → cursor must move.
    useAppStore.setState({ cursorAddress: A });
    actions.markProgramKeypair(A);

    const state = useAppStore.getState();
    expect(selectVisibleRows(state)).toHaveLength(1);
    expect(selectVisibleRows(state)[0]?.address).toBe(B);
    expect(state.cursorAddress).toBe(B);
  });

  test("is a no-op if the row is already marked", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.markProgramKeypair(A);
    const before = useAppStore.getState().rows;
    actions.markProgramKeypair(A);
    expect(useAppStore.getState().rows).toBe(before);
  });
});

describe("selectVisibleRows memoization", () => {
  test("returns the same reference for back-to-back calls on identical state", () => {
    useAppStore.getState().actions.addOrMergeKeypair(A, "/p");
    const state = useAppStore.getState();
    const a = selectVisibleRows(state);
    const b = selectVisibleRows(state);
    expect(a).toBe(b);
  });

  test("returns a new reference after a row is added", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    const before = selectVisibleRows(useAppStore.getState());
    actions.addOrMergeKeypair(B, "/q");
    const after = selectVisibleRows(useAppStore.getState());
    expect(after).not.toBe(before);
  });

  test("returns a new reference after sort flips", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    const before = selectVisibleRows(useAppStore.getState());
    actions.setSort("address");
    const after = selectVisibleRows(useAppStore.getState());
    expect(after).not.toBe(before);
  });

  test("excludes rows marked as program keypairs", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.addOrMergeKeypair(B, "/q");
    actions.markProgramKeypair(A);
    const visible = selectVisibleRows(useAppStore.getState());
    expect(visible.map((r) => r.address)).toEqual([B]);
  });
});

describe("setBalance", () => {
  test("updates the targeted cluster cell only", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.setBalance(A, "mainnet", { status: "loaded", value: lamports(1_000_000_000n) });
    const row = useAppStore.getState().rows.get(A);
    expect(row?.balances.mainnet.state.status).toBe("loaded");
    expect(row?.balances.devnet.state.status).toBe("pending");
    expect(row?.balances.testnet.state.status).toBe("pending");
  });

  test("is a no-op for an unknown address", () => {
    const before = useAppStore.getState();
    useAppStore
      .getState()
      .actions.setBalance(A, "mainnet", { status: "loaded", value: lamports(1n) });
    expect(useAppStore.getState()).toBe(before);
  });
});

describe("moveCursor", () => {
  test("moves to the next visible row", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.addOrMergeKeypair(B, "/q");
    // Default sort is `buffers desc`; with no programs/buffers loaded, both
    // reclaimable totals are 0, so the order is the insertion order. The first
    // visible row is A.
    expect(useAppStore.getState().cursorAddress).toBe(A);
    actions.moveCursor(1);
    expect(useAppStore.getState().cursorAddress).toBe(B);
  });

  test("clamps at the bottom edge", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.addOrMergeKeypair(B, "/q");
    actions.moveCursor(1);
    actions.moveCursor(1);
    actions.moveCursor(1);
    expect(useAppStore.getState().cursorAddress).toBe(B);
  });

  test("clamps at the top edge", () => {
    const { actions } = useAppStore.getState();
    actions.addOrMergeKeypair(A, "/p");
    actions.addOrMergeKeypair(B, "/q");
    actions.moveCursor(1);
    actions.moveCursor(-5);
    expect(useAppStore.getState().cursorAddress).toBe(A);
  });

  test("is a no-op when no rows are visible", () => {
    const before = useAppStore.getState();
    useAppStore.getState().actions.moveCursor(1);
    expect(useAppStore.getState()).toBe(before);
  });
});

describe("setSort", () => {
  test("first call with a new key uses descending", () => {
    useAppStore.getState().actions.setSort("address");
    expect(useAppStore.getState().sortKey).toBe("address");
    expect(useAppStore.getState().sortDescending).toBe(true);
  });

  test("repeating the same key flips ascending/descending", () => {
    const { actions } = useAppStore.getState();
    actions.setSort("address");
    actions.setSort("address");
    expect(useAppStore.getState().sortDescending).toBe(false);
    actions.setSort("address");
    expect(useAppStore.getState().sortDescending).toBe(true);
  });

  test("switching to a different key resets to descending", () => {
    const { actions } = useAppStore.getState();
    actions.setSort("address");
    actions.setSort("address"); // toggle to asc
    actions.setSort("mainnet"); // new key
    expect(useAppStore.getState().sortDescending).toBe(true);
  });
});

describe("toggleSelection", () => {
  test("toggles an address in and out of the selection set", () => {
    const { actions } = useAppStore.getState();
    actions.toggleSelection(A);
    expect(useAppStore.getState().selection.has(A)).toBe(true);
    actions.toggleSelection(A);
    expect(useAppStore.getState().selection.has(A)).toBe(false);
  });
});

describe("clearSelection", () => {
  test("empties a populated selection", () => {
    const { actions } = useAppStore.getState();
    actions.toggleSelection(A);
    actions.toggleSelection(B);
    expect(useAppStore.getState().selection.size).toBe(2);
    actions.clearSelection();
    expect(useAppStore.getState().selection.size).toBe(0);
  });

  test("is a no-op (same state reference) on an already-empty selection", () => {
    const before = useAppStore.getState();
    useAppStore.getState().actions.clearSelection();
    expect(useAppStore.getState()).toBe(before);
  });
});
