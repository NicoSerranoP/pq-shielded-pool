#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const HARDHAT_ENV = path.join(ROOT_DIR, "packages/hardhat/.env");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...loadEnv(HARDHAT_ENV), ...process.env };
const preflightOnly = process.argv.includes("--preflight-only");
const rpcUrl = env.STONE_SEPOLIA_RPC_URL || env.SEPOLIA_RPC_URL || env.ETH_SEPOLIA_RPC_URL;
const privateKey = env.STONE_SEPOLIA_PRIVATE_KEY || env.PRIVATE_KEY;

const required = {
  STONE_SEPOLIA_RPC_URL: rpcUrl,
  STONE_SEPOLIA_PRIVATE_KEY: privateKey,
  SEPOLIA_GPS_MAIN_VERIFIER: env.SEPOLIA_GPS_MAIN_VERIFIER,
  SEPOLIA_GPS_MEMORY_PAGE_FACT_REGISTRY: env.SEPOLIA_GPS_MEMORY_PAGE_FACT_REGISTRY,
  SEPOLIA_GPS_TRACE_CONTRACT: env.SEPOLIA_GPS_TRACE_CONTRACT,
  SEPOLIA_GPS_FRI_CONTRACT: env.SEPOLIA_GPS_FRI_CONTRACT,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`Missing required Sepolia verifier env vars: ${missing.join(", ")}`);
  console.error("Set them in packages/hardhat/.env or the shell. Use a funded testnet-only private key.");
  process.exit(1);
}

let rpcId = 1;
async function rpc(method, params = []) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function normalizeAddress(value, name) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value || "")) {
    throw new Error(`${name} must be a 20-byte EVM address; got ${value || "<empty>"}`);
  }
  return value;
}

const contracts = {
  MAIN_VERIFIER: normalizeAddress(env.SEPOLIA_GPS_MAIN_VERIFIER, "SEPOLIA_GPS_MAIN_VERIFIER"),
  MEMORY_FACT_REGISTRY: normalizeAddress(env.SEPOLIA_GPS_MEMORY_PAGE_FACT_REGISTRY, "SEPOLIA_GPS_MEMORY_PAGE_FACT_REGISTRY"),
  TRACE_CONTRACT: normalizeAddress(env.SEPOLIA_GPS_TRACE_CONTRACT, "SEPOLIA_GPS_TRACE_CONTRACT"),
  FRI_CONTRACT: normalizeAddress(env.SEPOLIA_GPS_FRI_CONTRACT, "SEPOLIA_GPS_FRI_CONTRACT"),
};

const chainId = await rpc("eth_chainId");
if (chainId.toLowerCase() !== "0xaa36a7") {
  throw new Error(`Expected Ethereum Sepolia chainId 0xaa36a7, got ${chainId}`);
}

console.log(`Sepolia RPC ok: chainId=${chainId}`);
for (const [name, address] of Object.entries(contracts)) {
  const code = await rpc("eth_getCode", [address, "latest"]);
  const codeBytes = (code.length - 2) / 2;
  console.log(`${name} ${address} codeBytes=${codeBytes}`);
  if (codeBytes === 0) {
    throw new Error(`${name} has no bytecode on Sepolia: ${address}`);
  }
}

if (preflightOnly) {
  console.log("Sepolia verifier preflight passed.");
  process.exit(0);
}

const script = path.join(ROOT_DIR, "packages/cairo-merkle-poseidon/scripts/prove-local-stone-legacy-gps.sh");
const childEnv = {
  ...process.env,
  ...env,
  STONE_VERIFY_ON_FORK: "true",
  STONE_VERIFY_URL: rpcUrl,
  PRIVATE_KEY: privateKey,
  MAIN_VERIFIER: contracts.MAIN_VERIFIER,
  MEMORY_FACT_REGISTRY: contracts.MEMORY_FACT_REGISTRY,
  TRACE_CONTRACT: contracts.TRACE_CONTRACT,
  FRI_CONTRACT: contracts.FRI_CONTRACT,
};

const result = spawnSync("bash", [script], {
  cwd: ROOT_DIR,
  env: childEnv,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
