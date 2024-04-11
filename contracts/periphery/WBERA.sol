// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Wrapped BERA
 *
 * The WBERA token is a Wrapped BERA token that adheres to the ERC20 interface. Deposit EVM
 * balance (BERA) to receive the WBERA token; withdraw your EVM balance for the WBERA token.
 *
 * @author Berachain Team
 * @author OpenZeppelin Team
 * @notice Inspiration from WETH
 */
contract WBERA is ERC20 {
    constructor() ERC20("Wrapped BERA", "WBERA") {}

    // ERC20 Overrides
    function name() public pure override(ERC20) returns (string memory) {
        return "Wrapped BERA";
    }

    function symbol() public pure override(ERC20) returns (string memory) {
        return "WBERA";
    }

    // Event emitted when a user deposits EVM balance (BERA) into the contract.
    event Deposit(address indexed from, uint256 amount);
    // Event emitted when a user withdraws EVM balance (BERA) from the contract.
    event Withdrawal(address indexed to, uint256 amount);

    /**
     * @notice The receive function is called when BERA is sent directly to the contract. It
     * automatically calls the deposit function to mint WBERA tokens.
     */
    receive() external payable {
        deposit();
    }

    /**
     * @notice The deposit function allows users to deposit EVM balance (BERA) into the contract.
     * It mints an equivalent amount of WBERA tokens and assigns them to the sender.
     */
    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice The withdraw function allows users to withdraw their EVM balance (BERA) from the
     * contract. It burns the specified amount of WBERA tokens and transfers the corresponding EVM
     * balance to the sender.
     * @param amount The amount of WBERA tokens to burn and receive BERA for.
     */
    function withdraw(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
        emit Withdrawal(msg.sender, amount);
    }
}
