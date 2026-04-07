import { lamports } from "@solana/kit";
import type { Address, Lamports } from "@solana/kit";
import type { SolanaRpc } from "./clients.ts";
import { SYSTEM_PROGRAM } from "./constants.ts";

const BATCH_SIZE = 100;

export interface AccountSnapshot {
  readonly address: Address;
  readonly lamports: Lamports;
  readonly owner: Address;
  readonly executable: boolean;
}

/**
 * Fetch lamport balance + owner for many addresses against one RPC.
 *
 * Addresses that don't exist on chain (never received a lamport) come back
 * as { lamports: 0n, owner: SystemProgram }. We synthesize that so callers
 * don't have to special-case nulls — a never-funded address is logically
 * a 0-balance wallet.
 */
export async function fetchAccountSnapshots(
  rpc: SolanaRpc,
  addresses: readonly Address[],
): Promise<Map<Address, AccountSnapshot>> {
  const result = new Map<Address, AccountSnapshot>();
  if (addresses.length === 0) {
    return result;
  }

  for (let start = 0; start < addresses.length; start += BATCH_SIZE) {
    const chunk = addresses.slice(start, start + BATCH_SIZE);
    const response = await rpc
      .getMultipleAccounts(chunk, {
        encoding: "base64",
        commitment: "confirmed",
        // dataSlice of length 0 means "don't ship the data, only the metadata".
        dataSlice: { offset: 0, length: 0 },
      })
      .send();

    response.value.forEach((account, idx) => {
      const addr = chunk[idx];
      if (addr === undefined) {
        return;
      }
      if (account === null) {
        // A non-existent account is logically a 0-balance wallet owned by the System Program.
        result.set(addr, {
          address: addr,
          lamports: lamports(0n),
          owner: SYSTEM_PROGRAM,
          executable: false,
        });
        return;
      }
      result.set(addr, {
        address: addr,
        lamports: account.lamports,
        owner: account.owner,
        executable: account.executable,
      });
    });
  }

  return result;
}
