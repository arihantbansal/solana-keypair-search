import React from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useAppStore } from "../state/store.ts";
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

/**
 * Root component. Owns the keyboard handler and the split-pane layout.
 *
 * Deliberately subscribes to the bare minimum: only `focusRegion`, since
 * that affects which pane gets the highlight border. The keyboard handler
 * reads cursor and selection imperatively via `getState()` so navigation
 * doesn't trigger an App re-render on every cursor move.
 *
 * Quit goes through `renderer.destroy()` (never `process.exit`) so OpenTUI
 * restores the terminal — alternate-screen, raw mode, hidden cursor — before
 * the process tears down. Ctrl-C is intentionally NOT handled here: the
 * renderer is constructed with `exitOnCtrlC: true`, which installs OpenTUI's
 * own SIGINT handler. Handling it twice would race the framework's cleanup.
 *
 * Enter copies the current selection to the system clipboard via OSC 52.
 * This is the tool's primary "extraction" path — without it the user can
 * see addresses but can't get them out of the TUI.
 */
export function App(): React.ReactNode {
  const renderer = useRenderer();
  const focusRegion = useAppStore((s) => s.focusRegion);
  const actions = useAppStore((s) => s.actions);

  useKeyboard((key) => {
    if (key.name === "q") {
      renderer.destroy();
      return;
    }
    if (key.name === "tab") {
      actions.setFocusRegion(focusRegion === "list" ? "detail" : "list");
      return;
    }
    if (key.name === "return" || key.name === "enter") {
      // Copy the selected addresses (one per line) to the system clipboard
      // via OSC 52. Works over SSH and in most modern terminal emulators.
      // No-op if nothing is selected — Enter on an empty selection is silent
      // rather than copying the cursor row, to keep the binding's contract
      // unambiguous.
      const { selection } = useAppStore.getState();
      if (selection.size > 0) {
        renderer.copyToClipboardOSC52([...selection].join("\n"));
      }
      return;
    }
    if (key.name === "escape") {
      actions.clearSelection();
      return;
    }
    if (focusRegion !== "list") {
      return;
    }
    if (key.name === "up") {
      actions.moveCursor(-1);
      return;
    }
    if (key.name === "down") {
      actions.moveCursor(1);
      return;
    }
    if (key.name === "space") {
      const { cursorAddress } = useAppStore.getState();
      if (cursorAddress !== null) {
        actions.toggleSelection(cursorAddress);
      }
      return;
    }
    const sortKey = SORT_KEYS_BY_DIGIT[key.name];
    if (sortKey) {
      actions.setSort(sortKey);
      return;
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      <StatusBar />
      <box flexDirection="row" flexGrow={1}>
        <KeypairList />
        <DetailPanel />
      </box>
      <HelpBar />
    </box>
  );
}
