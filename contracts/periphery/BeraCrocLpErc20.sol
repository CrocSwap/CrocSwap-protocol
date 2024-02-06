// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/BGTEligibleERC20.sol";
import "../libraries/PoolSpecs.sol";
import "../interfaces/ICrocLpConduit.sol";

contract BeraCrocLpErc20 is ICrocLpConduit, BGTEligibleERC20 {

    address public factory;
    bytes32 public poolHash;
    address public baseToken;
    address public quoteToken;
    uint256 public poolType;
    
    constructor () BGTEligibleERC20 ("Bera Croc LP ERC20 Token", "LP-BeraCroc") {
        factory = msg.sender;
    }
    
    function depositCrocLiq (address sender, bytes32 pool,
                             int24 lowerTick, int24 upperTick, uint128 seeds,
                             uint64) public override returns (bool) {
        require(pool == poolHash, "Wrong pool");
        require(lowerTick == 0 && upperTick == 0, "Non-BeraCroc LP Deposit");
        _mint(sender, seeds);
        return true;
    }

    function withdrawCrocLiq (address sender, bytes32 pool,
                              int24 lowerTick, int24 upperTick, uint128 seeds,
                              uint64) public override returns (bool) {
        require(pool == poolHash, "Wrong pool");
        require(lowerTick == 0 && upperTick == 0, "Non-BeraCroc LP Deposit");
        _burn(sender, seeds);
        return true;
    }

        // called once by the factory at time of deployment
    function initialize(address _base, address _quote, uint256 _idx) external {
        // CrocSwap protocol uses 0x0 for native ETH, so it's possible that base
        // token could be 0x0, which means the pair is against native ETH. quote
        // will never be 0x0 because native ETH will always be the base side of
        // the pair.
        require(_quote > _base, "Invalid Token Pair");
        require(msg.sender == factory, 'A'); // sufficient check
        baseToken = _base;
        quoteToken = _quote;
        poolType = _idx;
        poolHash = PoolSpecs.encodeKey(_base, _quote, _idx);
    }
}
