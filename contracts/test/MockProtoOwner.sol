// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../CrocSwapPool.sol";

contract MockProtoOwner {
    
    function testProtocolSetFee (address pool, uint8 protoFee) public {
        CrocSwapPool(pool).setFeeProtocol(protoFee);
    }

    function testProtocolCollect (address pool, address recv) public {
        CrocSwapPool(pool).collectProtocol(recv);
    }
}
