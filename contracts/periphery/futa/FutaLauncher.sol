// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import "./mixins/AuctionCaller.sol";
import "./mixins/TickerRegistry.sol";
import "./mixins/TokenMinter.sol";
import "./mixins/LiquidityVault.sol";

contract FutaLauncher is  AuctionCaller, TickerRegistry, TokenMinter, LiquidityVault {

    event FutaAdminSet(address newOwner);

    event FutaAuctionOpen(bytes32 indexed tickerHash, address indexed token, uint256 auctionSupply);
    event FutaAuctionClosed(address indexed tickerToken, uint128 auctionPrice);

    event FutaCrocSet(address auctionDex, address tradingDex, address crocAuctionQuery, address crocQuery, uint256 poolIdx);

    constructor (address crocAuctionQuery, address crocQuery, uint256 poolIdx) {
        authority_ = msg.sender;
        FutaToken proxy = new FutaToken();
        tokenFactory_ = address(new TokenFactory(address(proxy)));
        setCrocInternal(crocAuctionQuery, crocQuery, poolIdx);
    }

    function setCroc (address crocAuctionQuery, address crocQuery, uint256 poolIdx) public protocolOnly(true) {
        setCrocInternal(crocAuctionQuery, crocQuery, poolIdx);
    }

    function setCrocInternal (address crocAuctionQuery, address crocQuery, uint256 poolIdx) internal {
        auctionDex_ = CrocAuctionQuery(crocAuctionQuery).dex_();
        tradingDex_ = CrocQuery(crocQuery).dex_();
        crocAuctionQuery_ = crocAuctionQuery;
        crocQuery_ = crocQuery;
        poolIdx_ = poolIdx;
        emit FutaCrocSet(auctionDex_, tradingDex_, crocAuctionQuery, crocQuery, poolIdx);
    }

    function setAdmin(address newOwner) public protocolOnly(true) {
        authority_ = newOwner;
        emit FutaAdminSet(newOwner);
    }

    function initializeTickerAuction (string memory ticker) public payable reEntrantLock {
        bytes32 tickerHash =claimTicker(ticker);
        (address token, uint256 auctionSupply) = mintPreAuction(ticker);
        initiateAuctionETH(token, auctionSupply);
        lockCreatorBid(token);

        emit FutaAuctionOpen(tickerHash, token, auctionSupply);
    }

    function finalizeAuction(address tickerToken) public reEntrantLock {
        uint128 auctionPrice = refundAuctionETH(tickerToken);
        claimCreatorBid(tickerToken);
        lockLiquidity(tickerToken, auctionPrice);
        FutaToken(tickerToken).unlockTransfer();

        emit FutaAuctionClosed(tickerToken, auctionPrice);
    }

    function finalizeAuctions (address[] memory tickerTokens) public reEntrantLock {
        for (uint256 i = 0; i < tickerTokens.length; i++) {
            finalizeAuction(tickerTokens[i]);
        }
    }

}