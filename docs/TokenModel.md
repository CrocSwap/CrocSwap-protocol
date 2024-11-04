# Token Model

## Token Safety Assumptions

CrocSwap is a fully permissionless AMM, and users can create pools on any token pairs. Users should be aware that the presence of a token pool in the dex contract **does not** indicate that the token is safe to interact with. 

An unsafe or malicious token could easily lead to any pools with that token becoming silently under-collateralized. For example if a malicious token zeroes the `CrocSwapDex` address balance in the token tracker contract. If a pool becomes under-collateralized it may no longer be possible to recover the underlying tokens in an existing liquidity position. Therefore users, particularly liquidity providers **must fully trust** all tokens for CrocSwap pools that they’re interacting with.

In addition CrocSwap does not natively support fee on transfer, rebase tokens, or any other token that doesn’t respect the ERC20 `transfer()` and `transferFrom()`standard. In addition CrocSwap verifies that transfer amount matches at pool initialization time, but for efficiency does not check on any subsequent calls. If a token ever stops conforming to the `transfer()` ERC20 standard, a pool may be silently become under-collateralized or silently underpay the receiver leg of a `swap()` call. Therefore users, both swappers and liquidity providers, must be responsible in assuring that any tokens they’re interacting with on CrocSwap are fully compliant with the ERC20 standard, do not have fee on transfer, are not rebasing.

The same standards apply to user surplus collateral balances. A user depositing a surplus collateral balance to the `CrocSwapDex` contract is responsible for assuring that all of the above conditions are true for that token otherwise the token balance may become **partially or fully uncrecoverable**.

## Contract Wide Safety

The above being said, the presence of malicious or non-conforming tokens in the `CrocSwapDex` contract has no effect on the full collateralization of safe tokens. Any mint, burn, or swap operation on the pool transfers a token amount that fully collateralizes both sides of the pool. 

A safe token paired with an unsafe token may result in the under-collateralization of the unsafe token in the pool, but will never result in the under-collateralization of the safe conforming token (However keep in mind that because liquidity position transfers are atomic, a malicious token **may still** liquidity positions in that specific pair **unrecoverable** on both sides.)

Similar argument applies to surplus collateral balances. The only way for a user to credit the surplus collateral balance for a specific token is to deposit that specific tokens. An unsafe token will never collateralize the surplus collateral balance of a safe token (or vice versa). Therefore an unsafe token deposit may result in the contract wide under-collateraization of that unsafe token, but never result in the under-collateralization of separately debited safe tokens.
