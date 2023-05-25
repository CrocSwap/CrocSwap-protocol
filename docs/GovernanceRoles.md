# Governance Roles & Powers

Any CrocSwap user should be aware of the governance powers delegated to the roles in the `CrocPolicy` contract. Because these governance powers are relatively broad, users should have a high degree of trust in the entities holding these roles. A CrocSwap implementation with **malicious governance can result in the total loss** of any funds the user has deposited, minted or approved on the `CrocSwapDex` contract. It’s highly suggested that any deployed implementation of CrocSwap assign these roles to decentralized contracts such as a multisig or DAO, as well as defer the governance role behind a timelock contract to give ordinary users time to respond to any proposed changes.

The three governance roles in the `CrocPolicy` contract are:

- Operations
- Treasury
- Emergency

## Operations

The operations governance role is intended for day-to-day management of CrocSwap parameters, and therefore has a more limited range of powers. The operations role has the following powers:

- Call non-privileged administrative commands on the `CrocSwapDex` contract including:
    - Enable or disable pool parameter templates
    - Modify the parameters in a pool, such as swap fee rate or tick size
    - Set or reset the protocol fee take rate
    - Set a minimum initial liquidity value for all new pools
    - Set a minimum size threshold for off-grid liquidity positions
- Install, overwrite or delete “policy conduits”, which are third party contracts with specific permissions to execute any of the above non-privileged administrative commands on `CrocSwapDex`

## Treasury

The treasury governance role is intended for the most privileged operations inside the protocol. Therefore any CrocSwap user must have a very high degree of trust in the current holder of the treasury governance role, and it’s highly suggested that this role is heavily decentralized with a long-delay timelock. The treasury role has the following powers:

- All of the above powers of the operations role
- Ability to carry out high privilege administrative commands on the `CrocSwapDex` contract including:
    - Upgrading the proxy contracts to new contracts (which can arbitrarily change the behavior of `CrocSwapDex`)
    - Collecting accumulated protocol fees to an arbitrary treasury
    - Disabling or enabling the `swap()` hot path flag
    - Disabling or enabling safe mode, which freezes all user activities and funds
- Uninstalling or overwriting any “policy conduit”, before it’s installed expiration time

## Emergency

The emergency governance role has a narrow but powerful scope. The intention is to act as an “escape valve” to handle highly time-sensitive critical issues that the treasury role cannot address if it’s behind a long timelock delay. However because it still is a powerful role, the short timelock should be counter-balanced by a very decentralized and distributed trust model such as a larger N supermajority multisig. The emergency role has the following powers:

- All of the powers of the operations role
- Ability to force the `CrocSwapDex` contract into safe mode, which freezes all user activities and funds.
- Forcibly delete any policy conduit, even before the installed expiration time