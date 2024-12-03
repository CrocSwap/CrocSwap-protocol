/**
 * @type import('hardhat/config').HardhatUserConfig
 */

import "hardhat-typechain";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer"
import "@nomicfoundation/hardhat-verify";

require("hardhat-storage-layout");
require('solidity-coverage')

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
        url: "https://rpc.scroll.io",
        chainId: 534352,
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
