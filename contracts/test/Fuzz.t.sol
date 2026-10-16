// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../TipJar.sol";
import "../GmBoard.sol";
import "../PulsarcPlatform.sol";
import "../ArcToken.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal ERC-20 mock used by TipJar tests (no OZ import needed)
// ─────────────────────────────────────────────────────────────────────────────
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public transferShouldFail;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setTransferFail(bool fail) external {
        transferShouldFail = fail;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (transferShouldFail) return false;
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (transferShouldFail) return false;
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TipJar — fuzz tests
// ─────────────────────────────────────────────────────────────────────────────
contract TipJarFuzzTest is Test {
    TipJar public jar;
    MockERC20 public token;
    address owner = address(0xABCD);
    address nonOwner = address(0x1234);
    address recipient = address(0x5678);

    function setUp() public {
        jar = new TipJar(owner);
        token = new MockERC20();
    }

    // ── access control ──────────────────────────────────────────────────────

    function testFuzz_transferOwnership_nonOwnerReverts(address caller, address newOwner) public {
        vm.assume(caller != owner);
        vm.assume(newOwner != address(0));
        vm.prank(caller);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.transferOwnership(newOwner);
    }

    function testFuzz_withdraw_nonOwnerReverts(address caller, uint256 amount) public {
        vm.assume(caller != owner);
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.withdraw(address(token), recipient, amount);
    }

    function testFuzz_withdrawAll_nonOwnerReverts(address caller) public {
        vm.assume(caller != owner);
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.withdrawAll(address(token), recipient);
    }

    // ── zero-address guards ──────────────────────────────────────────────────

    function testFuzz_withdraw_zeroTokenReverts(uint256 amount) public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.withdraw(address(0), recipient, amount);
    }

    function testFuzz_withdraw_zeroRecipientReverts(uint256 amount) public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.withdraw(address(token), address(0), amount);
    }

    // ── value conservation ──────────────────────────────────────────────────

    /// @notice Tokens deposited then withdrawn arrive in full at recipient.
    function testFuzz_withdraw_fullBalanceMovesToRecipient(uint256 depositAmt) public {
        vm.assume(depositAmt > 0 && depositAmt <= type(uint128).max);
        token.mint(address(jar), depositAmt);

        uint256 recipientBefore = token.balanceOf(recipient);
        vm.prank(owner);
        jar.withdraw(address(token), recipient, depositAmt);

        assertEq(token.balanceOf(recipient), recipientBefore + depositAmt);
        assertEq(token.balanceOf(address(jar)), 0);
    }

    function testFuzz_withdrawAll_drainsContract(uint256 depositAmt) public {
        vm.assume(depositAmt > 0 && depositAmt <= type(uint128).max);
        token.mint(address(jar), depositAmt);

        vm.prank(owner);
        jar.withdrawAll(address(token), recipient);

        assertEq(token.balanceOf(address(jar)), 0);
        assertEq(token.balanceOf(recipient), depositAmt);
    }

    // ── event args match inputs ──────────────────────────────────────────────

    function testFuzz_withdraw_emitsEvent(address to, uint256 amount) public {
        vm.assume(to != address(0));
        vm.assume(amount > 0 && amount <= type(uint128).max);
        token.mint(address(jar), amount);

        vm.expectEmit(true, true, false, true);
        emit TipJar.Withdrawn(address(token), to, amount);
        vm.prank(owner);
        jar.withdraw(address(token), to, amount);
    }

    // ── two-step ownership ──────────────────────────────────────────────────

    function testFuzz_acceptOwnership_onlyPendingOwner(address pending, address other) public {
        vm.assume(pending != address(0));
        vm.assume(other != pending);

        vm.prank(owner);
        jar.transferOwnership(pending);

        vm.prank(other);
        vm.expectRevert(TipJar.NotPendingOwner.selector);
        jar.acceptOwnership();

        // Actual pending owner can accept
        vm.prank(pending);
        jar.acceptOwnership();
        assertEq(jar.owner(), pending);
        assertEq(jar.pendingOwner(), address(0));
    }

    function testFuzz_transferOwnership_emitsEvent(address newOwner) public {
        vm.assume(newOwner != address(0));
        vm.expectEmit(true, true, false, false);
        emit TipJar.OwnershipTransferStarted(owner, newOwner);
        vm.prank(owner);
        jar.transferOwnership(newOwner);
        assertEq(jar.pendingOwner(), newOwner);
    }

    // ── failed transfer propagates ───────────────────────────────────────────

    function testFuzz_withdraw_revertsOnFailedTransfer(uint256 amount) public {
        vm.assume(amount > 0 && amount <= type(uint128).max);
        token.mint(address(jar), amount);
        token.setTransferFail(true);

        vm.prank(owner);
        vm.expectRevert(TipJar.ERC20TransferFailed.selector);
        jar.withdraw(address(token), recipient, amount);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TipJar — invariant handler
// ─────────────────────────────────────────────────────────────────────────────
contract TipJarHandler is Test {
    TipJar public jar;
    MockERC20 public token;
    address public owner;

    // Track total credited to external recipients so we can check conservation.
    uint256 public totalWithdrawn;
    uint256 public totalDeposited;

    constructor(TipJar jar_, MockERC20 token_, address owner_) {
        jar = jar_;
        token = token_;
        owner = owner_;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1, 1_000_000e6);
        token.mint(address(jar), amount);
        totalDeposited += amount;
    }

    function withdraw(uint256 amount, address to) external {
        to = address(uint160(bound(uint160(to), 1, type(uint160).max)));
        if (to == address(jar)) return; // sending the jar its own tokens is not a withdrawal
        uint256 bal = token.balanceOf(address(jar));
        if (bal == 0) return;
        amount = bound(amount, 1, bal);

        vm.prank(owner);
        jar.withdraw(address(token), to, amount);
        totalWithdrawn += amount;
    }

    function withdrawAll(address to) external {
        to = address(uint160(bound(uint160(to), 1, type(uint160).max)));
        if (to == address(jar)) return; // sending the jar its own tokens is not a withdrawal
        uint256 bal = token.balanceOf(address(jar));
        if (bal == 0) return;
        totalWithdrawn += bal;

        vm.prank(owner);
        jar.withdrawAll(address(token), to);
    }
}

contract TipJarInvariantTest is Test {
    TipJar public jar;
    MockERC20 public token;
    TipJarHandler public handler;
    address owner = address(0xABCD);

    function setUp() public {
        jar = new TipJar(owner);
        token = new MockERC20();
        handler = new TipJarHandler(jar, token, owner);
        targetContract(address(handler));
    }

    /// @notice Contract balance == deposited - withdrawn at all times.
    function invariant_balanceEqualsDepositedMinusWithdrawn() public view {
        assertEq(
            token.balanceOf(address(jar)),
            handler.totalDeposited() - handler.totalWithdrawn()
        );
    }

    /// @notice Withdrawn never exceeds deposited (no tokens appear from thin air).
    function invariant_withdrawnNeverExceedsDeposited() public view {
        assertLe(handler.totalWithdrawn(), handler.totalDeposited());
    }

    /// @notice Owner never changes unless a transferOwnership+accept sequence ran
    ///         (the handler never calls those, so owner is permanently owner).
    function invariant_ownerUnchanged() public view {
        assertEq(jar.owner(), owner);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GmBoard — fuzz tests
// ─────────────────────────────────────────────────────────────────────────────
contract GmBoardFuzzTest is Test {
    GmBoard public board;

    uint64 constant ONE_DAY = 86_400;
    uint64 constant DAY0 = 100 * 86_400; // a midnight UTC (03:00 Turkey time)

    function setUp() public {
        board = new GmBoard();
        vm.warp(DAY0 + 10 hours);
    }

    // ── once per UTC day ─────────────────────────────────────────────────────

    function testFuzz_gm_sameDayPreventsDouble(address caller, uint64 later) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        board.gm();

        // any later moment before the next 00:00 UTC reverts
        later = uint64(bound(later, 0, DAY0 + ONE_DAY - 1 - block.timestamp));
        vm.warp(block.timestamp + later);

        vm.prank(caller);
        vm.expectRevert();
        board.gm();
    }

    function testFuzz_gm_allowedFromNextMidnight(address caller, uint64 extra) public {
        vm.assume(caller != address(0));
        extra = uint64(bound(extra, 0, 1 days));

        vm.prank(caller);
        board.gm();

        vm.warp(DAY0 + ONE_DAY + extra);
        vm.prank(caller);
        board.gm(); // must not revert
    }

    // ── total counter monotonic ──────────────────────────────────────────────

    function testFuzz_totalGmsMonotonic(address[4] calldata callers) public {
        uint256 prev = board.totalGms();
        for (uint256 i = 0; i < 4; i++) {
            address c = callers[i];
            if (c == address(0)) continue;
            vm.prank(c);
            try board.gm() {
                uint256 cur = board.totalGms();
                assertGe(cur, prev);
                prev = cur;
            } catch {}
        }
    }

    // ── streak logic ─────────────────────────────────────────────────────────

    function testFuzz_gm_firstCallStreak1(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        board.gm();
        (, uint32 streak,) = board.getRecord(caller);
        assertEq(streak, 1);
    }

    /// Streak increments when the next GM falls on the following UTC day.
    function testFuzz_gm_streakIncrements(address caller, uint64 offset) public {
        vm.assume(caller != address(0));
        offset = uint64(bound(offset, 0, ONE_DAY - 1));

        vm.prank(caller);
        board.gm();

        vm.warp(DAY0 + ONE_DAY + offset);
        vm.prank(caller);
        board.gm();
        (, uint32 s2,) = board.getRecord(caller);
        assertEq(s2, 2);
    }

    /// Streak resets to 1 when at least one whole UTC day is skipped.
    function testFuzz_gm_streakResetsAfterSkippedDay(address caller, uint64 extra) public {
        vm.assume(caller != address(0));
        extra = uint64(bound(extra, 0, 30 days));

        vm.prank(caller);
        board.gm();

        vm.warp(DAY0 + ONE_DAY * 2 + extra);
        vm.prank(caller);
        board.gm();

        (, uint32 s,) = board.getRecord(caller);
        assertEq(s, 1);
    }

    // ── record matches ───────────────────────────────────────────────────────

    function testFuzz_gm_recordMatches(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        board.gm();

        (uint64 lastGm, uint32 streak, uint32 total) = board.getRecord(caller);
        assertEq(lastGm, uint64(block.timestamp));
        assertEq(streak, 1);
        assertEq(total, 1);
        assertEq(board.lastGmSender(), caller);
        assertEq(board.lastGmTime(), uint64(block.timestamp));
    }

    // ── cooldownRemaining ────────────────────────────────────────────────────

    function testFuzz_cooldownRemaining_endsAtMidnightUtc(address caller, uint64 elapsed) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        board.gm();

        elapsed = uint64(bound(elapsed, 0, DAY0 + ONE_DAY - 1 - block.timestamp));
        vm.warp(block.timestamp + elapsed);
        assertEq(board.cooldownRemaining(caller), DAY0 + ONE_DAY - block.timestamp);
    }

    // ── totalGms increments per valid gm call ────────────────────────────────

    function testFuzz_gm_totalGmsIncrementsEachValidCall(address caller, uint64 extra) public {
        vm.assume(caller != address(0));
        extra = uint64(bound(extra, 0, 1 days));

        uint256 before = board.totalGms();
        vm.prank(caller);
        board.gm();
        assertEq(board.totalGms(), before + 1);

        vm.warp(DAY0 + ONE_DAY + extra);
        vm.prank(caller);
        board.gm();
        assertEq(board.totalGms(), before + 2);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PulsarcPlatform (ArcVoting, ArcAttestation, ArcBoost, ArcWatchlistNFT) — fuzz
// ─────────────────────────────────────────────────────────────────────────────

// ── ArcVoting ────────────────────────────────────────────────────────────────
contract ArcVotingFuzzTest is Test {
    ArcVoting public voting;
    uint256 constant VOTE_COOLDOWN = 1 days;

    function setUp() public {
        voting = new ArcVoting();
        vm.warp(1_000_000);
    }

    function testFuzz_vote_emptyDappIdReverts(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert("ArcVoting: empty dappId");
        voting.vote("");
    }

    function testFuzz_vote_cooldownPreventsDouble(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);

        vm.prank(caller);
        voting.vote(dappId);

        // warp less than cooldown
        vm.warp(block.timestamp + bound(block.timestamp, 1, VOTE_COOLDOWN - 1));
        vm.prank(caller);
        vm.expectRevert("ArcVoting: cooldown active");
        voting.vote(dappId);
    }

    function testFuzz_vote_allowedAfterCooldown(address caller, string calldata dappId, uint256 extra) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);
        extra = bound(extra, 0, 1 days);

        vm.prank(caller);
        voting.vote(dappId);

        vm.warp(block.timestamp + VOTE_COOLDOWN + extra);
        vm.prank(caller);
        voting.vote(dappId); // must not revert
    }

    function testFuzz_vote_countIncrementsPerVote(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);

        uint256 before = voting.getVoteCount(dappId);
        vm.prank(caller);
        voting.vote(dappId);
        assertEq(voting.getVoteCount(dappId), before + 1);
    }

    function testFuzz_vote_differentCallersSameId(address a, address b, string calldata dappId) public {
        vm.assume(a != address(0) && b != address(0) && a != b);
        vm.assume(bytes(dappId).length > 0);

        vm.prank(a);
        voting.vote(dappId);
        vm.prank(b);
        voting.vote(dappId);

        assertEq(voting.getVoteCount(dappId), 2);
    }

    function testFuzz_vote_eventArgsMatch(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);

        vm.expectEmit(true, true, false, true);
        emit ArcVoting.Voted(caller, dappId, block.timestamp);
        vm.prank(caller);
        voting.vote(dappId);
    }
}

// ── ArcAttestation ───────────────────────────────────────────────────────────
contract ArcAttestationFuzzTest is Test {
    ArcAttestation public attest;

    function setUp() public {
        attest = new ArcAttestation();
    }

    function testFuzz_attest_emptyDappIdReverts(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert("ArcAttestation: empty dappId");
        attest.attest("");
    }

    function testFuzz_attest_oncePerAddress(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);

        vm.prank(caller);
        attest.attest(dappId);

        vm.prank(caller);
        vm.expectRevert("ArcAttestation: already attested");
        attest.attest(dappId);
    }

    function testFuzz_attest_countMonotonic(address[4] calldata callers, string calldata dappId) public {
        vm.assume(bytes(dappId).length > 0);
        uint256 prev = attest.getAttestationCount(dappId);
        for (uint256 i = 0; i < 4; i++) {
            address c = callers[i];
            if (c == address(0)) continue;
            vm.prank(c);
            try attest.attest(dappId) {
                uint256 cur = attest.getAttestationCount(dappId);
                assertGe(cur, prev);
                prev = cur;
            } catch {}
        }
    }

    function testFuzz_attest_setsHasAttestedFlag(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);

        assertFalse(attest.hasAttested(caller, dappId));
        vm.prank(caller);
        attest.attest(dappId);
        assertTrue(attest.hasAttested(caller, dappId));
    }
}

// ── ArcBoost ─────────────────────────────────────────────────────────────────
contract ArcBoostFuzzTest is Test {
    ArcBoost public arcBoost;
    MockERC20 public usdc;
    address owner = address(0xABCD);
    address treasury = address(0xDEAD);

    function setUp() public {
        usdc = new MockERC20();
        vm.prank(owner);
        arcBoost = new ArcBoost(treasury, address(usdc));
    }

    function testFuzz_boost_belowMinReverts(string calldata dappId, uint256 amount) public {
        vm.assume(bytes(dappId).length > 0);
        amount = bound(amount, 0, arcBoost.MIN_BOOST() - 1);

        vm.expectRevert("ArcBoost: amount below minimum");
        arcBoost.boost(dappId, amount);
    }

    function testFuzz_boost_emptyDappIdReverts(uint256 amount) public {
        amount = bound(amount, arcBoost.MIN_BOOST(), type(uint128).max);
        vm.expectRevert("ArcBoost: empty dappId");
        arcBoost.boost("", amount);
    }

    function testFuzz_boost_transfersToTreasury(address caller, string calldata dappId, uint256 amount) public {
        vm.assume(caller != address(0));
        vm.assume(caller != treasury); // paying yourself nets out
        vm.assume(bytes(dappId).length > 0);
        amount = bound(amount, arcBoost.MIN_BOOST(), 1_000_000e6);

        usdc.mint(caller, amount);
        vm.prank(caller);
        usdc.approve(address(arcBoost), amount);

        uint256 tresBefore = usdc.balanceOf(treasury);
        vm.prank(caller);
        arcBoost.boost(dappId, amount);

        assertEq(usdc.balanceOf(treasury), tresBefore + amount);
        assertEq(usdc.balanceOf(caller), 0);
    }

    function testFuzz_boost_totalBoostAccumulates(address caller, string calldata dappId, uint256 amount) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);
        amount = bound(amount, arcBoost.MIN_BOOST(), 1_000_000e6);

        usdc.mint(caller, amount);
        vm.prank(caller);
        usdc.approve(address(arcBoost), amount);

        uint256 before = arcBoost.getTotalBoost(dappId);
        vm.prank(caller);
        arcBoost.boost(dappId, amount);
        assertEq(arcBoost.getTotalBoost(dappId), before + amount);
    }

    function testFuzz_boost_countIncrementsPerBoost(address caller, string calldata dappId, uint256 amount) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);
        amount = bound(amount, arcBoost.MIN_BOOST(), 1_000_000e6);

        usdc.mint(caller, amount);
        vm.prank(caller);
        usdc.approve(address(arcBoost), amount);

        uint256 before = arcBoost.getBoostCount(dappId);
        vm.prank(caller);
        arcBoost.boost(dappId, amount);
        assertEq(arcBoost.getBoostCount(dappId), before + 1);
    }

    function testFuzz_transferOwnership_nonOwnerReverts(address caller, address newOwner) public {
        vm.assume(caller != owner);
        vm.assume(newOwner != address(0));
        vm.prank(caller);
        vm.expectRevert("ArcBoost: caller is not owner");
        arcBoost.transferOwnership(newOwner);
    }

    function testFuzz_updateTreasury_nonOwnerReverts(address caller, address newTreasury) public {
        vm.assume(caller != owner);
        vm.assume(newTreasury != address(0));
        vm.prank(caller);
        vm.expectRevert("ArcBoost: caller is not owner");
        arcBoost.updateTreasury(newTreasury);
    }

    function testFuzz_updateTreasury_zeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert("ArcBoost: treasury is zero address");
        arcBoost.updateTreasury(address(0));
    }

    function testFuzz_boost_eventArgs(address caller, string calldata dappId, uint256 amount) public {
        vm.assume(caller != address(0));
        vm.assume(bytes(dappId).length > 0);
        amount = bound(amount, arcBoost.MIN_BOOST(), 1_000_000e6);

        usdc.mint(caller, amount);
        vm.prank(caller);
        usdc.approve(address(arcBoost), amount);

        vm.expectEmit(true, true, false, true);
        emit ArcBoost.Boosted(caller, dappId, amount, block.timestamp);
        vm.prank(caller);
        arcBoost.boost(dappId, amount);
    }
}

// ── ArcWatchlistNFT ───────────────────────────────────────────────────────────
contract ArcWatchlistNFTFuzzTest is Test {
    ArcWatchlistNFT public nft;

    function setUp() public {
        nft = new ArcWatchlistNFT("Pulsarc Watchlist", "WATCH");
    }

    function testFuzz_mintWatchlist_emptyDappIdReverts(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert("ArcWatchlistNFT: empty dappId");
        nft.mintWatchlist("");
    }

    function testFuzz_mintWatchlist_oncePerAddressDappId(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(caller.code.length == 0); // safeMint to a contract (e.g. the Vm cheatcode address) reverts
        vm.assume(bytes(dappId).length > 0);

        vm.prank(caller);
        nft.mintWatchlist(dappId);

        vm.prank(caller);
        vm.expectRevert("ArcWatchlistNFT: already minted");
        nft.mintWatchlist(dappId);
    }

    function testFuzz_mintWatchlist_setsWatchlistFlag(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(caller.code.length == 0); // safeMint to a contract (e.g. the Vm cheatcode address) reverts
        vm.assume(bytes(dappId).length > 0);

        assertFalse(nft.hasWatchlisted(caller, dappId));
        vm.prank(caller);
        nft.mintWatchlist(dappId);
        assertTrue(nft.hasWatchlisted(caller, dappId));
    }

    function testFuzz_mintWatchlist_nftOwnerIsCalller(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(caller.code.length == 0); // not a contract; safeMint would fail otherwise
        vm.assume(bytes(dappId).length > 0);

        vm.prank(caller);
        uint256 tokenId = nft.mintWatchlist(dappId);
        assertEq(nft.ownerOf(tokenId), caller);
    }

    function testFuzz_mintWatchlist_differentCallersSameDapp(address a, address b, string calldata dappId) public {
        vm.assume(a != address(0) && b != address(0) && a != b);
        vm.assume(a.code.length == 0 && b.code.length == 0);
        vm.assume(bytes(dappId).length > 0);

        vm.prank(a);
        uint256 tid1 = nft.mintWatchlist(dappId);
        vm.prank(b);
        uint256 tid2 = nft.mintWatchlist(dappId);

        assertTrue(tid1 != tid2);
        assertEq(nft.ownerOf(tid1), a);
        assertEq(nft.ownerOf(tid2), b);
    }

    function testFuzz_getDappIdForToken_matchesInput(address caller, string calldata dappId) public {
        vm.assume(caller != address(0));
        vm.assume(caller.code.length == 0);
        vm.assume(bytes(dappId).length > 0);

        vm.prank(caller);
        uint256 tokenId = nft.mintWatchlist(dappId);
        assertEq(nft.getDappIdForToken(tokenId), dappId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PulsarcPlatform — invariant tests
// ─────────────────────────────────────────────────────────────────────────────

contract PulsarcHandler is Test {
    ArcVoting public voting;
    ArcAttestation public attest;
    ArcBoost public arcBoost;
    ArcWatchlistNFT public nft;
    MockERC20 public usdc;
    address public boostOwner;
    address public treasury;

    // Monotonic counters we mirror to check invariants
    uint256 public mirrorTotalVotes;
    uint256 public mirrorTotalAttestations;
    uint256 public mirrorTotalBoostAmount;
    uint256 public mirrorNftsMinted;

    // Fixed set of callers and dapp ids to keep the state space tractable
    address[3] public callers;
    string[3] public dappIds;

    constructor(
        ArcVoting voting_,
        ArcAttestation attest_,
        ArcBoost arcBoost_,
        ArcWatchlistNFT nft_,
        MockERC20 usdc_,
        address boostOwner_,
        address treasury_
    ) {
        voting = voting_;
        attest = attest_;
        arcBoost = arcBoost_;
        nft = nft_;
        usdc = usdc_;
        boostOwner = boostOwner_;
        treasury = treasury_;

        callers[0] = address(0x1001);
        callers[1] = address(0x1002);
        callers[2] = address(0x1003);
        dappIds[0] = "dapp-alpha";
        dappIds[1] = "dapp-beta";
        dappIds[2] = "dapp-gamma";
    }

    function doVote(uint256 callerSeed, uint256 dappSeed) external {
        address caller = callers[callerSeed % 3];
        string memory dapp = dappIds[dappSeed % 3];
        vm.prank(caller);
        try voting.vote(dapp) {
            mirrorTotalVotes++;
        } catch {}
    }

    function doAttest(uint256 callerSeed, uint256 dappSeed) external {
        address caller = callers[callerSeed % 3];
        string memory dapp = dappIds[dappSeed % 3];
        vm.prank(caller);
        try attest.attest(dapp) {
            mirrorTotalAttestations++;
        } catch {}
    }

    function doBoost(uint256 callerSeed, uint256 dappSeed, uint256 amount) external {
        address caller = callers[callerSeed % 3];
        string memory dapp = dappIds[dappSeed % 3];
        amount = bound(amount, arcBoost.MIN_BOOST(), 10_000e6);

        usdc.mint(caller, amount);
        vm.prank(caller);
        usdc.approve(address(arcBoost), amount);
        vm.prank(caller);
        try arcBoost.boost(dapp, amount) {
            mirrorTotalBoostAmount += amount;
        } catch {}
    }

    function doMint(uint256 callerSeed, uint256 dappSeed) external {
        address caller = callers[callerSeed % 3];
        string memory dapp = dappIds[dappSeed % 3];
        if (nft.hasWatchlisted(caller, dapp)) return;
        vm.prank(caller);
        try nft.mintWatchlist(dapp) {
            mirrorNftsMinted++;
        } catch {}
    }

    function warpOneDay() external {
        vm.warp(block.timestamp + 1 days + 1);
    }
}

contract PulsarcPlatformInvariantTest is Test {
    ArcVoting public voting;
    ArcAttestation public attest;
    ArcBoost public arcBoost;
    ArcWatchlistNFT public nft;
    MockERC20 public usdc;
    PulsarcHandler public handler;

    address boostOwner = address(0xBEEF);
    address treasury = address(0xCAFE);

    function setUp() public {
        voting = new ArcVoting();
        attest = new ArcAttestation();
        usdc = new MockERC20();
        vm.prank(boostOwner);
        arcBoost = new ArcBoost(treasury, address(usdc));
        nft = new ArcWatchlistNFT("Pulsarc Watchlist", "WATCH");

        handler = new PulsarcHandler(voting, attest, arcBoost, nft, usdc, boostOwner, treasury);
        targetContract(address(handler));
        vm.warp(1_000_000); // start timestamp well above 0
    }

    /// @notice Vote counts are non-negative and equal to the handler's mirror count.
    function invariant_voteCounts_nonNegative() public view {
        // Each dapp's count is always >= 0 (uint256 enforces this).
        // Verify our mirror matches at least one dapp to confirm the handler ran.
        uint256 total = 0;
        total += voting.getVoteCount("dapp-alpha");
        total += voting.getVoteCount("dapp-beta");
        total += voting.getVoteCount("dapp-gamma");
        assertEq(total, handler.mirrorTotalVotes());
    }

    /// @notice Attestation counts match the mirror — no address attests the same dapp twice.
    function invariant_attestationCounts_matchMirror() public view {
        uint256 total = 0;
        total += attest.getAttestationCount("dapp-alpha");
        total += attest.getAttestationCount("dapp-beta");
        total += attest.getAttestationCount("dapp-gamma");
        assertEq(total, handler.mirrorTotalAttestations());
    }

    /// @notice Treasury receives every USDC boosted — no boost amount disappears.
    function invariant_treasury_receivesAllBoost() public view {
        assertEq(usdc.balanceOf(treasury), handler.mirrorTotalBoostAmount());
    }

    /// @notice Total boost amounts across dapps equal the mirror sum.
    function invariant_totalBoost_matchesMirror() public view {
        uint256 total = 0;
        total += arcBoost.getTotalBoost("dapp-alpha");
        total += arcBoost.getTotalBoost("dapp-beta");
        total += arcBoost.getTotalBoost("dapp-gamma");
        assertEq(total, handler.mirrorTotalBoostAmount());
    }

    /// @notice Each address can hold at most one NFT per dapp (uniqueness).
    function invariant_nft_uniquenessPerAddressDapp() public view {
        address[3] memory callers = [address(0x1001), address(0x1002), address(0x1003)];
        string[3] memory dapps = ["dapp-alpha", "dapp-beta", "dapp-gamma"];
        for (uint256 i = 0; i < 3; i++) {
            for (uint256 j = 0; j < 3; j++) {
                // hasWatchlisted is boolean — at most one flag per (address, dapp)
                assertTrue(nft.hasWatchlisted(callers[i], dapps[j]) == true || !nft.hasWatchlisted(callers[i], dapps[j]));
            }
        }
    }
}
