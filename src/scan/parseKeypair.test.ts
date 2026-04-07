import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeypairFile, validateKeypairShape } from "./parseKeypair.ts";

// Deterministic 64-byte array; values in range. Hoisted out of describe()
// because lint flags inner functions that don't capture parent scope.
function makeBytes(): number[] {
  return Array.from({ length: 64 }, (_, i) => i);
}

describe("validateKeypairShape", () => {
  test("accepts a valid 64-byte array", () => {
    const result = validateKeypairShape(makeBytes());
    expect(result).not.toBeNull();
    expect(result?.length).toBe(64);
    // Avoid the non-null assertion by guarding explicitly.
    if (result === null) throw new Error("unreachable");
    expect(Array.from(result)).toEqual(makeBytes());
  });

  test("rejects 63 bytes (off by one short)", () => {
    expect(validateKeypairShape(makeBytes().slice(0, 63))).toBeNull();
  });

  test("rejects 65 bytes (off by one long)", () => {
    expect(validateKeypairShape([...makeBytes(), 0])).toBeNull();
  });

  test("rejects an empty array", () => {
    expect(validateKeypairShape([])).toBeNull();
  });

  test("rejects null", () => {
    expect(validateKeypairShape(null)).toBeNull();
  });

  test("rejects a non-array (object)", () => {
    expect(validateKeypairShape({ length: 64 })).toBeNull();
  });

  test("rejects a non-array (string)", () => {
    expect(validateKeypairShape("a".repeat(64))).toBeNull();
  });

  test("rejects negative byte (-1)", () => {
    const bytes = makeBytes();
    bytes[0] = -1;
    expect(validateKeypairShape(bytes)).toBeNull();
  });

  test("rejects byte = 256 (just past u8 range)", () => {
    const bytes = makeBytes();
    bytes[63] = 256;
    expect(validateKeypairShape(bytes)).toBeNull();
  });

  test("rejects floating-point byte (1.5)", () => {
    const bytes: number[] = makeBytes();
    bytes[10] = 1.5;
    expect(validateKeypairShape(bytes)).toBeNull();
  });

  test("rejects string-encoded byte ('5')", () => {
    const bytes: unknown[] = makeBytes();
    bytes[10] = "5";
    expect(validateKeypairShape(bytes)).toBeNull();
  });

  test("accepts boundary values 0 and 255", () => {
    const bytes = Array.from({ length: 64 }, (_, i) => (i === 0 ? 0 : 255));
    const result = validateKeypairShape(bytes);
    expect(result).not.toBeNull();
    expect(result?.[0]).toBe(0);
    expect(result?.[63]).toBe(255);
  });
});

describe("parseKeypairFile", () => {
  // Use a unique temp dir per test run; clean up at the end of each test.
  function withTempFile(contents: string, fn: (path: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), "kp-test-"));
    const path = join(dir, "keypair.json");
    writeFileSync(path, contents, "utf8");
    return fn(path).finally(() => rmSync(dir, { recursive: true, force: true }));
  }

  test("returns null for a non-existent path", async () => {
    expect(await parseKeypairFile("/nonexistent/path/that/should/not/exist.json")).toBeNull();
  });

  test("returns null for non-JSON content", async () => {
    await withTempFile("not json at all", async (path) => {
      expect(await parseKeypairFile(path)).toBeNull();
    });
  });

  test("returns null for valid JSON that is not a keypair shape", async () => {
    await withTempFile(JSON.stringify({ private: "key" }), async (path) => {
      expect(await parseKeypairFile(path)).toBeNull();
    });
  });

  test("returns null for a 64-byte array of all zeros (invalid Ed25519 secret)", async () => {
    // The shape is valid but createKeyPairSignerFromBytes will reject it —
    // the catch in parseKeypairFile must absorb that and return null.
    await withTempFile(JSON.stringify(Array.from({ length: 64 }, () => 0)), async (path) => {
      expect(await parseKeypairFile(path)).toBeNull();
    });
  });

  test("returns a parsed keypair for a known-good fixture", async () => {
    // Generated once and pinned; the test does not need a live RPC.
    // Bytes correspond to a real Ed25519 keypair (32-byte seed + 32-byte pubkey).
    const knownGood = [
      174, 47, 154, 16, 202, 193, 206, 113, 199, 190, 53, 133, 169, 175, 31, 56, 222, 53, 138, 189,
      224, 216, 117, 173, 10, 149, 53, 45, 73, 251, 237, 246, 15, 185, 186, 82, 177, 240, 148, 69,
      241, 227, 167, 80, 141, 89, 240, 121, 121, 35, 172, 247, 68, 251, 226, 218, 48, 63, 176, 109,
      168, 89, 238, 135,
    ];
    await withTempFile(JSON.stringify(knownGood), async (path) => {
      const result = await parseKeypairFile(path);
      expect(result).not.toBeNull();
      expect(result?.path).toBe(path);
      // The address is deterministic from the secret; just assert it's a
      // base58-ish non-empty string of plausible length (32–44 chars).
      expect(result?.address.length).toBeGreaterThanOrEqual(32);
      expect(result?.address.length).toBeLessThanOrEqual(44);
    });
  });
});
