// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

interface ICrocVirtualToken {

    function withdrawCroc (address user, uint256 tokenSalt, uint128 value,
                           bytes calldata args) external returns (bool);
}
