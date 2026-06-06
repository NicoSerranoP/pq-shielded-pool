#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
POSEIDON_DIR="$ROOT_DIR/packages/cairo-merkle-poseidon"
STONE_DIR="$ROOT_DIR/tools/stone"
STONE_PROVER="${STONE_PROVER:-$STONE_DIR/bin/cpu_air_prover}"
STONE_VERIFIER="${STONE_VERIFIER:-$STONE_DIR/bin/cpu_air_verifier}"
SCARB_EXECUTE_BIN="${SCARB_EXECUTE_BIN:-/tmp/scarb-2.18.0/target/debug/scarb-execute}"
PROVER_CONFIG="${STONE_PROVER_CONFIG:-$STONE_DIR/config/cpu_air_prover_config.json}"
PARAMS_FILE="${STONE_PARAMS_FILE:-$STONE_DIR/config/cpu_air_params_starknet_2p21.json}"
ARGS_FILE="${MERKLE_ARGS_JSON:-$POSEIDON_DIR/inputs/merkle_path_args.json}"
LAYOUT="${STONE_AIR_LAYOUT:-starknet}"
OUT_DIR="${STONE_OUT_DIR:-$POSEIDON_DIR/target/local-proofs/stone}"
STONE_PROOF_LABEL="${STONE_PROOF_LABEL:-poseidon-merkle-stone}"
STONE_AIR_DIR="${STONE_AIR_DIR:-}"
SCARB_EXECUTE_TARGET="${SCARB_EXECUTE_TARGET:-standalone}"
FULL_BOOTLOADER_TASK_PIE_PATH="${STONE_FULL_BOOTLOADER_TASK_PIE_PATH:-${SCARB_FULL_BOOTLOADER_TASK_PIE_PATH:-}}"
PROOF_FILE="$OUT_DIR/$STONE_PROOF_LABEL-proof.json"
ANNOTATION_FILE="$OUT_DIR/$STONE_PROOF_LABEL-annotation.txt"
EXTRA_ANNOTATION_FILE="$OUT_DIR/$STONE_PROOF_LABEL-extra-annotation.txt"
ANNOTATED_PROOF_FILE="$OUT_DIR/$STONE_PROOF_LABEL-annotated-proof.json"
SPLIT_PROOF_FILE="$OUT_DIR/$STONE_PROOF_LABEL-split-proofs.json"
ADAPTER_DIR="${STARK_EVM_ADAPTER_DIR:-/tmp/stark-evm-adapter}"
ADAPTER_BIN="${STARK_EVM_ADAPTER_BIN:-$ADAPTER_DIR/target/debug/stark_evm_adapter}"
SPLIT_EXAMPLE_SRC="$ROOT_DIR/tools/stark-evm-adapter/split_proof_summary.rs"
VERIFY_EXAMPLE_SRC="$ROOT_DIR/tools/stark-evm-adapter/verify_split_proof_custom.rs"

for file in "$STONE_PROVER" "$STONE_VERIFIER" "$PROVER_CONFIG" "$PARAMS_FILE"; do
  if [[ ! -e "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

if [[ -n "$STONE_AIR_DIR" ]]; then
  for file in "$STONE_AIR_DIR/air_private_input.json" "$STONE_AIR_DIR/air_public_input.json"; do
    if [[ ! -e "$file" ]]; then
      echo "Missing required AIR input file: $file" >&2
      exit 1
    fi
  done
else
  for file in "$SCARB_EXECUTE_BIN" "$ARGS_FILE"; do
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
fi

mkdir -p "$OUT_DIR"

if [[ -n "$STONE_AIR_DIR" ]]; then
  AIR_DIR="$STONE_AIR_DIR"
else
  (
    cd "$POSEIDON_DIR"
    export SCARB_TARGET_DIR="$POSEIDON_DIR/target"
    export SCARB_PROFILE=dev
    if [[ -n "$FULL_BOOTLOADER_TASK_PIE_PATH" ]]; then
      export SCARB_FULL_BOOTLOADER_TASK_PIE_PATH="$FULL_BOOTLOADER_TASK_PIE_PATH"
    fi
    "$SCARB_EXECUTE_BIN" \
      --arguments-file "${ARGS_FILE#$POSEIDON_DIR/}" \
      --print-program-output \
      --output none \
      --target "$SCARB_EXECUTE_TARGET" \
      --layout "$LAYOUT" \
      --save-stone-air-inputs
  )

  AIR_DIR="$(find "$POSEIDON_DIR/target/execute/pq_cairo_merkle_poseidon" -type d -name stone-air-inputs -printf "%T@ %p\n" | sort -nr | head -n1 | cut -d" " -f2-)"
  if [[ -z "$AIR_DIR" ]]; then
    echo "No stone-air-inputs directory was produced." >&2
    exit 1
  fi
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
      FACT_TOPOLOGIES="${STONE_FACT_TOPOLOGIES:-$POSEIDON_DIR/target/dev/stone-full-bootloader-fact-topologies.json}" \
      cargo run -q --example verify_split_proof_custom
    )
  else
    echo "Skipping fork verifier; adapter checkout, split proof, or verifier helper is missing." >&2
  fi
fi

echo "Stone proof verified: $PROOF_FILE"
if [[ -f "$SPLIT_PROOF_FILE" ]]; then
  echo "Split proof written: $SPLIT_PROOF_FILE"
fi
