import { expect } from "chai";
import { ethers } from "hardhat";

const DEPOSIT_KIND = 1n;
const TRANSFER_KIND = 2n;
const WITHDRAW_KIND = 3n;

const DEPOSIT_PROGRAM_HASH = ethers.keccak256(ethers.toUtf8Bytes("pq-shielded-pool:deposit:cairo:v0"));
const TRANSFER_PROGRAM_HASH = ethers.keccak256(ethers.toUtf8Bytes("pq-shielded-pool:transfer:cairo:v0"));
const WITHDRAW_PROGRAM_HASH = ethers.keccak256(ethers.toUtf8Bytes("pq-shielded-pool:withdraw:cairo:v0"));

const CAIRO_FIELD_PRIME = 3618502788666131213697322783095070105623107215331596699973092056135872020481n;
const CAIRO_SAMPLE_COMMITMENT = 708906366742684671739052240514390682060439339775166529376693188940621610472n;
const CAIRO_SAMPLE_NULLIFIER = 189201975949437568327607085772554213874204127315392318182958675348821401892n;
const CAIRO_SAMPLE_OUTPUT_0 = 435531981823200609534198368424769213306544141857760933941319062272153735097n;
const CAIRO_SAMPLE_OUTPUT_1 = felt(-1132089075213281521965067804472436895916400408903098080466017295653505604929n);
const CAIRO_SAMPLE_RECIPIENT = "0x00000000000000000000000000000000000001bc";

function felt(value: bigint): bigint {
  return value < 0n ? CAIRO_FIELD_PRIME + value : value;
}

function serializedCairoArray(values: bigint[]): bigint[] {
  return [BigInt(values.length), ...values];
}

function proofFor(outputs: bigint[]): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [outputs]);
}

function outputHashFor(outputs: bigint[]): string {
  return ethers.solidityPackedKeccak256(
    outputs.map(() => "uint256"),
    outputs,
  );
}

function factHashFor(programHash: string, outputs: bigint[]): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [programHash, outputHashFor(outputs)]),
  );
}

describe("CairoShieldedPoolVerifier", function () {
  const amount = ethers.parseEther("10");
  const commitment = 123456789n;
  const inputNullifier = 1111n;
  const outputCommitments = [2222n, 3333n];

  async function deployFixture() {
    const [deployer, depositor, recipient] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const registryFactory = await ethers.getContractFactory("MockCairoFactRegistry");
    const registry = await registryFactory.deploy();
    await registry.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory("CairoShieldedPoolVerifier");
    const verifier = await verifierFactory.deploy(
      await registry.getAddress(),
      DEPOSIT_PROGRAM_HASH,
      TRANSFER_PROGRAM_HASH,
      WITHDRAW_PROGRAM_HASH,
      true,
    );
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
    const pool = await poolFactory.deploy(
      await token.getAddress(),
      await verifier.getAddress(),
      await verifier.getAddress(),
      await verifier.getAddress(),
      assetId,
    );
    await pool.waitForDeployment();

    await token.mint(depositor.address, amount);
    await token.connect(depositor).approve(await pool.getAddress(), amount);

    return { assetId, commitment, deployer, depositor, pool, recipient, registry, token, verifier };
  }

  async function deployFixtureWithAsset(assetId: bigint, mintAmount: bigint) {
    const [deployer, depositor, recipient] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("SE2Token");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const registryFactory = await ethers.getContractFactory("MockCairoFactRegistry");
    const registry = await registryFactory.deploy();
    await registry.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory("CairoShieldedPoolVerifier");
    const verifier = await verifierFactory.deploy(
      await registry.getAddress(),
      DEPOSIT_PROGRAM_HASH,
      TRANSFER_PROGRAM_HASH,
      WITHDRAW_PROGRAM_HASH,
      true,
    );
    await verifier.waitForDeployment();

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
      await verifier.getAddress(),
      await verifier.getAddress(),
      assetId,
    );
    await pool.waitForDeployment();

    await token.mint(depositor.address, mintAmount);
    await token.connect(depositor).approve(await pool.getAddress(), mintAmount);

    return { assetId, deployer, depositor, pool, recipient, registry, token, verifier };
  }

  async function registerFact(registry: any, programHash: string, outputs: bigint[]) {
    await registry.setCairoFact(factHashFor(programHash, outputs), true, true);
  }

  async function depositAndGetRoot() {
    const fixture = await deployFixture();
    const { assetId, depositor, pool, registry } = fixture;
    const depositOutputs = serializedCairoArray([DEPOSIT_KIND, amount, assetId, commitment]);

    await registerFact(registry, DEPOSIT_PROGRAM_HASH, depositOutputs);
    await pool.connect(depositor).deposit(amount, assetId, commitment, proofFor(depositOutputs));

    return { ...fixture, root: await pool.currentRoot() };
  }

  it("accepts a deposit when the matching Cairo fact is registered", async function () {
    const { assetId, depositor, pool, registry, token } = await deployFixture();
    const outputs = serializedCairoArray([DEPOSIT_KIND, amount, assetId, commitment]);

    await registerFact(registry, DEPOSIT_PROGRAM_HASH, outputs);

    await expect(pool.connect(depositor).deposit(amount, assetId, commitment, proofFor(outputs))).to.emit(
      pool,
      "Deposit",
    );

    expect(await token.balanceOf(await pool.getAddress())).to.equal(amount);
    expect(await pool.hasCommitment(commitment)).to.equal(true);
  });

  it("rejects a deposit when the Cairo fact is not registered", async function () {
    const { assetId, depositor, pool } = await deployFixture();
    const outputs = serializedCairoArray([DEPOSIT_KIND, amount, assetId, commitment]);

    await expect(
      pool.connect(depositor).deposit(amount, assetId, commitment, proofFor(outputs)),
    ).to.be.revertedWithCustomError(pool, "InvalidDepositProof");
  });

  it("accepts a private transfer when the matching Cairo fact is registered", async function () {
    const { pool, registry, root } = await depositAndGetRoot();
    const outputs = serializedCairoArray([
      TRANSFER_KIND,
      root,
      inputNullifier,
      BigInt(outputCommitments.length),
      ...outputCommitments,
    ]);

    await registerFact(registry, TRANSFER_PROGRAM_HASH, outputs);

    await expect(pool.transfer(root, inputNullifier, outputCommitments, proofFor(outputs))).to.emit(pool, "Transfer");

    expect(await pool.treeSize()).to.equal(3n);
    expect(await pool.isNullifierSpent(inputNullifier)).to.equal(true);
    expect(await pool.hasCommitment(outputCommitments[0])).to.equal(true);
    expect(await pool.hasCommitment(outputCommitments[1])).to.equal(true);
  });

  it("rejects a transfer when the registered fact is bound to different public inputs", async function () {
    const { pool, registry, root } = await depositAndGetRoot();
    const wrongOutputs = serializedCairoArray([
      TRANSFER_KIND,
      root,
      inputNullifier,
      BigInt(outputCommitments.length),
      outputCommitments[0],
      9999n,
    ]);

    await registerFact(registry, TRANSFER_PROGRAM_HASH, wrongOutputs);

    await expect(
      pool.transfer(root, inputNullifier, outputCommitments, proofFor(wrongOutputs)),
    ).to.be.revertedWithCustomError(pool, "InvalidTransferProof");
  });

  it("accepts a withdrawal when the matching Cairo fact is registered", async function () {
    const { pool, recipient, registry, root, token } = await depositAndGetRoot();
    const outputs = serializedCairoArray([WITHDRAW_KIND, root, inputNullifier, BigInt(recipient.address), amount]);

    await registerFact(registry, WITHDRAW_PROGRAM_HASH, outputs);

    await expect(pool.withdraw(root, inputNullifier, recipient.address, amount, proofFor(outputs))).to.emit(
      pool,
      "Withdrawal",
    );

    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);
    expect(await pool.isNullifierSpent(inputNullifier)).to.equal(true);
  });

  it("accepts the sample Cairo executable deposit and transfer outputs", async function () {
    const { depositor, pool, registry, token } = await deployFixtureWithAsset(42n, 10n);
    const depositOutputs = serializedCairoArray([DEPOSIT_KIND, 10n, 42n, CAIRO_SAMPLE_COMMITMENT]);
    const transferOutputs = serializedCairoArray([
      TRANSFER_KIND,
      CAIRO_SAMPLE_COMMITMENT,
      CAIRO_SAMPLE_NULLIFIER,
      2n,
      CAIRO_SAMPLE_OUTPUT_0,
      CAIRO_SAMPLE_OUTPUT_1,
    ]);

    await registerFact(registry, DEPOSIT_PROGRAM_HASH, depositOutputs);
    await pool.connect(depositor).deposit(10n, 42n, CAIRO_SAMPLE_COMMITMENT, proofFor(depositOutputs));

    expect(await pool.currentRoot()).to.equal(CAIRO_SAMPLE_COMMITMENT);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(10n);

    await registerFact(registry, TRANSFER_PROGRAM_HASH, transferOutputs);
    await expect(
      pool.transfer(
        CAIRO_SAMPLE_COMMITMENT,
        CAIRO_SAMPLE_NULLIFIER,
        [CAIRO_SAMPLE_OUTPUT_0, CAIRO_SAMPLE_OUTPUT_1],
        proofFor(transferOutputs),
      ),
    ).to.emit(pool, "Transfer");

    expect(await pool.isNullifierSpent(CAIRO_SAMPLE_NULLIFIER)).to.equal(true);
    expect(await pool.hasCommitment(CAIRO_SAMPLE_OUTPUT_0)).to.equal(true);
    expect(await pool.hasCommitment(CAIRO_SAMPLE_OUTPUT_1)).to.equal(true);
  });

  it("accepts the sample Cairo executable withdrawal output", async function () {
    const { depositor, pool, registry, token } = await deployFixtureWithAsset(42n, 10n);
    const depositOutputs = serializedCairoArray([DEPOSIT_KIND, 10n, 42n, CAIRO_SAMPLE_COMMITMENT]);
    const withdrawOutputs = serializedCairoArray([
      WITHDRAW_KIND,
      CAIRO_SAMPLE_COMMITMENT,
      CAIRO_SAMPLE_NULLIFIER,
      BigInt(CAIRO_SAMPLE_RECIPIENT),
      10n,
    ]);

    await registerFact(registry, DEPOSIT_PROGRAM_HASH, depositOutputs);
    await pool.connect(depositor).deposit(10n, 42n, CAIRO_SAMPLE_COMMITMENT, proofFor(depositOutputs));

    await registerFact(registry, WITHDRAW_PROGRAM_HASH, withdrawOutputs);
    await expect(
      pool.withdraw(
        CAIRO_SAMPLE_COMMITMENT,
        CAIRO_SAMPLE_NULLIFIER,
        CAIRO_SAMPLE_RECIPIENT,
        10n,
        proofFor(withdrawOutputs),
      ),
    ).to.emit(pool, "Withdrawal");

    expect(await token.balanceOf(CAIRO_SAMPLE_RECIPIENT)).to.equal(10n);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);
    expect(await pool.isNullifierSpent(CAIRO_SAMPLE_NULLIFIER)).to.equal(true);
  });
});
