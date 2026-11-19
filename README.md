# Agent ID Daily Check-in

A daily check-in dApp for holders of a Binance **Agent ID** on BNB Chain,
built for the [Binance Agent ID Hackathon](https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf)
(60,000 USDC prize pool, submission period 18 Nov – 9 Dec 2026).

Only an address that holds an Agent ID can check in, and only once per UTC
day. Each check-in records the user's current streak (consecutive days) and
lifetime total on-chain, and emits a `CheckedIn` event. A public leaderboard
is built from those events. Checking in is **free except for gas** — there is
no token, no fee, and no return or reward promised.

## How Agent ID is used

Agent ID is the on-chain name of a Binance Agentic Wallet (SPACE ID ERC-721,
non-transferable). The contract gates access with it:

- The contract stores the Agent ID contract address immutably.
- `checkIn()` calls `balanceOf(msg.sender)` on the Agent ID contract and
  reverts (`NotAgentIdHolder`) unless the caller holds at least one Agent ID.
- The frontend shows the same status via `hasAgentId(address)`.

Agent ID contract (BNB Chain mainnet, from the official announcement):
`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`

## Contract

- **Source:** `contracts/AgentDailyCheckin.sol` (Solidity ^0.8.24, MIT,
  OpenZeppelin `Ownable` + `Pausable`, no upgradeability, no payable
  functions, no token).
- **Deployed address (BNB Chain mainnet):** _TBD — fill in after deployment._
  Update `docs/config.js` (`CONTRACT_ADDRESS` + `DEPLOY_BLOCK`) when deployed.
- **Owner (admin):** `0x38986738E98CbDC845B80811D64C0fa4FcdfEb33`
- **Owner permissions (minimal, and the only admin powers):**
  - `pause()` / `unpause()` — pauses or resumes check-ins (emergency only).
  - Ownership transfer (standard OpenZeppelin `Ownable`).
  - The owner **cannot** mint, move, or withdraw any user funds (the contract
    holds no funds and has no withdrawal function), cannot change anyone's
    streak or totals, and cannot check in on anyone's behalf.
- **Functions:** `checkIn()`, `getUser(address)`, `hasAgentId(address)`,
  `today()`, `lastCheckInDay(address)`, `streak(address)`,
  `totalCheckIns(address)`, `paused()`, `owner()`, `agentIdContract()`.
- **Event:** `CheckedIn(address indexed user, uint256 day, uint256 streak, uint256 totalCheckIns)`.
- **Streak rule:** checking in on the day after your last check-in extends
  the streak by 1; any missed day resets it to 1. One check-in per address
  per UTC day (`block.timestamp / 86400`).

### Tests

```sh
forge test
```

13 tests, all passing: non-holder reverts, holder check-in + event, second
check-in same day reverts, streak increments on consecutive days, streak
resets after a missed day, totals increment, `getUser` / `hasAgentId`
correctness, pause blocks check-ins, only the owner can pause/unpause,
owner is the constructor owner, and the UTC-day boundary.

### Deploy

```sh
AGENT_ID_CONTRACT=0x60b9262456de011f7d15a54cdd8c48baaa8b022f \
OWNER=0x38986738E98CbDC845B80811D64C0fa4FcdfEb33 \
forge script script/Deploy.s.sol --rpc-url <BSC_RPC> --broadcast
```

Deployment costs ~481,281 gas (about 0.000024 BNB at 0.05 gwei, about
0.00048 BNB at 1 gwei). Verify the source on BscScan after deploying and
make the repo public (it is).

## Frontend

Static site in `docs/` (served by GitHub Pages):
https://skymavis7.github.io/agent-id-daily-checkin/

- Connect wallet via `window.ethereum` (MetaMask / Binance Wallet extension).
  **No QR-code login** — the site never asks for a QR code, a pairing code,
  a seed phrase, or a private key.
- Shows whether the connected wallet holds an Agent ID, the user's streak /
  total / last check-in day, the current UTC day and a countdown to the next
  one, and a public top-10 leaderboard built from `CheckedIn` events.
- The "Check In" button is disabled with a clear reason when the wallet is
  not connected, is not on BNB Chain mainnet (chain 56), holds no Agent ID,
  has already checked in today, or check-ins are paused.
- Reads go through the public BSC RPC; only the check-in transaction itself
  goes through the user's own wallet, and the user confirms it there.

Serve locally:

```sh
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```

Edit `docs/config.js` to point at the deployed contract
(`CONTRACT_ADDRESS`, `DEPLOY_BLOCK`).

## Safety

- This project never asks for, stores, or handles seed phrases, private
  keys, API secrets, or pairing codes.
- It never promises returns, earnings, or "passive income". Checking in is
  free except for gas.
- It does not impersonate Binance or BNB in its name, token, or domain.
- Agent ID is used only as an access check; the project never looks up
  other people's wallets by name.

## License

MIT — see `LICENSE`.
