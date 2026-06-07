import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployShieldedPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, save } = hre.deployments;

  // Deploy Groth16 verifier for deposit circuit
  const depositGroth16Verifier = await deploy("DepositProvekitGroth16Verifier", {
    contract: "contracts/DepositVerifier.sol:ProvekitGroth16Verifier",
    from: deployer,
    log: true,
    autoMine: true,
  });

  // Deploy the wrapper that implements IDepositVerifier
  const depositVerifier = await deploy("DepositVerifierWrapper", {
    from: deployer,
    args: [depositGroth16Verifier.address],
    log: true,
    autoMine: true,
  });

  // Deploy Groth16 verifier for transfer circuit
  const transferGroth16Verifier = await deploy("TransferProvekitGroth16Verifier", {
    contract: "contracts/TransferVerifier.sol:ProvekitGroth16Verifier",
    from: deployer,
    log: true,
    autoMine: true,
  });

  // Deploy the wrapper that implements ITransferVerifier
  const transferVerifier = await deploy("TransferVerifierWrapper", {
    from: deployer,
    args: [transferGroth16Verifier.address],
    log: true,
    autoMine: true,
  });

  // Deploy Groth16 verifier for withdraw circuit
  const withdrawGroth16Verifier = await deploy("WithdrawProvekitGroth16Verifier", {
    contract: "contracts/WithdrawVerifier.sol:ProvekitGroth16Verifier",
    from: deployer,
    log: true,
    autoMine: true,
  });

  // Deploy the wrapper that implements IWithdrawVerifier
  const withdrawVerifier = await deploy("WithdrawVerifierWrapper", {
    from: deployer,
    args: [withdrawGroth16Verifier.address],
    log: true,
    autoMine: true,
  });

  // ShieldedPool uses Poseidon2T4 (inline library, no external linking needed)
  const assetId = 1;
  const deployerSigner = await hre.ethers.getSigner(deployer);

  const ShieldedPoolFactory = await hre.ethers.getContractFactory("ShieldedPool", {
    signer: deployerSigner,
  });

  const constructorArgs = [
    depositVerifier.address,
    transferVerifier.address,
    withdrawVerifier.address,
    assetId,
  ] as const;

  const shieldedPool = await ShieldedPoolFactory.deploy(...constructorArgs, { gasLimit: 8_000_000 });
  await shieldedPool.waitForDeployment();
  const address = await shieldedPool.getAddress();

  console.log(`deploying "ShieldedPool" ...: deployed at ${address}`);

  const artifact = await hre.artifacts.readArtifact("ShieldedPool");
  const deployTx = shieldedPool.deploymentTransaction();

  await save("ShieldedPool", {
    address,
    abi: artifact.abi,
    transactionHash: deployTx?.hash,
    args: [...constructorArgs],
    bytecode: artifact.bytecode,
    deployedBytecode: artifact.deployedBytecode,
  });
};

export default deployShieldedPool;

deployShieldedPool.tags = ["ShieldedPool"];
deployShieldedPool.dependencies = [];
