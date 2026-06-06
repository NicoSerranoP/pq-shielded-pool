#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

const FIXTURE_EXPECTED = {
  sha256: "74ee9e6665e18e25dd871f728b74e3ba98f46742fd053293d3903022bad2ee37",
  steps: 16_965_079,
  outputBuiltin: 4,
  rangeCheckBuiltin: 1_181_505,
  bitwiseBuiltin: 0,
  programBuiltins: ["output", "range_check", "bitwise"],
  retFpSegment: { index: 5, size: 0 },
  retPcSegment: { index: 6, size: 0 },
  programOutput: [
    "3",
    "1616635717182068608364703678641987474353866405618911243740290162179813754946",
    "1",
    "823984307",
  ],
};

function defaultPiePath() {
  return path.join(REPO_ROOT, "packages/cairo-merkle/target/local-proofs/recursive-verifier-task-pie.zip");
}

function defaultLogPath() {
  return path.join(REPO_ROOT, "packages/cairo-merkle/target/local-proofs/recursive-verifier-task-pie.log");
}

function printHelp() {
  console.log(`Validate the public Merkle recursive-verifier Cairo task PIE before Atlantic upload.

Usage:
  node packages/cairo-merkle/scripts/check-recursive-task-pie.mjs [options]

Options:
  --pie PATH                 Cairo PIE zip. Default: packages/cairo-merkle/target/local-proofs/recursive-verifier-task-pie.zip
  --log-file PATH            Optional scarb-execute log containing "Program output:".
  --generic                  Validate archive shape only; skip current fixture constants.
  --expected-sha256 HEX      Override expected PIE SHA-256.
  --expected-steps N         Override expected Cairo step count.
  --expected-output CSV      Override expected program output values.
  --no-log-check             Do not require or validate the program-output log.
  --help, -h                 Show this help.

For new public fixtures, pass --generic first, then add expected values once the local output is accepted.
Do not use this as a privacy audit: Cairo PIE archives contain execution memory.
`);
}

function parseArgs(argv) {
  const options = {
    piePath: defaultPiePath(),
    logPath: defaultLogPath(),
    fixtureChecks: true,
    expectedSha256: FIXTURE_EXPECTED.sha256,
    expectedSteps: FIXTURE_EXPECTED.steps,
    expectedOutput: FIXTURE_EXPECTED.programOutput,
    checkLog: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };

    if (arg === "--pie") options.piePath = path.resolve(next());
    else if (arg === "--log-file") options.logPath = path.resolve(next());
    else if (arg === "--generic") {
      options.fixtureChecks = false;
      options.expectedSha256 = "";
      options.expectedSteps = null;
      options.expectedOutput = [];
    } else if (arg === "--expected-sha256") options.expectedSha256 = next().toLowerCase();
    else if (arg === "--expected-steps") options.expectedSteps = Number(next());
    else if (arg === "--expected-output") options.expectedOutput = next().split(",").map(value => value.trim());
    else if (arg === "--no-log-check") options.checkLog = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readZipMember(piePath, member) {
  try {
    return execFileSync("unzip", ["-p", piePath, member], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Unable to read ${member} from ${piePath}: ${error.message}`);
  }
}

function readZipJson(piePath, member) {
  return JSON.parse(readZipMember(piePath, member));
}

function listZipMembers(piePath) {
  try {
    return execFileSync("unzip", ["-Z1", piePath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    })
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error("Unable to list " + piePath + ": " + error.message);
  }
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseProgramOutput(logText) {
  const marker = "Program output:";
  const start = logText.lastIndexOf(marker);
  if (start === -1) return [];

  const lines = logText.slice(start + marker.length).split(/\r?\n/u);
  const values = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (values.length > 0) break;
      continue;
    }
    if (/^(Resources:|Saving output|Finished|Run completed)/u.test(trimmed)) break;
    if (/^-?\d+$/u.test(trimmed)) {
      values.push(trimmed);
      continue;
    }
    if (values.length > 0) break;
  }
  return values;
}

function validate(options) {
  ensure(fs.existsSync(options.piePath), `PIE not found: ${options.piePath}`);

  const actualSha256 = sha256File(options.piePath);
  if (options.expectedSha256) {
    ensure(
      actualSha256 === options.expectedSha256,
      `Unexpected PIE SHA-256: got ${actualSha256}, expected ${options.expectedSha256}`,
    );
  }

  const members = listZipMembers(options.piePath);
  for (const member of ["version.json", "execution_resources.json", "metadata.json", "memory.bin", "additional_data.json"]) {
    ensure(members.includes(member), "PIE archive is missing " + member);
  }

  const version = readZipJson(options.piePath, "version.json");
  const resources = readZipJson(options.piePath, "execution_resources.json");
  const metadata = readZipJson(options.piePath, "metadata.json");
  readZipJson(options.piePath, "additional_data.json");

  ensure(version.cairo_pie === "1.1", `Unexpected Cairo PIE version: ${JSON.stringify(version)}`);
  ensure(metadata.program_segment?.index === 0, "Expected program segment index 0");
  ensure(metadata.execution_segment?.index === 1, "Expected execution segment index 1");
  ensure(metadata.builtin_segments?.output?.index === 2, "Expected output builtin segment index 2");
  ensure(metadata.builtin_segments?.range_check?.index === 3, "Expected range_check builtin segment index 3");
  ensure(metadata.builtin_segments?.bitwise?.index === 4, "Expected bitwise builtin segment index 4");

  if (options.expectedSteps !== null) {
    ensure(resources.n_steps === options.expectedSteps, `Unexpected step count: ${resources.n_steps}`);
  }

  if (options.fixtureChecks) {
    ensure(
      arraysEqual(metadata.program?.builtins ?? [], FIXTURE_EXPECTED.programBuiltins),
      `Unexpected program builtins: ${JSON.stringify(metadata.program?.builtins)}`,
    );
    ensure(
      metadata.ret_fp_segment?.index === FIXTURE_EXPECTED.retFpSegment.index &&
        metadata.ret_fp_segment?.size === FIXTURE_EXPECTED.retFpSegment.size,
      `Unexpected ret_fp segment: ${JSON.stringify(metadata.ret_fp_segment)}`,
    );
    ensure(
      metadata.ret_pc_segment?.index === FIXTURE_EXPECTED.retPcSegment.index &&
        metadata.ret_pc_segment?.size === FIXTURE_EXPECTED.retPcSegment.size,
      `Unexpected ret_pc segment: ${JSON.stringify(metadata.ret_pc_segment)}`,
    );
    ensure(
      resources.builtin_instance_counter?.output_builtin === FIXTURE_EXPECTED.outputBuiltin,
      `Unexpected output builtin count: ${resources.builtin_instance_counter?.output_builtin}`,
    );
    ensure(
      resources.builtin_instance_counter?.range_check_builtin === FIXTURE_EXPECTED.rangeCheckBuiltin,
      `Unexpected range_check builtin count: ${resources.builtin_instance_counter?.range_check_builtin}`,
    );
    ensure(
      resources.builtin_instance_counter?.bitwise_builtin === FIXTURE_EXPECTED.bitwiseBuiltin,
      `Unexpected bitwise builtin count: ${resources.builtin_instance_counter?.bitwise_builtin}`,
    );
  }

  let programOutput = [];
  if (options.checkLog) {
    ensure(fs.existsSync(options.logPath), `Program-output log not found: ${options.logPath}`);
    programOutput = parseProgramOutput(fs.readFileSync(options.logPath, "utf8"));
    ensure(programOutput.length > 0, `No "Program output:" values found in ${options.logPath}`);
    if (options.expectedOutput.length > 0) {
      ensure(
        arraysEqual(programOutput, options.expectedOutput),
        `Unexpected program output: got ${programOutput.join(",")}, expected ${options.expectedOutput.join(",")}`,
      );
    }
  }

  return {
    piePath: relative(options.piePath),
    logPath: options.checkLog ? relative(options.logPath) : null,
    sha256: actualSha256,
    archiveMembers: members,
    cairoPieVersion: version.cairo_pie,
    steps: resources.n_steps,
    memoryHoles: resources.n_memory_holes,
    builtinInstanceCounter: resources.builtin_instance_counter,
    programBuiltins: metadata.program?.builtins ?? [],
    programSegment: metadata.program_segment,
    executionSegment: metadata.execution_segment,
    retFpSegment: metadata.ret_fp_segment,
    retPcSegment: metadata.ret_pc_segment,
    builtinSegments: metadata.builtin_segments,
    extraSegments: metadata.extra_segments,
    programOutput,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = validate(options);
  console.log(JSON.stringify(summary, null, 2));
}

main();
