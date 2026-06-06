// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ProvekitGroth16Verifier} from "@circuits/Verifier.sol";

contract DepositVerifierTest is Test {
    ProvekitGroth16Verifier verifier;

    function setUp() public {
        verifier = new ProvekitGroth16Verifier();
    }

    function _trimRight(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 end = b.length;
        while (end > 0 && (b[end - 1] == 0x0a || b[end - 1] == 0x0d || b[end - 1] == 0x20)) {
            end--;
        }
        bytes memory trimmed = new bytes(end);
        for (uint256 i = 0; i < end; i++) trimmed[i] = b[i];
        return string(trimmed);
    }

    function test_depositProofVerifies() public view {
        bytes memory proof = vm.parseBytes(vm.readFile("../circuits/evm/proof.hex"));

        uint256[1] memory inputs;
        inputs[0] = vm.parseUint(_trimRight(vm.readFile("../circuits/evm/inputs.txt")));

        verifier.verifyProof(proof, inputs);
    }

    function test_invalidProofReverts() public {
        bytes memory badProof = new bytes(384);

        uint256[1] memory inputs;
        inputs[0] = vm.parseUint(_trimRight(vm.readFile("../circuits/evm/inputs.txt")));

        vm.expectRevert();
        verifier.verifyProof(badProof, inputs);
    }
}
