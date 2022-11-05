// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/ProtocolAccount.sol';
import '../mixins/StorageLayout.sol';

import "hardhat/console.sol";

/* @title Long path callpath sidecar.
 * @notice Defines a proxy sidecar contract that's used to move code outside the 
 *         main contract to avoid Ethereum's contract code size limit. Contains
 *         top-level logic for parsing and executing arbitrarily long compound orders.
 * 
 * @dev    This exists as a standalone contract but will only ever contain proxy code,
 *         not state. As such it should never be called directly or externally, and should
 *         only be invoked with DELEGATECALL so that it operates on the contract state
 *         within the primary CrocSwap contract. */
contract LongPath is MarketSequencer, SettleLayer, ProtocolAccount {
    
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    /* @notice Executes the user-defined compound order, constitutiin an arbitrary
     *         combination of mints, burns and swaps across an arbitrary set of pools
     *         across an arbitrary set of pairs.
     *
     * @input  The encoded byte data associated with the user's order directive. See
     *         Encoding.sol and Directives.sol library for information on how to encode
     *         order directives as byte data. */
    function userCmd (bytes calldata input) public payable {
        Directives.OrderDirective memory order = OrderEncoding.decodeOrder(input);
        Directives.SettlementChannel memory settleChannel = order.open_;
        TokenFlow.PairSeq memory pairs;
        Chaining.ExecCntx memory cntx;
        int128[] memory flows = new int128[](order.hops_.length); 

        for (uint i = 0; i < order.hops_.length; ++i) {
            pairs.nextHop(settleChannel.token_, order.hops_[i].settle_.token_);
            cntx.improve_ = queryPriceImprove(order.hops_[i].improve_,
                                              pairs.baseToken_, pairs.quoteToken_);

            for (uint j = 0; j < order.hops_[i].pools_.length; ++j) {
                Directives.PoolDirective memory dir = order.hops_[i].pools_[j];
                cntx.pool_ = queryPool(pairs.baseToken_, pairs.quoteToken_,
                                       dir.poolIdx_);

                verifyPermit(cntx.pool_, pairs.baseToken_, pairs.quoteToken_,
                             dir.ambient_, dir.swap_, dir.conc_);
                cntx.roll_ = targetRoll(dir.chain_, pairs);

                tradeOverPool(pairs.flow_, dir, cntx);
            }

            accumProtocolFees(pairs); // Make sure to call before clipping              
            flows[i] = pairs.clipFlow();
            settleChannel = order.hops_[i].settle_;
        }

        settleFlows(order, flows, pairs.closeFlow());
    }

    function settleFlows (Directives.OrderDirective memory order, int128[] memory flows, int128 closeFlow) internal {
        Directives.SettlementChannel memory settleChannel = order.open_;
        int128 ethFlow = 0;

        for (uint i = 0; i < order.hops_.length; ++i) {
            ethFlow += settleLeg(flows[i], settleChannel);
            settleChannel = order.hops_[i].settle_;
        }
        settleFinal(closeFlow, settleChannel, ethFlow);
    }

    /* @notice Sets the roll target parameters based on the user's directive and the
     *         previously accumulated flow on the pair.
     * @param flags The user specified chaining directive for this pair.
     * @param pair The hitherto accumulated flows on the pair. 
     * @return roll The rolling back fill context to be used in any back-fill quantity. */
    function targetRoll (Directives.ChainingFlags memory flags,
                         TokenFlow.PairSeq memory pair) view private
        returns (Chaining.RollTarget memory roll) {
        if (flags.rollExit_) {
            roll.inBaseQty_ = !pair.isBaseFront_;
            roll.prePairBal_ = 0;
        } else {
            roll.inBaseQty_ = pair.isBaseFront_;
            roll.prePairBal_ = pair.legFlow_;
        }

        if (flags.offsetSurplus_) {
            address token = flags.rollExit_ ?
                pair.backToken() : pair.frontToken();
            roll.prePairBal_ -= querySurplus(lockHolder_, token).toInt128Sign();
        }
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public payable returns (bool) {
        return slot == CrocSlots.LONG_PROXY_IDX;
    }
}
