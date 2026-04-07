import React from "react";
import { useAppStore, selectVisibleRows, reclaimableLamports } from "../state/store.ts";
import type { RowState } from "../state/types.ts";
import { formatBalanceCell, formatCountCell, formatSol, shortAddress } from "./format.ts";

interface KeypairListProps {
  readonly height: number;
}

/**
 * Multi-selectable list of discovered keypairs.
 *
 * OpenTUI's <select> is single-select only, so we render rows manually and
 * drive cursor + selection from the store. A small "window around cursor"
 * computation handles vertical scrolling without needing a scrollbox.
 */
export function KeypairList({ height }: KeypairListProps): React.ReactNode {
  const rows = useAppStore(selectVisibleRows);
  const cursor = useAppStore((s) => s.cursor);
  const selection = useAppStore((s) => s.selection);
  const focusRegion = useAppStore((s) => s.focusRegion);
  const sortKey = useAppStore((s) => s.sortKey);
  const sortDescending = useAppStore((s) => s.sortDescending);

  // Header (1 row) + separator (1 row) consume from the available height.
  const visibleRowCount = Math.max(1, height - 2);
  const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));
  const start = Math.max(
    0,
    Math.min(rows.length - visibleRowCount, safeCursor - Math.floor(visibleRowCount / 2)),
  );
  const visibleRows = rows.slice(start, start + visibleRowCount);

  const sortIndicator = sortDescending ? "↓" : "↑";
  const headerLabel = (key: string, label: string): string =>
    sortKey === key ? `${label}${sortIndicator}` : label;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={true}
      borderColor={focusRegion === "list" ? "#5599ff" : "#444444"}
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
        visibleRows.map((row, i) => (
          <Row
            key={row.address}
            row={row}
            isCursor={start + i === safeCursor && focusRegion === "list"}
            isSelected={selection.has(row.address)}
          />
        ))
      )}
    </box>
  );
}

interface RowProps {
  readonly row: RowState;
  readonly isCursor: boolean;
  readonly isSelected: boolean;
}

function Row({ row, isCursor, isSelected }: RowProps): React.ReactNode {
  const checkbox = isSelected ? "[x]" : "[ ]";
  const cursorMarker = isCursor ? "▸" : " ";
  const reclaimable = reclaimableLamports(row);
  const reclaimText = reclaimable === 0n ? "—" : formatSol(reclaimable);
  const fg = isCursor ? "#ffffff" : "#cccccc";
  const cursorBgProps = isCursor ? { backgroundColor: "#22334d" } : {};

  return (
    <box flexDirection="row" height={1} {...cursorBgProps}>
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
}

function padCell(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - text.length);
}
