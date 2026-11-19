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
  CONTRACT_ADDRESS: "0x1B1a24D9c111e620bF72BC7888B4Cbc781F492f7",

  DEPLOY_BLOCK: 134448379,

  // BSC mainnet chain id (do not change).
  CHAIN_ID: 56,

  // Public read-only BSC RPC for balance/contract reads and
  // event scanning. No API key needed.
  RPC_URL: "https://bsc-dataseed.binance.org/",

  // Agent ID contract on BNB Chain mainnet (do not change).
  AGENT_ID_CONTRACT: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
};
