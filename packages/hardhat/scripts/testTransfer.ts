import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

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
): string {
  const cli = getProvekitCli();
  const proofPath = path.join(TRANSFER_DIR, "proof.np");
  const evmDir = path.join(TRANSFER_DIR, "evm");
  const proverTomlPath = path.join(TRANSFER_DIR, "Prover.toml");

  const indicesArr = Array(MAX_DEPTH).fill(false);
  const siblingsArr = Array(MAX_DEPTH).fill(0);

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
length = 0
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

  const senderField = BigInt(signer.address).toString();
  const receiverField = BigInt(receiverAddress).toString();

  console.log("Computing Sender's nullifier...");
  const { nullifier } = computeNoteValues(amount, senderField, nonce, assetId);
  console.log("Nullifier:", nullifier);

  console.log("Computing Receiver's commitment...");
  const { commitment: receiverCommitment } = computeNoteValues(amount, receiverField, receiverNonce, assetId);
  console.log("Receiver's commitment:", receiverCommitment);

  // Second output: zero-value change note back to Sender
  const changeNonce = parseInt(process.env.CHANGE_NONCE ?? "2");
  const { commitment: changeCommitment } = computeNoteValues(0, senderField, changeNonce, assetId);

  const root = await pool.currentRoot();
  const rootHex = "0x" + root.toString(16);
  console.log("Merkle root:", rootHex);

  // NOTE: length=0 Merkle proof only valid when Sender's note is the sole leaf in the tree.
  const proof = generateProof(
    { value: amount, owner: senderField, nonce, asset: assetId },
    [
      { value: amount, owner: receiverField, nonce: receiverNonce, asset: assetId },
      { value: 0, owner: senderField, nonce: changeNonce, asset: assetId },
    ],
    nullifier,
    [receiverCommitment, changeCommitment],
    rootHex,
  );

  console.log("Transferring...");
  const tx = await pool.transfer(
    root,
    BigInt(nullifier),
    [BigInt(receiverCommitment), BigInt(changeCommitment)],
    proof,
    {
      gasLimit: 3_000_000,
    },
  );
  const receipt = await tx.wait();

  console.log("Transfer successful! tx:", receipt?.hash);
  console.log("\nSend Receiver these values to let him withdraw:");
  console.log(`  RECEIVER_NONCE=${receiverNonce}`);
  console.log(`  AMOUNT=${amount}`);
}

main().catch(console.error);
