import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { buildMerkleProof, buildMerkleRoot, toHex } from "./poseidon2";

const CIRCUITS_DIR = path.resolve(__dirname, "../../../packages/circuits");
const WITHDRAW_DIR = path.join(CIRCUITS_DIR, "withdraw");
const MAX_DEPTH = 30;

function getProvekitCli(): string {
  const cli = process.env.PROVEKIT_CLI;
  if (!cli) throw new Error("PROVEKIT_CLI env var not set.");
  if (!fs.existsSync(cli)) throw new Error(`PROVEKIT_CLI binary not found at: ${cli}`);
  return cli;
}

function computeNoteValues(
  value: number,
  owner: string,
  nonce: number,
  asset: number,
): { commitment: string; nullifier: string } {
  const helperProverToml = `value = ${value}\nowner = "${owner}"\nnonce = ${nonce}\nasset = ${asset}\n`;
  fs.writeFileSync(path.join(CIRCUITS_DIR, "note_helper", "Prover.toml"), helperProverToml);

  const output = execSync(`nargo execute --package note_helper`, {
    cwd: CIRCUITS_DIR,
    encoding: "utf8",
  });

  const match = output.match(/Circuit output: \(([^,]+), ([^)]+)\)/);
  if (!match) throw new Error(`Failed to parse nargo output: ${output}`);

  return { commitment: match[1].trim(), nullifier: match[2].trim() };
}

function generateProof(
  value: number,
  owner: string,
  nonce: number,
  asset: number,
  root: string,
  merkleLength: number,
  merkleIndices: boolean[],
  merkleSiblings: string[],
): string {
  const cli = getProvekitCli();
  const proofPath = path.join(WITHDRAW_DIR, "proof.np");
  const evmDir = path.join(WITHDRAW_DIR, "evm");
  const proverTomlPath = path.join(WITHDRAW_DIR, "Prover.toml");

  const indicesArr = Array(MAX_DEPTH).fill(false);
  const siblingsArr: string[] = Array(MAX_DEPTH).fill('"0"');

  for (let i = 0; i < merkleLength; i++) {
    indicesArr[i] = merkleIndices[i];
    siblingsArr[i] = `"${merkleSiblings[i]}"`;
  }

  const proverToml = `published_root = "${root}"
value = ${value}

[merkle_proof]
indices = [${indicesArr.join(", ")}]
length = ${merkleLength}
siblings = [${siblingsArr.join(", ")}]

[note]
asset = ${asset}
nonce = ${nonce}
owner = "${owner}"
value = ${value}
`;
  fs.writeFileSync(proverTomlPath, proverToml);

  console.log("Generating withdraw proof...");
  execSync(`${cli} prove -p ${path.join(WITHDRAW_DIR, "withdraw.pkp")} -i ${proverTomlPath} -o ${proofPath}`, {
    stdio: "inherit",
  });

  console.log("Exporting EVM proof...");
  execSync(`${cli} export-evm-proof -p ${proofPath} -o ${evmDir}`, { stdio: "inherit" });

  return fs.readFileSync(path.join(evmDir, "proof.hex"), "utf8").trim();
}

async function main() {
  const [signer] = await ethers.getSigners();

  const poolDep = await deployments.get("ShieldedPool");
  const pool = await ethers.getContractAt("ShieldedPool", poolDep.address);

  const amount = parseInt(process.env.AMOUNT ?? "5");
  const assetId = 1;
  const nonce = parseInt(process.env.NONCE ?? "0");
  const recipient = process.env.RECIPIENT ?? signer.address;

  // OWNER: defaults to signer. Receiver must set OWNER=<their address>.
  const ownerAddress = process.env.OWNER ?? signer.address;
  const ownerField = BigInt(ownerAddress).toString();

  console.log("Computing commitment and nullifier...");
  const { commitment, nullifier } = computeNoteValues(amount, ownerField, nonce, assetId);
  console.log("Commitment:", commitment);
  console.log("Nullifier:", nullifier);

  // Look up the leaf index on-chain
  const leafIndex = Number(await pool.commitmentIndex(BigInt(commitment)));
  console.log("Leaf index:", leafIndex);

  const treeSize = Number(await pool.treeSize());
  const treeDepth = Number(await pool.treeDepth());
  const root = await pool.currentRoot();
  const rootHex = "0x" + root.toString(16);
  console.log("Tree size:", treeSize, "  depth:", treeDepth);
  console.log("Merkle root:", rootHex);

  // --- Build Merkle proof ---
  let merkleLength: number;
  let merkleIndices: boolean[];
  let merkleSiblings: string[];

  if (treeSize <= 1) {
    merkleLength = 0;
    merkleIndices = [];
    merkleSiblings = [];
  } else {
    // Reconstruct leaf map from Deposit and Transfer events
    const leafMap = new Map<number, bigint>();

    for (const e of await pool.queryFilter(pool.filters.Deposit())) {
      leafMap.set(Number(e.args.leafIndex), BigInt(e.args.commitment));
    }
    for (const e of await pool.queryFilter(pool.filters.Transfer())) {
      const firstIdx = Number(e.args.firstLeafIndex);
      for (let i = 0; i < (e.args.outputCommitments as bigint[]).length; i++) {
        leafMap.set(firstIdx + i, BigInt((e.args.outputCommitments as bigint[])[i]));
      }
    }

    // Sanity-check our TypeScript Poseidon2 against the on-chain root
    const computedRoot = buildMerkleRoot(leafMap, treeDepth);
    if (computedRoot !== root) {
      throw new Error(`Poseidon2 root mismatch! TS computed: ${toHex(computedRoot)}, on-chain: ${toHex(root)}`);
    }
    console.log("Merkle root verified ✓");

    const merkleProof = buildMerkleProof(leafMap, leafIndex, treeDepth);
    merkleLength = merkleProof.length;
    merkleIndices = merkleProof.indices;
    merkleSiblings = merkleProof.siblings.map(toHex);
  }

  const proof = generateProof(amount, ownerField, nonce, assetId, rootHex, merkleLength, merkleIndices, merkleSiblings);

  console.log("Withdrawing to", recipient, "...");
  const tx = await pool.withdraw(root, BigInt(nullifier), recipient, amount, proof, { gasLimit: 500_000 });
  const receipt = await tx.wait();

  console.log("Withdrawal successful! tx:", receipt?.hash);
}

main().catch(console.error);
