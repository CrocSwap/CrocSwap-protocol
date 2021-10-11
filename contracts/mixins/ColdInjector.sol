// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './StorageLayout.sol';

import "hardhat/console.sol";

contract ColdPathInjector is StorageLayout {
    function callInitPool (address base, address quote, uint24 poolIdx,  
                           uint128 price) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature("initPool(address,address,uint24,uint128)",
                                    base, quote, poolIdx, price));
        require(success, 'PI');
    }

    function callTradePath (bytes calldata input) internal {
        (bool success, ) = warmPath_.delegatecall(
            abi.encodeWithSignature("trade(bytes)", input));
        require(success, 'T');
    }
}
