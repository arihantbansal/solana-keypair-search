import { readFile } from "node:fs/promises";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import type { Address } from "@solana/kit";

/**
 * A successfully validated keypair file.
 * The secret bytes are intentionally NOT retained — we only keep the
 * file path so we can re-read on demand when (later) signing a tx.
 */
export interface ParsedKeypair {
  readonly path: string;
  readonly address: Address;
}

/**
 * Validate that a parsed JSON value is the canonical Solana CLI keypair shape:
 * an array of exactly 64 integers in [0, 255].
 *
 * Returns the bytes if valid, null otherwise. Caller is responsible for
 * zeroing the returned buffer when finished.
 */
function validateKeypairShape(parsed: unknown): Uint8Array | null {
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    return null;
  }
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const value = parsed[i];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    bytes[i] = value;
  }
  return bytes;
}

/** Securely overwrite a buffer's contents with zeros before letting it be GC'd. */
function zeroize(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Try to parse a candidate file as a Solana keypair.
 * Returns the parsed keypair on success, or null if it isn't one.
 *
 * Errors at every layer (read, parse, shape, derive) are absorbed: this is
 * a heuristic scan, not a validation tool. Failure means "not a keypair".
 */
export async function parseKeypairFile(path: string): Promise<ParsedKeypair | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const bytes = validateKeypairShape(parsed);
  if (bytes === null) {
    return null;
  }

  try {
    const signer = await createKeyPairSignerFromBytes(bytes);
    return { path, address: signer.address };
  } catch {
    return null;
  } finally {
    zeroize(bytes);
  }
}
