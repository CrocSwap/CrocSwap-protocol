
This doc outlines the layout of the repository and highlights important source files.

# ./contracts

* CrocSwap.sol - The top level smart contract for the entire decentralized exchange protocol. One contract
instances manages every pair and the protocol and serves as a single point of entry for end-users.

# ./contracts/libraries

Contains standalone libraries used by the application. 

Math and calculation libraries:

* FixedPoint.sol - Math for safe fixed point arithmetic.
* BitMath.sol - Calculates most/least significant digit in 256-bit integers
* TickMath.sol - Converts price ratios to/from basis point ticks
* LiquidityMath.sol - Math related to a constant product AMM curve's total liquidity.
* CompoundMath.sol - Calculators for compound growth and deflation rates
* CurveMath.sol - Computes price and reserve changes across a constant product AMM curve.

Libraries related to exeucting swaps 

* CurveRoll.sol - Derives flow on a constant-product AMM curve based on targeted price or reserve changes
* CurveAssimilate.sol - Converts collected fees into liquidity on the AMM curve. 
* SwapCurve.sol - Executes a swap against an AMM curve and calculates the input, output and fees.
* CurveCache.sol - Convenience function for caching the expensive re-computation of the price tick.
* Bitmaps.sol - Tracks which ticks have active concentrated liquidity positions.

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
* OracleHist - Tracks the history of pool price and liquidity over time. (Not currently used.)
* TradeMatcher.sol - Executes the logic related to swapping, minting, or burning on a curve.
* MarketSequencer.sol - Orchestrates a sequence of tradable actions within a single pool.
* PoolRegistry.sol - Maps the market specification context (fee amount, tick size, etc.) to individual pools.
* SettleLayer.sol - Handles the logic of sending netted out tokens/ethereum to the user.
* AgentMask.sol - Facility for external smart contracts to provide LP positions and swaps to end-users.
* ColdInjector.sol - Wrappers for delegate-calling functions in sidecar contracts.

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

# ./contracts/tests

This directory contains smart contracts that aren't meant to be directly used but are useful for testing and debugging
purposes

# ./tests

Typescript test suite using Hardhat and Chai.

