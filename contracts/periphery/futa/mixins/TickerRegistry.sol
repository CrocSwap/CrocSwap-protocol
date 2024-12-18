// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import "./FutaBase.sol";
import "../libraries/TextUtils.sol";

contract TickerRegistry is FutaBase {    

    using TextUtils for string;

    event FutaBlacklistSet(bytes32 indexed ticker, bool isBlacklisted);
    event FutaRegisterTicker(string ticker, bytes32 indexed tickerHash, bytes32 tickerChain);
    event FutaRegistrarAuthoritySet(address indexed registrarAuthority);

    function isTickerUsed(bytes32 ticker) public view returns (bool) {
        return tickerUsed_[ticker];
    }

    function isTickerUsed (string memory ticker) public view returns (bool) {
        return tickerUsed_[keccak256(abi.encodePacked(ticker))];
    }

    function hashTicker(string memory ticker) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(ticker));
    }

    function setBlacklist(bytes32 ticker, bool isBlacklisted) public protocolOnly(false) {
        blacklist_[ticker] = isBlacklisted;
        emit FutaBlacklistSet(ticker, isBlacklisted);
    }

    function setBlacklist(string memory ticker, bool isBlacklisted) public protocolOnly(false) {
        setBlacklist(keccak256(abi.encodePacked(ticker)), isBlacklisted);
    }

    function claimTicker(string memory ticker) internal returns (bytes32) {
        bytes32 tickerHash = keccak256(abi.encodePacked(ticker));

        require(!tickerUsed_[tickerHash], "Ticker already claimed");
        require(!blacklist_[tickerHash], "Ticker is blacklisted");
        require(ticker.isUpperCase(), "Ticker uppercase letters");

        tickerUsed_[tickerHash] = true;
        tickerChain_ = keccak256(abi.encode(tickerChain_, tickerHash));

        emit FutaRegisterTicker(ticker, tickerHash, tickerChain_);
        return tickerHash;
    }
    
}
