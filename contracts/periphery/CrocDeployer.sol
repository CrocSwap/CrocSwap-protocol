// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../CrocSwapDex.sol";

// This is the older way of doing it using assembly
contract CrocDeployer {
    event CrocDeploy(address addr, uint salt);

    address immutable owner_;
    address public dex_;

    constructor (address owner) {
        owner_ = owner;
    }

    function protocolCmd (address dex, uint16 proxyPath,
                          bytes calldata cmd, bool sudo) public {
        require(msg.sender == owner_, "Does not own deployer");
        CrocSwapDex(dex).protocolCmd(proxyPath, cmd, sudo);
    }

    function getAddress(
        bytes memory bytecode,
        uint _salt
    ) public view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), _salt, keccak256(bytecode))
        );

        // NOTE: cast last 20 bytes of hash to address
        return address(uint160(uint(hash)));
    }

    function deploy (bytes memory bytescode, uint salt) public returns (address) {
        dex_ = createContract(bytescode, salt);
        emit CrocDeploy(dex_, salt);
        return dex_;
    }

    function createContract(bytes memory bytecode, uint _salt) internal returns (address addr) {
        assembly {
            addr := create2(
                0, // No payment to constructor
                // Actual code starts after skipping the first 32 bytes
                add(bytecode, 0x20),
                mload(bytecode), // Load the size of code contained in the first 32 bytes
                _salt // Salt from function arguments
            )

            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
    }
}