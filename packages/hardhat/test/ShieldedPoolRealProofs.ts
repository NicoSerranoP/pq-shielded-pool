import { expect } from "chai";
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import path from "path";

const circuitEvmDir = (circuitName: string) => path.resolve(__dirname, "../../circuits", circuitName, "evm");

const readProof = (circuitName: string) =>
  readFileSync(path.join(circuitEvmDir(circuitName), "proof.hex"), "utf8").trim();

const readInputs = (circuitName: string) =>
  readFileSync(path.join(circuitEvmDir(circuitName), "inputs.txt"), "utf8")
    .trim()
    .split(/\s+/)
    .map(value => BigInt(value));

describe("ShieldedPool real generated proofs", function () {
  async function deployFixture() {
    const [deployer, depositor, recipient] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const depositVerifierFactory = await ethers.getContractFactory("DepositVerifier");
    const depositVerifier = await depositVerifierFactory.deploy();
    await depositVerifier.waitForDeployment();

    const transferVerifierFactory = await ethers.getContractFactory("TransferVerifier");
    const transferVerifier = await transferVerifierFactory.deploy();
    await transferVerifier.waitForDeployment();

    const withdrawVerifierFactory = await ethers.getContractFactory("WithdrawVerifier");
    const withdrawVerifier = await withdrawVerifierFactory.deploy();
    await withdrawVerifier.waitForDeployment();

    const poseidonFactory = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
    const poseidon = await poseidonFactory.deploy();
    await poseidon.waitForDeployment();

    const poolFactory = await ethers.getContractFactory("ShieldedPool", {
      libraries: {
        PoseidonT3: await poseidon.getAddress(),
      },
    });

    const assetId = BigInt(await token.getAddress());
    const deployPool = async () => {
      const pool = await poolFactory.deploy(
        await token.getAddress(),
        await depositVerifier.getAddress(),
        await transferVerifier.getAddress(),
        await withdrawVerifier.getAddress(),
        assetId,
      );
      await pool.waitForDeployment();
      return pool;
    };

    return { assetId, deployer, depositor, deployPool, recipient, token };
  }

  it("executes deposit, transfer, and withdraw with exported EVM proof artifacts", async function () {
    const { assetId, depositor, deployPool, recipient, token } = await deployFixture();

    const depositProof = readProof("deposit");
    const [depositCommitment, depositAmount] = readInputs("deposit");

    const transferProof = readProof("transfer");
    const [transferNullifier, output0, output1, transferRoot] = readInputs("transfer");

    const withdrawProof = readProof("withdraw");
    const [withdrawAmount, withdrawRoot] = readInputs("withdraw");

    expect(depositAmount).to.equal(withdrawAmount);
    expect(depositCommitment).to.equal(transferRoot);
    expect(depositCommitment).to.equal(withdrawRoot);

    const transferPool = await deployPool();

    await token.mint(depositor.address, depositAmount);
    await token.connect(depositor).approve(await transferPool.getAddress(), depositAmount);

    await expect(
      transferPool.connect(depositor).deposit(depositAmount, assetId, depositCommitment, depositProof),
    ).to.emit(transferPool, "Deposit");

    expect(await transferPool.currentRoot()).to.equal(transferRoot);

    await expect(transferPool.transfer(transferRoot, transferNullifier, [output0, output1], transferProof)).to.emit(
      transferPool,
      "Transfer",
    );

    expect(await transferPool.treeSize()).to.equal(3n);
    expect(await transferPool.isNullifierSpent(transferNullifier)).to.equal(true);
    expect(await token.balanceOf(await transferPool.getAddress())).to.equal(depositAmount);

    const withdrawPool = await deployPool();

    await token.mint(depositor.address, withdrawAmount);
    await token.connect(depositor).approve(await withdrawPool.getAddress(), withdrawAmount);
    await withdrawPool.connect(depositor).deposit(withdrawAmount, assetId, depositCommitment, depositProof);

    expect(await withdrawPool.currentRoot()).to.equal(withdrawRoot);

    await expect(
      withdrawPool.withdraw(withdrawRoot, transferNullifier, recipient.address, withdrawAmount, withdrawProof),
    )
      .to.emit(withdrawPool, "Withdrawal")
      .withArgs(withdrawRoot, transferNullifier, recipient.address, withdrawAmount);

    expect(await token.balanceOf(recipient.address)).to.equal(withdrawAmount);
    expect(await token.balanceOf(await withdrawPool.getAddress())).to.equal(0n);
  });
});
