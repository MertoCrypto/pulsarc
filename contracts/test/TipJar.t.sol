// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../TipJar.sol";

// ---------------------------------------------------------------------------
// Mock ERC-20 tokens
// ---------------------------------------------------------------------------

/// @dev Normal mock: transfer always returns true.
contract MockERC20 {
    mapping(address => uint256) private _bal;

    function mint(address to, uint256 amount) external {
        _bal[to] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _bal[account];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(_bal[msg.sender] >= amount, "insufficient");
        _bal[msg.sender] -= amount;
        _bal[to] += amount;
        return true;
    }
}

/// @dev Failing mock: transfer always returns false.
contract MockERC20ReturnFalse {
    mapping(address => uint256) private _bal;

    function mint(address to, uint256 amount) external {
        _bal[to] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _bal[account];
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

/// @dev Reverting mock: transfer always reverts.
contract MockERC20Reverts {
    mapping(address => uint256) private _bal;

    function mint(address to, uint256 amount) external {
        _bal[to] += amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _bal[account];
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert("always reverts");
    }
}

// ---------------------------------------------------------------------------
// TipJar tests
// ---------------------------------------------------------------------------

contract TipJarTest is Test {
    TipJar jar;
    MockERC20 token;
    MockERC20ReturnFalse tokenFalse;
    MockERC20Reverts tokenReverts;

    address owner = address(0x1);
    address alice = address(0x2);
    address bob   = address(0x3);

    function setUp() public {
        vm.prank(owner);
        jar = new TipJar(owner);

        token = new MockERC20();
        tokenFalse = new MockERC20ReturnFalse();
        tokenReverts = new MockERC20Reverts();
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    function test_constructor_setsOwner() public view {
        assertEq(jar.owner(), owner);
    }

    function test_constructor_pendingOwnerIsZero() public view {
        assertEq(jar.pendingOwner(), address(0));
    }

    function test_constructor_zeroAddress_reverts() public {
        vm.expectRevert(TipJar.ZeroAddress.selector);
        new TipJar(address(0));
    }

    // -----------------------------------------------------------------------
    // Token balance visible via mock
    // -----------------------------------------------------------------------

    function test_balanceOf_tokensInJar() public {
        token.mint(address(jar), 1000);
        assertEq(token.balanceOf(address(jar)), 1000);
    }

    // -----------------------------------------------------------------------
    // withdraw – happy path
    // -----------------------------------------------------------------------

    function test_withdraw_movesExactAmount() public {
        token.mint(address(jar), 500);

        vm.expectEmit(true, true, false, true);
        emit TipJar.Withdrawn(address(token), alice, 300);

        vm.prank(owner);
        jar.withdraw(address(token), alice, 300);

        assertEq(token.balanceOf(alice), 300);
        assertEq(token.balanceOf(address(jar)), 200);
    }

    function test_withdraw_zeroAmount_succeeds() public {
        token.mint(address(jar), 100);

        vm.expectEmit(true, true, false, true);
        emit TipJar.Withdrawn(address(token), alice, 0);

        vm.prank(owner);
        jar.withdraw(address(token), alice, 0);

        assertEq(token.balanceOf(address(jar)), 100);
    }

    // -----------------------------------------------------------------------
    // withdraw – access control
    // -----------------------------------------------------------------------

    function test_withdraw_nonOwner_reverts() public {
        token.mint(address(jar), 100);
        vm.prank(alice);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.withdraw(address(token), alice, 50);
    }

    function test_withdraw_pendingOwnerBeforeAccept_reverts() public {
        // Promote alice to pending but she hasn't accepted yet
        vm.prank(owner);
        jar.transferOwnership(alice);

        token.mint(address(jar), 100);
        vm.prank(alice);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.withdraw(address(token), alice, 50);
    }

    // -----------------------------------------------------------------------
    // withdraw – zero-address guards
    // -----------------------------------------------------------------------

    function test_withdraw_tokenZero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.withdraw(address(0), alice, 100);
    }

    function test_withdraw_toZero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.withdraw(address(token), address(0), 100);
    }

    // -----------------------------------------------------------------------
    // withdraw – transfer failure
    // -----------------------------------------------------------------------

    function test_withdraw_returnsFalse_reverts() public {
        tokenFalse.mint(address(jar), 100);
        vm.prank(owner);
        vm.expectRevert(TipJar.ERC20TransferFailed.selector);
        jar.withdraw(address(tokenFalse), alice, 50);
    }

    function test_withdraw_reverts_bubbles() public {
        tokenReverts.mint(address(jar), 100);
        vm.prank(owner);
        vm.expectRevert("always reverts");
        jar.withdraw(address(tokenReverts), alice, 50);
    }

    function test_withdraw_moreThanBalance_reverts() public {
        token.mint(address(jar), 10);
        vm.prank(owner);
        vm.expectRevert("insufficient");
        jar.withdraw(address(token), alice, 100);
    }

    // -----------------------------------------------------------------------
    // withdrawAll
    // -----------------------------------------------------------------------

    function test_withdrawAll_movesFullBalance() public {
        token.mint(address(jar), 777);
        vm.prank(owner);
        jar.withdrawAll(address(token), alice);

        assertEq(token.balanceOf(alice), 777);
        assertEq(token.balanceOf(address(jar)), 0);
    }

    function test_withdrawAll_balanceZero_succeeds() public {
        // zero balance: transfer(0) on MockERC20 is fine
        vm.prank(owner);
        jar.withdrawAll(address(token), alice);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_withdrawAll_nonOwner_reverts() public {
        token.mint(address(jar), 100);
        vm.prank(alice);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.withdrawAll(address(token), alice);
    }

    function test_withdrawAll_tokenZero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.withdrawAll(address(0), alice);
    }

    function test_withdrawAll_toZero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.withdrawAll(address(token), address(0));
    }

    // -----------------------------------------------------------------------
    // transferOwnership
    // -----------------------------------------------------------------------

    function test_transferOwnership_nonOwner_reverts() public {
        vm.prank(alice);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.transferOwnership(alice);
    }

    function test_transferOwnership_toZero_reverts() public {
        vm.prank(owner);
        vm.expectRevert(TipJar.ZeroAddress.selector);
        jar.transferOwnership(address(0));
    }

    function test_transferOwnership_setsPendingAndEmits() public {
        vm.expectEmit(true, true, false, false);
        emit TipJar.OwnershipTransferStarted(owner, alice);

        vm.prank(owner);
        jar.transferOwnership(alice);

        assertEq(jar.pendingOwner(), alice);
        assertEq(jar.owner(), owner); // owner unchanged until accept
    }

    function test_transferOwnership_overwritesPending() public {
        vm.prank(owner);
        jar.transferOwnership(alice);
        assertEq(jar.pendingOwner(), alice);

        vm.prank(owner);
        jar.transferOwnership(bob);
        assertEq(jar.pendingOwner(), bob);
    }

    // -----------------------------------------------------------------------
    // acceptOwnership
    // -----------------------------------------------------------------------

    function test_acceptOwnership_byNonPending_reverts() public {
        vm.prank(owner);
        jar.transferOwnership(alice);

        vm.prank(bob);
        vm.expectRevert(TipJar.NotPendingOwner.selector);
        jar.acceptOwnership();
    }

    /// @dev Documents current behaviour: when pendingOwner==address(0) and
    ///      msg.sender==address(0), the check `msg.sender != _pendingOwner`
    ///      evaluates to false (0 == 0), so it would NOT revert — the function
    ///      would succeed.  We test that corner explicitly.
    function test_acceptOwnership_zeroPendingZeroCaller_succeeds() public {
        // pendingOwner is still address(0) (no transfer started)
        assertEq(jar.pendingOwner(), address(0));

        // address(0) calling acceptOwnership: 0 == 0, check passes
        vm.prank(address(0));
        // This should NOT revert because msg.sender (0) == _pendingOwner (0)
        jar.acceptOwnership();

        // After acceptance owner becomes address(0)
        assertEq(jar.owner(), address(0));
        assertEq(jar.pendingOwner(), address(0));
    }

    function test_acceptOwnership_transfersOwnershipAndClears() public {
        vm.prank(owner);
        jar.transferOwnership(alice);

        vm.expectEmit(true, true, false, false);
        emit TipJar.OwnershipTransferred(owner, alice);

        vm.prank(alice);
        jar.acceptOwnership();

        assertEq(jar.owner(), alice);
        assertEq(jar.pendingOwner(), address(0));
    }

    function test_acceptOwnership_oldOwnerCanNoLongerWithdraw() public {
        vm.prank(owner);
        jar.transferOwnership(alice);

        vm.prank(alice);
        jar.acceptOwnership();

        token.mint(address(jar), 100);

        vm.prank(owner);
        vm.expectRevert(TipJar.NotOwner.selector);
        jar.withdraw(address(token), owner, 50);
    }

    function test_acceptOwnership_newOwnerCanWithdraw() public {
        vm.prank(owner);
        jar.transferOwnership(alice);

        vm.prank(alice);
        jar.acceptOwnership();

        token.mint(address(jar), 100);

        vm.prank(alice);
        jar.withdraw(address(token), alice, 100);
        assertEq(token.balanceOf(alice), 100);
    }

    // -----------------------------------------------------------------------
    // Fuzz: withdraw leaves balance - amount
    // -----------------------------------------------------------------------

    function testFuzz_withdraw_leavesCorrectRemainder(uint256 initial, uint256 amount) public {
        initial = bound(initial, 0, type(uint128).max);
        amount  = bound(amount, 0, initial);

        token.mint(address(jar), initial);

        vm.prank(owner);
        jar.withdraw(address(token), alice, amount);

        assertEq(token.balanceOf(address(jar)), initial - amount);
    }
}
