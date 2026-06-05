#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MERKLE_DIR="$ROOT_DIR/packages/cairo-merkle"
STWO_PROVER_DIR="${STWO_CAIRO_PROVER_DIR:-$ROOT_DIR/packages/stwo-cairo/stwo_cairo_prover}"
SCARB_BIN="${SCARB_BIN:-scarb}"
RUN_AND_PROVE_BIN="${STWO_RUN_AND_PROVE:-$STWO_PROVER_DIR/target/release/run_and_prove}"
VERIFY_BIN="${STWO_VERIFY:-$STWO_PROVER_DIR/target/release/verify}"
PROOF_PATH="${PROOF_PATH:-$MERKLE_DIR/target/local-proofs/merkle-proof.json}"
PARAMS_PATH="${STWO_PARAMS_JSON:-$MERKLE_DIR/inputs/stwo_local_params.json}"
ARGS_PATH="${MERKLE_ARGS_JSON:-$MERKLE_DIR/inputs/merkle_path_args.json}"
LAYOUT="${STWO_LAYOUT:-all_cairo_stwo}"

if ! command -v "$SCARB_BIN" >/dev/null 2>&1; then
  echo "Scarb binary not found: $SCARB_BIN" >&2
  echo "Set SCARB_BIN=/tmp/scarb-v2.15.0-x86_64-unknown-linux-gnu/bin/scarb." >&2
  exit 1
fi

SCARB_VERSION="$($SCARB_BIN --version | head -n 1)"
if [[ "$SCARB_VERSION" != scarb\ 2.15.0* ]]; then
  echo "Expected Scarb 2.15.0 for stwo-cairo 1.2.2 executable compatibility." >&2
  echo "Got: $SCARB_VERSION" >&2
  echo "Set SCARB_BIN=/tmp/scarb-v2.15.0-x86_64-unknown-linux-gnu/bin/scarb." >&2
  exit 1
fi

if [[ ! -x "$RUN_AND_PROVE_BIN" ]]; then
  echo "run_and_prove binary not found: $RUN_AND_PROVE_BIN" >&2
  echo "Build it from packages/stwo-cairo/stwo_cairo_prover with: RUSTFLAGS='-C target-cpu=native -C opt-level=3' cargo build --release --bin run_and_prove --bin verify" >&2
  exit 1
fi

if ! "$RUN_AND_PROVE_BIN" --help 2>/dev/null | grep -q -- '--layout'; then
  echo "run_and_prove is missing the local --layout/executable public-segment patch." >&2
  echo "Use the patched packages/stwo-cairo checkout in this repository before proving Scarb executables." >&2
  exit 1
fi

mkdir -p "$(dirname "$PROOF_PATH")"

(
  cd "$MERKLE_DIR"
  "$SCARB_BIN" build
  "$SCARB_BIN" execute --print-program-output --arguments-file "${ARGS_PATH#$MERKLE_DIR/}"
)

"$RUN_AND_PROVE_BIN" \
  --program "$MERKLE_DIR/target/dev/pq_cairo_merkle.executable.json" \
  --program_type executable \
  --program_arguments_file "$ARGS_PATH" \
  --layout "$LAYOUT" \
  --params_json "$PARAMS_PATH" \
  --proof_path "$PROOF_PATH" \
  --verify

"$VERIFY_BIN" --proof_path "$PROOF_PATH" --channel_hash blake2s

echo "Local Merkle proof generated and verified: $PROOF_PATH"
