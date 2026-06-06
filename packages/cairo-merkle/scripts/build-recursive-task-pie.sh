#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MERKLE_DIR="$ROOT_DIR/packages/cairo-merkle"
VERIFIER_DIR="${STWO_CAIRO_VERIFIER_DIR:-$ROOT_DIR/packages/stwo-cairo/stwo_cairo_verifier}"
SCARB_BIN="${SCARB_BIN:-scarb}"
SCARB_EXECUTE_BIN="${SCARB_EXECUTE_BIN:-/tmp/scarb-2.18.0/target/debug/scarb-execute}"
SCARB_PROFILE_NAME="${SCARB_PROFILE_NAME:-proving}"
PROOF_ARGS_PATH="${RECURSIVE_PROOF_ARGS:-$MERKLE_DIR/target/local-proofs/merkle-proof.blake-canonical.cairo-serde.array-args.json}"
LAYOUT="${RECURSIVE_VERIFIER_LAYOUT:-all_cairo}"
FEATURES="${RECURSIVE_VERIFIER_FEATURES:-qm31_opcode}"
TASK_PIE_PATH="${TASK_PIE_PATH:-$MERKLE_DIR/target/local-proofs/recursive-verifier-task-pie.zip}"
TASK_PIE_LOG_PATH="${TASK_PIE_LOG_PATH:-$MERKLE_DIR/target/local-proofs/recursive-verifier-task-pie.log}"
CHECK_SCRIPT="$MERKLE_DIR/scripts/check-recursive-task-pie.mjs"

if ! command -v "$SCARB_BIN" >/dev/null 2>&1; then
  echo "Scarb binary not found: $SCARB_BIN" >&2
  echo "Source /home/yavor/.bashrc or set SCARB_BIN=/path/to/scarb." >&2
  exit 1
fi

if [[ ! -x "$SCARB_EXECUTE_BIN" ]]; then
  echo "Patched scarb-execute not found or not executable: $SCARB_EXECUTE_BIN" >&2
  echo "Build it with the repository patch:" >&2
  echo "  git clone --branch v2.18.0 --depth 1 https://github.com/software-mansion/scarb.git /tmp/scarb-2.18.0" >&2
  echo "  git -C /tmp/scarb-2.18.0 apply $ROOT_DIR/patches/scarb-2.18.0-cairo1-task-pie.patch" >&2
  echo "  cargo build --manifest-path /tmp/scarb-2.18.0/Cargo.toml -p scarb-execute" >&2
  exit 1
fi

if [[ ! -f "$PROOF_ARGS_PATH" ]]; then
  echo "Recursive proof arguments not found: $PROOF_ARGS_PATH" >&2
  echo "Expected the Blake-canonical public proof args for the current L1 task-PIE route." >&2
  echo "See docs/cairo-l1-verification-workflow.md for regenerating the local proof inputs." >&2
  exit 1
fi

if [[ ! -d "$VERIFIER_DIR" ]]; then
  echo "stwo_cairo_verifier directory not found: $VERIFIER_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$TASK_PIE_PATH")" "$(dirname "$TASK_PIE_LOG_PATH")"

(
  cd "$VERIFIER_DIR"
  "$SCARB_BIN" --profile "$SCARB_PROFILE_NAME" build --package stwo_cairo_verifier --features "$FEATURES"
  SCARB_PROFILE="$SCARB_PROFILE_NAME" \
  SCARB_TARGET_DIR="$VERIFIER_DIR/target" \
  "$SCARB_EXECUTE_BIN" \
    --no-build \
    --package stwo_cairo_verifier \
    --features "$FEATURES" \
    --executable-name stwo_cairo_verifier_array \
    --arguments-file "$PROOF_ARGS_PATH" \
    --layout "$LAYOUT" \
    --target standalone \
    --output cairo-pie \
    --print-program-output \
    --print-resource-usage
) 2>&1 | tee "$TASK_PIE_LOG_PATH"

LATEST_PIE="$(
  find "$VERIFIER_DIR/target/execute/stwo_cairo_verifier" -type f -name cairo_pie.zip -printf '%T@ %p\n' |
    sort -nr |
    head -n 1 |
    cut -d' ' -f2-
)"

if [[ -z "$LATEST_PIE" || ! -f "$LATEST_PIE" ]]; then
  echo "No cairo_pie.zip was produced under $VERIFIER_DIR/target/execute/stwo_cairo_verifier" >&2
  exit 1
fi

if [[ "$LATEST_PIE" != "$TASK_PIE_PATH" ]]; then
  cp "$LATEST_PIE" "$TASK_PIE_PATH"
fi

CHECK_ARGS=(--pie "$TASK_PIE_PATH" --log-file "$TASK_PIE_LOG_PATH")
if [[ -n "${TASK_PIE_CHECK_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  EXTRA_CHECK_ARGS=($TASK_PIE_CHECK_ARGS)
  CHECK_ARGS+=("${EXTRA_CHECK_ARGS[@]}")
fi

node "$CHECK_SCRIPT" "${CHECK_ARGS[@]}"
