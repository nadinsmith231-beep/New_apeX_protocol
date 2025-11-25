// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile Wallet Selection) =====

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

  // 9️⃣ Initialize WalletConnect
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

  // 🔟 FIXED: Enhanced Mobile Wallet Detection with App Selection
  async function detectMobileWallets() {
    return new Promise((resolve) => {
      // Enhanced wallet detection for mobile browsers
      const wallets = {
        metamask: {
          detected: false,
          name: 'MetaMask',
          scheme: 'metamask://',
          universal: `https://metamask.app.link/wc?uri=`,
          icon: '🦊'
        },
        trust: {
          detected: false,
          name: 'Trust Wallet',
          scheme: 'trust://',
          universal: `https://link.trustwallet.com/wc?uri=`,
          icon: '🔒'
        },
        rainbow: {
          detected: false,
          name: 'Rainbow',
          scheme: 'rainbow://',
          universal: `https://rnbwapp.com/wc?uri=`,
          icon: '🌈'
        },
        coinbase: {
          detected: false,
          name: 'Coinbase Wallet',
          scheme: 'coinbasewallet://',
          universal: `https://go.cb-w.com/wc?uri=`,
          icon: '🏦'
        },
        phantom: {
          detected: false,
          name: 'Phantom',
          scheme: 'phantom://',
          universal: `https://phantom.app/ul/browse/`,
          icon: '👻'
        },
        brave: {
          detected: false,
          name: 'Brave Wallet',
          scheme: 'brave://',
          universal: `https://link.brave.com/wc?uri=`,
          icon: '🦁'
        }
      }

      // Enhanced detection using multiple methods
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for wallet-specific user agent patterns
      if (userAgent.includes('metamask') || userAgent.includes('trust') || 
          userAgent.includes('rainbow') || userAgent.includes('coinbase') ||
          userAgent.includes('phantom') || userAgent.includes('brave')) {
        
        if (userAgent.includes('metamask')) wallets.metamask.detected = true
        if (userAgent.includes('trust')) wallets.trust.detected = true
        if (userAgent.includes('rainbow')) wallets.rainbow.detected = true
        if (userAgent.includes('coinbase')) wallets.coinbase.detected = true
        if (userAgent.includes('phantom')) wallets.phantom.detected = true
        if (userAgent.includes('brave')) wallets.brave.detected = true
      }

      // Try to detect via URL scheme testing (non-intrusive)
      const testLink = document.createElement('a')
      testLink.style.display = 'none'
      
      Object.keys(wallets).forEach(walletKey => {
        const wallet = wallets[walletKey]
        testLink.href = wallet.scheme
        if (testLink.href !== '' && testLink.href !== window.location.href) {
          wallet.detected = true
        }
      })

      // Enhanced: Check for known wallet apps via timing (non-blocking)
      setTimeout(() => {
        console.log('🔍 Mobile wallet detection results:', wallets)
        resolve(wallets)
      }, 100)
    })
  }

  // 1️⃣1️⃣ FIXED: Enhanced Mobile Wallet Selection Modal
  async function showMobileWalletSelector(uri) {
    return new Promise(async (resolve) => {
      const detectedWallets = await detectMobileWallets()
      const availableWallets = Object.values(detectedWallets).filter(wallet => wallet.detected)
      
      // Create modal overlay
      const modalOverlay = document.createElement('div')
      modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: 'Inter', sans-serif;
      `

      // Create modal content
      const modalContent = document.createElement('div')
      modalContent.style.cssText = `
        background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
        border-radius: 16px;
        padding: 24px;
        width: 90%;
        max-width: 400px;
        max-height: 80vh;
        overflow-y: auto;
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
        <h3 style="color: white; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">
          Select Wallet
        </h3>
        <p style="color: #9CA3AF; margin: 0; font-size: 14px;">
          Choose your preferred wallet to connect
        </p>
      `

      // Wallet list container
      const walletList = document.createElement('div')
      walletList.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
      `

      // Add detected wallets
      if (availableWallets.length > 0) {
        availableWallets.forEach(wallet => {
          const walletButton = document.createElement('button')
          walletButton.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
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
          `
          walletButton.innerHTML = `
            <span style="font-size: 20px;">${wallet.icon}</span>
            <span style="flex: 1;">${wallet.name}</span>
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
          walletButton.onclick = () => {
            modalOverlay.remove()
            resolve(wallet)
          }
          walletList.appendChild(walletButton)
        })
      } else {
        // No wallets detected - show QR code option
        const noWalletMessage = document.createElement('div')
        noWalletMessage.style.cssText = `
          text-align: center;
          padding: 20px;
          color: #9CA3AF;
        `
        noWalletMessage.innerHTML = `
          <p style="margin: 0 0 16px 0;">No wallets detected</p>
          <button style="
            background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          ">Show QR Code</button>
        `
        noWalletMessage.querySelector('button').onclick = () => {
          modalOverlay.remove()
          resolve({ name: 'qr', universal: 'qr' })
        }
        walletList.appendChild(noWalletMessage)
      }

      // Cancel button
      const cancelButton = document.createElement('button')
      cancelButton.style.cssText = `
        width: 100%;
        padding: 14px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid #EF4444;
        border-radius: 12px;
        color: #EF4444;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      `
      cancelButton.textContent = 'Cancel'
      cancelButton.onmouseenter = () => {
        cancelButton.style.background = 'rgba(239, 68, 68, 0.2)'
      }
      cancelButton.onmouseleave = () => {
        cancelButton.style.background = 'rgba(239, 68, 68, 0.1)'
      }
      cancelButton.onclick = () => {
        modalOverlay.remove()
        resolve(null)
      }

      // Assemble modal
      modalContent.appendChild(header)
      modalContent.appendChild(walletList)
      modalContent.appendChild(cancelButton)
      modalOverlay.appendChild(modalContent)
      document.body.appendChild(modalOverlay)

      // Close modal on overlay click
      modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.remove()
          resolve(null)
        }
      }
    })
  }

  // 1️⃣2️⃣ FIXED: Enhanced Mobile Wallet Connection with Selection
  async function connectMobileWallet(uri) {
    try {
      // Show wallet selection modal
      const selectedWallet = await showMobileWalletSelector(uri)
      
      if (!selectedWallet) {
        console.log('❌ User cancelled wallet selection')
        showStatus('Wallet connection cancelled', 'error')
        return false
      }

      if (selectedWallet.name === 'qr') {
        // Show QR code modal
        if (modal) {
          modal.openModal({ uri })
          showStatus('Scan QR code with your wallet', 'info')
        }
        return true
      }

      // Open selected wallet
      console.log(`📱 Opening ${selectedWallet.name}...`)
      showStatus(`Opening ${selectedWallet.name}...`, 'info')

      const walletLink = selectedWallet.universal + encodeURIComponent(uri)
      
      // Enhanced app opening with multiple fallbacks
      const openApp = async () => {
        try {
          // Method 1: Direct window location
          window.location.href = walletLink
          
          // Method 2: Create iframe for universal links
          setTimeout(() => {
            const iframe = document.createElement('iframe')
            iframe.style.display = 'none'
            iframe.src = walletLink
            document.body.appendChild(iframe)
            
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe)
              }
            }, 3000)
          }, 100)
          
          // Method 3: Timeout fallback to QR code
          setTimeout(() => {
            if (modal && !document.hidden) {
              console.log('🔄 Falling back to QR code...')
              modal.openModal({ uri })
              showStatus('Wallet not found - scan QR code instead', 'info')
            }
          }, 2000)
          
          return true
        } catch (error) {
          console.error('❌ Error opening wallet:', error)
          return false
        }
      }

      return await openApp()
      
    } catch (error) {
      console.error('❌ Mobile wallet connection error:', error)
      showStatus('Failed to open wallet', 'error')
      return false
    }
  }

  // 1️⃣3️⃣ Enhanced WalletConnect Connection
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
          // FIXED: Use enhanced mobile wallet selection
          await connectMobileWallet(uri)
        } else {
          // Desktop flow
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

  // 1️⃣5️⃣ Desktop Wallet Detection (unchanged)
  async function detectInstalledWallets() {
    return new Promise((resolve) => {
      const wallets = {
        metamask: !!window.ethereum?.isMetaMask,
        trust: !!window.ethereum?.isTrust,
        rainbow: !!window.ethereum?.isRainbow,
        coinbase: !!window.ethereum?.isCoinbaseWallet,
        phantom: !!window.ethereum?.isPhantom,
        brave: !!window.ethereum?.isBraveWallet,
        rabby: !!window.ethereum?.isRabby,
      }

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
          }
        })
      }

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
        }
      }
      
      return false
      
    } catch (error) {
      console.error('❌ Desktop wallet connection error:', error)
      return false
    }
  }

  // 1️⃣6️⃣ Main Connect Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      if (!isMobile()) {
        console.log('🖥️ Desktop detected - attempting enhanced wallet connection...')
        
        const directConnected = await connectDesktopWallet()
        if (directConnected) {
          return
        }
        
        console.log('🔄 Direct connection not available, using WalletConnect...')
        await connectViaWalletConnect()
      } else {
        console.log('📱 Mobile detected - using enhanced wallet selection...')
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
  }

  // 1️⃣8️⃣ Button click handler
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

  // 1️⃣9️⃣ Restore saved session
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

  // Initialize and restore connection
  await restoreWalletConnection()

  // 2️⃣0️⃣ Session event listeners
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

  // 2️⃣1️⃣ EIP-6963 Provider Discovery
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

  setupEIP6963()

  // 2️⃣2️⃣ Provider change detection
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
