// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './StorageLayout.sol';
import './SettleLayer.sol';
import '../interfaces/ICrocVirtualToken.sol';

contract DepositDesk is SettleLayer {
    using SafeCast for uint256;

    /* @notice Directly deposits a certain amount of surplus collateral to a user's
     *         account.
     *
     * @dev    This call can be used both for token and native Ether collateral. For the
     *         lateral the user must set msg.value with the corresponding amount. Because
     *         it deals with msg.value, this function must *never* be called twice in the
     *         same transaction, to avoid the risk of double-spend.
     *
     * @param owner The address of the owner associated with the account.
     * @param value The amount to be collected from owner and deposited.
     * @param token The ERC20 address of the token (or native Ether if set to 0x0) being
     *              deposited. */
    function depositSurplus (address recv, uint128 value, address token) internal {
        debitTransfer(lockHolder_, value, token, msg.value.toUint128());
        bytes32 key = tokenKey(recv, token);
        userBals_[key].surplusCollateral_ += value;
    }

    /* @notice Pays out surplus collateral held by the owner at the exchange.
     *
     * @dev There is no security check associated with this call. It's the caller's 
     *      responsibility of the caller to make sure the receiver is authorized to
     *      to collect the owner's balance.
     *
     * @param owner The address of the owner associated with the account.
     * @param recv  The receiver where the collateral will be sent to.
     * @param size  The amount to be paid out. Owner's balance will be decremented 
     *              accordingly.
     * @param token The ERC20 address of the token (or native Ether if set to 0x0) being
     *              disbursed. */
    function disburseSurplus (address recv, int128 size, address token) internal {
        bytes32 key = tokenKey(lockHolder_, token);
        uint128 balance = userBals_[key].surplusCollateral_;
        uint128 value = applyTransactVal(size, balance);

        // No need to use msg.value, because unlike trading there's no logical reason
        // we'd expect it to be set on this call.
        creditTransfer(recv, value, token, 0);
        userBals_[key].surplusCollateral_ -= value;
    }

    function transferSurplus (address to, int128 size, address token) internal {
        bytes32 fromKey = tokenKey(lockHolder_, token);
        bytes32 toKey = tokenKey(to, token);
        moveSurplus(fromKey, toKey, size);
    }

    function sidePocketSurplus (uint256 fromSalt, uint256 toSalt, int128 size,
                                address token) internal {
        address from = virtualizeUser(lockHolder_, fromSalt);
        address to = virtualizeUser(lockHolder_, toSalt);
        bytes32 fromKey = tokenKey(from, token);
        bytes32 toKey = tokenKey(to, token);
        moveSurplus(fromKey, toKey, size);
    }

    function moveSurplus (bytes32 fromKey, bytes32 toKey, int128 size) private {
        uint128 balance = userBals_[fromKey].surplusCollateral_;
        uint128 value = applyTransactVal(size, balance);

        userBals_[fromKey].surplusCollateral_ -= value;
        userBals_[toKey].surplusCollateral_ += value;
    }

    function depositVirtual (address tracker, uint256 tokenSalt, uint128 value,
                             bytes memory extraArgs) internal {
        bytes32 toKey = tokenKey(lockHolder_, tracker, tokenSalt);
        userBals_[toKey].surplusCollateral_ += value;

        bool success = ICrocVirtualToken(tracker).depositCroc
            (lockHolder_, tokenSalt, value, extraArgs);
        require(success, "VF");
    }

    function disburseVirtual (address tracker, uint256 tokenSalt, int128 size,
                              bytes memory extraArgs)
        internal {
        bytes32 fromKey = tokenKey(lockHolder_, tracker, tokenSalt);
        uint128 balance = userBals_[fromKey].surplusCollateral_;

        uint128 value = applyTransactVal(size, balance);
        userBals_[fromKey].surplusCollateral_ -= value;        

        bool success = ICrocVirtualToken(tracker).withdrawCroc
            (lockHolder_, tokenSalt, value, extraArgs);
        require(success, "VF");   
    }

    /* @notice Converts an encoded trasnfer argument to the actual quantity to transfer.
     *         Checks that the balance supports the requested value, and treats an 
     *         argument of zero as a special case to transfer the entire balance. */
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

