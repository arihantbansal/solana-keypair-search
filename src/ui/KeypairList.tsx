import React, { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useAppStore, selectVisibleRows, reclaimableLamports } from "../state/store.ts";
import type { RowState } from "../state/types.ts";
import { formatBalanceCell, formatCountCell, formatSol, shortAddress } from "./format.ts";

/**
 * Multi-selectable list of discovered keypairs.
 *
 * OpenTUI's <select> is single-select only, so rows are rendered manually
 * inside a <scrollbox>. Cursor and selection are anchored to addresses (not
 * indices) so the visual cursor stays glued to the row it's on across
 * sort/visibility changes.
 *
 * The scrollbox is intentionally NOT focused — focusing it would steal arrow
 * keys for its own scrolling and conflict with the global cursor handler in
 * App.tsx. Instead, we drive scrolling via `scrollChildIntoView` whenever
 * the cursor moves to a new row, mirroring `Element.scrollIntoView({ block:
 * "nearest" })` from CSSOM.
 */
export function KeypairList(): React.ReactNode {
  const rows = useAppStore(selectVisibleRows);
  const cursorAddress = useAppStore((s) => s.cursorAddress);
  const selection = useAppStore((s) => s.selection);
  const focusRegion = useAppStore((s) => s.focusRegion);
  const sortKey = useAppStore((s) => s.sortKey);
  const sortDescending = useAppStore((s) => s.sortDescending);

  const scrollRef = useRef<ScrollBoxRenderable>(null);
  useEffect(() => {
    if (cursorAddress !== null) {
      scrollRef.current?.scrollChildIntoView(cursorAddress);
    }
  }, [cursorAddress]);

  const sortIndicator = sortDescending ? "↓" : "↑";
  const headerLabel = (key: string, label: string): string =>
    sortKey === key ? `${label}${sortIndicator}` : label;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border
      focusable
      focused={focusRegion === "list"}
      borderColor="#444444"
      focusedBorderColor="#5599ff"
      title=" keypairs "
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexDirection="row" height={1}>
        <text fg="#888888">{padCell("  addr      ", 13)}</text>
        <text fg="#888888">{padCell(headerLabel("mainnet", "mainnet"), 11)}</text>
        <text fg="#888888">{padCell(headerLabel("devnet", "devnet"), 10)}</text>
        <text fg="#888888">{padCell(headerLabel("testnet", "testnet"), 10)}</text>
        <text fg="#888888">{padCell(headerLabel("programs", "prog"), 6)}</text>
        <text fg="#888888">{padCell(headerLabel("buffers", "rent"), 8)}</text>
      </box>
      <box height={1}>
        <text fg="#444444">{"─".repeat(60)}</text>
      </box>
      {rows.length === 0 ? (
        <box paddingTop={1}>
          <text fg="#666666">no keypairs found yet…</text>
        </box>
      ) : (
        <scrollbox ref={scrollRef} flexGrow={1}>
          {rows.map((row) => (
            <Row
              key={row.address}
              row={row}
              isCursor={row.address === cursorAddress && focusRegion === "list"}
              isSelected={selection.has(row.address)}
            />
          ))}
        </scrollbox>
      )}
    </box>
  );
}

interface RowProps {
  readonly row: RowState;
  readonly isCursor: boolean;
  readonly isSelected: boolean;
}

/**
 * Memoized so the per-cell store mutations from the RPC pipeline only re-render
 * the *one* row whose data actually changed. The store builds a fresh row
 * object only for the address being mutated and threads existing references
 * through the rest of the map, so React.memo's shallow comparison correctly
 * skips every untouched row.
 */
const Row = React.memo(function Row({ row, isCursor, isSelected }: RowProps): React.ReactNode {
  const checkbox = isSelected ? "[x]" : "[ ]";
  const cursorMarker = isCursor ? "▸" : " ";
  const reclaimable = reclaimableLamports(row);
  const reclaimText = reclaimable === 0n ? "—" : formatSol(reclaimable);
  const fg = isCursor ? "#ffffff" : "#cccccc";
  const cursorBgProps = isCursor ? { backgroundColor: "#22334d" } : {};

  // The id is what `scrollChildIntoView(cursorAddress)` looks up.
  return (
    <box id={row.address} flexDirection="row" height={1} {...cursorBgProps}>
      <text fg={fg}>{cursorMarker} </text>
      <text fg={fg}>{checkbox} </text>
      <text fg={fg}>{padCell(shortAddress(row.address), 11)}</text>
      <text fg={fg}>{padCell(formatBalanceCell(row.balances.mainnet.state), 11)}</text>
      <text fg={fg}>{padCell(formatBalanceCell(row.balances.devnet.state), 10)}</text>
      <text fg={fg}>{padCell(formatBalanceCell(row.balances.testnet.state), 10)}</text>
      <text fg={fg}>{padCell(formatCountCell(row.programs), 6)}</text>
      <text fg={fg}>{padCell(reclaimText, 8)}</text>
    </box>
  );
});

function padCell(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - text.length);
}
