import { describe, expect, test } from "bun:test";
import { formatBalanceCell, formatCountCell, formatSol, shortAddress } from "./format.ts";

describe("formatSol", () => {
  test("0 lamports renders as '0' (no fractional)", () => {
    expect(formatSol(0n)).toBe("0");
  });

  test("1 lamport renders as '0' (below 4-decimal precision)", () => {
    // 1 lamport = 1e-9 SOL; the 4-decimal cap floors this to 0.
    expect(formatSol(1n)).toBe("0");
  });

  test("100_000 lamports = 0.0001 SOL", () => {
    expect(formatSol(100_000n)).toBe("0.0001");
  });

  test("999_999_999 lamports = '0.9999' (truncated, not rounded)", () => {
    expect(formatSol(999_999_999n)).toBe("0.9999");
  });

  test("exactly 1 SOL renders as '1' with no decimals", () => {
    expect(formatSol(1_000_000_000n)).toBe("1");
  });

  test("1.5 SOL renders as '1.5'", () => {
    expect(formatSol(1_500_000_000n)).toBe("1.5");
  });

  test("2.5 SOL renders as '2.5'", () => {
    expect(formatSol(2_500_000_000n)).toBe("2.5");
  });

  test("trailing zeros are trimmed (1.2300 → '1.23')", () => {
    expect(formatSol(1_230_000_000n)).toBe("1.23");
  });

  test("large value with sub-SOL precision", () => {
    expect(formatSol(1_234_567_891n)).toBe("1.2345");
  });

  test("very large whole-SOL value", () => {
    expect(formatSol(1_234_000_000_000n)).toBe("1234");
  });
});

describe("formatBalanceCell", () => {
  test("pending status", () => {
    expect(formatBalanceCell({ status: "pending" })).toBe("  ···");
  });

  test("loaded status uses formatSol", () => {
    expect(formatBalanceCell({ status: "loaded", value: 2_000_000_000n })).toBe("2");
  });

  test("skipped status", () => {
    expect(formatBalanceCell({ status: "skipped", reason: "anything" })).toBe("  —  ");
  });

  test("error status", () => {
    expect(formatBalanceCell({ status: "error", message: "boom" })).toBe("  err");
  });
});

describe("formatCountCell", () => {
  test("pending", () => {
    expect(formatCountCell({ status: "pending" })).toBe("···");
  });

  test("loaded zero items", () => {
    expect(formatCountCell({ status: "loaded", value: [] })).toBe("0");
  });

  test("loaded with items", () => {
    expect(formatCountCell({ status: "loaded", value: [1, 2, 3] })).toBe("3");
  });

  test("skipped", () => {
    expect(formatCountCell({ status: "skipped", reason: "x" })).toBe("—");
  });

  test("error", () => {
    expect(formatCountCell({ status: "error", message: "x" })).toBe("err");
  });
});

describe("shortAddress", () => {
  test("address shorter than 9 chars passes through unchanged", () => {
    expect(shortAddress("abcdefghi")).toBe("abcdefghi");
  });

  test("address of length 10 is shortened", () => {
    expect(shortAddress("0123456789")).toBe("0123…6789");
  });

  test("typical 32-char base58 address", () => {
    expect(shortAddress("11111111111111111111111111111111")).toBe("1111…1111");
  });

  test("address of exactly 9 chars passes through (boundary)", () => {
    expect(shortAddress("123456789")).toBe("123456789");
  });
});
