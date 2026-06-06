# Shielded Pool — API Spec

## Contract entry points

```solidity
function deposit(
    uint256 amount,
    uint256 assetId,
    uint256 commitment,
    bytes calldata zkProof
) external nonReentrant returns (uint256 leafIndex, uint256 newRoot)

function transfer(...) // TODO

function withdraw(...) // TODO
```

Tokens are ERC20. `assetId` is the token contract address cast to `uint256`.

## Deposit public inputs (circuit)

| Parameter    | Description                                         |
|--------------|-----------------------------------------------------|
| `amount`     | ERC20 token amount deposited                        |
| `assetId`    | Token contract address (cast to uint256)            |
| `commitment` | Note commitment inserted as a Merkle tree leaf      |

## Note commitment

```
cm = Poseidon2(NOTE_COMMITMENT_DOMAIN, value, owner, nonce)
```

## Nullifier

```
nullifier = Poseidon2(NULLIFIER_DOMAIN, nonce, owner)
```

## Merkle tree

- LeanIMT (zk-kit) with PoseidonT3 node hashing
- Leaves are note commitments
- Grows on every deposit/transfer, never shrinks
- Last 100 roots are remembered (`ROOT_HISTORY_SIZE = 100`) so proofs stay valid across blocks

## Three separate functions

Deposit, transfer and withdraw are separate functions each with their own verifier interface. This follows the Zcash Sapling model (separate Spend/Output descriptions) rather than the Sprout unified JoinSplit.

| Function    | Tokens in | Tokens out | Nullifiers | New commitments |
|-------------|-----------|------------|------------|-----------------|
| `deposit`   | yes       | no         | no         | yes             |
| `transfer`  | no        | no         | yes        | yes             |
| `withdraw`  | no        | yes        | yes        | no              |

## Encryption

Output notes are encrypted with ML-KEM-768 for off-chain recipient discovery.

## Circuit arity

- 2 input notes, 2 output notes (dummy padding allowed)
- Proof backend: Noir + ProveKit (WHIR inner) -> Groth16 outer
