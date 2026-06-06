# Post-Quantum Proof Testing Handoff

Last updated: 2026-06-06

This document is the working handoff for people and agents building the proof path for post-quantum private transfers in this repository. It records what has been verified locally, what has been verified through Atlantic/Sepolia fact registration, and what remains before we can honestly claim production-private transfer proofs.

## Current Position

See `docs/atlantic-stwo-bug-log.md` for the current detailed Atlantic/Stwo bug inventory, query IDs, and workarounds.

The local proving architecture is the right direction for privacy: user-sensitive witnesses must stay on the local device, and only public outputs or public proof artifacts should leave it. The current Cairo Merkle fixture proves and verifies locally through Stwo. The locally generated STARK proof is also accepted by the Cairo recursive verifier locally.

What we can say now:

- Local Cairo Merkle execution works for the fixture root `823984307`.
- Local Stwo proof generation and Rust verification work for the Cairo Merkle executable.
- Local Cairo recursive verification of the generated Stwo proof works through `stwo_cairo_verifier_array`.
- The full recursive verifier task PIE completes Atlantic trace generation on an `L` worker.
- The recursive verifier fact is registered on mocked Sepolia and the Satellite registry returns `valid: true`.
- The same public recursive-verifier task PIE is verified through real non-mocked Sepolia L1 fact registration, and the Satellite registry returns `valid: true` with `isMocked: false`.

What we cannot say yet:

- We should not describe the current proof artifact as production-private. Stwo Cairo is not zero-knowledge by default, so proof/public-memory leakage still needs a privacy audit or a hiding/recursive architecture.
- We should not describe the toy Merkle statement as production cryptography. The application hash is still a toy fixture.

A careful external statement is: local STARK proving, local recursive verification, Atlantic trace generation, and real Sepolia L1 fact registration all work for the public toy Merkle recursive-verifier fixture. Production-private transfers still require a proof-leakage review and a production hash/public-output statement.

## Privacy Rules

Never upload private shielded-pool witnesses to Atlantic or any other managed prover. Sensitive values include note secrets, note randomness, private balances, private Merkle paths, private preimages, and unpublished nullifier material.

The current Atlantic helper intentionally blocks non-fixture uploads unless `--allow-remote-witness-upload` is supplied. That flag is only acceptable for public fixtures and public diagnostic artifacts.

The current recursive-verifier experiments upload a serialized proof and verifier program, not the original private witness. For the present toy fixture the proof is public test data. Before using this for real transfers, audit whether the Stwo proof or Cairo public memory reveals more than the intended public statement.

## Reusable Local Commands

Generate and verify the local Merkle STARK proof with the pinned Scarb 2.15 binary used by the current stwo-cairo prover checkout:

```sh
SCARB_BIN=/tmp/scarb-v2.15.0-x86_64-unknown-linux-gnu/bin/scarb corepack yarn cairo:merkle:prove-local
```

Expected application output:

```text
Program output:
1
823984307
...
Local Merkle proof generated and verified: packages/cairo-merkle/target/local-proofs/merkle-proof.json
```

Prepare the local recursive verifier inputs from a Cairo-serde proof:

```sh
corepack yarn cairo:merkle:prepare-recursive-inputs
```

This writes:

- `packages/cairo-merkle/target/local-proofs/merkle-proof.poseidon.cairo-serde.array-args.json`
- `packages/cairo-merkle/target/local-proofs/merkle-proof.poseidon.cairo-serde.atlantic.decimal.txt`

Run the local Cairo recursive verifier:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle:verify-recursive-local
```

Build and validate the reproducible public recursive-verifier task PIE used for Atlantic/Sepolia:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle:build-recursive-task-pie
corepack yarn cairo:merkle:check-recursive-task-pie
```

The build script writes the stable ignored artifact:

```text
packages/cairo-merkle/target/local-proofs/recursive-verifier-task-pie.zip
```

If the task PIE already exists but the build log is unavailable, validate the archive-only invariants with:

```sh
node packages/cairo-merkle/scripts/check-recursive-task-pie.mjs --no-log-check
```

Expected verifier output with the current fixture:

```text
Program output:
3
-1210432837679171818288727564040993199151119840003011262996498487688464571055
1
823984307
Resources:
  steps: 17,582,452
```

The output means:

1. returned array length is `3`,
2. first payload value is the verifier program hash,
3. second payload value is the original Cairo program output length `1`,
4. third payload value is the Merkle root `823984307`.

## Current L1 And Atlantic Results

Correct Cairo task PIE trace generation:

- Status: passes on a sufficiently large worker.
- Public smoke PIE: `01KTDC9B4VDVVMCFF2KSGHASKE`.
- Full recursive verifier, trace-only `L`: `01KTDCJHAK2QHS0TVAC5JF1VTJ`.
- Full task PIE SHA-256: `74ee9e6665e18e25dd871f728b74e3ba98f46742fd053293d3903022bad2ee37`.
- Atlantic metadata ends with verifier hash, output length `1`, and root `823984307`.
- SHARP fact: `0x8a9e6885e08b0f85b16114cd889b05219485649a1988a73e377911bd2eac5e6f`.

Mocked Sepolia recursive-verifier fact registration:

- Status: passes.
- Query: `01KTDCP8TXTDXRSTEBZ5SFQ541`.
- Sepolia Satellite: `0x396bF739f7b37D81f6CdD4571fDEF298150db88f`.
- Readback: `valid: true`, `isMocked: true`.

Real proof-backed Sepolia registration:

- Status: passes.
- Query: `01KTDCSWGYZAGANJZYY4E3MDGF`.
- Completed at: `2026-06-06T04:03:16.648Z`.
- Proof job/transaction id: `01KTDCWKTKZWTPP135JDHPZGHK`.
- Result: `PROOF_VERIFICATION_ON_L1`, `chain=L1`, `isFactMocked=false`, `isProofMocked=false`.
- Sepolia Satellite: `0x396bF739f7b37D81f6CdD4571fDEF298150db88f`.
- Readback: `valid: true`, `isMocked: false`.
- Metadata program hash: `0x0288ba12915c0c7e91df572cf3ed0c9f391aa673cb247c5a208beaa50b668f09`.
- Output hash: `0xb5f4a995135dac40e3888d5e086392559ba5b7bbc7fabb65dc5bf3a5ebc37faf`.
- SHARP fact: `0x8a9e6885e08b0f85b16114cd889b05219485649a1988a73e377911bd2eac5e6f`.

Re-read this completed query without uploading anything:

```sh
corepack yarn atlantic:merkle:task-pie:resume-real
```

Worker-size behavior for the 16,965,079-step task PIE:

- `S` OOM-killed: `01KTDCF7WKFHZXSJZ7Q7BZCTZV`.
- `M` OOM-killed: `01KTDCGVV981506JQVMGZT6RPR`.
- `L` completed trace generation: `01KTDCJHAK2QHS0TVAC5JF1VTJ`.

Artifact-shape result:

- Scarb bootloader-target PIEs are nested bootloader executions and fail when Atlantic bootloads them again.
- The working artifact executes the Cairo1 executable `Bootloader` entrypoint directly in VM execution mode and serializes that task execution as PIE.
- Reproducible Scarb 2.18 patch: `patches/scarb-2.18.0-cairo1-task-pie.patch`.
- Detailed failures and query IDs: `docs/atlantic-stwo-bug-log.md`.

## Atlantic Credits Interpretation

The observed failures were not credit/quota failures. Atlantic accepted them and returned concrete artifact-shape, Cairo VM, or `OOMKilled` errors. The real proof-backed query was accepted and completed successfully; no quota or payment error was reported.

Herodotus documentation says `declaredJobSize` affects the trace-generation machine and query cost. Repeated diagnostics and real proof generation can consume credits even on testnet. Diagnose a credit problem only from an explicit quota, balance, payment, or submission rejection; do not infer one from a VM error, worker OOM, or a long-running healthy proof job.

References:

- Herodotus pricing: https://docs.herodotus.cloud/atlantic-api/pricing
- Herodotus sending-query docs: https://docs.herodotus.cloud/atlantic/sending-query

## How To Adapt This For Transfer Programs

For the next private-transfer program, use the Cairo Merkle fixture as a scaffold but do not copy its toy statement blindly.

1. Write the Cairo program as `fn main(input: Array<felt252>) -> Array<felt252>`.
2. Keep private witness values in the local input file only.
3. Return only public protocol values from `main`, such as old root, new root, nullifier hash, output commitments, public amount if any, chain id, pool id, and domain separator.
4. Prove locally with the stwo-cairo `run_and_prove` path. Adapt `packages/cairo-merkle/scripts/prove-local-stwo.sh` for the new package/program path.
5. Verify locally with the Rust verifier.
6. Produce a Cairo-serde proof and verify it locally with the Cairo recursive verifier.
7. Only after the proof/public-output leakage model is audited, submit public recursive-verifier artifacts to Atlantic or another L1 route.
8. Do not submit raw private transfer witnesses to Atlantic.

## Poseidon Merkle Fixture Status

The repository now includes a stronger public Merkle fixture in `packages/cairo-merkle-poseidon`. It uses Cairo core Poseidon via `core::poseidon::poseidon_hash_span` and domain-separates leaf and node hashes as `[domain, left, right]`.

Verified locally on 2026-06-06:

- Cairo build/test/execute pass for the fixture root `-845960492790892884656231863041640742943145074470692494761681786972233302565`.
- Local Stwo proof generation and Rust verification pass.
- Blake-canonical Cairo-serde proof generation produces `254292` proof felts.
- Local Cairo recursive verification passes and outputs verifier hash, output length `1`, and the Poseidon root.
- The recursive verifier task PIE validates locally with SHA-256 `17acdc817c1a86310238951fab2840130b835edc0fd3570d52fe2bb94781a890` and `19,455,300` Cairo VM steps.
- Atlantic trace generation passes: query `01KTDRW5T557A0A4908T1V9QKC`, SHARP fact `0x55255c62a6562c275658d89e4822731edc7f6df44ca71a1b0049b1079cacef45`.

Current L1 status:

- Real Sepolia L1 query `01KTDS0C9WCMN1FWJFTYDQ27EZ` with `declaredJobSize=M` failed with `OOMKilled`; use `L` for this Poseidon recursive verifier.
- Real Sepolia L1 query `01KTDS2CJV6BTG555N0PSD2K9H` with `declaredJobSize=L` passed. It completed at `2026-06-06T07:08:51.187Z`, proof job/transaction id `01KTDS5NGMSS4W4TMKGRXAFKQ7`, SHARP fact `0x55255c62a6562c275658d89e4822731edc7f6df44ca71a1b0049b1079cacef45`, and Sepolia Satellite readback `valid: true` with `isMocked: false`. Resume/read it without upload using `corepack yarn atlantic:merkle-poseidon:task-pie:resume-real`.
## Recommended Next Steps

1. Turn the tested Scarb patch into a maintained wrapper or upstream contribution instead of depending on a manually patched `/tmp` clone.
2. Keep all transfer witness proving local. Submit only audited public recursive-verifier artifacts.
3. Replace the toy transfer hash with the selected production hash and repeat local proof, local recursive verification, task-PIE validation, Atlantic trace generation, and L1 registration.
4. Complete a proof/public-memory leakage review before using real private-transfer proof artifacts.
5. For larger programs, start with `corepack yarn cairo:merkle:build-recursive-task-pie` and `corepack yarn cairo:merkle:check-recursive-task-pie`, then run a trace-only Atlantic query before spending credits on real L1 verification.
