// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "./Directives.sol";

/* @title Order encoding library
 * @notice Provides facilities for encoding and decoding user specified order directive
 *    structures to/from raw transaction bytes. */
library OrderEncoding {

    // Preamble code that begins at the start of long-form orders. Allows us to support
    // alternative message schemas in the future. To start all encoded long-form orders
    // must start with this code in the first character position.
    uint8 constant LONG_FORM_SCHEMA = 1;

    /* @notice Parses raw bytes into an OrderDirective struct in memory.
     * 
     * @dev In general the array lengths and arithmetic in this function and child
     *      functions are unchecked/unsanitized. The only use of this function is to
     *      parse a user-supplied string into constituent commands. If a user supplies
     *      malformed data it will have no impact on the state of the contract besides
     *      the internally safe swap/mint/burn calls. */
    function decodeOrder (bytes calldata input) internal pure returns
        (Directives.OrderDirective memory dir) {
        uint offset = 0;
        uint8 cnt;
        uint8 schemaType;

        (schemaType, dir.open_.token_, dir.open_.limitQty_, dir.open_.dustThresh_,
            dir.open_.useSurplus_, cnt) = abi.decode(input[offset:(offset+32*6)],
            (uint8, address, int128, uint128, bool, uint8));
        unchecked { // 0 + 32*6 is well with bounds of 256 bits
        offset += 32*6;
        }
 
        require(schemaType == LONG_FORM_SCHEMA);
        
        dir.hops_ = new Directives.HopDirective[](cnt);
        unchecked {
        // An iterate by 1 loop will run out of gas far before overflowing 256 bits
        for (uint i = 0; i < cnt; ++i) {
            offset = parseHop(dir.hops_[i], input, offset);
        }
        }
    }

    /* @notice Parses an offset bytestream into a single HopDirective in memory and 
     *         increments the offset accordingly. */
    function parseHop (Directives.HopDirective memory hop,
                       bytes calldata input, uint256 offset)
        private pure returns (uint256 next) {
        next = offset;

        uint8 poolCnt;
        poolCnt = abi.decode(input[next:(next+32)], (uint8));
        unchecked {
        
        next += 32;
        }

        hop.pools_ = new Directives.PoolDirective[](poolCnt);
        unchecked {
        // An iterate by 1 loop will run out of gas far before overflowing 256 bits
        for (uint i = 0; i < poolCnt; ++i) {
            next = parsePool(hop.pools_[i], input, next);
        }
        }

        return parseSettle(hop, input, next);
    }

    /* @notice Parses the settlement fields in a hop directive. */
    function parseSettle (Directives.HopDirective memory hop, bytes calldata input, uint256 offset) 
        private pure returns (uint256) {
        (hop.settle_.token_, hop.settle_.limitQty_, hop.settle_.dustThresh_,
            hop.settle_.useSurplus_, hop.improve_.isEnabled_, hop.improve_.useBaseSide_) =
            abi.decode(input[offset:(offset+32*6)], (address, int128, uint128, bool, bool, bool));

        unchecked {
        // Incrementing by 192 will run out of gas far before overflowing 256-bits
        return offset + 32*6;
        }        
    }

    /* @notice Parses an offset bytestream into a single PoolDirective in memory 
               and increments the offset accordingly. */
    function parsePool (Directives.PoolDirective memory pair,
                        bytes calldata input, uint256 offset)
        private pure returns (uint256 next) {
        uint concCnt;
        next = offset;

        (pair.poolIdx_, pair.ambient_.isAdd_, pair.ambient_.rollType_, pair.ambient_.liquidity_,
            concCnt) = abi.decode(input[next:(next+32*5)], (uint256, bool, uint8, uint128, uint8));

        unchecked {
        // Incrementing by 160 will run out of gas far before overflowing 256-bits
        next += 32*5;
        }
        pair.conc_ = new Directives.ConcentratedDirective[](concCnt);

        unchecked {
        // An iterate by 1 loop will run out of gas far before overflowing 256 bits
        for (uint i = 0; i < concCnt; ++i) {
            next = parseConcentrated(pair.conc_[i], input, next);
        }
        }

        (pair.swap_.isBuy_, pair.swap_.inBaseQty_, 
            pair.swap_.rollType_, pair.swap_.qty_, pair.swap_.limitPrice_) =
            abi.decode(input[next:(next+32*5)], (bool, bool, uint8, uint128, uint128));
        unchecked {         // Incrementing by 160 will run out of gas far before overlowing 256 bits
        next += 32*5;
        }

        (pair.chain_.rollExit_, pair.chain_.swapDefer_,
            pair.chain_.offsetSurplus_) = abi.decode(input[next:(next+32*3)], (bool, bool, bool));
        unchecked {        // Incrementing by 96 will run out of gas far before overlowing 256 bits
        next += 32*3;
        }
    }

    /* @notice Parses an offset bytestream into a single ConcentratedDirective in 
     *         memory and increments the offset accordingly. */
    function parseConcentrated (Directives.ConcentratedDirective memory pass,
                                bytes calldata input, uint256 offset)
        private pure returns (uint256 next) {
        (pass.lowTick_, pass.highTick_, pass.isTickRel_, pass.isAdd_,
            pass.rollType_, pass.liquidity_) = abi.decode(input[offset:(offset+32*6)], 
            (int24, int24, bool, bool, uint8, uint128));

        unchecked {         // Incrementing by 196 at a time should never overflow 256 bits
        next = offset + 32*6;
        }
    }
}
