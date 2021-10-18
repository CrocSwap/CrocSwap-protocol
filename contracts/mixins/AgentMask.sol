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
        if (!isMagic(sender, origin)) {
            return toHash(sender);
        } else if (useOriginKey(sender)) {
            assertBurnApproved(sender, origin, isBurn);
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
        if (!isMagic(sender, origin)) {
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

    function assertBurnApproved (address sender, address origin,
                             bool isBurn) private view {
        if (isBurn) {
            bytes32 key = keccak256(abi.encode(sender, origin));
            require(agents_[key].burn_, "BA");
        }
    }

    function assertDebitApproved (address sender, address origin) private view {
        bytes32 key = keccak256(abi.encode(sender, origin));
        require(agents_[key].debit_, "DA");
    }

    function approveAgent (address router, address origin,
                            bool forDebit, bool forBurn) private {
        bytes32 key = keccak256(abi.encode(router, origin));
        agents_[key].burn_ = forBurn;
        agents_[key].debit_ = forDebit;
    }

    uint256 constant private MAGIC_PREFIX = 0xcc;
    
    function isMagic (address sender, address origin) private pure
        returns (bool) {
        return sender != origin &&
            ((asNumber(sender) >> 144) == MAGIC_PREFIX);
    }

    function useOriginKey (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 136) & 0x1) > 0;
    }

    function useJoinKey (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 136) & 0x2) > 0;
        return (asNumber(sender) & 0x20000) > 0;
    }

    function useCreditOrigin (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 136) & 0x4) > 0;
        return (asNumber(sender) & 0x40000) > 0;
    }

    function useDebitOrigin (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 136) & 0x8) > 0;
    }
}
