#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
POSEIDON_DIR="$ROOT_DIR/packages/cairo-merkle-poseidon"
STWO_PROVER_DIR="${STWO_CAIRO_PROVER_DIR:-$ROOT_DIR/packages/stwo-cairo/stwo_cairo_prover}"
SCARB_BIN="${SCARB_BIN:-scarb}"
RUN_AND_PROVE_BIN="${STWO_RUN_AND_PROVE:-$STWO_PROVER_DIR/target/release/run_and_prove}"
PROOF_PATH="${PROOF_PATH:-$POSEIDON_DIR/target/local-proofs/merkle-poseidon-proof.blake-canonical.cairo-serde.json}"
PARAMS_PATH="${STWO_PARAMS_JSON:-$POSEIDON_DIR/inputs/stwo_blake_canonical_params.json}"
ARGS_PATH="${MERKLE_ARGS_JSON:-$POSEIDON_DIR/inputs/merkle_path_args.json}"
ARRAY_ARGS_PATH="${RECURSIVE_ARRAY_ARGS_PATH:-${PROOF_PATH%.json}.array-args.json}"
ATLANTIC_INPUT_PATH="${ATLANTIC_INPUT_PATH:-${PROOF_PATH%.json}.atlantic.decimal.txt}"
LAYOUT="${STWO_LAYOUT:-all_cairo_stwo}"
PREPARE_SCRIPT="$ROOT_DIR/packages/cairo-merkle/scripts/prepare-recursive-proof-inputs.mjs"

if ! command -v "$SCARB_BIN" >/dev/null 2>&1; then
  echo "Scarb binary not found: $SCARB_BIN" >&2
  echo "Source /home/yavor/.bashrc or set SCARB_BIN=/path/to/scarb." >&2
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
  cd "$POSEIDON_DIR"
  "$SCARB_BIN" build
  "$SCARB_BIN" execute --print-program-output --arguments-file "${ARGS_PATH#$POSEIDON_DIR/}"
)

"$RUN_AND_PROVE_BIN" \
  --program "$POSEIDON_DIR/target/dev/pq_cairo_merkle_poseidon.executable.json" \
  --program_type executable \
  --program_arguments_file "$ARGS_PATH" \
  --layout "$LAYOUT" \
  --params_json "$PARAMS_PATH" \
  --proof_path "$PROOF_PATH" \
  --proof-format cairo-serde \
  --verify

node "$PREPARE_SCRIPT" \
  --proof-path "$PROOF_PATH" \
  --array-args-path "$ARRAY_ARGS_PATH" \
  --atlantic-input-path "$ATLANTIC_INPUT_PATH"

echo "Local Poseidon recursive-verifier input generated: $ARRAY_ARGS_PATH"
