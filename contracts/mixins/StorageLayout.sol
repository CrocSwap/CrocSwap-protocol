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

    // Generic general-purpose storage slots
    bool public reEntrantLocked_;
    address internal authority_;
    address internal coldPath_;
    address internal warmPath_;
    address internal longPath_;
    address internal microPath_;

    modifier reEntrantLock() {
        require(reEntrantLocked_ == false);
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;
    }

    modifier protocolOnly() {
        require(msg.sender == authority_ && reEntrantLocked_ == false);
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;        
    }

    
    /**************************************************************/
    // LevelBook
    /**************************************************************/
    struct BookLevel {
        uint96 bidLots_;
        uint96 askLots_;
        uint64 feeOdometer_;
    }
    mapping(bytes32 => BookLevel) public levels_;
    /**************************************************************/

    
    /**************************************************************/
    // TickCensus
    /**************************************************************/
    mapping(bytes32 => uint256) public mezzanine_;
    mapping(bytes32 => uint256) public terminus_;
    /**************************************************************/
    

    /**************************************************************/
    // PoolRegistry
    mapping(uint24 => PoolSpecs.Pool) public templates_;
    mapping(bytes32 => PoolSpecs.Pool) public pools_;
    mapping(address => PriceGrid.ImproveSettings) public improves_;
    uint128 public newPoolLiq_;
    /**************************************************************/

    
    /**************************************************************/
    // ProtocolAccount
    /**************************************************************/
    mapping(address => uint128) public feesAccum_;
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
    mapping(bytes32 => RangePosition) public positions_;
    mapping(bytes32 => AmbientPosition) public ambPositions_;
    /**************************************************************/


    /**************************************************************/
    // AgentMask
    /**************************************************************/
    struct AgentApproval {
        bool burn_;
        bool debit_;
    }
    mapping(bytes32 => AgentApproval) public agents_;
    /**************************************************************/

    
    /**************************************************************/
    // LiquidityCurve
    /**************************************************************/
    mapping(bytes32 => CurveMath.CurveState) public curves_;
    /**************************************************************/

    
    /**************************************************************/
    // OracleHistorian    
    /**************************************************************/
    struct Checkpoint {
        uint32 time_;
        uint32 ambientGrowth_;
        int56 twapPriceSum_;
        int56 vwapPriceSum_;
        uint80 liqLots_;
    }
    
    struct History {
        uint64 nextIndex_;
        int24 lastTick_;
        Checkpoint[4294967296] series_;
    }

    mapping(bytes32 => History) internal hists_;
    /**************************************************************/

    
    /**************************************************************/
    // SettleLayer
    /**************************************************************/
    mapping(bytes32 => uint128) public surplusCollateral_;
    /**************************************************************/
}

