// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Desktop + Mobile) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Enhanced Desktop + Mobile Crypto Wallet Detection')

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

  // 🔟 ENHANCED: Crypto-Only Wallet Detection for Mobile
  function detectMobileCryptoWallets() {
    return new Promise((resolve) => {
      if (!isMobile()) {
        resolve({})
        return
      }

      const cryptoWallets = {
        // Primary crypto wallets with deep link support
        metamask: false,
        trust: false,
        rainbow: false,
        coinbase: false,
        phantom: false,
        
        // Additional crypto wallets
        safepal: false,
        tokenpocket: false,
        mathwallet: false,
        bitkeep: false,
        onto: false,
        zerion: false,
        imtoken: false
      }

      // Enhanced mobile detection using user agent and app-specific patterns
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Check for in-app browsers that indicate wallet usage
      const inAppBrowserIndicators = [
        'metamask', 'trust', 'rainbow', 'coinbase', 'phantom',
        'safepal', 'tokenpocket', 'mathwallet', 'bitkeep',
        'onto', 'zerion', 'imtoken', 'wallet'
      ]

      inAppBrowserIndicators.forEach(wallet => {
        if (userAgent.includes(wallet)) {
          cryptoWallets[wallet] = true
        }
      })

      // Enhanced detection for WebView contexts (common in mobile wallets)
      if (userAgent.includes('wv') || // Android WebView
          /android.*version\/[0-9]+\s+safari/.test(userAgent) || // Android in-app
          /crios|fxios|edgios|opt|brave/.test(userAgent)) { // Various browser indicators
          
        // Additional checks for specific wallet patterns
        if (userAgent.includes('trust')) cryptoWallets.trust = true
        if (userAgent.includes('metamask')) cryptoWallets.metamask = true
        if (userAgent.includes('rainbow')) cryptoWallets.rainbow = true
        if (userAgent.includes('coinbase')) cryptoWallets.coinbase = true
      }

      console.log('📱 Mobile Crypto Wallet Detection:', cryptoWallets)
      resolve(cryptoWallets)
    })
  }

  // 1️⃣1️⃣ Enhanced Desktop Wallet Detection (Crypto-Only)
  function detectDesktopCryptoWallets() {
    return new Promise((resolve) => {
      const cryptoWallets = {
        metamask: !!window.ethereum?.isMetaMask,
        trust: !!window.ethereum?.isTrust,
        rainbow: !!window.ethereum?.isRainbow,
        coinbase: !!window.ethereum?.isCoinbaseWallet,
        phantom: !!window.ethereum?.isPhantom,
        brave: !!window.ethereum?.isBraveWallet,
        rabby: !!window.ethereum?.isRabby,
        okx: !!window.ethereum?.isOKExWallet,
        bitget: !!window.ethereum?.isBitKeep,
      }

      // EIP-6963 provider detection for crypto wallets only
      if (window.eip6963Providers) {
        window.eip6963Providers.forEach(provider => {
          if (provider.info.rdns) {
            const rdns = provider.info.rdns.toLowerCase()
            const cryptoWalletPatterns = [
              'metamask', 'trust', 'rainbow', 'coinbase', 'phantom',
              'brave', 'rabby', 'okx', 'bitget', 'safepal', 'mathwallet',
              'tokenpocket', 'zerion', 'imtoken', 'wallet'
            ]

            cryptoWalletPatterns.forEach(pattern => {
              if (rdns.includes(pattern)) {
                cryptoWallets[pattern] = true
              }
            })
          }
        })
      }

      // Multiple providers array detection
      if (window.ethereum?.providers) {
        window.ethereum.providers.forEach(provider => {
          if (provider.isMetaMask && !cryptoWallets.metamask) cryptoWallets.metamask = true
          if (provider.isTrust && !cryptoWallets.trust) cryptoWallets.trust = true
          if (provider.isRainbow && !cryptoWallets.rainbow) cryptoWallets.rainbow = true
          if (provider.isCoinbaseWallet && !cryptoWallets.coinbase) cryptoWallets.coinbase = true
          if (provider.isPhantom && !cryptoWallets.phantom) cryptoWallets.phantom = true
          if (provider.isBraveWallet && !cryptoWallets.brave) cryptoWallets.brave = true
          if (provider.isRabby && !cryptoWallets.rabby) cryptoWallets.rabby = true
        })
      }

      console.log('🖥️ Desktop Crypto Wallet Detection:', cryptoWallets)
      resolve(cryptoWallets)
    })
  }

  // 1️⃣2️⃣ FIXED: Enhanced Desktop Wallet Connection (Crypto-Only)
  async function connectDesktopWallet() {
    try {
      const detectedWallets = await detectDesktopCryptoWallets()
      const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
      
      if (availableWallets.length === 0) {
        console.log('🔍 No crypto wallets detected, using WalletConnect modal')
        return false
      }

      console.log(`🎯 Found crypto wallets: ${availableWallets.join(', ')}`)

      let provider = window.ethereum
      
      // Handle multiple providers
      if (window.ethereum?.providers && window.ethereum.providers.length > 0) {
        provider = window.ethereum.providers[0]
        
        // Priority for crypto wallets only
        const cryptoWalletPriority = ['metamask', 'coinbase', 'rabby', 'trust', 'brave', 'phantom']
        for (const walletName of cryptoWalletPriority) {
          if (detectedWallets[walletName]) {
            const cryptoProvider = window.ethereum.providers.find(p => {
              if (walletName === 'metamask' && p.isMetaMask) return true
              if (walletName === 'coinbase' && p.isCoinbaseWallet) return true
              if (walletName === 'rabby' && p.isRabby) return true
              if (walletName === 'trust' && p.isTrust) return true
              if (walletName === 'brave' && p.isBraveWallet) return true
              if (walletName === 'phantom' && p.isPhantom) return true
              return false
            })
            if (cryptoProvider) {
              provider = cryptoProvider
              break
            }
          }
        }
      }

      if (provider) {
        console.log(`🦊 Attempting direct connection with crypto wallet...`)
        
        try {
          const accounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          })
          
          if (accounts && accounts.length > 0) {
            const account = accounts[0]
            console.log('✅ Direct crypto wallet connection successful:', account)
            updateConnectedUI(account)
            saveWallet(account)
            return true
          }
        } catch (error) {
          console.warn('⚠️ Direct crypto wallet connection failed:', error)
        }
      }
      
      showStatus(`Found ${availableWallets.length} crypto wallet(s) - using WalletConnect`, 'info')
      return false
      
    } catch (error) {
      console.error('❌ Desktop crypto wallet connection error:', error)
      return false
    }
  }

  // 1️⃣3️⃣ FIXED: Enhanced Mobile Crypto Wallet Connection
  async function connectMobileWallet() {
    try {
      const detectedWallets = await detectMobileCryptoWallets()
      const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
      
      console.log(`📱 Mobile crypto wallets detected: ${availableWallets.join(', ')}`)
      
      // Initialize WalletConnect for mobile
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return
      }

      showStatus('Connecting to crypto wallet...', 'info')

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
        // Use enhanced crypto-only deep linking for mobile
        await openCryptoWalletDeepLink(uri)
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
      console.error('❌ Mobile crypto wallet connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      
      if (modal) modal.closeModal()
      
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Crypto wallet connection failed', 'error')
      }
    }
  }

  // 1️⃣4️⃣ FIXED: Enhanced Crypto-Only Deep Linking for Mobile
  async function openCryptoWalletDeepLink(uri) {
    const detectedWallets = await detectMobileCryptoWallets()
    
    // Crypto wallet deep links only - no non-crypto apps
    const cryptoAppLinks = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      rainbow: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
      phantom: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
      safepal: `https://safepal.io/wc?uri=${encodeURIComponent(uri)}`,
      tokenpocket: `https://tokenpocket.pro/wc?uri=${encodeURIComponent(uri)}`,
      mathwallet: `https://mathwallet.org/wc?uri=${encodeURIComponent(uri)}`,
      bitkeep: `https://bitkeep.com/wc?uri=${encodeURIComponent(uri)}`,
      onto: `https://onto.app/wc?uri=${encodeURIComponent(uri)}`,
      zerion: `https://zerion.io/wc?uri=${encodeURIComponent(uri)}`,
      imtoken: `https://token.im/wc?uri=${encodeURIComponent(uri)}`
    }

    // Universal WalletConnect URI handler (Trust Wallet - crypto only)
    const universalCryptoLink = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`

    // Enhanced app opening with crypto-only focus
    const tryOpenCryptoApp = (link, appName) => {
      console.log(`📱 Attempting to open crypto wallet: ${appName}...`)
      
      return new Promise((resolve) => {
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
          
          if (window.location.href === originalHref) {
            console.log(`❌ Crypto wallet ${appName} not opened or not installed`)
            resolve(false)
          } else {
            appOpened = true
            resolve(true)
          }
        }, 2000)
        
        // Direct window location change as backup
        setTimeout(() => {
          if (!appOpened) {
            window.location.href = link
          }
        }, 100)
      })
    }

    // Crypto wallet priority for mobile
    const cryptoWalletPriority = [
      'metamask', 'trust', 'rainbow', 'coinbase', 'phantom',
      'safepal', 'tokenpocket', 'mathwallet', 'bitkeep',
      'onto', 'zerion', 'imtoken'
    ]
    
    let cryptoWalletOpened = false

    // Try detected crypto wallets in order of preference
    for (const wallet of cryptoWalletPriority) {
      if (detectedWallets[wallet] && cryptoAppLinks[wallet]) {
        console.log(`🎯 Trying detected crypto wallet: ${wallet}...`)
        cryptoWalletOpened = await tryOpenCryptoApp(cryptoAppLinks[wallet], wallet)
        if (cryptoWalletOpened) {
          console.log(`✅ Successfully opened crypto wallet: ${wallet}`)
          showStatus(`Opening ${wallet}...`, 'info')
          return true
        }
      }
    }

    // If no specific crypto wallet detected, try universal crypto link
    if (!cryptoWalletOpened) {
      console.log('🌐 No specific crypto wallet detected, trying universal WalletConnect...')
      cryptoWalletOpened = await tryOpenCryptoApp(universalCryptoLink, 'Universal Crypto Wallet')
      
      if (cryptoWalletOpened) {
        showStatus('Opening crypto wallet...', 'info')
        return true
      }
    }

    // Final fallback to QR modal for crypto wallets only
    if (!cryptoWalletOpened) {
      console.log('📱 Opening QR modal for crypto wallet selection...')
      setTimeout(() => {
        if (modal) {
          modal.openModal({ uri })
          showStatus('Scan QR code with your crypto wallet', 'info')
        }
      }, 500)
    }
    
    return cryptoWalletOpened
  }

  // 1️⃣5️⃣ Enhanced WalletConnect Connection
  async function connectViaWalletConnect() {
    try {
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return
      }

      showStatus('Requesting crypto wallet connection...', 'info')

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
          // Use crypto-only deep linking for mobile
          await openCryptoWalletDeepLink(uri)
        } else {
          // Desktop - use QR modal with crypto wallet list
          modal.openModal({ uri })
          showStatus('Select your crypto wallet from the list or scan QR code', 'info')
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
      console.error('❌ Crypto wallet connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      
      if (modal) modal.closeModal()
      
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Crypto wallet connection failed', 'error')
      }
    }
  }

  // 1️⃣6️⃣ Handle session approval
  function handleConnectedSession(session) {
    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2]
      console.log('✅ Connected crypto wallet:', account)
      currentSession = session
      updateConnectedUI(account)
      saveWallet(account, session)
      return true
    } else {
      console.error('❌ No accounts found in session')
      showStatus('No accounts found in crypto wallet', 'error')
      return false
    }
  }

  // 1️⃣7️⃣ FIXED: Enhanced Connect Wallet Function with Crypto-Only Focus
  async function connectWallet() {
    try {
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Initializing crypto wallet connection...', 'info')

      if (!isMobile()) {
        console.log('🖥️ Desktop detected - attempting crypto wallet connection...')
        const directConnected = await connectDesktopWallet()
        if (directConnected) {
          return
        }
        console.log('🔄 Direct crypto connection not available, using WalletConnect...')
        await connectViaWalletConnect()
      } else {
        console.log('📱 Mobile detected - attempting crypto wallet connection...')
        await connectMobileWallet()
      }
      
    } catch (err) {
      console.error('❌ Crypto wallet connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Crypto wallet connection failed', 'error')
      }
    }
  }

  // 1️⃣8️⃣ Disconnect wallet
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

  // 1️⃣9️⃣ Enhanced button click events
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

  // 2️⃣0️⃣ Restore saved wallet and session on page load
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedSession = getSavedSession()
    
    if (savedWallet && savedSession) {
      console.log('♻️ Restoring saved crypto wallet and session:', savedWallet)
      
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
          console.log('✅ Crypto wallet session restored successfully')
          showStatus('Crypto wallet connection restored', 'success')
        } else {
          console.log('❌ Session not found, clearing saved data')
          clearSavedWallet()
        }
      } catch (error) {
        console.error('❌ Error restoring crypto wallet session:', error)
        clearSavedWallet()
      }
    } else if (savedWallet && !savedSession) {
      console.log('♻️ Restoring direct crypto wallet connection:', savedWallet)
      updateConnectedUI(savedWallet)
      showStatus('Crypto wallet connection restored', 'success')
    }
  }

  // Initialize and restore connection on page load
  await restoreWalletConnection()

  // 2️⃣1️⃣ Enhanced session update listeners
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        console.log('🔄 Crypto wallet session updated:', params)
        const accounts = params.namespaces?.eip155?.accounts
        if (accounts?.length) {
          const account = accounts[0].split(':')[2]
          updateConnectedUI(account)
          showStatus('Crypto wallet session updated', 'info')
        }
      })

      client.on('session_delete', () => {
        console.log('🗑️ Crypto wallet session deleted')
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Crypto wallet disconnected by provider', 'error')
      })

      client.on('session_event', (event) => {
        console.log('📨 Crypto wallet session event:', event)
      })

      client.on('session_connect', (session) => {
        console.log('🔗 Crypto wallet session connected:', session)
        handleConnectedSession(session)
      })
    }
  }, 1000)

  // 2️⃣2️⃣ Enhanced EIP-6963 Provider Discovery for Crypto Wallets Only
  function setupEIP6963() {
    if (typeof window !== 'undefined') {
      if (!window.eip6963Providers) {
        window.eip6963Providers = []
      }

      // Listen for EIP-6963 provider announcements (crypto wallets only)
      window.addEventListener('eip6963:announceProvider', (event) => {
        const providerInfo = event.detail.info
        const providerName = providerInfo.name.toLowerCase()
        
        // Filter for crypto wallets only
        const cryptoWalletIndicators = [
          'metamask', 'trust', 'rainbow', 'coinbase', 'phantom',
          'brave', 'rabby', 'okx', 'bitget', 'safepal', 'mathwallet',
          'tokenpocket', 'zerion', 'imtoken', 'wallet'
        ]

        const isCryptoWallet = cryptoWalletIndicators.some(indicator => 
          providerName.includes(indicator) || 
          providerInfo.rdns?.toLowerCase().includes(indicator)
        )

        if (isCryptoWallet) {
          console.log('🎯 EIP-6963 Crypto Wallet detected:', providerInfo.name)
          
          const exists = window.eip6963Providers.some(
            p => p.info.uuid === providerInfo.uuid
          )
          
          if (!exists) {
            window.eip6963Providers.push(event.detail)
            console.log(`✅ Added EIP-6963 crypto wallet: ${providerInfo.name}`)
          }
        } else {
          console.log('🚫 Ignored non-crypto EIP-6963 provider:', providerInfo.name)
        }
      })

      // Dispatch the request event
      window.dispatchEvent(new Event('eip6963:requestProvider'))
      
      // Re-request providers after a short delay
      setTimeout(() => {
        window.dispatchEvent(new Event('eip6963:requestProvider'))
      }, 1000)
    }
  }

  // Initialize EIP-6963 crypto wallet discovery
  setupEIP6963()

  // 2️⃣3️⃣ Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      console.log('🔍 Page visible, checking crypto wallet connection state...')
    }
  })

  // 2️⃣4️⃣ Enhanced error handling for crypto wallet changes
  window.addEventListener('beforeunload', () => {
    if (modal) {
      modal.closeModal()
    }
  })

  // 2️⃣5️⃣ Enhanced Provider Change Detection for Crypto Wallets
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        console.log('🔒 Crypto wallet accounts disconnected')
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Crypto wallet disconnected', 'info')
      } else {
        console.log('🔄 Crypto wallet accounts changed:', accounts[0])
        updateConnectedUI(accounts[0])
        saveWallet(accounts[0])
      }
    })

    window.ethereum.on('chainChanged', (chainId) => {
      console.log('🔄 Crypto wallet chain changed:', chainId)
      showStatus(`Network changed to ${chainId}`, 'info')
    })

    window.ethereum.on('disconnect', () => {
      console.log('🔒 Crypto wallet provider disconnected')
      resetConnectedUI()
      clearSavedWallet()
      showStatus('Crypto wallet disconnected', 'info')
    })
  }
})
