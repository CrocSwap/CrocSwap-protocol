# CrocSwap-protocol
Decentralized exchange with concentrated liquidity and low gas fees

## Installation

Clone the repository. In the repository home directory run the following commands:

    $ yarn install
    $ npx hardhat compile
    
To verify that the code is functioning run:

    $ npx hardhat test

## Documentation

Additional technical documentation can be found

* [Repo Layout](docs/Layout.md): Top-level overview of the Solidity source files in the project.
* [Control Flow](docs/ControlFlow.md): Illustrated flow charts mapping the smart contract logic associated with common CrocSwap operations.
* [Encoding Guide](docs/Encoding.md): Technical specification for clients outlining how to encode arguments to the CrocSwap contract methods that don't use standard Solidity args.
