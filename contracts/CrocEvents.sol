// SPDX-License-Identifier: GPL-3

pragma solidity ^0.8.4;

library CrocEvents {

    /* Emitted when the protocol authority transfers to a new address. */
    event AuthorityTransfer (address indexed authority);

    event CrocMaster (address indexed dex, uint timelock, uint timeExpiry,
                     uint8 multisigThresh, address[] multisigSigners);

    event CrocDeploy (address indexed dex, address indexed master);

    event SetNewPoolLiq (uint128 liq);
    event SetTakeRate (uint8 takeRate);
    event SetRelayerTakeRate (uint8 takeRate);
    event DisablePoolTemplate (uint256 indexed poolIdx);
    event SetPoolTemplate (uint256 indexed poolIdx, uint16 feeRate, uint16 tickSize,
                           uint8 jitThresh, uint8 knockoutGap, uint8 oracleFlags);
    event ResyncTakeRate (address indexed base, address indexed quote,
                          uint256 indexed poolIdx, uint8 takeRate);
    event PriceImproveThresh (address indexed token, uint128 unitTickCollateral,
                              uint16 awayTickTol);
    
    event TreasurySet (address indexed treasury, uint64 indexed startTime);
    event ProtocolDividend (address indexed token, address recv);

    event UpgradeProxy (address indexed proxy, uint16 proxyIdx);
    event HotPathOpen (bool);
    event SafeMode (bool);
}
