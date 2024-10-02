// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../CrocSwapDex.sol";
import "../governance/CrocPolicy.sol";
import "../lens/CrocQuery.sol";

/* @notice Contract allows for the dynamic adjustment of pool fees by
 *         external authorized modulators. */
contract FeeModulatorConduit {
    
    address immutable public policy_;
    address immutable public dex_;
    address immutable public query_;

    mapping(address => bool) public delegators_;
    mapping(address => bool) public universalModulators_;
    mapping(bytes32 => bool) public poolModulators_;

    /* @param policy The address of the CrocPolicy contract.
     * @param query The address of the CrocQuery contract. */
    constructor (address policy, address query) {
        policy_ = policy;
        query_ = query;

        dex_ = CrocQuery(query).dex_();
        require(CrocSwapDex(dex_).acceptCrocDex(), "Invalid CrocSwapDex");
        require(CrocPolicy(policy_).acceptsCrocAuthority(), "Invalid CrocPolicy");

        delegators_[msg.sender] = true;
    }

    /* @notice Authorizes an address to act as a delegator, allowing them to add or remove
     *         modulators. */
    function addDelegate (address delegate) external onlyDelegator {
        delegators_[delegate] = true;
    }

    /* @notice Revokes an address's delegator status. */
    function removeDelegate (address delegate) external onlyDelegator {
        delegators_[delegate] = false;
    }

    /* @notice Authorizes an address to act as a universal modulator, allowing them to change
     *         fees on any pool. */
    function addUniversalModulator (address modulator) external onlyDelegator {
        universalModulators_[modulator] = true;
    }

    /* @notice Revokes an address's universal modulator status. */
    function removeUniversalModulator (address modulator) external onlyDelegator {
        universalModulators_[modulator] = false;
    }

    /* @notice Authorizes an address to act as a pool modulator, allowing them to change fees
     *         on a specific pool. */
    function addPoolModulator (address modulator, address base, address quote, uint256 poolIdx) external onlyDelegator {
        bytes32 key = hashPoolKey(modulator, base, quote, poolIdx);
        poolModulators_[key] = true;
    }

    /* @notice Revokes an address's pool modulator status. */
    function removePoolModulator (address modulator, address base, address quote, uint256 poolIdx) external onlyDelegator {
        bytes32 key = hashPoolKey(modulator, base, quote, poolIdx);
        poolModulators_[key] = false;
    }

    function hashPoolKey (address base, address quote, uint256 poolIdx) private view returns (bytes32) {
        return hashPoolKey(msg.sender, base, quote, poolIdx);
    }

    function hashPoolKey (address sender, address base, address quote, uint256 poolIdx) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(sender, base, quote, poolIdx));
    }

    function isPoolModulator (address modulator, address base, address quote, uint256 poolIdx) external view returns (bool) {
        bytes32 key = hashPoolKey(modulator, base, quote, poolIdx);
        return poolModulators_[key];
    }

    /* @notice Changes the fee on a pool using universal modulator status. Caller must be a unviersal 
     *         modulator */
    function changeFeeUnivMod (address base, address quote, uint256 poolIdx, uint256 newFee) 
        external onlyUniversalModulator {
        changeFee(base, quote, poolIdx, newFee);
    }

    /* @notice Changes the fee on a pool using pool modulator status. Caller must be a modulator for 
     *         that pool */
    function changeFeePoolMod (address base, address quote, uint256 poolIdx, uint256 newFee) 
        external onlyPoolModulator(base, quote, poolIdx) {
        changeFee(base, quote, poolIdx, newFee);
    }

    function changeFee (address base, address quote, uint256 poolIdx, uint256 newFee) internal {
        CrocPolicy policy = CrocPolicy(policy_);
        CrocQuery query = CrocQuery(query_);

        PoolSpecs.Pool memory pool = query.queryPoolParams(base, quote, poolIdx);
        bytes memory cmd = abi.encode(ProtocolCmd.POOL_REVISE_CODE, base, quote, poolIdx, newFee, 
            pool.tickSize_, pool.jitThresh_, pool.knockoutBits_);

        policy.invokePolicy(dex_, CrocSlots.COLD_PROXY_IDX, cmd);
    }

    modifier onlyDelegator {
        require(delegators_[msg.sender], "FeeModulator: not delegator");
        _;
    }

    modifier onlyUniversalModulator {
        require(universalModulators_[msg.sender], "FeeModulator: not universal modulator");
        _;
    }

    modifier onlyPoolModulator (address base, address quote, uint256 poolIdx) {
        bytes32 key = hashPoolKey(base, quote, poolIdx);
        require(poolModulators_[key], "FeeModulator: not pool modulator");
        _;
    }
}
