# STARK EVM Adapter Helpers

This directory holds small helper files used with a local checkout of zkSecurity's `stark-evm-adapter`.

## `split_proof_summary.rs`

Copy this file into `/tmp/stark-evm-adapter/examples/split_proof_summary.rs` and run it with:

```sh
ANNOTATED_PROOF=/path/to/poseidon-merkle-stone-annotated-proof.json \
SPLIT_PROOF_OUT=/path/to/poseidon-merkle-stone-split-proofs.json \
cargo run -q --example split_proof_summary
```

The Poseidon Merkle Stone wrapper script does this automatically when `/tmp/stark-evm-adapter` is available:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone
```

The helper converts an annotated Stone proof into the split-proof structure expected by the adapter's Solidity verifier flow and prints a compact summary.


## `verify_split_proof_custom.rs`

Copy this file into `/tmp/stark-evm-adapter/examples/verify_split_proof_custom.rs` and run it against a local mainnet fork with:

```sh
URL=http://127.0.0.1:8545 \
SPLIT_PROOF=/path/to/poseidon-merkle-full-bootloader-legacy-gps-stone-split-proofs.json \
TASK_METADATA_MODE=bootloader \
FACT_TOPOLOGIES=/path/to/stone-full-bootloader-fact-topologies.json \
cargo run -q --example verify_split_proof_custom
```

The helper submits the split trace, FRI, memory-page, and main-proof transactions expected by the StarkWare GPS verifier contracts. The Poseidon Merkle legacy-GPS wrapper runs this automatically when `STONE_VERIFY_ON_FORK=true`.

## Full-Bootloader Scarb Hook

The local shielded-pool transfer verifier run used a patched Scarb 2.18 `scarb-execute` binary that can emit Stone AIR for bootloader-target execution. The rebuildable patch is preserved at `patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch`.

The compiled bootloader JSON used by that patch is preserved at `tools/stark-evm-adapter/bootloader/test_compiled_bootloader.json`. The rebuild script copies the committed bootloader JSON into the Scarb checkout before applying the patch, so clean rebuilds no longer depend on `/tmp/stark-evm-adapter` state.
