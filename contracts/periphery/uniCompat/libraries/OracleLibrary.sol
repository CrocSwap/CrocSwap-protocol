// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import '../../../libraries/TickMath.sol';

/// @title Oracle library
/// @notice Provides functions to integrate with V3 pool oracle
library OracleLibrary {
    /// @notice Given a tick and a token amount, calculates the amount of token received in exchange
    /// @param tick Tick value used to calculate the quote
    /// @param baseAmount Amount of token to be converted
    /// @param baseToken Address of an ERC20 token contract used as the baseAmount denomination
    /// @param quoteToken Address of an ERC20 token contract used as the quoteAmount denomination
    /// @return quoteAmount Amount of quoteToken received for baseAmount of baseToken
    function getQuoteAtTick(
        int24 tick,
        uint128 baseAmount,
        address baseToken,
        address quoteToken
    ) internal pure returns (uint256 quoteAmount) {
        uint128 sqrtRatioX64 = TickMath.getSqrtRatioAtTick(tick);

        uint256 ratioX128 = uint256(sqrtRatioX64) * uint256(sqrtRatioX64);
        quoteAmount = baseToken < quoteToken ?
            (ratioX128 * baseAmount) >> 128 :
            (baseAmount << 128) / ratioX128;
    }

    /// @notice Returns the "synthetic" tick which represents the price of the first entry in `tokens` in terms of the last
    /// @dev Useful for calculating relative prices along routes.
    /// @dev There must be one tick for each pairwise set of tokens.
    /// @param tokens The token contract addresses
    /// @param ticks The ticks, representing the price of each token pair in `tokens`
    /// @return syntheticTick The synthetic tick, representing the relative price of the outermost tokens in `tokens`
    function getChainedPrice(address[] memory tokens, int24[] memory ticks)
        internal
        pure
        returns (int256 syntheticTick)
    {
        require(tokens.length - 1 == ticks.length, 'DL');
        for (uint256 i = 1; i <= ticks.length; i++) {
            // check the tokens for address sort order, then accumulate the
            // ticks into the running synthetic tick, ensuring that intermediate tokens "cancel out"
            tokens[i - 1] < tokens[i] ? syntheticTick += ticks[i - 1] : syntheticTick -= ticks[i - 1];
        }
    }
}
