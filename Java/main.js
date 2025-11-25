// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile Connection) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Mobile Wallet Connection')

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
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
          "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
          "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
          "ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18",
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

  // 🔟 FIXED: Enhanced Mobile App Detection and Selection
  async function detectMobileWallets() {
    return new Promise((resolve) => {
      // Enhanced detection for mobile wallet apps
      const mobileWallets = {
        metamask: {
          name: 'MetaMask',
          detected: false,
          deepLink: 'https://metamask.app.link/wc?uri=',
          universalLink: 'https://metamask.app.link/'
        },
        trust: {
          name: 'Trust Wallet',
          detected: false,
          deepLink: 'https://link.trustwallet.com/wc?uri=',
          universalLink: 'https://link.trustwallet.com/'
        },
        rainbow: {
          name: 'Rainbow',
          detected: false,
          deepLink: 'https://rnbwapp.com/wc?uri=',
          universalLink: 'https://rnbwapp.com/'
        },
        coinbase: {
          name: 'Coinbase Wallet',
          detected: false,
          deepLink: 'https://go.cb-w.com/wc?uri=',
          universalLink: 'https://go.cb-w.com/'
        },
        phantom: {
          name: 'Phantom',
          detected: false,
          deepLink: 'https://phantom.app/ul/browse/',
          universalLink: 'https://phantom.app/'
        },
        safepal: {
          name: 'SafePal',
          detected: false,
          deepLink: 'safepal://wc?uri=',
          universalLink: 'https://safepal.io/'
        },
        tokenpocket: {
          name: 'TokenPocket',
          detected: false,
          deepLink: 'tpoutside://wc?uri=',
          universalLink: 'https://tokenpocket.pro/'
        }
      }

      // Enhanced mobile detection techniques
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for wallet-specific user agent patterns
      if (userAgent.includes('metamask') || userAgent.includes('trust') || 
          userAgent.includes('rainbow') || userAgent.includes('coinbase') ||
          userAgent.includes('phantom')) {
        
        if (userAgent.includes('metamask')) mobileWallets.metamask.detected = true
        if (userAgent.includes('trust')) mobileWallets.trust.detected = true
        if (userAgent.includes('rainbow')) mobileWallets.rainbow.detected = true
        if (userAgent.includes('coinbase')) mobileWallets.coinbase.detected = true
        if (userAgent.includes('phantom')) mobileWallets.phantom.detected = true
      }

      // Enhanced URL scheme testing for mobile wallets
      const testWalletApp = (walletKey, scheme) => {
        return new Promise((resolve) => {
          const iframe = document.createElement('iframe')
          iframe.style.display = 'none'
          iframe.src = scheme
          iframe.onload = () => {
            mobileWallets[walletKey].detected = true
            resolve(true)
          }
          iframe.onerror = () => resolve(false)
          document.body.appendChild(iframe)
          setTimeout(() => {
            if (iframe.parentNode) document.body.removeChild(iframe)
            resolve(false)
          }, 500)
        })
      }

      // Test for installed wallets using URL schemes
      const testPromises = [
        testWalletApp('metamask', 'metamask://'),
        testWalletApp('trust', 'trust://'),
        testWalletApp('rainbow', 'rainbow://'),
        testWalletApp('coinbase', 'coinbasewallet://'),
        testWalletApp('phantom', 'phantom://'),
        testWalletApp('safepal', 'safepal://'),
        testWalletApp('tokenpocket', 'tpoutside://')
      ]

      Promise.all(testPromises).then(() => {
        console.log('📱 Enhanced mobile wallet detection:', mobileWallets)
        resolve(mobileWallets)
      })
    })
  }

  // 1️⃣1️⃣ FIXED: Enhanced Mobile Wallet Selection Modal
  function showMobileWalletSelector(wallets, uri) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.width = '100%'
      overlay.style.height = '100%'
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
      overlay.style.zIndex = '10000'
      overlay.style.display = 'flex'
      overlay.style.justifyContent = 'center'
      overlay.style.alignItems = 'center'
      overlay.style.backdropFilter = 'blur(10px)'

      // Create modal container
      const modal = document.createElement('div')
      modal.style.background = 'linear-gradient(135deg, #1F2937 0%, #374151 100%)'
      modal.style.borderRadius = '16px'
      modal.style.padding = '24px'
      modal.style.width = '90%'
      modal.style.maxWidth = '400px'
      modal.style.maxHeight = '80vh'
      modal.style.overflowY = 'auto'
      modal.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)'
      modal.style.border = '1px solid #374151'

      // Modal header
      const header = document.createElement('div')
      header.style.marginBottom = '20px'
      header.style.textAlign = 'center'
      header.innerHTML = `
        <h3 style="color: white; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Select Your Wallet</h3>
        <p style="color: #9CA3AF; margin: 0; font-size: 14px;">Choose from installed wallet apps</p>
      `

      // Wallet list container
      const walletList = document.createElement('div')
      walletList.style.display = 'flex'
      walletList.style.flexDirection = 'column'
      walletList.style.gap = '12px'

      // Filter detected wallets
      const detectedWallets = Object.entries(wallets).filter(([key, wallet]) => wallet.detected)
      
      if (detectedWallets.length === 0) {
        // Show all available wallets if none detected
        Object.entries(wallets).forEach(([key, wallet]) => {
          const walletButton = createWalletButton(wallet, uri, () => {
            document.body.removeChild(overlay)
            resolve(true)
          })
          walletList.appendChild(walletButton)
        })
      } else {
        // Show detected wallets first
        detectedWallets.forEach(([key, wallet]) => {
          const walletButton = createWalletButton(wallet, uri, () => {
            document.body.removeChild(overlay)
            resolve(true)
          })
          walletList.appendChild(walletButton)
        })

        // Add separator
        const separator = document.createElement('div')
        separator.style.height = '1px'
        separator.style.background = 'linear-gradient(90deg, transparent, #374151, transparent)'
        separator.style.margin = '16px 0'
        walletList.appendChild(separator)

        // Show other available wallets
        const otherWallets = Object.entries(wallets).filter(([key, wallet]) => !wallet.detected)
        otherWallets.forEach(([key, wallet]) => {
          const walletButton = createWalletButton(wallet, uri, () => {
            document.body.removeChild(overlay)
            resolve(true)
          })
          walletList.appendChild(walletButton)
        })
      }

      // Close button
      const closeButton = document.createElement('button')
      closeButton.innerHTML = 'Cancel'
      closeButton.style.background = 'transparent'
      closeButton.style.border = '1px solid #4B5563'
      closeButton.style.color = '#9CA3AF'
      closeButton.style.padding = '12px 24px'
      closeButton.style.borderRadius = '8px'
      closeButton.style.marginTop = '16px'
      closeButton.style.width = '100%'
      closeButton.style.cursor = 'pointer'
      closeButton.style.fontWeight = '500'
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
      modal.appendChild(header)
      modal.appendChild(walletList)
      modal.appendChild(closeButton)
      overlay.appendChild(modal)
      document.body.appendChild(overlay)

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay)
          resolve(false)
        }
      }
    })
  }

  function createWalletButton(wallet, uri, onClick) {
    const button = document.createElement('button')
    button.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
    button.style.border = '1px solid #4B5563'
    button.style.borderRadius = '12px'
    button.style.padding = '16px'
    button.style.color = 'white'
    button.style.cursor = 'pointer'
    button.style.transition = 'all 0.2s ease'
    button.style.display = 'flex'
    button.style.alignItems = 'center'
    button.style.gap = '12px'
    button.style.width = '100%'
    button.style.textAlign = 'left'

    button.innerHTML = `
      <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
        <i class="fas fa-wallet" style="color: white; font-size: 18px;"></i>
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 16px;">${wallet.name}</div>
        <div style="font-size: 12px; color: #9CA3AF; margin-top: 2px;">${wallet.detected ? 'Installed' : 'Available'}</div>
      </div>
      <i class="fas fa-chevron-right" style="color: #9CA3AF; font-size: 14px;"></i>
    `

    button.onmouseenter = () => {
      button.style.background = 'linear-gradient(135deg, #4B5563 0%, #6B7280 100%)'
      button.style.transform = 'translateY(-1px)'
      button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'
    }

    button.onmouseleave = () => {
      button.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
      button.style.transform = 'translateY(0)'
      button.style.boxShadow = 'none'
    }

    button.onclick = async () => {
      button.style.background = 'linear-gradient(135deg, #059669 0%, #10B981 100%)'
      button.innerHTML = `
        <div style="width: 40px; height: 40px; background: rgba(255, 255, 255, 0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
          <i class="fas fa-spinner fa-spin" style="color: white; font-size: 18px;"></i>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 16px;">Opening ${wallet.name}</div>
          <div style="font-size: 12px; color: rgba(255, 255, 255, 0.8); margin-top: 2px;">Please wait...</div>
        </div>
      `
      
      await openMobileWallet(wallet, uri)
      onClick()
    }

    return button
  }

  // 1️⃣2️⃣ FIXED: Enhanced Mobile Wallet Opening
  async function openMobileWallet(wallet, uri) {
    return new Promise((resolve) => {
      const encodedUri = encodeURIComponent(uri)
      let walletUrl = ''
      
      if (wallet.deepLink) {
        walletUrl = `${wallet.deepLink}${encodedUri}`
      } else {
        walletUrl = `${wallet.universalLink}wc?uri=${encodedUri}`
      }

      console.log(`📱 Opening ${wallet.name}: ${walletUrl}`)

      // Enhanced mobile app opening with multiple fallbacks
      const openAttempts = [
        () => {
          // Method 1: Direct window location
          window.location.href = walletUrl
        },
        () => {
          // Method 2: Create iframe for universal links
          const iframe = document.createElement('iframe')
          iframe.style.display = 'none'
          iframe.src = walletUrl
          document.body.appendChild(iframe)
          setTimeout(() => {
            if (iframe.parentNode) document.body.removeChild(iframe)
          }, 3000)
        },
        () => {
          // Method 3: Create a link and click it
          const link = document.createElement('a')
          link.href = walletUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          document.body.appendChild(link)
          link.click()
          setTimeout(() => {
            if (link.parentNode) document.body.removeChild(link)
          }, 100)
        }
      ]

      // Try each method with delays
      let attemptCount = 0
      const tryOpen = () => {
        if (attemptCount < openAttempts.length) {
          try {
            openAttempts[attemptCount]()
          } catch (error) {
            console.warn(`⚠️ Opening method ${attemptCount + 1} failed:`, error)
          }
          attemptCount++
          setTimeout(tryOpen, 500)
        } else {
          resolve()
        }
      }

      tryOpen()
    })
  }

  // 1️⃣3️⃣ FIXED: Enhanced Mobile Connection Flow
  async function connectMobileWallet() {
    try {
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return
      }

      showStatus('Preparing mobile wallet connection...', 'info')

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
        // Enhanced mobile flow with wallet selection
        const mobileWallets = await detectMobileWallets()
        const userSelected = await showMobileWalletSelector(mobileWallets, uri)
        
        if (!userSelected) {
          // User cancelled, show QR code as fallback
          if (modal) {
            modal.openModal({ uri })
            showStatus('Scan QR code with your wallet app', 'info')
          }
        } else {
          showStatus('Opening selected wallet...', 'info')
        }
      }

      // Wait for connection with timeout
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
      console.error('❌ Mobile wallet connection failed:', err)
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

  // 1️⃣5️⃣ Enhanced Connect Wallet Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      if (isMobile()) {
        console.log('📱 Mobile detected - using enhanced mobile connection flow...')
        await connectMobileWallet()
      } else {
        console.log('🖥️ Desktop detected - using standard connection flow...')
        // Desktop flow remains unchanged
        await connectMobileWallet() // Fallback to similar flow for now
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

  // 1️⃣7️⃣ Button click events
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

  // Initialize and restore connection
  await restoreWalletConnection()

  // 1️⃣9️⃣ Session event listeners
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

  // 2️⃣0️⃣ Enhanced mobile-specific initialization
  if (isMobile()) {
    console.log('📱 Mobile environment detected - initializing enhanced mobile features...')
    
    // Pre-load wallet detection for faster response
    setTimeout(() => {
      detectMobileWallets().then(wallets => {
        console.log('📱 Pre-loaded mobile wallets:', wallets)
      })
    }, 2000)
  }
})
