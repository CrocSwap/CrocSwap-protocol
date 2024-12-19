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

    receive() external payable {
        // Accept ETH
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
        bytes32 tickerHash = claimTicker(ticker);
        (address token, uint256 auctionSupply) = mintPreAuction(ticker, tickerHash);
        initiateAuctionETH(token, auctionSupply);
        lockCreatorBid(token);

        emit FutaAuctionOpen(tickerHash, token, auctionSupply);
    }

    function finalizeAuction(address tickerToken) public reEntrantLock {
        finalizeAuctionInternal(tickerToken);
    }

    function finalizeAuctionInternal (address tickerToken) internal {
        uint128 auctionPrice = refundAuctionETH(tickerToken);
        claimCreatorBid(tickerToken);
        lockLiquidity(tickerToken, auctionPrice);
        FutaToken(tickerToken).unlockTransfer();

        emit FutaAuctionClosed(tickerToken, auctionPrice);
    }

    function finalizeAuctionHash(bytes32 tickerHash) public reEntrantLock {
        address token = tokenTickers_[tickerHash];
        finalizeAuctionInternal(token);
    }

    function finalizeAuctionTicker(string memory ticker) public reEntrantLock {
        bytes32 tickerHash = hashTicker(ticker);
        address token = tokenTickers_[tickerHash];
        finalizeAuctionInternal(token);
    }

    function finalizeAuctions (address[] memory tickerTokens) public reEntrantLock {
        for (uint256 i = 0; i < tickerTokens.length; i++) {
            finalizeAuctionInternal(tickerTokens[i]);
        }
    }

    function finalizeAuctionTickers(string[] memory tickers) public reEntrantLock {
        for (uint256 i = 0; i < tickers.length; i++) {
            bytes32 tickerHash = hashTicker(tickers[i]);
            address token = tokenTickers_[tickerHash];
            finalizeAuctionInternal(token);
        }
    }

    function finalizeAuctionHashes(bytes32[] memory tickerHashes) public reEntrantLock {
        for (uint256 i = 0; i < tickerHashes.length; i++) {
            address token = tokenTickers_[tickerHashes[i]];
            finalizeAuctionInternal(token);
        }
    }

}