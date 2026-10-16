// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GmBoard
/// @notice On-chain GM registry — anyone can say GM once per UTC day.
///         The day resets at 00:00 UTC (03:00 Turkey time), not 24h after the last GM.
///         Stores the last GM timestamp and streak count per address.
contract GmBoard {
    struct GmRecord {
        uint64  lastGm;   // unix timestamp of last GM
        uint32  streak;   // consecutive-day streak
        uint32  total;    // all-time GM count
    }

    mapping(address => GmRecord) private _records;

    uint256 public totalGms;
    address public lastGmSender;
    uint64  public lastGmTime;

    event Gm(address indexed sender, uint32 streak, uint32 total, uint64 ts);

    error CooldownNotOver(uint64 nextGmTime);

    uint64 private constant ONE_DAY = 86_400;

    /// @notice Say GM. Callable once per UTC day per address (resets at 00:00 UTC).
    function gm() external {
        GmRecord storage rec = _records[msg.sender];
        uint64 now64 = uint64(block.timestamp);
        uint64 today = now64 / ONE_DAY;

        if (rec.lastGm > 0 && rec.lastGm / ONE_DAY >= today) {
            revert CooldownNotOver((today + 1) * ONE_DAY);
        }

        // Streak: still alive if the last GM was on the previous UTC day.
        bool streakAlive = rec.lastGm > 0 && rec.lastGm / ONE_DAY + 1 == today;
        rec.streak = streakAlive ? rec.streak + 1 : 1;
        rec.total  += 1;
        rec.lastGm  = now64;

        totalGms       += 1;
        lastGmSender    = msg.sender;
        lastGmTime      = now64;

        emit Gm(msg.sender, rec.streak, rec.total, now64);
    }

    /// @notice Read a wallet's GM record.
    function getRecord(address wallet)
        external
        view
        returns (uint64 lastGm, uint32 streak, uint32 total)
    {
        GmRecord memory r = _records[wallet];
        return (r.lastGm, r.streak, r.total);
    }

    /// @notice Seconds until this wallet can GM again, i.e. until the next 00:00 UTC (0 if ready).
    function cooldownRemaining(address wallet) external view returns (uint64) {
        GmRecord memory r = _records[wallet];
        if (r.lastGm == 0) return 0;
        uint64 now64 = uint64(block.timestamp);
        uint64 today = now64 / ONE_DAY;
        if (r.lastGm / ONE_DAY < today) return 0;
        return (today + 1) * ONE_DAY - now64;
    }
}
