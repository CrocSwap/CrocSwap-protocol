// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../CrocSwapPool.sol";

contract MockFactory is ICrocSwapFactory {
    using TickMath for uint160;

    uint8 public dfltProto;
    address public hotPool;
    address public override owner;

    function feeAmountTickSpacing (uint24) external pure override returns (int24) {
        return 1;
    }

    function setOwner (address _owner) external override {
        owner = _owner;
    }

    function enableFeeAmount (uint24 fee, uint16 spacing) external override {
        // Do nothing... All fees enabled...
    }

    function getDefaultProtocolFee() external view override returns (uint8) {
        return dfltProto;
    }

    function setDefaultProtocolFee (uint8 protoFee) external override {
        dfltProto = protoFee;
    }


    /* For purposes of simple mocking, we don't actually index the pool's parameter.
     * Just return the address of the last pool that was created. */
    function getPool (address, address, uint24) external view override
        returns (address) {
        return hotPool;
    }

    function createPool (address quote, address base, uint24 fee) external override
        returns (address) {
        hotPool = address(new CrocSwapPool(address(this), quote, base, fee, 1));
        return hotPool;
    }
}

