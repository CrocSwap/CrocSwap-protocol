// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/KnockoutLiq.sol";

contract TestKnockoutLiq {
    using KnockoutLiq for KnockoutLiq.KnockoutMerkle;
    using KnockoutLiq for KnockoutLiq.KnockoutPivot;

    KnockoutLiq.KnockoutMerkle public merkle_;

    function testEncodePivotKey (uint256 pool, bool isBid, int24 tick) 
        public pure returns (bytes32) {
        return KnockoutLiq.encodePivotKey(bytes32(pool), isBid, tick);
    }

    function testEncodePosKey (uint256 pool, uint256 owner, bool isBid, int24 tick,
                               uint24 range, uint32 pivotTime)
        public pure returns (bytes32) {
        KnockoutLiq.KnockoutPosLoc memory pos;
        pos.isBid_ = isBid;
        pos.tick_ = tick;
        pos.rangeTicks_ = range;
        pos.pivotTime_ = pivotTime;
        return KnockoutLiq.encodePosKey(pos, bytes32(pool), bytes32(owner));
    }

    function testCommit (uint96 lots, uint32 time, uint16 range,
                         uint64 feeMileage) public {
        KnockoutLiq.KnockoutPivot memory pivot;
        pivot.lots_ = lots;
        pivot.rangeTicks_ = range;
        pivot.pivotTime_ = time;
        merkle_.commitKnockout(pivot, feeMileage);
    }

    function testProof (uint160 root, uint96[] calldata proof)
        view public returns (uint32, uint64) {
        return merkle_.proveHistory(root, proof);
    }
}
