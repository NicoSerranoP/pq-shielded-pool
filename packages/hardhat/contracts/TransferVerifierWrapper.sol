// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ITransferVerifier } from "./ShieldedPool.sol";

interface IGroth16TransferVerifier {
    function verifyProof(bytes calldata proof, uint256[4] calldata input) external view;
}

contract TransferVerifierWrapper is ITransferVerifier {
    IGroth16TransferVerifier public immutable groth16Verifier;

    constructor(address groth16Verifier_) {
        groth16Verifier = IGroth16TransferVerifier(groth16Verifier_);
    }

    function verifyTransferProof(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata proof
    ) external view returns (bool) {
        uint256[4] memory inputs;
        inputs[0] = inputNullifier;
        inputs[1] = outputCommitments[0];
        inputs[2] = outputCommitments[1];
        inputs[3] = root;
        try groth16Verifier.verifyProof(proof, inputs) {
            return true;
        } catch {
            return false;
        }
    }
}
