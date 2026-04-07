import { ALL_CLUSTERS, type Cluster } from "./clients.ts";

/**
 * Type guard for the `Cluster` literal union. Hand-rolled rather than derived
 * from `ALL_CLUSTERS` because TypeScript's `Set<Cluster>` is invariant in its
 * parameter, so a `Set<Cluster>.has(value: string)` lookup would force an
 * `as` cast — which CLAUDE.md prohibits. The literal `===` chain is verbose
 * but cast-free; if `Cluster` ever gains a new member, the parser tests
 * below will fail and force this guard to be updated alongside it.
 */
function isCluster(value: string): value is Cluster {
  return value === "mainnet" || value === "devnet" || value === "testnet";
}

/**
 * Parse the `--networks` CLI flag into a Set of clusters.
 *
 * Throws on unknown names so a typo (`--networks=mainnnet`) fails fast with
 * a clear error message instead of silently resolving to an empty set and
 * rendering every cell as `—`. The previous inline parser used `flatMap` to
 * drop unknown names, which produced confusing UX when a single typo turned
 * the whole TUI into "no data."
 *
 * Empty input or `undefined` returns the full default (all clusters). An
 * input that contains only whitespace or empty segments (e.g. `","`) is
 * also treated as the default rather than as "explicitly empty."
 */
export function parseClusters(networksArg: string | undefined): ReadonlySet<Cluster> {
  if (networksArg === undefined) {
    return new Set(ALL_CLUSTERS);
  }
  const result = new Set<Cluster>();
  for (const raw of networksArg.split(",")) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      continue;
    }
    if (!isCluster(trimmed)) {
      throw new Error(`unknown cluster: ${trimmed} (expected one of ${ALL_CLUSTERS.join(", ")})`);
    }
    result.add(trimmed);
  }
  if (result.size === 0) {
    return new Set(ALL_CLUSTERS);
  }
  return result;
}
