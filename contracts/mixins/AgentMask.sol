// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./StorageLayout.sol";

contract AgentMask is StorageLayout {

    function agentMintKey() internal view returns (bytes32) {
        return routerPosKey(msg.sender, tx.origin, false);
    }

    function agentBurnKey() internal view returns (bytes32) {
        return routerPosKey(msg.sender, tx.origin, true);
    }

    function agentsSettle() internal view returns (address debit, address credit) {
        (debit, credit) = agentsSettle(msg.sender, tx.origin);
    }

    function approveAgent (address router, bool forDebit, bool forBurn) internal {
        approveAgent(router, tx.origin, forDebit, forBurn);
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

    function agentsSettle (address sender, address origin) private view
        returns (address debit, address credit) {
        (debit, credit) = (sender, sender);
        if (!useStandardRouting(sender, origin)) {
            if (useCreditOrigin(sender)) {
                credit = origin;
            }
            if (useDebitOrigin(sender)) {
                assertDebitApproved(sender, origin);
                debit = origin;
            }
        }
    }

    function toHash (address sender) private pure returns (bytes32) {
        return bytes32(uint256(uint160(sender)));
    }

    function asNumber (address sender) private pure returns (uint256) {
        return uint256(uint160(sender));
    }

    function assertApproved (address sender, address origin,
                             bool isBurn) internal view {
        if (isBurn) {
            bytes32 key = keccak256(abi.encode(sender, origin));
            require(agents_[key].burn_, "BA");
        }
    }

    function assertDebitApproved (address sender, address origin) internal view {
        bytes32 key = keccak256(abi.encode(sender, origin));
        require(agents_[key].debit_, "DA");
    }

    function approveAgent (address router, address origin,
                            bool forDebit, bool forBurn) internal {
        bytes32 key = keccak256(abi.encode(router, origin));
        agents_[key].burn_ = forBurn;
        agents_[key].debit_ = forDebit;
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

    function useCreditOrigin (address sender) internal pure returns (bool) {
        return (asNumber(sender) & 0x40000) > 0;
    }

    function useDebitOrigin (address sender) internal pure returns (bool) {
        return (asNumber(sender) & 0x80000) > 0;
    }
}
