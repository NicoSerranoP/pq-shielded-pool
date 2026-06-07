import { ethers } from "ethers";
import { parse, stringify } from "envfile";
import * as fs from "fs";
import password from "@inquirer/password";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

const envFilePath = "./.env";

const getValidatedPassword = async () => {
  while (true) {
    const pass = await password({ message: "Enter a password to encrypt your private key:" });
    const confirmation = await password({ message: "Confirm password:" });

    if (pass === confirmation) {
      return pass;
    }
    console.log("❌ Passwords don't match. Please try again.");
  }
};

const getWalletFromPrivateKey = async () => {
  while (true) {
    const privateKey = await password({ message: "Paste your private key:" });
    try {
      const wallet = new ethers.Wallet(privateKey);
      return wallet;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      console.log("❌ Invalid private key format. Please try again.");
    }
  }
};

const confirmAccountReplacement = async () => {
  const rl = createInterface({ input, output });
  const answer = await rl.question("You already have a deployer account. Replace it with a new private key? (y/N) ");
  rl.close();

  return answer.trim().toLowerCase() === "y";
};

const setNewEnvConfig = async (existingEnvConfig = {}) => {
  console.log("👛 Importing Wallet\n");

  const wallet = await getWalletFromPrivateKey();

  const pass = await getValidatedPassword();
  const encryptedJson = await wallet.encrypt(pass);

  const newEnvConfig = {
    ...existingEnvConfig,
    DEPLOYER_PRIVATE_KEY_ENCRYPTED: encryptedJson,
  };

  // Store in .env
  fs.writeFileSync(envFilePath, stringify(newEnvConfig));
  console.log("\n📄 Encrypted Private Key saved to packages/hardhat/.env file");
  console.log("🪄 Imported wallet address:", wallet.address, "\n");
  console.log("⚠️ Make sure to remember your password! You'll need it to decrypt the private key.");
};

async function main() {
  if (!fs.existsSync(envFilePath)) {
    // No .env file yet.
    await setNewEnvConfig();
    return;
  }

  const existingEnvConfig = parse(fs.readFileSync(envFilePath).toString());
  if (existingEnvConfig.DEPLOYER_PRIVATE_KEY_ENCRYPTED) {
    const shouldReplace = await confirmAccountReplacement();

    if (!shouldReplace) {
      console.log("Keeping existing deployer account.");
      return;
    }
  }

  await setNewEnvConfig(existingEnvConfig);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
