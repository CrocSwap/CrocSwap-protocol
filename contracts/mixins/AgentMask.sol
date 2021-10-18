// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./StorageLayout.sol";

contract AgentMask is StorageLayout {

    function agentMintKey() internal view returns (bytes32) {
        return routerPosKey(msg.sender, tx.origin, false);
    }

    function agentBurnKey() internal view returns (bytes32) {
        return routerPosKey(msg.sender, tx.origin, false);
    }
    
    function routerPosKey (address sender, address origin, bool isBurn) private view
        returns (bytes32) {
        if (useStandardRouting(sender, origin)) {
            return toHash(sender);
        } else if (useOriginKey(sender)) {
            assertApproved(sender, origin, isBurn);
            return toHash(origin);
        } else if (useJoinKey(sender)) {
            return keccak256(abi.encode(sender, origin));
        } else {
            return toHash(sender);
        }
    }

    function toHash (address sender) private pure returns (bytes32) {
        return bytes32(uint256(uint160(sender)));
    }

    function asNumber (address sender) private pure returns (uint256) {
        return uint256(uint160(sender));
    }

    function assertApproved (address sender, address origin, bool isBurn) internal view {
        if (isBurn) {
            bytes32 key = keccak256(abi.encode(sender, origin));
            require(agents_[key].burn_, "AP");
        }
    }

    function useStandardRouting (address sender, address origin) internal pure
        returns (bool) {
        return sender == origin ||
            (asNumber(sender) & 0xFF00 == 0xFF00);
    }

    function useOriginKey (address sender) internal pure returns (bool) {
        return (asNumber(sender) & 0x10000) > 0;
    }

    function useJoinKey (address sender) internal pure returns (bool) {
        return (asNumber(sender) & 0x20000) > 0;
    }

    function useSettleOrigin (address sender) internal pure returns (bool) {
        return (asNumber(sender) & 0x40000) > 0;
    }

}
