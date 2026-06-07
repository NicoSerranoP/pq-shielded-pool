// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IWithdrawVerifier } from "../ShieldedPool.sol";

contract MockWithdrawVerifier is IWithdrawVerifier {
    bool public shouldAccept = true;

    function setShouldAccept(bool shouldAccept_) external {
        shouldAccept = shouldAccept_;
    }

    function verifyWithdrawProof(
        uint256 root,
        uint256 inputNullifier,
        address recipient,
        uint256 amount,
        bytes calldata proof
    ) external view returns (bool) {
        return shouldAccept && root != 0 && inputNullifier != 0 && recipient != address(0) && amount != 0 && proof.length != 0;
    }
}
