// SPDX-License-Identifier: GPL-3

pragma solidity >=0.8.4;

library CrocSlots {
    uint constant public AUTHORITY_SLOT = 0;
    uint constant public FEE_MAP_SLOT = 77;
    uint constant public POS_MAP_SLOT = 78;
    uint constant public AMB_MAP_SLOT = 79;
    uint constant public AGENT_MAP_SLOT = 80;

    uint constant public AGENT_DEBIT_OFFSET = 0x100;
    uint constant public AGENT_BURN_OFFSET = 0x1;
}
