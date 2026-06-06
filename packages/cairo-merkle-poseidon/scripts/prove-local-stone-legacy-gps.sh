#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
POSEIDON_DIR="$ROOT_DIR/packages/cairo-merkle-poseidon"
AIR_PARENT="$POSEIDON_DIR/target/execute/pq_cairo_merkle_poseidon"

if [[ -z "${STONE_AIR_DIR:-}" ]]; then
  if [[ ! -d "$AIR_PARENT" ]]; then
    echo "No Stone AIR parent directory found: $AIR_PARENT" >&2
    echo "Generate full-bootloader Stone AIR inputs before running the legacy-GPS wrapper." >&2
    exit 1
  fi
  STONE_AIR_DIR="$(find "$AIR_PARENT" -type d -name stone-air-inputs -printf "%T@ %p\n" | sort -nr | head -n1 | cut -d" " -f2-)"
  if [[ -z "$STONE_AIR_DIR" ]]; then
    echo "No stone-air-inputs directory found under $AIR_PARENT" >&2
    exit 1
  fi
  export STONE_AIR_DIR
fi

PUBLIC_MEMORY_LEN="$(node --input-type=module -e 'import fs from "node:fs"; const j=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(j.public_memory.length);' "$STONE_AIR_DIR/air_public_input.json")"
if [[ "$PUBLIC_MEMORY_LEN" -lt 100 ]]; then
  echo "Selected Stone AIR has publicMemory=$PUBLIC_MEMORY_LEN; this does not look like full-bootloader AIR." >&2
  echo "Set STONE_AIR_DIR to a full-bootloader stone-air-inputs directory before using the legacy-GPS verifier path." >&2
  exit 1
fi

export STONE_PROVER="${STONE_PROVER:-$ROOT_DIR/tools/stone/bin/cpu_air_prover_legacy_gps}"
export STONE_VERIFIER="${STONE_VERIFIER:-$ROOT_DIR/tools/stone/bin/cpu_air_verifier_legacy_gps}"
export STONE_PROOF_LABEL="${STONE_PROOF_LABEL:-poseidon-merkle-full-bootloader-legacy-gps-stone}"
export STONE_TASK_METADATA_MODE="${STONE_TASK_METADATA_MODE:-bootloader}"
export STONE_FACT_TOPOLOGIES="${STONE_FACT_TOPOLOGIES:-$POSEIDON_DIR/target/dev/stone-full-bootloader-fact-topologies.json}"

echo "Using Stone AIR inputs: $STONE_AIR_DIR"
echo "Using legacy-GPS Stone prover: $STONE_PROVER"

exec "$POSEIDON_DIR/scripts/prove-local-stone.sh"
