import React from "react";
import { useAppStore } from "../state/store.ts";

/**
 * Top status strip: scan progress + selection count on the left, RPC
 * capability on the right. Recomputes only when scan, rpc, or selection
 * slices change.
 */
export function StatusBar(): React.ReactNode {
  const scan = useAppStore((s) => s.scan);
  const rpc = useAppStore((s) => s.rpc);
  const selectionSize = useAppStore((s) => s.selection.size);

  const scanText = scan.done
    ? `scanned ${scan.filesSeen} files · ${scan.keypairsFound} keypairs`
    : `scanning… ${scan.filesSeen} files · ${scan.keypairsFound} keypairs`;
  const selectionText = selectionSize > 0 ? ` · ${selectionSize} selected` : "";

  const rpcText = rpc.canQueryPrograms
    ? "RPC: programs ✓"
    : "RPC: balances only (set HELIUS_API_KEY for programs/buffers)";

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      height={1}
    >
      <text fg="#bbbbbb">
        {scanText}
        {selectionText}
      </text>
      <text fg={rpc.canQueryPrograms ? "#88dd88" : "#ddaa55"}>{rpcText}</text>
    </box>
  );
}
