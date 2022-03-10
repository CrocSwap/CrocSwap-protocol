
// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
    
import "../mixins/AgentMask.sol";

contract TestAgentMask is AgentMask {

    /*function testAgentMintKey (address sender, address origin) public view
        returns (uint256) {
        return uint256(agentMintKey(sender, origin));
    }

    function testAgentBurnKey (address sender, address origin) public view
        returns (uint256) {
        return uint256(agentBurnKey(sender, origin));
    }

    function testAgentSettle (address sender, address origin)
        public view returns (uint256, uint256) {
        (address x, address y) = agentsSettle(sender, origin);
        return (addressToNum(x), addressToNum(y));
    }

    function testApprove (address router, address origin, bool debit, bool burn) public {
        approveAgent(router, origin, debit, burn);
    }

    function addressToNum (address x) public pure returns (uint256) {
        return uint256(uint160(x));
    }

    function joinKey (address x, address y) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(x, y)));
        }*/
}
