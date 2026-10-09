// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract ArcVoting {
    uint256 private constant VOTE_COOLDOWN = 1 days;

    mapping(string dappId => uint256 count) private _voteCounts;
    mapping(address voter => mapping(string dappId => uint256 timestamp)) private _lastVoteTime;

    event Voted(address indexed voter, string indexed dappId, uint256 timestamp);

    function vote(string calldata dappId) external {
        require(bytes(dappId).length > 0, "ArcVoting: empty dappId");
        require(canVote(msg.sender, dappId), "ArcVoting: cooldown active");

        uint256 currentTime = block.timestamp;
        _lastVoteTime[msg.sender][dappId] = currentTime;
        _voteCounts[dappId] += 1;

        emit Voted(msg.sender, dappId, currentTime);
    }

    function getVoteCount(string calldata dappId) external view returns (uint256) {
        return _voteCounts[dappId];
    }

    function getLastVoteTime(address voter, string calldata dappId) external view returns (uint256) {
        return _lastVoteTime[voter][dappId];
    }

    function canVote(address voter, string calldata dappId) public view returns (bool) {
        uint256 lastVote = _lastVoteTime[voter][dappId];
        return block.timestamp >= lastVote + VOTE_COOLDOWN;
    }
}

contract ArcAttestation {
    mapping(string dappId => uint256 count) private _attestationCounts;
    mapping(address user => mapping(string dappId => bool value)) private _hasAttested;

    event Attested(address indexed user, string indexed dappId, uint256 timestamp);

    function attest(string calldata dappId) external {
        require(bytes(dappId).length > 0, "ArcAttestation: empty dappId");
        require(!_hasAttested[msg.sender][dappId], "ArcAttestation: already attested");

        _hasAttested[msg.sender][dappId] = true;
        _attestationCounts[dappId] += 1;

        emit Attested(msg.sender, dappId, block.timestamp);
    }

    function getAttestationCount(string calldata dappId) external view returns (uint256) {
        return _attestationCounts[dappId];
    }

    function hasAttested(address user, string calldata dappId) external view returns (bool) {
        return _hasAttested[user][dappId];
    }
}

contract ArcBoost {
    uint256 public constant MIN_BOOST = 10_000; // 0.01 USDC with 6 decimals

    address public owner;
    address public treasury;
    IERC20 public immutable usdcToken;

    mapping(string dappId => uint256 amount) private _totalBoost;
    mapping(string dappId => uint256 count) private _boostCount;

    event Boosted(address indexed booster, string indexed dappId, uint256 amount, uint256 timestamp);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "ArcBoost: caller is not owner");
        _;
    }

    constructor(address treasury_, address usdcToken_) {
        require(treasury_ != address(0), "ArcBoost: treasury is zero address");
        require(usdcToken_ != address(0), "ArcBoost: usdc is zero address");

        owner = msg.sender;
        treasury = treasury_;
        usdcToken = IERC20(usdcToken_);

        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ArcBoost: new owner is zero address");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "ArcBoost: treasury is zero address");

        address previousTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    function boost(string calldata dappId, uint256 amount) external {
        require(bytes(dappId).length > 0, "ArcBoost: empty dappId");
        require(amount >= MIN_BOOST, "ArcBoost: amount below minimum");

        bool success = usdcToken.transferFrom(msg.sender, treasury, amount);
        require(success, "ArcBoost: transfer failed");

        _totalBoost[dappId] += amount;
        _boostCount[dappId] += 1;

        emit Boosted(msg.sender, dappId, amount, block.timestamp);
    }

    function getTotalBoost(string calldata dappId) external view returns (uint256) {
        return _totalBoost[dappId];
    }

    function getBoostCount(string calldata dappId) external view returns (uint256) {
        return _boostCount[dappId];
    }
}

contract ArcWatchlistNFT is ERC721 {
    using Strings for uint256;

    uint256 private _nextTokenId = 1;

    mapping(address user => mapping(string dappId => bool value)) private _watchlisted;
    mapping(uint256 tokenId => string dappId) private _dappIdForToken;
    mapping(uint256 tokenId => uint256 timestamp) private _mintedAt;
    mapping(uint256 tokenId => address minter) private _minterAddress;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mintWatchlist(string calldata dappId) external returns (uint256 tokenId) {
        require(bytes(dappId).length > 0, "ArcWatchlistNFT: empty dappId");
        require(!_watchlisted[msg.sender][dappId], "ArcWatchlistNFT: already minted");

        tokenId = _nextTokenId;
        _nextTokenId += 1;

        _watchlisted[msg.sender][dappId] = true;
        _dappIdForToken[tokenId] = dappId;
        _mintedAt[tokenId] = block.timestamp;
        _minterAddress[tokenId] = msg.sender;

        _safeMint(msg.sender, tokenId);
    }

    function hasWatchlisted(address user, string calldata dappId) external view returns (bool) {
        return _watchlisted[user][dappId];
    }

    function getTokensOfOwner(address owner_) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner_);
        uint256[] memory ownedTokens = new uint256[](balance);

        uint256 index;
        for (uint256 tokenId = 1; tokenId < _nextTokenId; tokenId++) {
            if (_ownerOf(tokenId) == owner_) {
                ownedTokens[index] = tokenId;
                index += 1;
                if (index == balance) {
                    break;
                }
            }
        }

        return ownedTokens;
    }

    function getDappIdForToken(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ArcWatchlistNFT: token does not exist");
        return _dappIdForToken[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ArcWatchlistNFT: token does not exist");

        string memory dappId = _dappIdForToken[tokenId];
        uint256 mintedAt = _mintedAt[tokenId];
        address minter = _minterAddress[tokenId];

        string memory json = string.concat(
            "{",
            '"name":"', name(), " - ", dappId, '",',
            '"description":"Pulsarc watchlist NFT for dapp ', dappId, '",',
            '"dappId":"', dappId, '",',
            '"mintedAt":"', mintedAt.toString(), '",',
            '"minterAddress":"', Strings.toHexString(uint256(uint160(minter)), 20), '"',
            "}"
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
