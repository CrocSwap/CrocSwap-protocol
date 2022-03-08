// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

interface ICrocCondOracle {

    function checkCrocNonceSet (address user, bytes32 nonceSalt, uint32 nonce,
                                bytes calldata args) external returns (bool);
}
