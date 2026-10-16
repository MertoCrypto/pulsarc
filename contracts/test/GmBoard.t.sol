// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../GmBoard.sol";

/// The GM day resets at 00:00 UTC (03:00 Turkey time), not 24h after the last GM.
contract GmBoardTest is Test {
    GmBoard board;

    address alice = address(0xA1);
    address bob   = address(0xB0B);

    uint64 constant ONE_DAY = 86_400;
    /// A midnight UTC (03:00 TR) far from 0.
    uint64 constant DAY0 = 100 * 86_400;

    function setUp() public {
        board = new GmBoard();
        vm.warp(DAY0 + 10 hours); // 10:00 UTC on day 100
    }

    function _gm(address who) internal {
        vm.prank(who);
        board.gm();
    }

    // First GM

    function test_firstGm_setsRecord() public {
        uint64 ts = uint64(block.timestamp);

        vm.expectEmit(true, false, false, true);
        emit GmBoard.Gm(alice, 1, 1, ts);
        _gm(alice);

        (uint64 lastGm, uint32 streak, uint32 total) = board.getRecord(alice);
        assertEq(lastGm, ts);
        assertEq(streak, 1);
        assertEq(total, 1);
        assertEq(board.totalGms(), 1);
        assertEq(board.lastGmSender(), alice);
        assertEq(board.lastGmTime(), ts);
    }

    // Once per UTC day

    function test_secondGmSameDay_reverts_withNextMidnight() public {
        _gm(alice);
        vm.warp(DAY0 + 23 hours + 59 minutes + 59);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GmBoard.CooldownNotOver.selector, DAY0 + ONE_DAY));
        board.gm();
    }

    function test_gmJustAfterMidnight_succeeds_streak2() public {
        _gm(alice);
        vm.warp(DAY0 + ONE_DAY); // exactly 00:00 UTC next day, only 14h after the first GM
        _gm(alice);
        (, uint32 streak, uint32 total) = board.getRecord(alice);
        assertEq(streak, 2);
        assertEq(total, 2);
    }

    function test_gmAtLateNight_thenJustAfterMidnight_isAllowed() public {
        vm.warp(DAY0 + 23 hours + 59 minutes);
        _gm(alice);
        vm.warp(DAY0 + ONE_DAY + 1); // two minutes later, new day
        _gm(alice);
        (, uint32 streak,) = board.getRecord(alice);
        assertEq(streak, 2);
    }

    function test_gmEarlyMorning_thenLaterSameDay_reverts() public {
        vm.warp(DAY0); // exactly 00:00 UTC
        _gm(alice);
        vm.warp(DAY0 + 23 hours);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GmBoard.CooldownNotOver.selector, DAY0 + ONE_DAY));
        board.gm();
    }

    // Streak: alive only if the last GM was on the previous UTC day

    function test_nextDayAtEndOfDay_keepsStreak() public {
        _gm(alice);
        vm.warp(DAY0 + 2 * ONE_DAY - 1); // 23:59:59 UTC the next day
        _gm(alice);
        (, uint32 streak,) = board.getRecord(alice);
        assertEq(streak, 2);
    }

    function test_skippingAFullDay_resetsStreak() public {
        _gm(alice);
        vm.warp(DAY0 + 2 * ONE_DAY); // 00:00 UTC two days later: one day skipped
        _gm(alice);
        (, uint32 streak, uint32 total) = board.getRecord(alice);
        assertEq(streak, 1);
        assertEq(total, 2);
        assertEq(board.totalGms(), 2);
    }

    function test_longStreak_10days() public {
        for (uint32 i = 0; i < 10; i++) {
            vm.warp(DAY0 + ONE_DAY * i + 10 hours);
            _gm(alice);
        }
        (, uint32 streak, uint32 total) = board.getRecord(alice);
        assertEq(streak, 10);
        assertEq(total, 10);
        assertEq(board.totalGms(), 10);
    }

    // Independent addresses, global state

    function test_independentAddresses() public {
        _gm(alice);
        vm.warp(block.timestamp + 3600);
        _gm(bob);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GmBoard.CooldownNotOver.selector, DAY0 + ONE_DAY));
        board.gm();

        assertEq(board.totalGms(), 2);
        assertEq(board.lastGmSender(), bob);
        assertEq(board.lastGmTime(), uint64(DAY0 + 11 hours));
    }

    function test_getRecord_unknownWallet_returnsZeros() public view {
        (uint64 lastGm, uint32 streak, uint32 total) = board.getRecord(address(0xDEAD));
        assertEq(lastGm, 0);
        assertEq(streak, 0);
        assertEq(total, 0);
    }

    // cooldownRemaining: seconds until the next 00:00 UTC

    function test_cooldownRemaining_neverGm_isZero() public view {
        assertEq(board.cooldownRemaining(alice), 0);
    }

    function test_cooldownRemaining_isTimeUntilMidnightUtc() public {
        _gm(alice); // 10:00 UTC
        assertEq(board.cooldownRemaining(alice), 14 hours);
        vm.warp(block.timestamp + 1000);
        assertEq(board.cooldownRemaining(alice), 14 hours - 1000);
    }

    function test_cooldownRemaining_atMidnight_isZero() public {
        _gm(alice);
        vm.warp(DAY0 + ONE_DAY);
        assertEq(board.cooldownRemaining(alice), 0);
        vm.warp(DAY0 + ONE_DAY + 500);
        assertEq(board.cooldownRemaining(alice), 0);
    }

    function test_cooldownRemaining_oneSecondBeforeMidnight_is1() public {
        _gm(alice);
        vm.warp(DAY0 + ONE_DAY - 1);
        assertEq(board.cooldownRemaining(alice), 1);
    }

    // Fuzz: any time on the next UTC day keeps the streak

    function testFuzz_nextUtcDay_keepsStreak(uint64 offset) public {
        offset = uint64(bound(uint256(offset), 0, ONE_DAY - 1));
        _gm(alice);
        vm.warp(DAY0 + ONE_DAY + offset);
        _gm(alice);
        (, uint32 streak,) = board.getRecord(alice);
        assertEq(streak, 2);
    }
}
