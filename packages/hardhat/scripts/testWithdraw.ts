import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

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

function generateProof(value: number, owner: string, nonce: number, asset: number, root: string): string {
  const cli = getProvekitCli();
  const proofPath = path.join(WITHDRAW_DIR, "proof.np");
  const evmDir = path.join(WITHDRAW_DIR, "evm");
  const proverTomlPath = path.join(WITHDRAW_DIR, "Prover.toml");

  const indicesArr = Array(MAX_DEPTH).fill(false);
  const siblingsArr = Array(MAX_DEPTH).fill(0);

  const proverToml = `published_root = "${root}"
value = ${value}

[merkle_proof]
indices = [${indicesArr.join(", ")}]
length = 0
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
  const ownerField = BigInt(signer.address).toString();

  console.log("Computing nullifier...");
  const { nullifier } = computeNoteValues(amount, ownerField, nonce, assetId);
  console.log("Nullifier:", nullifier);

  const root = await pool.currentRoot();
  console.log("Merkle root:", root.toString());

  // NOTE: this proof assumes a single-leaf tree (length=0 Merkle proof).
  // For multi-deposit trees, reconstruct siblings from on-chain Deposit events.
  const proof = generateProof(amount, ownerField, nonce, assetId, "0x" + root.toString(16));

  console.log("Withdrawing...");
  const tx = await pool.withdraw(root, BigInt(nullifier), recipient, amount, proof, { gasLimit: 500_000 });
  const receipt = await tx.wait();

  console.log("Withdrawal successful! tx:", receipt?.hash);
}

main().catch(console.error);
