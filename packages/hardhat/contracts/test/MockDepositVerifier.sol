// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IDepositVerifier } from "../ShieldedPool.sol";

contract MockDepositVerifier is IDepositVerifier {
    bool public shouldAccept = true;

    function setShouldAccept(bool shouldAccept_) external {
        shouldAccept = shouldAccept_;
    }

    function verifyDepositProof(
        uint256 amount,
        uint256 assetId,
        uint256 commitment,
        bytes calldata proof
    ) external view returns (bool) {
        return shouldAccept && amount != 0 && assetId != 0 && commitment != 0 && proof.length != 0;
    }
}
