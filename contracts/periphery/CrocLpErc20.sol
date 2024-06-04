// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/BaseERC20.sol";
import "../libraries/PoolSpecs.sol";
import "../interfaces/ICrocLpConduit.sol";
import "../interfaces/IContractWithName.sol";

contract CrocLpErc20 is ERC20, ICrocLpConduit {

    address public immutable factory;
    bytes32 public poolHash;
    address public baseToken;
    address public quoteToken;
    uint256 public poolType;
    
    constructor () ERC20 ("LP-Bex", 18) {
        factory = msg.sender;
    }
    
    function depositCrocLiq (address sender, bytes32 pool,
                             int24 lowerTick, int24 upperTick, uint128 seeds,
                             uint72) public override returns (bool) {
        require(pool == poolHash, "Wrong pool");
        require(lowerTick == 0 && upperTick == 0, "Non-Ambient LP Deposit");
        require(msg.sender == factory, 'A'); // sufficient check
        _mint(sender, seeds);
        return true;
    }

    function withdrawCrocLiq (address sender, bytes32 pool,
                              int24 lowerTick, int24 upperTick, uint128 seeds,
                              uint72) public override returns (bool) {
        require(pool == poolHash, "Wrong pool");
        require(lowerTick == 0 && upperTick == 0, "Non-Ambient LP Deposit");
        require(msg.sender == factory, 'A'); // sufficient check
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
        string memory tokenName = name;

        try IContractWithName(_base).symbol() returns (string memory baseName) {
            try IContractWithName(_quote).symbol() returns (string memory quoteName) {
                tokenName = string(abi.encodePacked(baseName, "-", quoteName, "-LP"));
            } catch {
                // Empty catch block
            }
        } catch {
            // Empty catch block
        }

        setup(string(abi.encodePacked(_base, "-", _quote, "-LP")), tokenName);
        baseToken = _base;
        quoteToken = _quote;
        poolType = _idx;
        poolHash = PoolSpecs.encodeKey(_base, _quote, _idx);
    }
}
