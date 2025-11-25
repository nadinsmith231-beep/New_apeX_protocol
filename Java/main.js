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

  // 🔟 FIXED: Enhanced Mobile Wallet Detection with App Selection
  function detectMobileWallets() {
    return new Promise((resolve) => {
      // Enhanced mobile wallet detection using user agent and known app patterns
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for wallet-specific user agent patterns
      const walletPatterns = {
        metamask: /metamask|trust|rainbow|coinbase|phantom|brave|rabby|okx|bitget/i,
        trust: /trust wallet|trustwallet/i,
        rainbow: /rainbow wallet|rainbowwallet/i,
        coinbase: /coinbase wallet|coinbasewallet/i,
        phantom: /phantom wallet|phantomwallet/i,
      }

      const detectedWallets = {}
      
      // Check user agent for wallet indicators
      for (const [wallet, pattern] of Object.entries(walletPatterns)) {
        detectedWallets[wallet] = pattern.test(userAgent)
      }

      // Enhanced mobile app detection using intent schemes
      const appSchemes = {
        metamask: 'metamask://',
        trust: 'trust://',
        rainbow: 'rainbow://',
        coinbase: 'coinbase://',
        phantom: 'phantom://',
      }

      // Try to detect installed apps by checking if schemes can be handled
      let detectionComplete = 0
      const totalDetections = Object.keys(appSchemes).length

      Object.entries(appSchemes).forEach(([wallet, scheme]) => {
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = scheme
        
        iframe.onload = () => {
          detectedWallets[wallet] = true
          detectionComplete++
          document.body.removeChild(iframe)
          if (detectionComplete === totalDetections) {
            resolve(detectedWallets)
          }
        }
        
        iframe.onerror = () => {
          detectionComplete++
          document.body.removeChild(iframe)
          if (detectionComplete === totalDetections) {
            resolve(detectedWallets)
          }
        }
        
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
            detectionComplete++
          }
          if (detectionComplete === totalDetections) {
            resolve(detectedWallets)
          }
        }, 300)
        
        document.body.appendChild(iframe)
      })

      // Fallback in case detection takes too long
      setTimeout(() => {
        resolve(detectedWallets)
      }, 1000)
    })
  }

  // 1️⃣1️⃣ FIXED: Enhanced Mobile Wallet Selection Modal
  async function showMobileWalletSelector(uri) {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
      `

      // Create modal container
      const modal = document.createElement('div')
      modal.style.cssText = `
        background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
        border-radius: 16px;
        padding: 24px;
        width: 100%;
        max-width: 400px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        border: 1px solid #4B5563;
      `

      // Modal header
      const header = document.createElement('div')
      header.style.cssText = `
        text-align: center;
        margin-bottom: 24px;
      `
      header.innerHTML = `
        <h3 style="color: white; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Select Wallet</h3>
        <p style="color: #9CA3AF; margin: 0; font-size: 14px;">Choose your preferred wallet to connect</p>
      `

      // Wallet list container
      const walletList = document.createElement('div')
      walletList.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 24px;
      `

      // Popular mobile wallets with enhanced detection
      const mobileWallets = [
        {
          id: 'metamask',
          name: 'MetaMask',
          icon: 'https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg',
          scheme: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        {
          id: 'trust',
          name: 'Trust Wallet',
          icon: 'https://trustwallet.com/assets/images/media/assets/TWT.png',
          scheme: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        {
          id: 'rainbow',
          name: 'Rainbow',
          icon: 'https://rainbow.me/images/rainbow_logo.png',
          scheme: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        {
          id: 'coinbase',
          name: 'Coinbase Wallet',
          icon: 'https://coinbase.com/favicon.ico',
          scheme: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        {
          id: 'phantom',
          name: 'Phantom',
          icon: 'https://phantom.app/favicon.ico',
          scheme: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
          universal: false
        },
        {
          id: 'walletconnect',
          name: 'Other Wallets',
          icon: 'https://walletconnect.com/walletconnect-logo.png',
          scheme: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: true,
          fallback: true
        }
      ]

      // Create wallet buttons
      mobileWallets.forEach(wallet => {
        const walletButton = document.createElement('button')
        walletButton.style.cssText = `
          display: flex;
          align-items: center;
          padding: 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #4B5563;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
        `

        walletButton.innerHTML = `
          <img src="${wallet.icon}" style="width: 32px; height: 32px; border-radius: 8px; margin-right: 12px;" onerror="this.src='https://walletconnect.com/walletconnect-logo.png'">
          <span style="flex: 1">${wallet.name}</span>
          <i class="fas fa-chevron-right" style="color: #9CA3AF;"></i>
        `

        walletButton.onmouseenter = () => {
          walletButton.style.background = 'rgba(255, 107, 0, 0.1)'
          walletButton.style.borderColor = '#FF6B00'
        }

        walletButton.onmouseleave = () => {
          walletButton.style.background = 'rgba(255, 255, 255, 0.05)'
          walletButton.style.borderColor = '#4B5563'
        }

        walletButton.onclick = async () => {
          console.log(`📱 Selected wallet: ${wallet.name}`)
          showStatus(`Opening ${wallet.name}...`, 'info')
          
          // Try to open the wallet app
          const opened = await tryOpenWalletApp(wallet.scheme, wallet.name)
          
          if (!opened && wallet.universal) {
            // Fallback to universal link
            window.location.href = wallet.scheme
          }
          
          // Close modal after a short delay
          setTimeout(() => {
            if (overlay.parentNode) {
              document.body.removeChild(overlay)
            }
            resolve(true)
          }, 1000)
        }

        walletList.appendChild(walletButton)
      })

      // Close button
      const closeButton = document.createElement('button')
      closeButton.style.cssText = `
        width: 100%;
        padding: 12px;
        background: transparent;
        border: 1px solid #4B5563;
        border-radius: 8px;
        color: #9CA3AF;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      `
      closeButton.textContent = 'Cancel'
      closeButton.onclick = () => {
        if (overlay.parentNode) {
          document.body.removeChild(overlay)
        }
        resolve(false)
      }
      closeButton.onmouseenter = () => {
        closeButton.style.background = 'rgba(239, 68, 68, 0.1)'
        closeButton.style.borderColor = '#EF4444'
        closeButton.style.color = '#EF4444'
      }
      closeButton.onmouseleave = () => {
        closeButton.style.background = 'transparent'
        closeButton.style.borderColor = '#4B5563'
        closeButton.style.color = '#9CA3AF'
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

  // 1️⃣2️⃣ Enhanced Wallet App Opening with Better Detection
  async function tryOpenWalletApp(link, walletName) {
    return new Promise((resolve) => {
      console.log(`📱 Attempting to open ${walletName}...`)
      
      let appOpened = false
      const originalHref = window.location.href
      
      // Create hidden iframe for universal links
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = link
      
      document.body.appendChild(iframe)
      
      // Set timeout to detect if app was opened
      const timer = setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
        
        // If we're still on the same page, app opening likely failed
        if (window.location.href === originalHref && !appOpened) {
          console.log(`❌ ${walletName} not opened or not installed`)
          resolve(false)
        } else {
          resolve(true)
        }
      }, 2000)
      
      // Also try direct window location change as backup
      setTimeout(() => {
        if (!appOpened) {
          window.location.href = link
          appOpened = true
          resolve(true)
        }
      }, 100)
      
      // Listen for page visibility changes (indicates app switch)
      const visibilityHandler = () => {
        if (document.hidden) {
          appOpened = true
          clearTimeout(timer)
          document.removeEventListener('visibilitychange', visibilityHandler)
          resolve(true)
        }
      }
      
      document.addEventListener('visibilitychange', visibilityHandler)
    })
  }

  // 1️⃣3️⃣ FIXED: Enhanced Mobile Connection Flow with Wallet Selection
  async function connectMobileWallet() {
    try {
      // Initialize WalletConnect first
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
        // Show mobile wallet selector instead of automatic deep linking
        const walletSelected = await showMobileWalletSelector(uri)
        
        if (!walletSelected) {
          showStatus('Wallet selection cancelled', 'info')
          setButtonState(connectButton, 'normal')
          if (walletButton) setButtonState(walletButton, 'normal')
          return
        }

        showStatus('Waiting for wallet approval...', 'info')
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

  // 1️⃣5️⃣ Enhanced Desktop Wallet Connection
  async function connectDesktopWallet() {
    try {
      // Enhanced desktop flow using WalletConnect modal
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
        modal.openModal({ uri })
        showStatus('Select your wallet from the list or scan QR code', 'info')
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
      console.error('❌ Desktop wallet connection failed:', err)
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

  // 1️⃣6️⃣ Main Connect Wallet Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      if (isMobile()) {
        console.log('📱 Mobile detected - using enhanced wallet selection')
        await connectMobileWallet()
      } else {
        console.log('🖥️ Desktop detected - using WalletConnect modal')
        await connectDesktopWallet()
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

  // 2️⃣1️⃣ Enhanced Provider Change Detection
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
