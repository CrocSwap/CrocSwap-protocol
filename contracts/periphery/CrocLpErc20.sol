// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/PoolSpecs.sol";
import "../interfaces/ICrocLpConduit.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";

contract CrocLpErc20 is ERC20, ICrocLpConduit {

    bytes32 public immutable poolHash;
    address public immutable baseToken;
    address public immutable quoteToken;
    uint256 public immutable poolType;
    
    constructor (address base, address quote, uint256 poolIdx)
        ERC20 ("Croc Ambient LP ERC20 Token", "LP-CrocAmb", 18) {

        // CrocSwap protocol uses 0x0 for native ETH, so it's possible that base
        // token could be 0x0, which means the pair is against native ETH. quote
        // will never be 0x0 because native ETH will always be the base side of
        // the pair.
        require(quote != address(0) && base != quote && quote > base, "Invalid Token Pair");

        baseToken = base;
        quoteToken = quote;
        poolType = poolIdx;
        poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
    }
    
    function depositCrocLiq (address sender, bytes32 pool,
                             int24 lowerTick, int24 upperTick, uint128 seeds,
                             uint72) public override returns (bool) {
        require(pool == poolHash, "Wrong pool");
        require(lowerTick == 0 && upperTick == 0, "Non-Ambient LP Deposit");
        _mint(sender, seeds);
        return true;
    }

    function withdrawCrocLiq (address sender, bytes32 pool,
                              int24 lowerTick, int24 upperTick, uint128 seeds,
                              uint72) public override returns (bool) {
        require(pool == poolHash, "Wrong pool");
        require(lowerTick == 0 && upperTick == 0, "Non-Ambient LP Deposit");
        _burn(sender, seeds);
        return true;
    }

}
