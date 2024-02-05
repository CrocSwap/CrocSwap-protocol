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

pragma solidity ^0.8.10;

import {Cosmos} from "../libraries/CosmosTypes.sol";

interface IRewardsModule {
    /////////////////////////////////////// READ METHODS //////////////////////////////////////////

    /**
     * @dev Returns the address of the withdraw address.
     * @param depositor The depositor address.
     */
    function getDepositorWithdrawAddress(address depositor) external view returns (address);

    /**
     * @dev returns the rewards for the given delegator and receiver.
     * @param depositor The delegator address.
     * @param receiver The receiver address.
     * @return rewards rewards.
     */
    function getCurrentRewards(address depositor, address receiver) external view returns (Cosmos.Coin[] memory);

    /**
     * @dev returns the oustanding rewards owed to a receiver.
     * @param receiver The receiver address.
     */
    function getOutstandingRewards(address receiver) external view returns (Cosmos.Coin[] memory);

    /////////////////////////////////////// WRITE METHODS //////////////////////////////////////////

    /**
     * @dev Sets the caller's withdraw address.
     * @param withdrawAddress The withdraw address to be set.
     */
    function setDepositorWithdrawAddress(address withdrawAddress) external returns (bool);

    /**
     * @dev Withdraws all the rewards for the given delegator and receiver.
     * @param receiver The receiver address.
     * @return rewards rewards.
     */
    function withdrawAllDepositorRewards(address receiver) external returns (Cosmos.Coin[] memory);

    /**
     * @dev Withdraws the rewards for the given delegator and receiver.
     * @param receiver The receiver address.
     * @param amount The amount of rewards to withdraw.
     * @return rewards rewards.
     */
    function withdrawDepositorRewards(address receiver, uint256 amount) external returns (Cosmos.Coin[] memory);

    /**
     * @dev Withdraws the rewards for the given delegator and receiver, to a given address.
     * @param receiver The receiver address.
     * @param recipient The recipient address.
     * @param amount The amount of rewards to withdraw.
     * @return rewards rewards.
     */
    function withdrawDepositorRewardsTo(address receiver, address recipient, uint256 amount)
        external
        returns (Cosmos.Coin[] memory);

    //////////////////////////////////////////// Events ////////////////////////////////////////////

    /**
     * @dev Emitted when a deposit is initialized.
     * @param caller The caller address.
     * @param depositor The owner address.
     * @param assets The assets.
     * @param shares The shares.
     */
    event InitializeDeposit(
        address indexed caller, address indexed depositor, Cosmos.Coin[] assets, Cosmos.Coin shares
    );

    /**
     * @dev Emitted when a withdraw is made.
     * @param rewardReceiver the address that the withdraw is made from.
     * @param withdrawer the address that withdrawed the rewards.
     * @param rewardRecipient the address that the rewards were sent to.
     * @param rewardAmount the rewards that were withdrawen.
     */
    event WithdrawDepositRewards(
        address indexed rewardReceiver,
        address indexed withdrawer,
        address indexed rewardRecipient,
        Cosmos.Coin[] rewardAmount
    );

    /**
     * @dev Emitted when a withdraw address is set.
     * @param depositor The owner address.
     * @param withdrawAddress The withdraw address.
     */
    event SetDepositorWithdrawAddress(address indexed depositor, address indexed withdrawAddress);
}
