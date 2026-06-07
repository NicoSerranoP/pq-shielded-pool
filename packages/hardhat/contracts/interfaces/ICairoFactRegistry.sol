// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICairoFactRegistry {
    function isCairoFactValid(bytes32 factHash, bool isMocked) external view returns (bool);
}
