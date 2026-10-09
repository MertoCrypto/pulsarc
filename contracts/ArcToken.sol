// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain ERC-20 used by the Pulsarc Deploy page.
/// The whole supply is minted to the deployer. No owner, no mint, no pause.
contract ArcToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 initialSupply)
        ERC20(name_, symbol_)
    {
        _mint(msg.sender, initialSupply);
    }
}
