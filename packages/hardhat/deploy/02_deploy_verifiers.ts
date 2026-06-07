import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployVerifiers: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  for (const contractName of ["DepositVerifier", "TransferVerifier", "WithdrawVerifier"]) {
    await deploy(contractName, {
      from: deployer,
      log: true,
      autoMine: true,
    });
  }
};

export default deployVerifiers;

deployVerifiers.tags = ["Verifiers", "DepositVerifier", "TransferVerifier", "WithdrawVerifier"];
