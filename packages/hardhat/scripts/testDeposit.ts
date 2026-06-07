import { ethers, deployments } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const CIRCUITS_DIR = path.resolve(__dirname, "../../../packages/circuits");
const DEPOSIT_DIR = path.join(CIRCUITS_DIR, "deposit");

function getProvekitCli(): string {
  const cli = process.env.PROVEKIT_CLI;
  if (!cli) {
    throw new Error(
      "PROVEKIT_CLI env var not set. Copy .env.example to .env and set the path to your provekit-cli binary.",
    );
  }
  if (!fs.existsSync(cli)) {
    throw new Error(`PROVEKIT_CLI binary not found at: ${cli}`);
  }
  return cli;
}

function computeNoteValues(
  value: number,
  owner: string,
  nonce: number,
  asset: number,
): { commitment: string; nullifier: string } {
  const helperProverToml = `value = ${value}\nowner = "${owner}"\nnonce = ${nonce}\nasset = ${asset}\n`;
  const helperProverTomlPath = path.join(CIRCUITS_DIR, "note_helper", "Prover.toml");

  fs.writeFileSync(helperProverTomlPath, helperProverToml);

  const output = execSync(`nargo execute --package note_helper`, {
    cwd: CIRCUITS_DIR,
    encoding: "utf8",
  });

  // Output line: [note_helper] Circuit output: (0x..., 0x...)
  const match = output.match(/Circuit output: \(([^,]+), ([^)]+)\)/);
  if (!match) throw new Error(`Failed to parse nargo output: ${output}`);

  return { commitment: match[1].trim(), nullifier: match[2].trim() };
}

function generateProof(value: number, owner: string, nonce: number, asset: number, commitment: string): string {
  const cli = getProvekitCli();
  const proofPath = path.join(DEPOSIT_DIR, "proof.np");
  const evmDir = path.join(DEPOSIT_DIR, "evm");
  const proverTomlPath = path.join(DEPOSIT_DIR, "Prover.toml");

  const proverToml = `commitment = "${commitment}"
value = ${value}

[note]
asset  = ${asset}
nonce = ${nonce}
owner = "${owner}"
value = ${value}
`;
  fs.writeFileSync(proverTomlPath, proverToml);

  console.log("Generating proof...");
  execSync(`${cli} prove -p ${path.join(DEPOSIT_DIR, "deposit.pkp")} -i ${proverTomlPath} -o ${proofPath}`, {
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
  const tokenDep = await deployments.get("SE2Token");
  const token = await ethers.getContractAt("SE2Token", tokenDep.address);

  const amount = 9;
  const assetId = 1;
  const nonce = 1; //TODO: make this incremental, needs to be unique always
  const ownerField = BigInt(signer.address).toString();

  console.log("Computing commitment...");
  const { commitment } = computeNoteValues(amount, ownerField, nonce, assetId);
  console.log("Commitment:", commitment);

  const proof = generateProof(amount, ownerField, nonce, assetId, commitment);

  console.log("Minting tokens...");
  await (await token.mint(signer.address, ethers.parseEther("1000"), { gasLimit: 100000 })).wait();

  console.log("Approving...");
  await (await token.approve(poolDep.address, ethers.parseEther("1000"), { gasLimit: 100000 })).wait();

  console.log("Depositing...");
  const tx = await pool.deposit(amount, assetId, BigInt(commitment), proof, { gasLimit: 3_000_000 });
  const receipt = await tx.wait();

  console.log("Deposit successful! tx:", receipt?.hash);
}

main().catch(console.error);
