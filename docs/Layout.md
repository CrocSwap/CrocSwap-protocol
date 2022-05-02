
This doc outlines the layout of the repository and highlights important source files.

# ./contracts

* CrocSwapDex.sol - The top level smart contract for the entire decentralized exchange protocol. One contract
instances manages every pair and the protocol and serves as a single point of entry for end-users.
* CrocEvents.sol - Defines top-level Ethereum log events inside the protocol

# ./contracts/governance

* CrocPolicy.sol - Middle-layer contract sitting between top-level governance and the underlying CrocSwapDex mechanism
contract. Allows for either straight pass through of governance resolutions or for rules governing what external 
policy oracles can invoke on the underlying CrocSwapDex contract.

# ./contracts/libraries

Contains standalone libraries used by the application. 

Math and calculation libraries:

* FixedPoint.sol - Math for safe fixed point arithmetic.
* BitMath.sol - Calculates most/least significant digit in 256-bit integers
* TickMath.sol - Converts price ratios to/from basis point ticks
* LiquidityMath.sol - Math related to a constant product AMM curve's total liquidity.
* CompoundMath.sol - Calculators for compound growth and deflation rates
* CurveMath.sol - Computes price and reserve changes across a constant product AMM curve.

Libraries related to exeucting swaps and tracking LP positions

* CurveRoll.sol - Derives flow on a constant-product AMM curve based on targeted price or reserve changes
* CurveAssimilate.sol - Converts collected fees into liquidity on the AMM curve. 
* SwapCurve.sol - Executes a swap against an AMM curve and calculates the input, output and fees.
* CurveCache.sol - Convenience function for caching the expensive re-computation of the price tick.
* Bitmaps.sol - Tracks which ticks have active concentrated liquidity positions.
* KnockoutLiq.sol - Defines set of common operation for knockout liquidity.

Libraries related to executing high-level order directives

* Directives.sol - Common structs for representing user orders
* Encoding.sol - Converts raw bytes[] data into order directives structs
* Chaining.sol - Used to track and manipulate the flow of tokens within a single pair
* TokenFlow.sol - Joins token flows when executing orders that span multiple pairs.
* PoolSpecs.sol - Represents market spec context of a liquidity pool (fee amount, tick size, etc.)
* PriceGrid.sol - Enforces tick grid. Determines which price ticks are legal to add range orders to.

Misc helper libraries:

* TokenTransfer.sol - Functions for safe transfer of tokens
* SafeCast.sol - Helper functions for safely converting between integer types

# ./contracts/mixins

Contains stubs of contracts that are not meant to be deployed directly, but provide functionality which
can be imported into a top-level smart contract.

* StorageLayout.sol - Provides unified layer for EVM storage, to enforce consistent slots.
* LiquidityCurve.sol - Tracks and manipulates the AMM curves across all pools.
* LevelBook.sol - Tracks tick-indexed positions related to range orders and concentrated liquidity.
* TickCensus.sol - Stores which ticks in which pools have active concentrated liquidity positions.
* PositionRegistrar.sol - Tracks individual liquidity provider positions and fee accumulation.
* ProtocolAccount.sol - Tracks and pays out the accumulated protocol fees.
* KnockoutCounter.sol - Tracks both individual and aggregated LP positions for knockout liquidity.
* TradeMatcher.sol - Executes the logic related to swapping, minting, or burning on a curve.
* MarketSequencer.sol - Orchestrates a sequence of tradable actions within a single pool.
* PoolRegistry.sol - Maps the market specification context (fee amount, tick size, etc.) to individual pools.
* SettleLayer.sol - Handles the logic of sending netted out tokens/ethereum to the user.
* AgentMask.sol - Facility for external smart contracts and off-chain relayers to provide execution for end-users      
* ColdInjector.sol - Wrappers for delegate-calling functions in sidecar contracts.

# ./contracts/interfaces/

Abstract interfaces related to external calls made by the CrocSwap contract in certain circumstances.

* ICrocCondOracle.sol - Conditional oracle interface used for commands where an arbitrary condition is checked before executing.
* ICrocLpConduit.sol - Defines an LP conduit that accepts and manages liquidity on behalf of users.
* ICrocVirtualToken.sol - Portal for defining the deposit and withdraw of virtualized tokens into the dex.
* ICrocPermitOracle.sol - Defines a permissioned pool oracle that gatekeeps access to one or more pools
* ICrocMinion.sol - Defines an interface to be called by CrocPolicy contract (implemented by CrocSwapDex contract)

# ./contracts/periphery/

* CrocLpErc20.sol - Implements ICrocLpConduit to wrap ambient liquidity into a standardized ERC20 LP token.

# ./contracts/callpaths/

The full protocol doesn't fit within Ethereum's 24kb contract size limit. Therefore we move certain functions
to "sidecar contracts". These contracts are not meant to be directly call or store their own state. They're 
only used as delegate-call targets. (Because everything uses the StorageLayout.sol pattern the storage slot
view is consistent across code.)

* HotPath.sol - Contains public function for simple swap, the most widely used operation on dex. Unlike the other
contracts, this is meant to be directly imported into the main contract, insteaad of deployed separately. That's
because we want to minimize gas cost by avoiding a delegate-call and EXTCODE penalty.
* WarmPath.sol - Contains other common simple operations (mints and burns to liquidity positions) that can be gas-optimized.
* LongPath.sol - Contains function for building arbitrarily long complex operations over multiple pairs and pools.
* MicroPaths.sol - Sidecar contract for small atomic operations that are called within the context of LongPath.sol
* KnockoutPath.sol - Sidecar contract for managing knockout liquidity LP positions.
* MultiPath.sol - Convenience sidecars that nests multiple calls across different sidecars into a single top-level call
* SafeModePath.sol - Special purpose sidecar proxy s the only accessible code path during emergency safe mode.

# ./contracts/tests

This directory contains smart contracts that aren't meant to be directly used but are useful for testing and debugging
purposes

# ./tests

Typescript test suite using Hardhat and Chai.

