// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import "./FutaBase.sol";
import "../FutaToken.sol";

contract TokenMinter is FutaBase {

    event FutaTokenFactorySet(address indexed factory);
    event FutaTokenMinted(string ticker, address indexed token, uint256 totalSupply, uint256 auctionSupply);

    function mintPreAuction(string memory ticker, bytes32 tickerHash) public returns (address token, uint256 auctionSupply) {
        require(tokenFactory_ != address(0), "Token factory not set");
        require(auctionDex_ != address(0), "Auction dex not set");
        require(tradingDex_ != address(0), "Trading dex not set");
        require(tokenSupply_ > 0, "Token supply not set");
        require(auctionSupply_ > 0, "Auction supply not set");

        token = TokenFactory(tokenFactory_).deployToken
            (ticker, ticker, tokenSupply_, authority_, address(this), auctionDex_, tradingDex_);

        tokenTickers_[tickerHash] = token;
        auctionSupply = auctionSupply_;

        emit FutaTokenMinted(ticker, token, tokenSupply_, auctionSupply);
    }

    function setTokenFactory(address factory) public protocolOnly(true) {
        tokenFactory_ = factory;
        emit FutaTokenFactorySet(factory);
    }

    function setTokenSupply(uint256 supply, uint256 auctionSupply) public protocolOnly(false) {
        tokenSupply_ = supply;
        auctionSupply_ = auctionSupply;
        require(auctionSupply_ <= supply, "Auction supply too large");
    }
}