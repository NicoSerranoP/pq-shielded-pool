import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ShieldedPool", function () {
  const amount = ethers.parseEther("10");
  const commitment = 123456789n;
  const proof = "0x1234";

  async function deployFixture() {
    const [deployer, depositor] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory("MockDepositVerifier");
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();

    const assetId = BigInt(await token.getAddress());

    const poseidonFactory = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
    const poseidon = await poseidonFactory.deploy();
    await poseidon.waitForDeployment();

    const poolFactory = await ethers.getContractFactory("ShieldedPool", {
      libraries: {
        PoseidonT3: await poseidon.getAddress(),
      },
    });
    const pool = await poolFactory.deploy(await token.getAddress(), await verifier.getAddress(), assetId);
    await pool.waitForDeployment();

    await token.mint(depositor.address, amount);
    await token.connect(depositor).approve(await pool.getAddress(), amount);

    return { assetId, commitment, depositor, deployer, pool, proof, token, verifier };
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
});
