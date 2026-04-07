import { parseArgs } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App.tsx";
import { useAppStore } from "./state/store.ts";
import { createClients, resolveEndpoints } from "./rpc/clients.ts";
import type { Cluster } from "./rpc/clients.ts";
import { parseClusters } from "./rpc/clusters.ts";
import { runPipeline } from "./orchestrate.ts";

interface CliOptions {
  readonly roots: readonly string[];
  readonly heliusKey: string | undefined;
  readonly clusters: ReadonlySet<Cluster>;
  readonly mainnetUrl: string | undefined;
  readonly devnetUrl: string | undefined;
  readonly testnetUrl: string | undefined;
}

function parseCliOptions(): CliOptions {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      "helius-key": { type: "string" },
      "mainnet-url": { type: "string" },
      "devnet-url": { type: "string" },
      "testnet-url": { type: "string" },
      networks: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const explicitRoots = positionals.length > 0 ? positionals : [process.cwd()];
  const solanaConfigDir = join(homedir(), ".config", "solana");
  const roots = Array.from(new Set([solanaConfigDir, ...explicitRoots]));

  const heliusKey = values["helius-key"] ?? process.env["HELIUS_API_KEY"];

  const clusters = parseClusters(values.networks);

  return {
    roots,
    heliusKey,
    clusters,
    mainnetUrl: values["mainnet-url"],
    devnetUrl: values["devnet-url"],
    testnetUrl: values["testnet-url"],
  };
}

function printHelp(): void {
  process.stdout.write(`solana-keypair-search

USAGE:
  solana-keypair-search [ROOT...] [OPTIONS]

ARGS:
  ROOT                   Directories to scan. Defaults to ~/.config/solana + cwd.

OPTIONS:
  --helius-key <KEY>     Helius API key (enables programs/buffers query).
                         Can also be set via HELIUS_API_KEY env var.
  --networks <LIST>      Comma-separated list of networks to query.
                         Choices: mainnet, devnet, testnet. Default: all.
  --mainnet-url <URL>    Override the mainnet RPC endpoint.
  --devnet-url <URL>     Override the devnet RPC endpoint.
  --testnet-url <URL>    Override the testnet RPC endpoint.
  -h, --help             Print this help.

KEYS:
  ↑ ↓                   move cursor
  space                 toggle selection
  enter                 copy selected addresses to clipboard (OSC 52)
  esc                   clear selection
  tab                   switch focus between list and detail
  1-6                   sort by column (address/mainnet/devnet/testnet/programs/buffers)
  q / ctrl-c            quit
`);
}

async function main(): Promise<void> {
  const options = parseCliOptions();

  const { endpoints, canQueryPrograms } = resolveEndpoints({
    heliusApiKey: options.heliusKey,
    mainnetUrl: options.mainnetUrl,
    devnetUrl: options.devnetUrl,
    testnetUrl: options.testnetUrl,
  });
  const clients = createClients(endpoints);

  // Seed the store with what we know before any data arrives.
  useAppStore.getState().actions.initRpcStatus({
    canQueryPrograms,
    clustersEnabled: options.clusters,
    mainnetEndpoint: endpoints.mainnet,
  });

  let renderer: CliRenderer | null = null;
  try {
    renderer = await createCliRenderer({ exitOnCtrlC: true });
    createRoot(renderer).render(<App />);

    // Pipeline runs alongside the UI; we await it so any rejection becomes
    // a real error path with proper terminal cleanup, instead of an
    // unhandled promise rejection that crashes on top of a live TUI.
    await runPipeline({
      roots: options.roots,
      clients,
      clustersEnabled: options.clusters,
      canQueryPrograms,
    });
  } catch (err) {
    // Restore the terminal before printing — without destroy(), the user is
    // left in alternate-screen + raw mode and the error is invisible.
    renderer?.destroy();
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

void main();
