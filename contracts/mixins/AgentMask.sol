// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./StorageLayout.sol";
import "hardhat/console.sol";

/* Provides special handling for external routers and aggregators, with regards to
 * ownership of positions and settlement of payments. Default behavior (based on
 * msg.sender at call time) is enabled *unless*: 
 *    1) The CrocSwap contract is being called by another smart contract
 *    2) The calling contract's address begins with a magic prefix (0xCC)
 *
 * This allows external routers and aggregators to implement custom logic in a way that
 * imposes no gas burden on the hot-path. The magic prefix makes the behavior easily
 * identifiable, and unlikely (1/256 chance) for random contracts to have magic behavior.
 * (Still proper CrocSwap usage recommends that any external calling contract verifies
 * that it doesn't start with a magic prefix.)
 *
 * Based on the third byte in the address, the following magic behavior can each 
 * independently be toggled on:
 *    1) Debit flows are collected from tx.origin instead of msg.sender. (Note this 
 *       requires the tx.origin caller to approve the smart contract before.)
 *    2) Crdit flows are paid out to tx.origin instead of msg.sender.
 *    3) Liquidity positions are directly owned by tx.origin instead of msg.sender.
 *       To burn positions requires tx.origin to approve the smart contract before.)
 *    4) Liquidity positions are tracked independently in terms of the (msg.sender,
 *       tx.origin) pair. They can only be burned by the same calling pair. This can
 *       create gas efficiency for certain external contracts as they no longer have
 *       to externally track users. 
 */
contract AgentMask is StorageLayout {

    function agentMintKey() internal view returns (bytes32) {
        return agentMintKey(msg.sender, tx.origin);
    }

    function agentBurnKey() internal view returns (bytes32) {
        return agentBurnKey(msg.sender, tx.origin);
    }

    function agentMintKey (address sender, address origin) internal view
        returns (bytes32) {
        return routerPosKey(sender, origin, false);
    }

    function agentBurnKey (address sender, address origin) internal view
        returns (bytes32) {
        return routerPosKey(sender, origin, true);
    }

    function agentsSettle() internal view returns (address debit, address credit) {
        (debit, credit) = agentsSettle(msg.sender, tx.origin);
    }

    function approveAgent (address router, bool forDebit, bool forBurn) internal {
        approveAgent(router, tx.origin, forDebit, forBurn);
    }
    
    function routerPosKey (address sender, address origin, bool isBurn) private view
        returns (bytes32 key) {
        key = toHash(sender);
        if (isMagic(sender, origin)) {
            if (useJoinKey(sender)) {
                return keccak256(abi.encode(sender, origin));
            } else if (useOriginKey(sender)) {
                assertBurnApproved(sender, origin, isBurn);
                return toHash(origin);
            }
        }
    }

    function agentsSettle (address sender, address origin) internal view
        returns (address debit, address credit) {
        (debit, credit) = (sender, sender);
        if (isMagic(sender, origin)) {
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
                            bool forDebit, bool forBurn) internal {
        bytes32 key = keccak256(abi.encode(router, origin));
        agents_[key].burn_ = forBurn;
        agents_[key].debit_ = forDebit;
    }

    uint256 constant private MAGIC_PREFIX = 0xcc;
    
    function isMagic (address sender, address origin) private pure returns (bool) {
        return sender != origin &&
            ((asNumber(sender) >> 152) == MAGIC_PREFIX);
    }

    function useOriginKey (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x1) > 0;
    }

    function useJoinKey (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x2) > 0;
    }

    function useCreditOrigin (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x4) > 0;
    }

    function useDebitOrigin (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x8) > 0;
    }
}
