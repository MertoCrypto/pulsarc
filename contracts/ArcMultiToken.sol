// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @notice Simple ERC-1155 used by the Pulsarc Deploy page.
/// `amount` copies of token id `tokenId` are minted to owner_. No further minting.
/// owner_ is passed explicitly so the contract works correctly when deployed
/// through a CREATE2 factory (msg.sender would otherwise be the factory).
contract ArcMultiToken is ERC1155 {
    constructor(string memory uri_, uint256 tokenId, uint256 amount, address owner_) ERC1155(uri_) {
        require(amount > 0, "amount 0");
        require(owner_ != address(0), "owner zero");
        _mint(owner_, tokenId, amount, "");
    }
}
