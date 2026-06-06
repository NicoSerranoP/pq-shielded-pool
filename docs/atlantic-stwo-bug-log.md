# Atlantic/Stwo Debugging Bug Log

Last updated: 2026-06-06

This is the operational bug log for the Cairo/Stwo/Atlantic L1 verification work. It records concrete failures, workarounds, and query IDs so future teammates and agents do not repeat the same dead ends.

## Privacy Boundary

Atlantic submissions through `packages/hardhat/scripts/submitAtlanticMerkle.mjs` are remote proving/debugging jobs. They upload the selected Sierra program and input file. Do not submit private shielded-pool witnesses, private Merkle paths, note secrets, note randomness, unpublished nullifier material, or private balances.

The recursive-verifier diagnostics in this log used public proof artifacts from the toy Merkle fixture, not private transfer witnesses. That is acceptable for debugging. Production private-transfer proving still needs local witness proving and a leakage audit of any public proof artifact.

## Current State

Local status:

- Cairo Merkle fixture execution works with root `823984307`.
- Local Stwo proof generation and Rust verification work.
- Local Cairo recursive verification works for both Poseidon252-channel and Blake-canonical proofs.
- Blake-canonical local recursive verifier output is:
  - verifier program hash `1616635717182068608364703678641987474353866405618911243740290162179813754946`
  - output length `1`
  - Merkle root `823984307`

Atlantic/L1 status:

- Correctly shaped Cairo task PIE trace generation works for the full recursive verifier.
- Mocked Sepolia L1 fact registration works and the Satellite registry returns `valid: true`.
- The real proof-backed Sepolia job is recorded below; check its final status before making production claims.
- Atlantic must use a sufficiently large worker for the 16.9-million-step verifier execution.

## Bug: `multi_pop_front<N>` Can Break Atlantic Cairo1 Rust VM

Observed failure:

- Atlantic can fail with `VirtualMachine(Memory(ExpectedInteger(Relocatable ...))` or broad `VirtualMachine(Unexpected)` when Cairo code uses `multi_pop_front<N>` on some spans/boxed arrays.

Concrete repro and fix:

- `verify_program` originally read the first six program-memory entries with `program.multi_pop_front::<6>()`.
- Atlantic failed for `atlantic_stwo_claim_program` before the patch:
  - failing query `01KTCQATMXG34DHG4ZNSEGSV5X`
- `atlantic_stwo_program_first`, which used one `pop_front`, passed:
  - passing query `01KTCQKCP7H6A6TATH3EHR6C1W`
- `atlantic_stwo_program_multi`, which used `multi_pop_front::<6>`, failed:
  - failing query `01KTCQMTN6EJ3KAA5C215JVJ6R`
- Workaround: replace the six-entry `multi_pop_front` with six scalar `pop_front` calls in `crates/cairo_air/src/lib.cairo`.
- After the patch, `atlantic_stwo_claim_program` passed:
  - passing query `01KTCQS0FJSKMWNBJKPACKJ9M7`

Related passing claim diagnostics after the patch:

- `atlantic_stwo_claim_basics`: `01KTCQWAMMAPTYNFDXKSJH4RA2`
- `atlantic_stwo_claim_uses`: `01KTCQXMNT345B8VAH0EPF3HWM`
- full `atlantic_stwo_claim`: `01KTCQZB4BRHD3A2DHXCQ9DRTS`

Rule of thumb: avoid `multi_pop_front<N>` in Atlantic-facing verifier code. Prefer explicit `pop_front` reads when practical.

## Bug: Poseidon252 Channel Fails On Packed QM31 Transcript Hashing

Observed behavior:

- Simple Poseidon works on Atlantic.
- Poseidon252 recursive verifier channel mixing fails when hashing Stwo transcript values, especially packed QM31 values.

Useful query IDs:

- Simple Poseidon smoke passed:
  - `atlantic_stwo_poseidon_smoke`: `01KTCR7HYKH63JYS927C8480X0`
- Packing the channel value without hashing passed:
  - `atlantic_stwo_channel_pack`: `01KTCRQVRVCZ4NSQA9BWFEZAWN`
- Hashing the packed value failed:
  - `atlantic_stwo_channel_manual_hash`: `01KTCRS5JANXN07GNX7FH6V4EC`
  - error included `VirtualMachine(Memory(AddressNotRelocatable))`
- `channel_salt` failed before and after replacing a `multi_pop_front::<2>` in Poseidon mixing:
  - `01KTCRFY8VZVTE5H6E3HEKNXG5`
  - `01KTCRKJKM6YKCW22QJ31DBEP5`

Current interpretation:

- The Poseidon primitive itself is not globally broken on Atlantic.
- The Stwo Poseidon252 transcript path hits a Cairo VM incompatibility around large/packed QM31 transcript values.
- Do not simplify or change transcript hashing semantics just to pass Atlantic; that would change Fiat-Shamir security.

Current workaround:

- Direct Sierra submission of the Poseidon252 full recursive verifier remains blocked on Atlantic. The corrected task-PIE route succeeds with the Blake-canonical verifier and is the current L1 integration path.
- Use Blake-canonical diagnostics for further runner debugging, while keeping in mind Blake has its own Atlantic issues below.

## Bug: Blake Canonical Proof Needs Canonical Preprocessed Trace

Observed behavior:

- A Blake proof generated with `preprocessed_trace=canonical_without_pedersen` verified in Rust but failed in the local Cairo recursive verifier with a preprocessed-root assertion mismatch.
- The Blake proof needs canonical preprocessed trace parameters for the Cairo recursive verifier.

Working local artifact:

- Params file: `packages/cairo-merkle/target/local-proofs/stwo_blake_canonical_params.json`
- Proof: `packages/cairo-merkle/target/local-proofs/merkle-proof.blake-canonical.cairo-serde.json`
- Array args: `packages/cairo-merkle/target/local-proofs/merkle-proof.blake-canonical.cairo-serde.array-args.json`
- Atlantic decimal input: `packages/cairo-merkle/target/local-proofs/merkle-proof.blake-canonical.cairo-serde.atlantic.decimal.txt`
- Input size: `194512` felts

Working local command:

```sh
source /home/yavor/.bashrc
cd packages/stwo-cairo/stwo_cairo_verifier
scarb --profile proving build --package stwo_cairo_verifier --features qm31_opcode
scarb --profile proving execute --no-build \
  --package stwo_cairo_verifier \
  --features qm31_opcode \
  --executable-name stwo_cairo_verifier_array \
  --arguments-file /home/yavor/yavor/Coding/IC3-2026-Hackathon/pq-shielded-pool/packages/cairo-merkle/target/local-proofs/merkle-proof.blake-canonical.cairo-serde.array-args.json \
  --layout all_cairo \
  --print-program-output \
  --print-resource-usage
```

Expected local output:

```text
Program output:
3
1616635717182068608364703678641987474353866405618911243740290162179813754946
1
823984307
```

## Bug: `Blake2sHash { hash: Box<[u32; 8]> }` Fails On Atlantic

Observed failure:

- Atlantic failed when constructing/deserializing even one `Blake2sHash` whose `hash` field was a boxed `[u32; 8]`, even when the code did not unbox or inspect it.

Minimal repro:

- `atlantic_stwo_deserialize_blake_hash_no_unbox` failed before the fixed-array patch:
  - failing query `01KTCW05AN2XZ6F5N67EMHCHFX`
- Manual parsing of the same eight `u32`s and boxing them locally passed:
  - `atlantic_stwo_deserialize_blake_box_manual`: `01KTCW1EWAV4CFSPWRXVRS5248`

Workaround implemented locally:

- Change `Blake2sHash` in `crates/verifier_core/src/vcs/blake2s_hasher.cairo` from storing `Box<[u32; 8]>` to storing `[u32; 8]` directly.
- Box values only at Blake compression/finalization call sites.
- Update preprocessed Blake roots to use fixed arrays.

Evidence after workaround:

- Minimal `Blake2sHash` construction now passes:
  - `atlantic_stwo_deserialize_blake_hash_no_unbox`: `01KTCWAPGM8GDPE7FF2P14C2WX`
- Generic config+commitments parsing now passes:
  - previously failed: `01KTCVKZ6K79BYB1GXGBZMTW19`
  - after patch passed: `01KTCWC48H358QX8DX4GGWAT1M`
- Full PCS/Fri prefix parsing now passes:
  - `01KTCWDSKW075APEW4JMTPSNAR`
- Full `CairoProof` deserialization now passes:
  - previously failed: `01KTCTGR44QYKZY9NVB5YB7CNF`
  - after patch passed: `01KTCWG06QFAMAJNG9855GH7ZP`

Rule of thumb: do not put boxed fixed arrays inside structs that Atlantic must deserialize heavily. Prefer fixed arrays in the struct and explicit boxes at primitive call sites.

## Bug: `hash_u32s(Span<u32>)` Still Fails Remotely

Current failing boundary:

- Full Blake proof deserialization passes remotely.
- Raw public output extraction passes remotely.
- Encoding program memory for Blake hashing passes remotely.
- The actual long program-memory Blake hash still fails remotely.

Useful query IDs:

- Raw output passed after deserialization fixes:
  - `atlantic_stwo_output_raw`: `01KTCWMH8NDZNS1A6H2037176W`
- Program-memory encoding summary passed:
  - `atlantic_stwo_program_encode_blake`: `01KTCWQEJS331RPW57M5XNARYH`
- Program-memory Blake hash failed:
  - before explicit byte-count patch: `01KTCWP47KPAMX6SFSHPN6JAYV`
  - after explicit `u32` byte-count patch: `01KTCWZAGQ7R4JCWANT6QGCSJX`
- Digest-word output also failed, so this is before digest-to-felt conversion:
  - `atlantic_stwo_program_hash_words_blake`: `01KTCX0JW9H1T41M05V25CBBPE`
- Full `get_verification_output` failed because it includes the program hash:
  - `atlantic_stwo_output`: `01KTCWHTVSK2KKFVS45VHX7Q0N`

Smaller Blake observations:

- Direct `blake2s_finalize(..., byte_count=16, fixed message)` passed:
  - `atlantic_stwo_blake_smoke` fixed-message query `01KTCWX5EY4N1RRSD955M292NX`
- Direct `blake2s_finalize(..., byte_count=64, fixed message)` passed:
  - `atlantic_stwo_blake_finalize64_smoke`: `01KTCX6QSJXAMS6HDNADWGYGB1`
- `hash_u32s` over 16 words failed, even though it should match direct finalize64:
  - before helper change: `01KTCX41FV8T2JA9KC8S0535TM`
  - after changing block reads from repeated `pop_front` to `Span::at` plus advancing: `01KTCXC9PQ1TA5M9MH8QZWZ33R`

Current interpretation:

- `core::blake::blake2s_finalize` itself is not globally broken on Atlantic.
- The remaining issue appears to be in the reusable `hash_u32s(Span<u32>)` helper shape, likely Cairo VM handling of dynamic span/array-to-fixed-block conversion around the Blake call.
- A direct, fixed-message Blake call can pass where semantically equivalent helper code fails.
- A direct `blake2s_finalize` call also fails when the 16 message words are read from a dynamic span, so the boundary is dynamic-span-derived Blake inputs, not only the `hash_u32s` helper control flow.

Additional minimal repro:

- `atlantic_stwo_blake_span_inline_smoke` reads 16 constant array words through `Span::at` and calls `blake2s_finalize` directly.
- Local digest matches the fixed-message digest.
- Atlantic trace generation failed with `VirtualMachine(Unexpected)`:
  - `01KTD9KZ49Y5PS3EM6ZSDP9XMG`

Current next debugging direction for direct Sierra submissions only:

- The task-PIE path now bypasses this Atlantic Cairo1 re-execution incompatibility. Keep these items only if direct Sierra submission is still required.
- Build an alternate `hash_u32s` implementation that avoids `Span<u32>` block helpers entirely, or special-case known fixed block counts where possible.
- For program memory hashing, consider hashing directly while encoding values instead of first collecting `encoded_values: Array<u32>` and then passing a span into `hash_u32s`.
- Keep all digest outputs checked against the current local expected program hash.

## Bug/Pitfall: `usize` In Blake Message Blocks Can Fail Remotely

Observed behavior:

- A Blake smoke that inserted `input.len()` directly into a `[u32; 16]` message failed remotely:
  - `01KTCWV9GNSV8KH1N8ST0077EJ`
- The same smoke with a fixed `u32` literal message passed:
  - `01KTCWX5EY4N1RRSD955M292NX`

Rule of thumb:

- Do not rely on inferred integer conversions in Blake message arrays for Atlantic-facing code.
- Convert `usize` lengths and loop-derived counts to `u32` explicitly before putting them into Blake message blocks or byte-count arguments.

## Dead End: Private `BoundedIntGuarantee` Cannot Be Used Externally

A diagnostic attempt tried to reproduce core indexing guarantees directly. It was removed because `core::internal::bounded_int::BoundedIntGuarantee` is private outside the Cairo core library. Do not build a workaround around this internal API. Use public indexing APIs or change the data shape instead.

## Pitfall: `isJobSizeValid: false` Is Not A Failure Signal By Itself

Atlantic query records often show `isJobSizeValid: false` even on successful trace-generation jobs. Do not treat that field as a root cause unless the query itself is rejected or fails with a size-specific error.

Examples of successful jobs that still included `isJobSizeValid: false`:

- full claim diagnostic: `01KTCQZB4BRHD3A2DHXCQ9DRTS`
- constant large-input diagnostic: `01KTCTPVZ8TJRGB1ASPJA0AMRB`
- raw-output diagnostic: `01KTCWMH8NDZNS1A6H2037176W`

## Pitfall: Normalize Fact Hashes To `bytes32` Programmatically

Atlantic may print a fact hash without a leading zero nibble. Do not prepend zeroes by hand; an incorrect nibble count produces an invalid `BytesLike` value or checks a different fact. Use the same normalization as the integration script:

```js
const fact = ethers.toBeHex(BigInt(rawFactHash), 32);
```

A direct Sepolia Satellite read at block `10999434` for the normalized SHARP fact `0x8a9e6885e08b0f85b16114cd889b05219485649a1988a73e377911bd2eac5e6f` returned:

- `isMocked=true`: `valid: true`
- `isMocked=false`: `valid: false`

This is consistent with mocked registration being complete while real query `01KTDCSWGYZAGANJZYY4E3MDGF` remains in proof generation.

## Bug: Scarb 2.18 Bootloader PIE Is Not A Reusable Task PIE

Observed behavior:

- `scarb execute --target bootloader --output cairo-pie` executes the simple bootloader around the Cairo1 program and serializes the outer bootloader execution.
- Submitting that artifact to Atlantic makes Atlantic try to bootload a bootloader execution again.
- The resulting PIE metadata can misidentify zero-sized builtin segments as return FP/PC segments.

Failing evidence:

- `all_cairo` bootloader PIE, real testnet L1 query: `01KTDA65C2YD2GN4WJJ0YD6D0K`
  - failed in `select_input_builtins.cairo`
  - `DiffAssertValues(Relocatable segment 14 offset 13 vs offset 15)`
- `all_cairo_stwo` bootloader PIE submitted under accepted `all_cairo`: `01KTDAG9DDSAQV43DS8D8CHT3K`
  - same offset `13` versus `15` failure
- Atlantic rejects `layout=all_cairo_stwo` at request validation with HTTP 400 `ZOD_INVALID_BODY_STRING`.

Do not submit a Scarb bootloader-target PIE as an Atlantic Cairo PIE task.

## Workaround: Generate A Cairo1 Task PIE From The Bootloader Entrypoint

Scarb 2.18 intentionally rejects `--target standalone --output cairo-pie`. Its standalone entrypoint is a proof-mode program with a canonical `[fp, 0]` initial stack, which is not Cairo PIE task format.

The working task-PIE path is:

1. Use the executable `Bootloader` entrypoint, which is a function ending in `ret` and accepts builtin pointers.
2. Execute it directly in Cairo VM execution mode, not proof mode.
3. Serialize that execution as Cairo PIE.
4. Let Atlantic load that PIE once through its own bootloader.

The tested Scarb 2.18 patch is stored at:

- `patches/scarb-2.18.0-cairo1-task-pie.patch`

Minimal validation:

- Local public Blake smoke task PIE SHA-256: `21c709cbe5d85f99f56ebf8610248f1f27f12a2e1d4e914043df93a41af831bb`
- Atlantic trace generation passed: `01KTDC9B4VDVVMCFF2KSGHASKE`

Full recursive-verifier task PIE:

- Local path: `packages/stwo-cairo/stwo_cairo_verifier/target/execute/stwo_cairo_verifier/execution35/cairo_pie.zip`
- SHA-256: `74ee9e6665e18e25dd871f728b74e3ba98f46742fd053293d3903022bad2ee37`
- Compressed size: `79,776,557` bytes
- Steps: `16,965,079`
- Program builtins: `output`, `range_check`, `bitwise`
- Expected application output ends with verifier hash, `1`, and Merkle root `823984307`.

## Pitfall: Full Verifier Needs A Large Atlantic Worker

The corrected task PIE reaches normal Atlantic trace generation, but smaller worker requests run out of memory:

- `S` failed with `OOMKilled`: `01KTDCF7WKFHZXSJZ7Q7BZCTZV`
- `M` failed with `OOMKilled`: `01KTDCGVV981506JQVMGZT6RPR`
- `L` succeeded: `01KTDCJHAK2QHS0TVAC5JF1VTJ`

The successful trace metadata contains:

- child program hash: `0x2560e9f6dc5a2364c3d2434d92d4711a89dcd3d1f318fb95391e25c6ca1032d`
- SHARP fact: `0x8a9e6885e08b0f85b16114cd889b05219485649a1988a73e377911bd2eac5e6f`
- full verifier hash: `1616635717182068608364703678641987474353866405618911243740290162179813754946`
- Merkle root at output index 8: `823984307`

Mocked Sepolia L1 fact registration also passed:

- query: `01KTDCP8TXTDXRSTEBZ5SFQ541`
- Satellite: `0x396bF739f7b37D81f6CdD4571fDEF298150db88f`
- fact registry result: `valid: true` with `isMocked: true`

## Pitfall: Real Proof Jobs Can Outlive The Client Poll

The real non-mocked Sepolia query `01KTDCSWGYZAGANJZYY4E3MDGF` was created at `2026-06-06T02:40:16.707Z` and reached `PROOF_GENERATION_AND_VERIFICATION` with worker `L`, stable program, integrity-fact, and SHARP-fact hashes, and `errorReason: null`. The first one-hour client poll timed out while the Atlantic job remained `IN_PROGRESS`; this was not a query failure.

Do not resubmit the 80 MB PIE when a local poll times out. Resume the existing server-side query instead:

```sh
cd packages/hardhat
node scripts/submitAtlanticMerkle.mjs --real --testnet \
  --result PROOF_VERIFICATION_ON_L1 \
  --declared-job-size L --layout all_cairo \
  --query-id 01KTDCSWGYZAGANJZYY4E3MDGF \
  --interval-ms 15000 --timeout-ms 3600000
```

A healthy resumed query prints `resuming`, preserves transaction/proof job id `01KTDCWKTKZWTPP135JDHPZGHK`, and performs no artifact upload. Treat a client timeout as service latency unless the query itself reaches `FAILED` or returns a concrete quota, payment, or VM error.

## Pitfall: Artifact Shape Matters

Observed earlier:

- Some proving-profile artifacts and single executable-Sierra artifacts failed in Atlantic before the later narrowing work.
- The most reliable diagnostic shape has been a normal single-target package built in the dev profile, using the generated `target/dev/<package>.sierra.json`.

Rule of thumb:

```sh
source /home/yavor/.bashrc
cd packages/stwo-cairo/stwo_cairo_verifier
scarb --profile dev build --package <atlantic_stwo_diagnostic> --features <features>
```

Then submit `target/dev/<atlantic_stwo_diagnostic>.sierra.json` with `--result TRACE_GENERATION --layout all_cairo`.

## Recommended Support Repro Bundle

If contacting Atlantic/Herodotus, provide these as compact repro evidence:

- `multi_pop_front::<6>` failure/fix:
  - failing `01KTCQMTN6EJ3KAA5C215JVJ6R`
  - passing `01KTCQKCP7H6A6TATH3EHR6C1W`
  - passing after patch `01KTCQS0FJSKMWNBJKPACKJ9M7`
- Poseidon packed transcript failure:
  - simple Poseidon passed `01KTCR7HYKH63JYS927C8480X0`
  - pack-only passed `01KTCRQVRVCZ4NSQA9BWFEZAWN`
  - packed hash failed `01KTCRS5JANXN07GNX7FH6V4EC`
- Blake boxed-hash failure/fix:
  - one boxed `Blake2sHash` failed `01KTCW05AN2XZ6F5N67EMHCHFX`
  - manual boxed array passed `01KTCW1EWAV4CFSPWRXVRS5248`
  - fixed-array `Blake2sHash` passed `01KTCWAPGM8GDPE7FF2P14C2WX`
- Blake helper failure:
  - direct finalize64 passed `01KTCX6QSJXAMS6HDNADWGYGB1`
  - `hash_u32s(16 words)` failed `01KTCX41FV8T2JA9KC8S0535TM`
  - indexed block-reader variant still failed `01KTCXC9PQ1TA5M9MH8QZWZ33R`
- task-PIE route:
  - nested bootloader failed `01KTDA65C2YD2GN4WJJ0YD6D0K`
  - corrected smoke task PIE passed `01KTDC9B4VDVVMCFF2KSGHASKE`
  - corrected full task PIE passed on `L` `01KTDCJHAK2QHS0TVAC5JF1VTJ`

## Claim Boundary

The correct status while real query `01KTDCSWGYZAGANJZYY4E3MDGF` remains `IN_PROGRESS` is:

- local STARK proving works;
- local recursive verification works;
- the full public recursive-verifier task PIE passes Atlantic trace generation on an `L` worker;
- public Cairo fixture fact registration works on mocked Sepolia;
- real proof-backed Sepolia registration has been submitted and is pending, not blocked;
- production-private transfers are not yet demonstrated because proof and Cairo PIE leakage have not been audited and the fixture still uses a toy application hash.

Do not claim real Ethereum L1 completion until the query reaches `DONE` and the Sepolia Satellite returns `valid: true` with `isMocked: false`.
