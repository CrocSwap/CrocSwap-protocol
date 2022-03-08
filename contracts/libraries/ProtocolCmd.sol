// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './SafeCast.sol';

library ProtocolCmd {
     
    // The first 64 protocol command codes are reserved for direct governance and can
    // never be implemented in automated policy. 
    uint8 constant PRIVILEGE_CMD_SPACE = 64;
    
    
    ////////////////////////////////////////////////////////////////////////////
    // Privileged commands invokable by direct governance only.
    ////////////////////////////////////////////////////////////////////////////
    // Code for transfering authority in the underlying CrocSwapDex contract.
    uint8 constant AUTHORITY_TRANSFER_CODE = 20;
    // Code to upgrade one of the sidecar proxy contracts on CrocSwapDex.
    uint8 constant UPGRADE_DEX_CODE = 21;
    // Code to force hot path to use the proxy contract
    uint8 constant HOT_OPEN_CODE = 22;
    // Code to force hot path to use the proxy contract
    uint8 constant SAFE_MODE_CODE = 23;
    // Code to collect accumulated protocol fees for the treasury.
    uint8 constant COLLECT_TREASURY_CODE = 40;
    ////////////////////////////////////////////////////////////////////////////

    
    ////////////////////////////////////////////////////////////////////////////
    // General purpose policy commands.
    ////////////////////////////////////////////////////////////////////////////
    // Code to set pool type template
    uint8 constant POOL_TEMPLATE_CODE = 110;
    // Code to revise parameters on pre-existing pool
    uint8 constant POOL_REVISE_CODE = 111;
    // Code to set the liquidity burn on pool initialization
    uint8 constant INIT_POOL_LIQ_CODE = 112;
    // Code to set/reset the off-grid liquidity threshold.
    uint8 constant OFF_GRID_CODE = 113;
    // Code to set the protocol take rate
    uint8 constant SET_TAKE_CODE = 114;
    // Code to resync the protocol take rate on an extant pool
    uint8 constant RESYNC_TAKE_CODE = 115;
    ////////////////////////////////////////////////////////////////////////////


    function encodeUpgrade (address proxy, uint16 proxySlot)
        internal pure returns (bytes memory) {
        return abi.encode(UPGRADE_DEX_CODE, proxy, proxySlot);
    }

    function encodeHotPath (bool open)
        internal pure returns (bytes memory) {
        return abi.encode(HOT_OPEN_CODE, open);
    }

    function encodeSafeMode (bool safeMode)
        internal pure returns (bytes memory) {
        return abi.encode(SAFE_MODE_CODE, safeMode);
    }

}
