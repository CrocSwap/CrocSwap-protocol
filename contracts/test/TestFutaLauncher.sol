// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import "../periphery/futa/FutaLauncher.sol";

/* @notice Test harness that exposes internal FutaLauncher functions
 *         for regression testing of bug fixes. */
contract TestFutaLauncher is FutaLauncher {

    constructor(address crocAuctionQuery, address crocQuery, uint256 poolIdx)
        FutaLauncher(crocAuctionQuery, crocQuery, poolIdx) {}

    /* @notice Exposes claimCreatorBid for isolated testing.
     *         Used to regression-test that creator receives tokens
     *         after auction settlement without going through lockLiquidity. */
    function testClaimCreatorBid(address token) public reEntrantLock {
        claimCreatorBid(token);
    }

    /* @notice Helper to read tokenTickers_ mapping (internal in FutaBase). */
    function getTokenByHash(bytes32 tickerHash) public view returns (address) {
        return tokenTickers_[tickerHash];
    }
}
