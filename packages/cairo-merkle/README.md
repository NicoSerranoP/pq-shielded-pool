# Cairo Merkle Root Fixture

This package is the first Cairo version of the Merkle proof workflow we plan to verify through SHARP/S-two and Ethereum L1 facts.

It intentionally uses the same small algebraic toy hash as the local Stwo example, reduced modulo the M31 field so the fixture root matches that native Stwo example. This is not production cryptography. The purpose is to verify the full compile, prove, fact-registration, and Solidity fact-check path before replacing the hash with Poseidon.

## Fixture

Input order for `inputs/merkle_path.txt`:

1. `leaf_left`
2. `leaf_right`
3. `sibling_0`, `index_0`
4. `sibling_1`, `index_1`
5. `sibling_2`, `index_2`
6. `sibling_3`, `index_3`

The current fixture is:

```text
[10 11 20 0 30 1 40 0 50 1]
```

The program returns one public output: the computed Merkle root.

Expected root:

```text
823984307
```

## Local Build

```sh
scarb build
```

This should produce:

```text
target/dev/pq_cairo_merkle.sierra.json
target/dev/pq_cairo_merkle.executable.json
```

## Local Stwo Proof

The local proving path uses the checked-out `packages/stwo-cairo` prover directly. It does not call Atlantic and does not upload the witness/input file.

This stwo-cairo checkout is pinned to Scarb/Cairo 2.15.0 for executable compatibility. If your default `scarb` is newer, pass an explicit binary:

```sh
SCARB_BIN=/tmp/scarb-v2.15.0-x86_64-unknown-linux-gnu/bin/scarb corepack yarn cairo:merkle:prove-local
```

The script builds the executable, runs it locally, generates a Stwo proof locally, verifies it with `run_and_prove --verify`, and then runs the standalone Rust verifier over:

```text
packages/cairo-merkle/target/local-proofs/merkle-proof.json
```

Prepare and run the local Cairo recursive verifier inputs with:

```sh
corepack yarn cairo:merkle:prepare-recursive-inputs
source /home/yavor/.bashrc
corepack yarn cairo:merkle:verify-recursive-local
```

The current local recursive verifier returns root `823984307`. The public recursive-verifier task PIE also passes Atlantic trace generation and real non-mocked Sepolia L1 fact registration. See `docs/pq-proof-testing-handoff.md` for the current query ids and debugging status.

The local stwo-cairo checkout includes a small fix for Scarb executables: executable programs must use their actual entrypoint builtin list instead of the bootloader/all-builtin public segment context. Without this, simple executables can produce malformed public segment ranges and Merkle proving can fail the prover constraint sanity check.


## Privacy Warning

The Atlantic submission flow is remote proving. It sends the compiled Cairo program and `inputs/merkle_path.txt` to Atlantic. This package's input file is a public toy fixture only.

Do not use the Atlantic commands with private shielded-pool witnesses. Production private transfers need a local prover path so note secrets, Merkle path witnesses, and private transaction data never leave the user's device.

Local proving prevents witness upload to a remote prover, but it is not by itself a full privacy proof. Stwo Cairo documents that it is not zero-knowledge by default, so before publishing proofs for real transfers we still need to audit exactly what the proof and public memory reveal, or add a hiding/recursive architecture that matches the shielded-pool privacy model.

## Atlantic Testnet Submission

Mocked fact registration, useful for Solidity integration without paying for a real L1 proof verification:

```sh
curl --request POST \
  --url https://atlantic.api.herodotus.cloud/atlantic-query \
  --header "api-key: $HCLOUD_API_KEY" \
  --form declaredJobSize=S \
  --form sharpProver=stwo \
  --form layout=auto \
  --form cairoVm=rust \
  --form cairoVersion=cairo1 \
  --form result=PROOF_VERIFICATION_ON_L1 \
  --form mockFactHash=true \
  --form network=TESTNET \
  --form programFile=@target/dev/pq_cairo_merkle.sierra.json \
  --form inputFile=@inputs/merkle_path.txt
```

Real Sepolia L1 verification changes only `mockFactHash=false` for the plain fixture. For the recursive-verifier task PIE route used by the current L1 proof workflow, use:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle:build-recursive-task-pie
corepack yarn cairo:merkle:check-recursive-task-pie
corepack yarn atlantic:merkle:task-pie:resume-real
```

The completed public recursive-verifier query is `01KTDCSWGYZAGANJZYY4E3MDGF`; it returned Sepolia Satellite `valid: true` with `isMocked: false`.
