// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Simple ERC-721 collection used by the Pulsarc Deploy page.
/// `quantity` NFTs (ids 1..quantity) are minted to owner_. No further minting.
/// owner_ is passed explicitly so the contract works correctly when deployed
/// through a CREATE2 factory (msg.sender would otherwise be the factory).
contract ArcNFT is ERC721 {
    string private _base;

    constructor(string memory name_, string memory symbol_, string memory baseURI_, uint256 quantity, address owner_)
        ERC721(name_, symbol_)
    {
        require(quantity > 0 && quantity <= 50, "quantity 1-50");
        require(owner_ != address(0), "owner zero");
        _base = baseURI_;
        for (uint256 i = 1; i <= quantity; i++) {
            _mint(owner_, i);
        }
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }
}
