# Post Quantum Shielded Pool

## Notice

Please read the [AGENTS.md](/AGENTS.md) file for information about the Post Quantum Shielded Pool project, its architecture, and design choices. We should keep that file as the single source of truth for team mates and AI agents working on this project.

## ShieldedPool local runbook

Run the local chain, deploy the contracts, and exercise the pool with the exported Groth16 EVM proof artifacts:

```bash
yarn chain
```

In a second terminal:

```bash
yarn deploy
yarn smoke:shielded-pool
```

The smoke script uses `packages/circuits/{deposit,transfer,withdraw}/evm/proof.hex` and `inputs.txt`. It verifies:

- `deposit` transfers ERC20 tokens into `ShieldedPool`, verifies the deposit proof, and inserts the commitment.
- `transfer` verifies the transfer proof, spends the input nullifier, and inserts two output commitments.
- `withdraw` verifies the withdrawal proof, spends the nullifier, and releases ERC20 tokens to a public recipient.

The current fixture set proves transfer and withdraw from the same deposited root, so the smoke script uses one fresh pool for deposit-to-transfer and one fresh pool for deposit-to-withdraw. Contract-level tests cover the revert paths, root history, double-spend checks, malformed proofs, and verifier input validation:

```bash
yarn hardhat:test
```

Proof bytes are submitted as transaction calldata. They are public in the transaction input, but `ShieldedPool` does not store or emit them; it only stores protocol state such as commitments, roots, nullifiers, and token balances.

## ShieldedPool testnet deployment

The deploy scripts support both a demo token and an existing ERC20:

- If `SHIELDED_POOL_TOKEN_ADDRESS` is unset, `yarn deploy --network <network>` deploys `SE2Token` and uses its address as the default asset id.
- If `SHIELDED_POOL_TOKEN_ADDRESS` is set, `SE2Token` deployment is skipped and `ShieldedPool` is configured with that ERC20.
- `SHIELDED_POOL_ASSET_ID` is optional. If unset, it defaults to the token address interpreted as a uint256. If set, use a non-zero decimal or `0x`-prefixed integer.

Typical Sepolia deployment:

```bash
yarn account:import
export ALCHEMY_API_KEY=<alchemy-key>
export ETHERSCAN_V2_API_KEY=<etherscan-v2-key>
export SHIELDED_POOL_TOKEN_ADDRESS=<erc20-token-address>
export SHIELDED_POOL_ASSET_ID=<asset-id>
yarn deploy --network sepolia
yarn verify --network sepolia
```

Before broadcasting to a testnet, run:

```bash
yarn hardhat:check-types
yarn hardhat:lint
yarn hardhat:test
```

The checked-in Solidity verifiers and EVM proof fixtures are Groth16-wrapped artifacts. If your default `provekit-cli` only exposes `prepare`, `prove`, and `verify`, build a Provekit branch that includes `export-solidity` and `export-evm-proof`; `origin/rs/verifying_contract` at commit `dd237e54` was verified locally for fresh deposit EVM proof export.

```bash
git clone https://github.com/worldfnd/provekit /tmp/provekit-evm-export
cd /tmp/provekit-evm-export
git checkout rs/verifying_contract
cargo build --release -p provekit-cli
cd /path/to/pq-shielded-pool
PROVEKIT_CLI=/tmp/provekit-evm-export/target/release/provekit-cli yarn circuits:evm
```

`yarn circuits:evm` regenerates `deposit`, `transfer`, and `withdraw` `.pkp`, `.pkv`, `proof.np`, `evm/proof.hex`, `evm/inputs.txt`, and `Verifier.sol`, then syncs the renamed verifier contracts into `packages/hardhat/contracts/generated`. Groth16 setup is randomized, so verifier/proof diffs are expected. Run `yarn hardhat:test` after regenerating artifacts.

## About Scaffold-ETH 2

🧪 An open-source, up-to-date toolkit for building decentralized applications (dapps) on the Ethereum blockchain. It's designed to make it easier for developers to create and deploy smart contracts and build user interfaces that interact with those contracts.

> [!NOTE]
> 🤖 Scaffold-ETH 2 is AI-ready! It has everything agents need to build on Ethereum. Check `.agents/`, `.claude/`, `.opencode` or `.cursor/` for more info.

⚙️ Built using NextJS, RainbowKit, Hardhat, Wagmi, Viem, and Typescript.

- ✅ **Contract Hot Reload**: Your frontend auto-adapts to your smart contract as you edit it.
- 🪝 **[Custom hooks](https://docs.scaffoldeth.io/hooks/)**: Collection of React hooks wrapper around [wagmi](https://wagmi.sh/) to simplify interactions with smart contracts with typescript autocompletion.
- 🧱 [**Components**](https://docs.scaffoldeth.io/components/): Collection of common web3 components to quickly build your frontend.
- 🔥 **Burner Wallet & Local Faucet**: Quickly test your application with a burner wallet and local faucet.
- 🔐 **Integration with Wallet Providers**: Connect to different wallet providers and interact with the Ethereum network.

![Debug Contracts tab](https://github.com/scaffold-eth/scaffold-eth-2/assets/55535804/b237af0c-5027-4849-a5c1-2e31495cccb1)

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v20.18.3)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Quickstart

To get started with Scaffold-ETH 2, follow the steps below:

1. Install dependencies if it was skipped in CLI:

```
cd my-dapp-example
yarn install
```

2. Run a local network in the first terminal:

```
yarn chain
```

This command starts a local Ethereum network using Hardhat. The network runs on your local machine and can be used for testing and development. You can customize the network configuration in `packages/hardhat/hardhat.config.ts`.

3. On a second terminal, deploy the test contract:

```
yarn deploy
```

This command deploys a test smart contract to the local network. The contract is located in `packages/hardhat/contracts` and can be modified to suit your needs. The `yarn deploy` command uses the deploy script located in `packages/hardhat/deploy` to deploy the contract to the network. You can also customize the deploy script.

4. On a third terminal, start your NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`. You can interact with your smart contract using the `Debug Contracts` page. You can tweak the app config in `packages/nextjs/scaffold.config.ts`.

Run smart contract test with `yarn hardhat:test`

- Edit your smart contracts in `packages/hardhat/contracts`
- Edit your frontend homepage at `packages/nextjs/app/page.tsx`. For guidance on [routing](https://nextjs.org/docs/app/building-your-application/routing/defining-routes) and configuring [pages/layouts](https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts) checkout the Next.js documentation.
- Edit your deployment scripts in `packages/hardhat/deploy`

## 🚀 Setup ERC-20 Token Extension

This extension introduces an ERC-20 token contract and demonstrates how to use interact with it, including getting a holder balance and transferring tokens.

The ERC-20 Token Standard introduces a standard for Fungible Tokens ([EIP-20](https://eips.ethereum.org/EIPS/eip-20)), in other words, each Token is exactly the same (in type and value) as any other Token.

The ERC-20 token contract is implemented using the [ERC-20 token implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol) from OpenZeppelin.

### Setup

Deploy your contract running ```yarn deploy```

### Interact with the token

Start the front-end with ```yarn start``` and go to the _/erc20_ page to interact with your deployed ERC-20 token.

You can check the code at ```packages/nextjs/app/erc20/page.tsx```.


## Documentation

Visit our [docs](https://docs.scaffoldeth.io) to learn how to start building with Scaffold-ETH 2.

To know more about its features, check out our [website](https://scaffoldeth.io).

## Contributing to Scaffold-ETH 2

We welcome contributions to Scaffold-ETH 2!

Please see [CONTRIBUTING.MD](https://github.com/scaffold-eth/scaffold-eth-2/blob/main/CONTRIBUTING.md) for more information and guidelines for contributing to Scaffold-ETH 2.
