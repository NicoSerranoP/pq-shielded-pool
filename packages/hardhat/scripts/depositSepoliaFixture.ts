import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import password from "@inquirer/password";
import { Wallet } from "ethers";
import { deployments, ethers } from "hardhat";

const getDeployerWallet = async () => {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    const [signer] = await ethers.getSigners();
    return signer;
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });
  const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
  return wallet.connect(ethers.provider);
};

const readDepositFixture = () => {
  const [commitmentRaw, amountRaw] = fs.readFileSync("../circuits/deposit/evm/inputs.txt", "utf8").trim().split(/\s+/);

  return {
    commitment: BigInt(commitmentRaw),
    amount: BigInt(amountRaw),
    proof: fs.readFileSync("../circuits/deposit/evm/proof.hex", "utf8").trim(),
  };
};

async function main() {
  const signer = await getDeployerWallet();
  const signerAddress = await signer.getAddress();
  const tokenDeployment = await deployments.get("SE2Token");
  const poolDeployment = await deployments.get("ShieldedPool");
  const token = await ethers.getContractAt("SE2Token", tokenDeployment.address, signer);
  const pool = await ethers.getContractAt("ShieldedPool", poolDeployment.address, signer);
  const { amount, commitment, proof } = readDepositFixture();
  const assetId = await pool.assetId();

  console.log(`signer=${signerAddress}`);
  console.log(`token=${tokenDeployment.address}`);
  console.log(`pool=${poolDeployment.address}`);
  console.log(`amount=${amount.toString()}`);
  console.log(`assetId=${assetId.toString()}`);
  console.log(`commitment=${commitment.toString()}`);

  if (await pool.hasCommitment(commitment)) {
    throw new Error(
      "Fixture commitment is already in the pool. Generate a fresh deposit proof before depositing again.",
    );
  }

  const balance = await token.balanceOf(signerAddress);
  if (balance < amount) {
    const mintTx = await token.mint(signerAddress, amount - balance);
    console.log(`mint tx=${mintTx.hash}`);
    await mintTx.wait();
  }

  const allowance = await token.allowance(signerAddress, poolDeployment.address);
  if (allowance < amount) {
    const approveTx = await token.approve(poolDeployment.address, amount);
    console.log(`approve tx=${approveTx.hash}`);
    await approveTx.wait();
  }

  const depositTx = await pool.deposit(amount, assetId, commitment, proof);
  console.log(`deposit tx=${depositTx.hash}`);
  const receipt = await depositTx.wait();

  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = pool.interface.parseLog(log);
      if (parsed?.name === "Deposit") {
        console.log(`leafIndex=${parsed.args.leafIndex.toString()}`);
        console.log(`newRoot=${parsed.args.root.toString()}`);
      }
    } catch {
      // Ignore logs from other contracts in the same transaction.
    }
  }

  console.log(`treeSize=${(await pool.treeSize()).toString()}`);
  console.log(`currentRoot=${(await pool.currentRoot()).toString()}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
