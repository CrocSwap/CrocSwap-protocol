// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/TickCensus.sol';

contract StorageLayout {

    // Generic general-purpose storage slots
    bool internal reEntrantLocked_;
    address internal authority_;
    address internal sidecar_;
    address internal master_;
    address internal coldPath_;
    address internal warmPath_;

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

    modifier masterOnly() {
        require(msg.sender == master_);
        _;
    }

    
    /**************************************************************/
    // LevelBook
    /**************************************************************/
    struct BookLevel {
        uint96 bidLots_;
        uint96 askLots_;
        uint64 feeOdometer_;
    }
    mapping(bytes32 => BookLevel) internal levels_;
    TickCensusLib.TickCensus internal ticks_;
    /**************************************************************/
    

    /**************************************************************/
    // PoolRegistry
    mapping(uint24 => PoolSpecs.Pool) internal templates_;
    mapping(bytes32 => PoolSpecs.Pool) internal pools_;
    mapping(address => PriceGrid.ImproveSettings) internal improves_;
    /**************************************************************/

    
    /**************************************************************/
    // ProtocolAccount
    /**************************************************************/
    mapping(address => uint256) internal feesAccum_;
    /**************************************************************/


    /**************************************************************/
    // PositionRegistrar
    /**************************************************************/
    struct RangePosition {
        uint128 liquidity_;
        uint64 feeMileage_;
        uint32 timestamp_;
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
    mapping(bytes32 => uint128) internal surplusCollateral_;
    /**************************************************************/
}

