// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "../../../mixins/AgentMask.sol";
import "../../../interfaces/ICrocCondOracle.sol";
import "../../../libraries/SafeCast.sol";

contract FutaBase is AgentMask {

    address public auctionDex_;
    address public tradingDex_;
    address public crocQuery_;
    address public crocAuctionQuery_;
    
    address public tokenFactory_;
    uint256 public poolIdx_;
    
    uint256 public tokenSupply_;
    uint256 public auctionSupply_;

    uint16 public protocolFee_;
    uint16 public creatorFee_;

    mapping(bytes32 => bool) public tickerUsed_;
    mapping(bytes32 => bool) public blacklist_;
    bytes32 public tickerChain_;

    mapping(address => address) public auctionCreators_;

    uint32 public auctionDuration_;
    uint16 public auctionStepSize_;
    uint16 public auctionStartStep_;
    uint32 public creatorReward_;
}

