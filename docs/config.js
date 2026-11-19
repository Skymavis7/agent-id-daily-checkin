// ============================================================
// Agent ID Daily Check-in — configuration
// ------------------------------------------------------------
// EDIT THESE THREE VALUES when the contract is deployed:
//   1. CONTRACT_ADDRESS — the deployed AgentDailyCheckin address
//   2. DEPLOY_BLOCK    — the block number the contract was
//                        deployed in (used to scan CheckedIn
//                        events for the leaderboard)
//   3. RPC_URL         — public read-only BSC RPC (optional;
//                        change only if the default stops working)
// Everything else below stays as-is.
// ============================================================

const CONFIG = {
  // TODO (coordinator): paste the deployed contract address here.
  CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",

  // TODO (coordinator): paste the deployment block number here.
  DEPLOY_BLOCK: 0,

  // BSC mainnet chain id (do not change).
  CHAIN_ID: 56,

  // Public read-only BSC RPC for balance/contract reads and
  // event scanning. No API key needed.
  RPC_URL: "https://bsc-dataseed.binance.org/",

  // Agent ID contract on BNB Chain mainnet (do not change).
  AGENT_ID_CONTRACT: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
};
