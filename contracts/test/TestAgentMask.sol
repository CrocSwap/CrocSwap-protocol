// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;
    
import "../mixins/AgentMask.sol";

contract TestAgentMask is AgentMask {

    address public signer_;

    function addressToNum (address x) public pure returns (uint256) {
        return uint256(uint160(x));
    }

    function joinKey (address x, address y) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(x, y)));
    }

    function testVerifySignature (uint16 callpath, bytes memory cmd,
                                  bytes calldata conds,
                                  bytes memory tip,
                                  bytes calldata signature) public {
        CrocRelayerCall memory call = CrocRelayerCall(callpath, cmd, conds, tip);
        signer_ = verifySignature(call, signature);
    }

    function testRelayConds (address client, bytes calldata conds) public {
        checkRelayConditions(client, conds);
    }

    function getNonce (address client, uint256 salt) public view returns (uint32) {
        return userBals_[nonceKey(client, bytes32(salt))].nonce_;
    }

    function setNonce (address client, uint256 salt, uint32 nonce) public {
        userBals_[nonceKey(client, bytes32(salt))].nonce_ = nonce;
    }
}


contract TestAgentMaskRouter {
    
    address public mask_;
    
    constructor (address mask) {
        mask_ = mask;
    }

    function testRelayConds (address client, bool deadPast, bool aliveEarly,
                             uint256 salt, uint32 nonce, address relayer) public {
        uint48 deadline = deadPast ? uint48(block.timestamp) - 1 :
            uint48(block.timestamp);
        uint48 alive = aliveEarly ? uint48(block.timestamp) + 1 :
            uint48(block.timestamp);
        
        bytes memory conds = abi.encode(deadline, alive, salt, nonce, relayer);
        TestAgentMask(mask_).testRelayConds(client, conds);
    }
}
