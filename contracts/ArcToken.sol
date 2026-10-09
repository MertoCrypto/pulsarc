// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain ERC-20 used by the Pulsarc Deploy page.
/// The whole supply is minted to owner_. No owner, no further mint, no pause.
/// owner_ is passed explicitly so the contract works correctly when deployed
/// through a CREATE2 factory (msg.sender would otherwise be the factory).
contract ArcToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 initialSupply, address owner_)
        ERC20(name_, symbol_)
    {
        require(owner_ != address(0), "owner zero");
        _mint(owner_, initialSupply);
    }
}
