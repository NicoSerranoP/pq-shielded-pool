import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { ethers } from "hardhat";

const DEFAULT_NARGO_BIN = path.join(process.env.HOME ?? "", ".nargo/bin/nargo");
const MERKLE_HASH_DIR = path.resolve(__dirname, "../../circuits/merkle_hash");

const parseFieldOutputs = (output: string) => {
  const values = [...output.matchAll(/0x[0-9a-fA-F]+|\b\d+\b/gu)].map(match => match[0]);
  if (values.length < 2) {
    throw new Error(`Could not parse nargo output:\n${output}`);
  }

  return {
    noirMerklePoseidonT3: BigInt(values[values.length - 2]),
    noirRawPoseidon2T4: BigInt(values[values.length - 1]),
  };
};

const noirHashes = (left: bigint, right: bigint) => {
  const proverPath = path.join(MERKLE_HASH_DIR, "Prover.toml");
  const previous = fs.readFileSync(proverPath, "utf8");
  const nargoBin = process.env.NARGO_BIN ?? (fs.existsSync(DEFAULT_NARGO_BIN) ? DEFAULT_NARGO_BIN : "nargo");

  try {
    fs.writeFileSync(proverPath, [`left = "${left.toString()}"`, `right = "${right.toString()}"`, ""].join("\n"));
    const output = execFileSync(nargoBin, ["execute"], {
      cwd: MERKLE_HASH_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return parseFieldOutputs(output);
  } finally {
    fs.writeFileSync(proverPath, previous);
  }
};

async function main() {
  const [leftRaw, rightRaw] = process.argv.slice(2);
  const left = BigInt(leftRaw ?? "1");
  const right = BigInt(rightRaw ?? "2");

  const poseidonFactory = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();

  const solidityParent = BigInt(
    await (poseidon as unknown as { hash: (inputs: [bigint, bigint]) => Promise<bigint> }).hash([left, right]),
  );
  const { noirMerklePoseidonT3, noirRawPoseidon2T4 } = noirHashes(left, right);

  console.log(`left=${left.toString()}`);
  console.log(`right=${right.toString()}`);
  console.log(`solidityPoseidonT3=${solidityParent.toString()}`);
  console.log(`noirMerklePoseidonT3=${noirMerklePoseidonT3.toString()}`);
  console.log(`noirRawPoseidon2T4=${noirRawPoseidon2T4.toString()}`);
  console.log(`poseidonT3Match=${solidityParent === noirMerklePoseidonT3}`);
  console.log(`rawPoseidon2T4Match=${solidityParent === noirRawPoseidon2T4}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
