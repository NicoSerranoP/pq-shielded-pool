"use client";

import { type ComponentType, type SVGProps, useEffect, useMemo, useRef, useState } from "react";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CommandLineIcon,
  CpuChipIcon,
  KeyIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

type DemoAction = "deposit" | "transfer" | "withdraw";
type LeafStatus = "active" | "new" | "spent";
type NodeStatus = LeafStatus | "empty" | "hash" | "root";
type RunStatus = "idle" | "running" | "complete";
type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

type ActionSpec = {
  id: DemoAction;
  label: string;
  detail: string;
  buttonClass: string;
  icon: SvgIcon;
};

type DemoLeaf = {
  id: string;
  commitment: string;
  label: string;
  source: "seed" | "deposit" | "transfer";
  status: LeafStatus;
};

type DemoTreeNode = {
  hash: string;
  label: string;
  status: NodeStatus;
};

type DemoTreeLevel = {
  label: string;
  nodes: DemoTreeNode[];
};

type FlowArtifacts = {
  amount: string;
  assetId: string;
  commitment: string;
  inputNullifier: string;
  newRoot: string;
  outputCommitments: string[];
  proof: string;
  recipient: string;
  root: string;
  txHash: string;
};

type FlowStep = {
  title: string;
  detail: string;
  durationMs: number;
  artifact?: string;
};

type DemoStats = {
  shieldedBalance: number;
  publicBalance: number;
  privateNotes: number;
  spentNullifiers: number;
  treeSize: number;
  localRoot: string;
  lastEvent: string;
};

type FlowRun = {
  action: DemoAction;
  artifacts: FlowArtifacts;
  currentStep: number;
  sequence: number;
  status: RunStatus;
  steps: FlowStep[];
};

type PublicInputs = {
  deposit: {
    amount: string;
    assetId: string;
    commitment: string;
    proof: string;
  };
  transfer: {
    inputNullifier: string;
    output0: string;
    output1: string;
    proof: string;
    root: string;
  };
  withdraw: {
    amount: string;
    inputNullifier: string;
    proof: string;
    recipient: string;
    root: string;
  };
};

type PublicInputField = {
  field: string;
  label: string;
  placeholder: string;
};

const ACTIONS: ActionSpec[] = [
  {
    id: "deposit",
    label: "Deposit",
    detail: "Create a private note",
    buttonClass: "btn-primary",
    icon: ArrowDownTrayIcon,
  },
  {
    id: "transfer",
    label: "Transfer",
    detail: "Spend one note privately",
    buttonClass: "btn-neutral",
    icon: ArrowsRightLeftIcon,
  },
  {
    id: "withdraw",
    label: "Withdraw",
    detail: "Release public wei",
    buttonClass: "btn-warning",
    icon: ArrowUpTrayIcon,
  },
];

const PUBLIC_INPUT_FIELD_SETS: Record<DemoAction, PublicInputField[]> = {
  deposit: [
    { field: "commitment", label: "commitment", placeholder: "0x..." },
    { field: "amount", label: "amount", placeholder: "10" },
    { field: "assetId", label: "assetId", placeholder: "1" },
    { field: "proof", label: "zkProof", placeholder: "0x..." },
  ],
  transfer: [
    { field: "root", label: "root", placeholder: "0x..." },
    { field: "inputNullifier", label: "inputNullifier", placeholder: "0x..." },
    { field: "output0", label: "output0", placeholder: "0x..." },
    { field: "output1", label: "output1", placeholder: "0x..." },
    { field: "proof", label: "zkProof", placeholder: "0x..." },
  ],
  withdraw: [
    { field: "root", label: "root", placeholder: "0x..." },
    { field: "inputNullifier", label: "inputNullifier", placeholder: "0x..." },
    { field: "recipient", label: "recipient", placeholder: "0x..." },
    { field: "amount", label: "amount", placeholder: "5" },
    { field: "proof", label: "zkProof", placeholder: "0x..." },
  ],
};

const PUBLIC_INPUT_SUMMARY: Record<DemoAction, string> = {
  deposit: "Verifier public inputs: [commitment, amount]",
  transfer: "Verifier public inputs: [inputNullifier, output0, output1, root]",
  withdraw: "Verifier public inputs: [amount, root]",
};

const SHORT_FLOW_MS = 520;
const MEDIUM_FLOW_MS = 760;
const LONG_FLOW_MS = 1040;

const demoHash = (value: string) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index++) {
    const char = value.charCodeAt(index);
    first ^= char;
    first = Math.imul(first, 16777619);
    second ^= char + index;
    second = Math.imul(second, 1597334677);
  }

  const left = (first >>> 0).toString(16).padStart(8, "0");
  const right = (second >>> 0).toString(16).padStart(8, "0");

  return `0x${left}${right.slice(0, 4)}`;
};

const buildTreeLevels = (leaves: DemoLeaf[]): DemoTreeLevel[] => {
  let paddedLeafCount = 1;

  while (paddedLeafCount < leaves.length) {
    paddedLeafCount *= 2;
  }

  paddedLeafCount = Math.max(4, paddedLeafCount);

  const leafNodes: DemoTreeNode[] = Array.from({ length: paddedLeafCount }, (_, index) => {
    const leaf = leaves[index];

    if (!leaf) {
      return {
        hash: demoHash(`empty-leaf-${index}`),
        label: `empty ${index}`,
        status: "empty",
      };
    }

    return {
      hash: leaf.commitment,
      label: leaf.label,
      status: leaf.status,
    };
  });

  const levels: DemoTreeLevel[] = [
    {
      label: "Leaves",
      nodes: leafNodes,
    },
  ];

  let currentNodes = leafNodes;
  let levelIndex = 1;

  while (currentNodes.length > 1) {
    const nextNodes: DemoTreeNode[] = [];

    for (let index = 0; index < currentNodes.length; index += 2) {
      const left = currentNodes[index];
      const right = currentNodes[index + 1];

      nextNodes.push({
        hash: demoHash(`${left.hash}:${right.hash}`),
        label: currentNodes.length === 2 ? "root" : `H${levelIndex}.${index / 2}`,
        status: currentNodes.length === 2 ? "root" : "hash",
      });
    }

    levels.push({
      label: nextNodes.length === 1 ? "Root" : `Level ${levelIndex}`,
      nodes: nextNodes,
    });
    currentNodes = nextNodes;
    levelIndex += 1;
  }

  return levels.reverse();
};

const getTreeRoot = (leaves: DemoLeaf[]) => buildTreeLevels(leaves)[0]?.nodes[0]?.hash ?? demoHash("empty-root");

const randomHex = (bytes = 6) => {
  const values = new Uint8Array(bytes);

  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(values);
  } else {
    values.forEach((_, index) => {
      values[index] = Math.floor(Math.random() * 256);
    });
  }

  return `0x${Array.from(values)
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")}`;
};

const shortenValue = (value: string, head = 10, tail = 6) => {
  if (value.length <= head + tail + 3) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const normalizeInput = (value: string, fallback: string) => value.trim() || fallback;

const SEPOLIA_SHIELDED_POOL_ADDRESS = "0x286CD3713B16Cfc13C58A344d54BeA8eCF16dA54";
const SEPOLIA_SHIELDED_POOL_ETHERSCAN_URL =
  "https://sepolia.etherscan.io/address/0x286CD3713B16Cfc13C58A344d54BeA8eCF16dA54";

const amountLabel = (amount: string) => `${normalizeInput(amount, "0")} wei`;

const parseAmount = (amount: string) => {
  const parsed = Number.parseFloat(amount);

  return Number.isFinite(parsed) ? parsed : 0;
};

const formatOptionalBigInt = (value: bigint | undefined) => {
  if (value === undefined) {
    return "offline";
  }

  return value.toString();
};

const formatOptionalRoot = (value: bigint | undefined) => {
  if (value === undefined) {
    return "offline";
  }

  return shortenValue(`0x${value.toString(16)}`);
};

const actionLabel = (action: DemoAction) => ACTIONS.find(item => item.id === action)?.label ?? "Flow";

const baseLeafSet = (leaves: DemoLeaf[]) =>
  leaves.map(leaf => ({
    ...leaf,
    status: leaf.status === "new" ? ("active" as LeafStatus) : leaf.status,
  }));

const markFirstActiveLeafSpent = (leaves: DemoLeaf[]) => {
  let didMark = false;

  return leaves.map(leaf => {
    if (!didMark && leaf.status === "active") {
      didMark = true;
      return { ...leaf, status: "spent" as LeafStatus };
    }

    return leaf;
  });
};

const previewLeavesForAction = (leaves: DemoLeaf[], action: DemoAction, artifacts: FlowArtifacts): DemoLeaf[] => {
  const normalizedLeaves = baseLeafSet(leaves);

  if (action === "deposit") {
    return [
      ...normalizedLeaves,
      {
        id: `deposit-${artifacts.commitment}`,
        commitment: artifacts.commitment,
        label: `note ${normalizedLeaves.length}`,
        source: "deposit",
        status: "new",
      },
    ];
  }

  if (action === "transfer") {
    const spentLeaves = markFirstActiveLeafSpent(normalizedLeaves);

    return [
      ...spentLeaves,
      {
        id: `transfer-0-${artifacts.outputCommitments[0]}`,
        commitment: artifacts.outputCommitments[0],
        label: `recipient ${spentLeaves.length}`,
        source: "transfer",
        status: "new",
      },
      {
        id: `transfer-1-${artifacts.outputCommitments[1]}`,
        commitment: artifacts.outputCommitments[1],
        label: `change ${spentLeaves.length + 1}`,
        source: "transfer",
        status: "new",
      },
    ];
  }

  return markFirstActiveLeafSpent(normalizedLeaves);
};

const getTreeNodeClass = (status: NodeStatus) => {
  if (status === "root") {
    return "border-[#34eeb6] bg-[#d9fbef] text-[#17382f]";
  }

  if (status === "new") {
    return "border-[#2f7d68] bg-[#e2f6ec] text-[#163c32]";
  }

  if (status === "spent") {
    return "border-[#c8932e] bg-[#fff1cf] text-[#493412]";
  }

  if (status === "active") {
    return "border-[#93bbfb] bg-[#e7f0ff] text-[#1d2d49]";
  }

  if (status === "empty") {
    return "border-[#d7ddd2] bg-[#f6f7f5] text-[#70776f]";
  }

  return "border-[#c6d4df] bg-white text-[#334155]";
};

const INITIAL_DEMO_LEAVES: DemoLeaf[] = [
  {
    id: "seed-0",
    commitment: "0x8b3c4a91d2e7",
    label: "note 0",
    source: "seed",
    status: "active",
  },
  {
    id: "seed-1",
    commitment: "0x2a8d18b4c320",
    label: "note 1",
    source: "seed",
    status: "active",
  },
];

const INITIAL_ROOT = getTreeRoot(INITIAL_DEMO_LEAVES);

const INITIAL_PUBLIC_INPUTS: PublicInputs = {
  deposit: {
    amount: "10",
    assetId: "1",
    commitment: "0xb8f9462e1ad4",
    proof: "0xdeposit-proof",
  },
  transfer: {
    inputNullifier: "0x6f15c9d2a440",
    output0: "0x5cb8f0a17e92",
    output1: "0x71ce4d09a813",
    proof: "0xtransfer-proof",
    root: INITIAL_ROOT,
  },
  withdraw: {
    amount: "5",
    inputNullifier: "0x99df72a016c8",
    proof: "0xwithdraw-proof",
    recipient: "0x9a3C4E5A1F2b6C7d8E9012345678901234567890",
    root: INITIAL_ROOT,
  },
};

const INITIAL_ARTIFACTS: FlowArtifacts = {
  amount: amountLabel(INITIAL_PUBLIC_INPUTS.deposit.amount),
  assetId: INITIAL_PUBLIC_INPUTS.deposit.assetId,
  commitment: INITIAL_PUBLIC_INPUTS.deposit.commitment,
  inputNullifier: INITIAL_PUBLIC_INPUTS.transfer.inputNullifier,
  newRoot: INITIAL_ROOT,
  outputCommitments: [INITIAL_PUBLIC_INPUTS.transfer.output0, INITIAL_PUBLIC_INPUTS.transfer.output1],
  proof: INITIAL_PUBLIC_INPUTS.deposit.proof,
  recipient: INITIAL_PUBLIC_INPUTS.withdraw.recipient,
  root: INITIAL_ROOT,
  txHash: "0xtx-ready",
};

const INITIAL_STATS: DemoStats = {
  shieldedBalance: 20,
  publicBalance: 80,
  privateNotes: INITIAL_DEMO_LEAVES.filter(leaf => leaf.status !== "spent").length,
  spentNullifiers: 0,
  treeSize: INITIAL_DEMO_LEAVES.length,
  localRoot: INITIAL_ROOT,
  lastEvent: "Ready",
};

const createArtifacts = (
  action: DemoAction,
  currentRoot: string,
  connectedAddress: string | undefined,
  publicInputs: PublicInputs,
  leaves: DemoLeaf[],
): FlowArtifacts => {
  if (action === "deposit") {
    const inputs = publicInputs.deposit;
    const baseArtifacts: FlowArtifacts = {
      amount: amountLabel(inputs.amount),
      assetId: normalizeInput(inputs.assetId, "1"),
      commitment: normalizeInput(inputs.commitment, randomHex(12)),
      inputNullifier: publicInputs.transfer.inputNullifier,
      newRoot: currentRoot,
      outputCommitments: [publicInputs.transfer.output0, publicInputs.transfer.output1],
      proof: normalizeInput(inputs.proof, randomHex(16)),
      recipient: connectedAddress ?? publicInputs.withdraw.recipient,
      root: currentRoot,
      txHash: randomHex(16),
    };

    return {
      ...baseArtifacts,
      newRoot: getTreeRoot(previewLeavesForAction(leaves, action, baseArtifacts)),
    };
  }

  if (action === "transfer") {
    const inputs = publicInputs.transfer;
    const baseArtifacts: FlowArtifacts = {
      amount: amountLabel(publicInputs.deposit.amount),
      assetId: publicInputs.deposit.assetId,
      commitment: publicInputs.deposit.commitment,
      inputNullifier: normalizeInput(inputs.inputNullifier, randomHex(12)),
      newRoot: currentRoot,
      outputCommitments: [normalizeInput(inputs.output0, randomHex(12)), normalizeInput(inputs.output1, randomHex(12))],
      proof: normalizeInput(inputs.proof, randomHex(16)),
      recipient: connectedAddress ?? publicInputs.withdraw.recipient,
      root: normalizeInput(inputs.root, currentRoot),
      txHash: randomHex(16),
    };

    return {
      ...baseArtifacts,
      newRoot: getTreeRoot(previewLeavesForAction(leaves, action, baseArtifacts)),
    };
  }

  const inputs = publicInputs.withdraw;
  const root = normalizeInput(inputs.root, currentRoot);

  return {
    amount: amountLabel(inputs.amount),
    assetId: publicInputs.deposit.assetId,
    commitment: publicInputs.deposit.commitment,
    inputNullifier: normalizeInput(inputs.inputNullifier, randomHex(12)),
    newRoot: root,
    outputCommitments: [publicInputs.transfer.output0, publicInputs.transfer.output1],
    proof: normalizeInput(inputs.proof, randomHex(16)),
    recipient: connectedAddress ?? normalizeInput(inputs.recipient, "0x9a3C4E5A1F2b6C7d8E9012345678901234567890"),
    root,
    txHash: randomHex(16),
  };
};

const buildFlowSteps = (action: DemoAction, artifacts: FlowArtifacts): FlowStep[] => {
  if (action === "deposit") {
    return [
      {
        title: "Sample note secret locally",
        detail: "Client derives randomness for a new encrypted note.",
        durationMs: SHORT_FLOW_MS,
        artifact: `amount ${artifacts.amount}`,
      },
      {
        title: "Generate deposit proof",
        detail: "Noir witness is proved before anything is sent to the chain.",
        durationMs: LONG_FLOW_MS,
        artifact: artifacts.proof,
      },
      {
        title: "Pack verifier public inputs",
        detail: "DepositVerifier receives [commitment, amount].",
        durationMs: MEDIUM_FLOW_MS,
        artifact: `[${shortenValue(artifacts.commitment)}, ${artifacts.amount}]`,
      },
      {
        title: "Submit deposit transaction",
        detail: "ShieldedPool.deposit(amount, assetId, commitment, proof).",
        durationMs: LONG_FLOW_MS,
        artifact: artifacts.txHash,
      },
      {
        title: "Verifier contract checks proof",
        detail: "Deposit proof is checked against the public input vector.",
        durationMs: MEDIUM_FLOW_MS,
      },
      {
        title: "Pool checks native ETH value",
        detail: "Payable deposit amount is matched before the note is inserted.",
        durationMs: MEDIUM_FLOW_MS,
      },
      {
        title: "Append commitment to LeanIMT",
        detail: "Demo tree updates with the new note commitment.",
        durationMs: MEDIUM_FLOW_MS,
        artifact: artifacts.newRoot,
      },
      {
        title: "Deposit success",
        detail: "Private balance increased and the note is ready to spend.",
        durationMs: SHORT_FLOW_MS,
      },
    ];
  }

  if (action === "transfer") {
    return [
      {
        title: "Select private input note",
        detail: "Client reads local note metadata and the current Merkle path.",
        durationMs: SHORT_FLOW_MS,
        artifact: artifacts.root,
      },
      {
        title: "Compute nullifier",
        detail: "The spend key creates a one-time nullifier for this input.",
        durationMs: MEDIUM_FLOW_MS,
        artifact: artifacts.inputNullifier,
      },
      {
        title: "Create recipient and change notes",
        detail: "Two output commitments preserve value without revealing amounts.",
        durationMs: MEDIUM_FLOW_MS,
        artifact: artifacts.outputCommitments.map(value => shortenValue(value)).join(", "),
      },
      {
        title: "Generate transfer proof",
        detail: "Proof covers inclusion, nullifier correctness, and value conservation.",
        durationMs: LONG_FLOW_MS,
        artifact: artifacts.proof,
      },
      {
        title: "Pack verifier public inputs",
        detail: "TransferVerifier receives [inputNullifier, output0, output1, root].",
        durationMs: MEDIUM_FLOW_MS,
        artifact: `[${shortenValue(artifacts.inputNullifier)}, outputs, ${shortenValue(artifacts.root)}]`,
      },
      {
        title: "Submit transfer transaction",
        detail: "ShieldedPool.transfer(root, nullifier, outputs, proof).",
        durationMs: LONG_FLOW_MS,
        artifact: artifacts.txHash,
      },
      {
        title: "Nullifier set checks spend",
        detail: "Bucketed set rejects double spends before outputs are inserted.",
        durationMs: MEDIUM_FLOW_MS,
      },
      {
        title: "Transfer success",
        detail: "Recipient and change notes are now leaves in the shielded pool.",
        durationMs: SHORT_FLOW_MS,
        artifact: artifacts.newRoot,
      },
    ];
  }

  return [
    {
      title: "Prepare withdrawal note",
      detail: "Client selects a spendable note and public recipient.",
      durationMs: SHORT_FLOW_MS,
      artifact: artifacts.recipient,
    },
    {
      title: "Compute withdrawal nullifier",
      detail: "The note can be withdrawn only once.",
      durationMs: MEDIUM_FLOW_MS,
      artifact: artifacts.inputNullifier,
    },
    {
      title: "Generate withdrawal proof",
      detail: "Proof binds the root and public withdrawal amount.",
      durationMs: LONG_FLOW_MS,
      artifact: artifacts.proof,
    },
    {
      title: "Pack verifier public inputs",
      detail: "WithdrawVerifier receives [amount, root].",
      durationMs: MEDIUM_FLOW_MS,
      artifact: `[${artifacts.amount}, ${shortenValue(artifacts.root)}]`,
    },
    {
      title: "Submit withdrawal transaction",
      detail: "ShieldedPool.withdraw(root, nullifier, recipient, amount, proof).",
      durationMs: LONG_FLOW_MS,
      artifact: artifacts.txHash,
    },
    {
      title: "Nullifier set checks spend",
      detail: "The bucketed set records the note as spent.",
      durationMs: MEDIUM_FLOW_MS,
    },
    {
      title: "Release native ETH",
      detail: "ShieldedPool transfers public wei to the recipient.",
      durationMs: MEDIUM_FLOW_MS,
      artifact: artifacts.amount,
    },
    {
      title: "Withdrawal success",
      detail: "Public balance increased and the private note is closed.",
      durationMs: SHORT_FLOW_MS,
    },
  ];
};

const updateDemoStats = (stats: DemoStats, action: DemoAction, artifacts: FlowArtifacts): DemoStats => {
  const amount = parseAmount(artifacts.amount);

  if (action === "deposit") {
    return {
      ...stats,
      shieldedBalance: stats.shieldedBalance + amount,
      publicBalance: Math.max(0, stats.publicBalance - amount),
      privateNotes: stats.privateNotes + 1,
      treeSize: stats.treeSize + 1,
      localRoot: artifacts.newRoot,
      lastEvent: "Deposit",
    };
  }

  if (action === "transfer") {
    return {
      ...stats,
      privateNotes: stats.privateNotes + 1,
      spentNullifiers: stats.spentNullifiers + 1,
      treeSize: stats.treeSize + 2,
      localRoot: artifacts.newRoot,
      lastEvent: "Transfer",
    };
  }

  return {
    ...stats,
    shieldedBalance: Math.max(0, stats.shieldedBalance - amount),
    publicBalance: stats.publicBalance + amount,
    privateNotes: Math.max(0, stats.privateNotes - 1),
    spentNullifiers: stats.spentNullifiers + 1,
    localRoot: artifacts.newRoot,
    lastEvent: "Withdrawal",
  };
};

const createInitialRun = (): FlowRun => ({
  action: "deposit",
  artifacts: INITIAL_ARTIFACTS,
  currentStep: -1,
  sequence: 0,
  status: "idle",
  steps: buildFlowSteps("deposit", INITIAL_ARTIFACTS),
});

const elapsedForStep = (steps: FlowStep[], stepIndex: number) =>
  steps.slice(0, stepIndex).reduce((total, step) => total + step.durationMs, 0);

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [demoLeaves, setDemoLeaves] = useState<DemoLeaf[]>(INITIAL_DEMO_LEAVES);
  const [publicInputs, setPublicInputs] = useState<PublicInputs>(INITIAL_PUBLIC_INPUTS);
  const [selectedAction, setSelectedAction] = useState<DemoAction>("deposit");
  const [stats, setStats] = useState<DemoStats>(INITIAL_STATS);
  const [run, setRun] = useState<FlowRun>(() => createInitialRun());
  const terminalRef = useRef<HTMLDivElement>(null);
  const isLocalTarget = targetNetwork.id === 31337;
  const isSepoliaTarget = targetNetwork.id === 11155111;
  const hasShieldedPoolDeployment = isLocalTarget || isSepoliaTarget;

  const { data: chainTreeSize } = useScaffoldReadContract({
    contractName: "ShieldedPool",
    functionName: "treeSize",
    query: {
      enabled: hasShieldedPoolDeployment,
      retry: false,
    },
  });

  const { data: chainTreeDepth } = useScaffoldReadContract({
    contractName: "ShieldedPool",
    functionName: "treeDepth",
    query: {
      enabled: hasShieldedPoolDeployment,
      retry: false,
    },
  });

  const { data: chainRoot } = useScaffoldReadContract({
    contractName: "ShieldedPool",
    functionName: "currentRoot",
    query: {
      enabled: hasShieldedPoolDeployment,
      retry: false,
    },
  });

  const treeLevels = useMemo(() => buildTreeLevels(demoLeaves), [demoLeaves]);
  const demoRoot = treeLevels[0]?.nodes[0]?.hash ?? INITIAL_ROOT;

  const visibleTerminalSteps = useMemo(() => {
    if (run.currentStep < 0) {
      return [];
    }

    return run.steps.slice(0, run.currentStep + 1);
  }, [run.currentStep, run.steps]);

  const progressPercent = run.currentStep < 0 ? 0 : Math.round(((run.currentStep + 1) / run.steps.length) * 100);

  const isRunning = run.status === "running";
  const activeStep = run.currentStep >= 0 ? run.steps[run.currentStep] : undefined;

  useEffect(() => {
    setPublicInputs(currentInputs => ({
      ...currentInputs,
      transfer: {
        ...currentInputs.transfer,
        root: stats.localRoot,
      },
      withdraw: {
        ...currentInputs.withdraw,
        root: stats.localRoot,
      },
    }));
  }, [stats.localRoot]);

  useEffect(() => {
    if (run.status !== "running" || run.currentStep < 0) {
      return;
    }

    const step = run.steps[run.currentStep];

    const timer = window.setTimeout(() => {
      const isLastStep = run.currentStep >= run.steps.length - 1;

      if (isLastStep) {
        setDemoLeaves(currentLeaves => previewLeavesForAction(currentLeaves, run.action, run.artifacts));
        setStats(currentStats => updateDemoStats(currentStats, run.action, run.artifacts));
        setRun(currentRun => ({
          ...currentRun,
          status: "complete",
        }));
        notification.success(`${actionLabel(run.action)} flow complete`);
        return;
      }

      setRun(currentRun => ({
        ...currentRun,
        currentStep: currentRun.currentStep + 1,
      }));
    }, step.durationMs);

    return () => window.clearTimeout(timer);
  }, [run.action, run.artifacts, run.currentStep, run.status, run.steps]);

  useEffect(() => {
    terminalRef.current?.scrollTo({
      top: terminalRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [run.currentStep, run.sequence]);

  const updatePublicInput = (action: DemoAction, field: string, value: string) => {
    setPublicInputs(currentInputs => ({
      ...currentInputs,
      [action]: {
        ...currentInputs[action],
        [field]: value,
      },
    }));
  };

  const startFlow = (action: DemoAction) => {
    const artifacts = createArtifacts(action, stats.localRoot, connectedAddress, publicInputs, demoLeaves);

    setSelectedAction(action);
    setRun(currentRun => ({
      action,
      artifacts,
      currentStep: 0,
      sequence: currentRun.sequence + 1,
      status: "running",
      steps: buildFlowSteps(action, artifacts),
    }));
  };

  const statusBadge =
    run.status === "running" ? "badge-info" : run.status === "complete" ? "badge-success" : "badge-ghost";

  const statusText = run.status === "running" ? "Running" : run.status === "complete" ? "Verified" : "Ready";

  const selectedPublicInputs = publicInputs[selectedAction] as Record<string, string>;

  const localStats = [
    { label: "Shielded balance", value: `${stats.shieldedBalance} wei` },
    { label: "Public balance", value: `${stats.publicBalance} wei` },
    { label: "Private notes", value: stats.privateNotes.toString() },
    { label: "Spent nullifiers", value: stats.spentNullifiers.toString() },
    { label: "Demo tree leaves", value: stats.treeSize.toString() },
    { label: "Last event", value: stats.lastEvent },
  ];

  const chainStats = [
    {
      label: "Live contract",
      value: isSepoliaTarget
        ? shortenValue(SEPOLIA_SHIELDED_POOL_ADDRESS)
        : isLocalTarget
          ? "Hardhat local"
          : "not deployed",
    },
    {
      label: "Chain tree size",
      value: hasShieldedPoolDeployment ? formatOptionalBigInt(chainTreeSize) : "not deployed",
    },
    { label: "Tree depth", value: hasShieldedPoolDeployment ? formatOptionalBigInt(chainTreeDepth) : "not deployed" },
    { label: "Current root", value: hasShieldedPoolDeployment ? formatOptionalRoot(chainRoot) : "not deployed" },
  ];

  const networkStats = [
    { label: "Selected network", value: targetNetwork.name },
    { label: "Hardhat", value: isLocalTarget ? "active target" : "available" },
    { label: "Sepolia", value: isSepoliaTarget ? "active deployment" : "configured" },
  ];

  return (
    <main data-theme="light" className="min-h-screen bg-[#f5f7f2] text-[#1f2530]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#2f7d68]">IC3 Summer Camp Demo</div>
            <h1 className="mt-1 text-3xl font-bold leading-tight sm:text-4xl">PQ Shielded Pool</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${statusBadge} min-w-24 justify-center`}>{statusText}</span>
            <span className="badge badge-outline min-w-28 justify-center">{targetNetwork.name}</span>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <section className="min-w-0 rounded-lg border border-[#d7ddd2] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold leading-tight">Flow Controls</h2>
                <div className="mt-1 text-sm text-base-content/65">Wallet</div>
              </div>
              <ShieldCheckIcon className="h-8 w-8 text-[#2f7d68]" aria-hidden="true" />
            </div>

            <div className="mt-3 min-h-8">
              {connectedAddress ? (
                <Address address={connectedAddress} chain={targetNetwork} />
              ) : (
                <span className="text-sm text-base-content/60">No wallet connected</span>
              )}
            </div>

            <div className="mt-5 grid gap-3">
              {ACTIONS.map(action => {
                const Icon = action.icon;
                const isActive = isRunning && run.action === action.id;

                return (
                  <button
                    key={action.id}
                    className={`btn ${action.buttonClass} h-16 min-h-16 w-full justify-start gap-3 px-4 text-left`}
                    disabled={isRunning}
                    onClick={() => startFlow(action.id)}
                    type="button"
                  >
                    {isActive ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                    )}
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="truncate text-base font-bold leading-5">{action.label}</span>
                      <span className="truncate text-xs font-normal opacity-75">{action.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-lg border border-[#d7ddd2] bg-[#f0f4ef] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <CpuChipIcon className="h-5 w-5 text-[#2f7d68]" aria-hidden="true" />
                  Public Inputs
                </div>
                <div className="join">
                  {ACTIONS.map(action => (
                    <button
                      key={action.id}
                      className={`btn btn-xs join-item ${selectedAction === action.id ? "btn-neutral" : "btn-ghost"}`}
                      disabled={isRunning}
                      onClick={() => setSelectedAction(action.id)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3 rounded-md bg-white px-3 py-2 font-mono text-xs text-base-content/70">
                {PUBLIC_INPUT_SUMMARY[selectedAction]}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PUBLIC_INPUT_FIELD_SETS[selectedAction].map(field => (
                  <label key={`${selectedAction}-${field.field}`} className="form-control min-w-0">
                    <span className="mb-1 text-xs font-semibold text-base-content/65">{field.label}</span>
                    <input
                      className="input input-sm input-bordered h-10 min-h-10 w-full font-mono text-xs"
                      disabled={isRunning}
                      onChange={event => updatePublicInput(selectedAction, field.field, event.target.value)}
                      placeholder={field.placeholder}
                      value={selectedPublicInputs[field.field] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="divider my-5" />

            <div className="grid gap-2 sm:grid-cols-2">
              {localStats.map(item => (
                <div key={item.label} className="min-h-16 rounded-lg border border-[#d7ddd2] bg-[#f0f4ef] p-3">
                  <div className="text-xs text-base-content/60">{item.label}</div>
                  <div className="mt-1 truncate text-lg font-bold">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-[#d7ddd2] bg-[#f0f4ef] p-3">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <CircleStackIcon className="h-5 w-5 text-[#2f7d68]" aria-hidden="true" />
                  Contract Mirror
                </div>
                <a
                  className="btn btn-outline btn-xs w-fit gap-1 border-[#2f7d68] text-[#2f7d68]"
                  href={SEPOLIA_SHIELDED_POOL_ETHERSCAN_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  Sepolia Etherscan
                </a>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {chainStats.map(item => (
                  <div key={item.label} className="min-w-0">
                    <div className="text-xs text-base-content/60">{item.label}</div>
                    <div className="truncate font-mono text-sm font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-[#d7ddd2] bg-[#f0f4ef] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <ShieldCheckIcon className="h-5 w-5 text-[#2f7d68]" aria-hidden="true" />
                Network Readiness
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {networkStats.map(item => (
                  <div key={item.label} className="min-w-0">
                    <div className="text-xs text-base-content/60">{item.label}</div>
                    <div className="truncate text-sm font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-[#283348] bg-[#182033] text-neutral-content shadow-sm">
            <div className="flex flex-col gap-3 border-b border-neutral-content/15 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-3">
                <CommandLineIcon className="h-7 w-7 text-warning" aria-hidden="true" />
                <div>
                  <h2 className="text-xl font-bold leading-tight">Private Transfer Flow</h2>
                  <div className="text-sm text-neutral-content/65">local-demo://shielded-pool</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{progressPercent}%</span>
                {isRunning ? (
                  <span className="loading loading-dots loading-sm" />
                ) : (
                  <CheckCircleIcon className="h-5 w-5" />
                )}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <progress className="progress progress-success h-2 w-full" value={progressPercent} max="100" />

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-neutral-content/15 bg-neutral-content/5 p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-content/60">
                    <CpuChipIcon className="h-4 w-4" aria-hidden="true" />
                    Proof
                  </div>
                  <div className="mt-1 truncate font-mono text-sm font-semibold">
                    {activeStep?.artifact ? shortenValue(activeStep.artifact) : shortenValue(run.artifacts.proof)}
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-content/15 bg-neutral-content/5 p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-content/60">
                    <KeyIcon className="h-4 w-4" aria-hidden="true" />
                    Nullifier
                  </div>
                  <div className="mt-1 truncate font-mono text-sm font-semibold">
                    {shortenValue(run.artifacts.inputNullifier)}
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-content/15 bg-neutral-content/5 p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-content/60">
                    <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                    New root
                  </div>
                  <div className="mt-1 truncate font-mono text-sm font-semibold">
                    {shortenValue(run.artifacts.newRoot)}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-neutral-content/15 bg-[#f8faf7] p-3 text-[#1f2530]">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <CircleStackIcon className="h-5 w-5 text-[#2f7d68]" aria-hidden="true" />
                    Demo Merkle Tree
                  </div>
                  <div className="truncate font-mono text-xs text-base-content/70">root {shortenValue(demoRoot)}</div>
                </div>
                <div className="overflow-x-auto pb-1">
                  <div className="min-w-[540px] space-y-3">
                    {treeLevels.map(level => (
                      <div key={level.label} className="grid gap-1">
                        <div className="text-center text-[0.68rem] font-semibold uppercase tracking-wide text-base-content/50">
                          {level.label}
                        </div>
                        <div className="flex justify-center gap-2">
                          {level.nodes.map((node, index) => (
                            <div
                              key={`${level.label}-${node.hash}-${index}`}
                              className={`min-h-14 min-w-24 rounded-md border px-2 py-1 text-center shadow-sm ${getTreeNodeClass(
                                node.status,
                              )}`}
                            >
                              <div className="truncate text-xs font-bold">{node.label}</div>
                              <div className="mt-1 truncate font-mono text-[0.68rem]">
                                {shortenValue(node.hash, 8, 4)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="badge badge-outline">active note</span>
                  <span className="badge badge-success badge-outline">new commitment</span>
                  <span className="badge badge-warning badge-outline">spent by nullifier</span>
                  <span className="badge badge-ghost">demo view only</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="rounded-lg border border-neutral-content/15 bg-neutral-content/5 p-3">
                  <div className="mb-3 text-sm font-bold">{actionLabel(run.action)} Stages</div>
                  <div className="grid gap-2">
                    {run.steps.map((step, index) => {
                      const isComplete = run.status === "complete" || index < run.currentStep;
                      const isCurrent = run.status === "running" && index === run.currentStep;

                      return (
                        <div key={step.title} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
                          <div
                            className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                              isComplete
                                ? "border-success bg-success text-success-content"
                                : isCurrent
                                  ? "border-warning bg-warning text-warning-content"
                                  : "border-neutral-content/25"
                            }`}
                          >
                            {isComplete ? (
                              <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                            ) : isCurrent ? (
                              <span className="loading loading-ring loading-xs" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{step.title}</div>
                            <div className="line-clamp-2 text-xs text-neutral-content/60">{step.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  ref={terminalRef}
                  className="min-h-[420px] overflow-y-auto rounded-lg border border-neutral-content/15 bg-black p-3 font-mono text-xs text-success"
                  aria-live="polite"
                >
                  {visibleTerminalSteps.length === 0 ? (
                    <div className="text-neutral-content/60">$ demo console ready</div>
                  ) : (
                    visibleTerminalSteps.map((step, index) => {
                      const isCurrent = run.status === "running" && index === run.currentStep;
                      const elapsed = elapsedForStep(run.steps, index);

                      return (
                        <div
                          key={`${run.sequence}-${step.title}`}
                          className="grid grid-cols-[4.8rem_minmax(0,1fr)] gap-2 py-1"
                        >
                          <span className="text-neutral-content/45">T+{(elapsed / 1000).toFixed(1)}s</span>
                          <span className="min-w-0 break-words">
                            {isCurrent ? "> " : "✓ "}
                            {step.title}
                            <span className="text-neutral-content/55"> :: {step.detail}</span>
                            {step.artifact ? (
                              <span className="block text-warning">artifact {shortenValue(step.artifact)}</span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })
                  )}
                  {isRunning ? <div className="mt-2 text-warning">waiting for verifier response...</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
};

export default Home;
