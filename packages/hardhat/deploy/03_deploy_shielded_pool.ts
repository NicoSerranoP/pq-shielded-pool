import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployShieldedPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const poseidonT3 = await get("PoseidonT3");
  const token = await get("SE2Token");
  const depositVerifier = await get("DepositVerifier");
  const transferVerifier = await get("TransferVerifier");
  const withdrawVerifier = await get("WithdrawVerifier");
  const assetId = process.env.SHIELDED_POOL_ASSET_ID ?? "1";

  await deploy("ShieldedPool", {
    from: deployer,
    args: [token.address, depositVerifier.address, transferVerifier.address, withdrawVerifier.address, assetId],
    libraries: {
      PoseidonT3: poseidonT3.address,
    },
    log: true,
    autoMine: true,
  });
};

export default deployShieldedPool;

deployShieldedPool.tags = ["ShieldedPool"];
deployShieldedPool.dependencies = ["PoseidonT3", "SE2Token", "Verifiers"];
