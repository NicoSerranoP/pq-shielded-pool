import { expect } from "chai";
import { ethers } from "hardhat";
import type { BaseContract } from "ethers";
import { readFileSync } from "fs";
import path from "path";

const BN254_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

type CircuitArtifact = {
  circuitName: "deposit" | "transfer" | "withdraw";
  contractName: "DepositVerifier" | "TransferVerifier" | "WithdrawVerifier";
  publicInputCount: 2 | 4;
};

const artifacts: CircuitArtifact[] = [
  { circuitName: "deposit", contractName: "DepositVerifier", publicInputCount: 2 },
  { circuitName: "transfer", contractName: "TransferVerifier", publicInputCount: 4 },
  { circuitName: "withdraw", contractName: "WithdrawVerifier", publicInputCount: 2 },
];

const circuitEvmDir = (circuitName: CircuitArtifact["circuitName"]) =>
  path.resolve(__dirname, "../../circuits", circuitName, "evm");

const readProof = (circuitName: CircuitArtifact["circuitName"]) =>
  readFileSync(path.join(circuitEvmDir(circuitName), "proof.hex"), "utf8").trim();

const readInputs = (circuitName: CircuitArtifact["circuitName"]) =>
  readFileSync(path.join(circuitEvmDir(circuitName), "inputs.txt"), "utf8")
    .trim()
    .split(/\s+/)
    .map(value => BigInt(value));

const tamperProof = (proof: string) => {
  const bytes = ethers.getBytes(proof);
  bytes[0] ^= 1;
  return ethers.hexlify(bytes);
};

const verifyProof = (verifier: BaseContract, proof: string, inputs: bigint[]) =>
  verifier.getFunction("verifyProof")(proof, inputs);

describe("Groth16-wrapped verifier EVM artifacts", function () {
  for (const artifact of artifacts) {
    describe(artifact.circuitName, function () {
      async function deployVerifier() {
        const verifierFactory = await ethers.getContractFactory(artifact.contractName);
        const verifier = await verifierFactory.deploy();
        await verifier.waitForDeployment();
        return verifier;
      }

      it("accepts the exported Groth16 EVM proof and public inputs", async function () {
        const verifier = await deployVerifier();
        const proof = readProof(artifact.circuitName);
        const inputs = readInputs(artifact.circuitName);

        expect(ethers.getBytes(proof)).to.have.lengthOf(384);
        expect(inputs).to.have.lengthOf(artifact.publicInputCount);

        await expect(verifyProof(verifier, proof, inputs)).to.not.be.reverted;
      });

      it("rejects a tampered Groth16 EVM proof", async function () {
        const verifier = await deployVerifier();
        const proof = tamperProof(readProof(artifact.circuitName));
        const inputs = readInputs(artifact.circuitName);

        await expect(verifyProof(verifier, proof, inputs)).to.be.reverted;
      });

      it("rejects tampered public inputs", async function () {
        const verifier = await deployVerifier();
        const proof = readProof(artifact.circuitName);
        const inputs = [...readInputs(artifact.circuitName)];
        inputs[0] += 1n;

        await expect(verifyProof(verifier, proof, inputs)).to.be.reverted;
      });

      it("rejects malformed proof length before pairing checks", async function () {
        const verifier = await deployVerifier();
        const proof = readProof(artifact.circuitName).slice(0, -2);
        const inputs = readInputs(artifact.circuitName);

        await expect(verifyProof(verifier, proof, inputs)).to.be.revertedWithCustomError(
          verifier,
          "ProofLengthInvalid",
        );
      });

      it("rejects public inputs outside the BN254 scalar field", async function () {
        const verifier = await deployVerifier();
        const proof = readProof(artifact.circuitName);
        const inputs = [...readInputs(artifact.circuitName)];
        inputs[0] = BN254_SCALAR_FIELD;

        await expect(verifyProof(verifier, proof, inputs)).to.be.revertedWithCustomError(
          verifier,
          "PublicInputNotInField",
        );
      });
    });
  }

  it("does not accept a proof from a different circuit with same input arity", async function () {
    const withdrawVerifierFactory = await ethers.getContractFactory("WithdrawVerifier");
    const withdrawVerifier = await withdrawVerifierFactory.deploy();
    await withdrawVerifier.waitForDeployment();

    await expect(verifyProof(withdrawVerifier, readProof("deposit"), readInputs("deposit"))).to.be.reverted;
  });
});
