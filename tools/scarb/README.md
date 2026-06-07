# Patched Scarb Execute

The direct local Stone to deployed-GPS verifier workflow needs a patched Scarb 2.18
`scarb-execute` binary. The patch adds:

- `--save-stone-air-inputs`
- proof-mode trace and memory output for Stone
- bootloader-target Stone AIR generation
- full-bootloader program input with continuous memory fact topology output

Build it from the repository root:

```sh
corepack yarn scarb:build-patched-execute
```

By default this clones or reuses:

```text
/tmp/scarb-2.18.0
```

Override the checkout path with:

```sh
SCARB_REPO=/tmp/scarb-2.18.0-clean corepack yarn scarb:build-patched-execute
```

The script copies `tools/stark-evm-adapter/bootloader/test_compiled_bootloader.json` into the
Scarb checkout before building, then applies:

```text
patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch
```

The resulting binary is:

```text
$SCARB_REPO/target/debug/scarb-execute
```

## Validation

Validated after a clean rebuild on 2026-06-06 machine time:

```sh
SCARB_REPO=/tmp/scarb-2.18.0-clean-codex corepack yarn scarb:build-patched-execute
```

Result:

- cloned Scarb v2.18.0 at commit `e6144df0f44a8335a4905a132aad98fb14401bdd`
- applied `patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch` cleanly
- built `/tmp/scarb-2.18.0-clean-codex/target/debug/scarb-execute`
- generated shielded-pool transfer full-bootloader Stone AIR with `layout=starknet`, `n_steps=131072`, `publicMemory=760`
- regenerated `packages/cairo-shielded-pool/target/dev/stone-full-bootloader-fact-topologies.json` as `{"fact_topologies":[{"tree_structure":[1,0],"page_sizes":[7]}]}`
