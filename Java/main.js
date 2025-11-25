// ===== main.js — Enhanced WalletConnect v2 Integration (Mobile + Desktop) =====

import SignClient from '@walletconnect/sign-client';
import { WalletConnectModal } from '@walletconnect/modal';

class WalletConnectManager {
  constructor() {
    this.client = null;
    this.modal = null;
    this.currentSession = null;
    this.isInitialized = false;
    
    // WalletConnect configuration
    this.projectId = 'ea2ef1ec737f10116a4329a7c5629979';
    this.metadata = {
      name: 'ApeX Protocol',
      description: 'AI-Optimized Yield Farming DApp',
      url: window.location.origin,
      icons: ['https://walletconnect.com/walletconnect-logo.png'],
    };

    // Enhanced wallet detection
    this.detectedWallets = new Map();
    this.availableWallets = [];
    
    this.init();
  }

  async init() {
    try {
      await this.initializeWalletConnect();
      this.setupEventListeners();
      this.setupEIP6963();
      await this.restorePreviousSession();
      console.log('✅ WalletConnect Manager initialized');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
    }
  }

  // ===== CORE WALLETCONNECT SETUP =====
  async initializeWalletConnect() {
    if (this.isInitialized) return;

    try {
      // Initialize SignClient
      this.client = await SignClient.init({
        projectId: this.projectId,
        metadata: this.metadata,
        relayUrl: 'wss://relay.walletconnect.com'
      });

      // Initialize Modal with enhanced configuration
      this.modal = new WalletConnectModal({
        projectId: this.projectId,
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
        mobileWallets: [
          {
            id: 'metamask',
            name: 'MetaMask',
            links: {
              native: 'metamask://',
              universal: 'https://metamask.app.link/'
            }
          },
          {
            id: 'trust',
            name: 'Trust Wallet',
            links: {
              native: 'trust://',
              universal: 'https://link.trustwallet.com/'
            }
          },
          {
            id: 'rainbow',
            name: 'Rainbow',
            links: {
              native: 'rainbow://',
              universal: 'https://rnbwapp.com/'
            }
          }
        ]
      });

      this.isInitialized = true;
      console.log('✅ WalletConnect v2 initialized successfully');
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error);
      throw error;
    }
  }

  // ===== ENHANCED WALLET DETECTION =====
  setupEIP6963() {
    if (typeof window === 'undefined') return;

    // Initialize providers array
    window.eip6963Providers = window.eip6963Providers || [];

    // Listen for provider announcements
    window.addEventListener('eip6963:announceProvider', (event) => {
      const { info, provider } = event.detail;
      
      // Avoid duplicates
      const exists = window.eip6963Providers.some(p => p.info.uuid === info.uuid);
      if (!exists) {
        window.eip6963Providers.push({ info, provider });
        this.detectedWallets.set(info.rdns, { info, provider });
        console.log(`🎯 EIP-6963 Wallet detected: ${info.name}`);
      }
    });

    // Request providers
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Additional detection for legacy providers
    this.detectLegacyWallets();
  }

  detectLegacyWallets() {
    const legacyWallets = {
      'io.metamask': {
        name: 'MetaMask',
        detected: !!window.ethereum?.isMetaMask,
        provider: window.ethereum
      },
      'com.trustwallet': {
        name: 'Trust Wallet',
        detected: !!window.ethereum?.isTrust,
        provider: window.ethereum
      },
      'me.rainbow': {
        name: 'Rainbow',
        detected: !!window.ethereum?.isRainbow,
        provider: window.ethereum
      },
      'com.coinbase.wallet': {
        name: 'Coinbase Wallet',
        detected: !!window.ethereum?.isCoinbaseWallet,
        provider: window.ethereum
      },
      'app.phantom': {
        name: 'Phantom',
        detected: !!window.ethereum?.isPhantom,
        provider: window.ethereum
      }
    };

    Object.entries(legacyWallets).forEach(([id, wallet]) => {
      if (wallet.detected && !this.detectedWallets.has(id)) {
        this.detectedWallets.set(id, {
          info: { name: wallet.name, rdns: id },
          provider: wallet.provider
        });
      }
    });

    // Handle multiple providers array
    if (window.ethereum?.providers) {
      window.ethereum.providers.forEach((provider, index) => {
        const walletId = `legacy-${index}`;
        let walletName = 'Unknown Wallet';
        
        if (provider.isMetaMask) walletName = 'MetaMask';
        else if (provider.isTrust) walletName = 'Trust Wallet';
        else if (provider.isRainbow) walletName = 'Rainbow';
        else if (provider.isCoinbaseWallet) walletName = 'Coinbase Wallet';
        else if (provider.isPhantom) walletName = 'Phantom';

        this.detectedWallets.set(walletId, {
          info: { name: walletName, rdns: walletId },
          provider
        });
      });
    }
  }

  getAvailableWallets() {
    this.availableWallets = Array.from(this.detectedWallets.values());
    return this.availableWallets;
  }

  // ===== MOBILE DEEP LINKING =====
  async openMobileDeepLink(uri, walletInfo = null) {
    if (!this.isMobile()) {
      console.log('📱 Not on mobile, skipping deep linking');
      return false;
    }

    const deepLinks = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      rainbow: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
      phantom: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`
    };

    // Determine which wallet to use
    let targetWallet = 'trust'; // Default fallback
    
    if (walletInfo) {
      const walletName = walletInfo.info.name.toLowerCase();
      if (walletName.includes('metamask')) targetWallet = 'metamask';
      else if (walletName.includes('trust')) targetWallet = 'trust';
      else if (walletName.includes('rainbow')) targetWallet = 'rainbow';
      else if (walletName.includes('coinbase')) targetWallet = 'coinbase';
      else if (walletName.includes('phantom')) targetWallet = 'phantom';
    }

    const deepLink = deepLinks[targetWallet] || deepLinks.trust;

    try {
      console.log(`📱 Opening ${targetWallet} with deep link...`);
      
      // Try to open the app
      window.location.href = deepLink;
      
      // Fallback: open in new tab after delay
      setTimeout(() => {
        if (!document.hidden) {
          console.log('🔄 Deep link failed, opening QR modal instead');
          this.modal?.openModal({ uri });
        }
      }, 1000);

      return true;
    } catch (error) {
      console.error('❌ Deep linking failed:', error);
      this.modal?.openModal({ uri });
      return false;
    }
  }

  // ===== CONNECTION FLOW =====
  async connectWallet(walletProvider = null) {
    try {
      this.setButtonState('loading');
      this.showStatus('Initializing connection...', 'info');

      if (!this.isInitialized) {
        await this.initializeWalletConnect();
      }

      // Direct connection for desktop wallets
      if (walletProvider && !this.isMobile()) {
        const success = await this.connectDirectWallet(walletProvider);
        if (success) return;
      }

      // WalletConnect flow for mobile or when no specific wallet is selected
      await this.connectViaWalletConnect(walletProvider);

    } catch (error) {
      console.error('❌ Connection failed:', error);
      this.setButtonState('failed');
      this.showStatus(this.getErrorMessage(error), 'error');
    }
  }

  async connectDirectWallet(walletProvider) {
    try {
      const provider = walletProvider.provider || walletProvider;
      
      if (!provider.request) {
        console.warn('⚠️ Provider does not support request method');
        return false;
      }

      const accounts = await provider.request({ 
        method: 'eth_requestAccounts' 
      });

      if (accounts && accounts.length > 0) {
        const account = accounts[0];
        console.log('✅ Direct connection successful:', account);
        
        this.updateConnectedUI(account);
        this.saveWallet(account);
        return true;
      }

      return false;
    } catch (error) {
      console.warn('⚠️ Direct connection failed:', error);
      return false;
    }
  }

  async connectViaWalletConnect(walletProvider = null) {
    try {
      const { uri, approval } = await this.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: [
              'eth_sendTransaction',
              'personal_sign',
              'eth_signTypedData_v4'
            ],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        if (this.isMobile() && walletProvider) {
          // Mobile with specific wallet - use deep linking
          await this.openMobileDeepLink(uri, walletProvider);
        } else {
          // Desktop or no specific wallet - use modal
          this.modal.openModal({ uri });
          this.showStatus('Select your wallet from the list', 'info');
        }
      }

      // Wait for session approval
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 60000)
        )
      ]);

      this.modal.closeModal();
      this.handleNewSession(session);

    } catch (error) {
      this.modal.closeModal();
      throw error;
    }
  }

  // ===== SESSION MANAGEMENT =====
  handleNewSession(session) {
    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      console.log('✅ WalletConnect session established:', account);
      
      this.currentSession = session;
      this.updateConnectedUI(account);
      this.saveWallet(account, session);
      
      this.showStatus('Wallet connected successfully!', 'success');
      return true;
    }
    
    throw new Error('No accounts found in session');
  }

  async disconnectWallet() {
    try {
      if (this.currentSession) {
        await this.client.disconnect({
          topic: this.currentSession.topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      }
    } catch (error) {
      console.warn('⚠️ Disconnect error:', error);
    }

    this.currentSession = null;
    this.resetUI();
    this.clearSavedWallet();
    this.showStatus('Wallet disconnected', 'info');
  }

  // ===== UI MANAGEMENT =====
  setButtonState(state) {
    const buttons = ['connectButton', 'walletButton']
      .map(id => document.getElementById(id))
      .filter(btn => btn);

    buttons.forEach(button => {
      if (!button) return;

      const styles = {
        loading: {
          background: 'linear-gradient(135deg, #666666 0%, #888888 100%)',
          html: '<i class="fas fa-spinner fa-spin"></i> Connecting...'
        },
        connected: {
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          html: '<i class="fas fa-check-circle"></i> Connected'
        },
        disconnect: {
          background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
          html: '<i class="fas fa-power-off"></i> Disconnect'
        },
        failed: {
          background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
          html: '<i class="fas fa-exclamation-triangle"></i> Failed'
        },
        normal: {
          background: 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)',
          html: '<i class="fas fa-wallet"></i> Connect Wallet to Mint'
        }
      };

      const style = styles[state] || styles.normal;
      
      Object.assign(button.style, {
        display: 'inline-block',
        padding: '14px 28px',
        borderRadius: '8px',
        fontWeight: '600',
        border: 'none',
        cursor: state === 'loading' ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s ease',
        color: 'white',
        fontSize: '16px',
        fontFamily: "'Inter', sans-serif",
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        minWidth: '180px',
        background: style.background
      });

      button.disabled = state === 'loading';
      button.innerHTML = style.html;

      if (state === 'failed') {
        setTimeout(() => this.setButtonState('normal'), 3000);
      }
    });
  }

  showStatus(message, type = 'info') {
    const statusElement = document.getElementById('claimStatus');
    if (!statusElement) return;

    const styles = {
      success: {
        background: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)',
        color: '#166534',
        border: '1px solid #86EFAC'
      },
      error: {
        background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
        color: '#991B1B',
        border: '1px solid #FCA5A5'
      },
      info: {
        background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
        color: '#1E40AF',
        border: '1px solid #93C5FD'
      }
    };

    const style = styles[type] || styles.info;
    
    Object.assign(statusElement.style, {
      display: 'block',
      padding: '12px 16px',
      borderRadius: '8px',
      marginTop: '12px',
      fontWeight: '500',
      fontSize: '14px',
      textAlign: 'center',
      transition: 'all 0.3s ease',
      ...style
    });

    statusElement.textContent = message;
    statusElement.className = `status ${type}`;

    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        statusElement.style.opacity = '0';
        setTimeout(() => {
          statusElement.style.display = 'none';
          statusElement.style.opacity = '1';
        }, 300);
      }, 5000);
    }
  }

  updateConnectedUI(address) {
    this.setButtonState('disconnect');

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      Object.assign(display.style, {
        marginTop: '12px',
        padding: '10px 16px',
        fontFamily: "'JetBrains Mono', 'Monaco', 'Consolas', monospace",
        fontSize: '14px',
        color: '#059669',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
        borderRadius: '8px',
        border: '1px solid #A7F3D0',
        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.1)'
      });
      
      const connectButton = document.getElementById('connectButton');
      if (connectButton) connectButton.parentNode.appendChild(display);
    }
    
    const formattedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    display.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <i class="fas fa-check-circle" style="color: #059669;"></i>
        <span>Connected: ${formattedAddress}</span>
        <button id="copyAddress" style="background: none; border: none; color: #059669; cursor: pointer; padding: 4px;" title="Copy address">
          <i class="far fa-copy"></i>
        </button>
      </div>
    `;
    
    // Add copy functionality
    document.getElementById('copyAddress').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        const copyBtn = document.getElementById('copyAddress');
        const originalIcon = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        copyBtn.style.color = '#10B981';
        setTimeout(() => {
          copyBtn.innerHTML = originalIcon;
          copyBtn.style.color = '#059669';
        }, 2000);
      });
    });
  }

  resetUI() {
    this.setButtonState('normal');
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
  }

  // ===== WALLET SELECTION UI =====
  showWalletSelection() {
    if (this.isMobile()) {
      // On mobile, use WalletConnect modal directly
      this.connectWallet();
      return;
    }

    const availableWallets = this.getAvailableWallets();
    
    if (availableWallets.length === 0) {
      // No wallets detected, use WalletConnect modal
      this.connectWallet();
      return;
    }

    // Create custom wallet selection modal
    this.createWalletSelectionModal(availableWallets);
  }

  createWalletSelectionModal(wallets) {
    // Remove existing modal if any
    const existingModal = document.getElementById('walletSelectionModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'walletSelectionModal';
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Choose a Wallet</h3>
            <button class="close-button">&times;</button>
          </div>
          <div class="wallets-list">
            ${wallets.map(wallet => `
              <div class="wallet-item" data-wallet-id="${wallet.info.rdns}">
                <div class="wallet-icon">
                  <i class="fas fa-wallet"></i>
                </div>
                <div class="wallet-info">
                  <div class="wallet-name">${wallet.info.name}</div>
                  <div class="wallet-type">Browser Wallet</div>
                </div>
                <div class="wallet-arrow">
                  <i class="fas fa-chevron-right"></i>
                </div>
              </div>
            `).join('')}
            <div class="wallet-item wallet-connect-item">
              <div class="wallet-icon">
                <i class="fas fa-qrcode"></i>
              </div>
              <div class="wallet-info">
                <div class="wallet-name">WalletConnect</div>
                <div class="wallet-type">Other Wallets</div>
              </div>
              <div class="wallet-arrow">
                <i class="fas fa-chevron-right"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add styles
    const styles = `
      #walletSelectionModal .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      #walletSelectionModal .modal-content {
        background: white;
        border-radius: 12px;
        padding: 20px;
        width: 90%;
        max-width: 400px;
        max-height: 80vh;
        overflow-y: auto;
      }
      #walletSelectionModal .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      #walletSelectionModal .modal-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      #walletSelectionModal .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
      }
      #walletSelectionModal .wallets-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #walletSelectionModal .wallet-item {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      #walletSelectionModal .wallet-item:hover {
        background: #f9fafb;
        border-color: #d1d5db;
      }
      #walletSelectionModal .wallet-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 12px;
        color: white;
      }
      #walletSelectionModal .wallet-info {
        flex: 1;
      }
      #walletSelectionModal .wallet-name {
        font-weight: 600;
        margin-bottom: 2px;
      }
      #walletSelectionModal .wallet-type {
        font-size: 12px;
        color: #6b7280;
      }
      #walletSelectionModal .wallet-arrow {
        color: #9ca3af;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector('.close-button').addEventListener('click', () => {
      modal.remove();
      styleSheet.remove();
    });

    modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
      if (e.target === modal.querySelector('.modal-overlay')) {
        modal.remove();
        styleSheet.remove();
      }
    });

    // Wallet selection handlers
    wallets.forEach((wallet, index) => {
      const walletElement = modal.querySelectorAll('.wallet-item')[index];
      walletElement.addEventListener('click', () => {
        modal.remove();
        styleSheet.remove();
        this.connectWallet(wallet);
      });
    });

    // WalletConnect fallback
    modal.querySelector('.wallet-connect-item').addEventListener('click', () => {
      modal.remove();
      styleSheet.remove();
      this.connectWallet();
    });
  }

  // ===== UTILITY METHODS =====
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  getErrorMessage(error) {
    if (error.message?.includes('User rejected')) {
      return 'Connection cancelled by user';
    } else if (error.message?.includes('timeout')) {
      return 'Connection timeout - please try again';
    } else {
      return 'Wallet connection failed';
    }
  }

  // ===== PERSISTENCE =====
  saveWallet(address, session = null) {
    localStorage.setItem('connectedWallet', address);
    if (session) {
      localStorage.setItem('walletConnectSession', JSON.stringify(session));
    }
  }

  getSavedWallet() {
    return localStorage.getItem('connectedWallet');
  }

  getSavedSession() {
    const session = localStorage.getItem('walletConnectSession');
    return session ? JSON.parse(session) : null;
  }

  clearSavedWallet() {
    localStorage.removeItem('connectedWallet');
    localStorage.removeItem('walletConnectSession');
  }

  async restorePreviousSession() {
    const savedWallet = this.getSavedWallet();
    const savedSession = this.getSavedSession();
    
    if (savedWallet && savedSession) {
      try {
        const session = this.client.session.get(savedSession.topic);
        if (session) {
          this.currentSession = session;
          this.updateConnectedUI(savedWallet);
          this.showStatus('Wallet connection restored', 'success');
        } else {
          this.clearSavedWallet();
        }
      } catch (error) {
        console.error('❌ Session restoration failed:', error);
        this.clearSavedWallet();
      }
    } else if (savedWallet) {
      // Direct connection restoration
      this.updateConnectedUI(savedWallet);
    }
  }

  // ===== EVENT HANDLERS =====
  setupEventListeners() {
    // Main connect button
    const connectButton = document.getElementById('connectButton');
    if (connectButton) {
      connectButton.addEventListener('click', () => {
        const savedWallet = this.getSavedWallet();
        if (savedWallet && this.currentSession) {
          this.disconnectWallet();
        } else {
          this.showWalletSelection();
        }
      });
    }

    // Additional wallet button
    const walletButton = document.getElementById('walletButton');
    if (walletButton) {
      walletButton.addEventListener('click', () => {
        this.showWalletSelection();
      });
    }

    // Session event listeners
    if (this.client) {
      this.client.on('session_update', ({ params }) => {
        console.log('🔄 Session updated:', params);
        const accounts = params.namespaces?.eip155?.accounts;
        if (accounts?.length) {
          const account = accounts[0].split(':')[2];
          this.updateConnectedUI(account);
        }
      });

      this.client.on('session_delete', () => {
        console.log('🗑️ Session deleted');
        this.resetUI();
        this.clearSavedWallet();
        this.showStatus('Wallet disconnected by provider', 'error');
      });
    }

    // Provider event listeners
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          this.resetUI();
          this.clearSavedWallet();
        } else {
          this.updateConnectedUI(accounts[0]);
          this.saveWallet(accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', (chainId) => {
        console.log('🔄 Chain changed:', chainId);
        this.showStatus(`Network changed to ${chainId}`, 'info');
      });
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.walletConnectManager = new WalletConnectManager();
});

export default WalletConnectManager;
