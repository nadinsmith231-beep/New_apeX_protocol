// ===== main.js — ApeX Protocol WalletConnect v2 (Enhanced Mobile + Desktop) =====

import SignClient from '@walletconnect/sign-client';
import { WalletConnectModal } from '@walletconnect/modal';

class ApeXWalletConnect {
  constructor() {
    this.client = null;
    this.modal = null;
    this.currentSession = null;
    this.isInitialized = false;
    
    // Wallet detection and UI elements
    this.connectButton = document.getElementById('connectButton');
    this.walletButton = document.getElementById('walletButton');
    this.claimStatus = document.getElementById('claimStatus');
    
    // Wallet configuration
    this.projectId = 'ea2ef1ec737f10116a4329a7c5629979';
    this.metadata = {
      name: 'ApeX Protocol',
      description: 'AI-Optimized Yield Farming DApp',
      url: window.location.origin,
      icons: ['https://walletconnect.com/walletconnect-logo.png'],
    };
    
    this.init();
  }

  async init() {
    try {
      console.log('🚀 Initializing ApeX WalletConnect...');
      
      // Initialize button states
      this.setButtonState('normal');
      
      // Setup EIP-6963 provider discovery
      this.setupEIP6963();
      
      // Initialize WalletConnect
      await this.initWalletConnect();
      
      // Restore any existing session
      await this.restoreWalletConnection();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('✅ ApeX WalletConnect initialized successfully');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.showStatus('Wallet service initialization failed', 'error');
    }
  }

  // ===== WALLETCONNECT INITIALIZATION =====
  async initWalletConnect() {
    if (this.client) return;

    try {
      this.client = await SignClient.init({
        projectId: this.projectId,
        metadata: this.metadata,
        relayUrl: 'wss://relay.walletconnect.com'
      });

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
              universal: 'https://link.trustwallet.com'
            }
          },
          {
            id: 'rainbow',
            name: 'Rainbow',
            links: {
              native: 'rainbow://',
              universal: 'https://rnbwapp.com'
            }
          },
          {
            id: 'coinbase',
            name: 'Coinbase Wallet',
            links: {
              native: 'coinbase-wallet://',
              universal: 'https://go.cb-w.com'
            }
          }
        ]
      });

      console.log('✅ WalletConnect v2 initialized');
    } catch (error) {
      console.error('❌ WalletConnect initialization failed:', error);
      throw error;
    }
  }

  // ===== MOBILE WALLET DETECTION & DEEP LINKING =====
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  async detectInstalledMobileWallets() {
    const wallets = [];
    const walletSchemes = {
      metamask: 'metamask://',
      trust: 'trust://',
      rainbow: 'rainbow://',
      coinbase: 'coinbase-wallet://',
      phantom: 'phantom://',
      brave: 'brave://',
      okx: 'okx://'
    };

    // Check for installed wallets using timeout technique
    for (const [name, scheme] of Object.entries(walletSchemes)) {
      const isInstalled = await this.checkAppInstalled(scheme);
      if (isInstalled) {
        wallets.push({
          id: name,
          name: this.formatWalletName(name),
          scheme: scheme
        });
      }
    }

    console.log('📱 Detected mobile wallets:', wallets);
    return wallets;
  }

  async checkAppInstalled(scheme) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = scheme;
      
      let timer = setTimeout(() => {
        window.removeEventListener('blur', onBlur);
        document.body.removeChild(iframe);
        resolve(false);
      }, 500);
      
      const onBlur = () => {
        clearTimeout(timer);
        window.removeEventListener('blur', onBlur);
        document.body.removeChild(iframe);
        resolve(true);
      };
      
      window.addEventListener('blur', onBlur);
      document.body.appendChild(iframe);
    });
  }

  formatWalletName(name) {
    const names = {
      metamask: 'MetaMask',
      trust: 'Trust Wallet',
      rainbow: 'Rainbow',
      coinbase: 'Coinbase Wallet',
      phantom: 'Phantom',
      brave: 'Brave Wallet',
      okx: 'OKX Wallet'
    };
    return names[name] || name.charAt(0).toUpperCase() + name.slice(1);
  }

  // ===== ENHANCED MOBILE WALLET SELECTION UI =====
  async showMobileWalletSelector(uri) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
      `;

      // Create modal content
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: linear-gradient(135deg, #1F2937 0%, #374151 100%);
        border-radius: 16px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        border: 1px solid #374151;
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        text-align: center;
        margin-bottom: 20px;
      `;
      header.innerHTML = `
        <h3 style="color: white; margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Connect Wallet</h3>
        <p style="color: #9CA3AF; margin: 0; font-size: 14px;">Choose your wallet app</p>
      `;

      // Wallet list container
      const walletList = document.createElement('div');
      walletList.id = 'mobileWalletList';
      walletList.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
      `;

      // QR Code fallback section
      const qrSection = document.createElement('div');
      qrSection.style.cssText = `
        text-align: center;
        padding: 20px;
        background: rgba(255, 107, 0, 0.1);
        border-radius: 12px;
        border: 1px solid rgba(255, 107, 0, 0.3);
      `;
      qrSection.innerHTML = `
        <p style="color: #FF6B00; margin: 0 0 12px 0; font-weight: 500;">Or scan QR code</p>
        <button id="showQRCode" style="
          background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
        ">Show QR Code</button>
      `;

      // Close button
      const closeButton = document.createElement('button');
      closeButton.style.cssText = `
        width: 100%;
        background: rgba(255, 255, 255, 0.1);
        color: #9CA3AF;
        border: 1px solid #374151;
        padding: 12px;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      `;
      closeButton.textContent = 'Cancel';
      closeButton.onmouseenter = () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.15)';
      };
      closeButton.onmouseleave = () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
      };

      // Assemble modal
      modal.appendChild(header);
      modal.appendChild(walletList);
      modal.appendChild(qrSection);
      modal.appendChild(closeButton);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Load wallets
      this.populateMobileWalletList(walletList, uri, resolve);

      // Event listeners
      closeButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(false);
      });

      document.getElementById('showQRCode').addEventListener('click', () => {
        document.body.removeChild(overlay);
        this.modal.openModal({ uri });
        resolve(true);
      });

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false);
        }
      });
    });
  }

  async populateMobileWalletList(container, uri, resolve) {
    const wallets = await this.detectInstalledMobileWallets();
    
    if (wallets.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #9CA3AF; padding: 20px;">
          <p>No wallet apps detected</p>
          <p style="font-size: 12px; margin-top: 8px;">Install a supported wallet app</p>
        </div>
      `;
      return;
    }

    wallets.forEach(wallet => {
      const button = document.createElement('button');
      button.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid #374151;
        padding: 16px;
        border-radius: 12px;
        color: white;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 16px;
        font-weight: 500;
      `;
      
      button.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
        ">${wallet.name.charAt(0)}</div>
        <span>${wallet.name}</span>
      `;

      button.onmouseenter = () => {
        button.style.background = 'rgba(255, 255, 255, 0.1)';
        button.style.borderColor = '#4B5563';
      };

      button.onmouseleave = () => {
        button.style.background = 'rgba(255, 255, 255, 0.05)';
        button.style.borderColor = '#374151';
      };

      button.addEventListener('click', async () => {
        const success = await this.openWalletDeepLink(uri, wallet);
        if (success) {
          document.body.removeChild(document.querySelector('#mobileWalletSelector'));
          resolve(true);
        }
      });

      container.appendChild(button);
    });
  }

  async openWalletDeepLink(uri, wallet) {
    const deepLinks = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      rainbow: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
      phantom: `https://phantom.app/ul/browse/${encodeURIComponent(uri)}`,
      brave: `https://wallet.brave.com/wc?uri=${encodeURIComponent(uri)}`,
      okx: `okx://wc?uri=${encodeURIComponent(uri)}`
    };

    const link = deepLinks[wallet.id] || `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`;
    
    try {
      // Try universal link first
      window.location.href = link;
      
      // Fallback: open in new tab after delay
      setTimeout(() => {
        if (!document.hidden) {
          window.open(link, '_blank');
        }
      }, 500);
      
      return true;
    } catch (error) {
      console.error('❌ Deep linking failed:', error);
      return false;
    }
  }

  // ===== ENHANCED CONNECTION FLOW =====
  async connectWallet() {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      this.setButtonState('loading');
      this.showStatus('Initializing connection...', 'info');

      if (this.isMobile()) {
        await this.connectMobile();
      } else {
        await this.connectDesktop();
      }
    } catch (error) {
      console.error('❌ Connection failed:', error);
      this.setButtonState('failed');
      this.showStatus('Connection failed', 'error');
    }
  }

  async connectMobile() {
    console.log('📱 Mobile connection flow');
    
    // Initialize WalletConnect
    await this.initWalletConnect();

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
      // Show mobile wallet selector
      const walletSelected = await this.showMobileWalletSelector(uri);
      
      if (!walletSelected) {
        // User cancelled or no wallet selected, show QR modal as fallback
        this.modal.openModal({ uri });
      }

      // Wait for connection approval
      const session = await Promise.race([
        approval(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 120000)
        )
      ]);

      if (this.modal) this.modal.closeModal();
      this.handleConnectedSession(session);
    }
  }

  async connectDesktop() {
    console.log('🖥️ Desktop connection flow');
    
    // Try direct connection first
    const directConnected = await this.tryDirectConnection();
    if (directConnected) return;

    // Fallback to WalletConnect
    await this.initWalletConnect();

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
      this.modal.openModal({ uri });
      this.showStatus('Scan QR code or select wallet', 'info');
    }

    const session = await Promise.race([
      approval(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 120000)
      )
    ]);

    if (this.modal) this.modal.closeModal();
    this.handleConnectedSession(session);
  }

  async tryDirectConnection() {
    const provider = this.getEthereumProvider();
    if (!provider) return false;

    try {
      const accounts = await provider.request({ 
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

  getEthereumProvider() {
    // EIP-6963 support
    if (window.eip6963Providers && window.eip6963Providers.length > 0) {
      return window.eip6963Providers[0].provider;
    }
    
    // Multiple providers
    if (window.ethereum?.providers) {
      return window.ethereum.providers[0];
    }
    
    // Single provider
    return window.ethereum;
  }

  // ===== SESSION MANAGEMENT =====
  handleConnectedSession(session) {
    if (session?.namespaces?.eip155?.accounts?.length) {
      const account = session.namespaces.eip155.accounts[0].split(':')[2];
      console.log('✅ Connected wallet:', account);
      this.currentSession = session;
      this.updateConnectedUI(account);
      this.saveWallet(account, session);
      this.showStatus('Wallet connected successfully!', 'success');
      return true;
    } else {
      this.showStatus('No accounts found in wallet', 'error');
      return false;
    }
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

    this.resetConnectedUI();
    this.clearSavedWallet();
    this.currentSession = null;
    this.showStatus('Wallet disconnected', 'info');
  }

  // ===== UI MANAGEMENT =====
  setButtonState(state, message = '') {
    const buttons = [this.connectButton, this.walletButton].filter(Boolean);
    
    buttons.forEach(button => {
      if (!button) return;
      
      button.style.cssText = `
        display: inline-block;
        padding: 14px 28px;
        border-radius: 8px;
        font-weight: 600;
        border: none;
        cursor: ${state === 'loading' ? 'not-allowed' : 'pointer'};
        transition: all 0.3s ease;
        color: white;
        font-size: 16px;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 180px;
      `;
      
      button.disabled = state === 'loading';

      switch (state) {
        case 'loading':
          button.style.background = 'linear-gradient(135deg, #666666 0%, #888888 100%)';
          button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px"></i> Connecting...';
          break;
        case 'connected':
          button.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
          button.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 8px"></i> Connected';
          break;
        case 'disconnect':
          button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
          button.innerHTML = '<i class="fas fa-power-off" style="margin-right: 8px"></i> Disconnect';
          break;
        case 'failed':
          button.style.background = 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)';
          button.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right: 8px"></i> Failed';
          setTimeout(() => this.setButtonState('normal'), 3000);
          break;
        case 'normal':
        default:
          button.style.background = 'linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%)';
          button.innerHTML = '<i class="fas fa-wallet" style="margin-right: 8px"></i> Connect Wallet to Mint';
          this.addButtonHoverEffects(button);
          break;
      }
    });
  }

  addButtonHoverEffects(button) {
    button.onmouseenter = () => {
      if (!button.disabled) {
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 6px 16px rgba(255, 107, 0, 0.4)';
      }
    };
    
    button.onmouseleave = () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(255, 107, 0, 0.3)';
    };
  }

  showStatus(message, type = 'info') {
    if (!this.claimStatus) return;

    this.claimStatus.textContent = message;
    this.claimStatus.className = `status ${type}`;
    this.claimStatus.style.cssText = `
      display: block;
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 12px;
      font-weight: 500;
      font-size: 14px;
      text-align: center;
      transition: all 0.3s ease;
    `;

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

    Object.assign(this.claimStatus.style, styles[type]);

    if (type === 'error' || type === 'success') {
      setTimeout(() => {
        this.claimStatus.style.opacity = '0';
        setTimeout(() => {
          this.claimStatus.style.display = 'none';
          this.claimStatus.style.opacity = '1';
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
      this.connectButton.parentNode.appendChild(display);
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

  resetConnectedUI() {
    this.setButtonState('normal');
    const display = document.getElementById('connectedAddressDisplay');
    if (display) display.remove();
  }

  // ===== STORAGE & PERSISTENCE =====
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

  async restoreWalletConnection() {
    const savedWallet = this.getSavedWallet();
    const savedSession = this.getSavedSession();
    
    if (savedWallet && savedSession) {
      console.log('♻️ Restoring saved wallet session...');
      
      await this.initWalletConnect();
      
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
      this.showStatus('Wallet connection restored', 'success');
    }
  }

  // ===== EIP-6963 PROVIDER DISCOVERY =====
  setupEIP6963() {
    if (typeof window === 'undefined') return;

    if (!window.eip6963Providers) {
      window.eip6963Providers = [];
    }

    window.addEventListener('eip6963:announceProvider', (event) => {
      console.log('🎯 EIP-6963 Provider detected:', event.detail.info.name);
      
      const exists = window.eip6963Providers.some(
        p => p.info.uuid === event.detail.info.uuid
      );
      
      if (!exists) {
        window.eip6963Providers.push(event.detail);
        console.log(`✅ Added EIP-6963 provider: ${event.detail.info.name}`);
      }
    });

    window.dispatchEvent(new Event('eip6963:requestProvider'));
    
    setTimeout(() => {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    }, 1000);
  }

  // ===== EVENT HANDLERS =====
  setupEventListeners() {
    const handleClick = async () => {
      const saved = this.getSavedWallet();
      if (saved && this.currentSession) {
        await this.disconnectWallet();
      } else {
        await this.connectWallet();
      }
    };

    if (this.connectButton) {
      this.connectButton.addEventListener('click', handleClick);
    }
    
    if (this.walletButton) {
      this.walletButton.addEventListener('click', handleClick);
    }

    // Provider event listeners
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          this.resetConnectedUI();
          this.clearSavedWallet();
          this.showStatus('Wallet disconnected', 'info');
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

    // WalletConnect session listeners
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
        this.resetConnectedUI();
        this.clearSavedWallet();
        this.showStatus('Wallet disconnected by provider', 'error');
      });
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ApeXWalletConnect();
});
