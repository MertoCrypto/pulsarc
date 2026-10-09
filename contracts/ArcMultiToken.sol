// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @notice Simple ERC-1155 used by the Pulsarc Deploy page.
/// `amount` copies of token id `tokenId` are minted to the deployer. No owner, no further minting.
contract ArcMultiToken is ERC1155 {
    constructor(string memory uri_, uint256 tokenId, uint256 amount) ERC1155(uri_) {
        require(amount > 0, "amount 0");
        _mint(msg.sender, tokenId, amount, "");
    }
}
