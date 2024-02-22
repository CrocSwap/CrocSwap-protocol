// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
import "../CrocSwapDex.sol";

import "hardhat/console.sol";

contract QueryHelper {
    using CurveMath for CurveMath.CurveState;
    
    address public dex_;
    
    constructor (address dex) {
        dex_ = dex;
    }
    
    function queryCurve (address base, address quote, uint256 poolIdx)
        public view returns (CurveMath.CurveState memory curve) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.CURVE_MAP_SLOT));
        uint256 valOne = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        uint256 valTwo = CrocSwapDex(payable(dex_)).readSlot(uint256(slot)+1);
        
        curve.priceRoot_ = uint128((valOne << 128) >> 128);
        curve.ambientSeeds_ = uint128(valOne >> 128);
        curve.concLiq_ = uint128((valTwo << 128) >> 128);
        curve.seedDeflator_ = uint64((valTwo << 64) >> 192);
        curve.concGrowth_ = uint64(valTwo >> 192);
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
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        surplus = uint128((val << 128) >> 128);
    }

    function queryProtocolAccum (address token) public view returns (uint128) {
        bytes32 key = bytes32(uint256(uint160(token)));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.FEE_MAP_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        return uint128(val);
    }

    function queryLevel (address base, address quote, uint256 poolIdx, int24 tick)
        public view returns (uint96 bidLots, uint96 askLots, uint64 odometer) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = keccak256(abi.encodePacked(poolHash, tick));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.LVL_MAP_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        odometer = uint64(val >> 192);
        askLots = uint96((val << 64) >> 160);
        bidLots = uint96((val << 160) >> 160);
    }
}
