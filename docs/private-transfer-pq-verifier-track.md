# Private Transfer PQ Verifier Track

This track explores replacing the current provekit/Groth16 verifier path with a post-quantum STARK/Cairo fact-verification path while preserving the existing private-transfer system.

## Current Working System

- Pool contract: `packages/hardhat/contracts/ShieldedPool.sol`
- Existing verifier interfaces:
  - `IDepositVerifier`
  - `ITransferVerifier`
  - `IWithdrawVerifier`
- Current Noir circuits:
  - `packages/circuits/deposit/src/main.nr`
  - `packages/circuits/transfer/src/main.nr`
- Current on-chain provekit verifier artifacts:
  - `packages/hardhat/contracts/DepositVerifier.sol`
  - `packages/circuits/Verifier.sol`
  - `packages/circuits/ProvekitGroth16Verifier.sol`

The pool is already verifier-abstracted. That is the key migration point: do not rewrite `ShieldedPool` or remove the provekit path. Add verifier contracts that implement the same interfaces and deploy a parallel pool configuration that points at the new verifier.

## Additive PQ Adapter Strategy

`CairoShieldedPoolVerifier.sol` implements all three existing verifier interfaces. It treats `bytes zkProof` as ABI-encoded `uint256[] cairoOutputs`, checks that those outputs match the pool calldata, and then checks that the corresponding Cairo fact is registered in an `ICairoFactRegistry`.

This is not yet a complete private-transfer STARK circuit. It is the on-chain adapter layer needed so that a Cairo/STARK proof can be substituted without changing pool semantics. The first Cairo statement package is now implemented at `packages/cairo-shielded-pool`.

## Cairo Output Convention

The adapter binds facts to public pool inputs with an explicit operation tag:

The adapter verifies the full serialized Cairo return array, so the first word is the array length.

Deposit:

```text
[4, 1, amount, assetId, commitment]
```

Transfer:

```text
[4 + outputCount, 2, root, inputNullifier, outputCount, outputCommitment0, ...]
```

Withdraw:

```text
[5, 3, root, inputNullifier, uint160(recipient), amount]
```

The fact hash follows the same formula as `CairoFactVerifier`:

```text
outputHash = keccak256(abi.encodePacked(outputs))
factHash = keccak256(abi.encode(programHash, outputHash))
```

## Safety Notes

- The existing provekit contracts and tests remain intact.
- The adapter rejects facts that do not exactly bind to the Solidity calldata.
- A real Cairo private-transfer circuit still needs to emit these outputs after proving the private constraints.
- Atlantic remains unsafe for private witnesses because it is remote proving. Use local proving for real private-transfer witnesses.

## Implemented Prototype

- `packages/cairo-shielded-pool` defines Cairo executable statements for deposit, transfer, and withdraw.
- `packages/hardhat/contracts/CairoShieldedPoolVerifier.sol` implements the existing `ShieldedPool` verifier interfaces and checks Cairo fact hashes.
- `packages/hardhat/test/CairoShieldedPoolVerifier.ts` exercises deposits, private transfers, and withdrawals through `ShieldedPool` with a mocked Cairo fact registry.
- The root scripts `cairo:shielded-pool:prove-stone:{deposit,transfer,withdraw}` run local Stone proving and verification without Atlantic.

## Local Proof Status

Deposit, transfer, and withdraw were locally executed, proved with Stone, and verified with the local Stone verifier on 2026-06-06 machine time. All three used layout `starknet` and `n_steps=131072`. Public memory sizes were `459` for deposit, `986` for transfer, and `813` for withdraw. The generated proof artifacts are `packages/cairo-shielded-pool/target/local-proofs/stone/{deposit,transfer,withdraw}-stone-proof.json`, which are intentionally ignored.

## Full-Bootloader Transfer Verification

The transfer statement now has the stronger direct-verifier result. On 2026-06-06 machine time, it was executed through the full bootloader, proved locally with the legacy-GPS Stone prover, split into adapter verifier payloads, and accepted by the deployed StarkWare GPS verifier contracts on a local Hardhat mainnet fork.

Observed values:

- AIR: `layout=starknet`, `n_steps=131072`, `publicMemory=760`
- topology: `{"fact_topologies":[{"tree_structure":[1,0],"page_sizes":[7]}]}`
- split proof: `main_proof_words=540`, `trace_merkle_statements=3`, `fri_merkle_statements=8`, `continuous_memory_pages=1`
- fork verifier gas: `6,612,319` total, final main proof `2,677,661`

This is not Sepolia yet. It is a local mainnet fork exercising deployed mainnet GPS verifier bytecode. It is still useful because proof generation is local and only proof/public verifier calldata is submitted to the verifier contracts.

Reproduce from the repo root after starting a fork:

```sh
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer:fork
```

If no fork is running, start one first:

```sh
corepack yarn workspace @se-2/hardhat hardhat node --network hardhat --fork https://mainnet.rpc.buidlguidl.com --no-deploy
```
## Remaining Work

- Replace the current prototype constraints with the final private-transfer statement semantics, especially variable output counts and real note encryption/nullifier conventions.
- Register real Cairo facts on Sepolia/mainnet for locally generated proofs, then point `CairoShieldedPoolVerifier` at a non-mocked registry. The local mainnet-fork GPS verifier path now works for the transfer statement.
- Decide whether the final L1 path is SHARP/Satellite fact registration or direct deployed GPS verifier calls; never use remote proving for private witnesses.
