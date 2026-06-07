import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import fs from "fs";
import path from "path";

describe("ShieldedPool", function () {
  const amount = ethers.parseEther("10");
  const commitment = 123456789n;
  const proof = "0x1234";
  const inputNullifier = 1111n;
  const outputCommitments = [2222n, 3333n];
  const repoRoot = path.resolve(__dirname, "../../..");

  function readDepositProofFixture() {
    const inputsRaw = fs.readFileSync(path.join(repoRoot, "packages/circuits/deposit/evm/inputs.txt"), "utf8");
    const [realCommitment, realAmount] = inputsRaw
      .trim()
      .split(/\s+/u)
      .map(value => BigInt(value));
    const realProof = fs.readFileSync(path.join(repoRoot, "packages/circuits/deposit/evm/proof.hex"), "utf8").trim();

    return {
      realAmount,
      realCommitment,
      realProof,
    };
  }

  function readTransferProofFixture() {
    const inputsRaw = fs.readFileSync(path.join(repoRoot, "packages/circuits/transfer/evm/inputs.txt"), "utf8");
    const [realNullifier, outputCommitment0, outputCommitment1, realRoot] = inputsRaw
      .trim()
      .split(/\s+/u)
      .map(value => BigInt(value));
    const realProof = fs.readFileSync(path.join(repoRoot, "packages/circuits/transfer/evm/proof.hex"), "utf8").trim();

    return {
      realNullifier,
      realOutputCommitments: [outputCommitment0, outputCommitment1],
      realProof,
      realRoot,
    };
  }

  function readWithdrawProofFixture() {
    const inputsRaw = fs.readFileSync(path.join(repoRoot, "packages/circuits/withdraw/evm/inputs.txt"), "utf8");
    const [realAmount, realRoot] = inputsRaw
      .trim()
      .split(/\s+/u)
      .map(value => BigInt(value));
    const realProof = fs.readFileSync(path.join(repoRoot, "packages/circuits/withdraw/evm/proof.hex"), "utf8").trim();

    return {
      realAmount,
      realProof,
      realRoot,
    };
  }

  async function deployFixture() {
    const [deployer, depositor, recipient] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory("MockDepositVerifier");
    const verifier = await verifierFactory.deploy();
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

  async function deployRealDepositVerifierFixture() {
    const [deployer, depositor, recipient] = await ethers.getSigners();
    const { realAmount, realCommitment, realProof } = readDepositProofFixture();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const depositVerifierFactory = await ethers.getContractFactory("DepositVerifier");
    const depositVerifier = await depositVerifierFactory.deploy();
    await depositVerifier.waitForDeployment();

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
      await depositVerifier.getAddress(),
      await transferVerifier.getAddress(),
      await withdrawVerifier.getAddress(),
      assetId,
    );
    await pool.waitForDeployment();

    await token.mint(depositor.address, realAmount);
    await token.connect(depositor).approve(await pool.getAddress(), realAmount);

    return {
      assetId,
      depositVerifier,
      depositor,
      deployer,
      pool,
      realAmount,
      realCommitment,
      realProof,
      recipient,
      token,
    };
  }

  async function deployRealTransferVerifierFixture() {
    const fixture = await deployRealDepositVerifierFixture();
    const { realNullifier, realOutputCommitments, realProof, realRoot } = readTransferProofFixture();

    const transferVerifierFactory = await ethers.getContractFactory("TransferVerifier");
    const transferVerifier = await transferVerifierFactory.deploy();
    await transferVerifier.waitForDeployment();

    const withdrawVerifierFactory = await ethers.getContractFactory("MockWithdrawVerifier");
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
    const pool = await poolFactory.deploy(
      await fixture.token.getAddress(),
      await fixture.depositVerifier.getAddress(),
      await transferVerifier.getAddress(),
      await withdrawVerifier.getAddress(),
      fixture.assetId,
    );
    await pool.waitForDeployment();

    await fixture.token.mint(fixture.depositor.address, fixture.realAmount);
    await fixture.token.connect(fixture.depositor).approve(await pool.getAddress(), fixture.realAmount);
    await pool
      .connect(fixture.depositor)
      .deposit(fixture.realAmount, fixture.assetId, fixture.realCommitment, fixture.realProof);

    return {
      ...fixture,
      pool,
      realNullifier,
      realOutputCommitments,
      realTransferProof: realProof,
      realTransferRoot: realRoot,
      transferVerifier,
      withdrawVerifier,
    };
  }

  async function deployRealWithdrawVerifierFixture() {
    const fixture = await deployRealDepositVerifierFixture();
    const { realAmount, realProof, realRoot } = readWithdrawProofFixture();

    const transferVerifierFactory = await ethers.getContractFactory("MockTransferVerifier");
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
    const pool = await poolFactory.deploy(
      await fixture.token.getAddress(),
      await fixture.depositVerifier.getAddress(),
      await transferVerifier.getAddress(),
      await withdrawVerifier.getAddress(),
      fixture.assetId,
    );
    await pool.waitForDeployment();

    await fixture.token.mint(fixture.depositor.address, fixture.realAmount);
    await fixture.token.connect(fixture.depositor).approve(await pool.getAddress(), fixture.realAmount);
    await pool
      .connect(fixture.depositor)
      .deposit(fixture.realAmount, fixture.assetId, fixture.realCommitment, fixture.realProof);

    return {
      ...fixture,
      pool,
      realWithdrawAmount: realAmount,
      realWithdrawProof: realProof,
      realWithdrawRoot: realRoot,
      transferVerifier,
      withdrawVerifier,
    };
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

  it("accepts a deposit verified by the generated deposit verifier", async function () {
    const { assetId, depositor, pool, realAmount, realCommitment, realProof, token } = await loadFixture(
      deployRealDepositVerifierFixture,
    );

    await expect(pool.connect(depositor).deposit(realAmount, assetId, realCommitment, realProof)).to.emit(
      pool,
      "Deposit",
    );

    const root = await pool.currentRoot();

    expect(await token.balanceOf(await pool.getAddress())).to.equal(realAmount);
    expect(await pool.treeSize()).to.equal(1n);
    expect(await pool.hasCommitment(realCommitment)).to.equal(true);
    expect(await pool.commitmentIndex(realCommitment)).to.equal(0n);
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

  it("transfers a note verified by the generated transfer verifier", async function () {
    const { pool, realNullifier, realOutputCommitments, realTransferProof, realTransferRoot } = await loadFixture(
      deployRealTransferVerifierFixture,
    );

    expect(await pool.currentRoot()).to.equal(realTransferRoot);

    await expect(pool.transfer(realTransferRoot, realNullifier, realOutputCommitments, realTransferProof)).to.emit(
      pool,
      "Transfer",
    );

    const newRoot = await pool.currentRoot();

    expect(await pool.treeSize()).to.equal(3n);
    expect(await pool.hasCommitment(realOutputCommitments[0])).to.equal(true);
    expect(await pool.hasCommitment(realOutputCommitments[1])).to.equal(true);
    expect(await pool.isNullifierSpent(realNullifier)).to.equal(true);
    expect(await pool.isKnownRoot(newRoot)).to.equal(true);
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

  it("withdraws a spent private note to a public recipient", async function () {
    const { pool, recipient, root, token } = await depositAndGetRoot();

    await expect(pool.withdraw(root, inputNullifier, recipient.address, amount, proof)).to.emit(pool, "Withdrawal");

    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);
    expect(await pool.isNullifierSpent(inputNullifier)).to.equal(true);
  });

  it("withdraws a note verified by the generated withdraw verifier", async function () {
    const { pool, realWithdrawAmount, realWithdrawProof, realWithdrawRoot, recipient, token } = await loadFixture(
      deployRealWithdrawVerifierFixture,
    );
    const realNullifier = 999999n;

    expect(await pool.currentRoot()).to.equal(realWithdrawRoot);

    await expect(
      pool.withdraw(realWithdrawRoot, realNullifier, recipient.address, realWithdrawAmount, realWithdrawProof),
    ).to.emit(pool, "Withdrawal");

    expect(await token.balanceOf(recipient.address)).to.equal(realWithdrawAmount);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);
    expect(await pool.isNullifierSpent(realNullifier)).to.equal(true);
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
