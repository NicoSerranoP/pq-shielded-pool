# Cairo Shielded Pool Statements

This package is the first Cairo/STARK-side replacement path for the provekit verifier used by `ShieldedPool`.

It exposes three executable statements:

- `pq_cairo_shielded_pool_deposit`
- `pq_cairo_shielded_pool_transfer`
- `pq_cairo_shielded_pool_withdraw`

Each statement emits the public output convention consumed by `packages/hardhat/contracts/CairoShieldedPoolVerifier.sol`.

## Output Convention

Cairo serializes a returned `Array<felt252>` as `[len, ...values]`. The registered fact and Solidity adapter use that full serialized output.

Deposit:

```text
[4, 1, amount, assetId, commitment]
```

Transfer:

```text
[6, 2, root, inputNullifier, 2, outputCommitment0, outputCommitment1]
```

Withdraw:

```text
[5, 3, root, inputNullifier, uint160(recipient), amount]
```

## Current Scope

This package is an executable Cairo statement layer, not yet the final production private-transfer circuit. Current constraints:

- note commitment: Poseidon over `[NOTE_COMMITMENT_DOMAIN, value, owner, nonce]`
- nullifier: Poseidon over `[NULLIFIER_DOMAIN, value, owner, nonce]`
- Merkle proof: fixed maximum depth `30`, encoded as `(index, sibling)` pairs
- transfer: exactly two output notes
- note values: `u128`

The Solidity adapter verifies only registered Cairo facts whose public outputs exactly match the pool calldata.

## Commands

From the repository root:

```sh
corepack yarn cairo:shielded-pool:build
corepack yarn cairo:shielded-pool:test
corepack yarn cairo:shielded-pool:execute:deposit
corepack yarn cairo:shielded-pool:execute:transfer
corepack yarn cairo:shielded-pool:execute:withdraw
corepack yarn cairo:shielded-pool:prove-stone:deposit
corepack yarn cairo:shielded-pool:prove-stone:transfer
corepack yarn cairo:shielded-pool:prove-stone:withdraw
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer:fork
```

From this package directly:

```sh
scarb build
scarb test
scarb execute --executable-name pq_cairo_shielded_pool_deposit --arguments-file inputs/deposit_args.json --print-program-output --output none --target standalone
scarb execute --executable-name pq_cairo_shielded_pool_transfer --arguments-file inputs/transfer_args.json --print-program-output --output none --target standalone
scarb execute --executable-name pq_cairo_shielded_pool_withdraw --arguments-file inputs/withdraw_args.json --print-program-output --output none --target standalone
```

## Local Stone Proof Status

The `prove-stone` scripts use the patched Scarb 2.18 `scarb-execute` binary at `/tmp/scarb-2.18.0/target/debug/scarb-execute` to emit Stone AIR inputs, then run the repo-local Stone prover and verifier under `tools/stone/bin`. This path is local only: it does not submit witnesses, traces, AIR, or proofs to Atlantic or another remote service.

Verified locally on 2026-06-06 machine time:

| Statement | Trace steps | Public memory | Prover time | Proof artifact |
| --- | ---: | ---: | ---: | --- |
| deposit | `131072` | `459` | `139.446 sec` | `target/local-proofs/stone/deposit-stone-proof.json` |
| transfer | `131072` | `986` | `105.878 sec` | `target/local-proofs/stone/transfer-stone-proof.json` |
| withdraw | `131072` | `813` | `67.8696 sec` | `target/local-proofs/stone/withdraw-stone-proof.json` |

Each run ended with `Proof verified successfully.` from `cpu_air_verifier`.

Proof artifacts are intentionally under ignored `target/` directories. Re-run the corresponding `prove-stone` command to regenerate them.

## Full-Bootloader L1 Fork Verification

The direct deployed-GPS verifier path needs full-bootloader AIR and the legacy-GPS Stone binaries. The transfer statement was verified through the deployed StarkWare GPS verifier contracts on a local Hardhat mainnet fork on 2026-06-06 machine time.

Reproduction shape:

```sh
corepack yarn workspace @se-2/hardhat hardhat node --network hardhat --fork https://mainnet.rpc.buidlguidl.com --no-deploy
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer:fork
```

The proof generation remains local. The fork command submits only proof/public verifier calldata to the forked deployed contracts.

Latest verified transfer result:

- full-bootloader AIR: `layout=starknet`, `n_steps=131072`, `publicMemory=760`
- topology: one continuous memory page with `page_sizes=[7]`
- local legacy-GPS prover time through the wrapper: `43.8799 sec`
- split proof summary: `main_proof_words=540`, `trace_merkle_statements=3`, `fri_merkle_statements=8`, `continuous_memory_pages=1`
- local fork verifier total: `6,612,319` gas across `13` transactions
- final fork result: `Verified: Main proof gasUsed=2677661`

Fork gas breakdown:

- trace statements: `387,960`, `400,680`, `387,960`
- FRI statements: `454,180`, `421,090`, `387,820`, `354,580`, `321,670`, `288,250`, `254,890`, `222,160`
- continuous page registration: `53,418`
- main proof: `2,677,661`

Full-bootloader AIR generation depends on the patched Scarb binary built by `corepack yarn scarb:build-patched-execute`. The rebuildable patch is `patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch`, and the bootloader JSON it uses is preserved at `tools/stark-evm-adapter/bootloader/test_compiled_bootloader.json`. A fresh rebuild was validated by generating transfer AIR with `layout=starknet`, `n_steps=131072`, and `publicMemory=760`.
