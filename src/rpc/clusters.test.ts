import { describe, expect, test } from "bun:test";
import { ALL_CLUSTERS } from "./clients.ts";
import { parseClusters } from "./clusters.ts";

describe("parseClusters", () => {
  test("undefined input returns all clusters", () => {
    const result = parseClusters(undefined);
    expect([...result]).toEqual([...ALL_CLUSTERS]);
  });

  test("empty string returns all clusters (treated as 'no opinion')", () => {
    const result = parseClusters("");
    expect([...result]).toEqual([...ALL_CLUSTERS]);
  });

  test("only commas returns all clusters", () => {
    const result = parseClusters(",,,");
    expect([...result]).toEqual([...ALL_CLUSTERS]);
  });

  test("single cluster", () => {
    expect([...parseClusters("mainnet")]).toEqual(["mainnet"]);
  });

  test("multiple clusters in any order", () => {
    expect([...parseClusters("devnet,mainnet")].toSorted()).toEqual(["devnet", "mainnet"]);
  });

  test("tolerates whitespace around names", () => {
    expect([...parseClusters("mainnet , devnet")].toSorted()).toEqual(["devnet", "mainnet"]);
  });

  test("tolerates trailing comma", () => {
    expect([...parseClusters("mainnet,devnet,")].toSorted()).toEqual(["devnet", "mainnet"]);
  });

  test("deduplicates repeated names", () => {
    expect([...parseClusters("mainnet,mainnet,devnet")].toSorted()).toEqual(["devnet", "mainnet"]);
  });

  test("throws on unknown cluster name", () => {
    expect(() => parseClusters("mainnnet")).toThrow(/unknown cluster: mainnnet/);
  });

  test("throws message includes the valid choices", () => {
    expect(() => parseClusters("local")).toThrow(/expected one of mainnet, devnet, testnet/);
  });

  test("throws on first bad name even when others are valid", () => {
    expect(() => parseClusters("mainnet,bogus,devnet")).toThrow(/unknown cluster: bogus/);
  });
});
