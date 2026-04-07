import type { Address, Lamports } from "@solana/kit";
import type { SolanaRpc } from "./clients.ts";
import { asBase58EncodedBytes } from "./brand.ts";
import {
  BPF_LOADER_UPGRADEABLE,
  BUFFER_AUTHORITY_OFFSET,
  PROGRAM_DATA_AUTHORITY_OFFSET,
} from "./constants.ts";

export interface ProgramRecord {
  /** The on-chain Program account address — this is what users want to copy/use. */
  readonly programAddress: Address;
  /** The ProgramData PDA address (owned by the loader). */
  readonly programDataAddress: Address;
  /** Lamports held by the ProgramData account — recoverable on close. */
  readonly lamports: Lamports;
}

export interface BufferRecord {
  /** The Buffer account address. */
  readonly bufferAddress: Address;
  /** Lamports held by the Buffer account — recoverable on close. */
  readonly lamports: Lamports;
}

/**
 * Program account size in BPFLoaderUpgradeable: 4-byte discriminator + 32-byte
 * programdata_address. The Program account is a thin wrapper that points to
 * the ProgramData PDA where the bytecode actually lives.
 */
const PROGRAM_ACCOUNT_SIZE = 36n;
const PROGRAM_ACCOUNT_PROGRAMDATA_OFFSET = 4n;

/**
 * Concurrency cap for the per-ProgramData → Program account resolution.
 * Each lookup is a `getProgramAccounts` call against the loader, which most
 * RPCs aggressively rate-limit. Unbounded `Promise.all` over a wallet with
 * many programs would burst past the limit on the first authority that owns
 * a non-trivial number of deployments.
 */
const RESOLVE_PROGRAM_CONCURRENCY = 4;

/**
 * Fetch all programs whose `upgrade_authority` matches the given wallet.
 *
 * This is a two-step query because BPFLoaderUpgradeable splits a deployment
 * into two accounts: the Program account (36 bytes, what users call "the
 * program ID") and the ProgramData account (PDA holding bytecode + authority).
 * We first find ProgramData accounts by authority, then resolve each one to
 * its Program account so the UI can show the address users actually care about.
 *
 * Requires an RPC that allows `getProgramAccounts` on the loader. Public
 * mainnet rejects this. Use Helius or another permissive endpoint.
 */
export async function fetchProgramsByAuthority(
  rpc: SolanaRpc,
  authority: Address,
): Promise<ProgramRecord[]> {
  // Step 1: find ProgramData accounts authored by this wallet.
  const programDataAccounts = await rpc
    .getProgramAccounts(BPF_LOADER_UPGRADEABLE, {
      encoding: "base64",
      commitment: "confirmed",
      dataSlice: { offset: 0, length: 0 },
      filters: [
        {
          memcmp: {
            offset: PROGRAM_DATA_AUTHORITY_OFFSET,
            bytes: asBase58EncodedBytes(authority),
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  // Step 2: for each ProgramData PDA, resolve the matching Program account.
  // Each lookup is independent but bounded by `RESOLVE_PROGRAM_CONCURRENCY`
  // — see the constant for why unbounded fan-out is wrong here.
  const results: ProgramRecord[] = Array.from({ length: programDataAccounts.length });
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < programDataAccounts.length) {
      const i = cursor++;
      const entry = programDataAccounts[i];
      if (!entry) {
        continue;
      }
      const programAddress = await resolveProgramFromProgramData(rpc, entry.pubkey);
      results[i] = {
        programAddress: programAddress ?? entry.pubkey,
        programDataAddress: entry.pubkey,
        lamports: entry.account.lamports,
      };
    }
  };
  await Promise.all(Array.from({ length: RESOLVE_PROGRAM_CONCURRENCY }, () => worker()));
  return results;
}

/**
 * Find the Program account that points to the given ProgramData PDA.
 * Returns null if no matching Program account exists (shouldn't happen for
 * a properly deployed program, but we don't crash on edge cases).
 */
async function resolveProgramFromProgramData(
  rpc: SolanaRpc,
  programDataAddress: Address,
): Promise<Address | null> {
  const matches = await rpc
    .getProgramAccounts(BPF_LOADER_UPGRADEABLE, {
      encoding: "base64",
      commitment: "confirmed",
      dataSlice: { offset: 0, length: 0 },
      filters: [
        { dataSize: PROGRAM_ACCOUNT_SIZE },
        {
          memcmp: {
            offset: PROGRAM_ACCOUNT_PROGRAMDATA_OFFSET,
            bytes: asBase58EncodedBytes(programDataAddress),
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  return matches[0]?.pubkey ?? null;
}

/**
 * Fetch all Buffer accounts whose `authority` matches the given wallet.
 * Same RPC requirement as `fetchProgramsByAuthority`.
 *
 * Buffers commonly hold 2-5 SOL each in reclaimable rent. They accumulate
 * when a deploy fails halfway or when a developer forgets to clean up
 * after a `solana program deploy`.
 */
export async function fetchBuffersByAuthority(
  rpc: SolanaRpc,
  authority: Address,
): Promise<BufferRecord[]> {
  const response = await rpc
    .getProgramAccounts(BPF_LOADER_UPGRADEABLE, {
      encoding: "base64",
      commitment: "confirmed",
      dataSlice: { offset: 0, length: 0 },
      filters: [
        {
          memcmp: {
            offset: BUFFER_AUTHORITY_OFFSET,
            bytes: asBase58EncodedBytes(authority),
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  return response.map((entry) => ({
    bufferAddress: entry.pubkey,
    lamports: entry.account.lamports,
  }));
}
