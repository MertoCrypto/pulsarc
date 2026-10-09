// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC-20 interface used by TipJar.
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title TipJar
/// @notice Holds ERC-20 tokens (such as USDC) sent directly to this contract and allows owner withdrawals.
contract TipJar {
    address private _owner;
    address private _pendingOwner;

    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error ZeroAddress();
    error NotOwner();
    error NotPendingOwner();
    error ERC20TransferFailed();

    /// @notice Restricts a function so only the current owner can call it.
    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    /// @notice Initializes the contract owner.
    /// @param owner_ Initial owner address.
    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        _owner = owner_;
    }

    /// @notice Returns the current owner.
    /// @return Current owner address.
    function owner() public view returns (address) {
        return _owner;
    }

    /// @notice Returns the pending owner that can accept ownership.
    /// @return Pending owner address.
    function pendingOwner() public view returns (address) {
        return _pendingOwner;
    }

    /// @notice Starts two-step ownership transfer by setting a pending owner.
    /// @param newOwner Address that can accept ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferStarted(_owner, newOwner);
        _pendingOwner = newOwner;
    }

    /// @notice Accepts ownership. Callable only by the pending owner.
    function acceptOwnership() external {
        if (msg.sender != _pendingOwner) revert NotPendingOwner();
        address previous = _owner;
        _owner = _pendingOwner;
        _pendingOwner = address(0);
        emit OwnershipTransferred(previous, _owner);
    }

    /// @notice Withdraws ERC-20 tokens from this contract to a recipient.
    /// @param token ERC-20 token address.
    /// @param to Recipient address.
    /// @param amount Amount to withdraw.
    function withdraw(address token, address to, uint256 amount) public onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();

        emit Withdrawn(token, to, amount);

        bool success = IERC20Minimal(token).transfer(to, amount);
        if (!success) revert ERC20TransferFailed();
    }

    /// @notice Withdraws the full ERC-20 balance from this contract to a recipient.
    /// @param token ERC-20 token address.
    /// @param to Recipient address.
    function withdrawAll(address token, address to) external onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        uint256 amount = IERC20Minimal(token).balanceOf(address(this));
        withdraw(token, to, amount);
    }
}
