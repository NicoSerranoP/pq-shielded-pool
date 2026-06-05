import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ShieldedPool", function () {
  const amount = ethers.parseEther("10");
  const commitment = 123456789n;
  const proof = "0x1234";
  const inputNullifier = 1111n;
  const outputCommitments = [2222n, 3333n];

  async function deployFixture() {
    const [deployer, depositor] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory("MockDepositVerifier");
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();

    const transferVerifierFactory = await ethers.getContractFactory("MockTransferVerifier");
    const transferVerifier = await transferVerifierFactory.deploy();
    await transferVerifier.waitForDeployment();

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
      assetId,
    );
    await pool.waitForDeployment();

    await token.mint(depositor.address, amount);
    await token.connect(depositor).approve(await pool.getAddress(), amount);

    return { assetId, commitment, depositor, deployer, pool, proof, token, transferVerifier, verifier };
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

    await expect(pool.transfer(root, inputNullifier, [4444n], proof))
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
});
