import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { buildMerkleProof, buildMerkleRoot, toHex } from "./poseidon2";

const CIRCUITS_DIR = path.resolve(__dirname, "../../../packages/circuits");
const TRANSFER_DIR = path.join(CIRCUITS_DIR, "transfer");
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
  oldNote: { value: number; owner: string; nonce: number; asset: number },
  newNotes: { value: number; owner: string; nonce: number; asset: number }[],
  nullifier: string,
  commitments: string[],
  root: string,
  merkleLength: number,
  merkleIndices: boolean[],
  merkleSiblings: string[],
): string {
  const cli = getProvekitCli();
  const proofPath = path.join(TRANSFER_DIR, "proof.np");
  const evmDir = path.join(TRANSFER_DIR, "evm");
  const proverTomlPath = path.join(TRANSFER_DIR, "Prover.toml");

  const indicesArr = Array(MAX_DEPTH).fill(false);
  const siblingsArr: string[] = Array(MAX_DEPTH).fill('"0"');

  for (let i = 0; i < merkleLength; i++) {
    indicesArr[i] = merkleIndices[i];
    siblingsArr[i] = `"${merkleSiblings[i]}"`;
  }

  const newNotesToml = newNotes
    .map(
      n => `[[new_notes]]
asset = ${n.asset}
nonce = ${n.nonce}
owner = "${n.owner}"
value = ${n.value}`,
    )
    .join("\n\n");

  const proverToml = `new_notes_commitments = [${commitments.map(c => `"${c}"`).join(", ")}]
nullifier = "${nullifier}"
published_root = "${root}"

[merkle_proof]
indices = [${indicesArr.join(", ")}]
length = ${merkleLength}
siblings = [${siblingsArr.join(", ")}]

${newNotesToml}

[old_note]
asset = ${oldNote.asset}
nonce = ${oldNote.nonce}
owner = "${oldNote.owner}"
value = ${oldNote.value}
`;

  fs.writeFileSync(proverTomlPath, proverToml);

  console.log("Generating transfer proof...");
  execSync(`${cli} prove -p ${path.join(TRANSFER_DIR, "transfer.pkp")} -i ${proverTomlPath} -o ${proofPath}`, {
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
  const receiverAddress = process.env.RECEIVER_ADDRESS;
  if (!receiverAddress) throw new Error("RECEIVER_ADDRESS env var required");
  const receiverNonce = parseInt(process.env.RECEIVER_NONCE ?? "1");
  // changeNonce must produce a commitment never seen before in the tree.
  // We defer setting it until after we know treeSize (see below).

  const senderField = BigInt(signer.address).toString();
  const receiverField = BigInt(receiverAddress).toString();

  console.log("Computing Sender's commitment + nullifier...");
  const { commitment: senderCommitment, nullifier } = computeNoteValues(amount, senderField, nonce, assetId);
  console.log("Nullifier:", nullifier);

  console.log("Computing Receiver's commitment...");
  const { commitment: receiverCommitment } = computeNoteValues(amount, receiverField, receiverNonce, assetId);
  console.log("Receiver's commitment:", receiverCommitment);

  const treeSize = Number(await pool.treeSize());
  const treeDepth = Number(await pool.treeDepth());
  // Default changeNonce = treeSize + 10000, guaranteed unique (tree only grows).
  const changeNonce = parseInt(process.env.CHANGE_NONCE ?? String(treeSize + 10_000));
  const { commitment: changeCommitment } = computeNoteValues(0, senderField, changeNonce, assetId);

  const root = await pool.currentRoot();
  const rootHex = "0x" + root.toString(16);
  console.log("Tree size:", treeSize, "  depth:", treeDepth);
  console.log("Merkle root:", rootHex);

  // --- Build Merkle proof for sender's note ---
  let merkleLength: number;
  let merkleIndices: boolean[];
  let merkleSiblings: string[];

  if (treeSize <= 1) {
    merkleLength = 0;
    merkleIndices = [];
    merkleSiblings = [];
  } else {
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

    // Verify our TypeScript Poseidon2 matches the on-chain root
    const computedRoot = buildMerkleRoot(leafMap, treeDepth);
    if (computedRoot !== root) {
      throw new Error(
        `Poseidon2 root mismatch! TS computed: ${toHex(computedRoot)}, on-chain: ${toHex(root)}\n` +
          `Leaf map: ${JSON.stringify([...leafMap.entries()].map(([k, v]) => [k, toHex(v)]))}`,
      );
    }
    console.log("Merkle root verified ✓");

    const senderLeafIndex = Number(await pool.commitmentIndex(BigInt(senderCommitment)));
    console.log("Sender leaf index:", senderLeafIndex);

    const proof = buildMerkleProof(leafMap, senderLeafIndex, treeDepth);
    merkleLength = proof.length;
    merkleIndices = proof.indices;
    merkleSiblings = proof.siblings.map(toHex);
  }

  const proof = generateProof(
    { value: amount, owner: senderField, nonce, asset: assetId },
    [
      { value: amount, owner: receiverField, nonce: receiverNonce, asset: assetId },
      { value: 0, owner: senderField, nonce: changeNonce, asset: assetId },
    ],
    nullifier,
    [receiverCommitment, changeCommitment],
    rootHex,
    merkleLength,
    merkleIndices,
    merkleSiblings,
  );

  console.log("Transferring...");
  const tx = await pool.transfer(
    root,
    BigInt(nullifier),
    [BigInt(receiverCommitment), BigInt(changeCommitment)],
    proof,
    { gasLimit: 3_000_000 },
  );
  const receipt = await tx.wait();

  console.log("Transfer successful! tx:", receipt?.hash);
  console.log("\nReceiver's note (share with recipient for withdrawal):");
  console.log(`  AMOUNT=${amount}`);
  console.log(`  NONCE=${receiverNonce}`);
  console.log(`  OWNER=${receiverAddress}`);
}

main().catch(console.error);
