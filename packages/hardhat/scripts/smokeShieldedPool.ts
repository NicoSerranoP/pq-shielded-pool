import { deployments, ethers } from "hardhat";
import { readFileSync } from "fs";
import path from "path";

const withMargin = (gas: bigint) => (gas * 120n) / 100n;
const circuitEvmDir = (circuitName: string) => path.resolve(__dirname, "../../circuits", circuitName, "evm");
const readProof = (circuitName: string) =>
  readFileSync(path.join(circuitEvmDir(circuitName), "proof.hex"), "utf8").trim();
const readInputs = (circuitName: string) =>
  readFileSync(path.join(circuitEvmDir(circuitName), "inputs.txt"), "utf8")
    .trim()
    .split(/\s+/)
    .map(value => BigInt(value));

async function main() {
  const [deployer, depositor, recipient] = await ethers.getSigners();

  const tokenDeployment = await deployments.get("SE2Token");
  const poseidonDeployment = await deployments.get("PoseidonT3");
  const depositVerifierDeployment = await deployments.get("DepositVerifier");
  const transferVerifierDeployment = await deployments.get("TransferVerifier");
  const withdrawVerifierDeployment = await deployments.get("WithdrawVerifier");

  const token = await ethers.getContractAt("SE2Token", tokenDeployment.address);
  const assetId = BigInt(tokenDeployment.address);

  const poolFactory = await ethers.getContractFactory("ShieldedPool", {
    libraries: {
      PoseidonT3: poseidonDeployment.address,
    },
  });

  const deployPool = async () => {
    const args = [
      tokenDeployment.address,
      depositVerifierDeployment.address,
      transferVerifierDeployment.address,
      withdrawVerifierDeployment.address,
      assetId,
    ] as const;
    const deployTransaction = await poolFactory.getDeployTransaction(...args);
    const gas = await ethers.provider.estimateGas({ ...deployTransaction, from: deployer.address });
    const pool = await poolFactory.deploy(...args, { gasLimit: withMargin(gas) });
    await pool.waitForDeployment();
    return pool;
  };

  const depositProof = readProof("deposit");
  const [depositCommitment, depositAmount] = readInputs("deposit");
  const transferProof = readProof("transfer");
  const [transferNullifier, output0, output1, transferRoot] = readInputs("transfer");
  const withdrawProof = readProof("withdraw");
  const [withdrawAmount, withdrawRoot] = readInputs("withdraw");

  if (depositAmount !== withdrawAmount || depositCommitment !== transferRoot || depositCommitment !== withdrawRoot) {
    throw new Error("Circuit proof fixtures are not aligned");
  }

  const transferPool = await deployPool();

  const mintGas = await token.mint.estimateGas(depositor.address, depositAmount);
  await (await token.mint(depositor.address, depositAmount, { gasLimit: withMargin(mintGas) })).wait();

  const approveGas = await token.connect(depositor).approve.estimateGas(await transferPool.getAddress(), depositAmount);
  await (
    await token
      .connect(depositor)
      .approve(await transferPool.getAddress(), depositAmount, { gasLimit: withMargin(approveGas) })
  ).wait();

  const depositGas = await transferPool
    .connect(depositor)
    .deposit.estimateGas(depositAmount, assetId, depositCommitment, depositProof);
  await (
    await transferPool
      .connect(depositor)
      .deposit(depositAmount, assetId, depositCommitment, depositProof, { gasLimit: withMargin(depositGas) })
  ).wait();

  const transferGas = await transferPool.transfer.estimateGas(
    transferRoot,
    transferNullifier,
    [output0, output1],
    transferProof,
  );
  await (
    await transferPool.transfer(transferRoot, transferNullifier, [output0, output1], transferProof, {
      gasLimit: withMargin(transferGas),
    })
  ).wait();

  const withdrawPool = await deployPool();

  const withdrawMintGas = await token.mint.estimateGas(depositor.address, withdrawAmount);
  await (await token.mint(depositor.address, withdrawAmount, { gasLimit: withMargin(withdrawMintGas) })).wait();

  const withdrawApproveGas = await token
    .connect(depositor)
    .approve.estimateGas(await withdrawPool.getAddress(), withdrawAmount);
  await (
    await token
      .connect(depositor)
      .approve(await withdrawPool.getAddress(), withdrawAmount, { gasLimit: withMargin(withdrawApproveGas) })
  ).wait();

  const withdrawDepositGas = await withdrawPool
    .connect(depositor)
    .deposit.estimateGas(withdrawAmount, assetId, depositCommitment, depositProof);
  await (
    await withdrawPool
      .connect(depositor)
      .deposit(withdrawAmount, assetId, depositCommitment, depositProof, { gasLimit: withMargin(withdrawDepositGas) })
  ).wait();

  const withdrawGas = await withdrawPool.withdraw.estimateGas(
    withdrawRoot,
    transferNullifier,
    recipient.address,
    withdrawAmount,
    withdrawProof,
  );
  await (
    await withdrawPool.withdraw(withdrawRoot, transferNullifier, recipient.address, withdrawAmount, withdrawProof, {
      gasLimit: withMargin(withdrawGas),
    })
  ).wait();

  console.log(`SE2Token: ${tokenDeployment.address}`);
  console.log(`DepositVerifier: ${depositVerifierDeployment.address}`);
  console.log(`TransferVerifier: ${transferVerifierDeployment.address}`);
  console.log(`WithdrawVerifier: ${withdrawVerifierDeployment.address}`);
  console.log(`Transfer pool: ${await transferPool.getAddress()}`);
  console.log(`Transfer pool tree size: ${await transferPool.treeSize()}`);
  console.log(`Withdraw pool: ${await withdrawPool.getAddress()}`);
  console.log(`Recipient balance: ${await token.balanceOf(recipient.address)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
