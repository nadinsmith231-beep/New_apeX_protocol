// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Desktop + Mobile) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Desktop + Mobile Wallet Detection')

  // 1️⃣ Reference buttons from HTML
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal

  // 2️⃣ Button state management with enhanced UI styling
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
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px"></i> Connecting...'
        break
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
        button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 8px"></i> Connected'
        break
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
        button.innerHTML = '<i class="fas fa-power-off" style="margin-right: 8px"></i> Disconnect'
        break
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 8px"></i> Failed'
        
        setTimeout(() => {
          setButtonState(button, 'normal')
        }, 3000)
        break
      case 'normal':
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)'
        button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)'
        button.innerHTML = '<i class="fas fa-wallet" style="margin-right: 8px"></i> Connect Wallet to Mint'
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

  // 3️⃣ Enhanced status message display
  function showStatus(message, type = 'info') {
    if (claimStatus) {
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
      
      switch (type) {
        case 'success':
          claimStatus.style.background = 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)'
          claimStatus.style.color = '#166534'
          claimStatus.style.border = '1px solid #86EFAC'
          break
        case 'error':
          claimStatus.style.background = 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)'
          claimStatus.style.color = '#991B1B'
          claimStatus.style.border = '1px solid #FCA5A5'
          break
        case 'info':
        default:
          claimStatus.style.background = 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)'
          claimStatus.style.color = '#1E40AF'
          claimStatus.style.border = '1px solid #93C5FD'
          break
      }
      
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
  }

  // 4️⃣ Initialize buttons with enhanced styling
  setButtonState(connectButton, 'normal')
  if (walletButton) setButtonState(walletButton, 'normal')

  // 5️⃣ WalletConnect constants
  const projectId = 'ea2ef1ec737f10116a4329a7c5629979'
  const metadata = {
    name: 'ApeX Protocol',
    description: 'AI-Optimized Yield Farming DApp',
    url: window.location.origin,
    icons: ['https://walletconnect.com/walletconnect-logo.png'],
  }

  // 6️⃣ ENHANCED: Advanced mobile detection with platform-specific handling
  function isMobile() {
    const userAgent = navigator.userAgent.toLowerCase()
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/
    return mobileRegex.test(userAgent)
  }

  // 7️⃣ ENHANCED: Mobile platform detection for better deep linking
  function getMobilePlatform() {
    const userAgent = navigator.userAgent.toLowerCase()
    if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) {
      return 'ios'
    } else if (userAgent.includes('android')) {
      return 'android'
    }
    return 'unknown'
  }

  // 8️⃣ Wallet storage helpers - ENHANCED FOR PERSISTENCE
  function saveWallet(address, session = null) { 
    localStorage.setItem('connectedWallet', address)
    if (session) {
      localStorage.setItem('walletConnectSession', JSON.stringify(session))
    }
  }
  
  function getSavedWallet() { 
    return localStorage.getItem('connectedWallet') 
  }
  
  function getSavedSession() {
    const session = localStorage.getItem('walletConnectSession')
    return session ? JSON.parse(session) : null
  }
  
  function clearSavedWallet() { 
    localStorage.removeItem('connectedWallet')
    localStorage.removeItem('walletConnectSession')
  }

  // 9️⃣ Enhanced UI update functions
  function updateConnectedUI(address) {
    setButtonState(connectButton, 'disconnect')
    if (walletButton) setButtonState(walletButton, 'disconnect')

    let display = document.getElementById('connectedAddressDisplay')
    if (!display) {
      display = document.createElement('div')
      display.id = 'connectedAddressDisplay'
      display.style.marginTop = '12px'
      display.style.padding = '10px 16px'
      display.style.fontFamily = "'JetBrains Mono', 'Monaco', 'Consolas', monospace"
      display.style.fontSize = '14px'
      display.style.color = '#059669'
      display.style.textAlign = 'center'
      display.style.background = 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)'
      display.style.borderRadius = '8px'
      display.style.border = '1px solid #A7F3D0'
      display.style.boxShadow = '0 2px 8px rgba(5, 150, 105, 0.1)'
      
      connectButton.parentNode.appendChild(display)
    }
    
    const formattedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`
    display.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <i class="fas fa-check-circle" style="color: #059669;"></i>
        <span>Connected: ${formattedAddress}</span>
        <button id="copyAddress" style="background: none; border: none; color: #059669; cursor: pointer; padding: 4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `
    
    // Add copy functionality
    document.getElementById('copyAddress').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const copyBtn = document.getElementById('copyAddress')
        const originalIcon = copyBtn.innerHTML
        copyBtn.innerHTML = '<i class="fas fa-check"></i>'
        copyBtn.style.color = '#10B981'
        setTimeout(() => {
          copyBtn.innerHTML = originalIcon
          copyBtn.style.color = '#059669'
        }, 2000)
      })
    })
    
    showStatus('Wallet connected successfully!', 'success')
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal')
    if (walletButton) setButtonState(walletButton, 'normal')

    const display = document.getElementById('connectedAddressDisplay')
    if (display) display.remove()
    
    showStatus('Wallet disconnected', 'info')
  }

  // 🔟 Initialize WalletConnect with enhanced modal styling
  async function initWalletConnect() {
    if (client && modal) return

    try {
      client = await SignClient.init({ 
        projectId, 
        metadata,
        relayUrl: 'wss://relay.walletconnect.com'
      })

      modal = new WalletConnectModal({
        projectId,
        themeMode: 'dark',
        themeVariables: {
          '--wcm-z-index': '9999',
          '--wcm-accent-color': '#FF6B00',
          '--wcm-background-color': '#1F2937',
          '--wcm-font-family': "'Inter', sans-serif"
        },
        enableExplorer: true,
        explorerRecommendedWalletIds: [
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
          "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
          "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // Coinbase Wallet
          "ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18", // Zerion
        ],
        explorerExcludedWalletIds: [],
      })

      console.log('✅ WalletConnect SignClient + Modal initialized')
      return true
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error)
      showStatus('Wallet connection service unavailable', 'error')
      return false
    }
  }

  // 1️⃣1️⃣ ENHANCED: Advanced Mobile Wallet Detection with User Agent Analysis
  function detectMobileWallets() {
    return new Promise((resolve) => {
      const userAgent = navigator.userAgent.toLowerCase()
      const wallets = {
        metamask: userAgent.includes('metamask') || 
                  (typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask),
        trust: userAgent.includes('trust') || 
               (typeof window.ethereum !== 'undefined' && window.ethereum.isTrust),
        rainbow: userAgent.includes('rainbow') || 
                 (typeof window.ethereum !== 'undefined' && window.ethereum.isRainbow),
        coinbase: userAgent.includes('coinbase') || 
                  (typeof window.ethereum !== 'undefined' && window.ethereum.isCoinbaseWallet),
        phantom: userAgent.includes('phantom') || 
                 (typeof window.ethereum !== 'undefined' && window.ethereum.isPhantom),
        brave: userAgent.includes('brave') || 
               (typeof window.ethereum !== 'undefined' && window.ethereum.isBraveWallet),
      }

      console.log('📱 Enhanced mobile wallet detection:', wallets)
      resolve(wallets)
    })
  }

  // 1️⃣2️⃣ FIXED: Enhanced Desktop Wallet Connection with Multi-Wallet Support
  async function connectDesktopWallet() {
    try {
      // ENHANCED: Mobile devices should use WalletConnect for better compatibility
      if (isMobile()) {
        console.log('📱 Mobile device detected - using WalletConnect flow')
        return false
      }

      // Enhanced detection for EIP-6963 providers
      if (window.eip6963Providers && window.eip6963Providers.length > 0) {
        console.log('🎯 EIP-6963 providers detected:', window.eip6963Providers.map(p => p.info.name))
        const provider = window.eip6963Providers[0].provider
        try {
          const accounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          })
          if (accounts && accounts.length > 0) {
            console.log('✅ EIP-6963 wallet connection successful:', accounts[0])
            updateConnectedUI(accounts[0])
            saveWallet(accounts[0])
            return true
          }
        } catch (error) {
          console.warn('⚠️ EIP-6963 wallet connection failed:', error)
        }
      }

      // Traditional provider detection
      if (typeof window.ethereum !== 'undefined') {
        let provider = window.ethereum
        
        // Handle multiple providers
        if (window.ethereum.providers && window.ethereum.providers.length > 0) {
          provider = window.ethereum.providers[0]
          
          // Try to find MetaMask first (most common)
          const metamaskProvider = window.ethereum.providers.find(p => p.isMetaMask)
          if (metamaskProvider) provider = metamaskProvider
        }

        try {
          const accounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          })
          
          if (accounts && accounts.length > 0) {
            console.log('✅ Direct wallet connection successful:', accounts[0])
            updateConnectedUI(accounts[0])
            saveWallet(accounts[0])
            return true
          }
        } catch (error) {
          console.warn('⚠️ Direct wallet connection failed:', error)
        }
      }
      
      console.log('🔍 No compatible wallets detected for direct connection')
      return false
      
    } catch (error) {
      console.error('❌ Desktop wallet connection error:', error)
      return false
    }
  }

  // 1️⃣3️⃣ FIXED: Enhanced WalletConnect Connection with Better Mobile Support
  async function connectViaWalletConnect() {
    try {
      // Initialize WalletConnect
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return
      }

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
        if (isMobile()) {
          // ENHANCED: Use improved deep linking for mobile
          await openMobileWalletDeepLink(uri)
        } else {
          // Desktop - use QR modal
          modal.openModal({ uri })
          showStatus('Select your wallet from the list or scan QR code', 'info')
        }
      }

      // Wait for user approval with timeout
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 60000)
        )
      ])
      
      if (modal) modal.closeModal()
      
      const connectionSuccess = handleConnectedSession(session)
      if (!connectionSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
      }
      
    } catch (err) {
      console.error('❌ WalletConnect connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      
      if (modal) modal.closeModal()
      
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Wallet connection failed', 'error')
      }
    }
  }

  // 1️⃣4️⃣ FIXED: Enhanced Mobile Deep Linking with Platform-Specific Handling
  async function openMobileWalletDeepLink(uri) {
    const platform = getMobilePlatform()
    console.log(`📱 Mobile platform detected: ${platform}`)

    // Enhanced deep link mapping with platform-specific URLs
    const deepLinks = {
      metamask: {
        android: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
        ios: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`
      },
      trust: {
        android: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
        ios: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`
      },
      rainbow: {
        android: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
        ios: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`
      },
      coinbase: {
        android: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
        ios: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`
      },
      phantom: {
        android: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
        ios: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
        universal: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`
      }
    }

    // Universal WalletConnect fallback
    const universalLink = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`

    // ENHANCED: Try multiple deep linking strategies
    const tryDeepLink = (link, walletName) => {
      return new Promise((resolve) => {
        console.log(`🔗 Attempting to open ${walletName}...`)
        
        // Strategy 1: Direct window location (most reliable for mobile)
        const openDirect = () => {
          window.location.href = link
        }

        // Strategy 2: Hidden iframe (for universal links)
        const openIframe = () => {
          const iframe = document.createElement('iframe')
          iframe.style.display = 'none'
          iframe.src = link
          document.body.appendChild(iframe)
          
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe)
            }
          }, 3000)
        }

        // Strategy 3: Window open (fallback)
        const openWindow = () => {
          window.open(link, '_blank')
        }

        // Execute all strategies with delays
        openDirect()
        
        setTimeout(() => {
          openIframe()
        }, 100)
        
        setTimeout(() => {
          openWindow()
        }, 200)

        // Consider it successful if we've attempted all methods
        setTimeout(() => {
          console.log(`✅ Deep link attempts completed for ${walletName}`)
          resolve(true)
        }, 500)
      })
    }

    // ENHANCED: Smart wallet selection based on platform and user agent
    const detectedWallets = await detectMobileWallets()
    const platformLinks = {}

    // Build platform-specific link list
    Object.keys(deepLinks).forEach(wallet => {
      if (deepLinks[wallet][platform]) {
        platformLinks[wallet] = deepLinks[wallet][platform]
      } else if (deepLinks[wallet].universal) {
        platformLinks[wallet] = deepLinks[wallet].universal
      }
    })

    // Priority order for wallet attempts
    const walletPriority = ['metamask', 'trust', 'coinbase', 'rainbow', 'phantom']

    // Try detected wallets first
    for (const wallet of walletPriority) {
      if (detectedWallets[wallet] && platformLinks[wallet]) {
        console.log(`🎯 Trying detected mobile wallet: ${wallet}`)
        await tryDeepLink(platformLinks[wallet], wallet)
        showStatus(`Opening ${wallet}...`, 'info')
        return true
      }
    }

    // If no specific wallet detected, try all in priority order
    for (const wallet of walletPriority) {
      if (platformLinks[wallet]) {
        console.log(`🔄 Trying mobile wallet: ${wallet}`)
        await tryDeepLink(platformLinks[wallet], wallet)
        showStatus(`Opening ${wallet}...`, 'info')
        return true
      }
    }

    // Final fallback to universal link
    console.log('🌐 Using universal WalletConnect link')
    await tryDeepLink(universalLink, 'Universal WalletConnect')
    showStatus('Opening wallet...', 'info')

    // As final fallback, show QR modal after delay
    setTimeout(() => {
      if (modal && !document.querySelector('.wcm-modal')) {
        console.log('📱 Showing QR modal as final fallback')
        modal.openModal({ uri })
        showStatus('Scan QR code with your wallet', 'info')
      }
    }, 2000)

    return true
  }

  // 1️⃣5️⃣ Handle session approval
  function handleConnectedSession(session) {
    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2]
      console.log('✅ Connected wallet:', account)
      currentSession = session
      updateConnectedUI(account)
      saveWallet(account, session)
      return true
    } else {
      console.error('❌ No accounts found in session')
      showStatus('No accounts found in wallet', 'error')
      return false
    }
  }

  // 1️⃣6️⃣ FIXED: Enhanced Connect Wallet Function with Better Mobile Flow
  async function connectWallet() {
    try {
      // Set loading state
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      // ENHANCED: Mobile-specific connection flow
      if (isMobile()) {
        console.log('📱 Mobile connection flow initiated')
        await connectViaWalletConnect()
      } else {
        console.log('🖥️ Desktop connection flow initiated')
        
        // Try direct connection first
        const directConnected = await connectDesktopWallet()
        if (!directConnected) {
          // Fallback to WalletConnect
          console.log('🔄 Direct connection failed, using WalletConnect')
          await connectViaWalletConnect()
        }
      }
      
    } catch (err) {
      console.error('❌ Wallet connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Wallet connection failed', 'error')
      }
    }
  }

  // 1️⃣7️⃣ Disconnect wallet
  async function disconnectWallet() {
    try {
      if (currentSession) {
        await client.disconnect({
          topic: currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        })
        currentSession = null
      }
    } catch (err) {
      console.warn('⚠️ Disconnect error:', err)
    }

    resetConnectedUI()
    clearSavedWallet()
  }

  // 1️⃣8️⃣ Enhanced button click events
  const handleClick = async () => {
    const saved = getSavedWallet()
    if (saved && currentSession) {
      await disconnectWallet()
    } else {
      await connectWallet()
    }
  }

  if (connectButton) {
    connectButton.addEventListener('click', handleClick)
  }
  
  if (walletButton) {
    walletButton.addEventListener('click', handleClick)
  }

  // 1️⃣9️⃣ Restore saved wallet and session on page load
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedSession = getSavedSession()
    
    if (savedWallet && savedSession) {
      console.log('♻️ Restoring saved wallet and session:', savedWallet)
      
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        console.log('❌ Failed to initialize WalletConnect for session restoration')
        clearSavedWallet()
        return
      }

      try {
        const session = client.session.get(savedSession.topic)
        if (session) {
          currentSession = session
          updateConnectedUI(savedWallet)
          console.log('✅ Wallet session restored successfully')
          showStatus('Wallet connection restored', 'success')
        } else {
          console.log('❌ Session not found, clearing saved data')
          clearSavedWallet()
        }
      } catch (error) {
        console.error('❌ Error restoring session:', error)
        clearSavedWallet()
      }
    } else if (savedWallet && !savedSession) {
      console.log('♻️ Restoring direct wallet connection:', savedWallet)
      updateConnectedUI(savedWallet)
      showStatus('Wallet connection restored', 'success')
    }
  }

  // Initialize and restore connection on page load
  await restoreWalletConnection()

  // 2️⃣0️⃣ Enhanced session update listeners
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        console.log('🔄 Session updated:', params)
        const accounts = params.namespaces?.eip155?.accounts
        if (accounts?.length) {
          const account = accounts[0].split(':')[2]
          updateConnectedUI(account)
          showStatus('Wallet session updated', 'info')
        }
      })

      client.on('session_delete', () => {
        console.log('🗑️ Session deleted')
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Wallet disconnected by provider', 'error')
      })

      client.on('session_event', (event) => {
        console.log('📨 Session event:', event)
      })

      client.on('session_connect', (session) => {
        console.log('🔗 Session connected:', session)
        handleConnectedSession(session)
      })
    }
  }, 1000)

  // 2️⃣1️⃣ FIXED: Enhanced EIP-6963 Provider Discovery
  function setupEIP6963() {
    if (typeof window !== 'undefined') {
      if (!window.eip6963Providers) {
        window.eip6963Providers = []
      }

      window.addEventListener('eip6963:announceProvider', (event) => {
        console.log('🎯 EIP-6963 Provider detected:', event.detail.info.name)
        
        const exists = window.eip6963Providers.some(
          p => p.info.uuid === event.detail.info.uuid
        )
        
        if (!exists) {
          window.eip6963Providers.push(event.detail)
          console.log(`✅ Added EIP-6963 provider: ${event.detail.info.name}`)
        }
      })

      window.dispatchEvent(new Event('eip6963:requestProvider'))
      
      setTimeout(() => {
        window.dispatchEvent(new Event('eip6963:requestProvider'))
      }, 1000)
    }
  }

  // Initialize EIP-6963 provider discovery
  setupEIP6963()

  // 2️⃣2️⃣ Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      console.log('🔍 Page visible, checking connection state...')
    }
  })

  // 2️⃣3️⃣ Enhanced error handling
  window.addEventListener('beforeunload', () => {
    if (modal) {
      modal.closeModal()
    }
  })

  // 2️⃣4️⃣ Enhanced Provider Change Detection
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        console.log('🔒 Accounts disconnected')
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Wallet disconnected', 'info')
      } else {
        console.log('🔄 Accounts changed:', accounts[0])
        updateConnectedUI(accounts[0])
        saveWallet(accounts[0])
      }
    })

    window.ethereum.on('chainChanged', (chainId) => {
      console.log('🔄 Chain changed:', chainId)
      showStatus(`Network changed to ${chainId}`, 'info')
    })

    window.ethereum.on('disconnect', () => {
      console.log('🔒 Provider disconnected')
      resetConnectedUI()
      clearSavedWallet()
      showStatus('Wallet disconnected', 'info')
    })
  }
})
