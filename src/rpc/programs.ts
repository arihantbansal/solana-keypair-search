import type { Address } from "@solana/kit";
import type { SolanaRpc } from "./clients.ts";
import { asBase58EncodedBytes } from "./brand.ts";
import {
  BPF_LOADER_UPGRADEABLE,
  BUFFER_AUTHORITY_OFFSET,
  PROGRAM_DATA_AUTHORITY_OFFSET,
} from "./constants.ts";

export interface ProgramRecord {
  /** The ProgramData account address (PDA owned by the loader). */
  readonly programDataAddress: Address;
  /** Lamports held by the ProgramData account — recoverable on close. */
  readonly lamports: bigint;
}

export interface BufferRecord {
  /** The Buffer account address. */
  readonly bufferAddress: Address;
  /** Lamports held by the Buffer account — recoverable on close. */
  readonly lamports: bigint;
}

/**
 * Fetch all ProgramData accounts whose `upgrade_authority` matches the given wallet.
 *
 * Requires an RPC that allows `getProgramAccounts` on BPFLoaderUpgradeable.
 * Public mainnet rejects this call. Use a Helius (or comparable) RPC.
 *
 * We strip the ELF data with `dataSlice: { length: 0 }` so the response
 * carries only metadata — even programs with multi-megabyte bytecode
 * return in a few hundred bytes.
 */
export async function fetchProgramsByAuthority(
  rpc: SolanaRpc,
  authority: Address,
): Promise<ProgramRecord[]> {
  const response = await rpc
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

  return response.map((entry) => ({
    programDataAddress: entry.pubkey,
    lamports: entry.account.lamports,
  }));
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
