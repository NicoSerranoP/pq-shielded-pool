import * as dotenv from "dotenv";
dotenv.config();
import password from "@inquirer/password";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

async function main() {
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);

    console.log("No encrypted deployer found; using Hardhat configured signer.");
    console.log(`address=${deployer.address}`);
    console.log(`balanceWei=${balance.toString()}`);
    console.log(`balanceEth=${ethers.formatEther(balance)}`);
    return;
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });
  const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
  const balance = await ethers.provider.getBalance(wallet.address);

  console.log(`address=${wallet.address}`);
  console.log(`balanceWei=${balance.toString()}`);
  console.log(`balanceEth=${ethers.formatEther(balance)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
