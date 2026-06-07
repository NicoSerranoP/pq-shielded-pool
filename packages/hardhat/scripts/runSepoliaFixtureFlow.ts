import * as dotenv from "dotenv";
dotenv.config();
import * as fs from "fs";
import password from "@inquirer/password";
import { Wallet } from "ethers";
import { deployments, ethers } from "hardhat";

const WITHDRAW_NULLIFIER = 999999n;

type DepositFixture = {
  amount: bigint;
  commitment: bigint;
  proof: string;
};

type TransferFixture = {
  nullifier: bigint;
  outputCommitments: [bigint, bigint];
  proof: string;
  root: bigint;
};

type WithdrawFixture = {
  amount: bigint;
  proof: string;
  root: bigint;
};

const getSigner = async () => {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    const [signer] = await ethers.getSigners();
    return signer;
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });
  const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
  return wallet.connect(ethers.provider);
};

const readProof = (path: string) => fs.readFileSync(path, "utf8").trim();

const readDepositFixture = (): DepositFixture => {
  const [commitmentRaw, amountRaw] = fs.readFileSync("../circuits/deposit/evm/inputs.txt", "utf8").trim().split(/\s+/);

  return {
    amount: BigInt(amountRaw),
    commitment: BigInt(commitmentRaw),
    proof: readProof("../circuits/deposit/evm/proof.hex"),
  };
};

const readTransferFixture = (): TransferFixture => {
  const [nullifierRaw, output0Raw, output1Raw, rootRaw] = fs
    .readFileSync("../circuits/transfer/evm/inputs.txt", "utf8")
    .trim()
    .split(/\s+/);

  return {
    nullifier: BigInt(nullifierRaw),
    outputCommitments: [BigInt(output0Raw), BigInt(output1Raw)],
    proof: readProof("../circuits/transfer/evm/proof.hex"),
    root: BigInt(rootRaw),
  };
};

const readWithdrawFixture = (): WithdrawFixture => {
  const [amountRaw, rootRaw] = fs.readFileSync("../circuits/withdraw/evm/inputs.txt", "utf8").trim().split(/\s+/);

  return {
    amount: BigInt(amountRaw),
    proof: readProof("../circuits/withdraw/evm/proof.hex"),
    root: BigInt(rootRaw),
  };
};

const optionalArgValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value) {
    throw new Error(`Missing ${flag}`);
  }

  return value;
};

async function main() {
  const signer = await getSigner();
  const signerAddress = await signer.getAddress();
  const withdrawRecipient = ethers.getAddress(optionalArgValue("--withdraw-to") ?? signerAddress);
  const tokenDeployment = await deployments.get("SE2Token");
  const poolDeployment = await deployments.get("ShieldedPool");
  const token = await ethers.getContractAt("SE2Token", tokenDeployment.address, signer);
  const pool = await ethers.getContractAt("ShieldedPool", poolDeployment.address, signer);

  const deposit = readDepositFixture();
  const transfer = readTransferFixture();
  const withdraw = readWithdrawFixture();
  const assetId = await pool.assetId();

  console.log(`signer=${signerAddress}`);
  console.log(`withdrawRecipient=${withdrawRecipient}`);
  console.log(`token=${tokenDeployment.address}`);
  console.log(`pool=${poolDeployment.address}`);
  console.log(`assetId=${assetId.toString()}`);

  if (deposit.commitment !== transfer.root || deposit.commitment !== withdraw.root) {
    throw new Error("Fixture roots do not match the deposit commitment; refusing to run mixed fixture flow.");
  }

  console.log("\n[1/4] mint/approve");
  const balance = await token.balanceOf(signerAddress);
  if (balance < deposit.amount) {
    const mintTx = await token.mint(signerAddress, deposit.amount - balance);
    console.log(`mint tx=${mintTx.hash}`);
    await mintTx.wait();
  } else {
    console.log(`mint skipped balance=${balance.toString()}`);
  }

  const allowance = await token.allowance(signerAddress, poolDeployment.address);
  if (allowance < deposit.amount) {
    const approveTx = await token.approve(poolDeployment.address, deposit.amount);
    console.log(`approve tx=${approveTx.hash}`);
    await approveTx.wait();
  } else {
    console.log(`approve skipped allowance=${allowance.toString()}`);
  }

  console.log("\n[2/4] deposit fixture");
  if (await pool.hasCommitment(deposit.commitment)) {
    console.log("deposit skipped: fixture commitment already exists");
  } else {
    const depositTx = await pool.deposit(deposit.amount, assetId, deposit.commitment, deposit.proof);
    console.log(`deposit tx=${depositTx.hash}`);
    await depositTx.wait();
  }

  console.log(`knownRoot=${await pool.isKnownRoot(deposit.commitment)}`);
  console.log(`treeSizeAfterDeposit=${(await pool.treeSize()).toString()}`);

  console.log("\n[3/4] transfer fixture");
  if (await pool.isNullifierSpent(transfer.nullifier)) {
    console.log("transfer skipped: fixture nullifier already spent");
  } else if (await pool.hasCommitment(transfer.outputCommitments[0])) {
    console.log("transfer skipped: first fixture output commitment already exists");
  } else {
    const transferTx = await pool.transfer(
      transfer.root,
      transfer.nullifier,
      transfer.outputCommitments,
      transfer.proof,
    );
    console.log(`transfer tx=${transferTx.hash}`);
    await transferTx.wait();
  }

  console.log(`transferNullifierSpent=${await pool.isNullifierSpent(transfer.nullifier)}`);
  console.log(`treeSizeAfterTransfer=${(await pool.treeSize()).toString()}`);

  console.log("\n[4/4] withdraw fixture");
  console.log("warning: current withdraw circuit does not bind nullifier/recipient; this is a plumbing test only");
  if (await pool.isNullifierSpent(WITHDRAW_NULLIFIER)) {
    console.log("withdraw skipped: fixture withdraw nullifier already spent");
  } else {
    const poolBalance = await token.balanceOf(poolDeployment.address);
    if (poolBalance < withdraw.amount) {
      console.log(`withdraw skipped: pool balance ${poolBalance.toString()} < ${withdraw.amount.toString()}`);
    } else {
      const withdrawTx = await pool.withdraw(
        withdraw.root,
        WITHDRAW_NULLIFIER,
        withdrawRecipient,
        withdraw.amount,
        withdraw.proof,
      );
      console.log(`withdraw tx=${withdrawTx.hash}`);
      await withdrawTx.wait();
    }
  }

  console.log(`withdrawNullifierSpent=${await pool.isNullifierSpent(WITHDRAW_NULLIFIER)}`);
  console.log(`poolTokenBalance=${(await token.balanceOf(poolDeployment.address)).toString()}`);
  console.log(`recipientTokenBalance=${(await token.balanceOf(withdrawRecipient)).toString()}`);
  console.log(`currentRoot=${(await pool.currentRoot()).toString()}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
