// SPDX-License-Identifier: GPL-3

pragma solidity >=0.8.4;

library CrocSlots {
    uint constant public AUTHORITY_SLOT = 0;
    uint constant public FEE_MAP_SLOT = 65544;
    uint constant public POS_MAP_SLOT = 65545;
    uint constant public AMB_MAP_SLOT = 65546;
    uint constant public AGENT_MAP_SLOT = 65547;
    uint constant public SURP_MAP_SLOT = 65550;

    uint constant public AGENT_DEBIT_OFFSET = 0x100;
    uint constant public AGENT_BURN_OFFSET = 0x1;
}
