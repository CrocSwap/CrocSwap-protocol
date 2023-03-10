// SPDX-License-Identifier: GPL-3                                                          
pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import './StorageLayout.sol';
import './SettleLayer.sol';
import '../interfaces/IERC20Minimal.sol';

contract DepositDesk is SettleLayer {
    using SafeCast for uint256;

    /* @notice Directly deposits a certain amount of surplus collateral to a user's
     *         account.
     *
     * @dev    This call can be used both for token and native Ether collateral. For the
     *         latter the user must set msg.value with the corresponding amount. Because
     *         it deals with msg.value, this function must *never* be called twice in the
     *         same transaction, to avoid the risk of double-spend.
     *
     * @param recv The address of the owner associated with the account.
     * @param value The amount to be collected from owner and deposited.
     * @param token The ERC20 address of the token (or native Ether if set to 0x0) being
     *              deposited. */
    function depositSurplus (address recv, uint128 value, address token) internal {
        debitTransfer(lockHolder_, value, token, popMsgVal());
        bytes32 key = tokenKey(recv, token);
        userBals_[key].surplusCollateral_ += value;
    }

    /* @notice Same as deposit surplus, but used with EIP-2612 compliant tokens that have
     *         a permit function. Allows the user to avoid needing to approve() the DEX
     *         contract.
     *
     * @param recv  The address which will receive the surplus collateral balance
     * @param value The amount of tokens being deposited
     * @param token The address of the token deposited
     * @param deadline The deadline that this ERC20 permit call is valid for
     * @param v,r,s  The EIP-712 signature approviing Permit of the token underlying 
     *               token to be deposited. */
    function depositSurplusPermit (address recv, uint128 value, address token,
                                   uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        internal {
        IERC20Permit(token).permit(recv, address(this), value, deadline, v, r, s);
        depositSurplus(recv, value, token);
    }

    /* @notice Pays out surplus collateral held by the owner at the exchange.
     *
     * @dev There is no security check associated with this call. It's the caller's 
     *      responsibility of the caller to make sure the receiver is authorized to
     *      to collect the owner's balance.
     *
     * @param recv  The receiver where the collateral will be sent to.
     * @param size  The amount to be paid out. Owner's balance will be decremented 
     *              accordingly. Be aware this uses the following convention:
     *                  Positive - pay out the fixed size amount
     *                  Zero     - pays out the entire balance
     *                  Negative - pays out the entire balance *excluding* the size amount
     * @param token The ERC20 address of the token (or native Ether if set to 0x0) being
     *              disbursed. */
    function disburseSurplus (address recv, int128 size, address token) internal {
        bytes32 key = tokenKey(lockHolder_, token);
        uint128 balance = userBals_[key].surplusCollateral_;
        uint128 value = applyTransactVal(size, balance);

        // No need to use msg.value, because unlike trading there's no logical reason
        // we'd expect it to be set on this call.
        userBals_[key].surplusCollateral_ -= value;
        creditTransfer(recv, value, token, 0);
    }

    /* @notice Transfers surplus collateral from one user to another.
     * @param to The user account the surplus collateral will be sent from
     * @param size The total amount of surplus collateral to send. 
     *             Be aware this uses the following convention:
     *                  Positive - pay out the fixed size amount
     *                  Zero     - pays out the entire balance
     *                  Negative - pays out the entire balance *excluding* the size amount
     * @param token The address of the token the surplus collateral is sent for. */
    function transferSurplus (address to, int128 size, address token) internal {
        bytes32 fromKey = tokenKey(lockHolder_, token);
        bytes32 toKey = tokenKey(to, token);
        moveSurplus(fromKey, toKey, size);
    }

    /* @notice Moves an existing surplus collateral balance to a "side-pocket" , or a 
     *         separate balance tied to an arbitrary salt.
     *
     * @dev    This is primarily useful for pre-signed transactions. For example a user
     *         could move the bulk of their surplus collateral to a side-pocket to min
     *         what was at risk in their primary balance.
     *
     * @param fromSalt The side pocket salt the surplus balance is being moved from. Use
     *                 0 for the primary surplus collateral balance. 
     * @param toSalt The side pocket salt the surplus balance is being moved to. Use 0 for
     *               the primary surplus collateral balance.
     * @param size The total amount of surplus collateral to send.  
     *             Be aware this uses the following convention:
     *                  Positive - pay out the fixed size amount
     *                  Zero     - pays out the entire balance
     *                  Negative - pays out the entire balance *excluding* the size amount
     * @param token The address of the token the surplus collateral is sent for. */
    function sidePocketSurplus (uint256 fromSalt, uint256 toSalt, int128 size,
                                address token) internal {
        address from = virtualizeUser(lockHolder_, fromSalt);
        address to = virtualizeUser(lockHolder_, toSalt);
        bytes32 fromKey = tokenKey(from, token);
        bytes32 toKey = tokenKey(to, token);
        moveSurplus(fromKey, toKey, size);
    }

    /* @notice Lower level function to move surplus collateral from one fully salted 
     *         (user+token+side pocket) to another fully salted slot. */
    function moveSurplus (bytes32 fromKey, bytes32 toKey, int128 size) private {
        uint128 balance = userBals_[fromKey].surplusCollateral_;
        uint128 value = applyTransactVal(size, balance);

        userBals_[fromKey].surplusCollateral_ -= value;
        userBals_[toKey].surplusCollateral_ += value;
    }

    /* @notice Converts an encoded transfer argument to the actual quantity to transfer.
     *         Includes syntactic sugar for special transfer types including:
     *            Positive Value - Transfer this specified amount
     *            Zero Value - Transfer the full balance
     *            Negative Value - Transfer everything *above* this specified amount. */
    function applyTransactVal (int128 qty, uint128 balance) private pure
        returns (uint128 value) {
        if (qty < 0) {
            value = balance - uint128(-qty);
        } else if (qty == 0) {
            value = balance;
        } else {
            value = uint128(qty);
        }
        require(value <= balance, "SC");        
    }
}

