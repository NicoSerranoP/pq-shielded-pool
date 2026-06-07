// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IWithdrawVerifier } from "../ShieldedPool.sol";

contract MockWithdrawVerifier is IWithdrawVerifier {
    bool public shouldAccept = true;

    error MockProofInvalid();

    function setShouldAccept(bool shouldAccept_) external {
        shouldAccept = shouldAccept_;
    }

    function verifyProof(bytes calldata proof, uint256[2] calldata publicInputs) external view {
        if (!shouldAccept || proof.length == 0 || publicInputs[0] == 0 || publicInputs[1] == 0) {
            revert MockProofInvalid();
        }
    }
}
