import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { ethers } from "hardhat";

const DEFAULT_NARGO_BIN = path.join(process.env.HOME ?? "", ".nargo/bin/nargo");
const CIRCUITS_DIR = path.resolve(__dirname, "../../circuits");
const PACKAGE_DIR = path.join(CIRCUITS_DIR, "poseidon_t3_vectors");

const VECTOR_PAIRS: [bigint, bigint][] = [
  [1n, 2n],
  [2n, 1n],
  [5n, 5n],
  [123456789n, 987654321n],
  [
    14765692717966284308695316414323882997709571051230519444909846258304647480416n,
    10375291949751026911193812572720115613027699700150366148133868776192312438132n,
  ],
];

const tomlArray = (values: bigint[]) => `[${values.map(value => `"${value.toString()}"`).join(", ")}]`;

async function main() {
  const poseidonFactory = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();

  const expected: bigint[] = [];
  for (const [left, right] of VECTOR_PAIRS) {
    const hash = await (poseidon as unknown as { hash: (inputs: [bigint, bigint]) => Promise<bigint> }).hash([
      left,
      right,
    ]);
    expected.push(BigInt(hash));
  }

  const proverPath = path.join(PACKAGE_DIR, "Prover.toml");
  const previous = fs.readFileSync(proverPath, "utf8");
  const nargoBin = process.env.NARGO_BIN ?? (fs.existsSync(DEFAULT_NARGO_BIN) ? DEFAULT_NARGO_BIN : "nargo");

  const proverToml = [
    `lefts = ${tomlArray(VECTOR_PAIRS.map(([left]) => left))}`,
    `rights = ${tomlArray(VECTOR_PAIRS.map(([, right]) => right))}`,
    `expected = ${tomlArray(expected)}`,
    "",
  ].join("\n");

  try {
    fs.writeFileSync(proverPath, proverToml);
    const output = execFileSync(nargoBin, ["execute", "--package", "poseidon_t3_vectors"], {
      cwd: CIRCUITS_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    console.log(`vectors=${VECTOR_PAIRS.length}`);
    for (let i = 0; i < VECTOR_PAIRS.length; i++) {
      const [left, right] = VECTOR_PAIRS[i];
      console.log(`vector[${i}] left=${left.toString()} right=${right.toString()} expected=${expected[i].toString()}`);
    }
    console.log(output.trim());
  } finally {
    fs.writeFileSync(proverPath, previous);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
