import { ethers, deployments } from "hardhat";
import * as fs from "fs";

async function main() {
  const [signer] = await ethers.getSigners();

  const poolDep = await deployments.get("ShieldedPool");
  const pool = await ethers.getContractAt("ShieldedPool", poolDep.address);
  const tokenDep = await deployments.get("SE2Token");
  const token = await ethers.getContractAt("SE2Token", tokenDep.address);

  const proof = fs.readFileSync("../circuits/evm/proof.hex", "utf8").trim();
  const commitment = BigInt("6966757832092678110567972609532936655714555838012441506758642728623502836951");

  console.log("Minting tokens...");
  await (await token.mint(signer.address, ethers.parseEther("1000"), { gasLimit: 100000 })).wait();

  console.log("Approving...");
  await (await token.approve(poolDep.address, ethers.parseEther("1000"), { gasLimit: 100000 })).wait();

  console.log("Depositing...");
  const tx = await pool.deposit(5, 1, commitment, proof, { gasLimit: 3_000_000 });
  const receipt = await tx.wait();

  console.log("Deposit successful! tx:", receipt?.hash);
}

main().catch(console.error);
