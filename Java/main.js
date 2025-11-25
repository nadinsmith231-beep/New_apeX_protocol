// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile Wallet Selection) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Mobile Wallet Selection')

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

  // 🔟 FIXED: Enhanced Mobile Wallet Selection with Custom Modal
  function createMobileWalletSelector(uri) {
    // Remove existing selector if present
    const existingSelector = document.getElementById('mobileWalletSelector')
    if (existingSelector) existingSelector.remove()

    // Create modal overlay
    const overlay = document.createElement('div')
    overlay.id = 'mobileWalletSelector'
    overlay.style.position = 'fixed'
    overlay.style.top = '0'
    overlay.style.left = '0'
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
    overlay.style.display = 'flex'
    overlay.style.flexDirection = 'column'
    overlay.style.justifyContent = 'center'
    overlay.style.alignItems = 'center'
    overlay.style.zIndex = '10000'
    overlay.style.padding = '20px'

    // Create modal content
    const modalContent = document.createElement('div')
    modalContent.style.background = 'linear-gradient(135deg, #1F2937 0%, #374151 100%)'
    modalContent.style.borderRadius = '16px'
    modalContent.style.padding = '24px'
    modalContent.style.width = '100%'
    modalContent.style.maxWidth = '400px'
    modalContent.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)'
    modalContent.style.border = '1px solid #4B5563'

    // Modal header
    const header = document.createElement('div')
    header.style.display = 'flex'
    header.style.justifyContent = 'space-between'
    header.style.alignItems = 'center'
    header.style.marginBottom = '20px'
    
    const title = document.createElement('h3')
    title.textContent = 'Select Wallet'
    title.style.color = 'white'
    title.style.fontSize = '20px'
    title.style.fontWeight = '600'
    title.style.margin = '0'
    
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '<i class="fas fa-times"></i>'
    closeBtn.style.background = 'none'
    closeBtn.style.border = 'none'
    closeBtn.style.color = '#9CA3AF'
    closeBtn.style.fontSize = '18px'
    closeBtn.style.cursor = 'pointer'
    closeBtn.style.padding = '8px'
    closeBtn.style.borderRadius = '8px'
    
    closeBtn.addEventListener('click', () => {
      overlay.remove()
      showStatus('Wallet selection cancelled', 'info')
    })
    
    header.appendChild(title)
    header.appendChild(closeBtn)

    // Wallet list
    const walletList = document.createElement('div')
    walletList.style.display = 'flex'
    walletList.style.flexDirection = 'column'
    walletList.style.gap = '12px'

    // Popular mobile wallets with deep links
    const mobileWallets = [
      {
        name: 'MetaMask',
        id: 'metamask',
        icon: 'https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg',
        deepLink: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
        universalLink: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`
      },
      {
        name: 'Trust Wallet',
        id: 'trust',
        icon: 'https://trustwallet.com/assets/images/favicon.png',
        deepLink: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
        universalLink: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`
      },
      {
        name: 'Rainbow',
        id: 'rainbow',
        icon: 'https://rainbow.me/images/rainbow-logo.png',
        deepLink: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
        universalLink: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`
      },
      {
        name: 'Coinbase Wallet',
        id: 'coinbase',
        icon: 'https://coinbase.com/favicon.ico',
        deepLink: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
        universalLink: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`
      },
      {
        name: 'Phantom',
        id: 'phantom',
        icon: 'https://phantom.app/favicon.ico',
        deepLink: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
        universalLink: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`
      },
      {
        name: 'Other Wallets',
        id: 'other',
        icon: 'https://walletconnect.com/walletconnect-logo.png',
        deepLink: null,
        universalLink: null
      }
    ]

    // Create wallet buttons
    mobileWallets.forEach(wallet => {
      const walletButton = document.createElement('button')
      walletButton.style.display = 'flex'
      walletButton.style.alignItems = 'center'
      walletButton.style.padding = '16px'
      walletButton.style.background = 'rgba(255, 255, 255, 0.05)'
      walletButton.style.border = '1px solid #4B5563'
      walletButton.style.borderRadius = '12px'
      walletButton.style.color = 'white'
      walletButton.style.cursor = 'pointer'
      walletButton.style.transition = 'all 0.2s ease'
      walletButton.style.width = '100%'
      
      walletButton.innerHTML = `
        <img src="${wallet.icon}" style="width: 32px; height: 32px; border-radius: 8px; margin-right: 12px;" />
        <span style="font-size: 16px; font-weight: 500;">${wallet.name}</span>
        <div style="margin-left: auto; color: #9CA3AF;">
          <i class="fas fa-external-link-alt"></i>
        </div>
      `
      
      walletButton.addEventListener('mouseenter', () => {
        walletButton.style.background = 'rgba(255, 107, 0, 0.1)'
        walletButton.style.borderColor = '#FF6B00'
      })
      
      walletButton.addEventListener('mouseleave', () => {
        walletButton.style.background = 'rgba(255, 255, 255, 0.05)'
        walletButton.style.borderColor = '#4B5563'
      })
      
      walletButton.addEventListener('click', () => {
        if (wallet.id === 'other') {
          // Show QR code for other wallets
          overlay.remove()
          if (modal) {
            modal.openModal({ uri })
            showStatus('Scan QR code with your wallet', 'info')
          }
        } else {
          // Try to open wallet app
          openWalletApp(wallet, uri)
          overlay.remove()
        }
      })
      
      walletList.appendChild(walletButton)
    })

    // QR Code option
    const qrButton = document.createElement('button')
    qrButton.style.display = 'flex'
    qrButton.style.alignItems = 'center'
    qrButton.style.justifyContent = 'center'
    qrButton.style.padding = '16px'
    qrButton.style.background = 'rgba(255, 107, 0, 0.1)'
    qrButton.style.border = '1px solid #FF6B00'
    qrButton.style.borderRadius = '12px'
    qrButton.style.color = '#FF6B00'
    qrButton.style.cursor = 'pointer'
    qrButton.style.marginTop = '8px'
    qrButton.style.fontWeight = '500'
    
    qrButton.innerHTML = `
      <i class="fas fa-qrcode" style="margin-right: 8px;"></i>
      Show QR Code Instead
    `
    
    qrButton.addEventListener('click', () => {
      overlay.remove()
      if (modal) {
        modal.openModal({ uri })
        showStatus('Scan QR code with your wallet', 'info')
      }
    })

    // Assemble modal
    modalContent.appendChild(header)
    modalContent.appendChild(walletList)
    modalContent.appendChild(qrButton)
    overlay.appendChild(modalContent)
    
    // Close on background click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove()
        showStatus('Wallet selection cancelled', 'info')
      }
    })
    
    document.body.appendChild(overlay)
  }

  // 🔟1️⃣ Enhanced Mobile Wallet App Opening
  async function openWalletApp(wallet, uri) {
    showStatus(`Opening ${wallet.name}...`, 'info')
    
    // Function to try opening an app link
    const tryOpenApp = (link, appName) => {
      return new Promise((resolve) => {
        let timer = null
        let appOpened = false
        
        // Store original URL for comparison
        const originalHref = window.location.href
        
        // Create hidden iframe for universal links
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = link
        
        // Add iframe to document
        document.body.appendChild(iframe)
        
        // Set timeout to detect if app was opened
        timer = setTimeout(() => {
          // Clean up iframe
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
          }
          
          // If we're still on the same page, app opening failed
          if (window.location.href === originalHref) {
            console.log(`❌ ${appName} not opened or not installed`)
            resolve(false)
          } else {
            appOpened = true
            resolve(true)
          }
        }, 2000)
        
        // Also try direct window location change as backup
        setTimeout(() => {
          if (!appOpened) {
            window.location.href = link
          }
        }, 100)
      })
    }

    // Try deep link first, then universal link as fallback
    let walletOpened = false
    
    if (wallet.deepLink) {
      console.log(`🎯 Trying deep link for ${wallet.name}...`)
      walletOpened = await tryOpenApp(wallet.deepLink, wallet.name)
    }
    
    // If deep link failed, try universal link
    if (!walletOpened && wallet.universalLink) {
      console.log(`🔄 Deep link failed, trying universal link for ${wallet.name}...`)
      walletOpened = await tryOpenApp(wallet.universalLink, `${wallet.name} (Universal)`)
    }
    
    if (!walletOpened) {
      console.log(`❌ All link attempts failed for ${wallet.name}`)
      showStatus(`${wallet.name} not found - showing QR code`, 'error')
      
      // Fallback to QR code
      setTimeout(() => {
        if (modal) {
          modal.openModal({ uri })
          showStatus('Scan QR code with your wallet', 'info')
        }
      }, 1000)
    } else {
      console.log(`✅ Successfully opened ${wallet.name}`)
    }
    
    return walletOpened
  }

  // 🔟2️⃣ FIXED: Enhanced WalletConnect Connection with Mobile Wallet Selection
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
          // FIXED: Use custom mobile wallet selector instead of automatic deep linking
          createMobileWalletSelector(uri)
          showStatus('Select your wallet from the list', 'info')
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

  // 🔟3️⃣ Handle session approval
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

  // 🔟4️⃣ Desktop Wallet Detection (simplified for mobile focus)
  async function detectInstalledWallets() {
    return new Promise((resolve) => {
      const wallets = {
        metamask: !!window.ethereum?.isMetaMask,
        trust: !!window.ethereum?.isTrust,
        rainbow: !!window.ethereum?.isRainbow,
        coinbase: !!window.ethereum?.isCoinbaseWallet,
      }
      console.log('🔍 Wallet detection:', wallets)
      resolve(wallets)
    })
  }

  async function connectDesktopWallet() {
    try {
      const detectedWallets = await detectInstalledWallets()
      const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
      
      if (availableWallets.length === 0) {
        return false
      }

      let provider = window.ethereum
      
      if (window.ethereum?.providers && window.ethereum.providers.length > 0) {
        provider = window.ethereum.providers[0]
      }

      if (provider) {
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
      }
      
      return false
      
    } catch (error) {
      console.warn('⚠️ Direct wallet connection failed:', error)
      return false
    }
  }

  // 🔟5️⃣ Main Connect Wallet Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      if (!isMobile()) {
        const directConnected = await connectDesktopWallet()
        if (directConnected) {
          return
        }
        await connectViaWalletConnect()
      } else {
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

  // 🔟6️⃣ Disconnect wallet
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

  // 🔟7️⃣ Button click events
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

  // 🔟8️⃣ Restore saved wallet and session on page load
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

  // 🔟9️⃣ Session event listeners
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

  // 1️⃣0️⃣0️⃣ Provider change detection
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
