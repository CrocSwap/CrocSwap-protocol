# Encoding Public Calls

To optimize gas, certain public CrocSwap methods do not rely on Solidity native encoding. Clients calling these functions must directly encode a byte string
based on specification described here. CrocSwap will also make available a TypeScript based SDK to support client-side encoding.

This "special encoding" applies to three public methods on the `CrocSwapDex` contract:

* `tradeWarm(bytes)`: Apples a single, simple, gas-optimized, atomic trading actions within a single pool
* `trade(bytes)`: Applies an arbitrary complex compound order directive across potentially multiple pairs and pools.
* `protocolCmd(bytes)`: Consolidates another of administrative commands that belong to the protocol authority.

## tradeWarm() Method Call

The input argument for this method uses a simple binary encoding of a fixed number of fields. The layout for the argument encoding is below:

![tradeWarm() Encoding](assets/WarmPath.png)

Details for these fields:
* Action code: Code specifying the atomic trade action for the call. (Note that swap() is a dedicated call for gas optimization purposes.)
* Base token: Base side token speciying the pair.
* Quote token: Quote side token specifying the pair.
* Pool type index: The index of the pool type to use.
* Bid tick: The price tick of the lower boundary (only applicate for range orders)
* Ask tick: The price tick of the upper boundary (only applicate for range orders)
* Liquidity: The amount of liquidity to be added or removed
* Limit price lower: The threshold price below which the transaction will be aborted
* Limit price upper: The threshold price above which the transaction will be aborted
* Use surplus collateral: Flag indicating whether the user wants to settle with the surplus collateral they hold at the exchange.

For certain command types some of those fields may not be relevant, in which case the value of those fields are ignored. Regardless of the type of the field, all
field slots are big-Endian, occupy 32 bytes and are padded with zeros. Therefore the encoded byte string is equivalent to calling abi.encode on the field arguments.

## trade() Method Call

The input argument for this method is a binary encoding, but with several nested variable length array fields. Each array field is preceded by a count field that
must allign with the number of elements in the array. The nested structure is visualized below. (

![trade() Order Directive](assets/OrderDirective.jpg)


