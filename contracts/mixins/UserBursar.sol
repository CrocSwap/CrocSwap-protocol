// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./StorageLayout.sol";
import "hardhat/console.sol";

contract UserBursar is StorageLayout {

    function resetNonce (bytes32 nonceDim, uint32 nonce) internal {
        UserBalance storage bal = userBals_[balanceKey(lockHolder_, nonceDim)];
        bal.nonce_ = nonce;
    }

    function casNonce (bytes32 nonceDim, uint32 nonce) internal {
        UserBalance storage bal = userBals_[balanceKey(lockHolder_, nonceDim)];
        require(bal.nonce_ == nonce);
        bal.nonce_++;
    }

    function tipRelayer (bytes memory tipCmd) internal {
        if (tipCmd.length > 0) {
            (bytes32 innerKey, uint128 tip, address recv) =
                abi.decode(tipCmd, (bytes32, uint128, address));

            if (recv == address(256)) {
                recv = msg.sender;
            } else if (recv == address(512)) {
                recv = tx.origin;
            } else if (recv == address(1024)) {
                recv = block.coinbase;
            }
            
            bytes32 fromKey = balanceKey(lockHolder_, innerKey);
            bytes32 toKey = balanceKey(recv, innerKey);
            require(userBals_[fromKey].surplusCollateral_ >= tip);
            userBals_[fromKey].surplusCollateral_ -= tip;
            userBals_[toKey].surplusCollateral_ += tip;
        }
    }

    function balanceKey (address user, address token,
                         uint256 userDim, uint256 tokenDim) pure
        internal returns (bytes32) {
        bytes32 innerKey = keccak256(abi.encode(userDim, token, tokenDim));
        return balanceKey(user, innerKey);
    }

    function balanceKey (address user, bytes32 innerKey) pure
        internal returns (bytes32) {
        return keccak256(abi.encode(user, innerKey));
    }

    function balanceKey (address user, address token) pure
        internal returns (bytes32) {
        return balanceKey(user, token, 0, 0);
    }

    function balanceKey (address token) view
        internal returns (bytes32) {
        return balanceKey(lockHolder_, token, 0, 0);
    }
}
