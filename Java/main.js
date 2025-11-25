// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile Wallet Detection) =====

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
      const wallets = {
        metamask: {
          name: 'MetaMask',
          installed: false,
          deepLink: 'https://metamask.app.link/wc?uri=',
          universalLink: 'https://metamask.app.link/wc?uri=',
          storeLink: 'https://metamask.app.link'
        },
        trust: {
          name: 'Trust Wallet',
          installed: false,
          deepLink: 'https://link.trustwallet.com/wc?uri=',
          universalLink: 'https://link.trustwallet.com/wc?uri=',
          storeLink: 'https://trustwallet.com'
        },
        rainbow: {
          name: 'Rainbow',
          installed: false,
          deepLink: 'https://rnbwapp.com/wc?uri=',
          universalLink: 'https://rnbwapp.com/wc?uri=',
          storeLink: 'https://rainbow.me'
        },
        coinbase: {
          name: 'Coinbase Wallet',
          installed: false,
          deepLink: 'https://go.cb-w.com/wc?uri=',
          universalLink: 'https://go.cb-w.com/wc?uri=',
          storeLink: 'https://coinbase.com/wallet'
        },
        phantom: {
          name: 'Phantom',
          installed: false,
          deepLink: 'https://phantom.app/ul/browse/',
          universalLink: 'https://phantom.app/ul/browse/',
          storeLink: 'https://phantom.app'
        }
      }

      // Enhanced mobile detection using user agent and app presence
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for app-specific patterns in user agent
      if (userAgent.includes('metamask') || userAgent.includes('trust') || 
          userAgent.includes('rainbow') || userAgent.includes('coinbase') || 
          userAgent.includes('phantom')) {
        if (userAgent.includes('metamask')) wallets.metamask.installed = true
        if (userAgent.includes('trust')) wallets.trust.installed = true
        if (userAgent.includes('rainbow')) wallets.rainbow.installed = true
        if (userAgent.includes('coinbase')) wallets.coinbase.installed = true
        if (userAgent.includes('phantom')) wallets.phantom.installed = true
      }

      // Enhanced detection using timeout-based app presence check
      const checkAppPresence = (appName, deeplink) => {
        return new Promise((resolve) => {
          const startTime = Date.now()
          const timeout = 2000
          
          // Create hidden iframe for app detection
          const iframe = document.createElement('iframe')
          iframe.style.display = 'none'
          iframe.src = deeplink
          
          iframe.onload = () => {
            const loadTime = Date.now() - startTime
            // If load time is very fast, app might be installed
            resolve(loadTime < 500)
          }
          
          document.body.appendChild(iframe)
          
          setTimeout(() => {
            document.body.removeChild(iframe)
            resolve(false)
          }, timeout)
        })
      }

      // Check each wallet sequentially
      const checkAllWallets = async () => {
        for (const walletKey in wallets) {
          const wallet = wallets[walletKey]
          const isInstalled = await checkAppPresence(wallet.name, wallet.deepLink + 'test')
          wallet.installed = wallet.installed || isInstalled
        }
        
        console.log('📱 Enhanced mobile wallet detection:', wallets)
        resolve(wallets)
      }
      
      checkAllWallets()
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
        <h3 style="color: white; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Select Wallet</h3>
        <p style="color: #9CA3AF; margin: 0; font-size: 14px;">Choose your preferred wallet to connect</p>
      `
      modal.appendChild(header)

      // Available wallets list
      const availableWallets = Object.values(wallets).filter(wallet => wallet.installed)
      const allWallets = Object.values(wallets)

      if (availableWallets.length > 0) {
        const installedSection = document.createElement('div')
        installedSection.style.marginBottom = '20px'
        
        const installedTitle = document.createElement('div')
        installedTitle.style.color = '#9CA3AF'
        installedTitle.style.fontSize = '12px'
        installedTitle.style.fontWeight = '600'
        installedTitle.style.marginBottom = '12px'
        installedTitle.style.textTransform = 'uppercase'
        installedTitle.style.letterSpacing = '0.5px'
        installedTitle.textContent = 'Installed Wallets'
        installedSection.appendChild(installedTitle)

        availableWallets.forEach(wallet => {
          const walletButton = document.createElement('button')
          walletButton.style.width = '100%'
          walletButton.style.padding = '16px'
          walletButton.style.marginBottom = '8px'
          walletButton.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
          walletButton.style.border = '1px solid #4B5563'
          walletButton.style.borderRadius = '12px'
          walletButton.style.color = 'white'
          walletButton.style.fontSize = '16px'
          walletButton.style.fontWeight = '500'
          walletButton.style.cursor = 'pointer'
          walletButton.style.transition = 'all 0.2s ease'
          walletButton.style.display = 'flex'
          walletButton.style.alignItems = 'center'
          walletButton.style.justifyContent = 'flex-start'
          walletButton.innerHTML = `
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
              <i class="fas fa-wallet" style="color: white; font-size: 18px;"></i>
            </div>
            <span>${wallet.name}</span>
          `

          walletButton.onmouseenter = () => {
            walletButton.style.background = 'linear-gradient(135deg, #4B5563 0%, #6B7280 100%)'
            walletButton.style.transform = 'translateY(-1px)'
          }

          walletButton.onmouseleave = () => {
            walletButton.style.background = 'linear-gradient(135deg, #374151 0%, #4B5563 100%)'
            walletButton.style.transform = 'translateY(0)'
          }

          walletButton.onclick = () => {
            overlay.remove()
            resolve(wallet)
          }

          installedSection.appendChild(walletButton)
        })

        modal.appendChild(installedSection)
      }

      // All wallets section
      const allSection = document.createElement('div')
      
      const allTitle = document.createElement('div')
      allTitle.style.color = '#9CA3AF'
      allTitle.style.fontSize = '12px'
      allTitle.style.fontWeight = '600'
      allTitle.style.marginBottom = '12px'
      allTitle.style.textTransform = 'uppercase'
      allTitle.style.letterSpacing = '0.5px'
      allTitle.textContent = availableWallets.length > 0 ? 'Other Wallets' : 'Available Wallets'
      allSection.appendChild(allTitle)

      allWallets.forEach(wallet => {
        if (!availableWallets.includes(wallet)) {
          const walletButton = document.createElement('button')
          walletButton.style.width = '100%'
          walletButton.style.padding = '16px'
          walletButton.style.marginBottom = '8px'
          walletButton.style.background = 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
          walletButton.style.border = '1px solid #374151'
          walletButton.style.borderRadius = '12px'
          walletButton.style.color = '#9CA3AF'
          walletButton.style.fontSize = '16px'
          walletButton.style.fontWeight = '500'
          walletButton.style.cursor = 'pointer'
          walletButton.style.transition = 'all 0.2s ease'
          walletButton.style.display = 'flex'
          walletButton.style.alignItems = 'center'
          walletButton.style.justifyContent = 'space-between'
          walletButton.innerHTML = `
            <div style="display: flex; align-items: center;">
              <div style="width: 40px; height: 40px; background: #374151; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                <i class="fas fa-wallet" style="color: #6B7280; font-size: 18px;"></i>
              </div>
              <span>${wallet.name}</span>
            </div>
            <span style="background: #374151; color: #9CA3AF; padding: 4px 8px; border-radius: 6px; font-size: 12px;">Install</span>
          `

          walletButton.onclick = () => {
            window.open(wallet.storeLink, '_blank')
            overlay.remove()
            resolve(null)
          }

          allSection.appendChild(walletButton)
        }
      })

      modal.appendChild(allSection)

      // Close button
      const closeButton = document.createElement('button')
      closeButton.style.width = '100%'
      closeButton.style.padding = '12px'
      closeButton.style.marginTop = '16px'
      closeButton.style.background = 'transparent'
      closeButton.style.border = '1px solid #374151'
      closeButton.style.borderRadius = '12px'
      closeButton.style.color = '#9CA3AF'
      closeButton.style.fontSize = '14px'
      closeButton.style.fontWeight = '500'
      closeButton.style.cursor = 'pointer'
      closeButton.textContent = 'Cancel'
      closeButton.onclick = () => {
        overlay.remove()
        resolve(null)
      }

      modal.appendChild(closeButton)
      overlay.appendChild(modal)
      document.body.appendChild(overlay)

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.remove()
          resolve(null)
        }
      }
    })
  }

  // 1️⃣2️⃣ FIXED: Enhanced Mobile Wallet Connection with App Selection
  async function connectMobileWallet(uri) {
    try {
      console.log('📱 Starting enhanced mobile wallet connection...')
      
      // Detect available mobile wallets
      const detectedWallets = await detectMobileWallets()
      const availableWallets = Object.values(detectedWallets).filter(wallet => wallet.installed)
      
      console.log(`📱 Found ${availableWallets.length} installed wallets:`, availableWallets.map(w => w.name))

      if (availableWallets.length === 0) {
        console.log('📱 No installed wallets detected, using universal WalletConnect link')
        // Fallback to Trust Wallet universal link
        const universalLink = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`
        window.location.href = universalLink
        showStatus('Opening Trust Wallet...', 'info')
        return true
      }

      if (availableWallets.length === 1) {
        // Auto-connect if only one wallet is available
        console.log(`📱 Auto-connecting to ${availableWallets[0].name}`)
        const wallet = availableWallets[0]
        const deepLink = wallet.deepLink + encodeURIComponent(uri)
        window.location.href = deepLink
        showStatus(`Opening ${wallet.name}...`, 'info')
        return true
      }

      // Show wallet selector for multiple installed wallets
      console.log('📱 Showing wallet selector for multiple installed wallets')
      const selectedWallet = await showMobileWalletSelector(detectedWallets, uri)
      
      if (selectedWallet) {
        console.log(`📱 User selected: ${selectedWallet.name}`)
        const deepLink = selectedWallet.deepLink + encodeURIComponent(uri)
        
        // Enhanced app opening with fallback
        const openApp = () => {
          window.location.href = deepLink
          showStatus(`Opening ${selectedWallet.name}...`, 'info')
        }
        
        openApp()
        
        // Fallback to universal link if app doesn't open
        setTimeout(() => {
          if (!document.hidden) {
            console.log('📱 App not opened, trying universal link')
            const universalLink = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`
            window.location.href = universalLink
            showStatus('Opening Trust Wallet...', 'info')
          }
        }, 1500)
        
        return true
      } else {
        console.log('📱 User cancelled wallet selection')
        showStatus('Wallet selection cancelled', 'error')
        return false
      }
      
    } catch (error) {
      console.error('❌ Mobile wallet connection error:', error)
      // Final fallback to QR modal
      if (modal) {
        modal.openModal({ uri })
        showStatus('Scan QR code with your wallet', 'info')
      }
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
          // Use enhanced mobile wallet connection with app selection
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

  // 1️⃣5️⃣ Enhanced Connect Wallet Function
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing wallet connection...', 'info')

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

  // 1️⃣8️⃣ Restore saved wallet and session
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

  // 2️⃣0️⃣ Enhanced provider change detection
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
