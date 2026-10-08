// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Simple ERC-721 collection used by the Arclytics Deploy page.
/// `quantity` NFTs (ids 1..quantity) are minted to the deployer. No owner, no further minting.
contract ArcNFT is ERC721 {
    string private _base;

    constructor(string memory name_, string memory symbol_, string memory baseURI_, uint256 quantity)
        ERC721(name_, symbol_)
    {
        require(quantity > 0 && quantity <= 50, "quantity 1-50");
        _base = baseURI_;
        for (uint256 i = 1; i <= quantity; i++) {
            _mint(msg.sender, i);
        }
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }
}
