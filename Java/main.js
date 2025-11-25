// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile WalletConnect) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Mobile WalletConnect Focus')

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

  // 6️⃣ Enhanced mobile detection
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  }

  // 7️⃣ Wallet storage helpers
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
        // FOCUS: Trust Wallet and MetaMask as primary options
        explorerRecommendedWalletIds: [
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
          "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // Coinbase Wallet
          "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
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

  // 🔟 ENHANCED: Mobile Wallet Detection with Trust Wallet & MetaMask Focus
  function detectMobileWallets() {
    return new Promise((resolve) => {
      const wallets = {
        trust: false,
        metamask: false,
        rainbow: false,
        coinbase: false,
        phantom: false,
      }

      // Enhanced mobile wallet detection
      if (isMobile()) {
        // Check for Trust Wallet (injects trustwallet)
        if (window.trustwallet) {
          wallets.trust = true
        }
        
        // Check for MetaMask mobile
        if (window.ethereum?.isMetaMask) {
          wallets.metamask = true
        }
        
        // Check for Rainbow
        if (window.ethereum?.isRainbow) {
          wallets.rainbow = true
        }
        
        // Check for Coinbase Wallet
        if (window.ethereum?.isCoinbaseWallet) {
          wallets.coinbase = true
        }
        
        // Check for Phantom
        if (window.ethereum?.isPhantom) {
          wallets.phantom = true
        }

        // Enhanced user agent detection for mobile wallets
        const userAgent = navigator.userAgent.toLowerCase()
        if (userAgent.includes('trust') || userAgent.includes('twallet')) {
          wallets.trust = true
        }
        if (userAgent.includes('metamask')) {
          wallets.metamask = true
        }
      }

      console.log('📱 Mobile wallet detection:', wallets)
      resolve(wallets)
    })
  }

  // 1️⃣1️⃣ FIXED: Enhanced Mobile Wallet Connection with Trust Wallet & MetaMask Priority
  async function connectMobileWallet() {
    try {
      const detectedWallets = await detectMobileWallets()
      
      // Show wallet selection for mobile users
      if (isMobile()) {
        const shouldUseDirect = await showMobileWalletSelection(detectedWallets)
        if (shouldUseDirect) {
          return true // User selected a direct connection
        }
      }
      
      return false // Proceed with standard WalletConnect
      
    } catch (error) {
      console.error('❌ Mobile wallet connection error:', error)
      return false
    }
  }

  // 1️⃣2️⃣ NEW: Mobile Wallet Selection Interface
  async function showMobileWalletSelection(detectedWallets) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.width = '100%'
      overlay.style.height = '100%'
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
      overlay.style.display = 'flex'
      overlay.style.alignItems = 'center'
      overlay.style.justifyContent = 'center'
      overlay.style.zIndex = '10000'
      overlay.style.backdropFilter = 'blur(4px)'

      // Create modal content
      const modalContent = document.createElement('div')
      modalContent.style.background = 'linear-gradient(135deg, #1F2937 0%, #374151 100%)'
      modalContent.style.borderRadius = '16px'
      modalContent.style.padding = '24px'
      modalContent.style.width = '90%'
      modalContent.style.maxWidth = '400px'
      modalContent.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)'
      modalContent.style.border = '1px solid rgba(255, 107, 0, 0.2)'

      // Modal header
      const header = document.createElement('h3')
      header.textContent = 'Select Your Wallet'
      header.style.color = 'white'
      header.style.marginBottom = '20px'
      header.style.textAlign = 'center'
      header.style.fontSize = '20px'
      header.style.fontWeight = '600'

      // Wallet options - Trust Wallet and MetaMask as primary
      const walletOptions = [
        { 
          id: 'trust', 
          name: 'Trust Wallet', 
          icon: '🔒', 
          detected: detectedWallets.trust,
          priority: 1
        },
        { 
          id: 'metamask', 
          name: 'MetaMask', 
          icon: '🦊', 
          detected: detectedWallets.metamask,
          priority: 2
        },
        { 
          id: 'coinbase', 
          name: 'Coinbase Wallet', 
          icon: '🏦', 
          detected: detectedWallets.coinbase,
          priority: 3
        },
        { 
          id: 'rainbow', 
          name: 'Rainbow', 
          icon: '🌈', 
          detected: detectedWallets.rainbow,
          priority: 4
        },
        { 
          id: 'walletconnect', 
          name: 'Other Wallets', 
          icon: '📱', 
          detected: true,
          priority: 5
        }
      ]

      // Sort by priority and detection status
      walletOptions.sort((a, b) => {
        if (a.detected && !b.detected) return -1
        if (!a.detected && b.detected) return 1
        return a.priority - b.priority
      })

      const optionsContainer = document.createElement('div')
      optionsContainer.style.display = 'flex'
      optionsContainer.style.flexDirection = 'column'
      optionsContainer.style.gap = '12px'

      walletOptions.forEach(wallet => {
        const option = document.createElement('button')
        option.style.background = wallet.detected 
          ? 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
          : 'linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)'
        option.style.border = wallet.detected 
          ? '1px solid rgba(255, 107, 0, 0.3)'
          : '1px solid rgba(156, 163, 175, 0.3)'
        option.style.borderRadius = '12px'
        option.style.padding = '16px'
        option.style.color = 'white'
        option.style.fontSize = '16px'
        option.style.fontWeight = '500'
        option.style.cursor = wallet.detected ? 'pointer' : 'not-allowed'
        option.style.transition = 'all 0.2s ease'
        option.style.opacity = wallet.detected ? '1' : '0.6'
        option.style.display = 'flex'
        option.style.alignItems = 'center'
        option.style.justifyContent = 'space-between'

        option.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 20px;">${wallet.icon}</span>
            <span>${wallet.name}</span>
          </div>
          ${wallet.detected ? '<span style="color: #10B981; font-size: 12px;">Available</span>' : '<span style="color: #9CA3AF; font-size: 12px;">Not Detected</span>'}
        `

        if (wallet.detected) {
          option.onmouseenter = () => {
            option.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)'
            option.style.transform = 'translateY(-2px)'
          }
          option.onmouseleave = () => {
            option.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
            option.style.transform = 'translateY(0)'
          }
        }

        option.onclick = () => {
          if (wallet.detected) {
            document.body.removeChild(overlay)
            
            if (wallet.id === 'walletconnect') {
              resolve(false) // Use standard WalletConnect
            } else {
              // Store preferred wallet selection
              localStorage.setItem('preferredMobileWallet', wallet.id)
              openPreferredMobileWallet(wallet.id)
              resolve(true) // Use direct connection
            }
          }
        }

        optionsContainer.appendChild(option)
      })

      // Close button
      const closeButton = document.createElement('button')
      closeButton.textContent = 'Cancel'
      closeButton.style.background = 'transparent'
      closeButton.style.border = '1px solid #6B7280'
      closeButton.style.borderRadius = '12px'
      closeButton.style.padding = '12px'
      closeButton.style.color = '#9CA3AF'
      closeButton.style.marginTop = '16px'
      closeButton.style.cursor = 'pointer'
      closeButton.style.width = '100%'
      closeButton.style.fontSize = '14px'
      closeButton.style.transition = 'all 0.2s ease'

      closeButton.onmouseenter = () => {
        closeButton.style.background = '#374151'
        closeButton.style.color = 'white'
      }
      closeButton.onmouseleave = () => {
        closeButton.style.background = 'transparent'
        closeButton.style.color = '#9CA3AF'
      }

      closeButton.onclick = () => {
        document.body.removeChild(overlay)
        resolve(false)
      }

      // Assemble modal
      modalContent.appendChild(header)
      modalContent.appendChild(optionsContainer)
      modalContent.appendChild(closeButton)
      overlay.appendChild(modalContent)
      document.body.appendChild(overlay)

      // Close on background click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay)
          resolve(false)
        }
      }
    })
  }

  // 1️⃣3️⃣ NEW: Open Preferred Mobile Wallet
  async function openPreferredMobileWallet(walletId) {
    const walletLinks = {
      trust: 'https://link.trustwallet.com',
      metamask: 'https://metamask.app.link',
      coinbase: 'https://go.cb-w.com',
      rainbow: 'https://rnbwapp.com'
    }

    // Generate WalletConnect URI first
    const initSuccess = await initWalletConnect()
    if (!initSuccess) return

    const { uri, approval } = await client.connect({
      requiredNamespaces: {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
          chains: ['eip155:1'],
          events: ['chainChanged', 'accountsChanged'],
        },
      },
    })

    if (!uri) return

    // Construct deep link based on selected wallet
    let deepLink = ''
    switch (walletId) {
      case 'trust':
        deepLink = `${walletLinks.trust}/wc?uri=${encodeURIComponent(uri)}`
        showStatus('Opening Trust Wallet...', 'info')
        break
      case 'metamask':
        deepLink = `${walletLinks.metamask}/wc?uri=${encodeURIComponent(uri)}`
        showStatus('Opening MetaMask...', 'info')
        break
      case 'coinbase':
        deepLink = `${walletLinks.coinbase}/wc?uri=${encodeURIComponent(uri)}`
        showStatus('Opening Coinbase Wallet...', 'info')
        break
      case 'rainbow':
        deepLink = `${walletLinks.rainbow}/wc?uri=${encodeURIComponent(uri)}`
        showStatus('Opening Rainbow...', 'info')
        break
    }

    if (deepLink) {
      // Open the wallet app
      window.location.href = deepLink
      
      // Wait for connection with timeout
      setTimeout(async () => {
        try {
          const session = await Promise.race([
            approval(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Connection timeout')), 45000)
            )
          ])
          
          handleConnectedSession(session)
        } catch (err) {
          console.error('❌ Mobile wallet connection failed:', err)
          setButtonState(connectButton, 'failed')
          if (walletButton) setButtonState(walletButton, 'failed')
          
          if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
            showStatus('Connection cancelled', 'error')
          } else if (err.message?.includes('timeout')) {
            showStatus('Connection timeout - please try again', 'error')
          } else {
            showStatus('Wallet connection failed', 'error')
          }
        }
      }, 1000)
    }
  }

  // 1️⃣4️⃣ FIXED: Enhanced WalletConnect Connection with Mobile Focus
  async function connectViaWalletConnect() {
    try {
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
          // Use enhanced mobile flow with Trust Wallet & MetaMask priority
          const preferredWallet = localStorage.getItem('preferredMobileWallet') || 'trust'
          await openPreferredMobileWallet(preferredWallet)
        } else {
          // Desktop - use QR modal
          modal.openModal({ uri })
          showStatus('Select your wallet from the list or scan QR code', 'info')
        }
      }

      // Wait for user approval (only for desktop)
      if (!isMobile()) {
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

  // 1️⃣6️⃣ FIXED: Enhanced Connect Wallet Function with Mobile-First Approach
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      // MOBILE-FIRST APPROACH: Enhanced mobile flow with Trust Wallet & MetaMask
      if (isMobile()) {
        console.log('📱 Mobile detected - using enhanced wallet selection...')
        
        // Show mobile wallet selection with Trust Wallet & MetaMask as primary options
        const directConnected = await connectMobileWallet()
        if (!directConnected) {
          // Fallback to standard WalletConnect if user selects "Other Wallets"
          await connectViaWalletConnect()
        }
      } else {
        // Desktop flow
        console.log('🖥️ Desktop detected - using standard WalletConnect...')
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
    localStorage.removeItem('preferredMobileWallet')
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

      client.on('session_connect', (session) => {
        console.log('🔗 Session connected:', session)
        handleConnectedSession(session)
      })
    }
  }, 1000)

  // 2️⃣1️⃣ Handle provider changes
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
  }
})
