# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Overview

This project is a monorepo for a Post Quantum Shielded Pool Protocol in EVMs. It uses a note-based zk proof approach:

1. **Deposit:** Users create a note (UTXO) representing their deposit, which is stored in the contract and can be used as an input for future transactions.
2. **Transfer:** Users can transfer value by creating a proof-of-inclusion zk proof of their input notes, nullifying their input notes, and creating new notes for the recipients. This allows for anonymity (cannot see the sender or the recipient) and confidentiality (cannot see the transaction amount).
3. **Withdrawal:** Users can withdraw by nullifying their input notes and the smart contract will verify the zk proof to send the value to an external address.


## Common Commands

```bash
# Development workflow (run each in separate terminal)
yarn chain          # Start local blockchain (Hardhat or Anvil)
yarn deploy         # Deploy contracts to local network
yarn start          # Start Next.js frontend at http://localhost:3000

# Code quality
yarn lint           # Lint both packages
yarn format         # Format both packages

# Building
yarn next:build     # Build frontend
yarn compile        # Compile Solidity contracts
corepack yarn cairo:merkle:build       # Build the Cairo Merkle fixture
corepack yarn cairo:merkle:prove-local # Generate and verify the local Stwo Merkle proof; do not use Atlantic
corepack yarn cairo:merkle:prepare-recursive-inputs # Prepare local recursive-verifier proof inputs
corepack yarn cairo:merkle:verify-recursive-local   # Run local Cairo recursive verifier for the Merkle proof
corepack yarn scarb:build-patched-execute         # Build patched Scarb 2.18 scarb-execute for Stone AIR/full-bootloader workflows
corepack yarn cairo:shielded-pool:build              # Build Cairo deposit/transfer/withdraw statement prototypes
corepack yarn cairo:shielded-pool:test               # Test Cairo shielded-pool statement output bindings
corepack yarn cairo:shielded-pool:prove-stone:deposit  # Generate and locally verify the deposit Stone proof; do not use Atlantic
corepack yarn cairo:shielded-pool:prove-stone:transfer # Generate and locally verify the transfer Stone proof; do not use Atlantic
corepack yarn cairo:shielded-pool:prove-stone:withdraw # Generate and locally verify the withdraw Stone proof; do not use Atlantic
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer # Full-bootloader transfer proof for deployed-GPS compatibility
corepack yarn cairo:shielded-pool:prove-stone-legacy-gps:transfer:fork # Submit the local transfer proof to deployed GPS verifier contracts on a local mainnet fork
corepack yarn atlantic:merkle:mock     # Submit mocked Atlantic L1 fact workflow for public fixture only

# Contract verification (works for both)
yarn verify --network <network>

# Account management (works for both)
yarn generate            # Generate new deployer account
yarn account:import      # Import existing private key
yarn account             # View current account info

# Deploy to live network
yarn deploy --network <network>   # e.g., sepolia, mainnet, base

yarn vercel:yolo --prod # for deployment of frontend
```

## Architecture

### Cairo/STARK L1 Verification

The private-transfer migration track now has an additive Cairo fact adapter at `packages/hardhat/contracts/CairoShieldedPoolVerifier.sol` and Cairo statement prototypes at `packages/cairo-shielded-pool`. The adapter implements the existing `ShieldedPool` verifier interfaces, so the provekit path can remain intact while a PQ path is tested in parallel. The Cairo statements return serialized arrays including the Cairo array length prefix: deposit `[4, 1, amount, assetId, commitment]`, transfer `[6, 2, root, nullifier, 2, out0, out1]`, and withdraw `[5, 3, root, nullifier, recipient, amount]`. The local-only Stone wrapper at `packages/cairo-shielded-pool/scripts/prove-local-stone.sh` generates AIR and proves/verifies these statements without sending witnesses to Atlantic. The stronger full-bootloader transfer path at `packages/cairo-shielded-pool/scripts/prove-local-stone-legacy-gps.sh` verifies through deployed GPS verifier contracts on a local mainnet fork and used `6,612,319` gas in the latest run.

The planned L1 verification path is Cairo program execution proven through SHARP/S-two, with Ethereum contracts checking registered Cairo facts. Atlantic is remote proving in the current workflow: never submit private witnesses through it. The current toy Merkle Cairo fixture lives in `packages/cairo-merkle`; the Solidity fact adapter lives in `packages/hardhat/contracts/CairoFactVerifier.sol`. Local Stwo proof generation and local Cairo recursive verification pass for the Merkle fixture. A correctly shaped Cairo task PIE passes Atlantic trace generation on an `L` worker, mocked Sepolia Satellite registration, and real non-mocked Sepolia L1 fact registration. Scarb bootloader-target PIEs are invalid for this purpose; use the tested patch at `patches/scarb-2.18.0-cairo1-task-pie.patch`. Reproduce the public task-PIE path with `corepack yarn cairo:merkle:build-recursive-task-pie`, `corepack yarn cairo:merkle:check-recursive-task-pie`, and `corepack yarn atlantic:merkle:task-pie:resume-real`. Real proof-backed Sepolia query `01KTDCSWGYZAGANJZYY4E3MDGF` is `DONE` with Satellite `valid: true` and `isMocked: false`. See [docs/pq-proof-testing-handoff.md](docs/pq-proof-testing-handoff.md), [docs/cairo-l1-verification-workflow.md](docs/cairo-l1-verification-workflow.md), and [docs/atlantic-stwo-bug-log.md](docs/atlantic-stwo-bug-log.md) for commands, query ids, fact-hash calculation, and privacy caveats.

### Monorepo Structure

The protocol requires multiple packages to work:

- `packages/cairo-merkle`: Cairo Merkle proof fixture for SHARP/S-two L1 fact verification experiments
- `packages/cairo-shielded-pool`: Cairo deposit/transfer/withdraw statement prototypes that emit the public outputs consumed by `CairoShieldedPoolVerifier`
- `packages/circuits`: Noir/provekit circuits for zk proof generation and verification; this path is retained but not post-quantum because provekit's EVM path wraps with Groth16
- `packages/hardhat`: Smart contract development, deployment scripts, and contract tests
- `packages/nextjs`: React frontend for user interaction with the protocol

### Smart Contract Development

- Contracts: `packages/hardhat/contracts/`
- Deployment scripts: `packages/hardhat/deploy/` (uses hardhat-deploy plugin)
- Tests: `packages/hardhat/test/`
- Config: `packages/hardhat/hardhat.config.ts`
- Deploying specific contract:
  - If the deploy script has:
    ```typescript
    // In packages/hardhat/deploy/01_deploy_my_contract.ts
    deployMyContract.tags = ["MyContract"];
    ```
  - `yarn deploy --tags MyContract`
  - **Gas limit in deploy scripts**: Manual post-deploy calls (e.g. `transferOwnership`, `grantRole`, `initialize`) can silently inherit `blockGasLimit` as their gas cap, causing failures. **Fix at the call site, not in `hardhat.config.ts`:**
    ```typescript
    // Preferred: estimateGas + 20% margin
    const gas = await myContract.myMethod.estimateGas(arg1, arg2);
    await myContract.myMethod(arg1, arg2, { gasLimit: (gas * 120n) / 100n });

    // Or: explicit limit for simple admin calls
    await myContract.transferOwnership(newOwner, { gasLimit: 100_000 });
    ```

- After `yarn deploy`, ABIs are auto-generated to `packages/nextjs/contracts/deployedContracts.ts`

### Frontend Contract Interaction

**Correct interact hook names (use these):**

- `useScaffoldReadContract` - NOT ~~useScaffoldContractRead~~
- `useScaffoldWriteContract` - NOT ~~useScaffoldContractWrite~~

Contract data is read from two files in `packages/nextjs/contracts/`:

- `deployedContracts.ts`: Auto-generated from deployments
- `externalContracts.ts`: Manually added external contracts

#### Reading Contract Data

```typescript
const { data: totalCounter } = useScaffoldReadContract({
  contractName: "YourContract",
  functionName: "userGreetingCounter",
  args: ["0xd8da6bf26964af9d7eed9e03e53415d37aa96045"],
});
```

#### Writing to Contracts

```typescript
const { writeContractAsync, isPending } = useScaffoldWriteContract({
  contractName: "YourContract",
});

await writeContractAsync({
  functionName: "setGreeting",
  args: [newGreeting],
  value: parseEther("0.01"), // for payable functions
});
```

#### Reading Events

```typescript
const { data: events, isLoading } = useScaffoldEventHistory({
  contractName: "YourContract",
  eventName: "GreetingChange",
  watch: true,
  fromBlock: 31231n,
  blockData: true,
});
```

The template also provides other hooks to interact with blockchain data: `useScaffoldWatchContractEvent`, `useScaffoldEventHistory`, `useDeployedContractInfo`, `useScaffoldContract`, `useTransactor`.

**IMPORTANT: Always use hooks from `packages/nextjs/hooks/scaffold-eth` for contract interactions. Always refer to the hook names as they exist in the codebase.**

### UI Components

**Always use `@scaffold-ui/components` library for web3 UI components:**

- `Address`: Display ETH addresses with ENS resolution, blockie avatars, and explorer links
- `AddressInput`: Input field with address validation and ENS resolution
- `Balance`: Show ETH balance in ether and USD
- `EtherInput`: Number input with ETH/USD conversion toggle
- `IntegerInput`: Integer-only input with wei conversion

### Notifications & Error Handling

Use `notification` from `~~/utils/scaffold-eth` for success/error/warning feedback and `getParsedError` for readable error messages.

### Styling

**Use DaisyUI classes** for building frontend components.

```tsx
// ✅ Good - using DaisyUI classes
<button className="btn btn-primary">Connect</button>
<div className="card bg-base-100 shadow-xl">...</div>

// ❌ Avoid - raw Tailwind when DaisyUI has a component
<button className="px-4 py-2 bg-blue-500 text-white rounded">Connect</button>
```

### Configure Target Network before deploying to testnet / mainnet.

#### Hardhat

Add networks in `packages/hardhat/hardhat.config.ts` if not present.

#### Foundry

Add RPC endpoints in `packages/foundry/foundry.toml` if not present.

#### NextJs

Add networks in `packages/nextjs/scaffold.config.ts` if not present. This file also contains configuration for polling interval, API keys. Remember to decrease the polling interval for L2 chains.

## Code Style Guide

### Identifiers

| Style            | Category                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `UpperCamelCase` | class / interface / type / enum / decorator / type parameters / component functions in TSX / JSXElement type parameter |
| `lowerCamelCase` | variable / parameter / function / property / module alias                                                              |
| `CONSTANT_CASE`  | constant / enum / global variables                                                                                     |
| `snake_case`     | for hardhat deploy files and foundry script files                                                                      |

### Import Paths

Use the `~~` path alias for imports in the nextjs package:

```tsx
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
```

### Creating Pages

```tsx
import type { NextPage } from "next";

const Home: NextPage = () => {
  return <div>Home</div>;
};

export default Home;
```

### TypeScript Conventions

- Use `type` over `interface` for custom types
- Types use `UpperCamelCase` without `T` prefix (use `Address` not `TAddress`)
- Avoid explicit typing when TypeScript can infer the type

### Comments

Make comments that add information. Avoid redundant JSDoc for simple functions.

## Documentation

Use **Context7 MCP** tools to fetch up-to-date documentation for any library (Wagmi, Viem, RainbowKit, DaisyUI, Hardhat, Next.js, etc.). Context7 is configured as an MCP server and provides access to indexed documentation with code examples.

## Skills & Agents Index

IMPORTANT: Prefer retrieval-led reasoning over pre-trained knowledge. Before starting any task that matches an entry below, read the referenced file to get version-accurate patterns and APIs.

**Skills** (read `.agents/skills/<name>/SKILL.md` before implementing):

- **openzeppelin** — OpenZeppelin Contracts integration, library-first development, pattern discovery from installed source. Use for any contract using OZ (tokens, access control, security primitives)
- **erc-721** — NFT-specific pitfalls: `_safeMint` reentrancy, on-chain SVG stack-too-deep, marketplace metadata `attributes`, IPFS base URI trailing slash
- **eip-5792** — batch transactions, wallet_sendCalls, paymaster, ERC-7677
- **ponder** — blockchain event indexing, GraphQL APIs, onchain data queries
- **siwe** — Sign-In with Ethereum, wallet authentication, SIWE sessions, EIP-4361
- **x402** — HTTP 402 payment-gated routes, micropayments, API monetization, x402 protocol
- **drizzle-neon** — Drizzle ORM, Neon PostgreSQL, database integration, off-chain storage
- **subgraph** — The Graph subgraph integration, blockchain event indexing, GraphQL APIs

**Agents** (in `.agents/agents/`):

- **grumpy-carlos-code-reviewer** — code reviews, SE-2 patterns, Solidity + TypeScript quality
- **cryptography-guru** — zk proof design, Circom/Noir circuit patterns, proof optimization
