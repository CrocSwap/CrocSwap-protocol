// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./StorageLayout.sol";

/* @title Agent mask mixin.
 * @notice Maps and manages surplus balances, nonces, and external router approvals
 *         based on the wallet addresses of end-users. */
contract AgentMask is StorageLayout {


    modifier reEntrantLock() {
        require(lockHolder_ == address(0));
        lockHolder_ = msg.sender;
        _;
        lockHolder_ = address(0);
    }

    modifier protocolOnly() {
        require(msg.sender == authority_ && lockHolder_ == address(0));
        lockHolder_ = msg.sender;
        _;
        lockHolder_ = address(0);        
    }
    
    modifier reEntrantApproved (address client, uint256 clientSalt, uint256 agentSalt) {
        casAgent(client, msg.sender, clientSalt, agentSalt);
        require(lockHolder_ == address(0));
        lockHolder_ = client;
        _;
        lockHolder_ = address(0);
    }

    modifier reEntrantAgent (bytes calldata signature,
                             bytes calldata conds,
                             bytes memory payload) {
        require(lockHolder_ == address(0));
        lockHolder_ = lockSigner(signature, conds, payload);
        _;
        lockHolder_ = address(0);
    }

    function lockSigner (bytes calldata signature, bytes calldata conds,
                         bytes memory payload) private returns (address client) {
        (uint8 v, bytes32 r, bytes32 s) =
            abi.decode(signature, (uint8, bytes32, bytes32));
        
        (uint48 deadline, uint48 alive, bytes32 salt, uint32 nonce,
         address relayer)
            = abi.decode(signature, (uint48, uint48, bytes32, uint32, address));
        
        require(deadline == 0 || block.timestamp <= deadline);
        require(block.timestamp >= alive);
        require(relayer == address(0) || relayer == msg.sender || relayer == tx.origin);
        
        bytes32 checksum = keccak256(abi.encode(conds, payload));
        client = ecrecover(checksum, v, r, s);
        require(client != address(0));

        casNonce(client, salt, nonce);
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

    function approveAgent (address router, uint32 nCalls, uint256 userSalt,
                           uint256 routerSalt) internal {
        bytes32 key = bridgeKey(lockHolder_, router, userSalt, routerSalt);
        UserBalance storage bal = userBals_[key];
        bal.agentCallsLeft_ = nCalls;
    }

    function resetNonce (bytes32 nonceSalt, uint32 nonce) internal {
        UserBalance storage bal = userBals_[bridgeKey(lockHolder_, nonceSalt)];
        bal.nonce_ = nonce;
    }

    function casAgent (address client, address agent,
                       uint256 clientSalt, uint256 agentSalt) internal {
        bytes32 key = bridgeKey(client, agent, clientSalt, agentSalt);
        UserBalance storage bal = userBals_[key];
        if (bal.agentCallsLeft_ < type(uint32).max) {
            require(bal.agentCallsLeft_ > 0);
            bal.agentCallsLeft_--;
        }
    }

    function casNonce (address client, bytes32 nonceSalt, uint32 nonce) internal {
        UserBalance storage bal = userBals_[bridgeKey(client, nonceSalt)];
        require(bal.nonce_ == nonce);
        bal.nonce_++;
    }

    function tipRelayer (bytes memory tipCmd) internal {
        if (tipCmd.length > 0) {
            (bytes32 innerKey, uint128 tip, address recv) =
                abi.decode(tipCmd, (bytes32, uint128, address));

            if (recv == address(256)) {
                recv = msg.sender;
            } else if (recv == address(512)) {
                recv = tx.origin;
            } else if (recv == address(1024)) {
                recv = block.coinbase;
            }
            
            bytes32 fromKey = bridgeKey(lockHolder_, innerKey);
            bytes32 toKey = bridgeKey(recv, innerKey);
            require(userBals_[fromKey].surplusCollateral_ >= tip);
            userBals_[fromKey].surplusCollateral_ -= tip;
            userBals_[toKey].surplusCollateral_ += tip;
        }
    }

    function bridgeKey (address user, address token,
                        uint256 userSalt, uint256 tokenSalt) pure
        internal returns (bytes32) {
        bytes32 innerKey = keccak256(abi.encode(userSalt, token, tokenSalt));
        return bridgeKey(user, innerKey);
    }

    function bridgeKey (address user, bytes32 innerKey) pure internal returns (bytes32) {
        return keccak256(abi.encode(user, innerKey));
    }

    function bridgeKey (address user, address token) pure internal returns (bytes32) {
        return bridgeKey(user, token, 0, 0);
    }

    function bridgeKey (address token) view internal returns (bytes32) {
        return bridgeKey(lockHolder_, token, 0, 0);
    }
}
