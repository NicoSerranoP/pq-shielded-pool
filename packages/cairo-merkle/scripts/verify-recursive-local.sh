#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VERIFIER_DIR="${STWO_CAIRO_VERIFIER_DIR:-$ROOT_DIR/packages/stwo-cairo/stwo_cairo_verifier}"
SCARB_BIN="${SCARB_BIN:-scarb}"
PROOF_ARGS_PATH="${RECURSIVE_PROOF_ARGS:-$ROOT_DIR/packages/cairo-merkle/target/local-proofs/merkle-proof.poseidon.cairo-serde.array-args.json}"
LAYOUT="${RECURSIVE_VERIFIER_LAYOUT:-all_cairo}"

if ! command -v "$SCARB_BIN" >/dev/null 2>&1; then
  echo "Scarb binary not found: $SCARB_BIN" >&2
  echo "Source /home/yavor/.bashrc or set SCARB_BIN=/path/to/scarb." >&2
  exit 1
fi

if [[ ! -f "$PROOF_ARGS_PATH" ]]; then
  echo "Recursive proof arguments not found: $PROOF_ARGS_PATH" >&2
  echo "Run: corepack yarn cairo:merkle:prepare-recursive-inputs" >&2
  exit 1
fi

if [[ ! -d "$VERIFIER_DIR" ]]; then
  echo "stwo_cairo_verifier directory not found: $VERIFIER_DIR" >&2
  exit 1
fi

(
  cd "$VERIFIER_DIR"
  "$SCARB_BIN" --profile proving build --package stwo_cairo_verifier --features poseidon252_verifier
  "$SCARB_BIN" --profile proving execute --no-build     --package stwo_cairo_verifier     --features poseidon252_verifier     --executable-name stwo_cairo_verifier_array     --arguments-file "$PROOF_ARGS_PATH"     --layout "$LAYOUT"     --print-program-output     --print-resource-usage
)
