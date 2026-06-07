import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployPoseidon: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("PoseidonT3", {
    contract: "poseidon-solidity/PoseidonT3.sol:PoseidonT3",
    from: deployer,
    log: true,
    autoMine: true,
  });
};

export default deployPoseidon;

deployPoseidon.tags = ["PoseidonT3"];
