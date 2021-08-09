// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/IERC20Minimal.sol";

contract MockERC20 is IERC20Minimal {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

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
}
