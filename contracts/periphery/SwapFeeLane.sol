// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../CrocSwapDex.sol";
import "./FeeModulator.sol";

/* @notice Contract allows for pre-authorized senders to swap tokens at a preferential fee rate. */
contract SwapFeeLane {

    address public admin_;
    address immutable public dex_;
    address immutable public feeModulator_;
    address immutable public query_;

    mapping(address => uint256) public swappers_;

    uint256 immutable public baseFee_;

    event CrocSwapFeeImprove (address indexed user, address indexed base, address indexed quote, 
        uint256 poolIdx, uint256 feeRate, uint16 tip);

    constructor (address feeModulator, address query, address dex, uint256 baseFee) {
        feeModulator_ = feeModulator;
        query_ = query;
        dex_ = dex;
        baseFee_ = baseFee;
        admin_ = msg.sender;
    }

    function swap (address base, address quote,
                   uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip,
                   uint128 limitPrice, uint128 minOut,
                   uint8 reserveFlags) external payable onlySwapper {
        // Lower the fee rate for the swap
        PoolSpecs.Pool memory pool = CrocQuery(query_).queryPoolParams(base, quote, poolIdx);
        FeeModulatorConduit(feeModulator_).changeFeeUnivMod(base, quote, poolIdx, baseFee_);
        emit CrocSwapFeeImprove(msg.sender, base, quote, poolIdx, baseFee_, tip);

        // Execute the swap
        bytes memory cmd = abi.encode(base, quote, poolIdx, isBuy, inBaseQty, qty, tip, limitPrice, minOut, reserveFlags);
        CrocSwapDex(dex_).userCmdRouter{value: msg.value}(CrocSlots.SWAP_PROXY_IDX, cmd, msg.sender);

        // Restore the fee rate
        FeeModulatorConduit(feeModulator_).changeFeeUnivMod(base, quote, poolIdx, pool.feeRate_);   

        // Forward any refunded ETH back to the caller
        if (address(this).balance > 0) {
            payable(msg.sender).transfer(address(this).balance);
        }     
    }

    function changeAdmin (address admin) external onlyAdmin {
        admin_ = admin;
    }

    function addSwapper (address swapper) external onlyAdmin {
        swappers_[swapper] = 1;
    }

    function removeSwapper (address swapper) external onlyAdmin {
        swappers_[swapper] = 0;
    }

    modifier onlyAdmin {
        require(msg.sender == admin_, "SwapFeeLane: unauthorized");
        _;
    }

    modifier onlySwapper {
        require(swappers_[msg.sender] > 0, "SwapFeeLane: unauthorized");
        _;
    }
}
