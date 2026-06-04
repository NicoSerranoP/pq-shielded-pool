import { expect } from "chai";
import { ethers } from "hardhat";

const FIXTURE_ROOT = 823984307n;
const PROGRAM_HASH = ethers.keccak256(ethers.toUtf8Bytes("pq-shielded-pool:cairo-merkle:v0"));

// Metadata from mocked Atlantic query 01KTADNEJVX1JA3S1YFWQSH967.
// This is the full L1 Cairo VM output that the Satellite fact registry binds.
const ATLANTIC_PROGRAM_HASH = "0x0288ba12915c0c7e91df572cf3ed0c9f391aa673cb247c5a208beaa50b668f09";
const ATLANTIC_SHARP_FACT_HASH = "0xf536c8800ed5952735a1505e8a45c6c499772ae160c853697c5c2fffacdfdfd6";
const ATLANTIC_METADATA_OUTPUT = [
  0n,
  0x49ee3eba8c1600700ee1b87eb599f16716b0b1022947733551fde4050ca6804n,
  1n,
  16n,
  0x454a85e898e1bdc146ed1df445d59117ccb9fe47ac3bf1933bbe085b1b8c9b7n,
  0n,
  1n,
  FIXTURE_ROOT,
  10n,
  10n,
  11n,
  20n,
  0n,
  30n,
  1n,
  40n,
  0n,
  50n,
  1n,
];

function outputHashFor(outputs: bigint[]): string {
  return ethers.solidityPackedKeccak256(
    outputs.map(() => "uint256"),
    outputs,
  );
}

function factHashFor(programHash: string, outputs: bigint[]): string {
  const outputHash = outputHashFor(outputs);
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [programHash, outputHash]));
}

describe("CairoFactVerifier", function () {
  it("computes the same fact hash formula documented for Atlantic Cairo facts", async function () {
    const MockRegistry = await ethers.getContractFactory("MockCairoFactRegistry");
    const registry = await MockRegistry.deploy();

    const Verifier = await ethers.getContractFactory("CairoFactVerifier");
    const verifier = await Verifier.deploy(await registry.getAddress(), PROGRAM_HASH, true);

    const outputs = [FIXTURE_ROOT];

    expect(await verifier.outputHash(outputs)).to.equal(outputHashFor(outputs));
    expect(await verifier.factHash(outputs)).to.equal(factHashFor(PROGRAM_HASH, outputs));
  });

  it("matches the mocked Atlantic metadata fact registered on Sepolia", async function () {
    const MockRegistry = await ethers.getContractFactory("MockCairoFactRegistry");
    const registry = await MockRegistry.deploy();

    const Verifier = await ethers.getContractFactory("CairoFactVerifier");
    const verifier = await Verifier.deploy(await registry.getAddress(), ATLANTIC_PROGRAM_HASH, true);

    expect(await verifier.factHash(ATLANTIC_METADATA_OUTPUT)).to.equal(ATLANTIC_SHARP_FACT_HASH);
  });

  it("requires the fact to be present in the configured registry mode", async function () {
    const MockRegistry = await ethers.getContractFactory("MockCairoFactRegistry");
    const registry = await MockRegistry.deploy();

    const Verifier = await ethers.getContractFactory("CairoFactVerifier");
    const verifier = await Verifier.deploy(await registry.getAddress(), PROGRAM_HASH, true);

    const outputs = [FIXTURE_ROOT];
    const factHash = factHashFor(PROGRAM_HASH, outputs);

    expect(await verifier.isOutputVerified(outputs)).to.equal(false);
    await expect(verifier.requireValidFact(outputs))
      .to.be.revertedWithCustomError(verifier, "CairoFactNotVerified")
      .withArgs(factHash, true);

    await registry.setCairoFact(factHash, false, true);
    expect(await verifier.isOutputVerified(outputs)).to.equal(false);

    await registry.setCairoFact(factHash, true, true);
    expect(await verifier.isOutputVerified(outputs)).to.equal(true);
    expect(await verifier.requireValidFact(outputs)).to.equal(factHash);
  });
});
