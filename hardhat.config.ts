/**
 * @type import('hardhat/config').HardhatUserConfig
 */

import "hardhat-typechain";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer"
import "@nomicfoundation/hardhat-verify";

require("hardhat-storage-layout");
require('solidity-coverage')

// Workaround for a test-harness bug in the revert matchers: hardhat attaches a
// `stackTrace` to SolidityError whose source-file graph is circular
// (file -> contracts -> location -> file). ethers v5's JSON-RPC error spelunker
// enumerates error properties recursively with no cycle detection, so any
// reason-less revert on an eth_call blows the JS stack (RangeError) before the
// chai revert matchers can classify it -- and the resulting unhandled rejection
// aborts mocha mid-suite. Hiding the property from enumeration at the
// hardhat->ethers boundary keeps the stack trace available to debuggers while
// keeping the spelunker out of the cycle.
const { EthersProviderWrapper } = require("@nomiclabs/hardhat-ethers/internal/ethers-provider-wrapper");
const wrappedSend = EthersProviderWrapper.prototype.send;
EthersProviderWrapper.prototype.send = async function (method: string, params?: any[]) {
    try {
        return await wrappedSend.call(this, method, params);
    } catch (err) {
        if (err !== null && typeof err === "object"
            && Object.prototype.propertyIsEnumerable.call(err, "stackTrace")) {
            Object.defineProperty(err, "stackTrace", {
                value: (err as any).stackTrace,
                enumerable: false, writable: true, configurable: true
            });
        }
        throw err;
    }
};

module.exports = {
    solidity: {
      compilers: [{
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000000
          },
          outputSelection: {
        "*": {
            "*": ["storageLayout"],
        },
      },
        }
      }],
      overrides: {
      },
      
    },

    networks: {
       local: {
         url: 'http://127.0.0.1:8545',
         chainId: 31337
       },
       ropsten: {
         url: 'https://ropsten.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
         chainId: 3,
         accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
       },
       rinkeby: {
         url: 'https://rinkeby.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
         chainId: 4,
         accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
       },
       kovan: {
        url: 'https://kovan.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
        chainId: 42,
        accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
      },
      goerli: {
        url: 'https://goerli.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
        chainId: 5,
        accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]      
      },
      mainnet: {
        url: 'https://mainnet.infura.io/v3/360ea5fda45b4a22883de8522ebd639e',
        chainId: 1
      },

      arbGoerli: {
        url: 'https://goerli-rollup.arbitrum.io/rpc',
        chainId: 421613,
        accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]      
      },
      mumbai: {
        url: 'https://polygon-mumbai.g.alchemy.com/v2/demo',
        chainId: 80001,
        accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
      },

      fuji: {
        url: "https://api.avax-test.network/ext/bc/C/rpc",
        chainId: 43113,
      },

      scroll: {
        url: process.env.SCROLL_RPC_URL || "https://rpc.scroll.io",
        chainId: 534352,
        accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      },

      beraTestnet: {
        url: "https://rpc.berachain-internal.com/",
        chainId: 2061,
      },

      swell: {
        url: "https://swell-mainnet.alt.technology",
        chainId: 1923
      }
    },

    etherscan: {
      apiKey: {
        scroll: "QYYYEVDHH56KXRW8DNCF6S1AYS9RTRZ1HF",
        beraTestnet: "xxxxx",
        swell: "xxxxx"
      },
      customChains: [
        {
          network: "scroll",
          chainId: 534352,
          urls: {
            apiURL: "https://api.scrollscan.com/api",
            browserURL: "https://scrollscan.io"
          }
        },

        {
          network: "beraTestnet",
          chainId: 2061,
          urls: {
            apiURL: "https://scan-api.berachain-internal.com/api/",
            browserURL: "https://scan.berachain-internal.com"
          }
        },

        {
          network: "swell",
          chainId: 1923,
          urls: {
            apiURL: "https://explorer.swellnetwork.io/api",
            browserURL: "https://explorer.swellnetwork.io"
          }
        },

      ]
    }
};
