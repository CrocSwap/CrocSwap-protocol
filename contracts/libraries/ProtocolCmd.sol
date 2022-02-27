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
    uint8 constant FORCE_HOT_CODE = 22;
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
    ////////////////////////////////////////////////////////////////////////////


    
    function isPrivilegedCmd (bytes calldata input) internal pure returns (bool) {
        return parseProtocolCmdCode(input) <  PRIVILEGE_CMD_SPACE;
    }
    
    function decodeProtocolCmd (bytes calldata input) internal pure
        returns (uint8, address, address, uint24,
                 uint24, uint8, uint16, uint128) {
        return abi.decode(input, (uint8, address, address, uint24, uint24,
                                  uint8, uint16, uint128));
    }

    function parseProtocolCmdCode (bytes calldata input) internal pure returns (uint8) {
        // ABI encode packs uint8 fields with 31 leading 0 bytes.
        uint8 codeIdx = 31;
        return uint8(input[codeIdx]);
    }

    function encodeProtocolCmd (uint8 code, address addrA, address addrB,
                                uint24 idxA, uint24 idxB, uint8 idxM,
                                uint16 idxZ, uint128 value) internal pure
        returns (bytes memory) {
        return abi.encode(code, addrA, addrB, idxA, idxB, idxM, idxZ, value);
    }

    function encodeUpgrade (address proxy, uint8 proxySlot)
        internal pure returns (bytes memory) {
        return encodeProtocolCmd(UPGRADE_DEX_CODE, address(0), address(proxy),
                                 0, 0, proxySlot, 0, 0);
    }

    function encodeForceProxy (bool forceProxy)
        internal pure returns (bytes memory) {
        return encodeProtocolCmd(FORCE_HOT_CODE, address(0), address(0),
                                 0, 0, forceProxy ? 1 : 0, 0, 0);
    }

}
