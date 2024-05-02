// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/ProtocolCmd.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/StorageLayout.sol';
import '../mixins/ProtocolAccount.sol';
import '../mixins/DepositDesk.sol';
import '../CrocEvents.sol';

/* @notice Multi Callpath
 * @notice Convenience callpath that lets us sequence arbitrary userCmds across multiple
 *         callpaths into a single userCmd call.
 * @dev Supports 2-5 sequential calls, but longer requirements can be done by nesting
 *      a userCmd into this callpath recursively. */
contract MultiPath is ProxyCaller {
    
    function userCmd (bytes calldata cmd) public payable {
        uint8 cmdCode = uint8(cmd[31]);
        require(cmdCode >= 2 && cmdCode <= 5, "Invalid number of commands");

        if (cmdCode == 2) {
            (, uint8 code1, bytes memory cmd1, uint8 code2, bytes memory cmd2) =
                abi.decode(cmd, (uint8, uint8, bytes, uint8, bytes));
            callUserCmdMem(code1, cmd1);
            callUserCmdMem(code2, cmd2);
            
        } else if (cmdCode == 3) {
            (, uint8 code1, bytes memory cmd1, uint8 code2, bytes memory cmd2,
             uint8 code3, bytes memory cmd3) =
                abi.decode(cmd, (uint8, uint8, bytes, uint8, bytes, uint8, bytes));
            callUserCmdMem(code1, cmd1);
            callUserCmdMem(code2, cmd2);
            callUserCmdMem(code3, cmd3);
            
        } else if (cmdCode == 4) {
            (, uint8 code1, bytes memory cmd1, uint8 code2, bytes memory cmd2,
             uint8 code3, bytes memory cmd3, uint8 code4, bytes memory cmd4) =
            abi.decode(cmd, (uint8, uint8, bytes, uint8, bytes, uint8, bytes,
                             uint8, bytes));
            callUserCmdMem(code1, cmd1);
            callUserCmdMem(code2, cmd2);
            callUserCmdMem(code3, cmd3);
            callUserCmdMem(code4, cmd4);
            
        } else if (cmdCode == 5) {
            (, uint8 code1, bytes memory cmd1, uint8 code2, bytes memory cmd2,
             uint8 code3, bytes memory cmd3, uint8 code4, bytes memory cmd4,
             uint8 code5, bytes memory cmd5) =
            abi.decode(cmd, (uint8, uint8, bytes, uint8, bytes, uint8, bytes,
                             uint8, bytes, uint8, bytes));
            callUserCmdMem(code1, cmd1);
            callUserCmdMem(code2, cmd2);
            callUserCmdMem(code3, cmd3);
            callUserCmdMem(code4, cmd4);
            callUserCmdMem(code5, cmd5);
        }
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.MULTICALL_PROXY_IDX;
    }
}

