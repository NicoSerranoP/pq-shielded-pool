import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { randomInt } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { Hex, createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const DEFAULT_ALCHEMY_API_KEY = "IZYEU2cWBgnFmgiTAgpWD";
const MAX_DEPTH = 30;
const ASSET_ID = 1;

type LiveAction = "deposit" | "withdraw";

type StoredNote = {
  id: string;
  contractAddress: string;
  ownerAddress: string;
  amount: string;
  assetId: number;
  nonce: number;
  commitment: string;
  nullifier: string;
  leafIndex: string;
  rootBeforeDeposit: string;
  depositRoot: string;
  depositTxHash: string;
  withdrawnAt?: string;
  withdrawRoot?: string;
  withdrawTxHash?: string;
};

type NoteStore = {
  version: 1;
  notes: StoredNote[];
};

type Deployment = {
  address: Hex;
  abi: any[];
  transactionHash: Hex;
};

type PublicClient = ReturnType<typeof createPublicClient>;

const findRepoRoot = () => {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, "../.."), path.resolve(cwd, "../../..")];
  const root = candidates.find(candidate => fs.existsSync(path.join(candidate, "packages/hardhat")));

  if (!root) {
    throw new Error("Could not locate repository root for shielded pool backend.");
  }

  return root;
};

const REPO_ROOT = findRepoRoot();
const CIRCUITS_DIR = path.join(REPO_ROOT, "packages/circuits");
const HARDHAT_DEPLOYMENTS_DIR = path.join(REPO_ROOT, "packages/hardhat/deployments/sepolia");
const STORE_PATH = path.join(REPO_ROOT, "packages/nextjs/.shielded-demo-notes.json");

const loadDeployment = (): Deployment => {
  const raw = fs.readFileSync(path.join(HARDHAT_DEPLOYMENTS_DIR, "ShieldedPool.json"), "utf8");
  return JSON.parse(raw) as Deployment;
};

const etherscanAddressUrl = (address: string) => `https://sepolia.etherscan.io/address/${address}`;
const etherscanTxUrl = (txHash: string) => `https://sepolia.etherscan.io/tx/${txHash}`;

const getRpcUrl = () =>
  process.env.SEPOLIA_RPC_URL ??
  `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? DEFAULT_ALCHEMY_API_KEY}`;

const normalizePrivateKey = () => {
  const raw = process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;

  if (!raw) {
    return undefined;
  }

  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
};

const getProvekitCli = () => {
  const cli = process.env.PROVEKIT_CLI;

  if (!cli) {
    return undefined;
  }

  return fs.existsSync(cli) ? cli : undefined;
};

const getBackendEnv = () => ({
  ...process.env,
  PATH: `${path.join(os.homedir(), ".nargo/bin")}:${process.env.PATH ?? ""}`,
});

const getClients = () => {
  const privateKey = normalizePrivateKey();

  if (!privateKey) {
    throw new Error(
      "Missing __RUNTIME_DEPLOYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in the Next.js server environment.",
    );
  }

  const account = privateKeyToAccount(privateKey);
  const transport = http(getRpcUrl());

  return {
    account,
    publicClient: createPublicClient({ chain: sepolia, transport }),
    walletClient: createWalletClient({ account, chain: sepolia, transport }),
  };
};

const readPoolBigInt = (publicClient: PublicClient, deployment: Deployment, functionName: string) =>
  publicClient.readContract({
    address: deployment.address,
    abi: deployment.abi,
    args: [],
    functionName,
  } as any) as Promise<bigint>;

const readStore = (): NoteStore => {
  if (!fs.existsSync(STORE_PATH)) {
    return { version: 1, notes: [] };
  }

  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as NoteStore;
};

const writeStore = (store: NoteStore) => {
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`);
  fs.renameSync(tmpPath, STORE_PATH);
};

const toHex = (value: bigint) => `0x${value.toString(16)}`;

const parseCircuitOutput = (output: string) => {
  const match = output.match(/Circuit output: \(([^,]+), ([^)]+)\)/);

  if (!match) {
    throw new Error(`Failed to parse note helper output: ${output}`);
  }

  return {
    commitment: match[1].trim(),
    nullifier: match[2].trim(),
  };
};

const runCommand = async (file: string, args: string[], cwd: string) => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd,
    env: getBackendEnv(),
    maxBuffer: 1024 * 1024 * 20,
    timeout: 1000 * 60 * 8,
  });

  return `${stdout}${stderr}`.trim();
};

const withTempDir = async <T>(prefix: string, fn: (dir: string) => Promise<T>) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { force: true, recursive: true });
  }
};

const computeNoteValues = async (amount: number, ownerField: string, nonce: number, assetId: number) =>
  withTempDir("shielded-note-", async tempDir => {
    const proverBase = path.join(tempDir, "NoteInputs");
    const noteHelperTargetPath = path.join(CIRCUITS_DIR, "target/note_helper.json");
    const previousTarget = fs.existsSync(noteHelperTargetPath)
      ? fs.readFileSync(noteHelperTargetPath, "utf8")
      : undefined;

    fs.writeFileSync(
      `${proverBase}.toml`,
      `value = ${amount}\nowner = "${ownerField}"\nnonce = ${nonce}\nasset = ${assetId}\n`,
    );

    try {
      const output = await runCommand("nargo", ["execute", "--package", "note_helper", "-p", proverBase], CIRCUITS_DIR);
      return parseCircuitOutput(output);
    } finally {
      if (previousTarget !== undefined) {
        fs.writeFileSync(noteHelperTargetPath, previousTarget);
      } else if (fs.existsSync(noteHelperTargetPath)) {
        fs.rmSync(noteHelperTargetPath);
      }
    }
  });

const generateDepositProof = async (
  amount: number,
  ownerField: string,
  nonce: number,
  assetId: number,
  commitment: string,
) =>
  withTempDir("shielded-deposit-", async tempDir => {
    const provekitCli = getProvekitCli();

    if (!provekitCli) {
      throw new Error("Missing PROVEKIT_CLI, or the configured provekit-cli binary does not exist.");
    }

    const proverTomlPath = path.join(tempDir, "Prover.toml");
    const proofPath = path.join(tempDir, "proof.np");
    const evmDir = path.join(tempDir, "evm");

    fs.writeFileSync(
      proverTomlPath,
      `commitment = "${commitment}"
value = ${amount}

[note]
asset  = ${assetId}
nonce = ${nonce}
owner = "${ownerField}"
value = ${amount}
`,
    );

    await runCommand(
      provekitCli,
      ["prove", "-p", path.join(CIRCUITS_DIR, "deposit/deposit.pkp"), "-i", proverTomlPath, "-o", proofPath],
      REPO_ROOT,
    );
    await runCommand(provekitCli, ["export-evm-proof", "-p", proofPath, "-o", evmDir], REPO_ROOT);

    return fs.readFileSync(path.join(evmDir, "proof.hex"), "utf8").trim() as Hex;
  });

const formatField = (value: string | bigint) => {
  const field = typeof value === "bigint" ? toHex(value) : value;
  return field.startsWith("0x") ? field : `0x${BigInt(field).toString(16)}`;
};

const generateWithdrawProof = async (
  note: StoredNote,
  root: string,
  proofPathData: { indices: boolean[]; siblings: string[] },
) =>
  withTempDir("shielded-withdraw-", async tempDir => {
    const provekitCli = getProvekitCli();

    if (!provekitCli) {
      throw new Error("Missing PROVEKIT_CLI, or the configured provekit-cli binary does not exist.");
    }

    const proverTomlPath = path.join(tempDir, "Prover.toml");
    const proofPath = path.join(tempDir, "proof.np");
    const evmDir = path.join(tempDir, "evm");
    const indices = Array(MAX_DEPTH).fill(false);
    const siblings = Array(MAX_DEPTH).fill('"0"');

    proofPathData.indices.forEach((index, position) => {
      indices[position] = index;
    });
    proofPathData.siblings.forEach((sibling, position) => {
      siblings[position] = `"${formatField(sibling)}"`;
    });

    fs.writeFileSync(
      proverTomlPath,
      `published_root = "${root}"
value = ${note.amount}

[merkle_proof]
indices = [${indices.join(", ")}]
length = ${proofPathData.siblings.length}
siblings = [${siblings.join(", ")}]

[note]
asset = ${note.assetId}
nonce = ${note.nonce}
owner = "${BigInt(note.ownerAddress).toString()}"
value = ${note.amount}
`,
    );

    await runCommand(
      provekitCli,
      ["prove", "-p", path.join(CIRCUITS_DIR, "withdraw/withdraw.pkp"), "-i", proverTomlPath, "-o", proofPath],
      REPO_ROOT,
    );
    await runCommand(provekitCli, ["export-evm-proof", "-p", proofPath, "-o", evmDir], REPO_ROOT);

    return fs.readFileSync(path.join(evmDir, "proof.hex"), "utf8").trim() as Hex;
  });

const getPoseidonConstants = (() => {
  let constants: Record<string, bigint> | undefined;

  return () => {
    if (constants) {
      return constants;
    }

    const source = fs.readFileSync(path.join(REPO_ROOT, "packages/hardhat/contracts/Poseidon2T4.sol"), "utf8");
    constants = {};

    for (const match of source.matchAll(/uint256 constant ([A-Z0-9]+) = (0x[0-9a-fA-F]+|\d+);/g)) {
      constants[match[1]] = BigInt(match[2]);
    }

    return constants;
  };
})();

const addmod = (a: bigint, b: bigint, p: bigint) => (a + b) % p;
const mulmod = (a: bigint, b: bigint, p: bigint) => (a * b) % p;

const extMds = (s: bigint[], p: bigint) => {
  const t0 = addmod(s[0], s[1], p);
  const t1 = addmod(s[2], s[3], p);
  const t2 = addmod(addmod(s[1], s[1], p), t1, p);
  const t3 = addmod(addmod(s[3], s[3], p), t0, p);
  const t1d = addmod(t1, t1, p);
  const t4 = addmod(addmod(t1d, t1d, p), t3, p);
  const t0d = addmod(t0, t0, p);
  const t5 = addmod(addmod(t0d, t0d, p), t2, p);

  s[0] = addmod(t3, t5, p);
  s[1] = t5;
  s[2] = addmod(t2, t4, p);
  s[3] = t4;
};

const intMds = (s: bigint[], c: Record<string, bigint>) => {
  const p = c.P;
  const sum = addmod(addmod(s[0], s[1], p), addmod(s[2], s[3], p), p);

  s[0] = addmod(mulmod(c.D0, s[0], p), sum, p);
  s[1] = addmod(mulmod(c.D1, s[1], p), sum, p);
  s[2] = addmod(mulmod(c.D2, s[2], p), sum, p);
  s[3] = addmod(mulmod(c.D3, s[3], p), sum, p);
};

const sbox5 = (x: bigint, p: bigint) => {
  const x2 = mulmod(x, x, p);
  const x4 = mulmod(x2, x2, p);
  return mulmod(x4, x, p);
};

const fullRound = (s: bigint[], constants: bigint[], p: bigint) => {
  for (let i = 0; i < 4; i++) {
    s[i] = sbox5(addmod(s[i], constants[i], p), p);
  }
  extMds(s, p);
};

const partialRound = (s: bigint[], constant: bigint, c: Record<string, bigint>) => {
  s[0] = sbox5(addmod(s[0], constant, c.P), c.P);
  intMds(s, c);
};

const poseidon2Hash = (left: bigint, right: bigint) => {
  const c = getPoseidonConstants();
  const s = [1n, left, right, 0n];

  extMds(s, c.P);

  for (let round = 0; round < 4; round++) {
    fullRound(s, [c[`F${round}C0`], c[`F${round}C1`], c[`F${round}C2`], c[`F${round}C3`]], c.P);
  }

  for (let round = 0; round < 56; round++) {
    partialRound(s, c[`PR${round.toString().padStart(2, "0")}`], c);
  }

  for (let round = 0; round < 4; round++) {
    fullRound(s, [c[`G${round}C0`], c[`G${round}C1`], c[`G${round}C2`], c[`G${round}C3`]], c.P);
  }

  return s[0];
};

const buildNextLevel = (nodes: bigint[]) => {
  const next: bigint[] = [];

  for (let i = 0; i < nodes.length; i += 2) {
    next.push(i + 1 < nodes.length ? poseidon2Hash(nodes[i], nodes[i + 1]) : nodes[i]);
  }

  return next;
};

const buildLeanRoot = (leaves: bigint[]) => {
  let nodes = [...leaves];

  while (nodes.length > 1) {
    nodes = buildNextLevel(nodes);
  }

  return nodes[0] ?? 0n;
};

const buildLeanProof = (leaves: bigint[], leafIndex: number) => {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`Cannot build Merkle proof for missing leaf index ${leafIndex}.`);
  }

  const siblings: string[] = [];
  const indices: boolean[] = [];
  let nodes = [...leaves];
  let index = leafIndex;

  while (nodes.length > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;

    if (siblingIndex < nodes.length) {
      siblings.push(toHex(nodes[siblingIndex]));
      indices.push(isRight);
    }

    nodes = buildNextLevel(nodes);
    index = Math.floor(index / 2);
  }

  return { indices, siblings };
};

const getCommitmentLeaves = async (publicClient: PublicClient, deployment: Deployment) => {
  const deploymentReceipt = await publicClient.getTransactionReceipt({ hash: deployment.transactionHash });
  const fromBlock = deploymentReceipt.blockNumber;
  const depositEvent = parseAbiItem(
    "event Deposit(address indexed depositor,uint256 indexed assetId,uint256 indexed leafIndex,uint256 amount,uint256 commitment,uint256 root)",
  );
  const transferEvent = parseAbiItem(
    "event Transfer(uint256 indexed oldRoot,uint256 indexed firstLeafIndex,uint256 indexed newRoot,uint256 inputNullifier,uint256[] outputCommitments)",
  );
  const [depositLogs, transferLogs] = await Promise.all([
    publicClient.getLogs({ address: deployment.address, event: depositEvent, fromBlock, toBlock: "latest" }),
    publicClient.getLogs({ address: deployment.address, event: transferEvent, fromBlock, toBlock: "latest" }),
  ]);
  const leaves: bigint[] = [];
  const logs = [
    ...depositLogs.map(log => ({ kind: "deposit" as const, log })),
    ...transferLogs.map(log => ({ kind: "transfer" as const, log })),
  ].sort((a, b) => {
    const blockDelta = Number(a.log.blockNumber - b.log.blockNumber);

    if (blockDelta !== 0) {
      return blockDelta;
    }

    const txIndexDelta = a.log.transactionIndex - b.log.transactionIndex;

    if (txIndexDelta !== 0) {
      return txIndexDelta;
    }

    return a.log.logIndex - b.log.logIndex;
  });

  for (const item of logs) {
    const args = item.log.args as any;

    if (item.kind === "deposit") {
      const leafIndex = Number(args.leafIndex);
      leaves[leafIndex] = args.commitment as bigint;
      continue;
    }

    const firstLeafIndex = Number(args.firstLeafIndex);
    (args.outputCommitments as bigint[]).forEach((commitment, offset) => {
      leaves[firstLeafIndex + offset] = commitment;
    });
  }

  return leaves;
};

const parseAmount = (value: unknown) => {
  const amount = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 1;

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2 ** 32 - 1) {
    throw new Error("Amount must be a positive u32 integer in wei.");
  }

  return amount;
};

const createBackendStatus = async () => {
  const deployment = loadDeployment();
  const privateKey = normalizePrivateKey();
  const provekitCli = getProvekitCli();
  const publicClient = createPublicClient({ chain: sepolia, transport: http(getRpcUrl()) });
  const [treeSize, treeDepth, currentRoot, balance] = await Promise.all([
    readPoolBigInt(publicClient, deployment, "treeSize"),
    readPoolBigInt(publicClient, deployment, "treeDepth"),
    readPoolBigInt(publicClient, deployment, "currentRoot"),
    publicClient.getBalance({ address: deployment.address }),
  ]);
  const notes = readStore().notes.filter(
    note => note.contractAddress.toLowerCase() === deployment.address.toLowerCase(),
  );

  return {
    ready: Boolean(privateKey && provekitCli),
    missing: [
      privateKey ? undefined : "__RUNTIME_DEPLOYER_PRIVATE_KEY",
      provekitCli ? undefined : "PROVEKIT_CLI",
    ].filter(Boolean),
    contractAddress: deployment.address,
    etherscanUrl: etherscanAddressUrl(deployment.address),
    treeSize: treeSize.toString(),
    treeDepth: treeDepth.toString(),
    currentRoot: toHex(currentRoot),
    poolBalanceWei: balance.toString(),
    storedNotes: notes.map(note => ({
      id: note.id,
      amount: note.amount,
      commitment: note.commitment,
      depositTxHash: note.depositTxHash,
      leafIndex: note.leafIndex,
      withdrawn: Boolean(note.withdrawTxHash),
      withdrawTxHash: note.withdrawTxHash,
    })),
  };
};

const handleDeposit = async (body: any) => {
  const deployment = loadDeployment();
  const { account, publicClient, walletClient } = getClients();
  const amount = parseAmount(body.amount);
  const nonce = Number.isSafeInteger(Number(body.nonce)) ? Number(body.nonce) : randomInt(1, 2 ** 31 - 1);
  const ownerField = BigInt(account.address).toString();
  const [treeSizeBefore, rootBefore] = await Promise.all([
    readPoolBigInt(publicClient, deployment, "treeSize"),
    readPoolBigInt(publicClient, deployment, "currentRoot"),
  ]);
  const { commitment, nullifier } = await computeNoteValues(amount, ownerField, nonce, ASSET_ID);
  const proof = await generateDepositProof(amount, ownerField, nonce, ASSET_ID, commitment);
  const txHash = await walletClient.writeContract({
    address: deployment.address,
    abi: deployment.abi,
    functionName: "deposit",
    args: [BigInt(amount), BigInt(ASSET_ID), BigInt(commitment), proof],
    value: BigInt(amount),
  } as any);

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const [treeSizeAfter, rootAfter] = await Promise.all([
    readPoolBigInt(publicClient, deployment, "treeSize"),
    readPoolBigInt(publicClient, deployment, "currentRoot"),
  ]);
  const note: StoredNote = {
    id: `${Date.now()}-${nonce}`,
    contractAddress: deployment.address,
    ownerAddress: account.address,
    amount: amount.toString(),
    assetId: ASSET_ID,
    nonce,
    commitment,
    nullifier,
    leafIndex: treeSizeBefore.toString(),
    rootBeforeDeposit: toHex(rootBefore),
    depositRoot: toHex(rootAfter),
    depositTxHash: txHash,
  };
  const store = readStore();
  store.notes.push(note);
  writeStore(store);

  return {
    action: "deposit",
    txHash,
    etherscanTxUrl: etherscanTxUrl(txHash),
    noteId: note.id,
    commitment,
    nullifier,
    leafIndex: note.leafIndex,
    treeSizeBefore: treeSizeBefore.toString(),
    treeSizeAfter: treeSizeAfter.toString(),
    rootBefore: note.rootBeforeDeposit,
    rootAfter: note.depositRoot,
  };
};

const handleWithdraw = async (body: any) => {
  const deployment = loadDeployment();
  const { account, publicClient, walletClient } = getClients();
  const store = readStore();
  const note =
    store.notes.find(item => item.id === body.noteId) ??
    [...store.notes]
      .reverse()
      .find(item => item.contractAddress.toLowerCase() === deployment.address.toLowerCase() && !item.withdrawTxHash);

  if (!note) {
    throw new Error("No stored unwithdrawn demo note is available. Run a live deposit first.");
  }

  const [currentRoot, leaves] = await Promise.all([
    readPoolBigInt(publicClient, deployment, "currentRoot"),
    getCommitmentLeaves(publicClient, deployment),
  ]);
  const leafIndex = Number(note.leafIndex);

  if (leaves[leafIndex] !== BigInt(note.commitment)) {
    throw new Error("Stored note commitment does not match the live commitment tree.");
  }

  const computedRoot = buildLeanRoot(leaves);

  if (computedRoot !== currentRoot) {
    throw new Error("Could not reconstruct the live Merkle root from contract events.");
  }

  const proofPathData = buildLeanProof(leaves, leafIndex);
  const rootHex = toHex(currentRoot);
  const proof = await generateWithdrawProof(note, rootHex, proofPathData);
  const recipient = (body.recipient || account.address) as Hex;
  const txHash = await walletClient.writeContract({
    address: deployment.address,
    abi: deployment.abi,
    functionName: "withdraw",
    args: [currentRoot, BigInt(note.nullifier), recipient, BigInt(note.amount), proof],
  } as any);

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  note.withdrawnAt = new Date().toISOString();
  note.withdrawRoot = rootHex;
  note.withdrawTxHash = txHash;
  writeStore(store);

  return {
    action: "withdraw",
    txHash,
    etherscanTxUrl: etherscanTxUrl(txHash),
    noteId: note.id,
    commitment: note.commitment,
    nullifier: note.nullifier,
    leafIndex: note.leafIndex,
    root: rootHex,
    recipient,
    amount: note.amount,
    proofSiblings: proofPathData.siblings,
    proofIndices: proofPathData.indices,
  };
};

export async function GET() {
  try {
    return NextResponse.json(await createBackendStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown backend status error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as LiveAction;

    if (action === "deposit") {
      return NextResponse.json(await handleDeposit(body));
    }

    if (action === "withdraw") {
      return NextResponse.json(await handleWithdraw(body));
    }

    return NextResponse.json({ error: "Unsupported live action. Use deposit or withdraw." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown live action error" },
      { status: 500 },
    );
  }
}
