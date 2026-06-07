// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "circuits/transfer/Verifier.sol";
import "./utils/PublicInputsParser.sol";

contract TransferVerifierTest is Test {
    ProvekitGroth16Verifier verifier;

    function setUp() public {
        verifier = new ProvekitGroth16Verifier();
    }

    function test_deploys() public view {
        assertTrue(address(verifier) != address(0));
    }

    function test_verifyProof() public view {
        string memory proofHex = vm.readFile("../circuits/transfer/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);

        string memory inputsRaw = vm.readFile("../circuits/transfer/evm/inputs.txt");
        uint256[4] memory inputs = abi.decode(
            PublicInputsParser.parsePublicInputsAndEncode(inputsRaw, 4),
            (uint256[4])
        );

        verifier.verifyProof(proofBytes, inputs);
    }
}
