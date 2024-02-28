// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../vendor/IBlast.sol';
import '../mixins/StorageLayout.sol';
import '../libraries/ProtocolCmd.sol';
import '../CrocEvents.sol';

/* @title Blast extensions sidecar.
 *
 * @notice Proxy sidecar specifically for Blast network extensions related to yield, gas
 *         rebate, and points. */
contract BlastPath is StorageLayout {
    using ProtocolCmd for bytes;
    using UserCmd for bytes;

    
    event BlastConfigClaimable(address indexed token);
    event BlastConfigPoints(address indexed operator);
    event BlastYieldClaim(address indexed recipient, uint256 yieldAmt, uint256 gasAmt, uint256 gasSeconds);
    event BlastERC20YieldClaim(address indexed recipient, address indexed token, uint256 yieldAmt);
    event BlastConfigPoints(address indexed pointsContract, address indexed operatorKey);

    /* @notice Consolidated method for protocol control related commands. */
    function protocolCmd (bytes calldata cmd) virtual public {
        uint256 cmdCode = uint256(bytes32(cmd[0:31]));
        
        if (cmdCode == ProtocolCmd.BLAST_YIELD_CLAIM) {
            claimBlastYield(cmd);
        } else if (cmdCode == ProtocolCmd.BLAST_ERC20_YIELD_CLAIM) {
            claimERC20Yield(cmd);
        } else {
            sudoCmd(cmd);
        }
    }

    /* @notice Protocol commands requiring escalated privilege. */
    function sudoCmd (bytes calldata cmd) private {
        require(sudoMode_, "Sudo");
        uint256 cmdCode = uint256(bytes32(cmd[0:31]));

        if (cmdCode == ProtocolCmd.BLAST_CONFIG_POINTS_MAINNET) {
            configurePointsMainnet(cmd);
        } else if (cmdCode == ProtocolCmd.BLAST_CONFIG_POINTS_TESTNET) {
            configurePointsTestnet(cmd);
        } else if (cmdCode == ProtocolCmd.BLAST_CONFIG_POINTS_AT_KEY) {
            configurePointsAt(cmd);
        } else {
            revert("Invalid BlastPath ProtocolCmd Code");
        }
    }

    /* @notice Consolidated method for protocol control related commands. */
    function userCmd (bytes calldata cmd) virtual public payable {
        uint256 cmdCode = uint256(bytes32(cmd[0:31]));
        
        if (cmdCode == ProtocolCmd.BLAST_CONFIG_YIELD) {
            configBlastYieldClaim();
        } else if (cmdCode == ProtocolCmd.BLAST_CONFIG_YIELD_ERC20) {
            configErc20YieldClaim(cmd);
        } else {
            revert("Invalid BlastPath UserCmd Code");
        }
    }
    
    /* @notice Configures the dex contract to set claimable yield and gas type.
     * 
     * @dev This method doesn't need to be gated by governance, because dex should
     *      contract should always use claimable yield. Making it accessible to any
     *      user means that anyone can force this property. */
    function configBlastYieldClaim() private {
        IBlast(BLAST).configureClaimableGas(); 
        IBlast(BLAST).configureClaimableYield();
        emit BlastConfigClaimable(address(0));
    }

    /* @notice Configures an arbitrary ERC20 rebasing contract to use claimable yield
     * 
     * @dev This method doesn't need to be gated by governance, because dex should
     *      contract should always use claimable yield mode on any token that enabled
     *      it. This allows the call to be permissionless, and allows anyone to create
     *      a rebasing pool using the same Blast native conventions as USDB. */
    function configErc20YieldClaim (bytes calldata cmd) private {
        (, address token) = abi.decode(cmd, (uint16, address));
        require(token != address(0), "Invalid claim token");
        IERC20Rebasing(token).configure(YieldMode.CLAIMABLE);
        emit BlastConfigClaimable(token);
    }

    /* @notice Configures the external points key for the Blast points system on the mainnet
     *         Blast points contract.
     * 
     * @dev Note this method *does* need to be highly protected and governance only, 
     *      since making accessible would allow any user to redirect points to themselves. */
    function configurePointsMainnet (bytes calldata cmd) private {
        (, address key) = abi.decode(cmd, (uint16, address));
        configurePointsAt(BLAST_POINTS_MAINNET, key);
    }

    /* @notice Configures the external points key for the Blast points system on the testnet
     *         Blast points contract.
     * 
     * @dev Note this method *does* need to be highly protected and governance only, 
     *      since making accessible would allow any user to redirect points to themselves. */
    function configurePointsTestnet (bytes calldata cmd) private {
        (, address key) = abi.decode(cmd, (uint16, address));
        configurePointsAt(BLAST_POINTS_TESTNET, key);
    }

    /* @notice Configures the external points key for the Blast points system on an arbitrary
     *         Blast-compatible points contract.
     * 
     * @dev Note this method *does* need to be highly protected and governance only, 
     *      since making accessible would allow any user to redirect points to themselves. */
    function configurePointsAt (bytes calldata cmd) private {
        (, address blastPoints, address key) = abi.decode(cmd, (uint16, address, address));
        configurePointsAt(blastPoints, key);
    }

    /* @notice Configures the external points key.
     * @param blastPoints The address of the Blast points contract.
     * @param key The EOA corresponding to the private key of the Croc points server. */
    function configurePointsAt (address blastPoints, address key) private {
        require(key.code.length == 0, "Points key cannot be a contract");
        IBlastPoints(blastPoints).configurePointsOperator(key);
        emit BlastConfigPoints(blastPoints, key);
    }

    /* @notice Claims Blast yield and gas rebates for a specific recipient.
     * 
     * @dev This call is a protocolCmd, not a userCmd because it needs to be gated
     *      behind an external Policy conduit that verifies the yield claim is valid.
     *      Otherwise any arbitrary user could claim the entire accumulated yield of
     *      the dex for themselves.
     *
     * @param recv The recipient the yield will be paid to
     * @param yieldAmt The amount of yield to claim on behalf of recv (not including of gas rebate) 
     * @param gasAmt The gas rebate to claim on behalf of recv
     * @param gasSeconds The gas seconds argument used by the IBlast contract. */
    function claimBlastYield (bytes calldata cmd) private {
        (, address recv, uint256 yieldAmt, uint256 gasAmt, uint256 gasSeconds) = 
            abi.decode(cmd, (uint16, address, uint256, uint256, uint256));
        if (yieldAmt > 0) {
            IBlast(BLAST).claimYield(address(this), recv, yieldAmt);
        }
        if (gasAmt > 0) {
            IBlast(BLAST).claimGas(address(this), recv, gasAmt, gasSeconds);
        }

        if (yieldAmt > 0 || gasAmt > 0) {
            emit BlastYieldClaim(recv, yieldAmt, gasAmt, gasSeconds);
        }
    }

    /* @notice Claims yield for any conforming ERC20 rebasing token.
     * 
     * @dev This call is a protocolCmd, not a userCmd because it needs to be gated
     *      behind an external Policy conduit that verifies the yield claim is valid.
     *      Otherwise any arbitrary user could claim the entire accumulated yield of
     *      the dex for themselves.
     *
     * @param recv The recipient the yield will be paid to
     * @param token The token the yield is being claimed from.
     * @param yieldAmt The amount of yield to claim on behalf of recv. */
    function claimERC20Yield (bytes calldata cmd) private {
        (, address recv, address token, uint256 yieldAmt) = 
            abi.decode(cmd, (uint16, address, address, uint256));
        
        if (yieldAmt > 0) {
            IERC20Rebasing(token).claim(recv, yieldAmt);
            emit BlastERC20YieldClaim(recv, token, yieldAmt);
        }
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public virtual returns (bool) {
        return slot == CrocSlots.BLAST_PROXY_INDEX;
    }
}

