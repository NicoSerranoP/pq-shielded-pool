// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "circuits/Verifier.sol";

contract VerifierTest is Test {
    ProvekitGroth16Verifier verifier;

    function setUp() public {
        verifier = new ProvekitGroth16Verifier();
    }

    function parsePublicInputs(string memory raw) internal pure returns (uint256[2] memory inputs) {
        bytes memory data = bytes(raw);
        uint256 value;
        uint256 inputCount;
        bool parsingNumber;

        for (uint256 i = 0; i < data.length; i++) {
            bytes1 ch = data[i];

            if (ch >= 0x30 && ch <= 0x39) {
                value = value * 10 + (uint8(ch) - 48);
                parsingNumber = true;
                continue;
            }

            if (ch == 0x0a || ch == 0x0d || ch == 0x20 || ch == 0x09) {
                if (parsingNumber) {
                    require(inputCount < 2, "too many public inputs");
                    inputs[inputCount] = value;
                    inputCount++;
                    value = 0;
                    parsingNumber = false;
                }
                continue;
            }

            revert("invalid input char");
        }

        if (parsingNumber) {
            require(inputCount < 2, "too many public inputs");
            inputs[inputCount] = value;
            inputCount++;
        }

        require(inputCount == 2, "expected 2 public inputs");
    }

    function test_deploys() public view {
        assertTrue(address(verifier) != address(0));
    }

    function test_verifyProof() public view {
        string memory proofHex = vm.readFile("../circuits/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);

        string memory inputsRaw = vm.readFile("../circuits/evm/inputs.txt");
        uint256[2] memory inputs = parsePublicInputs(inputsRaw);

        verifier.verifyProof(proofBytes, inputs);
    }
}
