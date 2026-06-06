# Cairo Merkle Proof to L1 Verification Workflow

This document is the planned end-to-end path for proving a Cairo Merkle proof program and having the result accepted by an Ethereum L1 verifier. The intended production direction is Cairo program -> SHARP/S-two proof -> Ethereum fact registry check. This is independent from ProveKit and from the local custom Stwo AIR examples.

## Current Decision

See `docs/atlantic-stwo-bug-log.md` for the current detailed Atlantic/Stwo bug inventory, query IDs, and workarounds.

For L1 verification, prefer the Cairo/SHARP/Atlantic path instead of custom local Stwo AIR proofs.

Reason: SHARP already has an Ethereum verifier flow for Cairo program executions. A custom Stwo AIR proof is useful for local experiments, but it is not directly accepted by SHARP's deployed L1 verifier unless it is wrapped into the Cairo/SHARP pipeline.

## Local Proof-of-Proof L1 Route Investigation

Status on 2026-06-06: local Stone proving and local Stone verification work in this repository for the public Poseidon Merkle fixture. The full-bootloader legacy-GPS Stone proof also verifies through the deployed StarkWare GPS verifier contracts on a local Hardhat mainnet fork.

"Proof of a proof" is the right abstraction here. It is STARK recursion: prove the private Merkle statement locally, run a Cairo verifier that checks that proof, then prove the verifier execution and register only the resulting public fact on Ethereum L1.

The repository already performs the first recursive layer locally:

1. Generate the Merkle STARK proof locally with `stwo_cairo_prover`.
2. Verify that proof locally inside the Cairo recursive verifier.
3. Build a Cairo task PIE for that verifier execution.

The current Atlantic route performs the final proving step remotely. That is acceptable for the public toy fixtures, but it is not the production privacy target. For private transfers, the desired route is local final proving followed by L1 verification only.

The most concrete lead for avoiding custom Solidity verifier work is zkSecurity STARK-EVM adapter:

- Repository: https://github.com/zksecurity/stark-evm-adapter
- Purpose: convert StarkWare Stone prover outputs into the split-proof calldata structure expected by StarkWare Ethereum verifier contracts.
- Local smoke test: `cargo test -q` passed in `/tmp/stark-evm-adapter` on 2026-06-06.
- Required inputs are Stone-specific: `cpu_air_prover --out_file` JSON proof, `cpu_air_verifier --annotation_file`, `cpu_air_verifier --extra_output_file`, and fact-topology data.

Important limitation: the adapter does not currently accept the JSON proof emitted by our `stwo_cairo_prover` path. It expects Stone proof and annotation outputs. So this is not a drop-in replacement for Atlantic yet.

Local Stone result for the public Poseidon Merkle fixture:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone
```

This command completed on 2026-06-06. It runs the patched Scarb 2.18 executable locally with `--save-stone-air-inputs`, then runs repo-local Stone proving and verification binaries. The successful run produced:

- Cairo layout: `starknet`
- AIR steps: `131072`
- Stone prover time: `130.237 sec`
- local verifier result: `Proof verified successfully`
- adapter split proof summary: `main_proof_words=540`, `trace_merkle_statements=3`, `fri_merkle_statements=8`, `continuous_memory_pages=0`

The generated proof artifacts are under the ignored directory `packages/cairo-merkle-poseidon/target/local-proofs/stone/`. The committed reproducibility pieces are `packages/cairo-merkle-poseidon/scripts/prove-local-stone.sh`, `patches/scarb-2.18.0-cairo1-task-pie.patch`, `tools/stone/`, and `tools/stark-evm-adapter/split_proof_summary.rs`.

Direct deployed-GPS-compatible Stone result:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:fork
```

This path uses the full-bootloader Stone AIR inputs and the patched binaries `tools/stone/bin/cpu_air_prover_legacy_gps` and `tools/stone/bin/cpu_air_verifier_legacy_gps`. The patch is recorded at `patches/stone-prover-legacy-gps-public-input-seed.patch` and removes the current Stone-only leading `n_verifier_friendly_commitment_layers` seed word so that the proof matches the deployed GPS Solidity verifier public-input hash.

Successful local mainnet-fork verifier result on 2026-06-06:

- Stone prover time: `56.126 sec`
- local verifier result: `Proof verified successfully`
- adapter split proof summary: `main_proof_words=540`, `trace_merkle_statements=3`, `fri_merkle_statements=8`, `continuous_memory_pages=1`
- fork verifier result: trace statements `0..2` verified, FRI statements `0..7` verified, continuous page `0` registered, and `Verified: Main proof`

This is stronger than the Atlantic remote-proving flow for privacy because proof generation stays local. It is still a local fork test, not a Sepolia transaction, and it does not by itself prove that the proof artifact is zero-knowledge for private transfers.

Sepolia direct-verification preflight:

```sh
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia-preflight
corepack yarn cairo:merkle-poseidon:prove-stone-legacy-gps:sepolia
```

The wrapper requires a funded testnet key and Sepolia addresses for the GPS main verifier, memory-page registry, trace Merkle statement contract, and FRI statement contract. A check against the configured `SEPOLIA_RPC_URL` on 2026-06-06 found:

- Ethereum Sepolia chain id: `0xaa36a7`
- documented Sepolia SHARP verifier `0x07ec0D28e50322Eb0C159B9090ecF3aeA8346DFe`: code present
- local-fork adapter default helper addresses: no code on Sepolia
- StarkEx mainnet SHARP helper addresses: no code on Sepolia

So direct local-proof-to-Sepolia verification is not yet complete. We need either the Sepolia helper addresses that match the adapter flow, or we need to deploy a test GPS verifier/helper set to Sepolia using a funded testnet key.

Local machine prerequisites checked on 2026-06-06:

- `anvil`: not found, even after `source /home/yavor/.bashrc`
- `forge`: not found, even after `source /home/yavor/.bashrc`
- `cpu_air_prover`: now committed at `tools/stone/bin/cpu_air_prover`
- `cpu_air_verifier`: now committed at `tools/stone/bin/cpu_air_verifier`
- `packages/hardhat/.env`: has `SEPOLIA_RPC_URL`, but no mainnet RPC variable for the adapter fork demo

Remaining checks before this is production-ready:

1. Make full-bootloader AIR generation reproducible from a clean checkout, not only from the patched local Scarb/proving-utils tree used during this debugging session.
2. Repeat the same local Stone plus direct GPS verifier route for the final private-transfer statement, not only the public Poseidon Merkle fixture.
3. Decide whether production will submit direct GPS verifier calldata, Satellite fact checks, or both.
4. Audit proof/public-memory leakage before using this with private witnesses.
5. Confirm that the deployed verifier path remains purely STARK/FRI based and does not add a non-post-quantum wrapper.

This is now a credible production architecture candidate: local private proving, then public L1 verification through existing StarkWare verifier contracts. It avoids uploading private witnesses to Atlantic and avoids writing a custom verifier contract, but it still needs clean reproducibility and privacy review before real transfers.

## Privacy Verdict

The Atlantic workflow used in this repository is remote proving, not local proving. It uploads `programFile` and `inputFile` to `https://atlantic.api.herodotus.cloud/atlantic-query` as multipart form fields. That means private Merkle witnesses, note secrets, nullifiers before publication, path siblings, or any other sensitive transfer data must not be submitted through this path.

For our shielded-pool production goal, proof generation must happen locally or inside a privacy model we explicitly trust. The only artifact sent to a remote service or chain should be a proof plus public outputs/facts. The current Atlantic flow is acceptable only for the public toy fixture and L1 verifier integration experiments.

The script `packages/hardhat/scripts/submitAtlanticMerkle.mjs` now enforces this by default: it only submits the known public toy fixture hashes or the known public recursive task PIE hash. Any non-fixture upload requires the explicit `--allow-remote-witness-upload` flag or `ATLANTIC_ALLOW_REMOTE_WITNESS_UPLOAD=true`, and that override must not be used with private shielded-pool witnesses.


## Local Stwo Prover Path

We now have a local proof-generation smoke test for the Cairo Merkle executable. This path runs entirely on the local machine:

```sh
SCARB_BIN=/tmp/scarb-v2.15.0-x86_64-unknown-linux-gnu/bin/scarb corepack yarn cairo:merkle:prove-local
```

What it does:

1. Builds `packages/cairo-merkle` with Scarb/Cairo 2.15.0, matching the current `stwo-cairo` prover dependency pins.
2. Executes the Merkle program locally and confirms the public output root `823984307`.
3. Runs `packages/stwo-cairo/stwo_cairo_prover/target/release/run_and_prove` locally with `--program_type executable` and `--verify`.
4. Writes the proof to `packages/cairo-merkle/target/local-proofs/merkle-proof.json`.
5. Runs the standalone Rust verifier locally with `--channel_hash blake2s`.

This command does not use Atlantic, does not call a remote prover, and does not upload `inputs/merkle_path_args.json`. The generated proof artifact is ignored under `target/`.

The local stwo-cairo checkout needed two dev-utility fixes for Scarb executable support:

- `run_and_prove` now exposes a `--layout` flag while keeping `all_cairo_stwo` as the default.
- executable adaptation now sets `PublicSegmentContext` from the executable entrypoint's actual builtins instead of always using the bootloader/all-builtin context. This fixed malformed public segment ranges for Scarb executables and allowed the Merkle proof to pass.

Important privacy boundary: local proving solves the remote-witness-upload problem, but stwo-cairo is not zero-knowledge by default. A direct public proof may reveal sampled execution data. A direct text search of the toy proof found the public root but not the obvious toy witness values; that is only a smoke check, not a privacy proof. Before private transfers, we need a formal proof-leakage audit or a recursive/hiding construction where only the intended public statement reaches chain or any third party.

## Recursive Verifier And Task PIE Status

The locally generated Blake-canonical Merkle STARK proof verifies with `stwo_cairo_verifier_array` and returns:

```text
Program output:
3
1616635717182068608364703678641987474353866405618911243740290162179813754946
1
823984307
```

A normal Scarb bootloader-target PIE is not suitable for Atlantic. It serializes the outer simple bootloader execution, so Atlantic attempts to bootload a bootloader again. The tested failures are recorded in `docs/atlantic-stwo-bug-log.md`.

The working artifact is a Cairo1 task PIE created by running the executable `Bootloader` entrypoint directly in Cairo VM execution mode. Scarb 2.18 does not expose this mode by default, so this repository contains a tested patch:

- `patches/scarb-2.18.0-cairo1-task-pie.patch`

Build the patched runner:

```sh
git clone --branch v2.18.0 --depth 1 https://github.com/software-mansion/scarb.git /tmp/scarb-2.18.0
git -C /tmp/scarb-2.18.0 apply \
  /home/yavor/yavor/Coding/IC3-2026-Hackathon/pq-shielded-pool/patches/scarb-2.18.0-cairo1-task-pie.patch
cargo build --manifest-path /tmp/scarb-2.18.0/Cargo.toml -p scarb-execute
```

Generate and validate the full task PIE locally from the public toy proof:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle:build-recursive-task-pie
corepack yarn cairo:merkle:check-recursive-task-pie
```

The build script wraps the patched `scarb-execute` command, captures the local verifier output, copies the latest PIE into a stable ignored path, and runs the pre-upload validator.

Tested artifact:

- stable path: `packages/cairo-merkle/target/local-proofs/recursive-verifier-task-pie.zip`
- Scarb also writes per-run copies under `packages/stwo-cairo/stwo_cairo_verifier/target/execute/stwo_cairo_verifier/executionN/cairo_pie.zip`
- SHA-256: `74ee9e6665e18e25dd871f728b74e3ba98f46742fd053293d3903022bad2ee37`
- compressed size: `79,776,557` bytes
- steps: `16,965,079`
- builtins: `output`, `range_check`, `bitwise`
- return segments: indices `5` and `6`

Submit or resume the public task PIE through the package scripts:

```sh
corepack yarn atlantic:merkle:task-pie:dry-run
corepack yarn atlantic:merkle:task-pie:mock
corepack yarn atlantic:merkle:task-pie:real
corepack yarn atlantic:merkle:task-pie:resume-real
```

Use `task-pie:real` only when the team accepts the proof-generation credit cost. `task-pie:resume-real` re-reads completed query `01KTDCSWGYZAGANJZYY4E3MDGF` and uploads nothing.

Atlantic results:

- public smoke task PIE trace passed: `01KTDC9B4VDVVMCFF2KSGHASKE`
- full task PIE `S` worker OOM: `01KTDCF7WKFHZXSJZ7Q7BZCTZV`
- full task PIE `M` worker OOM: `01KTDCGVV981506JQVMGZT6RPR`
- full task PIE `L` trace passed: `01KTDCJHAK2QHS0TVAC5JF1VTJ`
- mocked Sepolia fact registration passed: `01KTDCP8TXTDXRSTEBZ5SFQ541`
- mocked Satellite readback: `valid: true`, `isMocked: true`
- real proof-backed Sepolia query passed: `01KTDCSWGYZAGANJZYY4E3MDGF`
- real query completed at: `2026-06-06T04:03:16.648Z`
- real Satellite readback: `valid: true`, `isMocked: false`
- real query SHARP fact: `0x8a9e6885e08b0f85b16114cd889b05219485649a1988a73e377911bd2eac5e6f`

Use `declaredJobSize=L` for this verifier. Smaller workers were OOM-killed.

Privacy warning: a Cairo PIE contains execution memory. Only submit this public toy artifact. Do not generate and upload a PIE from private transfer witness execution unless its leakage model has been explicitly reviewed and accepted.

## Poseidon Merkle L1 Workflow

The stronger public Merkle fixture lives at `packages/cairo-merkle-poseidon`. It follows the same local-proof -> Cairo recursive verifier -> task PIE -> Atlantic route as the toy Merkle fixture, but uses Cairo core Poseidon for application hashing.

Local commands:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle-poseidon:prove-local
corepack yarn cairo:merkle-poseidon:prove-recursive
corepack yarn cairo:merkle-poseidon:verify-recursive-local
corepack yarn cairo:merkle-poseidon:build-recursive-task-pie
corepack yarn cairo:merkle-poseidon:check-recursive-task-pie
```

Atlantic commands for the public Poseidon fixture:

```sh
corepack yarn atlantic:merkle-poseidon:task-pie:dry-run
corepack yarn atlantic:merkle-poseidon:task-pie:trace
corepack yarn atlantic:merkle-poseidon:task-pie:real
corepack yarn atlantic:merkle-poseidon:task-pie:resume-real
```

Tested results:

- task PIE SHA-256: `17acdc817c1a86310238951fab2840130b835edc0fd3570d52fe2bb94781a890`
- task PIE steps: `19,455,300`
- trace-only query: `01KTDRW5T557A0A4908T1V9QKC`
- trace-only SHARP fact: `0x55255c62a6562c275658d89e4822731edc7f6df44ca71a1b0049b1079cacef45`
- `declaredJobSize=M` real L1 query `01KTDS0C9WCMN1FWJFTYDQ27EZ` failed with `OOMKilled`
- `declaredJobSize=L` real L1 query `01KTDS2CJV6BTG555N0PSD2K9H` passed on Sepolia L1
- real L1 completed at: `2026-06-06T07:08:51.187Z`
- real proof job/transaction id: `01KTDS5NGMSS4W4TMKGRXAFKQ7`
- real Sepolia Satellite readback: `valid: true`, `isMocked: false`

The Poseidon recursive task PIE is recognized by the Atlantic upload guard as a known public fixture. If the source changes and the PIE hash changes, the guard will block remote upload until the team confirms the artifact is still public.
## What Gets Verified On L1

The L1 contract does not directly verify our Merkle path inputs. It checks that SHARP/Atlantic registered a Cairo fact for:

1. A fixed Cairo program hash.
2. A specific output array emitted by that Cairo program.

The Cairo program must therefore output every public value that the Solidity protocol wants to bind, such as:

- old Merkle root
- nullifier hash
- new note commitments
- recipient or withdrawal address when public
- public amount, if any
- domain separator or pool id

The private values, such as note secrets and Merkle siblings, should be used only inside the Cairo execution and should not be included in the output unless they are intended to be public.

## Important Privacy Caveat

Atlantic is a managed prover interface. If we submit `programFile` plus `inputFile`, or a `pie.zip` generated from private witness data, the managed prover path may receive enough execution data to learn the witness. This is acceptable for test fixtures, but it is not acceptable as-is for a production shielded pool if witness privacy against the prover is a requirement.

Before production, we need one of these privacy-safe proving models:

- client/local proving with only proof/public outputs sent onward, if supported by the final SHARP/L1 route we choose;
- a self-hosted or trusted proving operator model that matches the protocol's privacy assumptions;
- a different architecture where the prover never sees user secrets.

Do not treat the managed Atlantic test flow as privacy-preserving. It is confirmed remote proving for our current script and should not receive private inputs.

## Cairo Program Shape

For Atlantic Cairo 1 with Rust VM, use a Cairo entrypoint compatible with an input array and output array:

```cairo
fn main(input: Array<felt252>) -> Array<felt252> {
    // parse input
    // verify the Merkle path
    // return public outputs
}
```

For the first Merkle workflow test, the output should include at least the Merkle root computed by the program. Later shielded-pool versions should output the complete public transition statement.

## Current Repository Fixture

The current runnable fixture is in `packages/cairo-merkle`.

- Cairo package: `packages/cairo-merkle`
- Cairo source: `packages/cairo-merkle/src/lib.cairo`
- Atlantic input file: `packages/cairo-merkle/inputs/merkle_path.txt`
- Sierra artifact after build: `packages/cairo-merkle/target/dev/pq_cairo_merkle.sierra.json`
- Current application Merkle root: `823984307`
- Completed mocked Atlantic query: `01KTADNEJVX1JA3S1YFWQSH967`
- Registered mocked Sepolia fact: `0xf536c8800ed5952735a1505e8a45c6c499772ae160c853697c5c2fffacdfdfd6`

The toy hash is reduced modulo M31 so this root matches the local native Stwo toy example. It is not production cryptography.

Local Cairo checks:

```sh
corepack yarn cairo:merkle:build
corepack yarn cairo:merkle:test
```

`scarb test` currently runs through Scarb's deprecated `cairo-test` path. It passes for this fixture, but we should move to `snforge` once Cairo testing grows beyond this smoke test.

The Solidity side has a reusable fact adapter and mock-registry test:

- Adapter: `packages/hardhat/contracts/CairoFactVerifier.sol`
- Satellite-compatible interface: `packages/hardhat/contracts/interfaces/ICairoFactRegistry.sol`
- Test mock: `packages/hardhat/contracts/mocks/MockCairoFactRegistry.sol`
- Focused test: `packages/hardhat/test/CairoFactVerifier.ts`

Local Solidity checks:

```sh
corepack yarn hardhat:compile
corepack yarn hardhat:test:cairo-fact
```

Atlantic integration script for public fixture only:

```sh
corepack yarn atlantic:merkle:dry-run
corepack yarn atlantic:merkle:mock
corepack yarn atlantic:merkle:real
```

The script lives at `packages/hardhat/scripts/submitAtlanticMerkle.mjs`. It submits the Cairo Sierra artifact and input file, polls the Atlantic query, downloads `metadata.json`, computes the documented Cairo fact hash from `metadata.program_hash` and the full `metadata.output` array, and reads the Satellite registry when an RPC URL is configured.

Important: the L1 fact output is the full Atlantic/Cairo VM output array, not only the application Merkle root. In the first mocked query, the root `823984307` appears at `metadata.output[7]`, while the Satellite fact is the metadata-derived `sharpFactHash`.

The Hardhat test uses a placeholder program hash. Real Sepolia/mainnet use must configure the actual Cairo `programHash` returned or registered by Atlantic for the compiled Sierra artifact.

## API Key Setup

Do not commit the Atlantic API key. Put it in the ignored Hardhat env file or export it for one shell session.

Ignored env-file option:

```sh
cp packages/hardhat/.env.example packages/hardhat/.env
$EDITOR packages/hardhat/.env
```

Set at least:

```text
HCLOUD_API_KEY=...
```

For Satellite readback, also set a read-only Ethereum RPC URL:

```text
SEPOLIA_RPC_URL=...
```

Shell-only option:

```sh
export HCLOUD_API_KEY=...
export SEPOLIA_RPC_URL=...
```

The integration script accepts `ATLANTIC_API_KEY` as an alias for `HCLOUD_API_KEY`.

## Gas And Atlantic Cost Notes

For `mockFactHash=true`, this workflow does not require Sepolia ETH in our own wallet. Atlantic registers a mocked fact through its service account/API path, and our script only submits the query and reads the Satellite contract.

For `mockFactHash=false` on Sepolia, our wallet still should not need Sepolia ETH unless we deploy or call our own contract. Atlantic may consume project credits for proof generation even when testnet proof verification itself is free. The full recursive verifier requires an `L` trace worker, so do not estimate its cost from the `S` price. Check current Atlantic pricing and the project balance before starting another real job.

Do not run `corepack yarn atlantic:merkle:real` or `corepack yarn atlantic:merkle:task-pie:real` unless the team is comfortable consuming Atlantic credits for the proof-generation part of the workflow.

## Test Workflow: No Real Proof Cost

This path tests our Solidity integration and fact-hash calculation without paying for a real L1 proof verification.

1. Compile the Cairo program.

```sh
corepack yarn cairo:merkle:build
```

2. Confirm the Atlantic request shape without using the API key.

```sh
corepack yarn atlantic:merkle:dry-run
```

3. Submit an Atlantic query with mocked L1 verification and poll it.

```sh
corepack yarn atlantic:merkle:mock
```

This uses:

```text
declaredJobSize=S
sharpProver=stwo
layout=auto
cairoVm=rust
cairoVersion=cairo1
result=PROOF_VERIFICATION_ON_L1
mockFactHash=true
network=TESTNET
programFile=packages/cairo-merkle/target/dev/pq_cairo_merkle.sierra.json
inputFile=packages/cairo-merkle/inputs/merkle_path.txt
```

4. The script computes the expected fact hash from Atlantic metadata.

```solidity
// outputs must be the full metadata.output array returned by Atlantic,
// not only the application Merkle root.
uint256[] memory outputs = metadataOutput;

bytes32 outputHash = keccak256(abi.encodePacked(outputs));
bytes32 programHash = 0x...; // metadata.program_hash, not child_program_hash
bytes32 factHash = keccak256(abi.encode(programHash, outputHash));
```

For mocked query `01KTADNEJVX1JA3S1YFWQSH967`, this produced Sepolia fact:

```text
0xf536c8800ed5952735a1505e8a45c6c499772ae160c853697c5c2fffacdfdfd6
```

5. The script checks the Sepolia Satellite contract with `is_mocked = true` when `SEPOLIA_RPC_URL` is configured. The first mocked query returned `true` for the fact above.

```solidity
interface ICairoFactRegistry {
    function isCairoFactValid(bytes32 fact_hash, bool is_mocked) external view returns (bool);
}
```

Ethereum Sepolia Satellite:

```text
0x396bF739f7b37D81f6CdD4571fDEF298150db88f
```

A local Hardhat test can use a mock implementation of `ICairoFactRegistry` and the same `factHash` calculation. That is the fastest way to test our pool contract's control flow.

## Testnet Workflow: Real L1 Verification On Sepolia

This path exercises the real SHARP/S-two L1 verification flow on Ethereum Sepolia.

1. Build and validate the recursive task PIE.

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle:build-recursive-task-pie
corepack yarn cairo:merkle:check-recursive-task-pie
```

2. Submit the task PIE with `mockFactHash=false`.

```sh
corepack yarn atlantic:merkle:task-pie:real
```

For the already completed public fixture, re-read the result without uploading anything:

```sh
corepack yarn atlantic:merkle:task-pie:resume-real
```

3. Wait for the query to finish. L1 verification queries are verified by Atlantic/SHARP, but proof files are not downloaded from L1 verification jobs. If we want a proof artifact for inspection, submit a separate `PROOF_GENERATION` query.

4. Compute the fact hash from the final public output array.

5. Check the Sepolia Satellite contract with `is_mocked = false`.

```solidity
bool ok = ICairoFactRegistry(0x396bF739f7b37D81f6CdD4571fDEF298150db88f)
    .isCairoFactValid(factHash, false);
require(ok, "Cairo proof fact not verified on L1");
```

6. In the shielded-pool contract, accept the state transition only if this call returns true and the public output values match the calldata used by the transaction.

## Mainnet Migration

Mainnet uses the same fact-hash logic and the same Cairo program hash, assuming the compiled program does not change.

Changes for mainnet:

- Atlantic query: `network=MAINNET`
- fact check: `is_mocked=false`
- Satellite address: `0x2e6f182b06f37cbdc966ff5471c7d98cec2bfe70`
- Sepolia SHARP verifier reference: `0x07ec0D28e50322Eb0C159B9090ecF3aeA8346DFe`
- Ethereum mainnet SHARP verifier reference: `0x47312450B3Ac8b5b8e247a6bB6d523e7605bDb60`

The application contract should normally call the Satellite contract rather than trying to reimplement SHARP verifier internals.

## Repository Task Status

Completed locally and in public integration testing:

1. Added a Cairo package for the Merkle proof program.
2. Added a small fixture input file for the current toy hash.
3. Added a Cairo unit test for the expected output root.
4. Added a Solidity fact verifier adapter.
5. Added a Hardhat unit test with a mock `ICairoFactRegistry`.

Remaining:

1. Replace the temporary patched-Scarb build with a maintained repository command or upstreamed Scarb support.
2. Replace the toy hash with a Cairo-friendly production hash and keep the output/fact-hash interface stable.
3. Audit proof and Cairo PIE leakage before any private-transfer artifact is submitted remotely.
4. Repeat the full local proof, recursive task-PIE validation, trace-only Atlantic check, and real L1 verification for each larger transfer statement.

## Source References

- Atlantic overview: https://docs.herodotus.cloud/atlantic-api/introduction
- Atlantic query API: https://docs.herodotus.cloud/atlantic-api/endpoints/submit-query
- Atlantic L1 verification: https://docs.herodotus.cloud/atlantic-api/steps/l1-proof-verification
- Atlantic contract addresses: https://docs.herodotus.cloud/atlantic-api/contract-addresses
- SHARP architecture: https://docs.starknet.io/learn/protocol/sharp
- Starknet chain info and SHARP verifier addresses: https://docs.starknet.io/learn/cheatsheets/chain-info
