// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import {ProvekitGroth16Verifier as WithdrawGroth16Verifier} from "circuits/withdraw/Verifier.sol";
import "./utils/PublicInputsParser.sol";

contract WithdrawVerifierTest is Test {
    WithdrawGroth16Verifier verifier;

    function setUp() public {
        verifier = new WithdrawGroth16Verifier();
    }

    function test_deploys() public view {
        assertTrue(address(verifier) != address(0));
    }

    function test_verifyProof() public view {
        string memory proofHex = vm.readFile("../circuits/withdraw/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);

        string memory inputsRaw = vm.readFile("../circuits/withdraw/evm/inputs.txt");
        uint256[2] memory inputs = abi.decode(
            PublicInputsParser.parsePublicInputsAndEncode(inputsRaw, 2),
            (uint256[2])
        );

        verifier.verifyProof(proofBytes, inputs);
    }

    function test_invalidProofReverts() public {
        string memory proofHex = vm.readFile("../circuits/withdraw/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);
        proofBytes[0] = bytes1(uint8(proofBytes[0]) ^ 1);

        string memory inputsRaw = vm.readFile("../circuits/withdraw/evm/inputs.txt");
        uint256[2] memory inputs = abi.decode(
            PublicInputsParser.parsePublicInputsAndEncode(inputsRaw, 2),
            (uint256[2])
        );

        vm.expectRevert();
        verifier.verifyProof(proofBytes, inputs);
    }
}
