// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AgentDailyCheckin} from "../contracts/AgentDailyCheckin.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal mock of the Agent ID ERC-721: settable balanceOf.
contract MockAgentId {
    mapping(address => uint256) private _balances;

    function setBalance(address account, uint256 amount) external {
        _balances[account] = amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
}

contract AgentDailyCheckinTest is Test {
    AgentDailyCheckin public checkin;
    MockAgentId public mockAgentId;

    address public constant OWNER = address(0x38986738E98CbDC845B80811D64C0fa4FcdfEb33);
    address public constant ALICE = address(0xA11CE);
    address public constant BOB = address(0xB0B);

    // Fixed start time so day boundaries are deterministic: 2026-11-19 00:00:00 UTC.
    uint256 public constant START_TS = 1795046400; // 2026-11-19T00:00:00Z

    event CheckedIn(address indexed user, uint256 day, uint256 streak, uint256 totalCheckIns);

    function setUp() public {
        mockAgentId = new MockAgentId();
        checkin = new AgentDailyCheckin(address(mockAgentId), OWNER);
        vm.warp(START_TS);
    }

    // (1) Non-holder checkIn reverts with NotAgentIdHolder.
    function test_NonHolderCannotCheckIn() public {
        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(AgentDailyCheckin.NotAgentIdHolder.selector, ALICE)
        );
        checkin.checkIn();
    }

    // (2) Holder checks in OK; event emitted with correct day/streak/total.
    function test_HolderChecksInAndEmitsEvent() public {
        mockAgentId.setBalance(ALICE, 1);
        uint256 day = START_TS / 86400;

        vm.prank(ALICE);
        vm.expectEmit(true, false, false, true, address(checkin));
        emit CheckedIn(ALICE, day, 1, 1);
        checkin.checkIn();

        assertEq(checkin.lastCheckInDay(ALICE), day);
        assertEq(checkin.streak(ALICE), 1);
        assertEq(checkin.totalCheckIns(ALICE), 1);
    }

    // (3) Second check-in on the same UTC day reverts.
    function test_SecondCheckInSameDayReverts() public {
        mockAgentId.setBalance(ALICE, 1);
        vm.prank(ALICE);
        checkin.checkIn();

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentDailyCheckin.AlreadyCheckedInToday.selector, ALICE, START_TS / 86400
            )
        );
        checkin.checkIn();
    }

    // (4) Streak increments on consecutive days (warp +86400).
    function test_StreakIncrementsOnConsecutiveDays() public {
        mockAgentId.setBalance(ALICE, 1);

        vm.prank(ALICE);
        checkin.checkIn();
        assertEq(checkin.streak(ALICE), 1);

        vm.warp(START_TS + 86400);
        vm.prank(ALICE);
        checkin.checkIn();
        assertEq(checkin.streak(ALICE), 2);

        vm.warp(START_TS + 2 * 86400);
        vm.prank(ALICE);
        checkin.checkIn();
        assertEq(checkin.streak(ALICE), 3);
        assertEq(checkin.totalCheckIns(ALICE), 3);
    }

    // (5) Streak resets to 1 after a missed day (warp +2 days).
    function test_StreakResetsAfterMissedDay() public {
        mockAgentId.setBalance(ALICE, 1);

        vm.prank(ALICE);
        checkin.checkIn();
        assertEq(checkin.streak(ALICE), 1);

        // Skip one full day: next check-in is 2 days later.
        vm.warp(START_TS + 2 * 86400);
        vm.prank(ALICE);
        checkin.checkIn();

        assertEq(checkin.streak(ALICE), 1);
        assertEq(checkin.totalCheckIns(ALICE), 2);
    }

    // (6) totalCheckIns increments across days.
    function test_TotalCheckInsIncrements() public {
        mockAgentId.setBalance(ALICE, 2); // holding 2 IDs is fine too

        for (uint256 i = 0; i < 5; i++) {
            vm.warp(START_TS + i * 86400);
            vm.prank(ALICE);
            checkin.checkIn();
            assertEq(checkin.totalCheckIns(ALICE), i + 1);
        }
        assertEq(checkin.streak(ALICE), 5);
    }

    // (7) getUser returns correct values.
    function test_GetUserReturnsCorrectValues() public {
        mockAgentId.setBalance(BOB, 1);

        (uint256 d0, uint256 s0, uint256 t0) = checkin.getUser(BOB);
        assertEq(d0, 0);
        assertEq(s0, 0);
        assertEq(t0, 0);

        vm.prank(BOB);
        checkin.checkIn();

        vm.warp(START_TS + 86400);
        vm.prank(BOB);
        checkin.checkIn();

        (uint256 d, uint256 s, uint256 t) = checkin.getUser(BOB);
        assertEq(d, (START_TS + 86400) / 86400);
        assertEq(s, 2);
        assertEq(t, 2);
    }

    // (8) hasAgentId true/false.
    function test_HasAgentId() public {
        assertFalse(checkin.hasAgentId(ALICE));
        mockAgentId.setBalance(ALICE, 1);
        assertTrue(checkin.hasAgentId(ALICE));
        mockAgentId.setBalance(ALICE, 5);
        assertTrue(checkin.hasAgentId(ALICE));
        mockAgentId.setBalance(ALICE, 0);
        assertFalse(checkin.hasAgentId(ALICE));
    }

    // (9a) Pause blocks checkIn.
    function test_PauseBlocksCheckIn() public {
        mockAgentId.setBalance(ALICE, 1);

        vm.prank(OWNER);
        checkin.pause();
        assertTrue(checkin.paused());

        vm.prank(ALICE);
        vm.expectRevert(bytes4(keccak256("EnforcedPause()")));
        checkin.checkIn();

        vm.prank(OWNER);
        checkin.unpause();
        assertFalse(checkin.paused());

        vm.prank(ALICE);
        checkin.checkIn();
        assertEq(checkin.streak(ALICE), 1);
    }

    // (9b) Only owner can pause/unpause; non-owner reverts.
    function test_OnlyOwnerCanPauseAndUnpause() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        checkin.pause();

        vm.prank(OWNER);
        checkin.pause();

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ALICE));
        checkin.unpause();
    }

    // (10) Owner is the constructor owner.
    function test_OwnerIsConstructorOwner() public view {
        assertEq(checkin.owner(), OWNER);
    }

    // Extra: today() matches block.timestamp / 86400.
    function test_TodayMatchesTimestamp() public {
        assertEq(checkin.today(), START_TS / 86400);
        vm.warp(START_TS + 86399);
        assertEq(checkin.today(), START_TS / 86400);
        vm.warp(START_TS + 86400);
        assertEq(checkin.today(), START_TS / 86400 + 1);
    }

    // Extra: first check-in after deployment has streak = 1.
    function test_FirstCheckInStreakIsOne() public {
        mockAgentId.setBalance(BOB, 1);
        vm.prank(BOB);
        checkin.checkIn();
        assertEq(checkin.streak(BOB), 1);
    }
}
