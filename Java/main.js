// ===== main.js — ApeX Protocol WalletConnect v2 (Enhanced Mobile + Desktop) =====

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
      icons: ['https://avatars.githubusercontent.com/u/37784886'],
    };
    
    // Enhanced wallet registry with deep links
    this.walletRegistry = {
      metamask: {
        name: 'MetaMask',
        id: 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
        deepLink: 'https://metamask.app.link/wc?uri=',
        universalLink: 'https://metamask.app.link/wc?uri='
      },
      trust: {
        name: 'Trust Wallet',
        id: '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
        deepLink: 'https://link.trustwallet.com/wc?uri=',
        universalLink: 'https://link.trustwallet.com/wc?uri='
      },
      rainbow: {
        name: 'Rainbow',
        id: '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
        deepLink: 'https://rnbwapp.com/wc?uri=',
        universalLink: 'https://rnbwapp.com/wc?uri='
      },
      coinbase: {
        name: 'Coinbase Wallet',
        id: 'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
        deepLink: 'https://go.cb-w.com/wc?uri=',
        universalLink: 'https://go.cb-w.com/wc?uri='
      },
      zerion: {
        name: 'Zerion',
        id: 'ecc4036f814562b41a5268adc86270fba1365471402006302e70169465b7ac18',
        deepLink: 'https://wallet.zerion.io/wc?uri=',
        universalLink: 'https://wallet.zerion.io/wc?uri='
      }
    };
    
    this.init();
  }

  async init() {
    try {
      await this.initializeWalletConnect();
      this.setupEventListeners();
      this.setupEIP6963();
      await this.restorePreviousSession();
      console.log('✅ ApeX WalletConnect Manager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize WalletConnect Manager:', error);
    }
  }

  // ===== CORE WALLETCONNECT INITIALIZATION =====
  async initializeWalletConnect() {
    if (this.isInitialized) return true;

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
        explorerRecommendedWalletIds: Object.values(this.walletRegistry).map(wallet => wallet.id),
        explorerExcludedWalletIds: [],
        mobileWallets: Object.values(this.walletRegistry).map(wallet => ({
          id: wallet.id,
          name: wallet.name,
          links: { universal: wallet.universalLink, native: wallet.deepLink }
        }))
      });

      this.isInitialized = true;
      console.log('✅ WalletConnect v2 initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error);
      this.showStatus('Wallet connection service unavailable', 'error');
      return false;
    }
  }

  // ===== ENHANCED MOBILE WALLET DETECTION =====
  async detectMobileWallets() {
    return new Promise((resolve) => {
      const detectedWallets = {};
      const userAgent = navigator.userAgent.toLowerCase();

      // Enhanced mobile browser detection
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      if (!isMobile) {
        resolve(detectedWallets);
        return;
      }

      // Check for wallet-specific user agents and deep link support
      const walletChecks = [
        { 
          key: 'metamask', 
          test: () => userAgent.includes('metamask') || this.canOpenLink('metamask://'),
          name: 'MetaMask'
        },
        { 
          key: 'trust', 
          test: () => userAgent.includes('trust') || this.canOpenLink('trust://'),
          name: 'Trust Wallet'
        },
        { 
          key: 'rainbow', 
          test: () => userAgent.includes('rainbow') || this.canOpenLink('rainbow://'),
          name: 'Rainbow'
        },
        { 
          key: 'coinbase', 
          test: () => userAgent.includes('coinbase') || this.canOpenLink('coinbasewallet://'),
          name: 'Coinbase Wallet'
        }
      ];

      // Test each wallet
      walletChecks.forEach(wallet => {
        try {
          if (wallet.test()) {
            detectedWallets[wallet.key] = { name: wallet.name, key: wallet.key };
          }
        } catch (error) {
          console.warn(`⚠️ Detection failed for ${wallet.name}:`, error);
        }
      });

      console.log('📱 Detected mobile wallets:', detectedWallets);
      resolve(detectedWallets);
    });
  }

  canOpenLink(link) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = link;
      
      const timeout = setTimeout(() => {
        document.body.removeChild(iframe);
        resolve(false);
      }, 500);

      iframe.onload = () => {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        resolve(true);
      };

      document.body.appendChild(iframe);
    });
  }

  // ===== ENHANCED DEEP LINKING WITH WALLET SELECTION =====
  async openMobileWalletWithSelection(uri) {
    const detectedWallets = await this.detectMobileWallets();
    const availableWallets = Object.values(detectedWallets);

    if (availableWallets.length === 0) {
      // No wallets detected, show QR modal
      this.showQRModal(uri);
      return;
    }

    if (availableWallets.length === 1) {
      // Only one wallet detected, open it directly
      const wallet = availableWallets[0];
      this.openSpecificWallet(uri, wallet.key);
      return;
    }

    // Multiple wallets detected, show selection UI
    this.showWalletSelectionModal(availableWallets, uri);
  }

  showWalletSelectionModal(wallets, uri) {
    // Remove existing modal if present
    const existingModal = document.getElementById('wallet-selection-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal backdrop
    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'wallet-selection-modal';
    modalBackdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(5px);
    `;

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      border: 1px solid #4B5563;
    `;

    // Modal header
    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      margin-bottom: 24px;
    `;
    header.innerHTML = `
      <h3 style="color: white; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">
        Choose Your Wallet
      </h3>
      <p style="color: #9CA3AF; margin: 0; font-size: 14px;">
        Select a wallet to connect
      </p>
    `;

    // Wallet list
    const walletList = document.createElement('div');
    walletList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    `;

    wallets.forEach(wallet => {
      const walletButton = document.createElement('button');
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
      `;
      
      walletButton.innerHTML = `
        <div style="width: 40px; height: 40px; background: #FF6B00; border-radius: 10px; 
                    display: flex; align-items: center; justify-content: center; margin-right: 12px;">
          <i class="fas fa-wallet" style="color: white;"></i>
        </div>
        <span>${wallet.name}</span>
      `;

      walletButton.onmouseenter = () => {
        walletButton.style.background = 'rgba(255, 107, 0, 0.1)';
        walletButton.style.borderColor = '#FF6B00';
        walletButton.style.transform = 'translateY(-2px)';
      };

      walletButton.onmouseleave = () => {
        walletButton.style.background = 'rgba(255, 255, 255, 0.05)';
        walletButton.style.borderColor = '#4B5563';
        walletButton.style.transform = 'translateY(0)';
      };

      walletButton.onclick = () => {
        modalBackdrop.remove();
        this.openSpecificWallet(uri, wallet.key);
      };

      walletList.appendChild(walletButton);
    });

    // QR code fallback option
    const qrOption = document.createElement('button');
    qrOption.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: transparent;
      border: 1px solid #4B5563;
      border-radius: 12px;
      color: #9CA3AF;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    qrOption.innerHTML = `
      <i class="fas fa-qrcode" style="margin-right: 8px;"></i>
      Show QR Code Instead
    `;

    qrOption.onclick = () => {
      modalBackdrop.remove();
      this.showQRModal(uri);
    };

    qrOption.onmouseenter = () => {
      qrOption.style.background = 'rgba(255, 255, 255, 0.05)';
      qrOption.style.color = 'white';
    };

    qrOption.onmouseleave = () => {
      qrOption.style.background = 'transparent';
      qrOption.style.color = '#9CA3AF';
    };

    // Close button
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
      width: 100%;
      padding: 12px;
      background: transparent;
      border: 1px solid #4B5563;
      border-radius: 8px;
      color: #9CA3AF;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    closeButton.textContent = 'Cancel';
    closeButton.onclick = () => modalBackdrop.remove();
    closeButton.onmouseenter = () => {
      closeButton.style.background = 'rgba(239, 68, 68, 0.1)';
      closeButton.style.borderColor = '#EF4444';
      closeButton.style.color = '#EF4444';
    };
    closeButton.onmouseleave = () => {
      closeButton.style.background = 'transparent';
      closeButton.style.borderColor = '#4B5563';
      closeButton.style.color = '#9CA3AF';
    };

    // Assemble modal
    modalContent.appendChild(header);
    modalContent.appendChild(walletList);
    modalContent.appendChild(qrOption);
    modalContent.appendChild(closeButton);
    modalBackdrop.appendChild(modalContent);

    // Close on backdrop click
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.remove();
      }
    };

    document.body.appendChild(modalBackdrop);
  }

  async openSpecificWallet(uri, walletKey) {
    const wallet = this.walletRegistry[walletKey];
    if (!wallet) {
      console.error('❌ Unknown wallet:', walletKey);
      this.showQRModal(uri);
      return;
    }

    const deepLink = `${wallet.deepLink}${encodeURIComponent(uri)}`;
    const universalLink = `${wallet.universalLink}${encodeURIComponent(uri)}`;

    console.log(`📱 Opening ${wallet.name} with deep link...`);

    // Try to open the deep link
    try {
      // For iOS, we need to use window.location
      if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
        window.location.href = deepLink;
        
        // Fallback after delay
        setTimeout(() => {
          if (!document.hidden) {
            window.location.href = universalLink;
          }
        }, 500);
      } else {
        // For Android and others
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink;
        document.body.appendChild(iframe);

        setTimeout(() => {
          document.body.removeChild(iframe);
          // Fallback to universal link
          window.location.href = universalLink;
        }, 1000);
      }

      this.showStatus(`Opening ${wallet.name}...`, 'info');
    } catch (error) {
      console.error(`❌ Failed to open ${wallet.name}:`, error);
      this.showQRModal(uri);
    }
  }

  showQRModal(uri) {
    if (this.modal) {
      this.modal.openModal({ uri });
      this.showStatus('Scan QR code with your wallet app', 'info');
    }
  }

  // ===== ENHANCED CONNECTION FLOW =====
  async connectWallet() {
    try {
      this.setButtonState('loading');
      
      if (!this.isInitialized) {
        await this.initializeWalletConnect();
      }

      // Enhanced mobile detection and flow
      if (this.isMobile()) {
        await this.connectMobileWallet();
      } else {
        await this.connectDesktopWallet();
      }
    } catch (error) {
      console.error('❌ Connection failed:', error);
      this.setButtonState('failed');
      this.showStatus('Connection failed', 'error');
    }
  }

  async connectMobileWallet() {
    try {
      const { uri, approval } = await this.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        await this.openMobileWalletWithSelection(uri);
      }

      const session = await this.waitForSessionApproval(approval);
      this.handleSessionConnected(session);
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  async connectDesktopWallet() {
    try {
      // First try direct connection with injected providers
      const directConnected = await this.tryDirectConnection();
      if (directConnected) return;

      // Fall back to WalletConnect modal
      const { uri, approval } = await this.client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });

      if (uri) {
        this.showQRModal(uri);
      }

      const session = await this.waitForSessionApproval(approval);
      this.handleSessionConnected(session);
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  async tryDirectConnection() {
    if (!window.ethereum) return false;

    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });

      if (accounts && accounts.length > 0) {
        this.updateConnectedUI(accounts[0]);
        this.saveWallet(accounts[0]);
        return true;
      }
    } catch (error) {
      console.warn('⚠️ Direct connection failed:', error);
    }

    return false;
  }

  async waitForSessionApproval(approval) {
    return Promise.race([
      approval(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 60000)
      )
    ]);
  }

  handleSessionConnected(session) {
    if (this.modal) {
      this.modal.closeModal();
    }

    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      this.currentSession = session;
      this.updateConnectedUI(account);
      this.saveWallet(account, session);
      this.showStatus('Wallet connected successfully!', 'success');
    } else {
      throw new Error('No accounts found in session');
    }
  }

  handleConnectionError(error) {
    this.setButtonState('failed');
    
    if (this.modal) {
      this.modal.closeModal();
    }

    if (error.message?.includes('User rejected') || error.message?.includes('Cancelled')) {
      this.showStatus('Connection cancelled', 'error');
    } else if (error.message?.includes('timeout')) {
      this.showStatus('Connection timeout - please try again', 'error');
    } else {
      this.showStatus('Connection failed', 'error');
    }
  }

  // ===== UI MANAGEMENT =====
  setButtonState(state) {
    const connectButton = document.getElementById('connectButton');
    const walletButton = document.getElementById('walletButton');

    [connectButton, walletButton].forEach(button => {
      if (!button) return;

      const baseStyles = `
        display: inline-block;
        padding: 14px 28px;
        border-radius: 8px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 0.3s ease;
        color: white;
        font-size: 16px;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 180px;
      `;

      button.style.cssText = baseStyles;

      switch (state) {
        case 'loading':
          button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
          button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px"></i> Connecting...';
          button.disabled = true;
          break;
        case 'connected':
          button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
          button.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 8px"></i> Connected';
          button.disabled = false;
          break;
        case 'disconnect':
          button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
          button.innerHTML = '<i class="fas fa-power-off" style="margin-right: 8px"></i> Disconnect';
          button.disabled = false;
          break;
        case 'failed':
          button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
          button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 8px"></i> Failed';
          button.disabled = false;
          setTimeout(() => this.setButtonState('normal'), 3000);
          break;
        default:
          button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
          button.innerHTML = '<i class="fas fa-wallet" style="margin-right: 8px"></i> Connect Wallet';
          button.disabled = false;
          break;
      }
    });
  }

  updateConnectedUI(address) {
    this.setButtonState('disconnect');

    let display = document.getElementById('connectedAddressDisplay');
    if (!display) {
      display = document.createElement('div');
      display.id = 'connectedAddressDisplay';
      display.style.cssText = `
        margin-top: 12px;
        padding: 10px 16px;
        font-family: 'JetBrains Mono', 'Monaco', 'Consolas', monospace;
        font-size: 14px;
        color: #059669;
        text-align: center;
        background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
        border-radius: 8px;
        border: 1px solid #A7F3D0;
        box-shadow: 0 2px 8px rgba(5, 150, 105, 0.1);
      `;
      
      const connectButton = document.getElementById('connectButton');
      if (connectButton) {
        connectButton.parentNode.appendChild(display);
      }
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

  showStatus(message, type = 'info') {
    const claimStatus = document.getElementById('claimStatus');
    if (!claimStatus) return;

    claimStatus.textContent = message;
    claimStatus.className = `status ${type}`;
    claimStatus.style.display = 'block';
    claimStatus.style.padding = '12px 16px';
    claimStatus.style.borderRadius = '8px';
    claimStatus.style.marginTop = '12px';
    claimStatus.style.fontWeight = '500';
    claimStatus.style.fontSize = '14px';
    claimStatus.style.textAlign = 'center';
    claimStatus.style.transition = 'all 0.3s ease';
    
    switch (type) {
      case 'success':
        claimStatus.style.background = 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)';
        claimStatus.style.color = '#166534';
        claimStatus.style.border = '1px solid #86EFAC';
        break;
      case 'error':
        claimStatus.style.background = 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)';
        claimStatus.style.color = '#991B1B';
        claimStatus.style.border = '1px solid #FCA5A5';
        break;
      default:
        claimStatus.style.background = 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)';
        claimStatus.style.color = '#1E40AF';
        claimStatus.style.border = '1px solid #93C5FD';
        break;
    }
    
    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        claimStatus.style.opacity = '0';
        setTimeout(() => {
          claimStatus.style.display = 'none';
          claimStatus.style.opacity = '1';
        }, 300);
      }, 5000);
    }
  }

  // ===== SESSION MANAGEMENT =====
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
    this.setButtonState('normal');
    this.clearSavedWallet();
    
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
    
    this.showStatus('Wallet disconnected', 'info');
  }

  // ===== PERSISTENCE HELPERS =====
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
    }
  }

  // ===== UTILITY FUNCTIONS =====
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  setupEIP6963() {
    if (typeof window === 'undefined') return;

    if (!window.eip6963Providers) {
      window.eip6963Providers = [];
    }

    window.addEventListener('eip6963:announceProvider', (event) => {
      const exists = window.eip6963Providers.some(
        p => p.info.uuid === event.detail.info.uuid
      );
      
      if (!exists) {
        window.eip6963Providers.push(event.detail);
        console.log(`✅ EIP-6963 provider detected: ${event.detail.info.name}`);
      }
    });

    window.dispatchEvent(new Event('eip6963:requestProvider'));
    
    setTimeout(() => {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    }, 1000);
  }

  setupEventListeners() {
    const connectButton = document.getElementById('connectButton');
    const walletButton = document.getElementById('walletButton');

    const handleWalletAction = async () => {
      const savedWallet = this.getSavedWallet();
      if (savedWallet && this.currentSession) {
        await this.disconnectWallet();
      } else {
        await this.connectWallet();
      }
    };

    if (connectButton) {
      connectButton.addEventListener('click', handleWalletAction);
    }
    
    if (walletButton) {
      walletButton.addEventListener('click', handleWalletAction);
    }

    // Set initial button state
    this.setButtonState('normal');

    // Setup provider event listeners
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          this.disconnectWallet();
        } else {
          this.updateConnectedUI(accounts[0]);
          this.saveWallet(accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', (chainId) => {
        this.showStatus(`Network changed to ${chainId}`, 'info');
      });
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing ApeX Protocol WalletConnect...');
  window.walletConnectManager = new WalletConnectManager();
});

export default WalletConnectManager;
