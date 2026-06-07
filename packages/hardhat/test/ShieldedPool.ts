import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { MockDepositVerifier } from "../typechain-types/contracts/test/MockDepositVerifier";

describe("ShieldedPool", function () {
  const amount = ethers.parseEther("10");
  const commitment = 123456789n;
  const proof = "0x1234";
  const inputNullifier = 1111n;
  const outputCommitments = [2222n, 3333n];

  async function deployFixture() {
    const [deployer, depositor, recipient] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory(
      "contracts/test/MockDepositVerifier.sol:MockDepositVerifier",
    );
    const verifier = (await verifierFactory.deploy()) as unknown as MockDepositVerifier;
    await verifier.waitForDeployment();

    const transferVerifierFactory = await ethers.getContractFactory("MockTransferVerifier");
    const transferVerifier = await transferVerifierFactory.deploy();
    await transferVerifier.waitForDeployment();

    const withdrawVerifierFactory = await ethers.getContractFactory("MockWithdrawVerifier");
    const withdrawVerifier = await withdrawVerifierFactory.deploy();
    await withdrawVerifier.waitForDeployment();

    const assetId = BigInt(await token.getAddress());

    const poseidonFactory = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
    const poseidon = await poseidonFactory.deploy();
    await poseidon.waitForDeployment();

    const poolFactory = await ethers.getContractFactory("ShieldedPool", {
      libraries: {
        PoseidonT3: await poseidon.getAddress(),
      },
    });
    const pool = await poolFactory.deploy(
      await token.getAddress(),
      await verifier.getAddress(),
      await transferVerifier.getAddress(),
      await withdrawVerifier.getAddress(),
      assetId,
    );
    await pool.waitForDeployment();

    await token.mint(depositor.address, amount);
    await token.connect(depositor).approve(await pool.getAddress(), amount);

    return {
      assetId,
      commitment,
      depositor,
      deployer,
      poolFactory,
      pool,
      proof,
      recipient,
      token,
      transferVerifier,
      verifier,
      withdrawVerifier,
    };
  }

  async function depositAndGetRoot() {
    const fixture = await loadFixture(deployFixture);
    const { assetId, depositor, pool, proof } = fixture;

    await pool.connect(depositor).deposit(amount, assetId, commitment, proof);
    const root = await pool.currentRoot();

    return { ...fixture, root };
  }

  it("accepts a well-formed deposit and inserts the commitment", async function () {
    const { assetId, commitment, depositor, pool, proof, token } = await loadFixture(deployFixture);

    await expect(pool.connect(depositor).deposit(amount, assetId, commitment, proof)).to.emit(pool, "Deposit");

    const root = await pool.currentRoot();

    expect(await token.balanceOf(await pool.getAddress())).to.equal(amount);
    expect(await pool.treeSize()).to.equal(1n);
    expect(await pool.treeDepth()).to.equal(0n);
    expect(await pool.hasCommitment(commitment)).to.equal(true);
    expect(await pool.commitmentIndex(commitment)).to.equal(0n);
    expect(await pool.isKnownRoot(root)).to.equal(true);
  });

  it("rejects invalid constructor inputs", async function () {
    const { assetId, poolFactory, token, transferVerifier, verifier, withdrawVerifier } =
      await loadFixture(deployFixture);

    const tokenAddress = await token.getAddress();
    const depositVerifierAddress = await verifier.getAddress();
    const transferVerifierAddress = await transferVerifier.getAddress();
    const withdrawVerifierAddress = await withdrawVerifier.getAddress();

    await expect(
      poolFactory.deploy(
        ethers.ZeroAddress,
        depositVerifierAddress,
        transferVerifierAddress,
        withdrawVerifierAddress,
        assetId,
      ),
    ).to.be.revertedWithCustomError(poolFactory, "InvalidToken");

    await expect(
      poolFactory.deploy(tokenAddress, ethers.ZeroAddress, transferVerifierAddress, withdrawVerifierAddress, assetId),
    ).to.be.revertedWithCustomError(poolFactory, "InvalidDepositVerifier");

    await expect(
      poolFactory.deploy(tokenAddress, depositVerifierAddress, ethers.ZeroAddress, withdrawVerifierAddress, assetId),
    ).to.be.revertedWithCustomError(poolFactory, "InvalidTransferVerifier");

    await expect(
      poolFactory.deploy(tokenAddress, depositVerifierAddress, transferVerifierAddress, ethers.ZeroAddress, assetId),
    ).to.be.revertedWithCustomError(poolFactory, "InvalidWithdrawVerifier");

    await expect(
      poolFactory.deploy(tokenAddress, depositVerifierAddress, transferVerifierAddress, withdrawVerifierAddress, 0),
    ).to.be.revertedWithCustomError(poolFactory, "InvalidAssetId");
  });

  it("rejects zero amount deposits", async function () {
    const { assetId, commitment, depositor, pool, proof } = await loadFixture(deployFixture);

    await expect(pool.connect(depositor).deposit(0, assetId, commitment, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidAmount",
    );
  });

  it("rejects unsupported asset ids", async function () {
    const { assetId, commitment, depositor, pool, proof } = await loadFixture(deployFixture);

    await expect(
      pool.connect(depositor).deposit(amount, assetId + 1n, commitment, proof),
    ).to.be.revertedWithCustomError(pool, "InvalidAssetId");
  });

  it("rejects invalid deposit proofs", async function () {
    const { assetId, commitment, depositor, pool, proof, verifier } = await loadFixture(deployFixture);

    await verifier.setShouldAccept(false);

    await expect(pool.connect(depositor).deposit(amount, assetId, commitment, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidDepositProof",
    );
  });

  it("rejects fee-on-transfer deposits", async function () {
    const { assetId, depositor, poolFactory, proof, transferVerifier, verifier, withdrawVerifier } =
      await loadFixture(deployFixture);

    const feeTokenFactory = await ethers.getContractFactory("MockFeeOnTransferToken");
    const feeToken = await feeTokenFactory.deploy();
    await feeToken.waitForDeployment();

    const pool = await poolFactory.deploy(
      await feeToken.getAddress(),
      await verifier.getAddress(),
      await transferVerifier.getAddress(),
      await withdrawVerifier.getAddress(),
      assetId,
    );
    await pool.waitForDeployment();

    await feeToken.mint(depositor.address, amount);
    await feeToken.connect(depositor).approve(await pool.getAddress(), amount);

    await expect(pool.connect(depositor).deposit(amount, assetId, commitment, proof)).to.be.revertedWithCustomError(
      pool,
      "TokenTransferAmountMismatch",
    );
  });

  it("rejects duplicate commitments", async function () {
    const { assetId, commitment, depositor, pool, proof, token } = await loadFixture(deployFixture);

    await pool.connect(depositor).deposit(amount, assetId, commitment, proof);
    await token.mint(depositor.address, amount);
    await token.connect(depositor).approve(await pool.getAddress(), amount);

    await expect(pool.connect(depositor).deposit(amount, assetId, commitment, proof)).to.be.reverted;
  });

  it("spends input nullifiers and inserts dynamic output commitments", async function () {
    const { pool, root } = await depositAndGetRoot();

    await expect(pool.transfer(root, inputNullifier, outputCommitments, proof)).to.emit(pool, "Transfer");

    const newRoot = await pool.currentRoot();

    expect(await pool.treeSize()).to.equal(3n);
    expect(await pool.hasCommitment(outputCommitments[0])).to.equal(true);
    expect(await pool.hasCommitment(outputCommitments[1])).to.equal(true);
    expect(await pool.commitmentIndex(outputCommitments[0])).to.equal(1n);
    expect(await pool.commitmentIndex(outputCommitments[1])).to.equal(2n);
    expect(await pool.isNullifierSpent(inputNullifier)).to.equal(true);
    expect(await pool.contains(inputNullifier)).to.equal(true);
    expect(await pool.isKnownRoot(newRoot)).to.equal(true);

    const bucketId = await pool.bucketOf(inputNullifier);
    const [head, tail] = await pool.bucketInfo(bucketId);
    const [, len, values] = await pool.nodeInfo(head);

    expect(head).to.equal(tail);
    expect(len).to.equal(1n);
    expect(values[0]).to.equal(inputNullifier);
  });

  it("rejects transfers against unknown roots", async function () {
    const { pool } = await loadFixture(deployFixture);

    await expect(pool.transfer(999n, inputNullifier, outputCommitments, proof)).to.be.revertedWithCustomError(
      pool,
      "UnknownMerkleRoot",
    );
  });

  it("rejects invalid transfer proofs", async function () {
    const { pool, root, transferVerifier } = await depositAndGetRoot();

    await transferVerifier.setShouldAccept(false);

    await expect(pool.transfer(root, inputNullifier, outputCommitments, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidTransferProof",
    );
  });

  it("rejects double spends", async function () {
    const { pool, root } = await depositAndGetRoot();

    await pool.transfer(root, inputNullifier, outputCommitments, proof);

    await expect(pool.transfer(root, inputNullifier, [4444n, 5555n], proof))
      .to.be.revertedWithCustomError(pool, "NullifierAlreadySpent")
      .withArgs(inputNullifier);
  });

  it("rejects zero input nullifiers", async function () {
    const { pool, root } = await depositAndGetRoot();

    await expect(pool.transfer(root, 0, outputCommitments, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidNullifier",
    );
  });

  it("rejects empty transfer outputs", async function () {
    const { pool, root } = await depositAndGetRoot();

    await expect(pool.transfer(root, inputNullifier, [], proof)).to.be.revertedWithCustomError(
      pool,
      "NoOutputCommitments",
    );
  });

  it("rejects transfer output counts that do not match the generated circuit", async function () {
    const { pool, root } = await depositAndGetRoot();

    await expect(pool.transfer(root, inputNullifier, [4444n], proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidOutputCommitmentCount",
    );
  });

  it("rejects zero transfer output commitments", async function () {
    const { pool, root } = await depositAndGetRoot();

    await expect(pool.transfer(root, inputNullifier, [0n, 3333n], proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidOutputCommitment",
    );
    expect(await pool.isNullifierSpent(inputNullifier)).to.equal(false);
  });

  it("rotates root history and evicts expired roots", async function () {
    const { assetId, commitment, depositor, pool, proof, token } = await loadFixture(deployFixture);

    await token.mint(depositor.address, amount * 100n);
    await token.connect(depositor).approve(await pool.getAddress(), amount * 101n);

    const roots: bigint[] = [];
    for (let i = 0; i < 101; i++) {
      await pool.connect(depositor).deposit(amount, assetId, commitment + BigInt(i), proof);
      roots.push(await pool.currentRoot());
    }

    expect(await pool.rootHistoryIndex()).to.equal(1n);
    expect(await pool.rootHistory(0)).to.equal(roots[100]);
    expect(await pool.isKnownRoot(roots[0])).to.equal(false);
    expect(await pool.isKnownRoot(roots[1])).to.equal(true);
    expect(await pool.isKnownRoot(roots[100])).to.equal(true);
  });

  it("rejects out-of-range root history reads", async function () {
    const { pool } = await loadFixture(deployFixture);

    await expect(pool.rootHistory(100)).to.be.revertedWithCustomError(pool, "InvalidRootHistoryIndex");
  });

  it("withdraws a spent private note to a public recipient", async function () {
    const { pool, recipient, root, token } = await depositAndGetRoot();

    await expect(pool.withdraw(root, inputNullifier, recipient.address, amount, proof)).to.emit(pool, "Withdrawal");

    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);
    expect(await pool.isNullifierSpent(inputNullifier)).to.equal(true);
  });

  it("rejects withdrawals against unknown roots", async function () {
    const { pool, recipient } = await loadFixture(deployFixture);

    await expect(pool.withdraw(999n, inputNullifier, recipient.address, amount, proof)).to.be.revertedWithCustomError(
      pool,
      "UnknownMerkleRoot",
    );
  });

  it("rejects invalid withdrawal proofs", async function () {
    const { pool, recipient, root, withdrawVerifier } = await depositAndGetRoot();

    await withdrawVerifier.setShouldAccept(false);

    await expect(pool.withdraw(root, inputNullifier, recipient.address, amount, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidWithdrawProof",
    );
  });

  it("rejects double withdrawal spends", async function () {
    const { pool, recipient, root } = await depositAndGetRoot();

    await pool.withdraw(root, inputNullifier, recipient.address, amount, proof);

    await expect(pool.withdraw(root, inputNullifier, recipient.address, amount, proof))
      .to.be.revertedWithCustomError(pool, "NullifierAlreadySpent")
      .withArgs(inputNullifier);
  });

  it("rejects invalid withdrawal public inputs", async function () {
    const { pool, recipient, root } = await depositAndGetRoot();

    await expect(pool.withdraw(root, 0, recipient.address, amount, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidNullifier",
    );
    await expect(pool.withdraw(root, inputNullifier, ethers.ZeroAddress, amount, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidRecipient",
    );
    await expect(pool.withdraw(root, inputNullifier, recipient.address, 0, proof)).to.be.revertedWithCustomError(
      pool,
      "InvalidAmount",
    );
  });
});
