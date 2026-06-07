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

The frontend defaults to Sepolia. To read local Hardhat contract data, switch the app network selector to Hardhat after the local chain and deployment are running.

## Sepolia deployment

`scaffold.config.ts` includes both Hardhat and Sepolia. Sepolia points at the deployed `ShieldedPool` contract:

```text
0x312D2afF3bAE86C7858Ef252e7684E28A4A95603
```

When the wallet is connected to Sepolia, the contract mirror panel reads the live tree size, tree depth, and current root from that deployment.

Deposit and Withdraw can also run through the local Next.js backend when these server-side environment variables are set before `yarn start`:

```bash
export __RUNTIME_DEPLOYER_PRIVATE_KEY=<sepolia-private-key>
export PROVEKIT_CLI=/tmp/provekit-evm-export/target/release/provekit-cli
export PATH="$HOME/.nargo/bin:$PATH"
yarn start
```

The backend route is:

```text
/api/shielded-pool/live
```

It generates Provekit proofs locally, submits Sepolia transactions, stores non-secret demo note metadata in `packages/nextjs/.shielded-demo-notes.json`, and returns Etherscan transaction links to the UI. Transfer remains a browser-safe demo flow for now.

## Sepolia proof test scripts

The merged proof-verification branch includes Hardhat scripts for live Sepolia deposit and withdraw tests. Keep the deployer key in your shell environment only:

```bash
export __RUNTIME_DEPLOYER_PRIVATE_KEY=<sepolia-private-key>
export PROVEKIT_CLI=/tmp/provekit-evm-export/target/release/provekit-cli
export PATH="$HOME/.nargo/bin:$PATH"
```

Run a 1 wei deposit with a fresh nonce:

```bash
AMOUNT=1 NONCE=<fresh-nonce> yarn workspace @se-2/hardhat hardhat run scripts/testDeposit.ts --network sepolia
```

Run withdraw with the note's nonce and Merkle proof data:

```bash
AMOUNT=1 NONCE=<same-nonce> LEAF_INDEX=<leaf-index> SIBLINGS=<comma-separated-siblings> \
  yarn workspace @se-2/hardhat hardhat run scripts/testWithdraw.ts --network sepolia
```

The deployed contract currently uses native Sepolia ETH for deposit/withdraw value, with Sepolia ETH also paying gas.

## Environment

Optional environment variables for wallet/RPC integration:

```bash
NEXT_PUBLIC_ALCHEMY_API_KEY=<alchemy-api-key>
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<wallet-connect-project-id>
```
