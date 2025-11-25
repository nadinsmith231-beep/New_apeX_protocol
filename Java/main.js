// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile + Desktop) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Mobile Wallet Detection')

  // 1️⃣ Reference buttons from HTML
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal

  // 2️⃣ Enhanced mobile detection with browser sniffing
  function getMobilePlatform() {
    const ua = navigator.userAgent
    
    if (/Android/i.test(ua)) {
      return 'android'
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      return 'ios'
    } else {
      return 'desktop'
    }
  }

  function isMobile() {
    return getMobilePlatform() !== 'desktop'
  }

  // 3️⃣ Enhanced mobile wallet detection
  function detectMobileWallets() {
    return new Promise((resolve) => {
      const platform = getMobilePlatform()
      const wallets = {
        metamask: false,
        trust: false,
        rainbow: false,
        coinbase: false,
        phantom: false,
        brave: false
      }

      // Enhanced mobile detection using various methods
      if (platform === 'ios') {
        // iOS specific detection
        try {
          // Check for injected providers
          if (window.ethereum) {
            wallets.metamask = !!window.ethereum.isMetaMask
            wallets.trust = !!window.ethereum.isTrust
            wallets.rainbow = !!window.ethereum.isRainbow
            wallets.coinbase = !!window.ethereum.isCoinbaseWallet
          }
          
          // Enhanced deep link testing for iOS
          const testLinks = [
            'metamask://',
            'trust://',
            'rainbow://',
            'cbwallet://'
          ]
          
          testLinks.forEach(link => {
            // This will be handled by the deep linking function
          })
        } catch (e) {
          console.log('iOS wallet detection error:', e)
        }
      } else if (platform === 'android') {
        // Android specific detection
        try {
          if (window.ethereum) {
            wallets.metamask = !!window.ethereum.isMetaMask
            wallets.trust = !!window.ethereum.isTrust
            wallets.rainbow = !!window.ethereum.isRainbow
            wallets.coinbase = !!window.ethereum.isCoinbaseWallet
          }
        } catch (e) {
          console.log('Android wallet detection error:', e)
        }
      }

      console.log('📱 Mobile wallet detection result:', wallets)
      resolve(wallets)
    })
  }

  // 4️⃣ Button state management
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

  // 5️⃣ Enhanced status message display
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

  // 6️⃣ Initialize buttons
  setButtonState(connectButton, 'normal')
  if (walletButton) setButtonState(walletButton, 'normal')

  // 7️⃣ WalletConnect constants
  const projectId = 'ea2ef1ec737f10116a4329a7c5629979'
  const metadata = {
    name: 'ApeX Protocol',
    description: 'AI-Optimized Yield Farming DApp',
    url: window.location.origin,
    icons: ['https://walletconnect.com/walletconnect-logo.png'],
  }

  // 8️⃣ Wallet storage helpers
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

  // 🔟 Initialize WalletConnect
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

  // 1️⃣1️⃣ ENHANCED MOBILE DEEP LINKING WITH BETTER DETECTION
  async function openMobileDeepLink(uri) {
    const platform = getMobilePlatform()
    const detectedWallets = await detectMobileWallets()
    
    // Enhanced deep links for all major mobile wallets
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

    // Enhanced wallet opening with multiple fallbacks
    const tryOpenWallet = async (walletName) => {
      const link = deepLinks[walletName]?.[platform] || deepLinks[walletName]?.universal
      if (!link) return false

      console.log(`📱 Attempting to open ${walletName} on ${platform}...`)
      
      return new Promise((resolve) => {
        let timer = null
        let appOpened = false
        
        const originalHref = window.location.href
        
        // Method 1: Hidden iframe (works in some browsers)
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = link
        document.body.appendChild(iframe)
        
        // Method 2: Direct window location (primary method)
        setTimeout(() => {
          window.location.href = link
        }, 50)
        
        // Method 3: Check if app was opened (page becomes hidden)
        const visibilityChange = () => {
          if (document.hidden && !appOpened) {
            appOpened = true
            console.log(`✅ ${walletName} app opened successfully`)
            clearTimeout(timer)
            document.removeEventListener('visibilitychange', visibilityChange)
            resolve(true)
          }
        }
        
        document.addEventListener('visibilitychange', visibilityChange)
        
        // Timeout fallback
        timer = setTimeout(() => {
          if (!appOpened) {
            document.removeEventListener('visibilitychange', visibilityChange)
            if (iframe.parentNode) {
              document.body.removeChild(iframe)
            }
            
            // If we're still on the same page, app opening failed
            if (window.location.href === originalHref) {
              console.log(`❌ ${walletName} not opened`)
              resolve(false)
            } else {
              resolve(true)
            }
          }
        }, 2000)
      })
    }

    // Try detected wallets first
    const walletPriority = ['metamask', 'trust', 'rainbow', 'coinbase', 'phantom']
    
    for (const wallet of walletPriority) {
      if (detectedWallets[wallet]) {
        console.log(`🎯 Trying detected wallet: ${wallet}`)
        const opened = await tryOpenWallet(wallet)
        if (opened) {
          showStatus(`Opening ${wallet}...`, 'info')
          return true
        }
      }
    }

    // Fallback: Try all wallets in order
    for (const wallet of walletPriority) {
      console.log(`🔄 Fallback attempt: ${wallet}`)
      const opened = await tryOpenWallet(wallet)
      if (opened) {
        showStatus(`Opening ${wallet}...`, 'info')
        return true
      }
    }

    // Final fallback: Universal WalletConnect link
    console.log('🌐 Using universal WalletConnect link')
    const universalOpened = await tryOpenWallet('trust') // Trust Wallet has good universal support
    if (universalOpened) {
      showStatus('Opening wallet...', 'info')
      return true
    }

    // Ultimate fallback: Show QR modal
    console.log('📱 All deep links failed, showing QR modal')
    setTimeout(() => {
      if (modal) {
        modal.openModal({ uri })
        showStatus('Scan QR code with your wallet app', 'info')
      }
    }, 1000)
    
    return false
  }

  // 1️⃣2️⃣ Enhanced WalletConnect Connection
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
          // Use enhanced mobile deep linking
          console.log('📱 Mobile detected - using enhanced deep linking')
          await openMobileDeepLink(uri)
        } else {
          // Desktop - use QR modal
          modal.openModal({ uri })
          showStatus('Select your wallet from the list or scan QR code', 'info')
        }
      }

      // Wait for user approval
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

  // 1️⃣3️⃣ Handle session approval
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

  // 1️⃣4️⃣ Desktop wallet detection (unchanged)
  async function connectDesktopWallet() {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        })
        
        if (accounts && accounts.length > 0) {
          const account = accounts[0]
          console.log('✅ Direct wallet connection successful:', account)
          updateConnectedUI(account)
          saveWallet(account)
          return true
        }
      }
      return false
    } catch (error) {
      console.warn('⚠️ Direct wallet connection failed:', error)
      return false
    }
  }

  // 1️⃣5️⃣ Main connect function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      if (!isMobile()) {
        console.log('🖥️ Desktop detected - attempting direct connection...')
        const directConnected = await connectDesktopWallet()
        if (directConnected) {
          return
        }
        console.log('🔄 Using WalletConnect modal...')
        await connectViaWalletConnect()
      } else {
        console.log('📱 Mobile detected - using enhanced WalletConnect...')
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

  // 1️⃣7️⃣ Button click handler
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

  // 1️⃣8️⃣ Restore saved session
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedSession = getSavedSession()
    
    if (savedWallet && savedSession) {
      console.log('♻️ Restoring saved wallet and session:', savedWallet)
      
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
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
    }
  }, 1000)

  // 2️⃣0️⃣ Enhanced mobile-specific optimizations
  if (isMobile()) {
    // Add mobile-specific touch optimizations
    document.addEventListener('touchstart', function() {}, {passive: true})
    
    // Prevent zoom on double tap
    document.addEventListener('touchend', function(e) {
      if (e.touches && e.touches.length < 2) {
        e.preventDefault()
      }
    }, {passive: false})
  }

  console.log('🚀 ApeX Protocol WalletConnect initialized successfully')
})
