// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "circuits/Verifier.sol";

contract VerifierTest is Test {
    ProvekitGroth16Verifier verifier;

    function setUp() public {
        verifier = new ProvekitGroth16Verifier();
    }

    function trimRight(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 end = b.length;
        while (end > 0 && (b[end - 1] == 0x0a || b[end - 1] == 0x0d || b[end - 1] == 0x20)) {
            end--;
        }
        bytes memory trimmed = new bytes(end);
        for (uint256 i = 0; i < end; i++) {
            trimmed[i] = b[i];
        }
        return string(trimmed);
    }

    function test_deploys() public view {
        assertTrue(address(verifier) != address(0));
    }

    function test_verifyProof() public view {
        string memory proofHex = vm.readFile("../circuits/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);

        string memory inputsRaw = vm.readFile("../circuits/evm/inputs.txt");
        uint256 pubInput = vm.parseUint(trimRight(inputsRaw));

        uint256[1] memory inputs;
        inputs[0] = pubInput;

        verifier.verifyProof(proofBytes, inputs);
    }
}
