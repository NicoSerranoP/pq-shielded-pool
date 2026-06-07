// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ICairoFactRegistry } from "../interfaces/ICairoFactRegistry.sol";

contract MockCairoFactRegistry is ICairoFactRegistry {
    mapping(bytes32 factHash => mapping(bool isMocked => bool valid)) private _facts;

    function setCairoFact(bytes32 factHash, bool isMocked, bool valid) external {
        _facts[factHash][isMocked] = valid;
    }

    function isCairoFactValid(bytes32 factHash, bool isMocked) external view returns (bool) {
        return _facts[factHash][isMocked];
    }
}
