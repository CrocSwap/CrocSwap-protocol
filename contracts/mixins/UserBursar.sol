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
