# Upgrade Guidelines

## Introduction

The CrocSwap protocol, particularly the core `CrocSwapDex` contract is designed to be incrementally and modularly upgradeable, subject to protocol governance. The core smart contract is designed to support up to 65,000 attached proxy contracts. Any proxy contract can be directly invoked by an end-user with the `userCmd` or `protocolCmd` function call to the `CrocSwapDex` contract.

Although the architecture is highly amenable to incremental upgrades, the upgrade process is still a highly risky operation and should be carefully considered and reviewed before being executed. In addition given the relatively unique architecture of the smart contract there are a set of specific considerations and guidelines that should be applied to any proposed upgrade.

## Risk & Safety

First, no upgrade operation should ever be executed without extremely high confidence in its correctness and safety. **A single bad proxy upgrade could lead to all assets in the protocol being permanently unrecoverable and/or stolen**. 

All proxy contracts have access to read or overwrite any part of the entire storage state of the `CrocSwapDex` contract including pool and user positions and balances, as well invoke `transferFrom()` on any token a user has approved for the `CrocSwapDex` contract address.

To mitigate this, it is highly suggested that any upgrade authority (see the CrocSwap Governance documentation) be set behind a timelock contract with a long-delay. This assures that every user has enough time to exercise the option opt out of any proposed upgrade by removing their positions and assets beforehand.

## Storage Collisions

All proxy contract code operates on the same common storage state inside the core `CrocSwapDex` contract. Therefore it is imperative that no proxy contract ever have any storage variable collisions with any other contract.

To facilitate this, all proxy contracts should inherit from the `StorageLayout` mixin. All storage variables should be defined in the `StorageLayout` mixin and never in any other contract. When possible any new proxy contract should avoid ever altering the `StorageLayout` mixin. If and when an additional storage variable is needed that variable should be added to the end of the `StorageLayout` mixin to avoid colliding with any previous version. After a variable is added, it should be retained in the mixin forever. Storage variables should never be removed or re-ordered within the mixin.

If possible any new proxy contract should use the version of Solidity used by previous versions proxy contract implementations. This is to avoid the risk of a Solidity version changing the contract to EVM storage layout, inadvertently leading to a slot collision. If a new version of Solidity is used the storage layout should be carefully and exactly compared to the layout used by previous proxy contract versions.

Even give all of the above, the generated storage layout of any new proxy contract should be carefully and manually reviewed to assure that it conforms with the layout used by previous proxy contracts.

## Off-Limit Variables

There are a subset of variables in `StorageLayout` that any proxy contract implementation should avoid ever modifying or over-writing, because they are highly critical to contract safety.

`lockHolder_` should never be written to by a proxy contract. It is set at the beginning  of the top-level calls in `CrocSwapDex` once and only once per call, then unset at the very end of the call. This variable being correctly set is essential to A) preventing re-entrancy attacks and B) preventing unauthorized third-party access to user’s positions and assets.

`sudoMode_` should never be written to by a proxy contract. It indicates whether highly privileged commands can be executed, and being correctly set is essential to assuring governance safety.

`inSafeMode_` should never be written to by a contract, besides the fixed implementation in the `ColdPath` callpath contract. Incorrectly toggling this variable could freeze the entire exchange and lock user funds.

`proxyPaths_` array should never have any element written, overwrriten or deleted by any proxy contract besides the `BootPath` callpath contract (which itself is installed once at constructor time and can never be overwriten). Only the `BootPath` proxy can perform proxy upgrades, and any sort of incorrect implementation can risk permanently locking all users out of the protocol. 

`governance_` should never be written to be any contract, besides the fixed implementation in the `ColdPath` callpath contract. Changing this variable could lead CrocSwap governance powers being transferred to an unintended user and/or permanently locked at an unrecoverable address

`msgValSpent_` should never be written to by a proxy contract, besides the fixed implementation in the `AgentMask` mixin. This implementation can be used but should never be modified. Incorrectly toggling this value could lead to a risk of a double-spend attack.

`msg.value` should never be directly read by any proxy contract, besides the fixed implementation of `popMsgVa()`in the `AgentMask` mixin. This is to avoid any sort of double spend vulnerability by only allowing `msg.value` to be read at most once. This conservatively assumes that any read also spends the value. (If it is needed in multiple places, `popMsgVal()`should be read once and written to a local variable. This forces the developer to at least consider double spend possibility, let alone prevents over entirely disparate code paths.)