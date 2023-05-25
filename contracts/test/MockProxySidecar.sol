// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../interfaces/ICrocCondOracle.sol";

contract MockProxySidecar {

    uint16 public proxySlot_;
    address public proxyDex_;

    function setRole (uint16 slot, address proxyDex) public {
        proxySlot_ = slot;
        proxyDex_ = proxyDex;
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address dex, uint16 slot) public payable returns (bool) {
        return (proxyDex_ == address(0)) ||
            (proxySlot_ == slot && proxyDex_ == dex);
    }
}

