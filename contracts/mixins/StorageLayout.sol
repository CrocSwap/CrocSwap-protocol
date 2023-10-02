// SPDX-License-Identifier: GPL-3                                                          
pragma solidity 0.8.19;
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

    // Re-entrant lock. Should always be reset to 0x0 after the end of every
    // top-level call. Any top-level call should fail on if this value is non-
    // zero.
    //
    // Inside a call this address is always set to the beneficial owner that
    // the call is being made on behalf of. Therefore any positions, tokens,
    // or liquidity can only be accessed if and only if they're owned by the
    // value lockHolder_ is currently set to.
    //
    // In the case of third party relayer or router calls, this value should
    // always be set to the *client* that the call is being made for, and never
    // the msg.sender caller that is acting on the client behalf's. (Of course
    // for security, third party calls made on a client's behalf must always
    // be authorized by the client either by pre-approval or signature.)
    address internal lockHolder_;

    // Indicates whether a given protocolCmd() call is operating in escalated
    // privileged mode. *Must* always be reset to false after every call.
    bool internal sudoMode_;

    bool internal msgValSpent_;

    // If set to false, then the embedded hot-path (swap()) is not enabled and
    // users must use the hot proxy for the hot-path. By default set to true.
    bool internal hotPathOpen_;
    
    bool internal inSafeMode_;

    // The protocol take rate for relayer tips. Represented in 1/256 fractions
    uint8 internal relayerTakeRate_;

    // Slots for sidecar proxy contracts
    address[65536] internal proxyPaths_;
        
    // Address of the current dex protocol authority. Can be transferred
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

    struct RangePosition72 {
        uint128 liquidity_;
        uint72 feeMileage_;
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

    address treasury_;
    uint64 treasuryStartTime_;

    /**************************************************************/
    // Governance address for liquidity mining
    address governance_;

    // Overall rewards per week (pool => week => reward), configured by governance
    mapping(bytes32 => mapping(uint32 => uint64)) concRewardPerWeek_;
    mapping(bytes32 => mapping(uint32 => uint64)) ambRewardPerWeek_;

    // Pool -> Week -> Liquidity
    mapping(bytes32 => mapping(uint32 => uint256)) timeWeightedWeeklyGlobalConcLiquidity_;
    // Pool -> Timestamp
    mapping(bytes32 => uint32) timeWeightedWeeklyGlobalConcLiquidityLastSet_;

    struct TickTracking {
        uint32 enterTimestamp;
        uint32 exitTimestamp;
    }
    // Pool -> Tick -> Tracking Data (enter / exit timestamps)
    mapping(bytes32 => mapping(int24 => TickTracking[])) tickTracking_;

    // Pool -> Position -> Week -> Tick -> Liquidity
    mapping(bytes32 => mapping(bytes32 => mapping(uint32 => mapping(int24 => uint256)))) timeWeightedWeeklyPositionInRangeConcLiquidity_;
    // Pool -> Position -> Timestamp
    mapping(bytes32 => mapping(bytes32 => uint32)) timeWeightedWeeklyPositionConcLiquidityLastSet_;
    // Pool -> Position -> Week -> Claimed
    mapping(bytes32 => mapping(bytes32 => mapping(uint32 => bool))) concLiquidityRewardsClaimed_;

    mapping(bytes32 => mapping(bytes32 => mapping(int32 => uint32))) tickTrackingIndexAccruedUpTo_;
    
    // Pool -> Week -> Liquidity
    mapping(bytes32 => mapping(uint32 => uint256)) timeWeightedWeeklyGlobalAmbLiquidity_;
    // Pool -> Timestamp
    mapping(bytes32 => uint32) timeWeightedWeeklyGlobalAmbLiquidityLastSet_;
    // Pool -> Position -> Week -> Liquidity
    mapping(bytes32 => mapping(bytes32 => mapping(uint32 => uint256))) timeWeightedWeeklyPositionAmbLiquidity_;
    // Pool -> Position -> Timestamp
    mapping(bytes32 => mapping(bytes32 => uint32)) timeWeightedWeeklyPositionAmbLiquidityLastSet_;
    // Pool -> Position -> Week -> Claimed
    mapping(bytes32 => mapping(bytes32 => mapping(uint32 => bool))) ambLiquidityRewardsClaimed_;
    // Since take rate is represented in 1/256, this represents a maximum possible take 
    // rate of 50%.
    uint8 MAX_TAKE_RATE = 128;

    mapping(bytes32 => RangePosition72) internal positions72_;
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
    uint constant public KO_PIVOT_SLOT = 65539;
    uint constant public KO_MERKLE_SLOT = 65540;
    uint constant public KO_POS_SLOT = 65541;
    uint constant public POOL_TEMPL_SLOT = 65544;
    uint constant public POOL_PARAM_SLOT = 65545;
    uint constant public FEE_MAP_SLOT = 65548;
    uint constant public POS_MAP_SLOT = 65549;
    uint constant public AMB_MAP_SLOT = 65550;
    uint constant public CURVE_MAP_SLOT = 65551;
    uint constant public BAL_MAP_SLOT = 65552;
    uint constant public POS_MAP_SLOT_72 = 65554;

        
    // The slots of the currently attached sidecar proxy contracts. These are set by
    // covention and should be expanded over time as more sidecars are installed. For
    // backwards compatibility, upgraders should never break existing interface on
    // a pre-existing proxy sidecar.
    uint16 constant BOOT_PROXY_IDX = 0;
    uint16 constant SWAP_PROXY_IDX = 1;
    uint16 constant LP_PROXY_IDX = 128;
    uint16 constant COLD_PROXY_IDX = 3;
    uint16 constant LONG_PROXY_IDX = 130;
    uint16 constant MICRO_PROXY_IDX = 131;
    uint16 constant MULTICALL_PROXY_IDX = 6;
    uint16 constant KNOCKOUT_LP_PROXY_IDX = 7;
    uint16 constant LIQUIDITY_MINING_PROXY_IDX = 8;
    uint16 constant FLAG_CROSS_PROXY_IDX = 3500;
    uint16 constant SAFE_MODE_PROXY_PATH = 9999;

    // Used as proxy contracts by previous deployments. These slots should not be re-used
    // to preserve backwards compatibility.
    uint16 constant LP_PROXY_LEGACY_IDX = 2;
    uint16 constant LONG_PROXY_LEGACY_IDX = 4;
    uint16 constant MICRO_PROXY_LEGACY_IDX = 5;

}

// Not used in production. Just used so we can easily check struct size in hardhat.
contract StoragePrototypes is StorageLayout {
    UserBalance bal_;
    CurveMath.CurveState curve_;
    RangePosition pos_;
    AmbientPosition amb_;
    BookLevel lvl_;
}
