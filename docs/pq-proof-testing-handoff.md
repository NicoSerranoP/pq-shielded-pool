# Post-Quantum Proof Testing Handoff

Last updated: 2026-06-05

This document is the working handoff for people and agents building the proof path for post-quantum private transfers in this repository. It records what has been verified locally, what has been verified through Atlantic/Sepolia fact registration, and what is still blocked before we can honestly claim end-to-end L1 verification of locally generated private-transfer proofs.

## Current Position

The local proving architecture is the right direction for privacy: user-sensitive witnesses must stay on the local device, and only public outputs or public proof artifacts should leave it. The current Cairo Merkle fixture proves and verifies locally through Stwo. The locally generated STARK proof is also accepted by the Cairo recursive verifier locally.

What we can say now:

- Local Cairo Merkle execution works for the fixture root `823984307`.
- Local Stwo proof generation and Rust verification work for the Cairo Merkle executable.
- Local Cairo recursive verification of the generated Stwo proof works through `stwo_cairo_verifier_array`.
- A plain public Cairo Merkle fixture can be submitted to Atlantic and checked through mocked Sepolia Satellite fact registration.

What we cannot say yet:

- We cannot yet say the recursive verifier proof is accepted on Ethereum L1. Atlantic currently fails while running the generated stwo Cairo verifier artifact.
- We should not describe the current proof artifact as production-private. Stwo Cairo is not zero-knowledge by default, so proof/public-memory leakage still needs a privacy audit or a hiding/recursive architecture.

A careful external statement would be: the local post-quantum STARK proving path works, and the intended L1 route is to verify a public recursive-verifier statement through SHARP/Atlantic once the current Atlantic runner compatibility issue is resolved.

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

Plain public Merkle fixture through mocked Atlantic/Sepolia fact registration:

- Status: passes.
- Recent query: `01KTC3MD2EGNZD471B9K2HFJ45`.
- Sepolia Satellite readback was valid for mocked fact `0x5c8a7cde7edd32c893a8e6d28cbaf1c1bb77faa56c9a06c6eaeedbe341f7eb8c`.
- This proves the basic Cairo program -> Atlantic fact -> Satellite read path for a public fixture.

Large-input Atlantic diagnostic:

- Status: passes.
- Query: `01KTC47696VNVG0YWRKRG3SXHM`.
- The diagnostic echo program accepted the same 114,691-felt public proof input.
- This suggests the failing recursive-verifier jobs are not failing merely because the input file is large.

Recursive stwo Cairo verifier through Atlantic:

- Status: still blocked for full recursive verification.
- Failure point: `TRACE_AND_METADATA_GENERATION`.
- Error: `Error: Failed to run cairo1 rust vm: VirtualMachine(Unexpected)`.

Important narrowed findings from 2026-06-05:

- Dev-profile single-target constant diagnostic passed through Atlantic and mocked Sepolia Satellite.
  - Package: `atlantic_stwo_constant`
  - Query: `01KTC87835DRKAT345A3E8PQGT`
  - Fact: `0xd898f334df46089d17634b3085e1761bcc9d0d91e0b76103fc1fe2fbb8d44366`
- Dev-profile single-target `CairoProof` deserialization diagnostic passed through Atlantic and mocked Sepolia Satellite.
  - Package: `atlantic_stwo_deserialize`
  - Query: `01KTC89PFHPMGNPFMBF9TXZFRK`
  - Fact: `0xa3f75c7771ff38a98a45bc986fc4f3de01cf7f6a2fc2e742ab33c3dce204e663`
- Dev-profile single-target full verifier still fails during trace generation, even before proof generation.
  - Package: `atlantic_stwo_verify`
  - `M`, trace-only: `01KTC8JACE479015Z18T0J3XZT`
  - `L`, trace-only: `01KTC8QBVRZV9QEKK0C0CMZ46Q`

Earlier failing diagnostics:

- Proving-profile deserialize-only verifier diagnostics with `layout=auto` failed for all tested job sizes:
  - `S`: `01KTC4W0V9Q8M6E1F41DTMZWHX`
  - `M`: `01KTC4Z43TJ4NMH4QVVRXSHEHE`
  - `L`: `01KTC52ADTPC24H0FJ0PFDQX17`
- Full verifier retry with explicit `layout=all_cairo` failed: `01KTC63E3YGMY4EFASMAYZBXAS`.
- Single executable Sierra artifacts also failed, including a tiny constant target. The successful diagnostics used normal package `*.sierra.json` artifacts built with the dev profile.

Current interpretation:

- This is not a raw input-size issue: the echo diagnostic and the stwo deserialization diagnostic both accepted the 114,691-felt proof input through Atlantic.
- This is not just executable selection: single-target packages avoid multi-executable ambiguity.
- This is not just declared job size: full verifier trace generation failed with both `M` and `L`.
- The current blocker appears to be Atlantic's Cairo VM execution of the heavy `verify_cairo` path itself. The minimal support repro should include one passing deserialization query and one failing full-verifier trace query.

Diagnostic commands:

```sh
cd packages/stwo-cairo/stwo_cairo_verifier
source /home/yavor/.bashrc
scarb build --package atlantic_stwo_constant --features poseidon252_verifier
scarb build --package atlantic_stwo_deserialize --features poseidon252_verifier
scarb build --package atlantic_stwo_verify --features poseidon252_verifier
```

Use `packages/hardhat/scripts/submitAtlanticMerkle.mjs --result TRACE_GENERATION` for trace-only debugging before asking Atlantic to prove/register a fact.

## Atlantic Credits Interpretation

This does not currently look like a credit/quota issue. The failed jobs are accepted by Atlantic, enter `TRACE_AND_METADATA_GENERATION`, and then fail with a Cairo VM runtime error.

Herodotus documentation says `declaredJobSize` affects the trace-generation machine and query cost. Their pricing page currently lists trace generation at 1 credit per started minute, proof generation by step-size bucket, and testnet proof verification as free. So repeated diagnostics can consume credits, but a credit problem should look like a quota/payment/submission rejection, not `VirtualMachine(Unexpected)` inside the Cairo runner.

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

## Recommended Next Steps

1. Send Herodotus/Atlantic support the passing dev-profile deserialization query `01KTC89PFHPMGNPFMBF9TXZFRK` and failing full-verifier trace queries `01KTC8JACE479015Z18T0J3XZT` and `01KTC8QBVRZV9QEKK0C0CMZ46Q`.
2. Ask whether Atlantic's Cairo1 Rust VM currently supports the generated `verify_cairo` path from `stwo_cairo_air`, and whether there are VM logs behind `VirtualMachine(Unexpected)`.
3. If support cannot unblock it quickly, split `verify_cairo` into smaller trace-only diagnostics around claim verification, channel mixing, commitment unpacking, and FRI verification to isolate the exact failing subroutine.
4. Keep developing private-transfer Cairo programs against the local proof workflow while treating L1 recursive verification as a currently blocked integration item.
5. Replace the toy hash in transfer-relevant circuits with a production hash, then repeat local proving and local recursive verification before any remote submission.
6. Add a privacy/leakage review before using any proof artifact from real transfer witnesses as public data.
