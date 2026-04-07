import React from "react";
import type { Lamports } from "@solana/kit";
import { useAppStore, selectCursorRow, reclaimableLamports } from "../state/store.ts";
import type { LoadState, RowState } from "../state/types.ts";
import type { ProgramRecord, BufferRecord } from "../rpc/programs.ts";
import { formatBalanceCell, formatSol, shortAddress } from "./format.ts";

/**
 * Detail panel for the row currently under the cursor. Subscribes to the
 * cursor row identity-based — re-renders only when the cursor moves to a
 * different row OR when the focused row's data changes.
 */
export function DetailPanel(): React.ReactNode {
  const row = useAppStore(selectCursorRow);
  const focusRegion = useAppStore((s) => s.focusRegion);

  return (
    <box
      flexDirection="column"
      width={42}
      border={true}
      borderColor={focusRegion === "detail" ? "#5599ff" : "#444444"}
      title=" detail "
      paddingLeft={1}
      paddingRight={1}
    >
      {row ? <RowDetail row={row} /> : <text fg="#666666">no selection</text>}
    </box>
  );
}

function RowDetail({ row }: { readonly row: RowState }): React.ReactNode {
  return (
    <box flexDirection="column">
      <text fg="#ffffff">{row.address}</text>
      <text fg="#666666">
        {row.paths.length === 1 ? row.paths[0] : `${row.paths.length} files`}
      </text>
      <box height={1}>
        <text> </text>
      </box>

      <text fg="#888888">balances</text>
      <BalanceLine label="mainnet" state={row.balances.mainnet.state} />
      <BalanceLine label=" devnet" state={row.balances.devnet.state} />
      <BalanceLine label="testnet" state={row.balances.testnet.state} />

      <box height={1}>
        <text> </text>
      </box>
      <text fg="#888888">programs</text>
      <ProgramsView state={row.programs} />

      <box height={1}>
        <text> </text>
      </box>
      <text fg="#888888">buffers</text>
      <BuffersView state={row.buffers} />

      <box height={1}>
        <text> </text>
      </box>
      <text fg="#dddd55">reclaimable: {formatSol(reclaimableLamports(row))} ◎</text>
    </box>
  );
}

function BalanceLine({
  label,
  state,
}: {
  readonly label: string;
  readonly state: LoadState<Lamports>;
}): React.ReactNode {
  return (
    <box flexDirection="row">
      <text fg="#aaaaaa">{label} </text>
      <text fg="#dddddd">{formatBalanceCell(state)} ◎</text>
    </box>
  );
}

function ProgramsView({
  state,
}: {
  readonly state: LoadState<readonly ProgramRecord[]>;
}): React.ReactNode {
  switch (state.status) {
    case "pending":
      return <text fg="#666666">loading…</text>;
    case "skipped":
      return <text fg="#666666">{state.reason}</text>;
    case "error":
      return <text fg="#dd5555">error: {state.message}</text>;
    case "loaded":
      if (state.value.length === 0) {
        return <text fg="#666666">none</text>;
      }
      return (
        <box flexDirection="column">
          {state.value.map((p) => (
            <text key={p.programDataAddress} fg="#cccccc">
              • {shortAddress(p.programAddress)} {formatSol(p.lamports)} ◎
            </text>
          ))}
        </box>
      );
  }
}

function BuffersView({
  state,
}: {
  readonly state: LoadState<readonly BufferRecord[]>;
}): React.ReactNode {
  switch (state.status) {
    case "pending":
      return <text fg="#666666">loading…</text>;
    case "skipped":
      return <text fg="#666666">{state.reason}</text>;
    case "error":
      return <text fg="#dd5555">error: {state.message}</text>;
    case "loaded":
      if (state.value.length === 0) {
        return <text fg="#666666">none</text>;
      }
      return (
        <box flexDirection="column">
          {state.value.map((b) => (
            <text key={b.bufferAddress} fg="#cccccc">
              • {shortAddress(b.bufferAddress)} {formatSol(b.lamports)} ◎
            </text>
          ))}
        </box>
      );
  }
}
