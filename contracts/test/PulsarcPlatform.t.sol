// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../PulsarcPlatform.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// ---------------------------------------------------------------------------
// Mock ERC-20: transferFrom returns true
// ---------------------------------------------------------------------------
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MockERC20: balance");
        require(allowance[from][msg.sender] >= amount, "MockERC20: allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// ---------------------------------------------------------------------------
// Mock ERC-20: transferFrom returns false (no revert)
// ---------------------------------------------------------------------------
contract MockERC20ReturnFalse {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address, uint256) external returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// ERC-721 receiver that properly implements onERC721Received
// ---------------------------------------------------------------------------
contract GoodReceiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

// ---------------------------------------------------------------------------
// Contract that does NOT implement onERC721Received (will revert on safeMint)
// ---------------------------------------------------------------------------
contract BadReceiver {}

// ===========================================================================
// ArcVoting Tests
// ===========================================================================
contract ArcVotingTest is Test {
    ArcVoting voting;
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        // Warp past zero so that the cooldown check (timestamp >= lastVote + 1 days)
        // is not tripped by the zero-initialised lastVoteTime for a first-time voter.
        vm.warp(2 days);
        voting = new ArcVoting();
    }

    function test_firstVoteStoresTimestampAndCount() public {
        uint256 t = block.timestamp;
        vm.prank(alice);
        voting.vote("dapp1");

        assertEq(voting.getVoteCount("dapp1"), 1);
        assertEq(voting.getLastVoteTime(alice, "dapp1"), t);
    }

    function test_firstVoteEmitsVoted() public {
        // dappId is indexed string → topic is keccak256(bytes("dapp1"))
        vm.expectEmit(true, true, false, true);
        emit ArcVoting.Voted(alice, "dapp1", block.timestamp);
        vm.prank(alice);
        voting.vote("dapp1");
    }

    function test_emptyDappIdReverts() public {
        vm.prank(alice);
        vm.expectRevert("ArcVoting: empty dappId");
        voting.vote("");
    }

    function test_secondVoteWithin24hReverts() public {
        vm.prank(alice);
        voting.vote("dapp1");

        vm.prank(alice);
        vm.expectRevert("ArcVoting: cooldown active");
        voting.vote("dapp1");
    }

    function test_voteExactlyAt1DaySucceeds() public {
        vm.prank(alice);
        voting.vote("dapp1");

        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        voting.vote("dapp1");
        assertEq(voting.getVoteCount("dapp1"), 2);
    }

    function test_vote1SecondBeforeReverts() public {
        uint256 start = block.timestamp;
        vm.prank(alice);
        voting.vote("dapp1");

        vm.warp(start + 1 days - 1);

        vm.prank(alice);
        vm.expectRevert("ArcVoting: cooldown active");
        voting.vote("dapp1");
    }

    function test_cooldownIsPerVoterDapp_differentDapp() public {
        vm.prank(alice);
        voting.vote("dapp1");

        // alice can immediately vote a different dapp
        vm.prank(alice);
        voting.vote("dapp2");
        assertEq(voting.getVoteCount("dapp2"), 1);
    }

    function test_cooldownIsPerVoterDapp_differentVoter() public {
        vm.prank(alice);
        voting.vote("dapp1");

        // bob can vote the same dapp immediately
        vm.prank(bob);
        voting.vote("dapp1");
        assertEq(voting.getVoteCount("dapp1"), 2);
    }

    function test_countsAccumulateAcrossVoters() public {
        vm.prank(alice);
        voting.vote("dapp1");
        vm.prank(bob);
        voting.vote("dapp1");
        assertEq(voting.getVoteCount("dapp1"), 2);
    }

    function test_canVoteTrueForNeverVoted() public view {
        assertTrue(voting.canVote(alice, "dapp1"));
    }

    function test_canVoteFalseRightAfterVoting() public {
        vm.prank(alice);
        voting.vote("dapp1");
        assertFalse(voting.canVote(alice, "dapp1"));
    }

    function test_canVoteTrueAtPlus1Day() public {
        vm.prank(alice);
        voting.vote("dapp1");
        vm.warp(block.timestamp + 1 days);
        assertTrue(voting.canVote(alice, "dapp1"));
    }

    function test_getLastVoteTimeReturnsTimestamp() public {
        uint256 t = block.timestamp;
        vm.prank(alice);
        voting.vote("dapp1");
        assertEq(voting.getLastVoteTime(alice, "dapp1"), t);
    }

    function test_getVoteCountUnknownDappIsZero() public view {
        assertEq(voting.getVoteCount("unknown"), 0);
    }
}

// ===========================================================================
// ArcAttestation Tests
// ===========================================================================
contract ArcAttestationTest is Test {
    ArcAttestation attestation;
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        attestation = new ArcAttestation();
    }

    function test_attestOnce_countAndHasAttested() public {
        vm.prank(alice);
        attestation.attest("dapp1");

        assertEq(attestation.getAttestationCount("dapp1"), 1);
        assertTrue(attestation.hasAttested(alice, "dapp1"));
    }

    function test_attestEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ArcAttestation.Attested(alice, "dapp1", block.timestamp);
        vm.prank(alice);
        attestation.attest("dapp1");
    }

    function test_secondAttestSameDappReverts() public {
        vm.prank(alice);
        attestation.attest("dapp1");

        vm.prank(alice);
        vm.expectRevert("ArcAttestation: already attested");
        attestation.attest("dapp1");
    }

    function test_secondAttestAfterYearStillReverts() public {
        vm.prank(alice);
        attestation.attest("dapp1");

        vm.warp(block.timestamp + 365 days);

        vm.prank(alice);
        vm.expectRevert("ArcAttestation: already attested");
        attestation.attest("dapp1");
    }

    function test_sameUserOtherDappOk() public {
        vm.prank(alice);
        attestation.attest("dapp1");

        vm.prank(alice);
        attestation.attest("dapp2");
        assertEq(attestation.getAttestationCount("dapp2"), 1);
    }

    function test_otherUserSameDappOk() public {
        vm.prank(alice);
        attestation.attest("dapp1");

        vm.prank(bob);
        attestation.attest("dapp1");
        assertEq(attestation.getAttestationCount("dapp1"), 2);
    }

    function test_emptyDappIdReverts() public {
        vm.prank(alice);
        vm.expectRevert("ArcAttestation: empty dappId");
        attestation.attest("");
    }

    function test_countsPerDapp() public {
        vm.prank(alice);
        attestation.attest("dapp1");
        vm.prank(bob);
        attestation.attest("dapp1");
        vm.prank(alice);
        attestation.attest("dapp2");

        assertEq(attestation.getAttestationCount("dapp1"), 2);
        assertEq(attestation.getAttestationCount("dapp2"), 1);
    }
}

// ===========================================================================
// ArcBoost Tests
// ===========================================================================
contract ArcBoostTest is Test {
    ArcBoost boost;
    MockERC20 usdc;
    MockERC20ReturnFalse badUsdc;

    address deployer  = address(this);
    address treasury  = address(0x111);
    address treasury2 = address(0x222);
    address booster   = address(0xBEEF);
    address newOwner  = address(0xDAD);

    function setUp() public {
        usdc = new MockERC20();
        badUsdc = new MockERC20ReturnFalse();
        // deploy as address(this) so we are the owner
        boost = new ArcBoost(treasury, address(usdc));

        usdc.mint(booster, 1_000_000);
        vm.prank(booster);
        usdc.approve(address(boost), type(uint256).max);
    }

    // --- constructor ---

    function test_constructorSetsFields() public view {
        assertEq(boost.owner(), deployer);
        assertEq(boost.treasury(), treasury);
        assertEq(address(boost.usdcToken()), address(usdc));
    }

    function test_constructorEmitsOwnershipTransferred() public {
        // verify event during construction
        vm.expectEmit(true, true, false, false);
        emit ArcBoost.OwnershipTransferred(address(0), address(this));
        new ArcBoost(treasury, address(usdc));
    }

    function test_zeroTreasuryReverts() public {
        vm.expectRevert("ArcBoost: treasury is zero address");
        new ArcBoost(address(0), address(usdc));
    }

    function test_zeroUsdcReverts() public {
        vm.expectRevert("ArcBoost: usdc is zero address");
        new ArcBoost(treasury, address(0));
    }

    // --- boost ---

    function test_boostBelowMinReverts() public {
        vm.prank(booster);
        vm.expectRevert("ArcBoost: amount below minimum");
        boost.boost("dapp1", 9_999);
    }

    function test_boostExactlyMinSucceeds() public {
        vm.prank(booster);
        boost.boost("dapp1", 10_000);
        assertEq(boost.getTotalBoost("dapp1"), 10_000);
        assertEq(boost.getBoostCount("dapp1"), 1);
    }

    function test_emptyDappIdReverts() public {
        vm.prank(booster);
        vm.expectRevert("ArcBoost: empty dappId");
        boost.boost("", 10_000);
    }

    function test_boostMovesTokensToTreasury() public {
        uint256 amount = 50_000;
        uint256 prevTreasury = usdc.balanceOf(treasury);
        uint256 prevBooster  = usdc.balanceOf(booster);

        vm.prank(booster);
        boost.boost("dapp1", amount);

        assertEq(usdc.balanceOf(treasury), prevTreasury + amount);
        assertEq(usdc.balanceOf(booster),  prevBooster  - amount);
        // tokens do NOT accumulate in the contract
        assertEq(usdc.balanceOf(address(boost)), 0);
    }

    function test_boostUpdatesTotalsAndCounts() public {
        vm.prank(booster);
        boost.boost("dapp1", 10_000);
        vm.prank(booster);
        boost.boost("dapp1", 20_000);

        assertEq(boost.getTotalBoost("dapp1"), 30_000);
        assertEq(boost.getBoostCount("dapp1"), 2);
    }

    function test_boostEmitsBoosted() public {
        vm.expectEmit(true, true, false, true);
        emit ArcBoost.Boosted(booster, "dapp1", 10_000, block.timestamp);
        vm.prank(booster);
        boost.boost("dapp1", 10_000);
    }

    function test_boostWithoutAllowanceReverts() public {
        address noAllowance = address(0xCAFE);
        usdc.mint(noAllowance, 100_000);
        // no approval → MockERC20 will revert "MockERC20: allowance"
        vm.prank(noAllowance);
        vm.expectRevert("MockERC20: allowance");
        boost.boost("dapp1", 10_000);
    }

    function test_boostWithoutBalanceReverts() public {
        address noBalance = address(0xFACE);
        vm.prank(noBalance);
        usdc.approve(address(boost), type(uint256).max);
        // MockERC20 will revert "MockERC20: balance"
        vm.prank(noBalance);
        vm.expectRevert("MockERC20: balance");
        boost.boost("dapp1", 10_000);
    }

    function test_transferFromReturnsFalseReverts() public {
        // deploy a separate boost contract wired to the returning-false mock
        ArcBoost badBoost = new ArcBoost(treasury, address(badUsdc));
        badUsdc.mint(booster, 1_000_000);

        vm.prank(booster);
        vm.expectRevert("ArcBoost: transfer failed");
        badBoost.boost("dapp1", 10_000);

        // totals must be unchanged
        assertEq(badBoost.getTotalBoost("dapp1"), 0);
        assertEq(badBoost.getBoostCount("dapp1"), 0);
    }

    // --- transferOwnership ---

    function test_transferOwnershipOnlyOwner() public {
        vm.prank(booster);
        vm.expectRevert("ArcBoost: caller is not owner");
        boost.transferOwnership(newOwner);
    }

    function test_transferOwnershipZeroReverts() public {
        vm.expectRevert("ArcBoost: new owner is zero address");
        boost.transferOwnership(address(0));
    }

    function test_transferOwnershipEmitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit ArcBoost.OwnershipTransferred(deployer, newOwner);
        boost.transferOwnership(newOwner);
    }

    function test_transferOwnershipOneStep() public {
        boost.transferOwnership(newOwner);
        assertEq(boost.owner(), newOwner);

        // old owner loses rights
        vm.expectRevert("ArcBoost: caller is not owner");
        boost.updateTreasury(treasury2);
    }

    // --- updateTreasury ---

    function test_updateTreasuryOnlyOwner() public {
        vm.prank(booster);
        vm.expectRevert("ArcBoost: caller is not owner");
        boost.updateTreasury(treasury2);
    }

    function test_updateTreasuryZeroReverts() public {
        vm.expectRevert("ArcBoost: treasury is zero address");
        boost.updateTreasury(address(0));
    }

    function test_updateTreasuryEmitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit ArcBoost.TreasuryUpdated(treasury, treasury2);
        boost.updateTreasury(treasury2);
    }

    function test_laterBoostsGoToNewTreasury() public {
        boost.updateTreasury(treasury2);

        vm.prank(booster);
        boost.boost("dapp1", 10_000);

        assertEq(usdc.balanceOf(treasury2), 10_000);
        assertEq(usdc.balanceOf(treasury),  0);
    }

    // --- fuzz ---

    function testFuzz_boostAmountsAccumulate(uint256 a1, uint256 a2, uint256 a3) public {
        a1 = bound(a1, 10_000, 200_000);
        a2 = bound(a2, 10_000, 200_000);
        a3 = bound(a3, 10_000, 200_000);
        uint256 total = a1 + a2 + a3;

        usdc.mint(booster, total); // ensure enough balance (setUp gave 1M already)
        vm.startPrank(booster);
        boost.boost("fuzz", a1);
        boost.boost("fuzz", a2);
        boost.boost("fuzz", a3);
        vm.stopPrank();

        assertEq(boost.getTotalBoost("fuzz"), total);
        assertEq(boost.getBoostCount("fuzz"), 3);
        assertEq(usdc.balanceOf(treasury), total);
    }
}

// ===========================================================================
// ArcWatchlistNFT Tests
// ===========================================================================
contract ArcWatchlistNFTTest is Test {
    using Strings for uint256;

    ArcWatchlistNFT nft;
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    string constant NAME   = "Pulsarc Watchlist";
    string constant SYMBOL = "PULSAR";

    function setUp() public {
        nft = new ArcWatchlistNFT(NAME, SYMBOL);
    }

    // --- minting ---

    function test_mintSequentialIds() public {
        vm.prank(alice);
        uint256 id1 = nft.mintWatchlist("dapp1");
        vm.prank(alice);
        uint256 id2 = nft.mintWatchlist("dapp2");

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_mintOwnerIsMsgSender() public {
        vm.prank(alice);
        uint256 id = nft.mintWatchlist("dapp1");
        assertEq(nft.ownerOf(id), alice);
    }

    function test_hasWatchlistedTrue() public {
        vm.prank(alice);
        nft.mintWatchlist("dapp1");
        assertTrue(nft.hasWatchlisted(alice, "dapp1"));
    }

    function test_duplicateReverts() public {
        vm.prank(alice);
        nft.mintWatchlist("dapp1");

        vm.prank(alice);
        vm.expectRevert("ArcWatchlistNFT: already minted");
        nft.mintWatchlist("dapp1");
    }

    function test_sameDappOtherUserOk() public {
        vm.prank(alice);
        nft.mintWatchlist("dapp1");

        vm.prank(bob);
        uint256 id = nft.mintWatchlist("dapp1");
        assertEq(nft.ownerOf(id), bob);
    }

    function test_sameUserOtherDappOk() public {
        vm.prank(alice);
        nft.mintWatchlist("dapp1");

        vm.prank(alice);
        uint256 id = nft.mintWatchlist("dapp2");
        assertEq(nft.ownerOf(id), alice);
    }

    function test_emptyDappIdReverts() public {
        vm.prank(alice);
        vm.expectRevert("ArcWatchlistNFT: empty dappId");
        nft.mintWatchlist("");
    }

    // --- getTokensOfOwner ---

    function test_getTokensOfOwner() public {
        vm.prank(alice);
        uint256 id1 = nft.mintWatchlist("dapp1");
        vm.prank(alice);
        uint256 id2 = nft.mintWatchlist("dapp2");

        uint256[] memory tokens = nft.getTokensOfOwner(alice);
        assertEq(tokens.length, 2);
        assertEq(tokens[0], id1);
        assertEq(tokens[1], id2);
    }

    function test_getTokensOfOwnerAfterTransfer() public {
        vm.startPrank(alice);
        uint256 id1 = nft.mintWatchlist("dapp1");
        uint256 id2 = nft.mintWatchlist("dapp2");
        // transfer id1 to bob
        nft.transferFrom(alice, bob, id1);
        vm.stopPrank();

        uint256[] memory aliceTokens = nft.getTokensOfOwner(alice);
        assertEq(aliceTokens.length, 1);
        assertEq(aliceTokens[0], id2);

        uint256[] memory bobTokens = nft.getTokensOfOwner(bob);
        assertEq(bobTokens.length, 1);
        assertEq(bobTokens[0], id1);
    }

    // --- getDappIdForToken ---

    function test_getDappIdForMintedToken() public {
        vm.prank(alice);
        uint256 id = nft.mintWatchlist("dapp42");
        assertEq(nft.getDappIdForToken(id), "dapp42");
    }

    function test_getDappIdForToken0Reverts() public {
        vm.expectRevert("ArcWatchlistNFT: token does not exist");
        nft.getDappIdForToken(0);
    }

    function test_getDappIdForUnmintedReverts() public {
        vm.expectRevert("ArcWatchlistNFT: token does not exist");
        nft.getDappIdForToken(999);
    }

    // --- tokenURI ---

    function test_tokenURIStartsWithDataPrefix() public {
        vm.prank(alice);
        uint256 id = nft.mintWatchlist("dapp1");
        string memory uri = nft.tokenURI(id);
        assertTrue(_startsWith(uri, "data:application/json;base64,"), "URI prefix mismatch");
    }

    function test_tokenURIDecodesCorrectly() public {
        uint256 t = block.timestamp;
        vm.prank(alice);
        uint256 id = nft.mintWatchlist("dapp1");

        string memory expectedJson = string.concat(
            "{",
            '"name":"', NAME, " - ", "dapp1", '",',
            '"description":"Pulsarc watchlist NFT for dapp ', "dapp1", '",',
            '"dappId":"', "dapp1", '",',
            '"mintedAt":"', t.toString(), '",',
            '"minterAddress":"', Strings.toHexString(uint256(uint160(alice)), 20), '"',
            "}"
        );

        string memory expected = string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(expectedJson))
        );

        assertEq(nft.tokenURI(id), expected);
    }

    function test_tokenURIForUnmintedReverts() public {
        vm.expectRevert("ArcWatchlistNFT: token does not exist");
        nft.tokenURI(999);
    }

    // --- safe mint receiver checks ---

    function test_mintToEOAWorks() public {
        // alice is an EOA — safeMint should succeed
        vm.prank(alice);
        uint256 id = nft.mintWatchlist("dapp1");
        assertEq(nft.ownerOf(id), alice);
    }

    function test_mintToGoodReceiverWorks() public {
        GoodReceiver receiver = new GoodReceiver();
        vm.prank(address(receiver));
        uint256 id = nft.mintWatchlist("dapp1");
        assertEq(nft.ownerOf(id), address(receiver));
    }

    function test_mintToBadReceiverReverts() public {
        BadReceiver bad = new BadReceiver();
        vm.prank(address(bad));
        vm.expectRevert();
        nft.mintWatchlist("dapp1");
    }

    // ---------------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------------

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory s = bytes(str);
        bytes memory p = bytes(prefix);
        if (s.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (s[i] != p[i]) return false;
        }
        return true;
    }
}
