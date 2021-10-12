/**
 * @type import('hardhat/config').HardhatUserConfig
 */

import "hardhat-typechain";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer"

module.exports = {
    solidity: {
      compilers: [{
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000000
          }
        }
      }],
      overrides: {
        
      }
    },

    networks: {
       local: {
         url: 'http://127.0.0.1:8545',
         chainId: 31337
       }
    },
};
