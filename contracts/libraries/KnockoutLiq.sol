// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

/* @notice Defines structures and functions necessary to track knockout liquidity. 
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
     * @param timestamp_ The block time the position was created (or when liquidity was
     *                   added to the position). */
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
     * @param lowerTick The 24-bit tick index of the lower boundary of the knockout range order
     * @param upperTick The 24-bit tick index of the upper boundary of the knockout range order */
    struct KnockoutPosLoc {
        bool isBid_;
        int24 lowerTick_;
        int24 upperTick_;
    }

    /* @notice Resets all fields on a existing pivot struct. */
    function deletePivot (KnockoutPivot storage pivot) internal {
        pivot.lots_ = 0;
        pivot.pivotTime_ = 0;
        pivot.rangeTicks_ = 0;
    }
    
    /* @notice Encodes a hash key for a given knockout pivot point.
     * @param pool The hash index of the AMM pool.
     * @param isBid If true indicates the knockout pivot is on the bid side.
     * @param tick The tick index of the knockout pivot.
     * @return Unique hash key mapping to the pivot struct. */
    function encodePivotKey (bytes32 pool, bool isBid, int24 tick)
        internal pure returns (bytes32) {
        return keccak256(abi.encode(pool, isBid, tick));
    }

    /* @notice Encodes a hash key for a knockout pivot given a pos location struct. */
    function encodePivotKey (KnockoutPosLoc memory loc, bytes32 pool)
        internal pure returns (bytes32) {
        return encodePivotKey(pool, loc.isBid_, knockoutTick(loc));
    }

    /* @notice Determines which tick side is the pivot point based on whether the pivot
     *         is a bid or ask. */
    function knockoutTick (KnockoutPosLoc memory loc) internal pure returns (int24) {
        return loc.isBid_ ? loc.lowerTick_ : loc.upperTick_;
    }

    function tickRange (KnockoutPosLoc memory loc) internal pure returns (uint16) {
        uint24 range = uint24(loc.upperTick_ - loc.lowerTick_);
        require (range < type(uint16).max);
        return uint16(range);
    }

    /* @notice Encodes a hash key for a knockout position. 
     * @param loc The location of the knockout position
     * @param pool The hash index of the AMM pool.
     * @param owner The claimant of the liquidity position.
     * @param pivotTime The timestamp of when the pivot tranche was created
     * @return Unique hash key to position. */
    function encodePosKey (KnockoutPosLoc memory loc,
                           bytes32 pool, address owner, uint32 pivotTime)
        internal pure returns (bytes32) {
        return keccak256(abi.encode(pool, owner, loc.isBid_,
                                    loc.lowerTick_, loc.upperTick_, pivotTime));
    }
    /* @notice Commits a now-crossed Knockout pivot to the merkle history for that tick
     *         location.
     * @param merkle The Merkle history object. Will be overwrriten by this function.
     * @param pivot The most recent pivot state. Should not call this unless the pivot has
     *              just been knocked out.
     * @param feeMileage The in-range fee mileage at the time of knockout crossing. */
    function commitKnockout (KnockoutMerkle storage merkle,
                             KnockoutPivot memory pivot, uint64 feeMileage) internal {
        merkle.merkleRoot_ = rootLink(merkle, commitEntropySalt());
        merkle.pivotTime_ = pivot.pivotTime_;
        merkle.feeMileage_ = feeMileage;
    }

    /* @notice Returns hard-to-fake entropy at commit time to prevent a long-range 
     *         birthday collission attack.
     *
     * @dev Knockout commits use 160-bit hashes for the Merkle chain. A birthday 
     *      collission attack could be carried with 2^80 SHA256 hashes for an approximate
     *      cost of 10 billion dollars or 1 year of bitcoin mining. (See EIP-3607 for more
     *      discussion.) This mitigates the risk of a long run attack by injecting 160 
     *      bits of entropy from the block hash which can only be fully known at the time
     *      a Merkle root is committed. 
     *
     *      Even if an attacker is the block builder and can manipulate blockhash, they 
     *      can only control as many bits of blockhash entropy as SHA256 hashes they can 
     *      calculate in O(block time). Practically speaking an attacker will not be able
     *      to calculate more than 2^100 hashes at the scale of block times. 
     *      Therefore this salt injects a minimum of 60 bits of uncontrollable entropy, 
     *      and raises the cost of a long-range collision attack to 2^140 hashes, which 
     *      is outright infeasible. */
    function commitEntropySalt() internal view returns (uint160) {
        return uint160(uint256(blockhash(block.number-1)));
    }

    /* @notice Converts the most recent Merkle state to a 160-bit Merkle root hash. */
    function rootLink (KnockoutMerkle memory merkle, uint160 salt)
        private pure returns (uint160) {
        return rootLink(merkle.merkleRoot_, merkle.pivotTime_, merkle.feeMileage_, salt);
    }

    /* @notice Converts the most current Merkle state params to 160-bit Merkle hash.*/
    function rootLink (uint160 root, uint32 pivotTime, uint64 feeMileage, uint160 salt)
        private pure returns (uint160) {
        return rootLink(root, encodeChainLink(pivotTime, feeMileage, salt));
    }

    /* @notice Hashes together the previous Merkle root with the encoded chain step. */
    function rootLink (uint160 root, uint256 chainLink)
        private pure returns (uint160) {
        bytes32 hash = keccak256(abi.encode(root, chainLink));
        return uint160(uint256(hash) >> 96);
    }

    /* @notice Tightly packs the 32-bit pivot time with the 64-bit fee mileage and the salt. */
    function encodeChainLink (uint32 pivotTime, uint64 feeMileage, uint160 salt)
        private pure returns (uint256)  {
        return (uint256(salt) << 96) +
            (uint256(pivotTime) << 64) +
            uint256(feeMileage);
    }

    /* @notice Decodes a tightly packed chain link into the pivot time and fee mileage */
    function decodeChainLink (uint256 entry)
        private pure returns (uint32 pivotTime, uint64 feeMileage)  {
        pivotTime = uint32((entry << 160) >> 224);
        feeMileage = uint64((entry << 192) >> 192);
    }

    /* @notice Verifies a Merkle proof for a previous knockout commitment.
     *
     * @param merkle The current Merkle chain for the pivot tick.
     * @param proofRoot The Merkle root the proof is starting at.
     * @param proof A proof that starts at the point in history the user wants to prove
     *              and includes the encoded 96-bit chain entries (see encodeChainLink())
     *              up to the current Merkle state.
     *
     * @return The 32-bit Knockout tranche pivot time and 64-bit fee mileage at the start of
     *         the proof. */
    function proveHistory (KnockoutMerkle memory merkle, uint160 proofRoot,
                           uint256[] memory proof)
        internal pure returns (uint32, uint64) {
        // If we're only looking at the most recent knockout, it's still stored raw
        // and doesn't need a proof.
        return proof.length == 0 ?
            (merkle.pivotTime_, merkle.feeMileage_) :
            proveSteps(merkle, proofRoot, proof);
    }

    /* @notice Verifies a non-empty Merkle proof. */
    function proveSteps (KnockoutMerkle memory merkle, uint160 proofRoot,
                         uint256[] memory proof)
        private pure returns (uint32, uint64) {
        uint160 incrRoot = proofRoot;
        unchecked {
            // Iterate by 1 loop will run out of gas far before overflowing 256 bits
            for (uint i = 0; i < proof.length; ++i) {
                incrRoot = rootLink(incrRoot, proof[i]);
            }
        }

        require(incrRoot == merkle.merkleRoot_, "KP");
        return decodeChainLink(proof[0]);
    }


    /* @notice Verifies that a given knockout location is valid relative to the curve
     *         price and the pool's current knockout parameters. If not, the call will
     *         revert
     *
     * @param loc The location for the proposed knockout liquidity candidate.
     * @param priceTick The tick index of the curves current price.
     *
     * @param loc The tightly packed knockout parameters related to the pool. The fields
     *            are set in the following order from most to least significant bit:
     *         [8]             [7]            [6][5]          [4][3][2][1]
     *        Unusued      On-Grid Flag      PlaceType         OrderWidth
     *            
     *            The field types are as follows:
     *               OrderWidth - The width of new knockout pivots in ticks represented by
     *                            power of two. 
     *               PlaceType - Restricts where new knockout pivots can be placed 
     *                           relative to curve price. Uses the following codes:
     *                    0 - Disabled. No knockout pivots allowed.
     *                    1 - Knockout bids (asks) must be placed with upper (lower) tick
     *                        below (above) the current curve price.
     *                    2 - Knockout bids (asks) must be placed with lower (upper) tick
     *                        below (above) the current curve price.
     *
     *              On-Grid Flag - If set requires that any new knockout range order can only
     *                             be placed on a tick index that's a multiple of the width. 
     *                             Can be used to restrict density of knockout orders, beyond 
     *                             the normal pool tick size. */
    function assertValidPos (KnockoutPosLoc memory loc, int24 priceTick, 
                             uint8 knockoutBits) internal pure {
        (bool enabled, uint8 width, bool inside, bool onGrid) =
            unpackBits(knockoutBits);

        require(enabled && gridOkay(loc, width, onGrid) &&
                spreadOkay(loc, priceTick, inside), "KV");
    }

    /* @notice Evaluates whether the placement and width of a knockout pivot candidate
     *         conforms to the grid parameters. */
    function gridOkay (KnockoutPosLoc memory loc, uint8 widthBits, bool mustBeOnGrid)
        private pure returns (bool) {
        uint24 width = uint24(loc.upperTick_ - loc.lowerTick_);
        bool rightWidth = width == uint24(1) << widthBits;

        int24 tick = loc.upperTick_;
        uint24 absTick = tick > 0 ? uint24(tick) : uint24(-tick);
        bool onGrid = (!mustBeOnGrid) || (absTick >> widthBits) << widthBits == absTick;

        return rightWidth && onGrid;
    }

    /* @notice Evaluates whether the placement of a knockout pivot candidates conforms
     *         to the parameters relative to the curve's current price tick. */
    function spreadOkay (KnockoutPosLoc memory loc, int24 priceTick,
                         bool inside) internal pure returns (bool) {
        // Checks to see whether the range order is placed directionally correct relative
        // to the current tick price. If inside is true, then the range order can be placed
        // with the curve price inside the range. 
        // Otherwise bids must have the entire range below the curve price, and asks must
        // have the entire range above the curve price.
        if (loc.isBid_) {
            int24 refTick = inside ? loc.lowerTick_ : loc.upperTick_;
            return refTick < priceTick;
        } else {
            int24 refTick = inside ? loc.upperTick_ : loc.lowerTick_;
            return refTick >= priceTick;
        }
    }

    /* @notice Decodes the tightly packed bits in pool knockout parameters.
     * @return enabled True if new knockout pivots are enabled at all.
     * @return widthBits The width of new knockout pivots in ticks to the power of two.
     * @return inside  True if knockout range order can be minted with the current curve
     *                 price inside the tick range. If false, knockout range orders can
     *                 only be minted with the full range is outside the current curve 
     *                 price.
     * @return onGrid True if new knockout range orders are restricted to ticks that
     *                are multiples of the width size. */
    function unpackBits (uint8 knockoutBits) private pure returns
        (bool enabled, uint8 widthBits, bool inside, bool onGrid) {
        widthBits = uint8(knockoutBits & 0x0F);
        uint8 flagBits = uint8(knockoutBits & 0x30) >> 4;

        enabled = flagBits > 0;
        inside = flagBits >= 2;

        onGrid = knockoutBits & 0x40 > 0;
    }
}
