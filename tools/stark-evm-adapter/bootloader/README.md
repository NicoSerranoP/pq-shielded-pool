# Bootloader Artifact

`test_compiled_bootloader.json` is the compiled bootloader JSON used by the local patched Scarb
binary to generate full-bootloader Stone AIR inputs compatible with the deployed GPS verifier
path.

The rebuildable Scarb source diff is recorded at:

```text
patches/scarb-2.18.0-cairo1-stone-full-bootloader.patch
```

The rebuild script copies this JSON into the Scarb checkout as:

```text
extensions/scarb-execute/bootloaders/stone_full_bootloader.json
```

Then the patch includes it with a Scarb-tree-relative path, so clean rebuilds no longer depend on
the old `/tmp/stark-evm-adapter` checkout state.
