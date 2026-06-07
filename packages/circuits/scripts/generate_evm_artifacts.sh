#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CIRCUITS_DIR="$ROOT_DIR/packages/circuits"
GENERATED_DIR="$ROOT_DIR/packages/hardhat/contracts/generated"
PROVEKIT_CLI="${PROVEKIT_CLI:-provekit-cli}"

if ! command -v nargo >/dev/null 2>&1; then
  echo "nargo is required. Add it to PATH before running this script." >&2
  exit 1
fi

if ! command -v "$PROVEKIT_CLI" >/dev/null 2>&1; then
  echo "provekit-cli is required. Set PROVEKIT_CLI=/path/to/provekit-cli if it is not on PATH." >&2
  exit 1
fi

if ! "$PROVEKIT_CLI" --help 2>&1 | grep -q "export-evm-proof"; then
  echo "The selected provekit-cli does not support export-evm-proof." >&2
  echo "Build a Provekit branch that includes export-solidity and export-evm-proof, then set PROVEKIT_CLI." >&2
  exit 1
fi

verifier_contract_name() {
  case "$1" in
    deposit) echo "DepositVerifier" ;;
    transfer) echo "TransferVerifier" ;;
    withdraw) echo "WithdrawVerifier" ;;
    *)
      echo "Unknown circuit: $1" >&2
      exit 1
      ;;
  esac
}

generate_circuit() {
  local circuit="$1"
  local contract_name
  contract_name="$(verifier_contract_name "$circuit")"

  echo "Generating $circuit Groth16 EVM artifacts"
  (
    cd "$CIRCUITS_DIR/$circuit"
    "$PROVEKIT_CLI" prepare "../target/${circuit}.json" --backend groth16
    "$PROVEKIT_CLI" prove
    rm -rf evm
    "$PROVEKIT_CLI" export-evm-proof --proof proof.np --out-dir evm
    "$PROVEKIT_CLI" export-solidity --pkv "${circuit}.pkv" --template ../ProvekitGroth16Verifier.sol --out Verifier.sol
  )

  mkdir -p "$GENERATED_DIR"
  sed "s/contract ProvekitGroth16Verifier/contract ${contract_name}/" \
    "$CIRCUITS_DIR/$circuit/Verifier.sol" > "$GENERATED_DIR/${contract_name}.sol"
}

echo "Building Noir artifacts"
(cd "$CIRCUITS_DIR" && nargo build)

generate_circuit deposit
generate_circuit transfer
generate_circuit withdraw

echo "Regenerated circuit EVM artifacts and synced Hardhat verifiers."
