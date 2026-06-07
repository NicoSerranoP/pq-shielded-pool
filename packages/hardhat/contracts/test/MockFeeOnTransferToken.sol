// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferToken is ERC20 {
    uint256 private constant FEE = 1;

    constructor() ERC20("MockFeeOnTransferToken", "MFOT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > FEE) {
            super._update(from, to, value - FEE);
            super._update(from, address(0), FEE);
            return;
        }

        super._update(from, to, value);
    }
}
