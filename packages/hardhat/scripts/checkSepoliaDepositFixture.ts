import * as fs from "fs";
import { deployments, ethers } from "hardhat";

const readHex = (path: string) => fs.readFileSync(path, "utf8").trim();

async function main() {
  const poolDeployment = await deployments.get("ShieldedPool");
  const pool = await ethers.getContractAt("ShieldedPool", poolDeployment.address);

  const depositVerifierAddress = await pool.depositVerifier();
  const tokenAddress = await pool.token();
  const assetId = await pool.assetId();

  const [commitmentRaw, amountRaw] = fs.readFileSync("../circuits/deposit/evm/inputs.txt", "utf8").trim().split(/\s+/);
  const commitment = BigInt(commitmentRaw);
  const amount = BigInt(amountRaw);
  const proof = readHex("../circuits/deposit/evm/proof.hex");

  const verifier = await ethers.getContractAt("DepositVerifier", depositVerifierAddress);
  const accepted = await verifier.verifyDepositProof(amount, assetId, commitment, proof);

  console.log(`pool=${poolDeployment.address}`);
  console.log(`token=${tokenAddress}`);
  console.log(`depositVerifier=${depositVerifierAddress}`);
  console.log(`assetId=${assetId.toString()}`);
  console.log(`fixtureAmount=${amount.toString()}`);
  console.log(`fixtureCommitment=${commitment.toString()}`);
  console.log(`depositProofAccepted=${accepted}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
