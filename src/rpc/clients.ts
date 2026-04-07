import { createSolanaRpc } from "@solana/kit";

export type Cluster = "mainnet" | "devnet" | "testnet";

export const ALL_CLUSTERS: readonly Cluster[] = ["mainnet", "devnet", "testnet"];

export interface RpcEndpoints {
  readonly mainnet: string;
  readonly devnet: string;
  readonly testnet: string;
}

export interface ResolvedEndpoints {
  readonly endpoints: RpcEndpoints;
  /** Whether the mainnet endpoint is permissive enough to call getProgramAccounts on the loader. */
  readonly canQueryPrograms: boolean;
}

const DEFAULT_PUBLIC: RpcEndpoints = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

/**
 * Resolve the set of endpoints to use, layering precedence:
 *   1. Explicit per-cluster overrides (env vars).
 *   2. Helius API key (sets mainnet to Helius, leaves devnet/testnet on public).
 *   3. Public RPCs.
 *
 * `canQueryPrograms` is true only when mainnet is on a permissive endpoint
 * (Helius or a custom URL the user supplied), since public mainnet rejects
 * `getProgramAccounts` on the BPF loader.
 */
export function resolveEndpoints(opts: {
  heliusApiKey?: string | undefined;
  mainnetUrl?: string | undefined;
  devnetUrl?: string | undefined;
  testnetUrl?: string | undefined;
}): ResolvedEndpoints {
  const helius = opts.heliusApiKey?.trim();
  const heliusMainnet = helius ? `https://mainnet.helius-rpc.com/?api-key=${helius}` : null;

  const mainnet = opts.mainnetUrl?.trim() || heliusMainnet || DEFAULT_PUBLIC.mainnet;
  const devnet = opts.devnetUrl?.trim() || DEFAULT_PUBLIC.devnet;
  const testnet = opts.testnetUrl?.trim() || DEFAULT_PUBLIC.testnet;

  const canQueryPrograms = Boolean(opts.mainnetUrl?.trim() || heliusMainnet);

  return {
    endpoints: { mainnet, devnet, testnet },
    canQueryPrograms,
  };
}

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export interface RpcClients {
  readonly mainnet: SolanaRpc;
  readonly devnet: SolanaRpc;
  readonly testnet: SolanaRpc;
}

export function createClients(endpoints: RpcEndpoints): RpcClients {
  return {
    mainnet: createSolanaRpc(endpoints.mainnet),
    devnet: createSolanaRpc(endpoints.devnet),
    testnet: createSolanaRpc(endpoints.testnet),
  };
}
