// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IDepositVerifier } from "./ShieldedPool.sol";

interface IGroth16DepositVerifier {
    function verifyProof(bytes calldata proof, uint256[1] calldata input) external view;
}

contract DepositVerifierWrapper is IDepositVerifier {
    IGroth16DepositVerifier public immutable groth16Verifier;

    constructor(address groth16Verifier_) {
        groth16Verifier = IGroth16DepositVerifier(groth16Verifier_);
    }

    function verifyDepositProof(
        uint256,
        uint256,
        uint256 commitment,
        bytes calldata proof
    ) external view returns (bool) {
        uint256[1] memory inputs;
        inputs[0] = commitment;
        try groth16Verifier.verifyProof(proof, inputs) {
            return true;
        } catch {
            return false;
        }
    }
}
