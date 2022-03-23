// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/KnockoutLiq.sol';

/* @title Storage layout base layer
 * 
 * @notice Only exists to enforce a single consistent storage layout. Not
 *    designed to be externally used. All storage in any CrocSwap contract
 *    is defined here. That allows easy use of delegatecall() to move code
 *    over the 24kb into proxy contracts.
 *
 * @dev Any contract or mixin with local defined storage variables *must*
 *    define those storage variables here and inherit this mixin. Failure
 *    to do this may lead to storage layout inconsistencies between proxy
 *    contracts. */
contract StorageLayout {

    // Re-entant lock. Should always be 0x0 at rest
    address internal lockHolder_;

    // Indicates whether a given protocolCmd() call is operating in escalated
    // privileged mode. *Must* always be reset to false after every call.
    bool internal sudoMode_;

    // If set to true, than the embedded hot-path (swap()) is not enabled and
    // users must use the hot proxy for the hot-path. By default set to false.
    bool internal hotPathOpen_;
    bool internal inSafeMode_;

    // The protocol take rate for relayer tips. Represented in 1/256 fractions
    uint8 internal relayerTakeRate_;

    // Slots for sidecar proxy contracts
    address[65536] internal proxyPaths_;
        
    // Address of the current dex protocol authority. Can be transfered
    address internal authority_;

    /**************************************************************/
    // LevelBook
    /**************************************************************/
    struct BookLevel {
        uint96 bidLots_;
        uint96 askLots_;
        uint64 feeOdometer_;
    }
    mapping(bytes32 => BookLevel) internal levels_;
    /**************************************************************/

    
    /**************************************************************/
    // Knockout Counters
    /**************************************************************/
    mapping(bytes32 => KnockoutLiq.KnockoutPivot) internal knockoutPivots_;
    mapping(bytes32 => KnockoutLiq.KnockoutMerkle) internal knockoutMerkles_;
    mapping(bytes32 => KnockoutLiq.KnockoutPos) internal knockoutPos_;
    /**************************************************************/

    
    /**************************************************************/
    // TickCensus
    /**************************************************************/
    mapping(bytes32 => uint256) internal mezzanine_;
    mapping(bytes32 => uint256) internal terminus_;
    /**************************************************************/
    

    /**************************************************************/
    // PoolRegistry
    /**************************************************************/
    mapping(uint256 => PoolSpecs.Pool) internal templates_;
    mapping(bytes32 => PoolSpecs.Pool) internal pools_;
    mapping(address => PriceGrid.ImproveSettings) internal improves_;
    uint128 internal newPoolLiq_;
    uint8 internal protocolTakeRate_;
    /**************************************************************/

    
    /**************************************************************/
    // ProtocolAccount
    /**************************************************************/
    mapping(address => uint128) internal feesAccum_;
    /**************************************************************/


    /**************************************************************/
    // PositionRegistrar
    /**************************************************************/
    struct RangePosition {
        uint128 liquidity_;
        uint64 feeMileage_;
        uint32 timestamp_;
        bool atomicLiq_;
    }

    struct AmbientPosition {
        uint128 seeds_;
        uint32 timestamp_;
    }
    
    mapping(bytes32 => RangePosition) internal positions_;
    mapping(bytes32 => AmbientPosition) internal ambPositions_;
    /**************************************************************/


    /**************************************************************/
    // LiquidityCurve
    /**************************************************************/
    mapping(bytes32 => CurveMath.CurveState) internal curves_;
    /**************************************************************/

    
    /**************************************************************/
    // UserBalance settings
    /**************************************************************/
    struct UserBalance {
        // Multiple loosely related fields are grouped together to allow
        // off-chain users to optimize calls to minimize cold SLOADS by
        // hashing needed data to the same slots.
        uint128 surplusCollateral_;
        uint32 nonce_;
        uint32 agentCallsLeft_;
    }
    
    mapping(bytes32 => UserBalance) internal userBals_;
    /**************************************************************/
}

/* @notice Contains the storage or storage hash offsets of the fields and sidecars
 *         in StorageLayer.
 *
 * @dev Note that if the struct of StorageLayer changes, these slot locations *will*
 *      change, and the values below will have to be manually updated. */
library CrocSlots {

    // Slot location of storage slots and/or hash map storage slot offsets. Values below
    // can be used to directly read state in CrocSwapDex by other contracts.
    uint constant public AUTHORITY_SLOT = 0;
    uint constant public LVL_MAP_SLOT = 65538;
    uint constant public FEE_MAP_SLOT = 65546;
    uint constant public POS_MAP_SLOT = 65547;
    uint constant public AMB_MAP_SLOT = 65548;
    uint constant public CURVE_MAP_SLOT = 65549;
    uint constant public BAL_MAP_SLOT = 65550;

        
    // The slots of the currently attached sidecar proxy contracts. These are set by
    // covention and should be expanded over time as more sidecars are installed. For
    // backwards compatibility, upgradears should never break existing interface on
    // a pre-existing proxy sidecar.
    uint16 constant ADMIN_PROXY_IDX = 0;
    uint16 constant SWAP_PROXY_IDX = 1;
    uint16 constant LP_PROXY_IDX = 2;
    uint16 constant BAL_PROXY_IDX = 3;
    uint16 constant LONG_PROXY_IDX = 4;
    uint16 constant MICRO_PROXY_IDX = 5;
    uint16 constant KNOCKOUT_PROXY_IDX = 3575;
    uint16 constant SAFE_MODE_PROXY_PATH = 9999;
}

// Not used in production. Just used so we can easily check struct size in hardhat.
contract StoragePrototypes is StorageLayout {
    UserBalance bal_;
    CurveMath.CurveState curve_;
    RangePosition pos_;
    AmbientPosition amb_;
    BookLevel lvl_;
}
