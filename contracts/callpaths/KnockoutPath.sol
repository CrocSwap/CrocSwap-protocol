// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/ProtocolCmd.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/TradeMatcher.sol';

/* @title Knockout Flag Proxy
 * @notice This is an internal library callpath that's called when a swap triggers a 
 *         knockout liquidity event by crossing a given bump point. 
 * @dev It exists as a separate callpath from the normal swap() code path because crossing
 *      a knockout pivot is a relatively rare event and the code won't fully fit into the
 *      hot path contract. */
contract KnockoutFlagPath is KnockoutCounter {

    /* @notice Called when a knockout pivot is crossed.
     *
     * @dev Since this contract is a proxy sidecar, this method needs to be marked
     *      payable even though it doesn't directly handle msg.value. Otherwise it will
     *      fail on any. Because of this, this contract should never be used in any other
     *      context besides a proxy sidecar to CrocSwapDex.
     *
     * @param pool The hash index of the pool.
     * @param tick The 24-bit index of the tick where the knockout pivot exists.
     * @param isBuy If true indicates that the swap direction is a buy.
     * @param feeGlobal The global fee odometer for 1 hypothetical unit of liquidity fully
     *                  in range since the inception of the pool.
     *
     * @return Returns the net additional amount the curve liquidity should be adjusted by.
     *         Currently this always returns zero, because a liquidity knockout will never change
     *         active liquidity on a curve. But by leaving this function return type it leaves open
     *         the possibility in future upgrades of alternative types of dynamic liquidity that 
     *         do change active curve liquidity when crossed */
    function crossCurveFlag (bytes32 pool, int24 tick, bool isBuy, uint64 feeGlobal)
        public payable returns (int128) {
        // If swap is a sell, then implies we're crossing a resting bid and vice versa
        bool bidCross = !isBuy;
        crossKnockout(pool, bidCross, tick, feeGlobal);
        return 0;
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.FLAG_CROSS_PROXY_IDX;
    }

}

/* @title Knockout Liquidity Proxy
 * @notice This callpath is a single point of entry for all LP operations related to 
 *         resting knockout liquidity. Including minting, burning, claiming, and 
 *         recovering a user's posted knockout liquidity. */
contract KnockoutLiqPath is TradeMatcher, SettleLayer {
    using SafeCast for uint128;
    using TickMath for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;
    using KnockoutLiq for KnockoutLiq.KnockoutPosLoc;

    function userCmd (bytes calldata cmd) public payable returns
        (int128 baseFlow, int128 quoteFlow) {
        
        (uint8 code, address base, address quote, uint256 poolIdx,
         int24 bidTick, int24 askTick, bool isBid, uint8 reserveFlags,
         bytes memory args) = abi.decode
            (cmd, (uint8, address, address, uint256, int24, int24, bool, uint8, bytes));

        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);

        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = bidTick;
        loc.upperTick_ = askTick;

        return overCurve(code, base, quote, pool, curve, loc, reserveFlags, args);
    }

    /* @notice Converts a call code, pool address, curvedata and knockout position 
     *         location to execute a knockout LP command. */
    function overCurve (uint8 code, address base, address quote,
                        PoolSpecs.PoolCursor memory pool,
                        CurveMath.CurveState memory curve,
                        KnockoutLiq.KnockoutPosLoc memory loc,
                        uint8 reserveFlags, bytes memory args)
        private returns (int128 baseFlow, int128 quoteFlow) {        
        if (code == UserCmd.MINT_KNOCKOUT) {
            (baseFlow, quoteFlow) = mintCmd(base, quote, pool, curve, loc, args);
        } else if (code == UserCmd.BURN_KNOCKOUT) {
            (baseFlow, quoteFlow) = burnCmd(base, quote, pool, curve, loc, args);
        } else if (code == UserCmd.CLAIM_KNOCKOUT) {
            (baseFlow, quoteFlow) = claimCmd(pool.hash_, curve, loc, args);
        } else if (code == UserCmd.RECOVER_KNOCKOUT) {
            (baseFlow, quoteFlow) = recoverCmd(pool.hash_, loc, args);
        } else {
            revert("Invalid command");
        }

        settleFlows(base, quote, baseFlow, quoteFlow, reserveFlags);
    }

    /* @notice Mints new passive knockout liquidity. */
    function mintCmd (address base, address quote, PoolSpecs.PoolCursor memory pool,
                      CurveMath.CurveState memory curve,
                      KnockoutLiq.KnockoutPosLoc memory loc,
                      bytes memory args) private returns
        (int128 baseFlow, int128 quoteFlow) {
        (uint128 qty, bool insideMid) = abi.decode(args, (uint128,bool));
        
        int24 priceTick = curve.priceRoot_.getTickAtSqrtRatio();
        require(loc.spreadOkay(priceTick, insideMid), "KL");

        uint128 liq = Chaining.sizeConcLiq(qty, true, curve.priceRoot_,
                                           loc.lowerTick_, loc.upperTick_, loc.isBid_);
        verifyPermitMint(pool, base, quote, loc.lowerTick_, loc.upperTick_, liq);

        (baseFlow, quoteFlow) = mintKnockout(curve, priceTick, loc, liq, pool.hash_,
                                             pool.head_.knockoutBits_);
        commitCurve(pool.hash_, curve);
        (baseFlow, quoteFlow) = Chaining.pinFlow(baseFlow, quoteFlow, qty, loc.isBid_);
    }

    /* @notice Burns previously minted knockout liquidity, but only applicable to the
     *         extent that the position hasn't been fully knocked out. */
    function burnCmd (address base, address quote, PoolSpecs.PoolCursor memory pool,
                      CurveMath.CurveState memory curve,
                      KnockoutLiq.KnockoutPosLoc memory loc,
                      bytes memory args) private returns
        (int128 baseFlow, int128 quoteFlow) {
        (uint128 qty, bool inLiqQty, bool insideMid) =
            abi.decode(args, (uint128,bool,bool));

        int24 priceTick = curve.priceRoot_.getTickAtSqrtRatio();
        require(loc.spreadOkay(priceTick, insideMid), "KL");

        uint128 liq = inLiqQty ? qty :
            Chaining.sizeConcLiq(qty, false, curve.priceRoot_,
                                 loc.lowerTick_, loc.upperTick_, loc.isBid_);        
        verifyPermitBurn(pool, base, quote, loc.lowerTick_, loc.upperTick_, liq);

        (baseFlow, quoteFlow) = burnKnockout(curve, priceTick, loc, liq, pool.hash_);
        commitCurve(pool.hash_, curve);
    }

    /* @notice Claims a knockout liquidity position that has been fully knocked out, 
     *         including the earned liquidity fees. 
     * @param pool The pool index.
     * @param curve The current state of the AMM curve.
     * @param loc The location the knockout liquidity is being claimed from
     * @params args Corresponds to the Merkle proof for the knockout point ABI encoded
     *              into two components:
     *                 root - The current root of the Merkle chain for the pivot location
     *                 proof - The accumulated links in the Merkle chain going back to the
     *                         point the user's pivot was knocked out. */
    function claimCmd (bytes32 pool, CurveMath.CurveState memory curve,
                       KnockoutLiq.KnockoutPosLoc memory loc,
                       bytes memory args) private returns
        (int128 baseFlow, int128 quoteFlow) {
        (uint160 root, uint256[] memory proof) = abi.decode(args, (uint160,uint256[]));
        (baseFlow, quoteFlow) = claimKnockout(curve, loc, root, proof, pool);
        commitCurve(pool, curve);
    }
    
    /* @notice Like claim, but ignores the Merkle proof (either because the user wants to
     *         avoid the gas cost or isn't bothered to recover the history). This results
     *         in the earned liquidity fees being forfeit, but the user still recovers the
     *         full principal of the underlying order.
     *
     * @param pool The pool index.
     * @param loc The location the knockout liquidity is being claimed from
     * @params args Corresponds to a flat ABI encoding of the pivot's origin in block 
     *              time. 
     * @return baseFlow The total base token flow from the pool to the user
     * @return quoteFlow The total base token flow from the pool to the user */
    function recoverCmd (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                         bytes memory args) private returns
        (int128 baseFlow, int128 quoteFlow) {
        (uint32 pivotTime) = abi.decode(args, (uint32));
        (baseFlow, quoteFlow) = recoverKnockout(loc, pivotTime, pool);
        // No need to commit curve because recover doesn't touch curve.
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.KNOCKOUT_LP_PROXY_IDX;
    }

}
