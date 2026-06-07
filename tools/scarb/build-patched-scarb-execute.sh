#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCARB_REPO="${SCARB_REPO:-/tmp/scarb-2.18.0}"
SCARB_REF="${SCARB_REF:-v2.18.0}"
PATCH_FILE="${SCARB_PATCH_FILE:-$ROOT_DIR/patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch}"
BOOTLOADER_SRC="${SCARB_BOOTLOADER_JSON:-$ROOT_DIR/tools/stark-evm-adapter/bootloader/test_compiled_bootloader.json}"
BOOTLOADER_DST="$SCARB_REPO/extensions/scarb-execute/bootloaders/stone_full_bootloader.json"

if [[ ! -d "$SCARB_REPO/.git" ]]; then
  mkdir -p "$(dirname "$SCARB_REPO")"
  git clone --branch "$SCARB_REF" --depth 1 https://github.com/software-mansion/scarb.git "$SCARB_REPO"
fi

for file in "$PATCH_FILE" "$BOOTLOADER_SRC"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$BOOTLOADER_DST")"
cp "$BOOTLOADER_SRC" "$BOOTLOADER_DST"

if git -C "$SCARB_REPO" apply --check "$PATCH_FILE"; then
  git -C "$SCARB_REPO" apply "$PATCH_FILE"
elif grep -Eq "stone_full_bootloader\.json|save_stone_air_inputs" "$SCARB_REPO/extensions/scarb-execute/src/lib.rs" "$SCARB_REPO/utils/scarb-extensions-cli/src/execute.rs"; then
  echo "Scarb patch already appears to be applied; continuing."
else
  echo "Patch does not apply cleanly and the patched markers were not found." >&2
  echo "Use a clean Scarb $SCARB_REF checkout or set SCARB_REPO to a clean path." >&2
  exit 1
fi

cargo build --manifest-path "$SCARB_REPO/Cargo.toml" -p scarb-execute

echo "Patched scarb-execute built at: $SCARB_REPO/target/debug/scarb-execute"
