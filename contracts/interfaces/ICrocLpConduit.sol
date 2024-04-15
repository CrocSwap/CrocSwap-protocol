// SPDX-License-Identifier: GPL-3 

pragma solidity 0.8.19;

import '../libraries/Directives.sol';

/* @title LP conduit interface
 * @notice Standard interface for contracts that accept and manage LP positions on behalf
 *         of end users. Typical example would be an ERC20 tracker for LP tokens. */
interface ICrocLpConduit {

    /* @notice Called anytime a user mints liquidity against the conduit instance. To 
     *         utilize the user would call a mint operation on the dex with the address
     *         of the LP conduit they want to use. This method will be called to notify
     *         conduit contract (e.g. to perform tracking), and the LP position will be
     *         held in the name of the conduit.
     *
     * @param sender The address of the user that owns the newly minted position.
     * @param poolHash The hash (see PoolRegistry.sol) of the AMM pool the liquidity is
     *                 minted on.
     * @param lowerTick The tick index of the lower range (0 if ambient liquidity)
     * @param upperTick The tick index of the upper range (0 if ambient liquidity)
     * @param liq       The amount of liquidity being minted. If ambient liquidity this
     *                  is denominated as ambient seeds. If concentrated this is flat
     *                  sqrt(X*Y) liquidity of the liquidity minted.
     * @param mileage   The accumulated fee mileage (see PositionRegistrar.sol) of the 
     *                  concentrated liquidity at mint time. If ambient, this is zero.
     *
     * @return   Return false if the conduit implementation does not accept the liquidity
     *           deposit. Reverts the transaction. */
    function depositCrocLiq (address sender, bytes32 poolHash,
                             int24 lowerTick, int24 upperTick,
                             uint128 liq, uint72 mileage) external returns (bool);

    function withdrawCrocLiq (address sender, bytes32 poolHash,
                              int24 lowerTick, int24 upperTick,
                              uint128 liq, uint72 mileage) external returns (bool);
}
