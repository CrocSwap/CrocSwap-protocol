// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../interfaces/IERC20Minimal.sol";
import "hardhat/console.sol";

contract MockERC20 is IERC20Permit {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    
    uint8 public decimals;
    string public symbol;

    address public owner712;
    address public spender712;
    uint256 public amount712;
    uint256 public deadline712;
    uint8 public v712;
    uint256 public r712;
    uint256 public s712;

    function deposit (address acct, uint256 qty) public {
        balanceOf[acct] = balanceOf[acct] + qty;
    }
    
    function transfer (address recip, uint256 qty) external override returns (bool) {
        require(balanceOf[msg.sender] >= qty, "Insufficient Balance");
        balanceOf[msg.sender] -= qty;
        balanceOf[recip] += qty;
        emit Transfer(msg.sender, recip, qty);
        return true;
    }

    function transferFrom (address from, address to, uint256 qty)
        external override returns (bool) {
        require(allowance[from][msg.sender] >= qty, "Insufficent Allowance");
        allowance[from][msg.sender] -= qty;

        require(balanceOf[from] >= qty, "Insufficient Balance");
        balanceOf[from] -= qty;
        balanceOf[to] += qty;

        emit Transfer(from, to, qty);
        return true;
    }

    function approve (address agent, uint256 qty) external override returns (bool) {
        allowance[msg.sender][agent] = qty;
        emit Approval(msg.sender, agent, qty);
        return true;
    }

    function approveFor (address owner, address agent, uint256 qty) external {
        allowance[owner][agent] = qty;
        emit Approval(owner, agent, qty);
    }

    function permit (address owner, address spender, uint256 amount, uint256 deadline,
                     uint8 v, bytes32 r, bytes32 s) external override {
        owner712 = owner;
        spender712 = spender;
        amount712 = amount;
        deadline712 = deadline;
        v712 = v;
        r712 = uint256(r);
        s712 = uint256(s);
    }

    function setDecimals (uint8 dec) public {
        decimals = dec;
    }

    function setSymbol (string calldata sym) public {
        symbol = sym;
    }
}
