pragma solidity 0.8.19;

import "../CrocSwapDex.sol";
import "../lens/CrocImpact.sol";
import "../libraries/SwapHelpers.sol";
import "../interfaces/IERC20Minimal.sol";

contract BeraCrocMultiSwap {
    CrocSwapDex public immutable crocSwapDex;
    CrocImpact private immutable crocImpact;

    constructor(address _crocSwapDex, address _crocImpact) {
        crocSwapDex = CrocSwapDex(_crocSwapDex);
        crocImpact = CrocImpact(_crocImpact);
    }

    /* @notice Preview a series of swaps between multiple pools.
     *
     * @dev A convenience method for previewing a series of swaps in sequence. This is
     *      to be used in conjunction with some form of an off-chain router as the input
     *      arguments assume the user already knows the exact sequence of swaps to
     *      perform.
     *  
     * @param steps The series of swap steps to be performed in sequence.
     * @return out the amount to be received from the multiswap. */
    function previewMultiSwap(
        SwapHelpers.SwapStep[] memory _steps,
            uint128 _amount
    ) external view returns (uint128 out) {
        require(_steps.length != 0, "No steps provided");
        SwapHelpers.SwapStep memory initStep = _steps[0];
        uint128 quantity = _amount;
        address inputAsset;
        initStep.isBuy ? inputAsset = initStep.base : inputAsset = initStep.quote;
        for (uint256 i=0; i < _steps.length; ) {
            SwapHelpers.SwapStep memory step = _steps[i];
            address swapAsset;
            step.isBuy ? swapAsset = step.base : swapAsset = step.quote;
            require(inputAsset == swapAsset, "Invalid swap sequence");
            if (step.isBuy) {
                // We use the max uint128 as the limit price to ensure the swap executes
                // Given that we have full range liquidity, there is no min limit price
                // Slippage can be controlled by the minOut parameter
                (, int128 quoteFlow,) = crocImpact.calcImpact(step.base, step.quote, step.poolIdx,
                step.isBuy, true, quantity, 0, type(uint128).max);
                // Received amount is always negative
                quantity = uint128(-quoteFlow);
                inputAsset = step.quote;
            } else {
                // Limit price is 0 here for the inverse reason above
                (int128 baseFlow,,) = crocImpact.calcImpact(step.base, step.quote, step.poolIdx,
                step.isBuy, false, quantity, 0, 0);
                // Received amount is always negative
                quantity = uint128(-baseFlow);
                inputAsset = step.base;
            }
            unchecked { i++; }
        }
        return quantity;
    }

    /* @notice Performs a series of swaps between multiple pools.
     *
     * @dev A convenience method for performing a series of swaps in sequence. This is
     *      to be used in conjunction with some form of an off-chain router as the input
     *      arguments assume the user already knows the exact sequence of swaps to
     *      perform.
     *  
     * @param steps The series of swap steps to be performed in sequence.
     * @return The token base and quote token flows associated with this swap action. 
     *         (Negative indicates a credit paid to the user, positive a debit collected
     *         from the user) */
    function multiSwap (
            SwapHelpers.SwapStep[] memory _steps,
            uint128 _amount,
            uint128 _minOut
        ) public payable returns (uint128 out) {
            require(_steps.length != 0, "No steps provided");
            SwapHelpers.SwapStep memory initStep = _steps[0];
            uint128 quantity = _amount;
            uint128 minOut = 0;
            address inputAsset;
            initStep.isBuy ? inputAsset = initStep.base : inputAsset = initStep.quote;
            IERC20Minimal(inputAsset).transferFrom(msg.sender, address(this), uint256(quantity));
            for (uint256 i=0; i < _steps.length; ) {
                SwapHelpers.SwapStep memory step = _steps[i];
                address swapAsset;
                step.isBuy ? swapAsset = step.base : swapAsset = step.quote;
                require(inputAsset == swapAsset, "Invalid swap sequence");
                // Set the minOut to the last step's minOut
                if (i == _steps.length-1) {
                    minOut = _minOut;
                }
                IERC20Minimal(inputAsset).approve(address(crocSwapDex), uint256(quantity));                
                if (step.isBuy) {
                    // We use the max uint128 as the limit price to ensure the swap executes
                    // Given that we have full range liquidity, there is no min limit price
                    // Slippage can be controlled by the minOut parameter
                    (, int128 quoteFlow) = crocSwapDex.swap(step.base, step.quote, step.poolIdx,
                    step.isBuy, true, quantity, 0, type(uint128).max, minOut, 2);
                    // Received amount is always negative
                    quantity = uint128(-quoteFlow);
                    inputAsset = step.quote;
                } else {
                    // Limit price is 0 here for the inverse reason above
                    (int128 baseFlow,) = crocSwapDex.swap(step.base, step.quote, step.poolIdx,
                    step.isBuy, false, quantity, 0, 0, minOut, 2);
                    // Received amount is always negative
                    quantity = uint128(-baseFlow);
                    inputAsset = step.base;
                }
                unchecked { i++; }
            }
            // Final step
            SwapHelpers.SwapStep memory finalStep = _steps[_steps.length-1];
            // Out asset based on isBuy
            address outAsset;
            outAsset = finalStep.isBuy ? finalStep.quote : finalStep.base;
            IERC20Minimal(outAsset).transfer(msg.sender, uint256(quantity));
            return quantity;
    }
}
