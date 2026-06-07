#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/cairo-shielded-pool"
STONE_DIR="$ROOT_DIR/tools/stone"
STONE_PROVER="${STONE_PROVER:-$STONE_DIR/bin/cpu_air_prover}"
STONE_VERIFIER="${STONE_VERIFIER:-$STONE_DIR/bin/cpu_air_verifier}"
SCARB_EXECUTE_BIN="${SCARB_EXECUTE_BIN:-/tmp/scarb-2.18.0/target/debug/scarb-execute}"
PROVER_CONFIG="${STONE_PROVER_CONFIG:-$STONE_DIR/config/cpu_air_prover_config.json}"
PARAMS_FILE="${STONE_PARAMS_FILE:-$STONE_DIR/config/cpu_air_params_starknet_2p21.json}"
LAYOUT="${STONE_AIR_LAYOUT:-starknet}"
OUT_DIR="${STONE_OUT_DIR:-$PKG_DIR/target/local-proofs/stone}"
STATEMENT="${1:-${SHIELDED_POOL_STATEMENT:-deposit}}"

case "$STATEMENT" in
  deposit)
    EXECUTABLE="pq_cairo_shielded_pool_deposit"
    ARGS_FILE="${SHIELDED_POOL_ARGS_JSON:-$PKG_DIR/inputs/deposit_args.json}"
    ;;
  transfer)
    EXECUTABLE="pq_cairo_shielded_pool_transfer"
    ARGS_FILE="${SHIELDED_POOL_ARGS_JSON:-$PKG_DIR/inputs/transfer_args.json}"
    ;;
  withdraw)
    EXECUTABLE="pq_cairo_shielded_pool_withdraw"
    ARGS_FILE="${SHIELDED_POOL_ARGS_JSON:-$PKG_DIR/inputs/withdraw_args.json}"
    ;;
  *)
    echo "Usage: $0 [deposit|transfer|withdraw]" >&2
    exit 1
    ;;
esac

PROOF_FILE="$OUT_DIR/$STATEMENT-stone-proof.json"
ANNOTATION_FILE="$OUT_DIR/$STATEMENT-stone-annotation.txt"
EXTRA_ANNOTATION_FILE="$OUT_DIR/$STATEMENT-stone-extra-annotation.txt"

for file in "$STONE_PROVER" "$STONE_VERIFIER" "$SCARB_EXECUTE_BIN" "$PROVER_CONFIG" "$PARAMS_FILE" "$ARGS_FILE"; do
  if [[ ! -e "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

if ! "$SCARB_EXECUTE_BIN" --help 2>/dev/null | grep -q -- "--save-stone-air-inputs"; then
  echo "scarb-execute is missing --save-stone-air-inputs." >&2
  echo "Apply patches/scarb-2.18.0-cairo1-task-pie.patch to Scarb v2.18.0 and rebuild scarb-execute." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

(
  cd "$PKG_DIR"
  export SCARB_TARGET_DIR="$PKG_DIR/target"
  export SCARB_PROFILE=dev
  "$SCARB_EXECUTE_BIN" \
    --executable-name "$EXECUTABLE" \
    --arguments-file "${ARGS_FILE#$PKG_DIR/}" \
    --print-program-output \
    --output none \
    --target standalone \
    --layout "$LAYOUT" \
    --save-stone-air-inputs
)

AIR_DIR="$(find "$PKG_DIR/target/execute/pq_cairo_shielded_pool" -type d -name stone-air-inputs -printf "%T@ %p\n" | sort -nr | head -n1 | cut -d" " -f2-)"
if [[ -z "$AIR_DIR" ]]; then
  echo "No stone-air-inputs directory was produced." >&2
  exit 1
fi

node --input-type=module -e 'import fs from "node:fs"; const j=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const ok=(j.n_steps&(j.n_steps-1))===0; console.log(JSON.stringify({layout:j.layout,n_steps:j.n_steps,isPowerOfTwo:ok,publicMemory:j.public_memory.length}, null, 2)); if(!ok) process.exit(1);' "$AIR_DIR/air_public_input.json"

(
  cd "$AIR_DIR"
  "$STONE_PROVER" \
    --out_file="$PROOF_FILE" \
    --private_input_file=air_private_input.json \
    --public_input_file=air_public_input.json \
    --prover_config_file="$PROVER_CONFIG" \
    --parameter_file="$PARAMS_FILE" \
    --logtostderr=1
)

"$STONE_VERIFIER" \
  --in_file="$PROOF_FILE" \
  --annotation_file="$ANNOTATION_FILE" \
  --extra_output_file="$EXTRA_ANNOTATION_FILE" \
  --logtostderr=1

echo "Stone proof verified: $PROOF_FILE"
