// ===== main.js — ApeX Protocol WalletConnect Integration (Ultra‑Robust) =====
// Use CDN imports with fallback
import SignClient from 'https://esm.sh/@walletconnect/sign-client@2.11.0'
import { WalletConnectModal } from 'https://esm.sh/@walletconnect/modal@2.6.2'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Ultra‑Robust Version')

  // ---------- DEBUG PANEL (double‑tap to show) ----------
  const debugArea = document.createElement('div')
  debugArea.id = 'wc-debug'
  debugArea.style.position = 'fixed'
  debugArea.style.bottom = '0'
  debugArea.style.left = '0'
  debugArea.style.width = '100%'
  debugArea.style.background = '#000'
  debugArea.style.color = '#0f0'
  debugArea.style.fontSize = '12px'
  debugArea.style.padding = '5px'
  debugArea.style.zIndex = '10000'
  debugArea.style.maxHeight = '150px'
  debugArea.style.overflowY = 'auto'
  debugArea.style.display = 'none' // hidden initially
  document.body.appendChild(debugArea)

  let debugVisible = false
  document.addEventListener('dblclick', () => {
    debugVisible = !debugVisible
    debugArea.style.display = debugVisible ? 'block' : 'none'
  })

  function logDebug(msg) {
    console.log(msg)
    debugArea.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${msg}</div>`
  }

  // ---------- DOM elements ----------
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal

  // If buttons missing, exit gracefully
  if (!connectButton) {
    logDebug('❌ Connect button not found')
    return
  }

  // ---------- Mobile detection (FIXED: was missing!) ----------
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  // ---------- Button styling (preserved) ----------
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
        setTimeout(() => setButtonState(button, 'normal'), 3000)
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

  // ---------- Status display (preserved) ----------
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

  // ---------- Initialize buttons ----------
  setButtonState(connectButton, 'normal')
  if (walletButton) setButtonState(walletButton, 'normal')

  // ---------- WalletConnect constants ----------
  const YOUR_PROJECT_ID = 'ea2ef1ec737f10116a4329a7c5629979' // original
  const PUBLIC_TEST_ID = '8f9a3f7b7c8e4d3a9b2c1d5e6f7a8b9c' // public fallback
  let projectId = YOUR_PROJECT_ID

  const metadata = {
    name: 'ApeX Protocol',
    description: 'AI-Optimized Yield Farming DApp',
    url: window.location.origin,
    icons: ['https://walletconnect.com/walletconnect-logo.png'],
  }

  // ---------- Storage helpers ----------
  function saveWallet(address, session = null) {
    localStorage.setItem('connectedWallet', address)
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session))
  }
  function getSavedWallet() { return localStorage.getItem('connectedWallet') }
  function getSavedSession() {
    const session = localStorage.getItem('walletConnectSession')
    return session ? JSON.parse(session) : null
  }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet')
    localStorage.removeItem('walletConnectSession')
  }

  // ---------- UI update (preserved) ----------
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

  // ---------- WalletConnect initialization with retry ----------
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true

    const pid = useTestId ? PUBLIC_TEST_ID : YOUR_PROJECT_ID
    logDebug(`🔄 Initializing WalletConnect with projectId: ${pid}`)

    try {
      client = await SignClient.init({
        projectId: pid,
        metadata,
        relayUrl: 'wss://relay.walletconnect.com'
      })

      modal = new WalletConnectModal({
        projectId: pid,
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
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
          { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow', name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } }
        ]
      })

      logDebug('✅ WalletConnect initialized successfully')
      return true
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`)
      if (error.stack) logDebug(error.stack)
      return false
    }
  }

  // ---------- Direct provider connection (works everywhere) ----------
  async function connectDirect() {
    if (typeof window.ethereum === 'undefined') {
      logDebug('No injected provider (window.ethereum)')
      return false
    }

    logDebug('Attempting direct connection via window.ethereum...')
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts && accounts.length > 0) {
        const account = accounts[0]
        logDebug(`✅ Direct connection successful: ${account}`)
        updateConnectedUI(account)
        saveWallet(account)
        return true
      }
    } catch (error) {
      logDebug(`⚠️ Direct connection failed: ${error.message}`)
    }
    return false
  }

  // ---------- WalletConnect connection ----------
  async function connectViaWalletConnect(useTestId = false) {
    const initSuccess = await initWalletConnect(useTestId)
    if (!initSuccess) {
      showStatus('Wallet connection service unavailable', 'error')
      return false
    }

    try {
      showStatus('Requesting wallet connection...', 'info')
      logDebug('Initiating WalletConnect session...')

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
        logDebug(`URI obtained: ${uri}`)
        modal.openModal({ uri })
        showStatus('Select your wallet or scan QR code', 'info')
      } else {
        logDebug('❌ No URI returned from client.connect')
        showStatus('Failed to generate connection URI', 'error')
        return false
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 60000))
      ])

      if (modal) modal.closeModal()
      logDebug('Session approved')

      const connectionSuccess = handleConnectedSession(session)
      if (connectionSuccess) {
        showStatus('Wallet connected successfully!', 'success')
      } else {
        showStatus('Failed to get accounts from session', 'error')
      }
      return connectionSuccess
    } catch (err) {
      logDebug(`❌ WalletConnect connection error: ${err.message}`)
      if (modal) modal.closeModal()

      if (err.message?.includes('User rejected') || err.message?.includes('Cancelled')) {
        showStatus('Connection cancelled by user', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout - please try again', 'error')
      } else {
        showStatus('Wallet connection failed: ' + err.message, 'error')
      }
      return false
    }
  }

  // ---------- Handle session approval ----------
  function handleConnectedSession(session) {
    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2]
      logDebug(`✅ Connected wallet via WalletConnect: ${account}`)
      currentSession = session
      updateConnectedUI(account)
      saveWallet(account, session)
      return true
    } else {
      logDebug('❌ No accounts found in session')
      return false
    }
  }

  // ---------- Desktop wallet detection (unchanged) ----------
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
        console.log('🔍 No installed wallets detected, using WalletConnect modal')
        return false
      }

      console.log(`🎯 Found installed wallets: ${availableWallets.join(', ')}`)

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
        console.log(`🦊 Attempting direct connection with ${provider.isMetaMask ? 'MetaMask' : provider.isCoinbaseWallet ? 'Coinbase' : 'detected wallet'}...`)
        try {
          const accounts = await provider.request({ method: 'eth_requestAccounts' })
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
      showStatus(`Found ${availableWallets.length} wallet(s) - using WalletConnect`, 'info')
      return false
    } catch (error) {
      console.error('❌ Desktop wallet connection error:', error)
      return false
    }
  }

  // ---------- Main connect function (tries all methods) ----------
  async function connectWallet() {
    setButtonState(connectButton, 'loading')
    if (walletButton) setButtonState(walletButton, 'loading')
    showStatus('Initializing wallet connection...', 'info')
    logDebug('Starting wallet connection...')

    // Step 1: Try direct connection (window.ethereum) – works everywhere
    const directSuccess = await connectDirect()
    if (directSuccess) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    // Step 2: If not mobile, try desktop direct (already tried, but keep for completeness)
    if (!isMobile()) {
      const desktopSuccess = await connectDesktopWallet()
      if (desktopSuccess) {
        setButtonState(connectButton, 'connected')
        if (walletButton) setButtonState(walletButton, 'connected')
        return
      }
    }

    // Step 3: Try WalletConnect with original project ID
    logDebug('Direct connection failed, trying WalletConnect with original project ID...')
    let wcSuccess = await connectViaWalletConnect(false)
    if (wcSuccess) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    // Step 4: Try with public test project ID
    logDebug('Original project ID failed, trying public test ID...')
    wcSuccess = await connectViaWalletConnect(true)
    if (wcSuccess) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    // All failed
    logDebug('All connection methods failed')
    setButtonState(connectButton, 'failed')
    if (walletButton) setButtonState(walletButton, 'failed')
  }

  // ---------- Disconnect ----------
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

  // ---------- Button click handler ----------
  const handleClick = async () => {
    const saved = getSavedWallet()
    if (saved && currentSession) {
      await disconnectWallet()
    } else {
      await connectWallet()
    }
  }

  connectButton.addEventListener('click', handleClick)
  if (walletButton) walletButton.addEventListener('click', handleClick)

  // ---------- Restore session ----------
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedSession = getSavedSession()

    if (savedWallet && savedSession) {
      logDebug(`♻️ Restoring saved wallet and session: ${savedWallet}`)
      const initSuccess = await initWalletConnect(false)
      if (!initSuccess) {
        logDebug('❌ Failed to initialize WalletConnect for session restoration')
        clearSavedWallet()
        return
      }
      try {
        const session = client.session.get(savedSession.topic)
        if (session) {
          currentSession = session
          updateConnectedUI(savedWallet)
          logDebug('✅ Wallet session restored successfully')
          showStatus('Wallet connection restored', 'success')
        } else {
          logDebug('❌ Session not found, clearing saved data')
          clearSavedWallet()
        }
      } catch (error) {
        logDebug(`❌ Error restoring session: ${error.message}`)
        clearSavedWallet()
      }
    } else if (savedWallet && !savedSession) {
      logDebug('♻️ Restoring direct wallet connection')
      updateConnectedUI(savedWallet)
      showStatus('Wallet connection restored', 'success')
    }
  }

  await restoreWalletConnection()

  // ---------- Session listeners ----------
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
      client.on('session_event', (event) => console.log('📨 Session event:', event))
      client.on('session_connect', (session) => {
        console.log('🔗 Session connected:', session)
        handleConnectedSession(session)
      })
    }
  }, 1000)

  // ---------- EIP-6963 ----------
  function setupEIP6963() {
    if (typeof window !== 'undefined') {
      if (!window.eip6963Providers) window.eip6963Providers = []
      window.addEventListener('eip6963:announceProvider', (event) => {
        console.log('🎯 EIP-6963 Provider detected:', event.detail.info.name)
        const exists = window.eip6963Providers.some(p => p.info.uuid === event.detail.info.uuid)
        if (!exists) {
          window.eip6963Providers.push(event.detail)
          console.log(`✅ Added EIP-6963 provider: ${event.detail.info.name}`)
        }
      })
      window.dispatchEvent(new Event('eip6963:requestProvider'))
      setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1000)
    }
  }
  setupEIP6963()

  // ---------- Visibility change ----------
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getSavedWallet()) console.log('🔍 Page visible, checking connection state...')
  })

  // ---------- Before unload ----------
  window.addEventListener('beforeunload', () => { if (modal) modal.closeModal() })

  // ---------- Provider change ----------
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
