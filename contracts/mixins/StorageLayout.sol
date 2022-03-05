// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';

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

    // Re-entant lock. Should always be false at rest.
    address internal lockHolder_;

    // If set to true, than the embedded hot-path (swap()) is not enabled and
    // users must use the hot proxy for the hot-path. By default set to false.
    bool internal forceHotProxy_;

    // Address of the current dex protocol authority. Can be transfered
    address internal authority_;

    // Slots for sidecar proxy contracts
    address[65536] internal proxyPaths_;
    
    // The slots of the currently attached sidecar proxy contracts. Can be upgraded
    // over time.
    uint8 constant COLD_PROXY_IDX = 0;
    uint8 constant WARM_PROXY_IDX = 1;
    uint8 constant LONG_PROXY_IDX = 2;
    uint8 constant MICRO_PROXY_IDX = 3;
    uint8 constant HOT_PROXY_IDX = 4;

    
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
    struct KnockoutCntr {
        uint96 lots_;
        uint128 crossCnt_;
    }
    mapping(bytes32 => KnockoutCntr) internal knockouts_;
    /**************************************************************/

    
    /**************************************************************/
    // TickCensus
    /**************************************************************/
    mapping(bytes32 => uint256) internal mezzanine_;
    mapping(bytes32 => uint256) internal terminus_;
    /**************************************************************/
    

    /**************************************************************/
    // PoolRegistry
    mapping(uint24 => PoolSpecs.Pool) internal templates_;
    mapping(bytes32 => PoolSpecs.Pool) internal pools_;
    mapping(address => PriceGrid.ImproveSettings) internal improves_;
    uint128 internal newPoolLiq_;
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
        // Multiple loosely related fields are grouped together to minimize
        // SLOAD reads in certain scenario.
        uint128 surplusCollateral_;
        uint32 nonce_;
        uint32 agentCallsLeft_;
    }
    
    mapping(bytes32 => UserBalance) internal userBals_;
    /**************************************************************/
}


contract StoragePrototypes is StorageLayout {
    UserBalance bal_;
    CurveMath.CurveState curve_;
    RangePosition pos_;
    AmbientPosition amb_;
    BookLevel lvl_;
}
