// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../GmBoard.sol";

contract GmBoardTest is Test {
    GmBoard board;

    address alice = address(0xA1);
    address bob   = address(0xB0B);

    uint64 constant ONE_DAY = 86_400;

    function setUp() public {
        board = new GmBoard();
        // Start at a timestamp that isn't 0 so cooldown math is clean.
        vm.warp(1_000_000);
    }

    // -----------------------------------------------------------------------
    // First GM
    // -----------------------------------------------------------------------

    function test_firstGm_setsRecord() public {
        uint64 ts = uint64(block.timestamp);

        vm.expectEmit(true, false, false, true);
        emit GmBoard.Gm(alice, 1, 1, ts);

        vm.prank(alice);
        board.gm();

        (uint64 lastGm, uint32 streak, uint32 total) = board.getRecord(alice);
        assertEq(lastGm,  ts);
        assertEq(streak,  1);
        assertEq(total,   1);
        assertEq(board.totalGms(),    1);
        assertEq(board.lastGmSender(), alice);
        assertEq(board.lastGmTime(),   ts);
    }

    // -----------------------------------------------------------------------
    // Cooldown
    // -----------------------------------------------------------------------

    function test_secondGmWithin24h_reverts() public {
        vm.prank(alice);
        board.gm();

        uint64 lastGm = uint64(block.timestamp);
        vm.warp(block.timestamp + 1); // still within 24 h

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(GmBoard.CooldownNotOver.selector, lastGm + ONE_DAY)
        );
        board.gm();
    }

    function test_gmAtExactly24h_succeeds_streak2() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        vm.warp(lastGm + ONE_DAY);

        vm.prank(alice);
        board.gm();

        (, uint32 streak,) = board.getRecord(alice);
        assertEq(streak, 2);
    }

    function test_gmAtOneLessThan24h_reverts() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        vm.warp(lastGm + ONE_DAY - 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(GmBoard.CooldownNotOver.selector, lastGm + ONE_DAY)
        );
        board.gm();
    }

    // -----------------------------------------------------------------------
    // Streak logic
    // -----------------------------------------------------------------------

    function test_gmAt172799_keepStreak() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        // 48 h - 1 s: streak alive
        vm.warp(lastGm + ONE_DAY * 2 - 1);
        vm.prank(alice);
        board.gm();

        (, uint32 streak,) = board.getRecord(alice);
        assertEq(streak, 2);
    }

    function test_gmAt172800_resetsStreak() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        // exactly 48 h: streak breaks
        vm.warp(lastGm + ONE_DAY * 2);
        vm.prank(alice);
        board.gm();

        (, uint32 streak,) = board.getRecord(alice);
        assertEq(streak, 1);
    }

    function test_totalAlwaysIncrements_evenOnReset() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        // Streak resets
        vm.warp(lastGm + ONE_DAY * 2);
        vm.prank(alice);
        board.gm();

        (,, uint32 total) = board.getRecord(alice);
        assertEq(total, 2);
        assertEq(board.totalGms(), 2);
    }

    // -----------------------------------------------------------------------
    // Long streak (10 consecutive days)
    // -----------------------------------------------------------------------

    function test_longStreak_10days() public {
        uint64 ts = uint64(block.timestamp);

        for (uint32 i = 0; i < 10; i++) {
            vm.warp(ts + ONE_DAY * i);
            vm.prank(alice);
            board.gm();
        }

        (, uint32 streak, uint32 total) = board.getRecord(alice);
        assertEq(streak, 10);
        assertEq(total,  10);
        assertEq(board.totalGms(), 10);
    }

    // -----------------------------------------------------------------------
    // Multiple addresses – independent records, global state
    // -----------------------------------------------------------------------

    function test_independentAddresses() public {
        uint64 ts = uint64(block.timestamp);

        vm.prank(alice);
        board.gm();

        // Bob gms one hour later – within alice's cooldown but that's fine for bob
        vm.warp(ts + 3600);
        vm.prank(bob);
        board.gm();

        // Alice still in cooldown
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(GmBoard.CooldownNotOver.selector, ts + ONE_DAY)
        );
        board.gm();

        // Check global
        assertEq(board.totalGms(),    2);
        assertEq(board.lastGmSender(), bob);
        assertEq(board.lastGmTime(),   uint64(ts + 3600));
    }

    function test_getRecord_unknownWallet_returnsZeros() public view {
        (uint64 lastGm, uint32 streak, uint32 total) = board.getRecord(address(0xDEAD));
        assertEq(lastGm, 0);
        assertEq(streak, 0);
        assertEq(total,  0);
    }

    // -----------------------------------------------------------------------
    // cooldownRemaining
    // -----------------------------------------------------------------------

    function test_cooldownRemaining_neverGm_isZero() public view {
        assertEq(board.cooldownRemaining(alice), 0);
    }

    function test_cooldownRemaining_rightAfterGm_is86400() public {
        vm.prank(alice);
        board.gm();
        assertEq(board.cooldownRemaining(alice), ONE_DAY);
    }

    function test_cooldownRemaining_afterWarp() public {
        vm.prank(alice);
        board.gm();

        uint64 n = 1000;
        vm.warp(block.timestamp + n);
        assertEq(board.cooldownRemaining(alice), ONE_DAY - n);
    }

    function test_cooldownRemaining_atExactly86400_isZero() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        vm.warp(lastGm + ONE_DAY);
        assertEq(board.cooldownRemaining(alice), 0);
    }

    function test_cooldownRemaining_after86400_isZero() public {
        vm.prank(alice);
        board.gm();
        uint64 lastGm = uint64(block.timestamp);

        vm.warp(lastGm + ONE_DAY + 500);
        assertEq(board.cooldownRemaining(alice), 0);
    }

    // -----------------------------------------------------------------------
    // Fuzz: any warp in [86400, 172799] keeps streak alive
    // -----------------------------------------------------------------------

    function testFuzz_streakAlive_withinWindow(uint64 delta) public {
        delta = uint64(bound(uint256(delta), ONE_DAY, ONE_DAY * 2 - 1));

        vm.prank(alice);
        board.gm();
        (, uint32 streakBefore,) = board.getRecord(alice);

        uint64 lastGm = uint64(block.timestamp);
        vm.warp(lastGm + delta);

        vm.prank(alice);
        board.gm();

        (, uint32 streakAfter,) = board.getRecord(alice);
        assertEq(streakAfter, streakBefore + 1);
    }
}
