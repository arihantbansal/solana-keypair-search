import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useAppStore, selectVisibleRows } from "../state/store.ts";
import { StatusBar } from "./StatusBar.tsx";
import { HelpBar } from "./HelpBar.tsx";
import { KeypairList } from "./KeypairList.tsx";
import { DetailPanel } from "./DetailPanel.tsx";
import type { SortKey } from "../state/types.ts";

const SORT_KEYS_BY_DIGIT: Record<string, SortKey> = {
  "1": "address",
  "2": "mainnet",
  "3": "devnet",
  "4": "testnet",
  "5": "programs",
  "6": "buffers",
};

export function App(): React.ReactNode {
  const { height } = useTerminalDimensions();
  const visibleRows = useAppStore(selectVisibleRows);
  const cursor = useAppStore((s) => s.cursor);
  const focusRegion = useAppStore((s) => s.focusRegion);
  const actions = useAppStore((s) => s.actions);

  useKeyboard((key) => {
    if (key.name === "q" || (key.name === "c" && key.ctrl)) {
      process.exit(0);
    }
    if (key.name === "tab") {
      actions.setFocusRegion(focusRegion === "list" ? "detail" : "list");
      return;
    }
    if (focusRegion !== "list") {
      return;
    }
    if (key.name === "up") {
      actions.setCursor(Math.max(0, cursor - 1));
      return;
    }
    if (key.name === "down") {
      actions.setCursor(Math.min(visibleRows.length - 1, cursor + 1));
      return;
    }
    if (key.name === "space") {
      const row = visibleRows[cursor];
      if (row) {
        actions.toggleSelection(row.address);
      }
      return;
    }
    const sortKey = SORT_KEYS_BY_DIGIT[key.name];
    if (sortKey) {
      actions.setSort(sortKey);
      return;
    }
  });

  // 1 row top status, 1 row bottom help. The middle row consumes the rest.
  const middleHeight = Math.max(5, height - 2);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <StatusBar />
      <box flexDirection="row" height={middleHeight}>
        <KeypairList height={middleHeight} />
        <DetailPanel />
      </box>
      <HelpBar />
    </box>
  );
}
