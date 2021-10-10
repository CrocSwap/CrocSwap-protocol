// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';

contract StorageLayout {

    // Generic general-purpose storage slots
    bool internal reEntrantLocked_;
    address internal authority_;
    address internal booksSidecar_;

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
    
    mapping(bytes32 => uint128) internal surplusCollateral_;

    // PoolRegistry
    mapping(uint24 => PoolSpecs.Pool) internal templates_;
    mapping(bytes32 => PoolSpecs.Pool) internal pools_;
    mapping(address => PriceGrid.ImproveSettings) internal improves_;

    // ProtocolAccount
    mapping(address => uint256) internal feesAccum_;

    // OracleHistorian
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

}

