// SPDX-License-Identifier: MIT
//
// Copyright (C) 2023, Berachain Foundation. All rights reserved.
// Use of this software is govered by the Business Source License included
// in the LICENSE file of this repository and at www.mariadb.com/bsl11.
//
// ANY USE OF THE LICENSED WORK IN VIOLATION OF THIS LICENSE WILL AUTOMATICALLY
// TERMINATE YOUR RIGHTS UNDER THIS LICENSE FOR THE CURRENT AND ALL OTHER
// VERSIONS OF THE LICENSED WORK.
//
// THIS LICENSE DOES NOT GRANT YOU ANY RIGHT IN ANY TRADEMARK OR LOGO OF
// LICENSOR OR ITS AFFILIATES (PROVIDED THAT YOU MAY USE A TRADEMARK OR LOGO OF
// LICENSOR AS EXPRESSLY REQUIRED BY THIS LICENSE).
//
// TO THE EXTENT PERMITTED BY APPLICABLE LAW, THE LICENSED WORK IS PROVIDED ON
// AN “AS IS” BASIS. LICENSOR HEREBY DISCLAIMS ALL WARRANTIES AND CONDITIONS,
// EXPRESS OR IMPLIED, INCLUDING (WITHOUT LIMITATION) WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND
// TITLE.

pragma solidity >=0.8.10;

import { IRewardsModule } from "../interfaces/IRewardsModule.sol";
import { Cosmos } from "./CosmosTypes.sol";
import { ERC20 } from "solady/src/tokens/ERC20.sol";
import { FixedPointMathLib } from "solady/src/utils/FixedPointMathLib.sol";

contract BGTEligibleERC20 is ERC20 {
    /*//////////////////////////////////////////////////////////////
                            ERC20 STORAGE
    //////////////////////////////////////////////////////////////*/
    string private _name;
    string private _symbol;

    /*//////////////////////////////////////////////////////////////
                            REWARDS STORAGE
    //////////////////////////////////////////////////////////////*/
    IRewardsModule private immutable rewardsModule = IRewardsModule(address(0x55684e2cA2bace0aDc512C1AFF880b15b8eA7214));

    struct User {
        uint256 accBGT; // (1e18) How much BGT rewards the user has accrued.
        uint256 debtBGT; // (1e18) BGT reward debt.
    }

    mapping(address => User) private users; // all users accruing BGT
    uint256 private lastAccruedBGT;
    uint256 private accBGTPerShare;
    uint256 private constant PRECISION = 1e18;
    mapping(address => address) private authorizedSpender;

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    /*//////////////////////////////////////////////////////////////
                            ERC20 LOGIC
    //////////////////////////////////////////////////////////////*/

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        updateGlobalBGT();
        updateUserBGT(msg.sender, amount, false);
        updateUserBGT(to, amount, true);
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        updateGlobalBGT();
        updateUserBGT(from, amount, false);
        updateUserBGT(to, amount, true);
        return super.transferFrom(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal virtual override {
        updateGlobalBGT();
        updateUserBGT(to, amount, true);
        super._mint(to, amount);
    }

    function _burn(address from, uint256 amount) internal virtual override {
        updateGlobalBGT();
        updateUserBGT(from, amount, false);
        super._burn(from, amount);
    }

    /*//////////////////////////////////////////////////////////////
                            ERC20 METADATA
    //////////////////////////////////////////////////////////////*/

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    /*//////////////////////////////////////////////////////////////
                            REWARDS LOGIC
    //////////////////////////////////////////////////////////////*/

    // updates the BGT available to the vault contract
    function updateGlobalBGT() private {
        (uint256 availableBGT, uint256 pendingBGT) = getPendingBGT();
        lastAccruedBGT = availableBGT;
        uint256 supply = totalSupply();
        if (supply > 0) {
            accBGTPerShare += (pendingBGT * PRECISION) / supply;
        }
    }

    // updates the BGT accrued and debt for receiver
    function updateUserBGT(address receiver, uint256 sharesDelta, bool isMint) private {
        User storage user = users[receiver];
        uint256 userShares = balanceOf(receiver);

        // cache storage reads
        uint256 debtBGT = user.debtBGT;
        uint256 _accBGTPerShare = accBGTPerShare;
        if (userShares > 0 && debtBGT > 0) {
            // set aside the receiver's accrued BGT
            user.accBGT += ((userShares * _accBGTPerShare) / PRECISION) - debtBGT;
        }
        uint256 userSharesAfter = isMint ? userShares + sharesDelta : userShares - sharesDelta;
        user.debtBGT = (userSharesAfter * _accBGTPerShare) / PRECISION;
    }

    // returns how much BGT has accrued to the vault contract since last measured
    function getPendingBGT() private view returns (uint256 availableBGT, uint256 pendingBGT) {
        // TODO: Re-enable this when rewards are done
        return (0, 0);
        // // assuming there is only 1 reward returned and its denom is "abgt".
        // Cosmos.Coin[] memory rewards = rewardsModule.getOutstandingRewards(address(this));
        // if (rewards.length != 1) {
        //     return (0, 0);
        // }
        // availableBGT = rewards[0].amount;
        // pendingBGT = FixedPointMathLib.zeroFloorSub(availableBGT, lastAccruedBGT);
    }

    function previewAccruedBGT(address user) external view returns (uint256) {
        return 0;
        // uint256 supply = totalSupply();
        // if (supply == 0) {
        //     return 0;
        // }
        // (, uint256 pendingBGT) = getPendingBGT();
        // uint256 _accBGTPerShare = accBGTPerShare + (pendingBGT * PRECISION) / supply;
        // uint256 userShares = balanceOf(user);
        // uint256 debtBGT = users[user].debtBGT;
        // return users[user].accBGT + _accBGTPerShare * userShares / PRECISION - debtBGT;
    }

    function claimBGT(uint256 amount, address recipient, address onBehalfOf) external returns (uint256) {
        updateGlobalBGT();
        updateUserBGT(onBehalfOf, 0, false);
        require(msg.sender == onBehalfOf || authorizedSpender[onBehalfOf] == msg.sender, "unauthorized");
        uint256 _accBGT = users[onBehalfOf].accBGT;
        amount = FixedPointMathLib.min(_accBGT, amount);
        unchecked {
            users[onBehalfOf].accBGT = _accBGT - amount;
        }
        Cosmos.Coin[] memory rewards = rewardsModule.withdrawDepositorRewardsTo(address(this), recipient, amount);
        require(rewards.length == 1, "too many coins returned");
        require(rewards[0].amount == amount, "withdraw amount incorrect");
        updateGlobalBGT(); // update again to reset the available BGT amount after withdrawal
        return amount;
    }

    function setAuthorizedSpender(address spender) external {
        authorizedSpender[msg.sender] = spender;
    }
}
