// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
import "../CrocSwapDex.sol";

contract CrocQuery {
    using CurveMath for CurveMath.CurveState;
    using SafeCast for uint144;
    
    address public dex_;
    
    constructor (address dex) {
        require(dex != address(0) && CrocSwapDex(dex).acceptCrocDex(), "Invalid CrocSwapDex");
        dex_ = dex;
    }
    
    function queryCurve (address base, address quote, uint256 poolIdx)
        public view returns (CurveMath.CurveState memory curve) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.CURVE_MAP_SLOT));
        uint256 valOne = CrocSwapDex(dex_).readSlot(uint256(slot));
        uint256 valTwo = CrocSwapDex(dex_).readSlot(uint256(slot)+1);
        
        curve.priceRoot_ = uint128((valOne << 128) >> 128);
        curve.ambientSeeds_ = uint128(valOne >> 128);
        curve.concLiq_ = uint128((valTwo << 128) >> 128);
        curve.seedDeflator_ = uint64((valTwo << 64) >> 192);
        curve.concGrowth_ = uint64(valTwo >> 192);
    }

    function queryCurveTick (address base, address quote, uint256 poolIdx) 
        public view returns (int24) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.CURVE_MAP_SLOT));
        uint256 valOne = CrocSwapDex(dex_).readSlot(uint256(slot));
        
        uint128 curvePrice = uint128((valOne << 128) >> 128);
        return TickMath.getTickAtSqrtRatio(curvePrice);
    }

    function queryLiquidity (address base, address quote, uint256 poolIdx)
        public view returns (uint128) {        
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }

    function queryPrice (address base, address quote, uint256 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).priceRoot_;
    }

    function querySurplus (address owner, address token)
        public view returns (uint128 surplus) {
        bytes32 key = keccak256(abi.encode(owner, token));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.BAL_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));
        surplus = uint128((val << 128) >> 128);
    }

    function queryVirtual (address owner, address tracker, uint256 salt)
        public view returns (uint128 surplus) {
        address token = PoolSpecs.virtualizeAddress(tracker, salt);
        surplus = querySurplus(owner, token);
    }

    function queryProtocolAccum (address token) public view returns (uint128) {
        bytes32 key = bytes32(uint256(uint160(token)));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.FEE_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));
        return uint128(val);
    }

    function queryLevel (address base, address quote, uint256 poolIdx, int24 tick)
        public view returns (uint96 bidLots, uint96 askLots, uint64 odometer) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = keccak256(abi.encodePacked(poolHash, tick));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.LVL_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        odometer = uint64(val >> 192);
        askLots = uint96((val << 64) >> 160);
        bidLots = uint96((val << 160) >> 160);
    }

    function queryKnockoutPivot (address base, address quote, uint256 poolIdx,
                                 bool isBid, int24 tick)
        public view returns (uint96 lots, uint32 pivot, uint16 range) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = KnockoutLiq.encodePivotKey(poolHash, isBid, tick);
        bytes32 slot = keccak256(abi.encodePacked(key, CrocSlots.KO_PIVOT_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        lots = uint96((val << 160) >> 160);
        pivot = uint32((val << 128) >> 224);
        range = uint16(val >> 128);
    }

    function queryKnockoutMerkle (address base, address quote, uint256 poolIdx,
                                  bool isBid, int24 tick)
        public view returns (uint160 root, uint32 pivot, uint64 fee) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = KnockoutLiq.encodePivotKey(poolHash, isBid, tick);
        bytes32 slot = keccak256(abi.encodePacked(key, CrocSlots.KO_MERKLE_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        root = uint160((val << 96) >> 96);
        pivot = uint32((val << 64) >> 224);
        fee = uint64(val >> 192);
    }

    function queryKnockoutPos (address owner, address base, address quote,
                               uint256 poolIdx, uint32 pivot, bool isBid,
                               int24 lowerTick, int24 upperTick) public view
        returns (uint96 lots, uint64 mileage, uint32 timestamp) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lowerTick;
        loc.upperTick_ = upperTick;

        return queryKnockoutPos(loc, poolHash, owner, pivot);
    }

    function queryKnockoutPos (KnockoutLiq.KnockoutPosLoc memory loc,
                               bytes32 poolHash, address owner, uint32 pivot)
        private view returns (uint96 lots, uint64 mileage, uint32 timestamp) {
        bytes32 key = KnockoutLiq.encodePosKey(loc, poolHash, owner, pivot);
        bytes32 slot = keccak256(abi.encodePacked(key, CrocSlots.KO_POS_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        lots = uint96((val << 160) >> 160);
        mileage = uint64((val << 96) >> 224);
        timestamp = uint32(val >> 224);
    }

    function queryRangePosition (address owner, address base, address quote,
                                 uint256 poolIdx, int24 lowerTick, int24 upperTick)
        public view returns (uint128 liq, uint64 fee,
                             uint32 timestamp, bool atomic) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 posKey = keccak256(abi.encodePacked(owner, poolHash, lowerTick, upperTick));
        bytes32 slot = keccak256(abi.encodePacked(posKey, CrocSlots.POS_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        liq = uint128((val << 128) >> 128);
        fee = uint64((val >> 128) << (128 + 64) >> (128 + 64));
        timestamp = uint32((val >> (128 + 64)) << (128 + 64 + 32) >> (128 + 64 + 32));
        atomic = bool((val >> (128 + 64 + 32)) > 0);
    }

    function queryAmbientPosition (address owner, address base, address quote,
                                   uint256 poolIdx)
        public view returns (uint128 seeds, uint32 timestamp) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 posKey = keccak256(abi.encodePacked(owner, poolHash));
        bytes32 slot = keccak256(abi.encodePacked(posKey, CrocSlots.AMB_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        seeds = uint128((val << 128) >> 128);
        timestamp = uint32((val >> (128)) << (128 + 32) >> (128 + 32));
    }

    function queryConcRewards (address owner, address base, address quote, uint256 poolIdx,
                               int24 lowerTick, int24 upperTick) public view returns (uint128) {
        (uint128 liq, uint64 feeStart, ,) = queryRangePosition(owner, base, quote, poolIdx,
                                                               lowerTick, upperTick);
        (, , uint64 bidFee) = queryLevel(base, quote, poolIdx, lowerTick);
        (, , uint64 askFee) = queryLevel(base, quote, poolIdx, upperTick);
        CurveMath.CurveState memory curve = queryCurve(base, quote, poolIdx);
        uint64 curveFee = queryCurve(base, quote, poolIdx).concGrowth_;

        int24 curveTick = TickMath.getTickAtSqrtRatio(curve.priceRoot_);
        uint64 feeLower = lowerTick <= curveTick ? bidFee : curveFee - bidFee;
        uint64 feeUpper = upperTick <= curveTick ? askFee : curveFee - askFee;
        unchecked {
            uint64 accumFees = (feeUpper - feeLower) - feeStart;
            uint128 seeds = FixedPoint.mulQ48(liq, accumFees).toUint128By144();
            return CompoundMath.inflateLiqSeed(seeds, curve.seedDeflator_);
        }
    }
}
