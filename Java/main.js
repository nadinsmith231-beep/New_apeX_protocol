// ===== main.js — ApeX Protocol WalletConnect (Mobile‑Optimised) =====
// Imports
import SignClient from 'https://esm.sh/@walletconnect/sign-client@2.11.0'
import { WalletConnectModal } from 'https://esm.sh/@walletconnect/modal@2.6.2'

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ main.js loaded - Mobile‑Optimised Version')

  // -------------------- Debug Panel (hidden by default) --------------------
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
  debugArea.style.display = 'none' // hidden, double‑tap to toggle
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

  // -------------------- Configuration --------------------
  const YOUR_PROJECT_ID = 'ea2ef1ec737f10116a4329a7c5629979'   // ← replace if needed
  const PUBLIC_TEST_ID = '8f9a3f7b7c8e4d3a9b2c1d5e6f7a8b9c' // public test ID (fallback)
  const metadata = {
    name: 'ApeX Protocol',
    description: 'AI-Optimized Yield Farming DApp',
    url: window.location.origin,
    icons: ['https://walletconnect.com/walletconnect-logo.png'],
  }

  // -------------------- DOM Elements --------------------
  const connectButton = document.getElementById('connectButton')
  const walletButton = document.getElementById('walletButton')
  const claimStatus = document.getElementById('claimStatus')
  let currentSession = null
  let client, modal

  // -------------------- Helper Functions --------------------
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  // Storage helpers
  function saveWallet(address, session = null) {
    localStorage.setItem('connectedWallet', address)
    if (session) localStorage.setItem('walletConnectSession', JSON.stringify(session))
  }
  function getSavedWallet() { return localStorage.getItem('connectedWallet') }
  function getSavedSession() {
    const s = localStorage.getItem('walletConnectSession')
    return s ? JSON.parse(s) : null
  }
  function clearSavedWallet() {
    localStorage.removeItem('connectedWallet')
    localStorage.removeItem('walletConnectSession')
  }

  // -------------------- UI Styling Functions (unchanged) --------------------
  function setButtonState(button, state) {
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

      const styles = {
        success: { bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
        error:   { bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5' },
        info:    { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' }
      }
      const s = styles[type] || styles.info
      claimStatus.style.background = `linear-gradient(135deg, ${s.bg} 0%, ${s.bg} 100%)`
      claimStatus.style.color = s.color
      claimStatus.style.border = `1px solid ${s.border}`

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

  function updateConnectedUI(address) {
    setButtonState(connectButton, 'disconnect')
    if (walletButton) setButtonState(walletButton, 'disconnect')

    let display = document.getElementById('connectedAddressDisplay')
    if (!display) {
      display = document.createElement('div')
      display.id = 'connectedAddressDisplay'
      display.style.marginTop = '12px'
      display.style.padding = '10px 16px'
      display.style.fontFamily = "'JetBrains Mono', monospace"
      display.style.fontSize = '14px'
      display.style.color = '#059669'
      display.style.textAlign = 'center'
      display.style.background = 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)'
      display.style.borderRadius = '8px'
      display.style.border = '1px solid #A7F3D0'
      display.style.boxShadow = '0 2px 8px rgba(5, 150, 105, 0.1)'
      connectButton.parentNode.appendChild(display)
    }

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`
    display.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <i class="fas fa-check-circle" style="color: #059669;"></i>
        <span>Connected: ${short}</span>
        <button id="copyAddress" style="background: none; border: none; color: #059669; cursor: pointer; padding: 4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `
    document.getElementById('copyAddress').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddress')
        const orig = btn.innerHTML
        btn.innerHTML = '<i class="fas fa-check"></i>'
        btn.style.color = '#10B981'
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = '#059669' }, 2000)
      })
    })
    showStatus('Wallet connected successfully!', 'success')
  }

  function resetConnectedUI() {
    setButtonState(connectButton, 'normal')
    if (walletButton) setButtonState(walletButton, 'normal')
    const d = document.getElementById('connectedAddressDisplay')
    if (d) d.remove()
    showStatus('Wallet disconnected', 'info')
  }

  // -------------------- WalletConnect Initialisation (with fallback) --------------------
  async function initWalletConnect(useTestId = false) {
    if (client && modal) return true
    const pid = useTestId ? PUBLIC_TEST_ID : YOUR_PROJECT_ID
    logDebug(`🔄 Initialising WalletConnect with project ID: ${pid}`)

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
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust
          "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
          "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // Coinbase
          "ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18", // Zerion
        ],
        explorerExcludedWalletIds: [],
        mobileWallets: [
          { id: 'metamask', name: 'MetaMask', links: { native: 'metamask://', universal: 'https://metamask.app.link/' } },
          { id: 'trust', name: 'Trust Wallet', links: { native: 'trust://', universal: 'https://link.trustwallet.com/' } },
          { id: 'rainbow', name: 'Rainbow', links: { native: 'rainbow://', universal: 'https://rnbwapp.com/' } },
          { id: 'coinbase', name: 'Coinbase Wallet', links: { native: 'coinbasewallet://', universal: 'https://go.cb-w.com/' } }
        ]
      })

      logDebug('✅ WalletConnect initialised')
      return true
    } catch (error) {
      logDebug(`❌ WalletConnect init failed: ${error.message}`)
      return false
    }
  }

  // -------------------- Direct Connection (for in‑app browsers) --------------------
  async function connectDirect() {
    if (typeof window.ethereum === 'undefined') {
      logDebug('No injected provider')
      return false
    }
    logDebug('Attempting direct connection...')
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts?.length) {
        logDebug(`✅ Direct connection: ${accounts[0]}`)
        updateConnectedUI(accounts[0])
        saveWallet(accounts[0])
        return true
      }
    } catch (err) {
      logDebug(`⚠️ Direct connection failed: ${err.message}`)
    }
    return false
  }

  // -------------------- WalletConnect Connection (with timeout) --------------------
  async function connectViaWalletConnect(useTestId = false) {
    const ok = await initWalletConnect(useTestId)
    if (!ok) return false

    try {
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
        logDebug(`URI obtained: ${uri}`)
        modal.openModal({ uri })
        showStatus('Select your wallet or scan QR code', 'info')
      }

      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 60000))
      ])

      modal.closeModal()

      if (session?.namespaces?.eip155?.accounts?.length) {
        const account = session.namespaces.eip155.accounts[0].split(':')[2]
        logDebug(`✅ WalletConnect connected: ${account}`)
        currentSession = session
        updateConnectedUI(account)
        saveWallet(account, session)
        return true
      } else {
        logDebug('❌ No accounts in session')
        showStatus('No accounts found in wallet', 'error')
        return false
      }
    } catch (err) {
      logDebug(`❌ WalletConnect connection error: ${err.message}`)
      if (modal) modal.closeModal()
      if (err.message?.includes('User rejected')) {
        showStatus('Connection cancelled', 'error')
      } else if (err.message?.includes('timeout')) {
        showStatus('Connection timeout', 'error')
      } else {
        showStatus('Wallet connection failed', 'error')
      }
      return false
    }
  }

  // -------------------- Main Connection Flow --------------------
  async function connectWallet() {
    setButtonState(connectButton, 'loading')
    if (walletButton) setButtonState(walletButton, 'loading')
    showStatus('Connecting...', 'info')
    logDebug('Starting connection flow')

    // 1. Try direct (in‑app browser)
    if (await connectDirect()) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    // 2. Try WalletConnect with user's project ID
    logDebug('Direct failed, trying WalletConnect (your project ID)...')
    if (await connectViaWalletConnect(false)) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    // 3. Fallback to public test project ID
    logDebug('Your project ID failed, trying public test ID...')
    if (await connectViaWalletConnect(true)) {
      setButtonState(connectButton, 'connected')
      if (walletButton) setButtonState(walletButton, 'connected')
      return
    }

    // All failed
    logDebug('All connection methods failed')
    setButtonState(connectButton, 'failed')
    if (walletButton) setButtonState(walletButton, 'failed')
  }

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
      logDebug(`Disconnect error: ${err.message}`)
    }
    resetConnectedUI()
    clearSavedWallet()
  }

  // -------------------- Event Listeners --------------------
  const handleClick = async () => {
    const saved = getSavedWallet()
    if (saved && currentSession) {
      await disconnectWallet()
    } else {
      await connectWallet()
    }
  }

  if (connectButton) connectButton.addEventListener('click', handleClick)
  if (walletButton) walletButton.addEventListener('click', handleClick)

  // -------------------- Restore Previous Session --------------------
  async function restoreWalletConnection() {
    const savedWallet = getSavedWallet()
    const savedSession = getSavedSession()

    if (savedWallet && savedSession) {
      logDebug(`♻️ Restoring session for ${savedWallet}`)
      if (await initWalletConnect(false)) {
        try {
          const session = client.session.get(savedSession.topic)
          if (session) {
            currentSession = session
            updateConnectedUI(savedWallet)
            showStatus('Wallet connection restored', 'success')
          } else {
            clearSavedWallet()
          }
        } catch {
          clearSavedWallet()
        }
      } else {
        clearSavedWallet()
      }
    } else if (savedWallet && !savedSession) {
      logDebug('♻️ Restoring direct wallet connection')
      updateConnectedUI(savedWallet)
      showStatus('Wallet connection restored', 'success')
    }
  }

  await restoreWalletConnection()

  // -------------------- EIP-6963 Provider Discovery --------------------
  function setupEIP6963() {
    if (typeof window === 'undefined') return
    if (!window.eip6963Providers) window.eip6963Providers = []
    window.addEventListener('eip6963:announceProvider', (event) => {
      logDebug(`🎯 EIP-6963 provider: ${event.detail.info.name}`)
      const exists = window.eip6963Providers.some(p => p.info.uuid === event.detail.info.uuid)
      if (!exists) {
        window.eip6963Providers.push(event.detail)
      }
    })
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 1000)
  }
  setupEIP6963()

  // -------------------- Provider Change Listeners --------------------
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        resetConnectedUI()
        clearSavedWallet()
        showStatus('Wallet disconnected', 'info')
      } else {
        updateConnectedUI(accounts[0])
        saveWallet(accounts[0])
      }
    })
    window.ethereum.on('chainChanged', (chainId) => {
      logDebug(`Chain changed: ${chainId}`)
      showStatus(`Network changed to ${chainId}`, 'info')
    })
    window.ethereum.on('disconnect', () => {
      resetConnectedUI()
      clearSavedWallet()
      showStatus('Wallet disconnected', 'info')
    })
  }

  // -------------------- Cleanup on unload --------------------
  window.addEventListener('beforeunload', () => { if (modal) modal.closeModal() })
})
