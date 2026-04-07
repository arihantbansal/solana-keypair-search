import { address } from "@solana/kit";
import type { Address } from "@solana/kit";
import { LOADER_V3_PROGRAM_ADDRESS } from "@solana-program/loader-v3";

/**
 * BPFLoaderUpgradeable program — owns ProgramData and Buffer accounts.
 *
 * Sourced from `@solana-program/loader-v3` rather than redeclared so the
 * constant stays in lockstep with the upstream typed address brand.
 */
export const BPF_LOADER_UPGRADEABLE: Address = LOADER_V3_PROGRAM_ADDRESS;

/** Older non-upgradable BPF loaders. Programs deployed via these cannot be closed. */
export const BPF_LOADER_2: Address = address("BPFLoader2111111111111111111111111111111111");

export const BPF_LOADER_1: Address = address("BPFLoader1111111111111111111111111111111111");

/** System Program — owner of every regular wallet account. */
export const SYSTEM_PROGRAM: Address = address("11111111111111111111111111111111");

/** Set of all loaders we recognize as "this account is a program, not a wallet". */
export const PROGRAM_OWNERS: ReadonlySet<Address> = new Set<Address>([
  BPF_LOADER_UPGRADEABLE,
  BPF_LOADER_2,
  BPF_LOADER_1,
]);

/**
 * Memcmp offsets into BPFLoaderUpgradeable account layouts.
 *
 * ProgramData layout:
 *   0..4   = enum tag (3 = ProgramData)
 *   4..12  = slot (u64 LE)
 *   12     = Option tag for upgrade_authority (1 = Some, 0 = None)
 *   13..45 = upgrade_authority pubkey (32 bytes)
 *   45..   = ELF bytecode
 *
 * Buffer layout:
 *   0..4   = enum tag (1 = Buffer)
 *   4      = Option tag for authority
 *   5..37  = authority pubkey
 *   37..   = ELF bytecode
 */
export const PROGRAM_DATA_AUTHORITY_OFFSET = 13n;
export const BUFFER_AUTHORITY_OFFSET = 5n;

/** Lamports per SOL. */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
