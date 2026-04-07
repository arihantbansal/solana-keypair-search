import type { Base58EncodedBytes } from "@solana/kit";

/**
 * Bridge between plain strings and `@solana/kit`'s branded `Base58EncodedBytes`
 * type at the RPC memcmp filter boundary.
 *
 * The kit defines `Base58EncodedBytes` as a phantom-typed nominal brand on
 * top of `string`. There is no public factory for it, so the only way to
 * pass an `Address` (or any other base58 string) into a `getProgramAccounts`
 * memcmp filter is to bridge the type ourselves.
 *
 * We use a TypeScript assertion function — not a type assertion (`as`) — to
 * narrow at the type level with no runtime cost. This is the *only* place
 * in the codebase where we cross this boundary.
 *
 * The caller must guarantee the input is a valid base58 string. In practice
 * we only ever feed this `Address` values, which are base58 by construction.
 */
function brandAsBase58(_value: string): asserts _value is Base58EncodedBytes {
  // intentionally empty — type-level narrow only.
}

export function asBase58EncodedBytes(value: string): Base58EncodedBytes {
  brandAsBase58(value);
  return value;
}
