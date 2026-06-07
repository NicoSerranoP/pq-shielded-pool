import * as dotenv from "dotenv";
dotenv.config();
import password from "@inquirer/password";
import { Wallet } from "ethers";
import { deployments, ethers } from "hardhat";

type MintArgs = {
  amount: bigint;
  recipients: string[];
  includeSelf: boolean;
};

const parseArgs = (): MintArgs => {
  const args = process.argv.slice(2);
  const recipients: string[] = [];
  let amount = 1_000n;
  let includeSelf = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--to") {
      const recipient = args[++i];
      if (!recipient) {
        throw new Error("Missing address after --to");
      }
      recipients.push(recipient);
    } else if (arg === "--amount") {
      const rawAmount = args[++i];
      if (!rawAmount) {
        throw new Error("Missing amount after --amount");
      }
      amount = BigInt(rawAmount);
    } else if (arg === "--self") {
      includeSelf = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { amount, recipients, includeSelf };
};

const getDeployerWallet = async () => {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    const [signer] = await ethers.getSigners();
    return signer;
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });
  return Wallet.fromEncryptedJson(encryptedKey, pass).then(wallet => wallet.connect(ethers.provider));
};

async function main() {
  const { amount, recipients, includeSelf } = parseArgs();
  const signer = await getDeployerWallet();
  const signerAddress = await signer.getAddress();
  const tokenDeployment = await deployments.get("SE2Token");
  const token = await ethers.getContractAt("SE2Token", tokenDeployment.address, signer);

  const normalizedRecipients = [...recipients];
  if (includeSelf) {
    normalizedRecipients.unshift(signerAddress);
  }

  const uniqueRecipients = [...new Set(normalizedRecipients.map(address => ethers.getAddress(address)))];
  if (uniqueRecipients.length === 0) {
    throw new Error("Pass at least one recipient with --to <address> or use --self");
  }

  console.log(`token=${tokenDeployment.address}`);
  console.log(`minter=${signerAddress}`);
  console.log(`amount=${amount.toString()}`);

  for (const recipient of uniqueRecipients) {
    const tx = await token.mint(recipient, amount);
    console.log(`minting recipient=${recipient} tx=${tx.hash}`);
    await tx.wait();

    const balance = await token.balanceOf(recipient);
    console.log(`balance recipient=${recipient} balance=${balance.toString()}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
