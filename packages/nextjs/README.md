# PQ Shielded Pool Frontend

This package contains the Next.js demo UI for the post-quantum shielded pool.

## Run the frontend

From the repository root:

```bash
yarn install
yarn start
```

Open:

```text
http://localhost:3000
```

The demo UI works without a running chain. The `Deposit`, `Transfer`, and `Withdraw` buttons animate a local private-transfer flow, update the demo Merkle tree, and show the public inputs used by each verifier.

## Run with local contract data

To populate the contract mirror panel, run these from the repository root in separate terminals:

```bash
yarn chain
```

```bash
yarn deploy
```

```bash
yarn start
```

The frontend reads `ShieldedPool.currentRoot`, `treeSize`, and `treeDepth` from the local Hardhat deployment when available.

## Network notes

`scaffold.config.ts` includes both Hardhat and Sepolia. Sepolia is configured as a frontend target, but the shielded pool contracts are not deployed there yet, so the demo marks Sepolia as deployment pending.

Optional environment variables for wallet/RPC integration:

```bash
NEXT_PUBLIC_ALCHEMY_API_KEY=<alchemy-api-key>
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<wallet-connect-project-id>
```
