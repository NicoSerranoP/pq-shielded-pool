#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const ATLANTIC_URL = "https://atlantic.api.herodotus.cloud";
const SEPOLIA_SATELLITE = "0x396bF739f7b37D81f6CdD4571fDEF298150db88f";
const MAINNET_SATELLITE = "0x2e6f182b06f37cbdc966ff5471c7d98cec2bfe70";
const FIXTURE_ROOT = 823984307n;
const PUBLIC_FIXTURE_INPUT_SHA256 = "fce19792661e27ff71979ba50104f6a0160b816abf609f5f1b6af6bcd3093d15";
const PUBLIC_FIXTURE_PROGRAM_SHA256 = "5e5a82ab6faedd7bc9c7d03e076170e52c6e7609ade5d5dcbd01c850bdc73b40";
const PUBLIC_RECURSIVE_TASK_PIE_SHA256 = "74ee9e6665e18e25dd871f728b74e3ba98f46742fd053293d3903022bad2ee37";
const PUBLIC_POSEIDON_RECURSIVE_TASK_PIE_SHA256 = "17acdc817c1a86310238951fab2840130b835edc0fd3570d52fe2bb94781a890";
const TERMINAL_STATUSES = new Set(["DONE", "FAILED"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equals = trimmed.indexOf("=");
    if (equals === -1) {
      continue;
    }

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const options = {
    mockFactHash: true,
    network: "TESTNET",
    declaredJobSize: "S",
    layout: "auto",
    result: "PROOF_VERIFICATION_ON_L1",
    poll: true,
    checkSatellite: true,
    dryRun: false,
    intervalMs: 10_000,
    timeoutMs: 15 * 60 * 1000,
    programFile: path.join(REPO_ROOT, "packages/cairo-merkle/target/dev/pq_cairo_merkle.sierra.json"),
    inputFile: path.join(REPO_ROOT, "packages/cairo-merkle/inputs/merkle_path.txt"),
    pieFile: "",
    queryId: "",
    allowRemoteWitnessUpload: false,
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

    if (arg === "--mock") options.mockFactHash = true;
    else if (arg === "--real") options.mockFactHash = false;
    else if (arg === "--mainnet") options.network = "MAINNET";
    else if (arg === "--testnet") options.network = "TESTNET";
    else if (arg === "--network") options.network = next().toUpperCase();
    else if (arg === "--declared-job-size") options.declaredJobSize = next().toUpperCase();
    else if (arg === "--layout") options.layout = next();
    else if (arg === "--result") options.result = next().toUpperCase();
    else if (arg === "--program-file") options.programFile = path.resolve(next());
    else if (arg === "--input-file") options.inputFile = path.resolve(next());
    else if (arg === "--pie-file") options.pieFile = path.resolve(next());
    else if (arg === "--query-id") options.queryId = next();
    else if (arg === "--no-poll") options.poll = false;
    else if (arg === "--no-satellite") options.checkSatellite = false;
    else if (arg === "--allow-remote-witness-upload") options.allowRemoteWitnessUpload = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--interval-ms") options.intervalMs = Number(next());
    else if (arg === "--timeout-ms") options.timeoutMs = Number(next());
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["TESTNET", "MAINNET"].includes(options.network)) {
    throw new Error(`Unsupported network: ${options.network}`);
  }
  if (!["XS", "S", "M", "L"].includes(options.declaredJobSize)) {
    throw new Error(`Unsupported declared job size: ${options.declaredJobSize}`);
  }
  if (!["TRACE_GENERATION", "PROOF_GENERATION", "PROOF_VERIFICATION_ON_L1", "PROOF_VERIFICATION_ON_L2"].includes(options.result)) {
    throw new Error(`Unsupported result: ${options.result}`);
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("--interval-ms must be positive");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be positive");
  }

  return options;
}

function printHelp() {
  console.log(`Submit the Cairo Merkle fixture to Atlantic L1 verification.

Usage:
  node scripts/submitAtlanticMerkle.mjs [--mock|--real] [options]

Modes:
  --mock              Use mockFactHash=true. This is the default.
  --real              Use mockFactHash=false for real L1 proof verification.
  --dry-run           Validate files and print the request shape without using the API key.
  --allow-remote-witness-upload
                      Permit uploading non-fixture program/input files to Atlantic.
                      Never use this with private shielded-pool witnesses.

Options:
  --testnet           Use Atlantic TESTNET. Default.
  --mainnet           Use Atlantic MAINNET.
  --declared-job-size S|M|L|XS
  --layout LAYOUT
  --result TRACE_GENERATION|PROOF_GENERATION|PROOF_VERIFICATION_ON_L1|PROOF_VERIFICATION_ON_L2
  --program-file PATH
  --input-file PATH
  --pie-file PATH     Submit a Cairo PIE instead of programFile/inputFile.
  --query-id ID       Resume/poll an existing Atlantic query instead of submitting a new one.
  --no-poll           Submit only; do not poll query status.
  --no-satellite      Do not read the Satellite registry after completion.
  --interval-ms N     Poll interval. Default 10000.
  --timeout-ms N      Poll timeout. Default 900000.

Environment:
  HCLOUD_API_KEY or ATLANTIC_API_KEY is required unless --dry-run is used.
  SEPOLIA_RPC_URL or ETH_SEPOLIA_RPC_URL enables Sepolia Satellite readback.
  MAINNET_RPC_URL or ETH_MAINNET_RPC_URL enables mainnet Satellite readback.

Privacy:
  This command is remote proving. It uploads programFile and inputFile to Atlantic.
  By default it only allows the known public toy fixture and known public recursive task PIE.
  Use local proving for private transfers.
`);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function apiKey() {
  return process.env.HCLOUD_API_KEY || process.env.ATLANTIC_API_KEY || "";
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyRemoteUploadIsFixtureOnly(options) {
  if (options.pieFile) {
    const pieHash = sha256File(options.pieFile);

    if (pieHash === PUBLIC_RECURSIVE_TASK_PIE_SHA256 || pieHash === PUBLIC_POSEIDON_RECURSIVE_TASK_PIE_SHA256) {
      const artifact =
        pieHash === PUBLIC_POSEIDON_RECURSIVE_TASK_PIE_SHA256
          ? "poseidon-recursive-task-pie"
          : "recursive-task-pie";
      console.warn(`Atlantic remote upload guard: submitting the known public ${artifact} only.`);
      return { pieHash, isKnownPublicFixture: true, artifact };
    }

    if (options.allowRemoteWitnessUpload || process.env.ATLANTIC_ALLOW_REMOTE_WITNESS_UPLOAD === "true") {
      console.warn(
        "WARNING: uploading Cairo PIE to Atlantic. Only use this when the PIE contains public proof/verifier data, not private shielded-pool witnesses.",
      );
      return { pieHash, isKnownPublicFixture: false, artifact: "cairo-pie" };
    }

    throw new Error(
      [
        "Refusing to upload Cairo PIE to Atlantic by default.",
        "A PIE can contain execution data and may leak private witnesses.",
        "For this recursive verifier experiment only, pass --allow-remote-witness-upload after confirming the PIE input is public proof data.",
        `pieFile sha256=${pieHash}`,
      ].join("\n"),
    );
  }

  const inputHash = sha256File(options.inputFile);
  const programHash = sha256File(options.programFile);
  const isKnownPublicFixture =
    inputHash === PUBLIC_FIXTURE_INPUT_SHA256 && programHash === PUBLIC_FIXTURE_PROGRAM_SHA256;

  if (isKnownPublicFixture) {
    console.warn("Atlantic remote upload guard: submitting the known public toy fixture only.");
    return { inputHash, programHash, isKnownPublicFixture };
  }

  if (options.allowRemoteWitnessUpload || process.env.ATLANTIC_ALLOW_REMOTE_WITNESS_UPLOAD === "true") {
    console.warn(
      "WARNING: uploading non-fixture program/input files to Atlantic. Do not use this with private shielded-pool witnesses.",
    );
    return { inputHash, programHash, isKnownPublicFixture };
  }

  throw new Error(
    [
      "Refusing to upload non-fixture program/input files to Atlantic.",
      "Atlantic proof generation is remote: programFile and inputFile leave this machine.",
      "For private shielded-pool transfers, use a local prover path instead.",
      "For public experiments only, pass --allow-remote-witness-upload or set ATLANTIC_ALLOW_REMOTE_WITNESS_UPLOAD=true.",
      `programFile sha256=${programHash}`,
      `inputFile sha256=${inputHash}`,
    ].join("\n"),
  );
}

async function postJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.raw || response.statusText;
    throw new Error(`${options.method ?? "GET"} ${url} failed: ${response.status} ${message}`);
  }

  return data;
}

async function buildSubmitForm(options) {
  const form = new FormData();
  const fields = {
    declaredJobSize: options.declaredJobSize,
    sharpProver: "stwo",
    layout: options.layout,
    cairoVm: "rust",
    cairoVersion: "cairo1",
    result: options.result,
    mockFactHash: String(options.mockFactHash),
    network: options.network,
  };

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  if (options.pieFile) {
    const pieBlob = await fs.openAsBlob(options.pieFile, { type: "application/zip" });
    form.set("pieFile", pieBlob, path.basename(options.pieFile));
  } else {
    const programBlob = await fs.openAsBlob(options.programFile, { type: "application/json" });
    const inputBlob = await fs.openAsBlob(options.inputFile, { type: "text/plain" });
    form.set("programFile", programBlob, path.basename(options.programFile));
    form.set("inputFile", inputBlob, path.basename(options.inputFile));
  }

  return { form, fields };
}

async function submitQuery(options, key) {
  const { form } = await buildSubmitForm(options);
  return postJson(`${ATLANTIC_URL}/atlantic-query`, {
    method: "POST",
    headers: { "api-key": key },
    body: form,
  });
}

async function getQuery(queryId, key) {
  return postJson(`${ATLANTIC_URL}/atlantic-query/${encodeURIComponent(queryId)}`, {
    method: "GET",
    headers: { "api-key": key },
  });
}

async function pollQuery(queryId, key, options) {
  const started = Date.now();
  let last;

  while (Date.now() - started <= options.timeoutMs) {
    last = await getQuery(queryId, key);
    const query = last.atlanticQuery ?? last;
    const status = query.status;
    console.log(
      JSON.stringify(
        {
          status,
          step: query.step ?? null,
          programHash: query.programHash ?? null,
          integrityFactHash: query.integrityFactHash ?? null,
          sharpFactHash: query.sharpFactHash ?? null,
          transactionId: query.transactionId ?? null,
          completedAt: query.completedAt ?? null,
        },
        null,
        2,
      ),
    );

    if (TERMINAL_STATUSES.has(status)) {
      return last;
    }

    await new Promise(resolve => setTimeout(resolve, options.intervalMs));
  }

  throw new Error(`Timed out waiting for Atlantic query ${queryId}`);
}

function normalizeBytes32(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Expected a non-empty hex string");
  }

  return ethers.toBeHex(BigInt(value), 32);
}

function computeFact(programHash, outputs) {
  if (!programHash || !outputs?.length) {
    return null;
  }

  const normalizedProgramHash = normalizeBytes32(programHash);
  const normalizedOutputs = outputs.map(value => BigInt(value));
  const outputHash = ethers.solidityPackedKeccak256(
    normalizedOutputs.map(() => "uint256"),
    normalizedOutputs,
  );
  const factHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [normalizedProgramHash, outputHash]),
  );

  return {
    outputs: normalizedOutputs.map(value => value.toString()),
    programHash: normalizedProgramHash,
    outputHash,
    factHash,
    fixtureRootOutputIndex: normalizedOutputs.findIndex(value => value === FIXTURE_ROOT),
  };
}

function summarizeValues(values, limit = 16) {
  const output = values ?? [];
  return {
    length: output.length,
    preview: output.slice(0, limit),
    omitted: Math.max(output.length - limit, 0),
  };
}

function printableMetadata(metadata) {
  if (!metadata) {
    return null;
  }

  return {
    ...metadata,
    output: summarizeValues(metadata.output),
  };
}

function printableMetadataFact(metadataFact) {
  if (!metadataFact) {
    return null;
  }

  return {
    ...metadataFact,
    outputs: summarizeValues(metadataFact.outputs),
  };
}

async function fetchMetadata(metadataUrls) {
  const metadataUrl = metadataUrls?.find(url => url.endsWith("/metadata.json"));
  if (!metadataUrl) {
    return null;
  }

  const response = await fetch(metadataUrl);
  if (!response.ok) {
    throw new Error(`GET ${metadataUrl} failed: ${response.status} ${response.statusText}`);
  }

  const metadata = await response.json();
  return {
    url: metadataUrl,
    programHash: metadata.program_hash,
    childProgramHash: metadata.child_program_hash,
    integrityFactHash: metadata.integrity_fact_hash,
    sharpFactHash: metadata.sharp_fact_hash,
    output: metadata.output ?? [],
  };
}

function normalizeFactHash(value) {
  return value ? normalizeBytes32(value) : null;
}

function rpcUrl(network) {
  if (network === "MAINNET") {
    return process.env.MAINNET_RPC_URL || process.env.ETH_MAINNET_RPC_URL || process.env.RPC_URL_ETHEREUM_MAINNET || "";
  }

  return process.env.SEPOLIA_RPC_URL || process.env.ETH_SEPOLIA_RPC_URL || process.env.RPC_URL_ETHEREUM_TESTNET || "";
}

async function checkSatellite(options, factHash) {
  if (!factHash || !options.checkSatellite) {
    return null;
  }

  const url = rpcUrl(options.network);
  if (!url) {
    return {
      skipped: true,
      reason: `No ${options.network === "MAINNET" ? "MAINNET_RPC_URL" : "SEPOLIA_RPC_URL"} configured`,
    };
  }

  const address = options.network === "MAINNET" ? MAINNET_SATELLITE : SEPOLIA_SATELLITE;
  const provider = new ethers.JsonRpcProvider(url);
  const registry = new ethers.Contract(
    address,
    ["function isCairoFactValid(bytes32 factHash, bool isMocked) view returns (bool)"],
    provider,
  );

  const valid = await registry.isCairoFactValid(factHash, options.mockFactHash);
  return {
    address,
    factHash,
    isMocked: options.mockFactHash,
    valid,
  };
}

async function main() {
  loadEnvFile(path.join(REPO_ROOT, "packages/hardhat/.env"));
  loadEnvFile(path.join(REPO_ROOT, "packages/cairo-merkle/.env"));

  const options = parseArgs(process.argv.slice(2));
  if (!options.queryId) {
    if (options.pieFile) {
      requireFile(options.pieFile, "Cairo PIE artifact");
    } else {
      requireFile(options.programFile, "Cairo Sierra artifact");
      requireFile(options.inputFile, "Atlantic input file");
    }
  }

  const { fields } = await buildSubmitForm(options);
  const uploadSafety = options.queryId ? null : verifyRemoteUploadIsFixtureOnly(options);
  const requestSummary = {
    url: `${ATLANTIC_URL}/atlantic-query`,
    fields,
    programFile: options.pieFile ? null : path.relative(REPO_ROOT, options.programFile),
    inputFile: options.pieFile ? null : path.relative(REPO_ROOT, options.inputFile),
    pieFile: options.pieFile ? path.relative(REPO_ROOT, options.pieFile) : null,
    mode: options.mockFactHash ? "mockFactHash=true" : "mockFactHash=false",
    remoteProving: true,
    uploadSafety,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, request: requestSummary }, null, 2));
    return;
  }

  const key = apiKey();
  if (!key) {
    throw new Error(
      "Missing HCLOUD_API_KEY. Export it in your shell or put HCLOUD_API_KEY=... in packages/hardhat/.env, which is gitignored.",
    );
  }

  let queryId = options.queryId;

  if (!queryId) {
    console.log(JSON.stringify({ submitting: requestSummary }, null, 2));
    const submitted = await submitQuery(options, key);
    queryId = submitted.atlanticQueryId ?? submitted.id;
    if (!queryId) {
      throw new Error(`Atlantic response did not include a query id: ${JSON.stringify(submitted)}`);
    }

    console.log(JSON.stringify({ submitted }, null, 2));
  } else {
    console.log(JSON.stringify({ resuming: { queryId, mode: requestSummary.mode } }, null, 2));
  }

  if (!options.poll) {
    return;
  }

  const finalDetails = await pollQuery(queryId, key, options);
  const query = finalDetails.atlanticQuery ?? finalDetails;
  const metadata = await fetchMetadata(finalDetails.metadataUrls);
  const metadataFact = metadata ? computeFact(metadata.programHash, metadata.output) : null;
  const querySharpFactHash = normalizeFactHash(query.sharpFactHash);
  const satelliteFactHash = metadataFact?.factHash ?? querySharpFactHash;
  const satellite = await checkSatellite(options, satelliteFactHash);

  console.log(
    JSON.stringify(
      {
        finalQuery: query,
        metadata: printableMetadata(metadata),
        metadataFact: printableMetadataFact(metadataFact),
        querySharpFactHash,
        factMatchesQuerySharp: metadataFact?.factHash?.toLowerCase() === querySharpFactHash?.toLowerCase(),
        satellite,
      },
      null,
      2,
    ),
  );

  if (query.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
