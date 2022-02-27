// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

library CrocEvents {

    /* Emitted when the protocol authority transfers to a new address. */
    event AuthorityTransfer (address indexed authority);

    event CrocMaster (address indexed dex, uint timelock, uint timeExpiry,
                     uint8 multisigThresh, address[] multisigSigners);

    event CrocDeploy (address indexed dex, address indexed master);

    event ProtocolDividend (address indexed token, address recv);

    event UpgradeProxy (address indexed proxy, uint8 proxyIdx);
    event ForceHotProxy (bool isForced);
}
