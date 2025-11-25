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

  // 🔟 ENHANCED: Mobile Wallet Detection with App Selection
  function detectMobileWallets() {
    return new Promise((resolve) => {
      const wallets = {
        metamask: {
          detected: false,
          name: 'MetaMask',
          icon: 'fas fa-fox',
          deepLink: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        trust: {
          detected: false,
          name: 'Trust Wallet',
          icon: 'fas fa-shield-alt',
          deepLink: (uri) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        rainbow: {
          detected: false,
          name: 'Rainbow',
          icon: 'fas fa-rainbow',
          deepLink: (uri) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: false
        },
        coinbase: {
          detected: false,
          name: 'Coinbase Wallet',
          icon: 'fas fa-wallet',
          deepLink: (uri) => `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
          universal: true
        },
        phantom: {
          detected: false,
          name: 'Phantom',
          icon: 'fas fa-ghost',
          deepLink: (uri) => `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
          universal: false
        }
      }

      // Enhanced mobile app detection using user agent and known patterns
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for in-app browsers that indicate installed wallets
      if (userAgent.includes('metamask') || userAgent.includes('trust') || 
          userAgent.includes('rainbow') || userAgent.includes('cbwallet') ||
          userAgent.includes('phantom')) {
        
        if (userAgent.includes('metamask')) wallets.metamask.detected = true
        if (userAgent.includes('trust')) wallets.trust.detected = true
        if (userAgent.includes('rainbow')) wallets.rainbow.detected = true
        if (userAgent.includes('cbwallet')) wallets.coinbase.detected = true
        if (userAgent.includes('phantom')) wallets.phantom.detected = true
      }

      // Enhanced URL scheme testing for mobile wallets
      const testLinks = {
        metamask: 'metamask://',
        trust: 'trust://',
        rainbow: 'rainbow://',
        coinbase: 'cbwallet://',
        phantom: 'phantom://'
      }

      // Test each wallet's URL scheme
      Object.keys(testLinks).forEach(wallet => {
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = testLinks[wallet]
        document.body.appendChild(iframe)
        
        setTimeout(() => {
          document.body.removeChild(iframe)
          // If we're still here, the app might not be installed
          // But we'll still show it in the list for user selection
        }, 100)
      })

      console.log('📱 Mobile wallet detection:', wallets)
      resolve(wallets)
    })
  }

  // 1️⃣1️⃣ NEW: Mobile Wallet Selection Modal
  async function showMobileWalletSelector(uri) {
    return new Promise(async (resolve) => {
      const wallets = await detectMobileWallets()
      
      // Create modal overlay
      const modalOverlay = document.createElement('div')
      modalOverlay.style.position = 'fixed'
      modalOverlay.style.top = '0'
      modalOverlay.style.left = '0'
      modalOverlay.style.width = '100%'
      modalOverlay.style.height = '100%'
      modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
      modalOverlay.style.display = 'flex'
      modalOverlay.style.justifyContent = 'center'
      modalOverlay.style.alignItems = 'center'
      modalOverlay.style.zIndex = '10000'
      modalOverlay.style.backdropFilter = 'blur(8px)'

      // Modal content
      const modalContent = document.createElement('div')
      modalContent.style.background = 'linear-gradient(135deg, #1F2937 0%, #374151 100%)'
      modalContent.style.borderRadius = '16px'
      modalContent.style.padding = '24px'
      modalContent.style.width = '90%'
      modalContent.style.maxWidth = '400px'
      modalContent.style.maxHeight = '80vh'
      modalContent.style.overflowY = 'auto'
      modalContent.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)'
      modalContent.style.border = '1px solid rgba(255, 107, 0, 0.3)'

      // Title
      const title = document.createElement('h3')
      title.textContent = 'Select Wallet'
      title.style.color = 'white'
      title.style.marginBottom = '20px'
      title.style.textAlign = 'center'
      title.style.fontSize = '20px'
      title.style.fontWeight = '600'

      // Wallet list container
      const walletList = document.createElement('div')
      walletList.style.display = 'flex'
      walletList.style.flexDirection = 'column'
      walletList.style.gap = '12px'

      // Available mobile wallets (always show popular ones)
      const availableWallets = [
        wallets.metamask,
        wallets.trust, 
        wallets.coinbase,
        wallets.rainbow,
        wallets.phantom
      ]

      // Create wallet buttons
      availableWallets.forEach(wallet => {
        const walletButton = document.createElement('button')
        walletButton.style.display = 'flex'
        walletButton.style.alignItems = 'center'
        walletButton.style.justifyContent = 'flex-start'
        walletButton.style.padding = '16px'
        walletButton.style.background = 'rgba(255, 255, 255, 0.1)'
        walletButton.style.border = '1px solid rgba(255, 255, 255, 0.2)'
        walletButton.style.borderRadius = '12px'
        walletButton.style.color = 'white'
        walletButton.style.cursor = 'pointer'
        walletButton.style.transition = 'all 0.3s ease'
        walletButton.style.width = '100%'
        walletButton.style.fontSize = '16px'
        walletButton.style.fontWeight = '500'

        // Wallet icon and name
        walletButton.innerHTML = `
          <i class="${wallet.icon}" style="margin-right: 12px; font-size: 20px; color: #FF6B00;"></i>
          <span>${wallet.name}</span>
          ${wallet.detected ? '<span style="margin-left: auto; font-size: 12px; color: #10B981;">Detected</span>' : ''}
        `

        // Hover effects
        walletButton.onmouseenter = () => {
          walletButton.style.background = 'rgba(255, 107, 0, 0.2)'
          walletButton.style.borderColor = '#FF6B00'
          walletButton.style.transform = 'translateY(-2px)'
        }
        walletButton.onmouseleave = () => {
          walletButton.style.background = 'rgba(255, 255, 255, 0.1)'
          walletButton.style.borderColor = 'rgba(255, 255, 255, 0.2)'
          walletButton.style.transform = 'translateY(0)'
        }

        // Click handler
        walletButton.addEventListener('click', async () => {
          modalContent.style.opacity = '0.7'
          walletButton.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right: 12px;"></i>Opening ${wallet.name}...`
          walletButton.disabled = true

          const success = await openSpecificWallet(uri, wallet)
          if (success) {
            document.body.removeChild(modalOverlay)
            resolve(true)
          } else {
            modalContent.style.opacity = '1'
            walletButton.innerHTML = `
              <i class="${wallet.icon}" style="margin-right: 12px; font-size: 20px; color: #EF4444;"></i>
              <span>Failed - Try Again</span>
            `
            setTimeout(() => {
              walletButton.innerHTML = `
                <i class="${wallet.icon}" style="margin-right: 12px; font-size: 20px; color: #FF6B00;"></i>
                <span>${wallet.name}</span>
                ${wallet.detected ? '<span style="margin-left: auto; font-size: 12px; color: #10B981;">Detected</span>' : ''}
              `
              walletButton.disabled = false
            }, 2000)
          }
        })

        walletList.appendChild(walletButton)
      })

      // QR Code option
      const qrOption = document.createElement('button')
      qrOption.style.display = 'flex'
      qrOption.style.alignItems = 'center'
      qrOption.style.justifyContent = 'flex-start'
      qrOption.style.padding = '16px'
      qrOption.style.background = 'rgba(255, 107, 0, 0.1)'
      qrOption.style.border = '1px solid rgba(255, 107, 0, 0.3)'
      qrOption.style.borderRadius = '12px'
      qrOption.style.color = 'white'
      qrOption.style.cursor = 'pointer'
      qrOption.style.transition = 'all 0.3s ease'
      qrOption.style.width = '100%'
      qrOption.style.fontSize = '16px'
      qrOption.style.fontWeight = '500'
      qrOption.style.marginTop = '8px'

      qrOption.innerHTML = `
        <i class="fas fa-qrcode" style="margin-right: 12px; font-size: 20px; color: #FF6B00;"></i>
        <span>Scan QR Code</span>
      `

      qrOption.addEventListener('click', () => {
        document.body.removeChild(modalOverlay)
        if (modal) {
          modal.openModal({ uri })
          showStatus('Scan QR code with your wallet', 'info')
        }
        resolve(false)
      })

      // Close button
      const closeButton = document.createElement('button')
      closeButton.textContent = 'Cancel'
      closeButton.style.padding = '12px'
      closeButton.style.background = 'rgba(239, 68, 68, 0.1)'
      closeButton.style.border = '1px solid rgba(239, 68, 68, 0.3)'
      closeButton.style.borderRadius = '8px'
      closeButton.style.color = '#EF4444'
      closeButton.style.cursor = 'pointer'
      closeButton.style.transition = 'all 0.3s ease'
      closeButton.style.width = '100%'
      closeButton.style.marginTop = '12px'
      closeButton.style.fontSize = '14px'

      closeButton.addEventListener('click', () => {
        document.body.removeChild(modalOverlay)
        resolve(false)
      })

      // Assemble modal
      modalContent.appendChild(title)
      modalContent.appendChild(walletList)
      modalContent.appendChild(qrOption)
      modalContent.appendChild(closeButton)
      modalOverlay.appendChild(modalContent)
      document.body.appendChild(modalOverlay)

      // Close modal when clicking outside
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          document.body.removeChild(modalOverlay)
          resolve(false)
        }
      })
    })
  }

  // 1️⃣2️⃣ NEW: Open Specific Wallet with Enhanced Detection
  async function openSpecificWallet(uri, wallet) {
    return new Promise((resolve) => {
      const link = wallet.deepLink(uri)
      console.log(`📱 Attempting to open ${wallet.name}: ${link}`)

      let timer = null
      let appOpened = false
      const originalHref = window.location.href

      // Create hidden iframe for universal links
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = link
      document.body.appendChild(iframe)

      // Set timeout to detect if app was opened
      timer = setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }

        if (window.location.href === originalHref && !appOpened) {
          console.log(`❌ ${wallet.name} not opened`)
          
          // Fallback: Try direct window location
          window.location.href = link
          setTimeout(() => {
            resolve(false)
          }, 2000)
        } else {
          appOpened = true
          resolve(true)
        }
      }, 1500)

      // Also try direct window location immediately as backup
      setTimeout(() => {
        if (!appOpened) {
          window.location.href = link
        }
      }, 100)
    })
  }

  // 1️⃣3️⃣ ENHANCED: Mobile Connection with Wallet Selection
  async function connectMobileWallet() {
    try {
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return
      }

      showStatus('Preparing wallet connection...', 'info')

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
        // Show mobile wallet selector instead of auto-selecting
        const walletSelected = await showMobileWalletSelector(uri)
        
        if (!walletSelected) {
          // User cancelled or chose QR code (handled in modal)
          return
        }

        showStatus(`Opening selected wallet...`, 'info')
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

  // 1️⃣5️⃣ Enhanced Desktop Wallet Detection (unchanged)
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

  // 1️⃣6️⃣ MAIN: Connect Wallet Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

      if (isMobile()) {
        console.log('📱 Mobile detected - showing wallet selector...')
        await connectMobileWallet()
      } else {
        console.log('🖥️ Desktop detected - attempting direct connection...')
        const directConnected = await connectDesktopWallet()
        if (!directConnected) {
          await connectMobileWallet() // Fallback to WalletConnect
        }
      }
      
    } catch (err) {
      console.error('❌ Wallet connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      showStatus('Wallet connection failed', 'error')
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

  // 1️⃣8️⃣ Button click events
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

  // 1️⃣9️⃣ Restore saved wallet on page load
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
    }
  }, 1000)

  // 2️⃣1️⃣ Provider change detection
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
