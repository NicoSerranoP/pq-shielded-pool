#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/cairo-shielded-pool"
STONE_DIR="$ROOT_DIR/tools/stone"
STONE_PROVER="${STONE_PROVER:-$STONE_DIR/bin/cpu_air_prover_legacy_gps}"
STONE_VERIFIER="${STONE_VERIFIER:-$STONE_DIR/bin/cpu_air_verifier_legacy_gps}"
SCARB_EXECUTE_BIN="${SCARB_EXECUTE_BIN:-/tmp/scarb-2.18.0/target/debug/scarb-execute}"
PROVER_CONFIG="${STONE_PROVER_CONFIG:-$STONE_DIR/config/cpu_air_prover_config.json}"
PARAMS_FILE="${STONE_PARAMS_FILE:-$STONE_DIR/config/cpu_air_params_starknet_2p21.json}"
LAYOUT="${STONE_AIR_LAYOUT:-starknet}"
OUT_DIR="${STONE_OUT_DIR:-$PKG_DIR/target/local-proofs/stone}"
STATEMENT="${1:-${SHIELDED_POOL_STATEMENT:-transfer}}"
STONE_AIR_DIR="${STONE_AIR_DIR:-}"
ADAPTER_DIR="${STARK_EVM_ADAPTER_DIR:-/tmp/stark-evm-adapter}"
ADAPTER_BIN="${STARK_EVM_ADAPTER_BIN:-$ADAPTER_DIR/target/debug/stark_evm_adapter}"
SPLIT_EXAMPLE_SRC="$ROOT_DIR/tools/stark-evm-adapter/split_proof_summary.rs"
VERIFY_EXAMPLE_SRC="$ROOT_DIR/tools/stark-evm-adapter/verify_split_proof_custom.rs"
FACT_TOPOLOGIES="${STONE_FACT_TOPOLOGIES:-$PKG_DIR/target/dev/stone-full-bootloader-fact-topologies.json}"

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

STONE_PROOF_LABEL="${STONE_PROOF_LABEL:-$STATEMENT-full-bootloader-legacy-gps-stone}"
PROOF_FILE="$OUT_DIR/$STONE_PROOF_LABEL-proof.json"
ANNOTATION_FILE="$OUT_DIR/$STONE_PROOF_LABEL-annotation.txt"
EXTRA_ANNOTATION_FILE="$OUT_DIR/$STONE_PROOF_LABEL-extra-annotation.txt"
ANNOTATED_PROOF_FILE="$OUT_DIR/$STONE_PROOF_LABEL-annotated-proof.json"
SPLIT_PROOF_FILE="$OUT_DIR/$STONE_PROOF_LABEL-split-proofs.json"

for file in "$STONE_PROVER" "$STONE_VERIFIER" "$PROVER_CONFIG" "$PARAMS_FILE"; do
  if [[ ! -e "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

mkdir -p "$OUT_DIR"

if [[ -z "$STONE_AIR_DIR" ]]; then
  for file in "$SCARB_EXECUTE_BIN" "$ARGS_FILE"; do
    if [[ ! -e "$file" ]]; then
      echo "Missing required file: $file" >&2
      echo "Build patched scarb-execute with: corepack yarn scarb:build-patched-execute" >&2
      exit 1
    fi
  done

  (
    cd "$PKG_DIR"
    export SCARB_TARGET_DIR="$PKG_DIR/target"
    export SCARB_PROFILE=dev
    "$SCARB_EXECUTE_BIN" \
      --executable-name "$EXECUTABLE" \
      --arguments-file "${ARGS_FILE#$PKG_DIR/}" \
      --print-program-output \
      --output none \
      --target bootloader \
      --layout "$LAYOUT" \
      --save-stone-air-inputs
  )

  STONE_AIR_DIR="$(find "$PKG_DIR/target/execute/pq_cairo_shielded_pool" -type d -name stone-air-inputs -printf "%T@ %p\n" | sort -nr | head -n1 | cut -d" " -f2-)"
  if [[ -z "$STONE_AIR_DIR" ]]; then
    echo "No stone-air-inputs directory was produced." >&2
    exit 1
  fi
fi

for file in "$STONE_AIR_DIR/air_private_input.json" "$STONE_AIR_DIR/air_public_input.json" "$FACT_TOPOLOGIES"; do
  if [[ ! -e "$file" ]]; then
    echo "Missing required full-bootloader artifact: $file" >&2
    exit 1
  fi
done

node --input-type=module -e 'import fs from "node:fs"; const j=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const ok=(j.n_steps&(j.n_steps-1))===0; console.log(JSON.stringify({layout:j.layout,n_steps:j.n_steps,isPowerOfTwo:ok,publicMemory:j.public_memory.length}, null, 2)); if(!ok) process.exit(1);' "$STONE_AIR_DIR/air_public_input.json"

(
  cd "$STONE_AIR_DIR"
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

if [[ -x "$ADAPTER_BIN" ]]; then
  "$ADAPTER_BIN" gen-annotated-proof \
    --stone-proof-file="$PROOF_FILE" \
    --stone-annotation-file="$ANNOTATION_FILE" \
    --stone-extra-annotation-file="$EXTRA_ANNOTATION_FILE" \
    --output="$ANNOTATED_PROOF_FILE"
else
  echo "Skipping annotated proof generation; adapter binary not found: $ADAPTER_BIN" >&2
fi

if [[ -f "$ANNOTATED_PROOF_FILE" && -f "$ADAPTER_DIR/Cargo.toml" && -f "$SPLIT_EXAMPLE_SRC" ]]; then
  mkdir -p "$ADAPTER_DIR/examples"
  cp "$SPLIT_EXAMPLE_SRC" "$ADAPTER_DIR/examples/split_proof_summary.rs"
  (
    cd "$ADAPTER_DIR"
    ANNOTATED_PROOF="$ANNOTATED_PROOF_FILE" \
    SPLIT_PROOF_OUT="$SPLIT_PROOF_FILE" \
    cargo run -q --example split_proof_summary
  )
else
  echo "Skipping split-proof generation; adapter checkout or annotated proof is missing." >&2
fi

if [[ "${STONE_VERIFY_ON_FORK:-false}" == "true" ]]; then
  if [[ -f "$SPLIT_PROOF_FILE" && -f "$ADAPTER_DIR/Cargo.toml" && -f "$VERIFY_EXAMPLE_SRC" ]]; then
    mkdir -p "$ADAPTER_DIR/examples"
    cp "$VERIFY_EXAMPLE_SRC" "$ADAPTER_DIR/examples/verify_split_proof_custom.rs"
    (
      cd "$ADAPTER_DIR"
      URL="${STONE_VERIFY_URL:-http://127.0.0.1:8545}" \
      SPLIT_PROOF="$SPLIT_PROOF_FILE" \
      TASK_METADATA_MODE="${STONE_TASK_METADATA_MODE:-bootloader}" \
      FACT_TOPOLOGIES="$FACT_TOPOLOGIES" \
      cargo run -q --example verify_split_proof_custom
    )
  else
    echo "Skipping fork verifier; adapter checkout, split proof, or verifier helper is missing." >&2
  fi
fi

echo "Full-bootloader legacy-GPS Stone proof verified: $PROOF_FILE"
if [[ -f "$SPLIT_PROOF_FILE" ]]; then
  echo "Split proof written: $SPLIT_PROOF_FILE"
fi
