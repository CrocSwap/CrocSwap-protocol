// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/ProtocolCmd.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/StorageLayout.sol';
import '../mixins/ProtocolAccount.sol';
import '../mixins/DepositDesk.sol';
import '../CrocEvents.sol';

import "hardhat/console.sol";

/* @title Booth path callpath sidecar.
 * 
 * @notice Simple proxy with the sole function of upgrading other proxy contracts. For safety
 *         this proxy cannot upgrade itself, since that would risk permenately locking out the
 *         ability to ever upgrade.
 *         
 * @dev    This is a special proxy sidecar which should only be installed once at construction
 *         time at slot 0 (BOOT_PROXY_IDX). No other proxy contract should include upgrade 
 *         functionality. If both of these conditions are true, this proxy can never be overwritten
 *         and upgrade functionality can never be broken for the life of the main contract. */
contract BootPath is MarketSequencer, DepositDesk, ProtocolAccount {
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;
    using ProtocolCmd for bytes;

    /* @notice Consolidated method for protocol control related commands. */
    function protocolCmd (bytes calldata cmd) virtual public {
        require(sudoMode_, "Sudo");
        
        uint8 cmdCode = uint8(cmd[31]);
        if (cmdCode == ProtocolCmd.UPGRADE_DEX_CODE) {
            upgradeProxy(cmd);
        } 
    }
    
    function userCmd (bytes calldata) virtual public payable { }
    
    /* @notice Upgrades one of the existing proxy sidecar contracts.
     * @dev    Be extremely careful calling this, particularly when upgrading the
     *         cold path contract, since that contains the upgrade code itself.
     * @param proxy The address of the new proxy smart contract
     * @param proxyIdx Determines which proxy is upgraded on this call */
    function upgradeProxy (bytes calldata cmd) private {
        (, address proxy, uint16 proxyIdx) =
            abi.decode(cmd, (uint8, address, uint16));
        require(proxyIdx != CrocSlots.BOOT_PROXY_IDX, "Cannot overwrite boot path");
        require(proxy == address(0) || proxy.code.length > 0, "Proxy address is not a contract");

        emit CrocEvents.UpgradeProxy(proxy, proxyIdx);
        proxyPaths_[proxyIdx] = proxy;        
    }
}

