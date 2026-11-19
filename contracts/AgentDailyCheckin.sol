// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title AgentDailyCheckin
/// @notice Daily check-in for Binance Agent ID holders (Agent ID Hackathon).
///         Only addresses holding an Agent ID (ERC-721, SPACE ID) may check in,
///         once per UTC day. Streaks and totals are tracked on-chain.
///         Free to use — users pay gas only. No token, no fees, no returns promised.
interface IAgentId {
    function balanceOf(address account) external view returns (uint256);
}

contract AgentDailyCheckin is Ownable, Pausable {
    /// @notice The Agent ID ERC-721 contract (SPACE ID, non-transferable).
    IAgentId public immutable agentIdContract;

    /// @notice Last UTC day number on which a user checked in (block.timestamp / 86400).
    mapping(address => uint256) public lastCheckInDay;

    /// @notice Current consecutive-day check-in streak of a user.
    mapping(address => uint256) public streak;

    /// @notice Lifetime total check-ins of a user.
    mapping(address => uint256) public totalCheckIns;

    event CheckedIn(address indexed user, uint256 day, uint256 streak, uint256 totalCheckIns);

    error NotAgentIdHolder(address user);
    error AlreadyCheckedInToday(address user, uint256 day);

    /// @param _agentIdContract Address of the Agent ID ERC-721 contract.
    /// @param _owner Admin address (owner of this contract).
    constructor(address _agentIdContract, address _owner) Ownable(_owner) {
        require(_agentIdContract != address(0), "AgentDailyCheckin: zero agent id contract");
        require(_owner != address(0), "AgentDailyCheckin: zero owner");
        agentIdContract = IAgentId(_agentIdContract);
    }

    /// @notice Current UTC day number (days since Unix epoch).
    function today() public view returns (uint256) {
        return block.timestamp / 86400;
    }

    /// @notice Whether `user` holds at least one Agent ID.
    function hasAgentId(address user) public view returns (bool) {
        return agentIdContract.balanceOf(user) > 0;
    }

    /// @notice Check in for the current UTC day. Requires an Agent ID; once per day.
    function checkIn() external whenNotPaused {
        if (!hasAgentId(msg.sender)) revert NotAgentIdHolder(msg.sender);
        uint256 day = today();
        if (lastCheckInDay[msg.sender] == day) revert AlreadyCheckedInToday(msg.sender, day);

        if (lastCheckInDay[msg.sender] == day - 1) {
            streak[msg.sender] += 1;
        } else {
            streak[msg.sender] = 1;
        }
        lastCheckInDay[msg.sender] = day;
        totalCheckIns[msg.sender] += 1;

        emit CheckedIn(msg.sender, day, streak[msg.sender], totalCheckIns[msg.sender]);
    }

    /// @notice Read a user's check-in state in one call.
    function getUser(address user)
        external
        view
        returns (uint256 _lastCheckInDay, uint256 _streak, uint256 _totalCheckIns)
    {
        return (lastCheckInDay[user], streak[user], totalCheckIns[user]);
    }

    /// @notice Pause check-ins (admin only).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume check-ins (admin only).
    function unpause() external onlyOwner {
        _unpause();
    }
}
