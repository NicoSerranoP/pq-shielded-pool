## Prerequisites

### Install Nargo

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup --version v1.0.0-beta.11
```

### Install Provekit CLI

```bash
# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone and build
git clone https://github.com/worldfnd/provekit
cd provekit
cargo build --release
```

Then set the `PROVEKIT_CLI` environment variable in `packages/hardhat/.env` (copy from `.env.example`):

```bash
PROVEKIT_CLI=/path/to/provekit/target/release/provekit-cli
```

Each developer sets this to their own local build path. It is gitignored.

---

## Circuit Overview

| Circuit | Private inputs | Public inputs |
|---------|---------------|---------------|
| `deposit` | `note` | `commitment`, `value` |
| `transfer` | `old_note`, `new_notes`, `merkle_proof` | `nullifier`, `new_notes_commitments`, `published_root` |
| `withdraw` | `note`, `merkle_proof` | `value`, `published_root` |

---

## Computing Note Values (commitment + nullifier)

Before generating a proof you need to compute the commitment and nullifier for a note. Use the `note_helper` circuit:

```bash
cd packages/circuits

# Edit note_helper/Prover.toml with your note fields:
# value = <amount>
# owner = "<owner field element>"
# nonce = <nonce>
# asset = <asset id>

nargo execute --package note_helper
# Output: [note_helper] Circuit output: (<commitment>, <nullifier>)
```

---

## Generating a Deposit Proof

```bash
cd packages/circuits/deposit

# 1. Fill in Prover.toml with your note fields and computed commitment
# 2. Prove
$PROVEKIT_CLI prove -p deposit.pkp -i Prover.toml -o proof.np

# 3. Export to EVM calldata
$PROVEKIT_CLI export-evm-proof -p proof.np -o evm/
# Writes evm/proof.hex and evm/inputs.txt
```

---

## Running the End-to-End Deposit Test

The test script handles everything automatically — computing the commitment, generating the proof, and submitting the deposit transaction:

```bash
cd packages/hardhat
yarn hardhat run scripts/testDeposit.ts --network localhost
```

To deposit a different amount, edit these fields in `scripts/testDeposit.ts`:

```ts
const amount = 5;   // deposit amount
const nonce = 0;    // must be unique per note for the same owner
```

---

## Prepare, prove and verify the circuits (Provekit wrapped in Groth16)

```bash
nargo build

cd packages/circuits/<ACTION_CIRCUIT>

$PROVEKIT_CLI prepare ../target/<ACTION_CIRCUIT>.json

$PROVEKIT_CLI export-solidity --pkv <ACTION_CIRCUIT>.pkv --template ../ProvekitGroth16Verifier.sol --out Verifier.sol

$PROVEKIT_CLI prove -p <ACTION_CIRCUIT>.pkp -i Prover.toml -o proof.np

$PROVEKIT_CLI export-evm-proof -p proof.np -o evm/
```

Then copy the updated `Verifier.sol` to `packages/hardhat/contracts/DepositVerifier.sol` (or the relevant contract) and redeploy.
