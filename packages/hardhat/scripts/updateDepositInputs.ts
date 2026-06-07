import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { toBeHex } from "ethers";

const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const U32_MAX = 2n ** 32n - 1n;
const CIRCUITS_DIR = path.resolve(__dirname, "../../circuits");
const DEPOSIT_DIR = path.join(CIRCUITS_DIR, "deposit");
const NOTE_HASH_DIR = path.join(CIRCUITS_DIR, "note_hash");
const DEFAULT_NARGO_BIN = path.join(process.env.HOME ?? "", ".nargo/bin/nargo");

type DepositInputArgs = {
  value: bigint;
  asset: bigint;
  owner: bigint;
  nonce: bigint;
};

const randomField = () => BigInt(`0x${crypto.randomBytes(32).toString("hex")}`) % SNARK_SCALAR_FIELD;

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value) {
    throw new Error(`Missing ${flag}`);
  }

  return value;
};

const parseField = (value: string) => {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= SNARK_SCALAR_FIELD) {
    throw new Error(`Field value out of range: ${value}`);
  }

  return parsed;
};

const parseU32 = (value: string, name: string) => {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > U32_MAX) {
    throw new Error(`${name} must fit in u32`);
  }

  return parsed;
};

const parseArgs = (): DepositInputArgs => ({
  value: parseU32(argValue("--value") ?? "5", "value"),
  asset: parseU32(argValue("--asset") ?? "1", "asset"),
  owner: argValue("--owner") ? parseField(argValue("--owner")!) : randomField(),
  nonce: argValue("--nonce") ? parseField(argValue("--nonce")!) : randomField(),
});

const fieldHex = (value: bigint) => toBeHex(value, 32);

const noteHashProverToml = ({ value, asset, owner, nonce }: DepositInputArgs) =>
  [
    `value = ${value.toString()}`,
    `asset = ${asset.toString()}`,
    `owner = "${fieldHex(owner)}"`,
    `nonce = "${fieldHex(nonce)}"`,
    "",
  ].join("\n");

const depositProverToml = ({ value, asset, owner, nonce }: DepositInputArgs, commitment: bigint) =>
  [
    `commitment = "${fieldHex(commitment)}"`,
    `value = ${value.toString()}`,
    "",
    "[note]",
    `asset = ${asset.toString()}`,
    `nonce = "${fieldHex(nonce)}"`,
    `owner = "${fieldHex(owner)}"`,
    `value = ${value.toString()}`,
    "",
  ].join("\n");

const parseNargoOutput = (output: string) => {
  const values = [...output.matchAll(/0x[0-9a-fA-F]+|\b\d+\b/gu)].map(match => match[0]);
  if (values.length < 2) {
    throw new Error(`Could not parse note_hash output:\n${output}`);
  }

  return {
    commitment: BigInt(values[values.length - 2]),
    nullifier: BigInt(values[values.length - 1]),
  };
};

const computeNoteHash = (args: DepositInputArgs) => {
  const proverPath = path.join(NOTE_HASH_DIR, "Prover.toml");
  const previous = fs.readFileSync(proverPath, "utf8");
  const nargoBin = process.env.NARGO_BIN ?? (fs.existsSync(DEFAULT_NARGO_BIN) ? DEFAULT_NARGO_BIN : "nargo");

  try {
    fs.writeFileSync(proverPath, noteHashProverToml(args));
    const output = execFileSync(nargoBin, ["execute"], {
      cwd: NOTE_HASH_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return parseNargoOutput(output);
  } finally {
    fs.writeFileSync(proverPath, previous);
  }
};

function main() {
  const args = parseArgs();
  const { commitment, nullifier } = computeNoteHash(args);

  fs.writeFileSync(path.join(DEPOSIT_DIR, "Prover.toml"), depositProverToml(args, commitment));
  fs.mkdirSync(path.join(DEPOSIT_DIR, "evm"), { recursive: true });
  fs.writeFileSync(path.join(DEPOSIT_DIR, "evm", "inputs.txt"), `${commitment.toString()}\n${args.value.toString()}\n`);

  console.log(
    JSON.stringify(
      {
        value: args.value.toString(),
        asset: args.asset.toString(),
        owner: fieldHex(args.owner),
        nonce: fieldHex(args.nonce),
        commitment: commitment.toString(),
        commitmentHex: fieldHex(commitment),
        nullifier: nullifier.toString(),
        nullifierHex: fieldHex(nullifier),
        updated: [
          path.relative(process.cwd(), path.join(DEPOSIT_DIR, "Prover.toml")),
          path.relative(process.cwd(), path.join(DEPOSIT_DIR, "evm", "inputs.txt")),
        ],
      },
      null,
      2,
    ),
  );
}

main();
