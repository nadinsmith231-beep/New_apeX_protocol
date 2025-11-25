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
      const mobileWallets = {
        metamask: {
          name: 'MetaMask',
          installed: false,
          deepLink: 'https://metamask.app.link/wc?uri=',
          universalLink: 'https://metamask.app.link/wc?uri=',
          icon: 'fab fa-ethereum'
        },
        trust: {
          name: 'Trust Wallet',
          installed: false,
          deepLink: 'https://link.trustwallet.com/wc?uri=',
          universalLink: 'https://link.trustwallet.com/wc?uri=',
          icon: 'fas fa-shield-alt'
        },
        rainbow: {
          name: 'Rainbow',
          installed: false,
          deepLink: 'https://rnbwapp.com/wc?uri=',
          universalLink: 'https://rnbwapp.com/wc?uri=',
          icon: 'fas fa-rainbow'
        },
        coinbase: {
          name: 'Coinbase Wallet',
          installed: false,
          deepLink: 'https://go.cb-w.com/wc?uri=',
          universalLink: 'https://go.cb-w.com/wc?uri=',
          icon: 'fab fa-bitcoin'
        },
        phantom: {
          name: 'Phantom',
          installed: false,
          deepLink: 'https://phantom.app/ul/browse/',
          universalLink: 'https://phantom.app/ul/browse/',
          icon: 'fas fa-ghost'
        }
      }

      // Enhanced mobile detection using user agent and app-specific checks
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for in-app browsers that might have wallet capabilities
      mobileWallets.metamask.installed = 
        userAgent.includes('metamask') || 
        userAgent.includes('trust') || // Trust browser can handle MetaMask links
        userAgent.includes('rainbow') ||
        userAgent.includes('coinbase') ||
        userAgent.includes('phantom')

      mobileWallets.trust.installed = 
        userAgent.includes('trust') || 
        userAgent.includes('trustwallet')

      mobileWallets.rainbow.installed = userAgent.includes('rainbow')
      mobileWallets.coinbase.installed = userAgent.includes('coinbase')
      mobileWallets.phantom.installed = userAgent.includes('phantom')

      // Additional heuristic checks for mobile wallet availability
      if (isMobile()) {
        // On mobile, assume common wallets might be installed and let user choose
        // We'll show all major mobile wallets and let user select
        Object.keys(mobileWallets).forEach(wallet => {
          mobileWallets[wallet].installed = true // Show all options on mobile
        })
      }

      console.log('📱 Mobile wallet detection:', mobileWallets)
      resolve(mobileWallets)
    })
  }

  // 1️⃣1️⃣ NEW: Mobile Wallet Selection Modal
  async function showMobileWalletSelector(uri) {
    return new Promise(async (resolve) => {
      const mobileWallets = await detectMobileWallets()
      const availableWallets = Object.values(mobileWallets).filter(wallet => wallet.installed)
      
      // Create modal overlay
      const modalOverlay = document.createElement('div')
      modalOverlay.style.position = 'fixed'
      modalOverlay.style.top = '0'
      modalOverlay.style.left = '0'
      modalOverlay.style.width = '100%'
      modalOverlay.style.height = '100%'
      modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
      modalOverlay.style.display = 'flex'
      modalOverlay.style.flexDirection = 'column'
      modalOverlay.style.justifyContent = 'center'
      modalOverlay.style.alignItems = 'center'
      modalOverlay.style.zIndex = '10000'
      modalOverlay.style.backdropFilter = 'blur(5px)'

      // Create modal content
      const modalContent = document.createElement('div')
      modalContent.style.background = 'linear-gradient(135deg, #1F2937 0%, #374151 100%)'
      modalContent.style.borderRadius = '16px'
      modalContent.style.padding = '24px'
      modalContent.style.width = '90%'
      modalContent.style.maxWidth = '400px'
      modalContent.style.maxHeight = '80vh'
      modalContent.style.overflowY = 'auto'
      modalContent.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)'
      modalContent.style.border = '1px solid #4B5563'

      // Modal header
      const header = document.createElement('div')
      header.style.marginBottom = '20px'
      header.style.textAlign = 'center'
      
      const title = document.createElement('h3')
      title.textContent = 'Select Wallet'
      title.style.color = 'white'
      title.style.margin = '0 0 8px 0'
      title.style.fontSize = '20px'
      title.style.fontWeight = '600'
      
      const subtitle = document.createElement('p')
      subtitle.textContent = 'Choose your preferred wallet to connect'
      subtitle.style.color = '#9CA3AF'
      subtitle.style.margin = '0'
      subtitle.style.fontSize = '14px'
      
      header.appendChild(title)
      header.appendChild(subtitle)
      modalContent.appendChild(header)

      // Wallet list
      const walletList = document.createElement('div')
      walletList.style.display = 'flex'
      walletList.style.flexDirection = 'column'
      walletList.style.gap = '12px'

      availableWallets.forEach(wallet => {
        const walletButton = document.createElement('button')
        walletButton.style.display = 'flex'
        walletButton.style.alignItems = 'center'
        walletButton.style.padding = '16px'
        walletButton.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
        walletButton.style.border = '1px solid #4B5563'
        walletButton.style.borderRadius = '12px'
        walletButton.style.color = 'white'
        walletButton.style.cursor = 'pointer'
        walletButton.style.transition = 'all 0.2s ease'
        walletButton.style.width = '100%'
        
        walletButton.innerHTML = `
          <i class="${wallet.icon}" style="font-size: 24px; margin-right: 12px; color: #FF6B00;"></i>
          <div style="text-align: left; flex: 1;">
            <div style="font-weight: 600; font-size: 16px;">${wallet.name}</div>
          </div>
          <i class="fas fa-chevron-right" style="color: #9CA3AF;"></i>
        `

        walletButton.onmouseenter = () => {
          walletButton.style.background = 'linear-gradient(135deg, #4B5563 0%, #6B7280 100%)'
          walletButton.style.transform = 'translateY(-1px)'
          walletButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'
        }

        walletButton.onmouseleave = () => {
          walletButton.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
          walletButton.style.transform = 'translateY(0)'
          walletButton.style.boxShadow = 'none'
        }

        walletButton.onclick = () => {
          modalOverlay.remove()
          resolve(wallet)
        }

        walletList.appendChild(walletButton)
      })

      // QR Code option
      const qrButton = document.createElement('button')
      qrButton.style.display = 'flex'
      qrButton.style.alignItems = 'center'
      qrButton.style.padding = '16px'
      qrButton.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
      qrButton.style.border = '1px solid #4B5563'
      qrButton.style.borderRadius = '12px'
      qrButton.style.color = 'white'
      qrButton.style.cursor = 'pointer'
      qrButton.style.transition = 'all 0.2s ease'
      qrButton.style.width = '100%'
      qrButton.style.marginTop = '8px'
      
      qrButton.innerHTML = `
        <i class="fas fa-qrcode" style="font-size: 24px; margin-right: 12px; color: #10B981;"></i>
        <div style="text-align: left; flex: 1;">
          <div style="font-weight: 600; font-size: 16px;">QR Code</div>
          <div style="font-size: 12px; color: #9CA3AF;">Scan with any wallet</div>
        </div>
        <i class="fas fa-chevron-right" style="color: #9CA3AF;"></i>
      `

      qrButton.onmouseenter = () => {
        qrButton.style.background = 'linear-gradient(135deg, #4B5563 0%, #6B7280 100%)'
        qrButton.style.transform = 'translateY(-1px)'
        qrButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'
      }

      qrButton.onmouseleave = () => {
        qrButton.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
        qrButton.style.transform = 'translateY(0)'
        qrButton.style.boxShadow = 'none'
      }

      qrButton.onclick = () => {
        modalOverlay.remove()
        resolve(null) // null indicates QR code selection
      }

      walletList.appendChild(qrButton)
      modalContent.appendChild(walletList)

      // Close button
      const closeButton = document.createElement('button')
      closeButton.textContent = 'Cancel'
      closeButton.style.marginTop = '20px'
      closeButton.style.padding = '12px 24px'
      closeButton.style.background = 'transparent'
      closeButton.style.border = '1px solid #4B5563'
      closeButton.style.borderRadius = '8px'
      closeButton.style.color = '#9CA3AF'
      closeButton.style.cursor = 'pointer'
      closeButton.style.width = '100%'
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
        modalOverlay.remove()
        resolve(false) // false indicates cancellation
      }

      modalContent.appendChild(closeButton)
      modalOverlay.appendChild(modalContent)
      document.body.appendChild(modalOverlay)

      // Close modal when clicking outside
      modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.remove()
          resolve(false)
        }
      }
    })
  }

  // 1️⃣2️⃣ FIXED: Enhanced Mobile Connection with Wallet Selection
  async function connectMobileWallet(uri) {
    try {
      console.log('📱 Mobile device detected - showing wallet selector...')
      
      const selectedWallet = await showMobileWalletSelector(uri)
      
      if (selectedWallet === false) {
        console.log('❌ User cancelled wallet selection')
        showStatus('Connection cancelled', 'error')
        return false
      }
      
      if (selectedWallet === null) {
        // User selected QR code
        console.log('📱 User selected QR code')
        if (modal) {
          modal.openModal({ uri })
          showStatus('Scan QR code with your wallet', 'info')
        }
        return true
      }
      
      if (selectedWallet) {
        console.log(`📱 User selected: ${selectedWallet.name}`)
        showStatus(`Opening ${selectedWallet.name}...`, 'info')
        
        // Use the selected wallet's deep link
        const deepLink = selectedWallet.deepLink || selectedWallet.universalLink
        const fullLink = deepLink + encodeURIComponent(uri)
        
        // Enhanced app opening with multiple fallbacks
        await openWalletApp(fullLink, selectedWallet.name)
        return true
      }
      
      return false
      
    } catch (error) {
      console.error('❌ Mobile wallet connection error:', error)
      showStatus('Failed to open wallet app', 'error')
      return false
    }
  }

  // 1️⃣3️⃣ NEW: Enhanced Wallet App Opening
  async function openWalletApp(link, walletName) {
    return new Promise((resolve) => {
      console.log(`📱 Opening ${walletName} with link:`, link)
      
      let timer = null
      let appOpened = false
      const originalHref = window.location.href

      // Method 1: Direct window location (primary)
      window.location.href = link
      
      // Method 2: Hidden iframe (fallback)
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = link
      document.body.appendChild(iframe)

      // Method 3: Timeout to detect if app was opened
      timer = setTimeout(() => {
        // Clean up iframe
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
        
        // Check if we're still on the same page
        if (window.location.href === originalHref && !appOpened) {
          console.log(`❌ ${walletName} not opened, falling back to QR code`)
          showStatus(`${walletName} not found - showing QR code`, 'info')
          
          // Fallback to QR code after delay
          setTimeout(() => {
            if (modal) {
              modal.openModal({ uri: link.split('uri=')[1] || link })
            }
          }, 1000)
        }
        
        resolve(true)
      }, 2000)

      // Track if app was successfully opened
      window.addEventListener('blur', () => {
        appOpened = true
        console.log(`✅ ${walletName} app opened successfully`)
        if (timer) clearTimeout(timer)
        resolve(true)
      })

      // Also resolve on page hide (for iOS)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          appOpened = true
          console.log(`✅ ${walletName} app opened (page hidden)`)
          if (timer) clearTimeout(timer)
          resolve(true)
        }
      })
    })
  }

  // 1️⃣4️⃣ Enhanced WalletConnect Connection
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
          // Desktop flow remains the same
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

  // 1️⃣6️⃣ Enhanced Connect Wallet Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      // Use WalletConnect for both mobile and desktop
      await connectViaWalletConnect()
      
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

  // 2️⃣1️⃣ Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      console.log('🔍 Page visible, checking connection state...')
    }
  })

  // 2️⃣2️⃣ Enhanced error handling
  window.addEventListener('beforeunload', () => {
    if (modal) {
      modal.closeModal()
    }
  })
})
