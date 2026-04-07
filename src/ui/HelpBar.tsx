import React from "react";

/**
 * Bottom keybinding hint strip. Always visible — TUI users should never
 * have to guess at shortcuts.
 */
export function HelpBar(): React.ReactNode {
  return (
    <box paddingLeft={1} paddingRight={1} height={1}>
      <text fg="#888888">↑↓ move · space select · tab focus · 1-6 sort · q quit</text>
    </box>
  );
}
