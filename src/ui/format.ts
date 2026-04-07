import type { LoadState } from "../state/types.ts";
import { LAMPORTS_PER_SOL } from "../rpc/constants.ts";

/**
 * Format an address (or any opaque identifier) as `aaaa…zzzz` for compact
 * display in tables. Takes `string` rather than the branded `Address` type so
 * callers can pass any short identifier and tests can exercise boundary
 * lengths without conjuring real base58.
 */
export function shortAddress(address: string): string {
  if (address.length <= 9) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Format lamports as SOL with up to 4 decimals.
 * Sub-lamport precision is impossible; bigint math throughout.
 */
export function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const remainder = lamports % LAMPORTS_PER_SOL;
  if (remainder === 0n) {
    return `${whole}`;
  }
  // Render up to 4 decimal places, trimming trailing zeros.
  const fractionalScale = 10_000n;
  const scaled = (remainder * fractionalScale) / LAMPORTS_PER_SOL;
  const fractional = scaled.toString().padStart(4, "0").replace(/0+$/, "");
  if (fractional === "") {
    return `${whole}`;
  }
  return `${whole}.${fractional}`;
}

/** Render any LoadState<bigint> as a fixed-width balance cell. */
export function formatBalanceCell(state: LoadState<bigint>): string {
  switch (state.status) {
    case "pending":
      return "  ···";
    case "loaded":
      return formatSol(state.value);
    case "skipped":
      return "  —  ";
    case "error":
      return "  err";
  }
}

/** Render programs/buffers count cell. */
export function formatCountCell<T>(state: LoadState<readonly T[]>): string {
  switch (state.status) {
    case "pending":
      return "···";
    case "loaded":
      return state.value.length === 0 ? "0" : String(state.value.length);
    case "skipped":
      return "—";
    case "error":
      return "err";
  }
}
