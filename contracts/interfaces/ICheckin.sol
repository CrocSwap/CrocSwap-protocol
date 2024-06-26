// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.14;

interface ICheckIn {
    function getReRolls(address user) external view returns (uint256);
    function incrementPoints(address user, uint8 tier) external;
    function incrementFaucetPoints(address user, string memory token) external;
    function incrementSwapPoints(address user) external;
}
