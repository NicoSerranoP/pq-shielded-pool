import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);

const deployShieldedPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!LOCAL_NETWORKS.has(hre.network.name)) {
    console.log(`Skipping local ShieldedPool deployment on ${hre.network.name}`);
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const token = await get("SE2Token");

  const poseidon = await deploy("PoseidonT3", {
    contract: "poseidon-solidity/PoseidonT3.sol:PoseidonT3",
    from: deployer,
    log: true,
    autoMine: true,
  });

  const depositVerifier = await deploy("DepositVerifier", {
    contract: "DepositVerifier",
    from: deployer,
    log: true,
    autoMine: true,
  });

  const transferVerifier = await deploy("TransferVerifier", {
    contract: "TransferVerifier",
    from: deployer,
    log: true,
    autoMine: true,
  });

  const withdrawVerifier = await deploy("WithdrawVerifier", {
    contract: "WithdrawVerifier",
    from: deployer,
    log: true,
    autoMine: true,
  });

  await deploy("ShieldedPool", {
    from: deployer,
    args: [
      token.address,
      depositVerifier.address,
      transferVerifier.address,
      withdrawVerifier.address,
      BigInt(token.address),
    ],
    libraries: {
      PoseidonT3: poseidon.address,
    },
    log: true,
    autoMine: true,
  });
};

export default deployShieldedPool;

deployShieldedPool.tags = ["ShieldedPool"];
deployShieldedPool.dependencies = ["SE2Token"];
