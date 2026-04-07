import type { Address, Lamports } from "@solana/kit";
import type { Cluster } from "../rpc/clients.ts";
import type { ProgramRecord, BufferRecord } from "../rpc/programs.ts";

/**
 * Discriminated union for any data that loads asynchronously over the lifetime
 * of the app. Used for balances, programs, buffers — every cell in the table.
 *
 * Modeling these as a union makes illegal states unrepresentable: a cell can
 * never simultaneously be "loading" and have a value, and the renderer can
 * exhaustively switch on `status`.
 */
export type LoadState<TValue> =
  | { readonly status: "pending" }
  | { readonly status: "loaded"; readonly value: TValue }
  | { readonly status: "skipped"; readonly reason: string }
  | { readonly status: "error"; readonly message: string };

export interface BalanceCell {
  readonly state: LoadState<Lamports>;
}

export interface RowState {
  readonly address: Address;
  /** Multiple files can hold the same secret key — track all paths. */
  readonly paths: readonly string[];
  /** True if mainnet says this account is owned by a BPF loader. Hidden from list. */
  readonly isProgramKeypair: boolean;
  readonly balances: Readonly<Record<Cluster, BalanceCell>>;
  readonly programs: LoadState<readonly ProgramRecord[]>;
  readonly buffers: LoadState<readonly BufferRecord[]>;
}

export type FocusRegion = "list" | "detail";

export type SortKey = "address" | "mainnet" | "devnet" | "testnet" | "programs" | "buffers";

export interface ScanProgressView {
  readonly dirsScanned: number;
  readonly filesSeen: number;
  readonly candidatesFound: number;
  readonly keypairsFound: number;
  readonly done: boolean;
}

export interface RpcStatusView {
  readonly canQueryPrograms: boolean;
  readonly clustersEnabled: ReadonlySet<Cluster>;
  readonly mainnetEndpoint: string;
}
