// SPDX-License-Identifier: GPL-3

pragma solidity >=0.8.4;

import "../libraries/SlotLocations.sol";
import "../CrocSwapDex.sol";

import "hardhat/console.sol";

contract QueryHelper {
    using CurveMath for CurveMath.CurveState;
    
    address public dex_;
    
    constructor (address dex) {
        dex_ = dex;
    }
    
    function queryCurve (address base, address quote, uint24 poolIdx)
        public view returns (CurveMath.CurveState memory curve) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        (curve.priceRoot_, curve.liq_, curve.accum_) =
            CrocSwapDex(dex_).curves_(poolHash);
        
    }

    function queryLiquidity (address base, address quote, uint24 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }

    function queryPrice (address base, address quote, uint24 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).priceRoot_;
    }

    function querySurplus (address owner, address token)
        public view returns (uint128) {
        bytes32 key = keccak256(abi.encode(owner, token));
        return CrocSwapDex(dex_).surplusCollateral_(key);
    }

    function queryRouterApproved (address router, address origin)
        public view returns (bool burn, bool debit) {
        bytes32 key = keccak256(abi.encode(router, origin));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.AGENT_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));
        burn = uint256(val) & CrocSlots.AGENT_BURN_OFFSET > 0;
        debit = uint256(val) & CrocSlots.AGENT_DEBIT_OFFSET > 0;
    }

    function queryProtocolAccum (address token) public view returns (uint128) {
        bytes32 key = bytes32(uint256(uint160(token)));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.FEE_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));
        return uint128(val);
    }

    function queryLevel (address base, address quote, uint24 poolIdx, int24 tick)
        public view returns (uint96 bidLots, uint96 askLots, uint64 odometer) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 lvlKey = keccak256(abi.encodePacked(poolHash, tick));
        (bidLots, askLots, odometer) = CrocSwapDex(dex_).levels_(lvlKey);
    }
}
