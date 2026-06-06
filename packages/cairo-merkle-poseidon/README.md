# Cairo Poseidon Merkle Fixture

This package mirrors `packages/cairo-merkle`, but replaces the toy algebraic hash with Cairo's standard Poseidon hash API:

```cairo
use core::poseidon::poseidon_hash_span;
```

The fixture keeps the same public input shape as the toy Merkle test:

```text
[10 11 20 0 30 1 40 0 50 1]
```

Each hash is domain separated as `[domain, left, right]`, with domain `1` for the leaf pair and `0` for internal nodes.

Expected root for the current fixture:

```text
-845960492790892884656231863041640742943145074470692494761681786972233302565
```

This is still a public test fixture. It is closer to a production primitive than the toy hash, but it is not a privacy claim for shielded transfers.

## Verified Workflow

Tested on 2026-06-06:

- `scarb build`, `scarb test`, and `scarb execute` pass for the public Poseidon Merkle fixture.
- Local `stwo_cairo_prover` proof generation and Rust verification pass with `inputs/stwo_local_params.json`.
- Blake-canonical Cairo-serde proof generation passes with `inputs/stwo_blake_canonical_params.json`.
- Local Cairo recursive verification passes with `stwo_cairo_verifier_array` and `qm31_opcode`.
- Reusable recursive-verifier task PIE validation passes for `target/local-proofs/recursive-verifier-task-pie.zip`.
- Atlantic trace generation passes for the public recursive task PIE on `declaredJobSize=L`.
- Local Stone proof generation and local Stone verification pass for the public Poseidon Merkle AIR with Cairo layout `starknet`.
- A full-bootloader Stone proof built with the legacy-GPS seed patch verifies against the deployed StarkWare GPS verifier contracts on a local Hardhat mainnet fork.

Key artifacts and values:

- local Poseidon root: `-845960492790892884656231863041640742943145074470692494761681786972233302565`
- local recursive verifier output: `3, -1575579904327646194727519362278749901481907230895578035737745130512097599097, 1, <root>`
- task PIE SHA-256: `17acdc817c1a86310238951fab2840130b835edc0fd3570d52fe2bb94781a890`
- task PIE steps: `19,455,300`
- Atlantic trace query: `01KTDRW5T557A0A4908T1V9QKC`
- Atlantic trace SHARP fact: `0x55255c62a6562c275658d89e4822731edc7f6df44ca71a1b0049b1079cacef45`
- Atlantic real L1 query: `01KTDS2CJV6BTG555N0PSD2K9H`
- Atlantic real L1 completed at: `2026-06-06T07:08:51.187Z`
- Atlantic proof job/transaction id: `01KTDS5NGMSS4W4TMKGRXAFKQ7`
- Sepolia Satellite readback: `valid: true`, `isMocked: false`
- Re-confirmed from this machine with `corepack yarn atlantic:merkle-poseidon:task-pie:resume-real`: query status `DONE`, `isFactMocked=false`, `isProofMocked=false`, and Sepolia Satellite `valid: true`.

Reusable commands:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle-poseidon:build
corepack yarn cairo:merkle-poseidon:test
corepack yarn cairo:merkle-poseidon:prove-local
corepack yarn cairo:merkle-poseidon:prove-recursive
corepack yarn cairo:merkle-poseidon:verify-recursive-local
corepack yarn cairo:merkle-poseidon:build-recursive-task-pie
corepack yarn cairo:merkle-poseidon:check-recursive-task-pie
corepack yarn cairo:merkle-poseidon:prove-stone
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:fork
corepack yarn atlantic:merkle-poseidon:task-pie:dry-run
corepack yarn atlantic:merkle-poseidon:task-pie:trace
corepack yarn atlantic:merkle-poseidon:task-pie:real
corepack yarn atlantic:merkle-poseidon:task-pie:resume-real
```

Use `declaredJobSize=L` for Atlantic. The real L1 job with `declaredJobSize=M` failed at trace generation with `OOMKilled`.

## Local Stone Proof Workflow

Tested on 2026-06-06:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle-poseidon:prove-stone
```

What this command does locally:

1. Runs the patched Scarb 2.18 `scarb-execute` with `--save-stone-air-inputs`.
2. Writes `trace.bin`, `memory.bin`, `air_public_input.json`, and `air_private_input.json` under the latest `target/execute/pq_cairo_merkle_poseidon/executionN/stone-air-inputs`.
3. Runs `tools/stone/bin/cpu_air_prover` over those local AIR inputs.
4. Runs `tools/stone/bin/cpu_air_verifier` and confirms `Proof verified successfully`.
5. If `/tmp/stark-evm-adapter` is present, creates the annotated Stone proof and adapter split-proof JSON.

Latest successful run:

```text
layout: starknet
n_steps: 131072
isPowerOfTwo: true
Stone prover time: 130.237 sec
main_proof_words: 540
trace_merkle_statements: 3
fri_merkle_statements: 8
continuous_memory_pages: 0
```

Stable generated artifacts:

```text
packages/cairo-merkle-poseidon/target/local-proofs/stone/poseidon-merkle-stone-proof.json
packages/cairo-merkle-poseidon/target/local-proofs/stone/poseidon-merkle-stone-annotation.txt
packages/cairo-merkle-poseidon/target/local-proofs/stone/poseidon-merkle-stone-extra-annotation.txt
packages/cairo-merkle-poseidon/target/local-proofs/stone/poseidon-merkle-stone-annotated-proof.json
packages/cairo-merkle-poseidon/target/local-proofs/stone/poseidon-merkle-stone-split-proofs.json
```

These artifacts remain under ignored `target/` paths. The committed reproducibility pieces are the wrapper script, the patched Scarb diff, `tools/stone`, and `tools/stark-evm-adapter/split_proof_summary.rs`.

This proves the Poseidon Merkle Cairo execution locally and verifies the Stone proof locally. It also produces the split proof data shape needed by existing StarkWare-style Ethereum verifier tooling.

## Direct Local Stone To L1 Fork Workflow

The direct verifier path needs a full-bootloader Stone proof and the legacy-GPS public-input seed patch recorded in `patches/stone-prover-legacy-gps-public-input-seed.patch`. Current upstream Stone serializes `n_verifier_friendly_commitment_layers` into the Fiat-Shamir seed, while the deployed GPS Solidity verifier derives the seed from `log_n_steps` onward. The patched binaries under `tools/stone/bin/*_legacy_gps` match the deployed verifier.

Tested on 2026-06-06 with the full-bootloader AIR inputs in `target/execute/pq_cairo_merkle_poseidon/execution26/stone-air-inputs`:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:fork
```

Successful result:

```text
Stone prover time: 56.126 sec
Proof verified successfully.
main_proof_words=540
trace_merkle_statements=3
fri_merkle_statements=8
continuous_memory_pages=1
Verified: Trace 0
Verified: Trace 1
Verified: Trace 2
Verified: FRI statement: 0..7
Verified: register continuous page: 0
Verified: Main proof gasUsed=2677410
Total verifier gas used: 6568859
```

Gas breakdown from the fork receipts: trace statements `384,250`, `397,120`, `383,950`; FRI statements `450,530`, `417,170`, `384,200`, `350,840`, `318,020`, `284,450`, `251,450`, `218,570`; continuous page registration `50,899`; main proof `2,677,410`. The total was `6,568,859` gas across 13 transactions.

This is a local mainnet-fork verifier test, not a Sepolia transaction. It exercises the deployed mainnet GPS verifier bytecode through Hardhat fork state, with proof generation kept local and only proof/public verification data submitted to the fork.


## Direct Sepolia Target

A preflighted Sepolia wrapper is available:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia-preflight
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia
```

Required env vars, usually in `packages/hardhat/.env`:

```text
SEPOLIA_RPC_URL=...
STONE_SEPOLIA_PRIVATE_KEY=...
SEPOLIA_GPS_MAIN_VERIFIER=...
SEPOLIA_GPS_MEMORY_PAGE_FACT_REGISTRY=...
SEPOLIA_GPS_TRACE_CONTRACT=...
SEPOLIA_GPS_FRI_CONTRACT=...
```

Current status on 2026-06-06: the configured Sepolia RPC has bytecode at the documented SHARP verifier `0x07ec0D28e50322Eb0C159B9090ecF3aeA8346DFe`, but no bytecode at the mainnet-fork adapter helper addresses. The direct split-proof path therefore needs either published Sepolia GPS helper addresses or a Sepolia deployment of the helper verifier set. The Atlantic/Satellite path has already verified this public fixture on Sepolia, but that route uses remote proving and is not the local-private-prover target.

The throwaway Sepolia gas address generated for this path is `0x6b6Ea75fCEE3c55DD881cFF70CF80C5375eB3395`; its private key is stored only in the ignored local `packages/hardhat/.env`. When checked, it had `0` Sepolia ETH. The documented Sepolia SHARP verifier and Starknet Core contracts both have bytecode, but neither exposes the adapter entrypoints `verifyProofAndRegister`, `registerContinuousMemoryPage`, `verifyMerkle`, or `verifyFRI`, so they are not enough by themselves for direct local Stone proof submission.
