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
```


## Privacy Warning

The Atlantic submission flow is remote proving. It sends the compiled Cairo program and `inputs/merkle_path.txt` to Atlantic. This package's input file is a public toy fixture only.

Do not use the Atlantic commands with private shielded-pool witnesses. Production private transfers need a local prover path so note secrets, Merkle path witnesses, and private transaction data never leave the user's device.

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

Real Sepolia L1 verification changes only `mockFactHash=false`.
