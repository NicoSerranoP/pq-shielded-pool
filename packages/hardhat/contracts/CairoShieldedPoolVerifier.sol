// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IDepositVerifier, ITransferVerifier, IWithdrawVerifier } from "./ShieldedPool.sol";
import { ICairoFactRegistry } from "./interfaces/ICairoFactRegistry.sol";

/// @notice Cairo/STARK fact adapter for the existing ShieldedPool verifier interfaces.
/// @dev `proof` is ABI-encoded as `uint256[] cairoOutputs`. The outputs are the full
/// serialized Cairo return array, including the leading array length. They must match the public
/// pool calldata before the Cairo fact registry is consulted.
contract CairoShieldedPoolVerifier is IDepositVerifier, ITransferVerifier, IWithdrawVerifier {
    uint256 public constant DEPOSIT_OUTPUT_KIND = 1;
    uint256 public constant TRANSFER_OUTPUT_KIND = 2;
    uint256 public constant WITHDRAW_OUTPUT_KIND = 3;

    ICairoFactRegistry public immutable factRegistry;
    bytes32 public immutable depositProgramHash;
    bytes32 public immutable transferProgramHash;
    bytes32 public immutable withdrawProgramHash;
    bool public immutable mockedFacts;

    error InvalidFactRegistry();

    constructor(
        address factRegistry_,
        bytes32 depositProgramHash_,
        bytes32 transferProgramHash_,
        bytes32 withdrawProgramHash_,
        bool mockedFacts_
    ) {
        if (factRegistry_ == address(0)) {
            revert InvalidFactRegistry();
        }

        factRegistry = ICairoFactRegistry(factRegistry_);
        depositProgramHash = depositProgramHash_;
        transferProgramHash = transferProgramHash_;
        withdrawProgramHash = withdrawProgramHash_;
        mockedFacts = mockedFacts_;
    }

    function verifyDepositProof(
        uint256 amount,
        uint256 assetId,
        uint256 commitment,
        bytes calldata proof
    ) external view returns (bool) {
        uint256[] memory outputs = abi.decode(proof, (uint256[]));

        if (outputs.length != 5) {
            return false;
        }

        if (
            outputs[0] != 4 ||
            outputs[1] != DEPOSIT_OUTPUT_KIND ||
            outputs[2] != amount ||
            outputs[3] != assetId ||
            outputs[4] != commitment
        ) {
            return false;
        }

        return _isFactValid(depositProgramHash, outputs);
    }

    function verifyTransferProof(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata proof
    ) external view returns (bool) {
        uint256[] memory outputs = abi.decode(proof, (uint256[]));

        if (outputs.length != outputCommitments.length + 5) {
            return false;
        }

        if (
            outputs[0] != outputCommitments.length + 4 ||
            outputs[1] != TRANSFER_OUTPUT_KIND ||
            outputs[2] != root ||
            outputs[3] != inputNullifier ||
            outputs[4] != outputCommitments.length
        ) {
            return false;
        }

        for (uint256 i = 0; i < outputCommitments.length; ) {
            if (outputs[i + 5] != outputCommitments[i]) {
                return false;
            }

            unchecked {
                ++i;
            }
        }

        return _isFactValid(transferProgramHash, outputs);
    }

    function verifyWithdrawProof(
        uint256 root,
        uint256 inputNullifier,
        address recipient,
        uint256 amount,
        bytes calldata proof
    ) external view returns (bool) {
        uint256[] memory outputs = abi.decode(proof, (uint256[]));

        if (outputs.length != 6) {
            return false;
        }

        if (
            outputs[0] != 5 ||
            outputs[1] != WITHDRAW_OUTPUT_KIND ||
            outputs[2] != root ||
            outputs[3] != inputNullifier ||
            outputs[4] != uint256(uint160(recipient)) ||
            outputs[5] != amount
        ) {
            return false;
        }

        return _isFactValid(withdrawProgramHash, outputs);
    }

    function outputHash(uint256[] memory outputs) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(outputs));
    }

    function factHashFor(bytes32 programHash, uint256[] memory outputs) public pure returns (bytes32) {
        return keccak256(abi.encode(programHash, outputHash(outputs)));
    }

    function _isFactValid(bytes32 programHash, uint256[] memory outputs) private view returns (bool) {
        return factRegistry.isCairoFactValid(factHashFor(programHash, outputs), mockedFacts);
    }
}
