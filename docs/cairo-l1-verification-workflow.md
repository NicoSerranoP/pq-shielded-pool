# Cairo Merkle Proof to L1 Verification Workflow

This document is the planned end-to-end path for proving a Cairo Merkle proof program and having the result accepted by an Ethereum L1 verifier. The intended production direction is Cairo program -> SHARP/S-two proof -> Ethereum fact registry check. This is independent from ProveKit and from the local custom Stwo AIR examples.

## Current Decision

For L1 verification, prefer the Cairo/SHARP/Atlantic path instead of custom local Stwo AIR proofs.

Reason: SHARP already has an Ethereum verifier flow for Cairo program executions. A custom Stwo AIR proof is useful for local experiments, but it is not directly accepted by SHARP's deployed L1 verifier unless it is wrapped into the Cairo/SHARP pipeline.

## Privacy Verdict

The Atlantic workflow used in this repository is remote proving, not local proving. It uploads `programFile` and `inputFile` to `https://atlantic.api.herodotus.cloud/atlantic-query` as multipart form fields. That means private Merkle witnesses, note secrets, nullifiers before publication, path siblings, or any other sensitive transfer data must not be submitted through this path.

For our shielded-pool production goal, proof generation must happen locally or inside a privacy model we explicitly trust. The only artifact sent to a remote service or chain should be a proof plus public outputs/facts. The current Atlantic flow is acceptable only for the public toy fixture and L1 verifier integration experiments.

The script `packages/hardhat/scripts/submitAtlanticMerkle.mjs` now enforces this by default: it only submits the known public toy fixture hashes. Any non-fixture upload requires the explicit `--allow-remote-witness-upload` flag or `ATLANTIC_ALLOW_REMOTE_WITNESS_UPLOAD=true`, and that override must not be used with private shielded-pool witnesses.


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

## Recursive Verifier Status

We can also verify the locally generated Merkle STARK proof with the Cairo recursive verifier on this machine. The current full verifier entrypoint is `stwo_cairo_verifier_array`, which accepts the serialized `CairoProof` as an input array and returns:

1. the verifier program hash,
2. the original Cairo program output length,
3. the original Cairo Merkle root.

Current local command:

```sh
source /home/yavor/.bashrc
scarb --profile proving build --package stwo_cairo_verifier --features poseidon252_verifier
scarb --profile proving execute --no-build \
  --package stwo_cairo_verifier \
  --features poseidon252_verifier \
  --executable-name stwo_cairo_verifier_array \
  --arguments-file /home/yavor/yavor/Coding/IC3-2026-Hackathon/pq-shielded-pool/packages/cairo-merkle/target/local-proofs/merkle-proof.poseidon.cairo-serde.array-args.json \
  --layout all_cairo \
  --print-program-output --print-resource-usage
```

Current local result with Scarb 2.18.0:

```text
Program output:
3
-1210432837679171818288727564040993199151119840003011262996498487688464571055
1
823984307
steps: 17,582,452
```

Atlantic does not yet accept this recursive verifier artifact. The plain Merkle fixture still verifies through mocked Sepolia fact registration, and a diagnostic echo program with the same 114,691-element public proof input also verifies through Atlantic. However, a deserialize-only version of the stwo Cairo verifier fails on Atlantic before metadata generation completes, for all tested job sizes:

- `S`: `01KTC4W0V9Q8M6E1F41DTMZWHX`
- `M`: `01KTC4Z43TJ4NMH4QVVRXSHEHE`
- `L`: `01KTC52ADTPC24H0FJ0PFDQX17`

Each failed with `Error: Failed to run cairo1 rust vm: VirtualMachine(Unexpected)` during `TRACE_AND_METADATA_GENERATION`. A full-verifier retry with explicit `layout=all_cairo` also failed with the same error: `01KTC63E3YGMY4EFASMAYZBXAS`. Because the same verifier artifact runs locally and the same large input is accepted by a simple Atlantic program, this currently looks like an Atlantic Cairo runner compatibility issue with the generated stwo verifier/deserializer code rather than a local proving failure.

This does not currently look like an Atlantic credit/quota issue. Herodotus documents testnet proof verification as free, while trace generation and proof generation can still consume credits by runtime/job size. Our failed recursive-verifier jobs were accepted and then failed inside Cairo VM trace generation, not rejected at submission for billing or quota reasons.

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

For `mockFactHash=false` on Sepolia, our wallet still should not need Sepolia ETH unless we deploy or call our own contract. However, Atlantic may consume project credits for proof generation. Herodotus' pricing page currently says testnet proof verification is free, while proof generation is priced by job size; size `S` is listed as 70 credits, about `$0.70`.

Do not run `corepack yarn atlantic:merkle:real` unless the team is comfortable consuming Atlantic credits for the proof-generation part of the workflow.

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

1. Compile the Cairo program and prepare the input file.

2. Submit the same query as above, but use `mockFactHash=false`.

```sh
corepack yarn atlantic:merkle:real
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

Completed locally:

1. Added a Cairo package for the Merkle proof program.
2. Added a small fixture input file for the current toy hash.
3. Added a Cairo unit test for the expected output root.
4. Added a Solidity fact verifier adapter.
5. Added a Hardhat unit test with a mock `ICairoFactRegistry`.

Remaining:

1. Set `HCLOUD_API_KEY` and `SEPOLIA_RPC_URL` in `packages/hardhat/.env` or the shell.
2. Run `corepack yarn atlantic:merkle:mock` against Sepolia Satellite as the first external check.
3. Run `corepack yarn atlantic:merkle:real` for real Sepolia L1 verification.
4. Replace the toy hash with a Cairo-friendly production hash and keep the output/fact-hash interface stable.

## Source References

- Atlantic overview: https://docs.herodotus.cloud/atlantic-api/introduction
- Atlantic query API: https://docs.herodotus.cloud/atlantic-api/endpoints/submit-query
- Atlantic L1 verification: https://docs.herodotus.cloud/atlantic-api/steps/l1-proof-verification
- Atlantic contract addresses: https://docs.herodotus.cloud/atlantic-api/contract-addresses
- SHARP architecture: https://docs.starknet.io/learn/protocol/sharp
- Starknet chain info and SHARP verifier addresses: https://docs.starknet.io/learn/cheatsheets/chain-info
