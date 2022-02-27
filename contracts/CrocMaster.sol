// SPDX-License-Identifier: Unlicensed

import "./interfaces/ICrocMinion.sol";
import "./CrocEvents.sol";

pragma solidity >=0.8.4;

/* @title CrocSwap governance master contract
 * @notice Acts as a timelocked multisig wallet for executing any protocol governance
 *         on the underlying CrocSwapDex contract.
 *
 * @dev Unlike other common multisig or timelock contracts, many of the parameters such
 *      as min delay, vote threshold, or electors are fixed at construction. It's assumed
 *      that these parameters will infrequently change. When needed, the protocol can
 *      deploy a new CrocMaster, then transfer authority in the underlying CrocSwapDex */
contract CrocMaster {

    /* Defines the minimum and maximum timelock delay between the creation of a proposal
     * and when it can be executed on the underlying dex. */
    uint256 public immutable minDelay_;
    uint256 public immutable maxDelay_;

    /* A whitelist of the multisig voters. The number of electors is the Y in the
     * X-of-Y multisig. */
    mapping(address => bool) public electors_;

    /* The minimum number of yes votes required for any given proposal. I.e. this
     * is the X in the X-of-Y mutisig. */
    uint8 public immutable voteThreshold_;

    /* The address of the CrocSwapDex contract. */
    address public immutable dex_;

    /* @notice The internal structure of any active, completed or expired proposal.  
     *
     * @param proposedTime The block time the proposal was created. This is the start
     *                     of the clock for the timelock.
     * @param proposal     The content of the proposer. If approved and executed 
     *                     CrocSwapDex's protocolCmd() method will be called with this
     *                     as the single argument.
     * @param votes        A whitelist of the electors who have voted yes on the proposal
     * @param yesVotes     The cumulative number of yes votes on the proposal.
     * @param executedTime The block time that the proposal was executed. If not executed
     *                     this value will remain zero. */
    struct CrocProp {
        uint256 proposedTime_;
        bytes proposal_;
        uint8 yesVotes_;
        uint256 executedTime_;
    }

    mapping(uint => CrocProp) ballots_;

    /* Tally of previous yes votes. Key is a unique hash of the elector and the proposal
     * number. Value is boolean indicating whether the elector has voted yes on that
     * proposal. */
    mapping(bytes32 => bool) votes_;

    event Propose (uint indexed proposalNum, address proposer,
                   uint unlockTime, bytes proposal);
    event Ratify (uint indexed proposalNum, address voter);
    event Execute (uint indexed proposalNum, address exec);

    /* @dev All constructor parameters are immutable across the lifetime of the contract.
     *      Changing these values requires deploying a new CrocMaster contract.
     *
     * @param dex The address of the underlying CrocSwapDex.
     * @param minDelay The minimum timelock delay between the creation of a proposal and
     *                 its execution. I.e. all proposals must wait at least this long 
     *                 before taking effect.
     * @param maxDelay The maximum delay between the proposal and execution. I.e. after
     *                 this amount of time proposals expire if not executed.
     * @param voteThreshold The minimum number of yes votes required for any proposal.
     *                      I.e. the X in X-of-Y multisig. 
     * @param electors The list of multisig signers. */
    constructor (address dex, uint256 minDelay, uint256 maxDelay,
                 uint8 voteThreshold, address[] memory electors) {
        dex_ = dex;
        minDelay_ = minDelay;
        maxDelay_ = maxDelay;
        voteThreshold_ = voteThreshold;
        for (uint i = 0; i < electors.length; ++i) {
            electors_[electors[i]] = true;
        }

        emit CrocEvents.CrocMaster(dex, minDelay, maxDelay, voteThreshold, electors);
    }

    /* @notice Create a new proposal. Proposals can only be created by a whitelisted
     *         elector. The proposing elector is automatically counted as a yes vote
     *         on the proposal at the time of the call.
     *
     * @dev    Proposals, once created, are immutable. The content of the proposal 
     *         cannot be changed or we'd risk a malicious elector changing the proposal
     *         to something else after other electors voted yes.
     *
     * @param propNum An arbitrary number that indexes the proposal.
     * @param proposal The byte string argument that will be passed to CrocSwapDex's
     *                 protocolCmd if the proposal is ratified and executed. */
    function propose (uint propNum, bytes calldata proposal) public onlyVoter {
        CrocProp storage decree = ballots_[propNum];
        
        // Because block time is always greater than zero, this check will always fail
        // if the proposal number was previously created.
        require(decree.proposedTime_ == 0, "Already proposed");
        
        decree.proposedTime_ = block.timestamp;        
        decree.proposal_ = proposal;
        // The proposal is always assumed to be a yes vote.
        voteYes(propNum);        

        uint unlockTime = decree.proposedTime_ + minDelay_;
        emit Propose(propNum, msg.sender, unlockTime, proposal);
    }

    /* @notice Called by other electors to vote yes on any open proposal(s). An elector
     *         can vote only once per proposal. To vote no, an elector simply doesn't
     *         call ratify() on the proposal. All votes are assumed to be "no" until 
     *         ratified by the elector.
     *
     * @dev    Yes votes cannot be revoked after issued, so electors should think 
     *         carefully be ratifying.
     *
     * @param propNums The list of proposition numbers being voted yes on. For efficiency
     *                 an elector can ratify multiple proposition with a single call. */
    function ratify (uint[] calldata propNums) public onlyVoter {
        for (uint i = 0; i < propNums.length; ++i) {
            voteYes(propNums[i]);
            emit Ratify(propNums[i], msg.sender);
        }
    }

    /* @notice Called after a proposal is ratified by X-of-Y. Actually executes the
     *         the proposal by calling it on protocolCmd() in underlying CrocSwapDex 
     *         contract. For security proposal can only be executed once. 
     *
     * @ dev   As a design decision, calling execute() is restricted to multisig electors
     *         This isn't strictly necessary, since a proposal that's ratified should be
     *         considered accepted already. However this gives one final 1-of-Y security
     *         check in case a proposal is found to be flawed after the fact.
     *
     * @param propNums The list of proposition numbers being executed. For efficiency
     *                 an elector can ratify multiple proposition with a single call. */
    function execute (uint[] calldata propNums) public onlyVoter {
        for (uint i = 0; i < propNums.length; ++i) {
            CrocProp storage decree = ballots_[propNums[i]];

            // Because blocktimes are always greater than 0, this check assures that
            // a proposal can be executed at most one time.
            require(decree.executedTime_ == 0, "Already executed");
            require(decree.yesVotes_ >= voteThreshold_, "Not ratified");

            // Enforces the timelock minimum delay and expiration.
            require(proposalAge(decree) < maxDelay_, "Expired");
            require(proposalAge(decree) >= minDelay_, "Time Lock");

            uint8 CMD_PROXY = 0;
            decree.executedTime_ = block.timestamp;
            ICrocMinion(dex_).protocolCmd(CMD_PROXY, decree.proposal_);
            emit Execute(propNums[i], msg.sender);
        }
    }

    function proposalAge (CrocProp storage decree) private view returns (uint256) {
        return block.timestamp - decree.proposedTime_;
    }

    /* @notice Marks the caller as a yes vote on the proposal.
     * @dev    This internal method does *not* check that the caller is an authorized
     *         elector, so that must be asserted before using. */
    function voteYes (uint propNum) private {
        CrocProp storage decree = ballots_[propNum];
        require(decree.proposedTime_ > 0, "No proposal");

        bytes32 key = keccak256(abi.encode(msg.sender, propNum));
        require(votes_[key] == false, "Already voted");
        votes_[key] = true;
        decree.yesVotes_ += 1;
    }

    /* @notice Guard to asser that the caller is a whitelisted multisig elector. */
    modifier onlyVoter {
        require(electors_[msg.sender], "Not authorized");
        _;
    }
}
