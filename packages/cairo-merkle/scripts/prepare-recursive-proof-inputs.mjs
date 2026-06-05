#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_PROOF_PATH = path.join(
  REPO_ROOT,
  "packages/cairo-merkle/target/local-proofs/merkle-proof.poseidon.cairo-serde.json",
);

function printHelp() {
  console.log(`Prepare local recursive-verifier and Atlantic-public input files from a Cairo-serde Stwo proof.

Usage:
  node packages/cairo-merkle/scripts/prepare-recursive-proof-inputs.mjs [options]

Options:
  --proof-path PATH           Cairo-serde proof JSON array. Default: current Merkle fixture proof.
  --array-args-path PATH      Output for scarb execute array arguments. Default derives from proof path.
  --atlantic-input-path PATH  Output for Atlantic text input. Default derives from proof path.
  --help, -h                  Show this help.

Privacy:
  The Atlantic text output is for public recursive-verifier experiments only. Do not produce or upload
  files from private shielded-pool witnesses unless the team has explicitly audited the proof for leakage.
`);
}

function parseArgs(argv) {
  const options = {
    proofPath: DEFAULT_PROOF_PATH,
    arrayArgsPath: "",
    atlanticInputPath: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[i];
    };

    if (arg === "--proof-path") options.proofPath = path.resolve(next());
    else if (arg === "--array-args-path") options.arrayArgsPath = path.resolve(next());
    else if (arg === "--atlantic-input-path") options.atlanticInputPath = path.resolve(next());
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.arrayArgsPath) {
    options.arrayArgsPath = options.proofPath.replace(/\.json$/u, ".array-args.json");
  }
  if (!options.atlanticInputPath) {
    options.atlanticInputPath = options.proofPath.replace(/\.json$/u, ".atlantic.decimal.txt");
  }

  return options;
}

function readProof(proofPath) {
  if (!fs.existsSync(proofPath)) {
    throw new Error(`Proof file not found: ${proofPath}`);
  }

  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  if (!Array.isArray(proof) || proof.length === 0) {
    throw new Error("Expected proof file to be a non-empty JSON array");
  }

  for (const [index, value] of proof.entries()) {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/u.test(value)) {
      throw new Error(`Expected proof[${index}] to be a hex felt string, got ${JSON.stringify(value)}`);
    }
  }

  return proof;
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const proof = readProof(options.proofPath);
  const arrayArgs = [`0x${proof.length.toString(16)}`, ...proof];
  const decimalInput = `[${proof.map(value => BigInt(value).toString()).join(" ")}]
`;

  ensureParent(options.arrayArgsPath);
  ensureParent(options.atlanticInputPath);
  fs.writeFileSync(options.arrayArgsPath, `${JSON.stringify(arrayArgs, null, 2)}
`);
  fs.writeFileSync(options.atlanticInputPath, decimalInput);

  console.log(
    JSON.stringify(
      {
        proofPath: path.relative(REPO_ROOT, options.proofPath),
        proofFelts: proof.length,
        arrayArgsPath: path.relative(REPO_ROOT, options.arrayArgsPath),
        arrayArgsFeltsIncludingLength: arrayArgs.length,
        atlanticInputPath: path.relative(REPO_ROOT, options.atlanticInputPath),
        atlanticInputFeltsWithoutLength: proof.length,
      },
      null,
      2,
    ),
  );
}

main();
