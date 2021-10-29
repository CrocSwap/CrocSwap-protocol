# Encoding Public Calls

To optimize gas, certain public CrocSwap methods do not rely on Solidity native encoding. Clients calling these functions must directly encode a byte string
based on specification described here. CrocSwap will also make available a TypeScript based SDK to support client-side encoding.

This "special encoding" applies to three public methods on the `CrocSwapDex` contract:

* `tradeWarm(bytes)`: Apples a single, simple, gas-optimized, atomic trading actions within a single pool
* `trade(bytes)`: Applies an arbitrary complex compound order directive across potentially multiple pairs and pools.
* `protocolCmd(bytes)`: Consolidates another of administrative commands that belong to the protocol authority.

## tradeWarm() Method Call

The input argument for this method uses a simple binary encoding of a fixed number of fields. For certain command types some of those fields may not be relevant, 
in which case the value of those fields are ignored. 
