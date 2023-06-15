# JIT Liquidity Threat Model

## Introduction

Concentrated liquidity AMMs running on open blockchains are subject to a particular attack vector known as *just-in-time (JIT) liquidity*. In this model a JIT attacker observes a pending swap order in the mempool. The JIT attacker then colludes with the block builder to mint a highly concentrated liquidity in the pool immediately before the swap, then burn that liquidity position immediately after the swap. This is process constitutes a *JIT sandwich*.

Concentrated liquidity is highly capital efficient, especially for very narrow range orders that can be used when the JIT attacker knows the next swap price ahead of time. Therefore with a relatively small amount of capital, the JIT liquidity can temporarily make up a large fraction of the active liquidity at the time of the swap, earning a large fraction of the pro-rata fees paid by the swap. 

Since the JIT attacker immediately removes the position immediately following the swap, the attacker has no risk and exactly knows its exact position before and after the swap. By contrast the passive liquidity providers in the pool, who do take meaningful *impermanent loss* (IL) risk have their accumulated rewards diluted by the JIT attacker.

## CrocSwap Mitigation

CrocSwap mitigates the risk of JIT by having a per-pool parameter set by governance that specifies a minimum TTL for every concentrated liquidity position in the pool. This value can be set anywhere between 0 and 2550 seconds, as measured by block time. 

Since every transaction in a classical JIT sandwich occurs in the same block, and therefore the same block time, this becomes impossible if the TTL parameter is set to any value greater than zero. 

## Multiblock JIT

A *multi-block JIT sandwich* is similar to a classical *JIT sandwich* but occurs when the JIT attacker coordinates with a block builder who has control over multiple sequential blocks. This is common in PoS consensus systems such as Ethereum, since any validator will probabilistically be assigned sequential blocks some fraction of the time based on their stake weight. 

Multi-block JIT is still risk free, because the block builder can guarantee that no swaps on the pool occur between the mint and burn part of the transaction. Unlike a single-block JIT sandwich the blocktime of the burn will be greater than the mint blocktime since it occurs in a later block.

Therefore non-zero JIT is not sufficient to prevent multi-block JIT sandwiches. However the probability of any single validator controlling N sequential blocks decreases exponentially with the size of N. Therefore with a sufficiently large TTL time, the probability that the multi block builder will control that long of a time range becomes exponentially small. 

The upper boundary of the TTL parameter (2550 seconds) represents over 200 sequential blocks at Ethereum’s current block times. The probability any validator being assigned this many sequential blocks is vanishingly small.

## Open-Faced JIT Sandwich

An *open-faced JIT sandwich* occurs when the attacker still colludes with the block builder to mint a large fraction of the pool’s active liquidity immediately before the target swap, but doesn’t include the removal. 

In the case of CrocSwap open-faced JIT sandwiches are still possible, but the attacker must wait a minimum of TTL time before removing their order. In this case the attacker still has an economic advantage over the passive liquidity providers in the pool, because they’re timing their position to coincide with a fee accumulation event. So attacks of this type may still be attractive.

However the attacker is at a distinct economic disadvantage relative to a classical JIT sandwich. First, the attacker must tie up capital. Instead of a single block, capital remains locked in the position for the TTL lifetime. Second, unlike a classical JIT sandwich, the attacker does take meaningful economic risk because the liquidity remains active for the TTL lifetime. 

In particular JIT attacks rely on highly concentrated liquidity, whereas the IL risk of any given AMM position scales with its concentration. In classical JIT, there is no IL risk because there is no uncontrolled interaction with incoming swaps. But in an open-faced sandwich the JIT attacker incurs high concentration IL risk for the duration of the TTL lifetime. 

Due to these points the attractiveness of open-faced JIT decreases the longer the TTL lifetime is set. At an upper bound of 2550 seconds (approximately 42 minutes), this constitutes a period of active volatility and swap activity in almost any major non-stable token pair. Therefore we expect open-faced JIT sandwiches to be non-zero but significantly less attractive and therefore less common than unrestricted JIT liquidity.
