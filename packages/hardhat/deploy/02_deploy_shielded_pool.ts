import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const parseAssetId = (assetId: string | undefined, tokenAddress: string) => {
  const rawAssetId = assetId?.trim() || tokenAddress;
  let parsed: bigint;

  try {
    parsed = BigInt(rawAssetId);
  } catch {
    throw new Error("SHIELDED_POOL_ASSET_ID must be a decimal or 0x-prefixed integer");
  }

  if (parsed === 0n) {
    throw new Error("SHIELDED_POOL_ASSET_ID must be non-zero");
  }

  return parsed;
};

const deployShieldedPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;
  const configuredTokenAddress = process.env.SHIELDED_POOL_TOKEN_ADDRESS?.trim();

  if (configuredTokenAddress && !hre.ethers.isAddress(configuredTokenAddress)) {
    throw new Error("SHIELDED_POOL_TOKEN_ADDRESS must be a valid EVM address");
  }

  const tokenAddress = configuredTokenAddress ?? (await get("SE2Token")).address;
  const assetId = parseAssetId(process.env.SHIELDED_POOL_ASSET_ID, tokenAddress);

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
    args: [tokenAddress, depositVerifier.address, transferVerifier.address, withdrawVerifier.address, assetId],
    libraries: {
      PoseidonT3: poseidon.address,
    },
    log: true,
    autoMine: true,
  });

  console.log(`ShieldedPool token: ${tokenAddress}`);
  console.log(`ShieldedPool asset id: ${assetId}`);
};

export default deployShieldedPool;

deployShieldedPool.tags = ["ShieldedPool"];
deployShieldedPool.dependencies = ["SE2Token"];
