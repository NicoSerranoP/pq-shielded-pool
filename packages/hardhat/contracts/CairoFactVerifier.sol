// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ICairoFactRegistry } from "./interfaces/ICairoFactRegistry.sol";

/// @notice Adapter for checking Atlantic/SHARP Cairo facts from Solidity.
/// @dev The fact hash follows Herodotus' documented Cairo fact formula. `outputs` must be the full Atlantic metadata output array.
contract CairoFactVerifier {
    ICairoFactRegistry public immutable factRegistry;
    bytes32 public immutable programHash;
    bool public immutable mockedFacts;

    error CairoFactNotVerified(bytes32 factHash, bool mockedFacts);
    error InvalidFactRegistry();

    constructor(address factRegistry_, bytes32 programHash_, bool mockedFacts_) {
        if (factRegistry_ == address(0)) {
            revert InvalidFactRegistry();
        }

        factRegistry = ICairoFactRegistry(factRegistry_);
        programHash = programHash_;
        mockedFacts = mockedFacts_;
    }

    function outputHash(uint256[] calldata outputs) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(outputs));
    }

    function factHash(uint256[] calldata outputs) public view returns (bytes32) {
        return factHashFor(programHash, outputs);
    }

    function factHashFor(bytes32 programHash_, uint256[] calldata outputs) public pure returns (bytes32) {
        return keccak256(abi.encode(programHash_, outputHash(outputs)));
    }

    function isOutputVerified(uint256[] calldata outputs) external view returns (bool) {
        return factRegistry.isCairoFactValid(factHash(outputs), mockedFacts);
    }

    function requireValidFact(uint256[] calldata outputs) external view returns (bytes32 verifiedFactHash) {
        verifiedFactHash = factHash(outputs);

        if (!factRegistry.isCairoFactValid(verifiedFactHash, mockedFacts)) {
            revert CairoFactNotVerified(verifiedFactHash, mockedFacts);
        }
    }
}
