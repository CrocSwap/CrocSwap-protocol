// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./StorageLayout.sol";
import "./UserBursar.sol";
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
contract AgentMask is UserBursar {

    modifier protocolOnly() {
        require(msg.sender == authority_ && lockHolder_ == address(0));
        lockHolder_ = msg.sender;
        _;
        lockHolder_ = address(0);        
    }
    
    modifier reEntrantLock() {
        require(lockHolder_ == address(0));
        lockHolder_ = msg.sender;
        _;
        lockHolder_ = address(0);
    }

    modifier reEntrantApproved (address client) {
        require(lockHolder_ == address(0));
        assertDebitApproved(msg.sender, client);
        lockHolder_ = client;
        _;
        lockHolder_ = address(0);
    }

    modifier reEntrantAgent (bytes calldata signature, uint32 nonce,
                             bytes32 nonceDim, uint48 deadline, bytes32 payload) {
        lockSigner(signature, nonce, nonceDim, deadline, payload);
        _;
        lockHolder_ = address(0);
    }

    function lockSigner (bytes calldata signature, uint32 nonce,
                         bytes32 nonceDim, uint48 deadline, bytes32 payload) private {
        require(lockHolder_ == address(0));
        require(deadline == 0 || block.timestamp <= deadline);
        casNonce(nonceDim, nonce);
        address client = recoverSigner(signature, nonce, nonceDim, deadline, payload);
        require(client != address(0));        
        lockHolder_ = client;        
    }

    function recoverSigner (bytes calldata signature, uint32 nonce,
                            bytes32 nonceDim, uint48 deadline,
                            bytes32 payload) view private
        returns (address) {
        (uint8 v, bytes32 r, bytes32 s) =
            abi.decode(signature, (uint8, bytes32, bytes32));
        bytes32 checksum = keccak256(abi.encodePacked
                                     (nonce, nonceDim, deadline, block.chainid,
                                      address(this), payload));
        return ecrecover(checksum, v, r, s);        
    }

    /* @notice Returns the owner key that any LP position resulting from a mint action
     *         should be associated with. */
    function agentMintKey() internal view returns (bytes32) {
        return bytes32(uint256(uint160(lockHolder_)));
    }

    /* @notice Returns the owner key that any LP position resulting from a mint action
     *         should be associated with.
     * @param lpConduit The address of the ICrocLpConduit the user is depositing the
     *                  LP position at. (If zero, uses the standard mint key). */
    function agentMintKey (address lpConduit) internal view returns (bytes32) {
        if (lpConduit == address(0)) {
            return agentMintKey();
        } else {
            return bytes32(uint256(uint160(lpConduit)));
        }
    }

    /* @notice Returns the position owner key that we should use when burning any LP 
     *         position. */
    function agentBurnKey() internal view returns (bytes32) {
        return bytes32(uint256(uint160(lockHolder_)));
    }

    /* @notice Returns the payer and receiver of any settlement collateral flows.
     * @return debit The address that will be paying any debits to the pool.
     * @return credit The address that will receive any credits from the pool. */
    function agentsSettle() internal view returns (address debit, address credit) {
        (debit, credit) = (lockHolder_, lockHolder_);
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
}
