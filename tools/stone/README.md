# Stone Prover Tooling

This directory contains the Stone binaries and verifier/prover configs used by the local final-proof experiment for the public Poseidon Merkle fixture.

## Binaries

The checked-in binaries were downloaded on 2026-06-06 from the latest `dipdup-io/stone-packaging` release, which resolved to `v3.0.3`:

- `tools/stone/bin/cpu_air_prover`
- `tools/stone/bin/cpu_air_verifier`

A second checked-in pair was built locally on 2026-06-06 from `starkware-libs/stone-prover` with `patches/stone-prover-legacy-gps-public-input-seed.patch` applied:

- `tools/stone/bin/cpu_air_prover_legacy_gps`
- `tools/stone/bin/cpu_air_verifier_legacy_gps`

Use the legacy-GPS pair for direct verification through the currently deployed StarkWare GPS verifier contracts. Use the upstream/current pair for normal local Stone proofs that do not need deployed-GPS public-input seed compatibility.

Checksums:

```text
ec33129a15b888b7946f17fe46ca888bfed2f4d86ac4e3fc7fae787f8162ca9e  tools/stone/bin/cpu_air_prover
f83d66f5f9cd60c070fee02524d4ccb86b1c37865d75c022fbd54c349d7d972b  tools/stone/bin/cpu_air_verifier
ed44efa4c191f90d7c5dfc7bd09069a3421e0c422f46abe2ae9ba3e50ed28491  tools/stone/bin/cpu_air_prover_legacy_gps
d1b352dbac6a4fc39f01fc63f166c8d9eb7cc7452ae67c6ab274053494d95d09  tools/stone/bin/cpu_air_verifier_legacy_gps
```

They are committed so the team can reproduce the local Stone proof path without relying on system-wide installs. `/tmp` was mounted `noexec` on the test machine, so downloaded binaries had to be copied into this repository before they could run.

## Config

The configs were copied from the zkSecurity `stark-evm-adapter` bootloader example:

- `tools/stone/config/cpu_air_prover_config.json`
- `tools/stone/config/cpu_air_params_starknet_2p21.json`

The tested Poseidon Merkle AIR uses Cairo layout `starknet`, `n_steps=131072`, and these `2^21` Stone parameters.

## Repro Command

From the repository root:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone
```

This runs Cairo locally, writes Stone AIR inputs locally, proves locally with `cpu_air_prover`, verifies locally with `cpu_air_verifier`, and then produces adapter-friendly annotated/split proof files when `/tmp/stark-evm-adapter` is available.

For the direct deployed-GPS-compatible path, first generate full-bootloader Stone AIR inputs, then run:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps
```

If a local mainnet fork is listening on `http://127.0.0.1:8545`, also run the verifier transactions:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:fork
```

Tested result on 2026-06-06: trace decommitments, FRI decommitments, continuous page registration, and `Verified: Main proof` all passed against the deployed StarkWare GPS verifier contracts on a local Hardhat mainnet fork.
