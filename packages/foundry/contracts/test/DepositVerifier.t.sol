// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "circuits/deposit/Verifier.sol";
import "./utils/PublicInputsParser.sol";

contract DepositVerifierTest is Test {
    ProvekitGroth16Verifier verifier;

    function setUp() public {
        verifier = new ProvekitGroth16Verifier();
    }

    function test_deploys() public view {
        assertTrue(address(verifier) != address(0));
    }

    function test_verifyProof() public view {
        string memory proofHex = vm.readFile("../circuits/deposit/evm/proof.hex");
        bytes memory proofBytes = vm.parseBytes(proofHex);

        string memory inputsRaw = vm.readFile("../circuits/deposit/evm/inputs.txt");
        uint256[2] memory inputs = abi.decode(
            PublicInputsParser.parsePublicInputsAndEncode(inputsRaw, 2),
            (uint256[2])
        );

        verifier.verifyProof(proofBytes, inputs);
    }
}
