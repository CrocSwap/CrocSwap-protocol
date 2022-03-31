// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../mixins/KnockoutCounter.sol";

contract TestKnockoutCounter is KnockoutCounter {
    using KnockoutLiq for KnockoutLiq.KnockoutPos;
    using KnockoutLiq for KnockoutLiq.KnockoutPosLoc;

    uint96 public bookLots_;
    uint32 public pivotTime_;
    uint64 public rewards_;
    uint32 public callTime_;
    bool public togglesPivot_;
    
    function testCross (uint256 pool, bool isBid, int24 tick,
                        uint64 feeGlobal) public {
        crossLevel(bytes32(pool), tick, !isBid, feeGlobal);
        crossKnockout(bytes32(pool), isBid, tick, feeGlobal);
    }

    function testMint (uint256 poolIdx, uint8 knockoutBits,
                       int24 tick, uint64 feeGlobal, uint96 lots,
                       bool isBid, int24 lower, int24 upper) public {
        PoolSpecs.PoolCursor memory pool;
        pool.hash_ = bytes32(poolIdx);
        pool.head_.knockoutBits_ = knockoutBits;
        
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;
        
        (pivotTime_, togglesPivot_) = mintKnockout(pool, tick, feeGlobal, loc, lots);

        callTime_ = uint32(block.timestamp);
    }

    // Mints a bid and an ask at the same time
    function testMintArch (uint256 poolIdx, uint8 knockoutBits,
                           int24 tick, uint64 feeGlobal, uint96 lots,
                           int24 lower, int24 upper) public {
        testMint(poolIdx, knockoutBits, tick, feeGlobal, lots, true, lower, upper);
        testMint(poolIdx, knockoutBits, tick, feeGlobal, lots, false, lower, upper);
    }

    function testBurn (uint256 poolIdx, int24 tick, uint64 feeGlobal, uint96 lots,
                       bool isBid, int24 lower, int24 upper) public {
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;
        
        (togglesPivot_, pivotTime_, rewards_) =
            burnKnockout(bytes32(poolIdx), tick, feeGlobal, loc, lots);
    }

    function testClaim (uint256 poolIdx, bool isBid, int24 lower, int24 upper,
                        uint160 merkleRoot, uint96[] calldata merkleProof) public {
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;
        
        (bookLots_, rewards_) = claimKnockout
            (bytes32(poolIdx), loc, merkleRoot, merkleProof);
    }

    function testRecover (uint256 poolIdx, bool isBid, int24 lower, int24 upper,
                          uint32 pivotTime) public {
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;
        
        (bookLots_) = recoverKnockout(bytes32(poolIdx), loc, pivotTime);
    }

    function getPivot (uint256 poolIdx, bool isBid, int24 lower, int24 upper)
        public view returns (uint96 lots, uint32 pivotTime, uint16 range) {
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;
        
        bytes32 key = loc.encodePivotKey(bytes32(poolIdx));
        KnockoutLiq.KnockoutPivot memory pivot = knockoutPivots_[key];
        lots = pivot.lots_;
        pivotTime = pivot.pivotTime_;
        range = pivot.rangeTicks_;
    }

    function getMerkle (uint256 poolIdx, bool isBid, int24 lower, int24 upper)
        public view returns (uint160 root, uint32 pivotTime, uint64 feeMileage) {
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;
        
        bytes32 key = loc.encodePivotKey(bytes32(poolIdx));
        KnockoutLiq.KnockoutMerkle memory merkle = knockoutMerkles_[key];
        root = merkle.merkleRoot_;
        pivotTime = merkle.pivotTime_;
        feeMileage = merkle.feeMileage_;
    }

    function getPosition (uint256 poolIdx, bool isBid, int24 lower, int24 upper,
                          uint32 pivotTime) public view returns
        (uint96 lots, uint64 feeMileage, uint32 timestamp) {
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lower;
        loc.upperTick_ = upper;

        bytes32 key = loc.encodePosKey(bytes32(poolIdx), agentMintKey(), pivotTime);
        KnockoutLiq.KnockoutPos memory pos = knockoutPos_[key];
        lots = pos.lots_;
        timestamp = pos.timestamp_;
        feeMileage = pos.feeMileage_;
    }

    function getLevelState (uint256 poolIdx, int24 tick) public view returns
        (BookLevel memory) {
        return levelState(bytes32(poolIdx), tick);
    }

    function setLockholder (uint160 lockholder) public {
        lockHolder_ = address(lockholder);
    }
}
