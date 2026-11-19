// Agent ID Daily Check-in — frontend logic.
// Read-only reads go through the public BSC RPC. Only the actual
// check-in transaction is sent through the user's own wallet.
// No private keys are ever handled here.

(function () {
  "use strict";

  var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  var isDeployed = CONFIG.CONTRACT_ADDRESS &&
    CONFIG.CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS;

  var ABI = [
    "function checkIn()",
    "function getUser(address) view returns (uint256 lastCheckInDay, uint256 streak, uint256 totalCheckIns)",
    "function hasAgentId(address) view returns (bool)",
    "function today() view returns (uint256)",
    "function lastCheckInDay(address) view returns (uint256)",
    "function streak(address) view returns (uint256)",
    "function totalCheckIns(address) view returns (uint256)",
    "function paused() view returns (bool)",
    "function owner() view returns (address)",
    "function agentIdContract() view returns (address)",
    "event CheckedIn(address indexed user, uint256 day, uint256 streak, uint256 totalCheckIns)",
  ];

  // ---- DOM helpers ----
  function el(id) { return document.getElementById(id); }
  function show(id) { el(id).classList.remove("hidden"); }
  function hide(id) { el(id).classList.add("hidden"); }
  function setText(id, text) { el(id).textContent = text; }

  // ---- State ----
  var readProvider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  var readContract = isDeployed
    ? new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, readProvider)
    : null;
  var browserProvider = null;
  var signer = null;
  var account = null;
  var chainId = null;
  var contractPaused = false;
  var userHasAgentId = false;
  var userLastDay = null; // BigInt or null
  var todayDay = null;    // BigInt from chain, falls back to local UTC day

  // UTC day number: days since the Unix epoch, UTC.
  function localUtcDay() {
    return BigInt(Math.floor(Date.now() / 86400000));
  }

  function shortAddr(addr) {
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  // ---- Countdown to next UTC day ----
  function tickCountdown() {
    var now = new Date();
    var nextMidnight = Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0
    );
    var ms = nextMidnight - now.getTime();
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    function pad(n) { return String(n).padStart(2, "0"); }
    setText("countdown", pad(h) + ":" + pad(m) + ":" + pad(s));
    setText("utc-day", String(localUtcDay()));
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ---- Check-in button state ----
  function refreshCheckinButton() {
    var btn = el("checkin-btn");
    var reason = el("checkin-reason");

    if (!isDeployed) {
      btn.disabled = true;
      reason.textContent = "The check-in contract has not been deployed yet.";
      return;
    }
    if (!account) {
      btn.disabled = true;
      reason.textContent = "Connect your wallet to check in.";
      return;
    }
    if (chainId !== CONFIG.CHAIN_ID) {
      btn.disabled = true;
      reason.textContent = "Switch your wallet to BNB Chain mainnet (chain 56) to check in.";
      return;
    }
    if (contractPaused) {
      btn.disabled = true;
      reason.textContent = "Check-ins are currently paused by the contract owner.";
      return;
    }
    if (!userHasAgentId) {
      btn.disabled = true;
      reason.textContent = "This wallet does not hold an Agent ID, so it cannot check in.";
      return;
    }
    if (todayDay !== null && userLastDay !== null && userLastDay >= todayDay) {
      btn.disabled = true;
      reason.textContent = "You have already checked in today. Come back after the next UTC day.";
      return;
    }
    btn.disabled = false;
    reason.textContent = "Ready — checking in is free except for gas.";
  }

  // ---- Load contract + user state (read-only) ----
  async function refreshOnChainState() {
    if (!isDeployed) {
      setText("contract-status", "Contract status: not deployed yet.");
      setText("stat-streak", "—");
      setText("stat-total", "—");
      setText("stat-last", "—");
      refreshCheckinButton();
      return;
    }
    try {
      var results = await Promise.all([
        readContract.paused(),
        readContract.today(),
      ]);
      contractPaused = results[0];
      todayDay = results[1];
      setText(
        "contract-status",
        "Contract status: " + (contractPaused ? "paused" : "live") +
        " — contract day (UTC): " + todayDay.toString()
      );
    } catch (err) {
      console.error("Failed to read contract state:", err);
      setText("contract-status", "Contract status: could not be read (RPC error).");
    }

    if (account) {
      try {
        var user = await readContract.getUser(account);
        userHasAgentId = await readContract.hasAgentId(account);
        userLastDay = user.lastCheckInDay;
        setText("stat-streak", user.streak.toString());
        setText("stat-total", user.totalCheckIns.toString());
        setText("stat-last", user.lastCheckInDay.toString() === "0"
          ? "never" : user.lastCheckInDay.toString());
        setText(
          "agent-id-status",
          userHasAgentId
            ? "✓ This wallet holds an Agent ID."
            : "✗ This wallet does not hold an Agent ID."
        );
        show("agent-id-status");
      } catch (err) {
        console.error("Failed to read user state:", err);
        setText("agent-id-status", "Could not read your Agent ID status (RPC error).");
        show("agent-id-status");
      }
    } else {
      userHasAgentId = false;
      userLastDay = null;
      setText("stat-streak", "—");
      setText("stat-total", "—");
      setText("stat-last", "—");
      hide("agent-id-status");
    }
    refreshCheckinButton();
  }

  // ---- Leaderboard: aggregate CheckedIn events ----
  async function loadLeaderboard() {
    var status = el("leaderboard-status");
    var list = el("leaderboard");
    list.innerHTML = "";

    if (!isDeployed) {
      status.textContent = "The leaderboard will appear once the check-in contract is deployed.";
      return;
    }
    try {
      var latest = await readProvider.getBlockNumber();
      var from = CONFIG.DEPLOY_BLOCK || 0;
      var topic = ethers.id("CheckedIn(address,uint256,uint256,uint256)");
      var perUser = {}; // address -> { streak, total }
      var CHUNK = 10000; // keep each eth_getLogs call small for public RPCs

      for (var start = from; start <= latest; start += CHUNK) {
        var end = Math.min(start + CHUNK - 1, latest);
        var logs = await readProvider.getLogs({
          address: CONFIG.CONTRACT_ADDRESS,
          fromBlock: start,
          toBlock: end,
          topics: [topic],
        });
        logs.forEach(function (log) {
          var parsed = readContract.interface.parseLog(log);
          var user = parsed.args.user;
          perUser[user] = {
            streak: parsed.args.streak,
            total: parsed.args.totalCheckIns,
          };
        });
      }

      var rows = Object.keys(perUser).map(function (user) {
        return { user: user, streak: perUser[user].streak, total: perUser[user].total };
      });
      // Rank by streak, then by total check-ins.
      rows.sort(function (a, b) {
        if (a.streak !== b.streak) return a.streak > b.streak ? -1 : 1;
        if (a.total !== b.total) return a.total > b.total ? -1 : 1;
        return 0;
      });
      var top = rows.slice(0, 10);

      if (top.length === 0) {
        status.textContent = "No check-ins yet. Be the first!";
        return;
      }
      status.textContent = "";
      top.forEach(function (row, i) {
        var li = document.createElement("li");
        li.innerHTML = "";
        var addr = document.createElement("span");
        addr.className = "mono";
        addr.textContent = shortAddr(row.user);
        li.appendChild(document.createTextNode("#" + (i + 1) + " "));
        li.appendChild(addr);
        li.appendChild(document.createTextNode(
          " — " + row.streak.toString() + " day streak · " +
          row.total.toString() + " total"
        ));
        list.appendChild(li);
      });
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
      status.textContent = "Could not load the leaderboard (RPC error). Please try again later.";
    }
  }

  // ---- Wallet connection ----
  async function connectWallet() {
    if (!window.ethereum) {
      setText("wallet-status", "No wallet detected. Install MetaMask or the Binance Wallet extension, then reload this page.");
      return;
    }
    try {
      browserProvider = new ethers.BrowserProvider(window.ethereum);
      var accounts = await browserProvider.send("eth_requestAccounts", []);
      account = accounts[0];
      signer = await browserProvider.getSigner();
      var network = await browserProvider.getNetwork();
      chainId = Number(network.chainId);
      setText("wallet-status", "Connected.");
      setText("wallet-address", account);
      show("wallet-address");
      el("connect-btn").textContent = "Connected";
      el("connect-btn").disabled = true;
      updateNetworkWarning();
      await refreshOnChainState();
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setText("wallet-status", "Connection failed: " + (err && err.message ? err.message : err));
    }
  }

  function updateNetworkWarning() {
    if (account && chainId !== null && chainId !== CONFIG.CHAIN_ID) {
      show("network-warning");
      show("switch-network-btn");
    } else {
      hide("network-warning");
      hide("switch-network-btn");
    }
  }

  async function switchNetwork() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CONFIG.CHAIN_ID.toString(16) }],
      });
    } catch (err) {
      // 4902 = chain not added to the wallet; add BNB Chain mainnet.
      if (err && err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + CONFIG.CHAIN_ID.toString(16),
              chainName: "BNB Chain",
              nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
              rpcUrls: [CONFIG.RPC_URL],
              blockExplorerUrls: ["https://bscscan.com"],
            }],
          });
        } catch (addErr) {
          console.error("Adding BNB Chain failed:", addErr);
          setText("wallet-status", "Could not add BNB Chain to your wallet: " + (addErr && addErr.message ? addErr.message : addErr));
        }
      } else {
        console.error("Network switch failed:", err);
      }
    }
  }

  // ---- Check-in transaction ----
  async function doCheckIn() {
    if (!signer || !isDeployed) return;
    var btn = el("checkin-btn");
    var txStatus = el("tx-status");
    btn.disabled = true;
    show("tx-status");
    setText("tx-status", "Waiting for you to confirm the transaction in your wallet…");
    try {
      var contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);
      var tx = await contract.checkIn();
      setText("tx-status", "Transaction sent: " + tx.hash + " — waiting for confirmation…");
      await tx.wait();
      setText("tx-status", "✓ Checked in! Transaction: " + tx.hash);
      await refreshOnChainState();
      await loadLeaderboard();
    } catch (err) {
      console.error("Check-in failed:", err);
      var msg = err && err.message ? err.message : String(err);
      // Shorten common revert / rejection messages for display.
      if (msg.length > 300) msg = msg.slice(0, 300) + "…";
      setText("tx-status", "Check-in failed: " + msg);
      refreshCheckinButton();
    }
  }

  // ---- Wire up ----
  el("connect-btn").addEventListener("click", connectWallet);
  el("switch-network-btn").addEventListener("click", switchNetwork);
  el("checkin-btn").addEventListener("click", doCheckIn);

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", function (accounts) {
      account = accounts && accounts.length > 0 ? accounts[0] : null;
      if (!account) {
        signer = null;
        setText("wallet-status", "Not connected.");
        hide("wallet-address");
        var btn = el("connect-btn");
        btn.textContent = "Connect Wallet";
        btn.disabled = false;
      } else {
        setText("wallet-address", account);
      }
      refreshOnChainState();
    });
    window.ethereum.on("chainChanged", function (newChainId) {
      chainId = parseInt(newChainId, 16);
      updateNetworkWarning();
      refreshCheckinButton();
    });
  } else {
    setText("wallet-status", "No wallet detected. Install MetaMask or the Binance Wallet extension, then reload this page.");
    el("connect-btn").disabled = true;
  }

  if (isDeployed) {
    setText("footer-contract", CONFIG.CONTRACT_ADDRESS);
  }

  refreshOnChainState();
  loadLeaderboard();
})();
