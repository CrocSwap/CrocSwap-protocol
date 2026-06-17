# Liquidity Curve Boundaries

Because all liquidity curves are represented by a struct representing price, liquidity, and fee accumulation there are intrinsic limits to what can be represented in CrocSwap pool's liquidity curve. In almost all cases these bounds are far outside the economic limits of any major token pair's market, but developers and users should be aware of where the limits exist and what constraints they impose.

## Price

Price is represented as the *square-root* of the exchange rate between base and quote side tokens in a Q64.64 fixed-point representation. Mathematically this means that curves are incapable of representing token pairs with an exchange rate less than 2^-128 or greater than 2^128. 

Beyond this, the protocol imposes a tighter limit of [2^-48, 2^60] on the curve struct's square root price value. That imposes a [2^-96, 2^120] bound on price itself. No legal operation can move or set the price of a curve outside this bound.

The Q64.64 representation of root price also means that the minimum precision of any price change is 2^-64 in square root space. In percentage terms that means pools with lower prices have lower precision. Since the protocol enforces a minimum value of 2^-48 on root price, all curves have a minimum percentage precision of 2^-16 in square root terms. Or 0.003% in price terms. 

Any swap will have its price impact rounded up in terms of minimum price precision. The floating side of the swap is rounded in favor of the pool to prevent under-collateralization. Practically this means that the swapper will "burn" a small percentage on every swap proportional to the curve's total liquidity and minimum price precision. 

## Concentrated Liquidity

Concentrated liquidity for the curve is represented as 128-bit unsigned integer. Liquidity is represented as the square root of full range XY=K liquidity. This imposes a bound on the liquidity
ceiling of any given pool. 

For pools with a price of unity (1.0), this imposes a limit of 2^128 in terms of XY=K equivalent base or  quote tokens. For tokens with 18 decimals represents over one quintillion XY=K equivalent tokens.

When price is at the minimum legal boundary, the ceiling on liquidity is 2^80 on XY=K equivalent base side tokens. When price is at maximum boundary, the ceiling is 2^68 on XY=K equivalent quote side tokens. Note these min/max bounds represent the more *expensive* token in the pool. Therefore at extreme prices, the numerical limit is tighter but the economic limit is roughly equivalent. 

# Ambient Liquidity

Ambient liquidity is stored in terms of "seeds", which is XY=K liquidity deflated by the cumulative fee rewards. The same bounds from above concentrated liquidity above apply to ambient *seeds*. The ambient *liquidity* is the bounds on ambient seeds deflated by the curve's current accumulated rewards deflator.

The ambient deflator is stored as a Q16.48 fixed point value (see Ambient Rewards section below), and therefore has a maximum value of 2^16. At maximum deflator value, ambient liquidity is subject to the liquidity bounds from above divided by 2^16. 

For pools with price at unity, the bounds at max deflator are to 2^112 of XY=K tokens. For pools with a price at the minimum price boundary, the ceiling on liquidity is 2^64 base side tokens. For pools with a price at the maximum price boundary, the ceiling on liquidity is 2^52 tokens. 

Any operation that would push concentrated liquidity or ambient liquidity seeds above its maximum value will revert. In practice this means that pools may "fill up", and it could be impossible to mint additional liquidity, until existing liquidity is burned.

## Ambient Rewards

Rewards accumulate to ambient liquidity by increasing the "deflator" stored by the Curve strucutre. Ambient liquidity is tracked in terms of seed, which is converted to liquidity by compounding against (1 + deflator).

The deflator is stored as a Q16.48 fixed point value. This imposes a maximum value of 2^16 on this accumulator and a minimum precision increment of 2^-48.

To reach the maximum deflator value, a single unit of ambient liquidity would have to accumulate rewards equivalent to 65 thousand *times* its original capital. Its unlikely that any economically meaningful pool would accumulate this magnitude of rewards/trading volume over any reasonably timeframe. For comparison, the accumulated fees on a single unit of full-range liquidity in Uniswap V3's ETH/USDC pool has accumulated on the order of less than 1 times its original capital in over a year. 

However users should be aware that if the maximum deflator is reached **ambient liquidity will stop collecting rewards** in that pool. The protocol will stop incrementing the deflator value, which means that any rewards accumulated to the ambient liquidity in the pool will essentially be burned. The underlying capital will remain available to withdraw, but there will no longer be economic incentive to provide ambient liquidity in this pool. However concentrated liquidity will continue to accumulate rewards in this scenario.

Practically speaking if this happens, protocol governance should strongly consider initializing another pool for the token pair. Since an essentially infinite number (2^256) of pools on the same pair can exist in the protocol, there is no meaningful barrier to creating a new pool, which will reset the ambient rewards accumulator. 