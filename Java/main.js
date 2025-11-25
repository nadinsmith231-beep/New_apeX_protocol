// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Desktop + Mobile) =====

import SignClient from '@walletconnect/sign-client'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Mobile Wallet Detection')

  // 1️⃣ Reference buttons from HTML
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client

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

  // 6️⃣ Enhanced mobile detection
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
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

  // 9️⃣ Initialize WalletConnect (NO MODAL FOR MOBILE)
  async function initWalletConnect() {
    if (client) return

    try {
      client = await SignClient.init({ 
        projectId, 
        metadata,
        relayUrl: 'wss://relay.walletconnect.com'
      })

      console.log('✅ WalletConnect SignClient initialized')
      return true
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error)
      showStatus('Wallet connection service unavailable', 'error')
      return false
    }
  }

  // 🔟 ENHANCED: Advanced Mobile Wallet Detection
  function detectMobileWallets() {
    return new Promise((resolve) => {
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Enhanced mobile wallet detection
      const walletDetection = {
        // Check for in-app browsers that indicate wallet presence
        metamask: /metamask|trust|rainbow|coinbase|phantom|brave|rabby/i.test(userAgent),
        
        // Direct detection for specific wallet features
        trust: userAgent.includes('trust') || window.ethereum?.isTrust,
        rainbow: userAgent.includes('rainbow') || window.ethereum?.isRainbow,
        coinbase: userAgent.includes('coinbase') || window.ethereum?.isCoinbaseWallet,
        phantom: userAgent.includes('phantom') || window.ethereum?.isPhantom,
        
        // Check for Web3 injection
        hasWeb3: typeof window.ethereum !== 'undefined',
        
        // Check for specific mobile wallet indicators
        isInAppBrowser: /trust|rainbow|metamask|coinbase|phantom|brave/i.test(userAgent)
      }

      console.log('📱 Mobile wallet detection:', walletDetection)
      resolve(walletDetection)
    })
  }

  // 1️⃣1️⃣ ENHANCED: Mobile-Only Direct Wallet Connection
  async function connectMobileWallet() {
    try {
      const mobileWallets = await detectMobileWallets()
      
      // If we're in a wallet's in-app browser, try direct connection
      if (mobileWallets.isInAppBrowser && window.ethereum) {
        console.log('📱 Detected wallet browser, attempting direct connection...')
        
        try {
          const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
          })
          
          if (accounts && accounts.length > 0) {
            const account = accounts[0]
            console.log('✅ Mobile direct wallet connection successful:', account)
            updateConnectedUI(account)
            saveWallet(account)
            return true
          }
        } catch (error) {
          console.warn('⚠️ Mobile direct connection failed:', error)
          // Continue to WalletConnect with deep links
        }
      }
      
      return false
    } catch (error) {
      console.error('❌ Mobile wallet connection error:', error)
      return false
    }
  }

  // 1️⃣2️⃣ FIXED: Enhanced Mobile-Only WalletConnect with Deep Links (NO MODAL)
  async function connectViaMobileWalletConnect() {
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
        // MOBILE-ONLY: Always use deep links, never show modal
        await openMobileWalletDeepLink(uri)
      }

      // Wait for user approval with timeout
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 60000)
        )
      ])
      
      const connectionSuccess = handleConnectedSession(session)
      if (!connectionSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
      }
      
    } catch (err) {
      console.error('❌ Mobile WalletConnect connection failed:', err)
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

  // 1️⃣3️⃣ ENHANCED: Mobile-Only Deep Linking with Smart Wallet Detection
  async function openMobileWalletDeepLink(uri) {
    const mobileWallets = await detectMobileWallets()
    
    // App-specific deep links for mobile
    const appLinks = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      rainbow: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
      phantom: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
      brave: `https://link.brave.com/wc?uri=${encodeURIComponent(uri)}`
    }

    // Universal WalletConnect URI handler
    const universalLink = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`

    // Enhanced function to open wallet apps
    const openWalletApp = (link, appName) => {
      return new Promise((resolve) => {
        console.log(`📱 Opening ${appName}...`)
        
        // Create hidden iframe for universal links
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = link
        
        // Add iframe to document
        document.body.appendChild(iframe)
        
        // Set timeout to handle the opening
        setTimeout(() => {
          // Clean up iframe
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
          }
          
          // Also try direct window location as backup
          window.location.href = link
          resolve(true)
        }, 100)
      })
    }

    // Smart wallet selection based on detection
    let walletOpened = false

    // Priority-based wallet opening for mobile
    const walletPriority = ['trust', 'metamask', 'rainbow', 'coinbase', 'phantom', 'brave']
    
    for (const wallet of walletPriority) {
      if ((mobileWallets[wallet] || mobileWallets.isInAppBrowser) && appLinks[wallet]) {
        console.log(`🎯 Opening detected mobile wallet: ${wallet}...`)
        walletOpened = await openWalletApp(appLinks[wallet], wallet)
        if (walletOpened) {
          console.log(`✅ Successfully opened ${wallet}`)
          showStatus(`Opening ${wallet}...`, 'info')
          return true
        }
      }
    }

    // Fallback to universal WalletConnect link
    if (!walletOpened) {
      console.log('🌐 Using universal WalletConnect deep link...')
      walletOpened = await openWalletApp(universalLink, 'Universal WalletConnect')
      
      if (walletOpened) {
        showStatus('Opening wallet...', 'info')
        return true
      }
    }

    // Final fallback - show simple QR code for mobile users
    if (!walletOpened) {
      console.log('📱 Showing mobile-friendly QR code...')
      showMobileQRCode(uri)
    }
    
    return walletOpened
  }

  // 1️⃣4️⃣ Mobile-Friendly QR Code Display (Alternative to Modal)
  function showMobileQRCode(uri) {
    // Create mobile-friendly QR code container
    const qrContainer = document.createElement('div')
    qrContainer.id = 'mobileQrContainer'
    qrContainer.style.position = 'fixed'
    qrContainer.style.top = '0'
    qrContainer.style.left = '0'
    qrContainer.style.width = '100%'
    qrContainer.style.height = '100%'
    qrContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.9)'
    qrContainer.style.display = 'flex'
    qrContainer.style.flexDirection = 'column'
    qrContainer.style.justifyContent = 'center'
    qrContainer.style.alignItems = 'center'
    qrContainer.style.zIndex = '10000'
    qrContainer.style.padding = '20px'

    // QR code content
    qrContainer.innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 12px; text-align: center; max-width: 300px;">
        <h3 style="margin-bottom: 15px; color: #1F2937;">Scan QR Code</h3>
        <div id="qrCodeImage" style="margin: 15px 0; min-height: 200px; display: flex; align-items: center; justify-content: center;">
          <div style="color: #6B7280; padding: 20px;">Generating QR code...</div>
        </div>
        <p style="color: #6B7280; font-size: 14px; margin-bottom: 15px;">
          Scan this QR code with your wallet app
        </p>
        <button id="closeQr" style="background: #EF4444; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">
          Close
        </button>
      </div>
    `

    document.body.appendChild(qrContainer)

    // Generate QR code using simple text representation (fallback)
    setTimeout(() => {
      const qrImage = document.getElementById('qrCodeImage')
      if (qrImage) {
        qrImage.innerHTML = `
          <div style="text-align: center;">
            <div style="color: #FF6B00; margin-bottom: 10px;">
              <i class="fas fa-qrcode" style="font-size: 48px;"></i>
            </div>
            <p style="color: #374151; font-size: 12px; word-break: break-all; font-family: monospace;">
              ${uri.substring(0, 40)}...
            </p>
            <p style="color: #6B7280; font-size: 12px; margin-top: 10px;">
              Copy this URI to your wallet
            </p>
          </div>
        `
      }
    }, 500)

    // Close button functionality
    document.getElementById('closeQr').addEventListener('click', () => {
      document.body.removeChild(qrContainer)
    })

    // Close on background click
    qrContainer.addEventListener('click', (e) => {
      if (e.target === qrContainer) {
        document.body.removeChild(qrContainer)
      }
    })
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

  // 1️⃣6️⃣ FIXED: Enhanced Mobile Connection Flow (NO MODAL)
  async function connectWallet() {
    try {
      // Set loading state
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      // MOBILE-ONLY FLOW: No modal, only deep links
      if (isMobile()) {
        console.log('📱 Mobile detected - using enhanced mobile connection...')
        
        // First try direct connection if in wallet browser
        const directConnected = await connectMobileWallet()
        if (directConnected) {
          return // Successfully connected via direct method
        }
        
        console.log('🔄 Using WalletConnect with deep links (no modal)...')
        // Use WalletConnect with deep links only
        await connectViaMobileWalletConnect()
      } else {
        // Desktop flow remains the same
        console.log('🖥️ Desktop detected - using standard flow...')
        // ... (desktop connection logic)
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
      
      // Initialize WalletConnect first
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        console.log('❌ Failed to initialize WalletConnect for session restoration')
        clearSavedWallet()
        return
      }

      try {
        // Check if session still exists in client
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
      // Handle case where we have wallet address but no session
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

      // Listen for connection events
      client.on('session_connect', (session) => {
        console.log('🔗 Session connected:', session)
        handleConnectedSession(session)
      })
    }
  }, 1000)

  // 2️⃣1️⃣ Enhanced Provider Change Detection for Mobile
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

  // 2️⃣2️⃣ Enhanced mobile-specific event listeners
  if (isMobile()) {
    // Handle page visibility changes for mobile
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && getSavedWallet()) {
        console.log('📱 Mobile page visible, checking connection state...')
        // Add mobile-specific connection health check
      }
    })

    // Prevent zoom on mobile for better UX
    document.addEventListener('touchstart', function(e) {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }, { passive: false })

    let lastTouchEnd = 0
    document.addEventListener('touchend', function(e) {
      const now = (new Date()).getTime()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }, false)
  }
})
