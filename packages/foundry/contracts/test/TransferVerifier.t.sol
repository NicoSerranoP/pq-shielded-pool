// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {ProvekitGroth16Verifier as TransferGroth16Verifier} from "circuits/transfer/Verifier.sol";
import "./utils/PublicInputsParser.sol";

contract TransferVerifierTest is Test {
    TransferGroth16Verifier verifier;

    function setUp() public {
        verifier = new TransferGroth16Verifier();
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

    function test_invalidProofReverts() public {
        string memory proofHex = vm.readFile("../circuits/transfer/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);
        proofBytes[0] = bytes1(uint8(proofBytes[0]) ^ 1);

        string memory inputsRaw = vm.readFile("../circuits/transfer/evm/inputs.txt");
        uint256[4] memory inputs = abi.decode(
            PublicInputsParser.parsePublicInputsAndEncode(inputsRaw, 4),
            (uint256[4])
        );

        vm.expectRevert();
        verifier.verifyProof(proofBytes, inputs);
    }
}
