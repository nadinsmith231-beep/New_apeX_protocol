// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Desktop + Mobile) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Desktop & Mobile Wallet Detection')

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

  // 6️⃣ ENHANCED: Advanced mobile detection with browser-specific handling
  function isMobile() {
    const ua = navigator.userAgent.toLowerCase()
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/
    return mobileRegex.test(ua)
  }

  // 7️⃣ ENHANCED: Mobile browser detection
  function getMobileBrowser() {
    const ua = navigator.userAgent.toLowerCase()
    
    if (ua.includes('instagram')) return 'instagram'
    if (ua.includes('twitter') || ua.includes('tweetbot')) return 'twitter'
    if (ua.includes('fb') || ua.includes('facebook')) return 'facebook'
    if (ua.includes('chrome')) return 'chrome'
    if (ua.includes('safari') && !ua.includes('chrome')) return 'safari'
    if (ua.includes('samsung')) return 'samsung'
    if (ua.includes('ucbrowser')) return 'uc'
    
    return 'unknown'
  }

  // 8️⃣ ENHANCED: Mobile wallet detection with deep link testing
  async function detectMobileWallets() {
    return new Promise((resolve) => {
      const wallets = {
        metamask: false,
        trust: false,
        rainbow: false,
        coinbase: false,
        phantom: false,
        brave: false
      }

      // Test for injected providers first
      if (window.ethereum) {
        wallets.metamask = !!window.ethereum.isMetaMask
        wallets.trust = !!window.ethereum.isTrust
        wallets.rainbow = !!window.ethereum.isRainbow
        wallets.coinbase = !!window.ethereum.isCoinbaseWallet
        wallets.phantom = !!window.ethereum.isPhantom
        wallets.brave = !!window.ethereum.isBraveWallet
      }

      // Enhanced mobile-specific detection using timeout-based deep link testing
      const testDeepLinks = () => {
        const walletTests = {
          metamask: 'metamask://',
          trust: 'trust://',
          rainbow: 'rainbow://',
          coinbase: 'coinbasewallet://',
          phantom: 'phantom://',
          brave: 'brave://'
        }

        let testsCompleted = 0
        const testTimeout = 500

        Object.keys(walletTests).forEach(walletName => {
          const testLink = document.createElement('a')
          testLink.style.display = 'none'
          testLink.href = walletTests[walletName]
          
          const startTime = Date.now()
          let triggered = false
          
          window.addEventListener('blur', function blurHandler() {
            if (!triggered && Date.now() - startTime < 1000) {
              wallets[walletName] = true
              triggered = true
              window.removeEventListener('blur', blurHandler)
            }
          })
          
          document.body.appendChild(testLink)
          testLink.click()
          
          setTimeout(() => {
            document.body.removeChild(testLink)
            testsCompleted++
            
            if (testsCompleted === Object.keys(walletTests).length) {
              console.log('📱 Enhanced mobile wallet detection:', wallets)
              resolve(wallets)
            }
          }, testTimeout)
        })
      }

      // Run deep link tests for mobile
      if (isMobile()) {
        testDeepLinks()
      } else {
        resolve(wallets)
      }
    })
  }

  // 9️⃣ Wallet storage helpers
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

  // 🔟 Enhanced UI update functions
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

  // 1️⃣1️⃣ Initialize WalletConnect with enhanced modal styling
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
        mobileWallets: [
          {
            id: 'metamask',
            name: 'MetaMask',
            links: {
              native: 'metamask://',
              universal: 'https://metamask.app.link/wc'
            }
          },
          {
            id: 'trust',
            name: 'Trust Wallet',
            links: {
              native: 'trust://',
              universal: 'https://link.trustwallet.com/wc'
            }
          },
          {
            id: 'rainbow',
            name: 'Rainbow',
            links: {
              native: 'rainbow://',
              universal: 'https://rnbwapp.com/wc'
            }
          },
          {
            id: 'coinbase',
            name: 'Coinbase Wallet',
            links: {
              native: 'coinbasewallet://',
              universal: 'https://go.cb-w.com/wc'
            }
          }
        ]
      })

      console.log('✅ WalletConnect SignClient + Modal initialized')
      return true
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error)
      showStatus('Wallet connection service unavailable', 'error')
      return false
    }
  }

  // 1️⃣2️⃣ ENHANCED: Advanced Wallet Detection with Mobile Support
  async function detectInstalledWallets() {
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

    // Enhanced mobile wallet detection
    if (isMobile()) {
      const mobileWallets = await detectMobileWallets()
      Object.keys(mobileWallets).forEach(wallet => {
        if (mobileWallets[wallet]) {
          wallets[wallet] = true
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
    return wallets
  }

  // 1️⃣3️⃣ FIXED: Enhanced Desktop Wallet Connection
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
      return false
      
    } catch (error) {
      console.error('❌ Desktop wallet connection error:', error)
      return false
    }
  }

  // 1️⃣4️⃣ FIXED: Enhanced Mobile Wallet Connection
  async function connectMobileWallet() {
    try {
      console.log('📱 Mobile device detected - using enhanced mobile connection flow')
      
      // First try direct connection if any wallet is injected
      const detectedWallets = await detectMobileWallets()
      const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
      
      if (availableWallets.length > 0 && window.ethereum) {
        console.log(`📱 Found injected mobile wallet(s): ${availableWallets.join(', ')}`)
        
        try {
          const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
          })
          
          if (accounts && accounts.length > 0) {
            const account = accounts[0]
            console.log('✅ Mobile direct connection successful:', account)
            updateConnectedUI(account)
            saveWallet(account)
            return true
          }
        } catch (error) {
          console.warn('⚠️ Mobile direct connection failed:', error)
        }
      }
      
      // If direct connection fails, use enhanced WalletConnect with mobile-optimized flow
      console.log('🔄 Using WalletConnect for mobile connection...')
      return await connectViaWalletConnect()
      
    } catch (error) {
      console.error('❌ Mobile wallet connection error:', error)
      return false
    }
  }

  // 1️⃣5️⃣ FIXED: Enhanced WalletConnect Connection with Mobile Support
  async function connectViaWalletConnect() {
    try {
      // Initialize WalletConnect
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return false
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
        // ENHANCED: Mobile-specific handling with better deep linking
        if (isMobile()) {
          await openEnhancedMobileDeepLink(uri)
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
      
      return connectionSuccess
      
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
      
      return false
    }
  }

  // 1️⃣6️⃣ ENHANCED: Mobile Deep Linking with Fallback Strategy
  async function openEnhancedMobileDeepLink(uri) {
    const browser = getMobileBrowser()
    console.log(`📱 Detected mobile browser: ${browser}`)
    
    // Enhanced wallet deep links with universal support
    const walletLinks = {
      metamask: {
        native: `metamask://wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`
      },
      trust: {
        native: `trust://wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`
      },
      rainbow: {
        native: `rainbow://wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`
      },
      coinbase: {
        native: `coinbase-wallet://wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`
      },
      phantom: {
        native: `phantom://wc?uri=${encodeURIComponent(uri)}`,
        universal: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}?ref=${encodeURIComponent(window.location.origin)}`
      }
    }

    // Browser-specific handling
    const browserHandlers = {
      instagram: () => {
        showStatus('Please open in Safari/Chrome for wallet connection', 'error')
        modal.openModal({ uri })
        return true
      },
      twitter: () => {
        showStatus('Please open in Safari/Chrome for wallet connection', 'error')
        modal.openModal({ uri })
        return true
      },
      facebook: () => {
        showStatus('Please open in Safari/Chrome for wallet connection', 'error')
        modal.openModal({ uri })
        return true
      },
      safari: () => {
        // Safari can handle deep links better
        return tryUniversalDeepLink(walletLinks, uri)
      },
      chrome: () => {
        // Chrome on iOS has restrictions, use universal links
        return tryUniversalDeepLink(walletLinks, uri)
      },
      default: () => {
        // Try both native and universal links
        return tryEnhancedDeepLink(walletLinks, uri)
      }
    }

    const handler = browserHandlers[browser] || browserHandlers.default
    return await handler()
  }

  // 1️⃣7️⃣ Enhanced deep link execution
  async function tryEnhancedDeepLink(walletLinks, uri) {
    let success = false
    
    // Try detected wallets first
    const detectedWallets = await detectMobileWallets()
    const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
    
    // Priority order for wallet attempts
    const walletPriority = ['metamask', 'trust', 'coinbase', 'rainbow', 'phantom']
    
    for (const wallet of walletPriority) {
      if (availableWallets.includes(wallet) && walletLinks[wallet]) {
        console.log(`🎯 Trying detected wallet: ${wallet}`)
        success = await executeDeepLink(walletLinks[wallet].native, wallet)
        if (success) return true
      }
    }
    
    // If no detected wallets work, try universal links in priority order
    for (const wallet of walletPriority) {
      if (walletLinks[wallet]) {
        console.log(`🌐 Trying universal link for: ${wallet}`)
        success = await executeDeepLink(walletLinks[wallet].universal, wallet)
        if (success) return true
      }
    }
    
    // Final fallback to QR modal
    console.log('📱 All deep links failed, showing QR modal')
    setTimeout(() => {
      if (modal) {
        modal.openModal({ uri })
        showStatus('Scan QR code with your wallet app', 'info')
      }
    }, 1000)
    
    return false
  }

  async function tryUniversalDeepLink(walletLinks, uri) {
    // For restricted browsers, use universal links directly
    const universalPriority = ['metamask', 'trust', 'coinbase', 'rainbow']
    
    for (const wallet of universalPriority) {
      if (walletLinks[wallet]) {
        console.log(`🔗 Using universal link for: ${wallet}`)
        const success = await executeDeepLink(walletLinks[wallet].universal, wallet)
        if (success) return true
      }
    }
    return false
  }

  async function executeDeepLink(link, walletName) {
    return new Promise((resolve) => {
      let timer = null
      let appOpened = false
      
      const originalHref = window.location.href
      
      // Use iframe for universal links
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = link
      
      document.body.appendChild(iframe)
      
      // Set timeout to detect if app was opened
      timer = setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
        
        // If we're still on the same page, app opening failed
        if (window.location.href === originalHref && !appOpened) {
          console.log(`❌ ${walletName} deep link failed`)
          resolve(false)
        } else {
          appOpened = true
          resolve(true)
        }
      }, 2000)
      
      // Also try direct window location as backup
      setTimeout(() => {
        if (!appOpened) {
          window.location.href = link
        }
      }, 100)
      
      // Listen for page blur (indicates app opening)
      window.addEventListener('blur', function blurHandler() {
        appOpened = true
        clearTimeout(timer)
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
        window.removeEventListener('blur', blurHandler)
        console.log(`✅ ${walletName} app opening detected`)
        resolve(true)
      })
    })
  }

  // 1️⃣8️⃣ Handle session approval
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

  // 1️⃣9️⃣ FIXED: Enhanced Connect Wallet Function with Mobile Support
  async function connectWallet() {
    try {
      // Set loading state
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      // Enhanced device-specific connection flow
      if (isMobile()) {
        console.log('📱 Mobile detected - using enhanced mobile connection')
        await connectMobileWallet()
      } else {
        console.log('🖥️ Desktop detected - using enhanced desktop connection')
        
        // First try direct connection with installed wallets
        const directConnected = await connectDesktopWallet()
        if (!directConnected) {
          console.log('🔄 Direct connection not available, using WalletConnect...')
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

  // 2️⃣0️⃣ Disconnect wallet
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

  // 2️⃣1️⃣ Enhanced button click events
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

  // 2️⃣2️⃣ Restore saved wallet and session on page load
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

  // 2️⃣3️⃣ Enhanced session update listeners
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

  console.log('🚀 ApeX Protocol WalletConnect - Enhanced Mobile & Desktop Ready')
})
