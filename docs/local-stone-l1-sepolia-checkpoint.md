# Local Stone to L1 Sepolia Checkpoint

Last updated: 2026-06-07

This note captures the current state before switching tracks to the private-transfer integration.

## Working Local Path

- Program: public Poseidon Merkle fixture in `packages/cairo-merkle-poseidon`.
- Proof system: local Stone STARK proof using the deployed-GPS-compatible patched binaries.
- Patch: `patches/stone-prover-legacy-gps-public-input-seed.patch`.
- Binaries:
  - `tools/stone/bin/cpu_air_prover_legacy_gps`
  - `tools/stone/bin/cpu_air_verifier_legacy_gps`
- Wrapper:
  - `packages/cairo-merkle-poseidon/scripts/prove-local-stone-legacy-gps.sh`

Successful command:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps
```

The local verifier accepted the generated Stone proof.

## Local Mainnet Fork Verification

The deployed mainnet GPS verifier bytecode was exercised through a Hardhat mainnet fork.

Fork command that worked when the default Alchemy DNS path failed:

```sh
corepack yarn workspace @se-2/hardhat hardhat node --network hardhat --fork https://mainnet.rpc.buidlguidl.com --no-deploy
```

Verifier command shape:

```sh
URL=http://127.0.0.1:8545 \
SPLIT_PROOF=packages/cairo-merkle-poseidon/target/local-proofs/stone/poseidon-merkle-full-bootloader-legacy-gps-stone-split-proofs.json \
TASK_METADATA_MODE=bootloader \
FACT_TOPOLOGIES=packages/cairo-merkle-poseidon/target/dev/stone-full-bootloader-fact-topologies.json \
cargo run -q --example verify_split_proof_custom
```

The adapter now prints `gasUsed` for every verification transaction and a total.

Measured fork gas for the Poseidon Merkle full-bootloader proof:

- Trace statements: `384,250`, `397,120`, `383,950`
- FRI statements: `450,530`, `417,170`, `384,200`, `350,840`, `318,020`, `284,450`, `251,450`, `218,570`
- Continuous memory page: `50,899`
- Main proof: `2,677,410`
- Total: `6,568,859` gas across `13` transactions

## Shielded-Pool Transfer Full-Bootloader Result

The private-transfer track now has a local-proof/direct-verifier result for `packages/cairo-shielded-pool` transfer:

```sh
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer:fork
```

Result on 2026-06-06 machine time:

- local full-bootloader Stone AIR: `layout=starknet`, `n_steps=131072`, `publicMemory=760`
- local legacy-GPS Stone proof verified successfully
- split proof: `main_proof_words=540`, `trace_merkle_statements=3`, `fri_merkle_statements=8`, `continuous_memory_pages=1`
- local mainnet-fork deployed GPS verifier accepted every transaction and printed `Verified: Main proof gasUsed=2677661`
- total fork verifier gas: `6,612,319`

This keeps proving local. The online-equivalent part is verifier calldata submission; so far it has been exercised against a local fork of deployed mainnet verifier contracts, not Sepolia.
## Clean Patched Scarb Rebuild

The full-bootloader AIR dependency is now reproducible from repo files:

```sh
SCARB_REPO=/tmp/scarb-2.18.0-clean-codex corepack yarn scarb:build-patched-execute
```

This clean rebuild cloned Scarb v2.18.0, copied `tools/stark-evm-adapter/bootloader/test_compiled_bootloader.json` into the Scarb checkout, applied `patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch`, and built `scarb-execute`. The rebuilt binary then generated shielded-pool transfer full-bootloader AIR matching the verified shape: `layout=starknet`, `n_steps=131072`, `publicMemory=760`, topology page size `[7]`.
## Sepolia Direct Verification State

The direct local-proof-to-Sepolia wrapper exists:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia-preflight
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia
```

Current configured pieces:

- `SEPOLIA_RPC_URL` is present in `packages/hardhat/.env`.
- A throwaway `STONE_SEPOLIA_PRIVATE_KEY` was generated in `packages/hardhat/.env`.
- Throwaway public address: `0x6b6Ea75fCEE3c55DD881cFF70CF80C5375eB3395`.
- The throwaway address had `0` Sepolia ETH when checked and needs faucet funding before any Sepolia transaction.

Known Sepolia landmarks:

- Official SHARP verifier: `0x07ec0D28e50322Eb0C159B9090ecF3aeA8346DFe`
- Starknet Core: `0xE2Bb56ee936fd6433DC0F6e7e3b8365C906AA057`

Both have bytecode on Sepolia, but neither exposes the adapter entrypoints:

- `verifyProofAndRegister`
- `registerContinuousMemoryPage`
- `verifyMerkle`
- `verifyFRI`

So the direct split-proof path still needs Sepolia addresses for:

- `SEPOLIA_GPS_MAIN_VERIFIER`
- `SEPOLIA_GPS_MEMORY_PAGE_FACT_REGISTRY`
- `SEPOLIA_GPS_TRACE_CONTRACT`
- `SEPOLIA_GPS_FRI_CONTRACT`

Current preflight should fail only on those missing helper addresses.

## Atlantic/Sepolia Reference

The Atlantic route already showed real Sepolia L1 verification for the public fixture:

- Query id: `01KTDS2CJV6BTG555N0PSD2K9H`
- Result: `PROOF_VERIFICATION_ON_L1`
- `isFactMocked=false`
- `isProofMocked=false`
- Sepolia Satellite readback: `valid: true`

This route uses remote proving and is not private-witness-safe. It is useful as a public demo reference only.

## Resume Checklist

1. Fund `0x6b6Ea75fCEE3c55DD881cFF70CF80C5375eB3395` with Sepolia ETH.
2. Obtain or deploy Sepolia GPS helper contracts matching the Stone adapter calls.
3. Add the four `SEPOLIA_GPS_*` addresses to `packages/hardhat/.env`.
4. Run:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia-preflight
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia
```

