// SPDX-License-Identifier: Unlicensed

pragma solidity ^0.8.4;

import '../interfaces/IERC20Minimal.sol';

contract CrocFacuet {

    struct Payout {
        uint256 walletPay_;
        uint256 exchPay_;
    }

    mapping(address => Payout) public payouts_;
    address public admin_;
    bool public locked_;

    constructor (address admin) {
        admin_ = admin;
    }

    function changeAdmin (address admin) adminOnly public {
        admin_ = admin;
    }

    function setPayout (address recv, address[] calldata tokens) holdLock public {
        for (uint i = 0; i < tokens.length; ++i) {
            Payout memory payout = payouts_[tokens[i]];

            if (payout.walletPay_ > 0) {
                if (tokens[i] == address(0x0)) {
                    (bool success, ) = recv.call{value: payout.walletPay_}("");
                    require(success, "Ethereum transfer failed");
                } else {
                    IERC20Minimal(tokens[i]).transfer(recv, payout.walletPay_);
                }
            }
        }
    }

    modifier adminOnly() {
        require(msg.sender == admin_, "Admin Only");
        _;
    }

    modifier holdLock() {
        require(locked_ == false, "Reentrant");
        locked_ = true;
        _;
        locked_ = false;
    }
}
