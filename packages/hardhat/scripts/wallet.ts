import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { AbiCoder, keccak256, toBeHex } from "ethers";

const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const STORE_DIR = path.resolve(__dirname, "../.local-wallets");
const DEFAULT_SCHEME = "noir-poseidon2-v0";
const DEV_SCHEME = "keccak-dev-v0";
const SUPPORTED_SCHEMES = [DEFAULT_SCHEME, DEV_SCHEME] as const;
const NOTE_HASH_DIR = path.resolve(__dirname, "../../circuits/note_hash");
const DEFAULT_NARGO_BIN = path.join(process.env.HOME ?? "", ".nargo/bin/nargo");

type NoteStatus = "unspent" | "spent";
type Scheme = (typeof SUPPORTED_SCHEMES)[number];

type Note = {
  id: string;
  value: string;
  assetId: string;
  owner: string;
  ownerSecret: string;
  nonce: string;
  commitment: string;
  nullifier: string;
  scheme: Scheme;
  status: NoteStatus;
  createdAt: string;
};

type WalletFile = {
  name: string;
  version: 1;
  scheme: Scheme;
  ownerSecret: string;
  owner: string;
  notes: Note[];
  createdAt: string;
};

function usage(): never {
  console.log(`Local shielded wallet CLI

Usage:
  yarn wallet create <name>
  yarn wallet list
  yarn wallet show <name>
  yarn wallet note:create <name> --value <amount> --asset-id <assetId> [--scheme noir-poseidon2-v0|keccak-dev-v0]
  yarn wallet notes <name>
  yarn wallet note:spend <name> --id <noteId>
  yarn wallet note:export <name> --id <noteId> --out <path>
  yarn wallet note:import <name> --file <path>

Notes:
  Default scheme is ${DEFAULT_SCHEME}, which shells out to nargo and the note_hash Noir helper.
  Use --scheme ${DEV_SCHEME} only when nargo is unavailable and you just need local bookkeeping.
`);
  process.exit(1);
}

function ensureStoreDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
}

function walletPath(name: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error("Wallet name may only contain letters, numbers, '_' and '-'");
  }

  return path.join(STORE_DIR, `${name}.json`);
}

function readWallet(name: string): WalletFile {
  const filePath = walletPath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wallet not found: ${name}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as WalletFile;
}

function writeWallet(wallet: WalletFile) {
  ensureStoreDir();
  fs.writeFileSync(walletPath(wallet.name), `${JSON.stringify(wallet, null, 2)}\n`, { mode: 0o600 });
}

function randomField(): bigint {
  return BigInt(`0x${crypto.randomBytes(32).toString("hex")}`) % SNARK_SCALAR_FIELD;
}

function fieldHash(types: string[], values: unknown[]): bigint {
  const encoded = AbiCoder.defaultAbiCoder().encode(types, values);
  return BigInt(keccak256(encoded)) % SNARK_SCALAR_FIELD;
}

function toFieldHex(value: bigint): string {
  return toBeHex(value, 32);
}

function computeOwner(ownerSecret: bigint): bigint {
  return fieldHash(["string", "uint256"], ["owner", ownerSecret]);
}

function computeDevCommitment(value: bigint, assetId: bigint, owner: bigint, nonce: bigint): bigint {
  return fieldHash(["string", "uint256", "uint256", "uint256", "uint256"], ["note", value, assetId, owner, nonce]);
}

function computeDevNullifier(value: bigint, owner: bigint, nonce: bigint): bigint {
  return fieldHash(["string", "uint256", "uint256", "uint256"], ["nullifier", value, owner, nonce]);
}

function proverToml(value: bigint, assetId: bigint, owner: bigint, nonce: bigint): string {
  return [
    `value = ${value.toString()}`,
    `asset = ${assetId.toString()}`,
    `owner = "${toFieldHex(owner)}"`,
    `nonce = "${toFieldHex(nonce)}"`,
    "",
  ].join("\n");
}

function parseNargoHashOutput(output: string): { commitment: bigint; nullifier: bigint } {
  const values = [...output.matchAll(/0x[0-9a-fA-F]+|\b\d+\b/gu)].map(match => match[0]);
  if (values.length < 2) {
    throw new Error(`Could not parse note_hash output:\n${output}`);
  }

  const [commitmentRaw, nullifierRaw] = values.slice(-2);
  return {
    commitment: BigInt(commitmentRaw),
    nullifier: BigInt(nullifierRaw),
  };
}

function computeNoirPoseidon2NoteHash(value: bigint, assetId: bigint, owner: bigint, nonce: bigint) {
  const proverPath = path.join(NOTE_HASH_DIR, "Prover.toml");
  const previous = fs.existsSync(proverPath) ? fs.readFileSync(proverPath, "utf8") : undefined;
  const nargoBin = process.env.NARGO_BIN ?? (fs.existsSync(DEFAULT_NARGO_BIN) ? DEFAULT_NARGO_BIN : "nargo");

  try {
    fs.writeFileSync(proverPath, proverToml(value, assetId, owner, nonce));
    const output = execFileSync(nargoBin, ["execute"], {
      cwd: NOTE_HASH_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return parseNargoHashOutput(output);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT") {
      throw new Error(
        "nargo not found. Install Noir/Nargo, set NARGO_BIN=/path/to/nargo, or pass --scheme keccak-dev-v0 for local-only bookkeeping.",
      );
    }

    const stderr =
      error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr) : "";
    throw new Error(`Failed to compute Noir note hash with nargo.${stderr ? `\n${stderr}` : ""}`);
  } finally {
    if (previous === undefined) {
      fs.rmSync(proverPath, { force: true });
    } else {
      fs.writeFileSync(proverPath, previous);
    }
  }
}

function computeNoteHash(scheme: Scheme, value: bigint, assetId: bigint, owner: bigint, nonce: bigint) {
  if (scheme === DEFAULT_SCHEME) {
    return computeNoirPoseidon2NoteHash(value, assetId, owner, nonce);
  }

  return {
    commitment: computeDevCommitment(value, assetId, owner, nonce),
    nullifier: computeDevNullifier(value, owner, nonce),
  };
}

function argValue(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing ${flag}`);
  }

  return args[index + 1];
}

function optionalArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  if (index + 1 >= args.length) {
    throw new Error(`Missing ${flag}`);
  }

  return args[index + 1];
}

function createWallet(name: string) {
  ensureStoreDir();
  const filePath = walletPath(name);
  if (fs.existsSync(filePath)) {
    throw new Error(`Wallet already exists: ${name}`);
  }

  const ownerSecret = randomField();
  const owner = computeOwner(ownerSecret);
  const now = new Date().toISOString();
  const wallet: WalletFile = {
    name,
    version: 1,
    scheme: DEFAULT_SCHEME,
    ownerSecret: ownerSecret.toString(),
    owner: owner.toString(),
    notes: [],
    createdAt: now,
  };

  writeWallet(wallet);
  console.log(JSON.stringify({ name, owner: wallet.owner, path: filePath }, null, 2));
}

function listWallets() {
  ensureStoreDir();
  const names = fs
    .readdirSync(STORE_DIR)
    .filter(file => file.endsWith(".json"))
    .map(file => path.basename(file, ".json"));

  console.log(JSON.stringify(names, null, 2));
}

function showWallet(name: string) {
  const wallet = readWallet(name);
  console.log(
    JSON.stringify(
      {
        name: wallet.name,
        scheme: wallet.scheme,
        owner: wallet.owner,
        notes: wallet.notes.length,
        unspent: wallet.notes.filter(note => note.status === "unspent").length,
        createdAt: wallet.createdAt,
      },
      null,
      2,
    ),
  );
}

function createNote(name: string, args: string[]) {
  const wallet = readWallet(name);
  const value = BigInt(argValue(args, "--value"));
  const assetId = BigInt(argValue(args, "--asset-id"));
  const scheme = (optionalArgValue(args, "--scheme") ?? wallet.scheme) as Scheme;
  if (!SUPPORTED_SCHEMES.includes(scheme)) {
    throw new Error(`Unsupported --scheme ${scheme}`);
  }

  if (value <= 0n) {
    throw new Error("--value must be positive");
  }

  if (assetId <= 0n) {
    throw new Error("--asset-id must be positive");
  }

  const owner = BigInt(wallet.owner);
  const nonce = randomField();
  const { commitment, nullifier } = computeNoteHash(scheme, value, assetId, owner, nonce);
  const note: Note = {
    id: crypto.randomUUID(),
    value: value.toString(),
    assetId: assetId.toString(),
    owner: owner.toString(),
    ownerSecret: wallet.ownerSecret,
    nonce: nonce.toString(),
    commitment: commitment.toString(),
    nullifier: nullifier.toString(),
    scheme,
    status: "unspent",
    createdAt: new Date().toISOString(),
  };

  wallet.notes.push(note);
  writeWallet(wallet);
  console.log(JSON.stringify(printableNote(note), null, 2));
}

function printableNote(note: Note) {
  return {
    id: note.id,
    value: note.value,
    assetId: note.assetId,
    commitment: note.commitment,
    commitmentHex: toFieldHex(BigInt(note.commitment)),
    nullifier: note.nullifier,
    nullifierHex: toFieldHex(BigInt(note.nullifier)),
    scheme: note.scheme,
    status: note.status,
    createdAt: note.createdAt,
  };
}

function listNotes(name: string) {
  const wallet = readWallet(name);
  console.log(JSON.stringify(wallet.notes.map(printableNote), null, 2));
}

function findNote(wallet: WalletFile, id: string): Note {
  const note = wallet.notes.find(candidate => candidate.id === id);
  if (!note) {
    throw new Error(`Note not found: ${id}`);
  }

  return note;
}

function spendNote(name: string, args: string[]) {
  const wallet = readWallet(name);
  const id = argValue(args, "--id");
  const note = findNote(wallet, id);
  note.status = "spent";
  writeWallet(wallet);
  console.log(JSON.stringify(printableNote(note), null, 2));
}

function exportNote(name: string, args: string[]) {
  const wallet = readWallet(name);
  const id = argValue(args, "--id");
  const outPath = path.resolve(argValue(args, "--out"));
  const note = findNote(wallet, id);
  fs.writeFileSync(outPath, `${JSON.stringify({ scheme: note.scheme, note }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ exported: outPath, id }, null, 2));
}

function importNote(name: string, args: string[]) {
  const wallet = readWallet(name);
  const filePath = path.resolve(argValue(args, "--file"));
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as { scheme: string; note: Note };
  if (!SUPPORTED_SCHEMES.includes(payload.scheme as Scheme)) {
    throw new Error(`Unsupported note scheme: ${payload.scheme}`);
  }

  if (wallet.notes.some(note => note.id === payload.note.id || note.commitment === payload.note.commitment)) {
    throw new Error("Note already exists in wallet");
  }

  wallet.notes.push({ ...payload.note, status: "unspent" });
  writeWallet(wallet);
  console.log(JSON.stringify(printableNote(payload.note), null, 2));
}

async function main() {
  const [command, name, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    usage();
  }

  if (command === "create" && name) return createWallet(name);
  if (command === "list") return listWallets();
  if (command === "show" && name) return showWallet(name);
  if (command === "note:create" && name) return createNote(name, rest);
  if (command === "notes" && name) return listNotes(name);
  if (command === "note:spend" && name) return spendNote(name, rest);
  if (command === "note:export" && name) return exportNote(name, rest);
  if (command === "note:import" && name) return importNote(name, rest);

  const help = optionalArgValue(process.argv.slice(2), "--help");
  if (help !== undefined) {
    usage();
  }

  usage();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
