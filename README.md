# solana-keypair-search

A terminal UI that scans your filesystem for Solana keypairs and shows their on-chain
balances, deployed programs, and reclaimable rent in one place.

Useful for finding old wallets you forgot about, auditing which keys you have lying
around, and reclaiming SOL from buffer accounts and closeable program deployments.

## Features

- Recursive filesystem scan for Solana CLI keypair files (`[u8; 64]` JSON arrays).
- Streaming RPC fan-out: balances on mainnet, devnet, and testnet in parallel.
- Lists deployed programs and orphaned buffer accounts authored by each wallet,
  with total reclaimable lamports per row.
- Sortable, multi-selectable, identity-anchored cursor that survives sort changes.
- Skips accounts owned by BPF loaders so program keypairs do not clutter the wallet view.
- Validated keypair bytes are zeroed in memory immediately after the public key is derived.

## Requirements

- [Bun](https://bun.sh) 1.3 or later.

## Installation

```bash
git clone https://github.com/arihantbansal/solana-keypair-search.git
cd solana-keypair-search
bun install
```

## Usage

```bash
bun run dev [ROOT...] [OPTIONS]
```

Scans `~/.config/solana` and the current directory by default.

```bash
# Default scan: ~/.config/solana + cwd, balances only
bun run dev

# Scan specific directories
bun run dev ~/projects ~/backup

# Enable program and buffer queries via Helius
HELIUS_API_KEY=xxx bun run dev

# Scan only mainnet
bun run dev --networks mainnet

# Use a custom mainnet RPC
bun run dev --mainnet-url https://my-rpc.example.com
```

Public mainnet rejects `getProgramAccounts` against the BPF loader, so the program
and buffer columns are disabled unless you supply a permissive endpoint via
`HELIUS_API_KEY` or `--mainnet-url`.

## Options

| Flag | Description |
| --- | --- |
| `ROOT...` | Directories to scan. Defaults to `~/.config/solana` plus the current directory. |
| `--helius-key <KEY>` | Helius API key. Also accepted via `HELIUS_API_KEY`. Enables program and buffer queries. |
| `--networks <LIST>` | Comma-separated subset of `mainnet,devnet,testnet`. Defaults to all three. |
| `--mainnet-url <URL>` | Override the mainnet RPC endpoint. |
| `--devnet-url <URL>` | Override the devnet RPC endpoint. |
| `--testnet-url <URL>` | Override the testnet RPC endpoint. |
| `-h`, `--help` | Print usage and exit. |

## Keybindings

| Key | Action |
| --- | --- |
| `Up` / `Down` | Move cursor |
| `Space` | Toggle row selection |
| `Enter` | Copy selected addresses to the clipboard (OSC 52) |
| `Esc` | Clear selection |
| `Tab` | Switch focus between list and detail panes |
| `1`-`6` | Sort by address, mainnet, devnet, testnet, programs, buffers |
| `q` | Quit |
| `Ctrl-C` | Quit |

Pressing the same sort key again toggles ascending and descending order. The
clipboard copy uses OSC 52, which works over SSH and in most modern terminal
emulators (iTerm2, Alacritty, Kitty, WezTerm, recent xterm).

## How it works

1. A bounded async walker traverses the roots, pruning ignored directories
   (`node_modules`, `.git`, build outputs, etc.) and skipping files whose
   extension or size cannot fit a 64-byte keypair JSON.
2. Surviving candidates are parsed in a 32-wide pool. Each parse validates the
   shape, derives the public key, and zeroes the secret buffer.
3. Discovered addresses stream into a backpressured pipeline: balances are
   fetched in batches of 50 via `getMultipleAccounts`, and program and buffer
   queries are issued per address with bounded concurrency to avoid RPC bursts.
4. The Zustand store models every cell as a pending, loaded, skipped, or error
   union. The UI subscribes to a memoized selector that recomputes only when
   the underlying row map, sort key, or sort direction changes.

## Security notes

- Secret bytes are read once, validated, used to derive the public key via
  `@solana/kit`, and then explicitly zeroed in the local buffer.
- The tool never writes to disk, never sends keys over the network, and never
  retains the parsed bytes after the public key is computed.
- File paths to discovered keypairs are kept in memory only for display.

## Development

```bash
bun run dev          # Run the TUI
bun run check        # Typecheck, lint, format check, and tests
bun run test         # Tests only
bun run lint         # oxlint
bun run format       # oxfmt
bun run build        # Bundle to dist/
```

The codebase uses strict TypeScript (`exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, no `any`, no non-null assertions, no
type assertions). All four checks must pass before a commit.
