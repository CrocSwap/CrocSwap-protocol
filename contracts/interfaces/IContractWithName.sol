// SPDX-License-Identifier: GPL-3 

pragma solidity 0.8.19;

/* @title IContractWithName
 * @notice Interface for contracts that have a name.
 */
interface IContractWithName {
    function symbol() external view returns (string memory);
}