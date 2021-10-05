/**
 * @type import('hardhat/config').HardhatUserConfig
 */

import "hardhat-typechain";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer"

module.exports = {
    solidity: {
      version: "0.8.4",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1000
        }
      }
    },

    networks: {
       local: {
         url: 'http://127.0.0.1:8545',
         chainId: 31337
       }
    },
};
