// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IWithdrawVerifier } from "./ShieldedPool.sol";

interface IGroth16WithdrawVerifier {
    function verifyProof(bytes calldata proof, uint256[2] calldata input) external view;
}

contract WithdrawVerifierWrapper is IWithdrawVerifier {
    IGroth16WithdrawVerifier public immutable groth16Verifier;

    constructor(address groth16Verifier_) {
        groth16Verifier = IGroth16WithdrawVerifier(groth16Verifier_);
    }

    // Note: inputNullifier and recipient are not circuit public inputs — they are
    // enforced by ShieldedPool's nullifier set and address checks respectively.
    function verifyWithdrawProof(
        uint256 root,
        uint256,
        address,
        uint256 amount,
        bytes calldata proof
    ) external view returns (bool) {
        uint256[2] memory inputs;
        inputs[0] = amount;
        inputs[1] = root;
        try groth16Verifier.verifyProof(proof, inputs) {
            return true;
        } catch {
            return false;
        }
    }
}
