// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import '../interfaces/IERC20Minimal.sol';

/// @title TransferHelper
/// @notice Contains helper methods for interacting with ERC20 tokens that do not consistently return true/false
library TransferHelper {
    /// @notice Transfers tokens from msg.sender to a recipient
    /// @dev Calls transfer on token contract, errors with TF if transfer fails
    /// @param token The contract address of the token which will be transferred
    /// @param to The recipient of the transfer
    /// @param value The value of the transfer
    function safeTransfer(
        address token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TF1");
    }

    /// @notice Transfers tokens from msg.sender to a recipient
    /// @dev Calls transferFrom on token contract, errors with TF if transfer fails
    /// @param token The contract address of the token which will be transferred
    /// @param from The sender address of the transfer
    /// @param to The recipient of the transfer
    /// @param value The value of the transfer
    function safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TF2");
    }

    // @notice Transfers native Ether to a recipient.
    // @dev errors with TF if transfer fails
    function safeEtherSend(
        address to,
        uint256 value
    ) internal {
        (bool success, ) = to.call{value: value}("");
        require(success, "TF3");
    }

}
