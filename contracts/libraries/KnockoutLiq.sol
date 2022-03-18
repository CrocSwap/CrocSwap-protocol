// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.4;

import "hardhat/console.sol";

/* @notice Defines structures and functions necessary track to knockout liquidity. 
 *         Knockout liquidity works like standard concentrated range liquidity, *except*
 *         the position becomes inactive once the price of the curve breaches a certain
 *         tick pivot. In that sense knockout liquidity behaves like a "non-reversible
 *         limit order" seen in the traditional limit order book. */
library KnockoutLiq {

    /* @notice Defines a currently active knockout liquidity bump point that exists on
     *         a specific AMM curve at a specific tick/direction.
     *
     * @param lots_ The total number of lots active in the knockout pivot. Note that this
     *              number should always be included in the corresponding LevelBook lots.
     *
     * @param pivotTime_ The block time the first liquidity was created on the pivot 
     *                   point. This resets every time the knockout is crossed, and is
     *                   therefore used to distinguish tranches of liquidity that were
     *                   added at the same tick but with different knockout times.
     *
     * @param rangeTicks_ The number of ticks wide the range order for the knockout 
     *                    tranche. Unlike traditional concentrated liquidity, all knockout
     *                    liquidity in the same tranche must have the same width. This is
     *                    used to determine what counter-side tick to decrement liquidity
     *                    on when knocking out an order. */
    struct KnockoutPivot {
        uint96 lots_;
        uint32 pivotTime_;
        uint16 rangeTicks_;
    }

    /* @notice Stores a cryptographically provable history of previous knockout events
     *         at a given tick/direction. 
     *
     * @dev To avoid unnecessary SSTORES, we Merkle at the same location instead of 
     *      growing an array. This allows users trying to claim a previously knockout 
     *      position to post a Merkle proof. (And since the underlying liquidity is 
     *      computable even without this proof, the only loss for those that don't are the
     *      accumulated fees while the range liquidity was active.)
     *
     * @param merkleRoot_ The Merkle root of the prior entry in the chain.
     * @param pivotTime_ The pivot time of the last tranche to be knocked out at this tick
     * @param feeMileage_ The fee mileage for the range at the time the tranche was 
     *                    knocked out. */
    struct KnockoutMerkle {
        uint160 merkleRoot_;
        uint32 pivotTime_;
        uint64 feeMileage_;
    }

    /* @notice Represents a single user's knockout liquidity position.
     * @param lots_ The total number of liquidity lots in the position. 
     * @param feeMileage_ The in-range cumulative fee mileage at the time the position was
     *                    created.
     * @param timetamp_ The block time the position was created (or when liquidity was
     *                  added to the position). */
    struct KnockoutPos {
        uint96 lots_;
        uint64 feeMileage_;
        uint32 timestamp_;
    }

    /* @notice Represents the location of a knockout position inside a given AMM curve.
     *         Necessary to recover a user's position in the storage.
     *
     * @param isBid_ If true, indicates that the knockout is on the bid side, i.e. will
     *                knockout when price falls below the tick.
     * @param tick_ The 24-bit tick index the knockout pivot is placed at.
     * @param rangeTicks_ The number of ticks wide the corresponding range order is.
     * @param pivotTime_ The pivot time associated with the knockout tranche when the
     *                    order was placed. */
    struct KnockoutPosLoc {
        bool isBid_;
        int24 tick_;
        uint24 rangeTicks_;
        uint32 pivotTime_;
    }

    function deletePivot (KnockoutPivot storage pivot) internal {
        pivot.lots_ = 0;
        pivot.pivotTime_ = 0;
        pivot.rangeTicks_ = 0;
    }
    
    /* @notice Encodes a hash key for a given knockout pivot point.
     * @param pool The hash index of the AMM pool.
     * @param isBid If true indicates the knockout pivot is on the bid side.
     * @param tick The tick index of the knockout pivot. */
    function encodePivotKey (bytes32 pool, bool isBid, int24 tick)
        internal pure returns (bytes32) {
        return keccak256(abi.encode(pool, isBid, tick));
    }

    /* @notice Encodes a hash key for a knockout position. 
     * @param loc The location of the knockout position relative to the pool/user.
     * @param pool The hash index of the AMM pool.
     * @param owner The claimint of the liquidity position. */
    function encodePosKey (KnockoutPosLoc memory loc, bytes32 pool, bytes32 owner)
        internal pure returns (bytes32) {
        return keccak256(abi.encode(pool, owner,
                                    loc.isBid_, loc.tick_, loc.rangeTicks_,
                                    loc.pivotTime_));
    }
    
    /* @notice Commits a now-crossed Knockout pivot to the merkle history for that tick
     *         location.
     * @param merkle The Merkle history object. Will be overwrriten by this function.
     * @param pivot The most recent pivot state. Should not call this unless the pivot has
     *              just been knocked out.
     * @param feeMileage The in-range fee mileage at the time of knockout crossing. */
    function commitKnockout (KnockoutMerkle storage merkle,
                             KnockoutPivot memory pivot, uint64 feeMileage) internal {
        merkle.merkleRoot_ = rootLink(merkle);
        merkle.pivotTime_ = pivot.pivotTime_;
        merkle.feeMileage_ = feeMileage;
    }

    /* @notice Converts the most recent Merkle state to a 160-bit Merkle root hash. */
    function rootLink (KnockoutMerkle memory merkle) private pure returns (uint160) {
        return rootLink(merkle.merkleRoot_, merkle.pivotTime_, merkle.feeMileage_);
    }

    /* @notice Converts the most current Merkle state params to 160-bit Merkle hash.*/
    function rootLink (uint160 root, uint32 pivotTime, uint64 feeMileage)
        private pure returns (uint160) {
        return rootLink(root, encodeChainLink(pivotTime, feeMileage));
    }

    /* @notice Hashes together the previous Merkle root with the encoded chain step. */
    function rootLink (uint160 root, uint96 chainLink)
        private pure returns (uint160) {
        bytes32 hash = keccak256(abi.encode(root, chainLink));
        return uint160(uint256(hash) >> 96);
    }

    /* @notice Tightly packs the 32-bit pivot time with the 64-bit fee mileage. */
    function encodeChainLink (uint32 pivotTime, uint64 feeMileage)
        private pure returns (uint96)  {
        return (uint96(pivotTime) << 64) + uint96(feeMileage);
    }

    /* @notice Decodes a tightly packed chain link into the pivot time and fee mileage */
    function decodeChainLink (uint96 entry)
        private pure returns (uint32 pivotTime, uint64 feeMileage)  {
        pivotTime = uint32(entry >> 64);
        feeMileage = uint64((entry << 32) >> 32);
    }

    /* @notice Verifies a Merkle proof for a previous knockout commitment.
     *
     * @param merkle The current Merkle chain for the pivot tick.
     * @param proofRoot The Merkle root the proof is starting at.
     * @param proof A proof that starts at the point in history the user wants to prove
     *              and includes the encoded 96-bit chain entries (see encodeChainLink())
     *              up to the current Merkle state.
     *
     * @return The 32-bit Knockout tranche pivot and 64-bit fee mileage at the start of
     *         the proof. */
    function proveHistory (KnockoutMerkle memory merkle, uint160 proofRoot,
                            uint96[] calldata proof)
        internal pure returns (uint32, uint64) {
        // If we're only looking at the most recent knockout, it's still stored raw
        // and doesn't need a proof.
        return proof.length == 0 ?
            (merkle.pivotTime_, merkle.feeMileage_) :
            proveSteps(merkle, proofRoot, proof);
    }

    /* @notice Verifies a non-empty Merkle proof. */
    function proveSteps (KnockoutMerkle memory merkle, uint160 proofRoot,
                         uint96[] calldata proof)
        private pure returns (uint32, uint64) {
        uint160 incrRoot = proofRoot;
        unchecked {
            for (uint i = 0; i < proof.length; ++i) {
                incrRoot = rootLink(incrRoot, proof[i]);
            }
        }

        require(incrRoot == merkle.merkleRoot_, "KP");
        return decodeChainLink(proof[0]);
    }
}
