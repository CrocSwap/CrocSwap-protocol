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
 *       to externally track users. */

/* @title Agent mask mixin.
 * @notice Contains logic for toggling behavior related to settlement and position
 *         ownership for transactions that come through external smart contracts
 *         (rather than direct user accounts). */
contract AgentMask is StorageLayout {

    /* @notice Returns the owner key that any LP position resulting from a mint action
     *         should be associated with. */
    function agentMintKey() internal view returns (bytes32) {
        return agentMintKey(msg.sender, tx.origin);
    }

    /* @notice Returns the position owner key that we should use when burning any LP 
     *         position. */
    function agentBurnKey() internal view returns (bytes32) {
        return agentBurnKey(msg.sender, tx.origin);
    }

    /* @notice Returns the owner key that any LP position resulting from a mint action
     *         should be associated with.
     * @param sender The address of msg.sender (the external smart contract calling
     *               the CrocSwap function.
     * @param origin The address of tx.origin (the Ethereum account originating the
     *               the transaction). */
    function agentMintKey (address sender, address origin) internal view
        returns (bytes32) {
        return routerPosKey(sender, origin, false);
    }
    
    /* @notice Returns the position owner key that we should use when burning any LP 
     *         position.
     * @param sender The address of msg.sender (the external smart contract calling
     *               the CrocSwap function.
     * @param origin The address of tx.origin (the Ethereum account originating the
     *               the transaction). */
    function agentBurnKey (address sender, address origin) internal view
        returns (bytes32) {
        return routerPosKey(sender, origin, true);
    }

    /* @notice Returns the payer and receiver of any settlement collateral flows.
     * @return debit The address that will be paying any debits to the pool.
     * @return credit The address that will receive any credits from the pool. */
    function agentsSettle() internal view returns (address debit, address credit) {
        (debit, credit) = agentsSettle(msg.sender, tx.origin);
    }

    /* @notice For security reasons we want to restrict the ability of third-party
     *         smart contracts to collect debits or burn LP positions for arbitrary
     *         users. (Credit and mints don't have to be restricted, because they
     *         can only benefit users.) Therefore either of these actions require
     *         the user to explicitly authorize the external smart contract beforehand
     *         using this function.
     *
     * @dev    This authorizes for the address from msg.sender-- not tx.origin. That
     *         requires that the authorizing user directly calls this method directly
     *         on CrocSwap before using the external smart contract for any actions
     *         requiring authorization. (Don't use tx.origin, because otherwise it could
     *         allow malicious contracts to sneak in an authorization the user doesn't
     *         want.)
     *
     * @param router The address of the external smart contract being authorized to
     *               act on the user's behalf.
     * @param forDebit If true authorizes the smart contract to debit the user for 
     *                 collateral settlement. If false, revokes authorization (if ever 
     *                 previously authorized).
     * @param forBurn If true authorizes the smart contract to burn LP positions owned
     *                by the user. If false, revokes authorization. */
    function approveAgent (address router, bool forDebit, bool forBurn) internal {
        approveAgent(router, msg.sender, forDebit, forBurn);
    }

    /* @notice Returns the key used to map and assign user LP positions in this call.
     *         Depending on the setting may either be the value msg.sender, tx.origin,
     *         or a hash of the two (which effectively restricts position management to
     *         the external smart contract only when operated by the original external
     *         owned Ethereum account.
     *
     * @param sender The address of the smart contract calling CrocSwap (msg.value)
     * @param origin The address of the externally owned account originating the 
     *               transaction (tx.origin)
     * @param isBurn If true indicates that the call is burning an LP position (only 
     *               used to conditionally assert authorization)
     *
     * @return key   A hash key that should be when mapping or assigning any LP position.
     *               This will remain consistent across subsequent LP calls. */
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

    /* @notice Returns the addresses to pay and receive any token or Ethereum flows 
     *         related to collateral settlement.
     *
     * @dev    If the smart contract magic address allows external debiting, this
     *         call will verify that the smart contract is authorzied for the user, and
     *         revert the transaction otherwise.
     *
     * @param sender The address of the smart contract calling CrocSwap (msg.value)
     * @param origin The address of the externally owned account originating the 
     *               transaction (tx.origin)
     *
     * @return debit The address to which any debts owed to the pool should be collected
     * @return credit The aderess to which any assets paid out from the pool should be 
     *                sent. */     
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

    /* @notice Casts a flat non-joint position owner address to a hash type. */
    function toHash (address sender) private pure returns (bytes32) {
        return bytes32(uint256(uint160(sender)));
    }

    /* @notice Casts a flat non-joint position owner address to a uint256 type. */
    function asNumber (address sender) private pure returns (uint256) {
        return uint256(uint160(sender));
    }

    /* @notice Verifies that the msg.sender is authorized to burn LP positions owned
     *         by tx.origin, and reverts the transaction otherwise. */
    function assertBurnApproved (address sender, address origin,
                                 bool isBurn) private view {
        if (isBurn) {
            bytes32 key = keccak256(abi.encode(sender, origin));
            require(agents_[key].burn_, "BA");
        }
    }

    /* @notice Verifies that the msg.sender is authorized to debit the tx.origin and
     *         reverts the transaction otherwise. */
    function assertDebitApproved (address sender, address origin) private view {
        bytes32 key = keccak256(abi.encode(sender, origin));
        require(agents_[key].debit_, "DA");
    }

    /* @params Sets external burning and debit permissions for an external smart contract
     *         for a given user address. */
    function approveAgent (address router, address origin,
                            bool forDebit, bool forBurn) internal {
        bytes32 key = keccak256(abi.encode(router, origin));
        agents_[key].burn_ = forBurn;
        agents_[key].debit_ = forDebit;
    }

    // Any smart contract not ending in the magic code (0xcc) uses default behavior.
    uint256 constant private MAGIC_PREFIX = 0xcc;
    
    function isMagic (address sender, address origin) private pure returns (bool) {
        return sender != origin &&
            ((asNumber(sender) >> 152) == MAGIC_PREFIX);
    }

    /* @notice Given an external smart contract with a magic address, this returns true
     *         if LP positions should be mapped to tx.origin when it calls CrocSwap. */
    function useOriginKey (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x1) > 0;
    }

    /* @notice Given an external smart contract with a magic address, this returns true
     *         if LP positions should be mapped to a joint hash of msg.sender and 
     *         tx.origin when it calls CrocSwap. */
    function useJoinKey (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x2) > 0;
    }

    /* @notice Given an external smart contract with a magic address, this returns true
     *         if collateral settle credits should be sent to tx.origin instead of 
     *         msg.sender. */
    function useCreditOrigin (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x4) > 0;
    }

    /* @notice Given an external smart contract with a magic address, this returns true
     *         if collateral settle debits should be collected rom tx.origin instead of 
     *         msg.sender. */
    function useDebitOrigin (address sender) private pure returns (bool) {
        return ((asNumber(sender) >> 148) & 0x8) > 0;
    }
}
