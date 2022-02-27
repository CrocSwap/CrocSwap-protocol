// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import "./CrocEvents.sol";
import "./CrocMaster.sol";
import "./CrocSwapDex.sol";
import "hardhat/console.sol";

/* @title CrocSwap Deployer
 * @notice Responsible for setting up the CrocMaster contract and attaching it to
 *         a previously initialized CrocSwapDex contract. */
contract CrocDeployer {

    address public dex_;
    address public master_;

    /* @notice Takes a previously constructed CrocSwapDex contract, then constructs
     *         and attaches a CrocMaster contract to serve as the timelock multisig
     *         authority. 
     *
     * @dev   To properly use this method, one must first:
     *             1) Construct the CrocDeployer contract.
     *             2) Construct CrocSwapDex with the CrocDeployer set as the protocol 
     *                authority in the constructor.
     *             3) Call this method which will construct a timelock multisig 
     *                CrocMaster, and transfer authority of CrocSwapDex.
     *
     * @param dex The pre-constructed CrocSwapDex contract.
     * @param timelockDelay The timelock (in seconds) for protocol governance proposals
     * @param timelockExpirty The expiry TTL (in seconds) for protocol governance 
     *                        proposoals
     * @param multisigThresh The X threshold in the X-of-Y multisig for protocol 
     *                       governance proposals
     * @param multisigSigners The list of valid multisig signers for protocol 
     *                        governance. */
    function decentralize (address dex, uint timelockDelay, uint timelockExpiry,
                           uint8 multisigThresh,
                           address[] calldata multisigSigners) public {
        address master = address(new CrocMaster(dex, timelockDelay, timelockExpiry,
                                                multisigThresh, multisigSigners));

        // Transfers protocol authority to the newly created CrocMaster contract.
        //require(CrocSwapDex(dex).authority_() == address(this), "No authority");
        bytes memory handoffCmd = encodeAuthHandoff(master);
        CrocSwapDex(dex).protocolCmd(handoffCmd);

        dex_ = dex;
        master_ = master;
        emit CrocEvents.CrocDeploy(dex, master);
    }

    /* @notice Encodes a CrocSwapDex protocolCmd() to transfer protocol governance 
     *         authority. */
    function encodeAuthHandoff (address master) private pure returns (bytes memory cmd) {
        // Based on protocolCmd() implementation in ColdPath.sol
        uint8 authCode = 70;
        cmd = abi.encode(authCode, address(0), master, uint24(0), uint24(0),
                         uint8(0), uint16(0), uint128(0));
    }

}
