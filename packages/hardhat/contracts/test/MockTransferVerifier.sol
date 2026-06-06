// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ITransferVerifier } from "../ShieldedPool.sol";

contract MockTransferVerifier is ITransferVerifier {
    bool public shouldAccept = true;

    function setShouldAccept(bool shouldAccept_) external {
        shouldAccept = shouldAccept_;
    }

    function verifyTransferProof(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata proof
    ) external view returns (bool) {
        return shouldAccept && root != 0 && inputNullifier != 0 && outputCommitments.length != 0 && proof.length != 0;
    }
}
