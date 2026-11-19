// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentDailyCheckin} from "../contracts/AgentDailyCheckin.sol";

/// @notice Deploy AgentDailyCheckin.
/// @dev Usage (dry-run / local only — DO NOT run against mainnet without
///      Andi's explicit confirmation):
///      AGENT_ID_CONTRACT=0x60b9262456de011f7d15a54cdd8c48baaa8b022f \
///      OWNER=0x38986738E98CbDC845B80811D64C0fa4FcdfEb33 \
///      forge script script/Deploy.s.sol --rpc-url <RPC> --broadcast
///      Defaults: mainnet Agent ID contract + Andi's holder wallet as owner.
contract Deploy is Script {
    address public constant DEFAULT_AGENT_ID_CONTRACT =
        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F; // EIP-55 checksum of 0x60b9...022f
    address public constant DEFAULT_OWNER = 0x38986738E98CbDC845B80811D64C0fa4FcdfEb33;

    function run() external returns (AgentDailyCheckin deployed) {
        address agentIdContract = vm.envOr("AGENT_ID_CONTRACT", DEFAULT_AGENT_ID_CONTRACT);
        address owner = vm.envOr("OWNER", DEFAULT_OWNER);

        console.log("Agent ID contract:", agentIdContract);
        console.log("Owner:             ", owner);
        console.log("Deployer:          ", msg.sender);

        vm.startBroadcast();
        deployed = new AgentDailyCheckin(agentIdContract, owner);
        vm.stopBroadcast();

        console.log("AgentDailyCheckin deployed at:", address(deployed));
    }
}
