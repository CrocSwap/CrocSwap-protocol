// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../vendor/IBlast.sol";

contract MockBlastPoints is IBlastPoints {

    address public operatorKey_;

    function configurePointsOperator (address operator) public {
        operatorKey_ = operator;
    }
}

contract MockERC20Rebasint is IERC20Rebasing {
    bool public isYieldConfigured_;

    address public claimRecv_;
    uint256 public claimAmount_;

    function configure(YieldMode mode) external returns (uint256) {
        if (mode == YieldMode.CLAIMABLE) {
            isYieldConfigured_ = true;
        }
        return 0;
    }

    function claim (address recipient, uint256 amount) external returns (uint256) {
        claimRecv_ = recipient;
        claimAmount_ = amount;
        return amount;
    }

    function getClaimableAmount(address account) external view returns (uint256) { }
}

contract MockBlast is IBlast {
    bool public isYieldConfigured_;
    bool public isGasConfigured_;
    address public claimContract_;
    address public claimRecv_;
    uint256 public claimAmount_;
    address public gasClaimContract_;
    address public gasClaimRecv_;
    uint256 public gasClaimAmount_;
    uint256 public gasClaimsSeconds_;

    function configureClaimableGas() external { 
        isGasConfigured_ = true;
    }

    function configureClaimableYield() external { 
        isYieldConfigured_ = true;
    }

    function claimYield(address contractAddress, address recipientOfYield, uint256 amount) external returns (uint256) { 
        claimContract_ = contractAddress;
        claimRecv_ = recipientOfYield;
        claimAmount_ = amount;
        return amount;
    }

    function claimGas(address contractAddress, address recipientOfGas, uint256 gasToClaim, uint256 gasSecondsToConsume) external returns (uint256) { 
        gasClaimContract_ = contractAddress;
        gasClaimRecv_ = recipientOfGas;
        gasClaimAmount_ = gasToClaim;
        gasClaimsSeconds_ = gasSecondsToConsume;
        return gasToClaim;
    }

    function configureContract(address contractAddress, YieldMode _yield, GasMode gasMode, address governor) external { }
    function configure(YieldMode _yield, GasMode gasMode, address governor) external { }

    function configureClaimableYieldOnBehalf(address contractAddress) external { }
    function configureAutomaticYield() external { }
    function configureAutomaticYieldOnBehalf(address contractAddress) external { }
    function configureVoidYield() external { }
    function configureVoidYieldOnBehalf(address contractAddress) external { }
    function configureClaimableGasOnBehalf(address contractAddress) external { }
    function configureVoidGas() external { }
    function configureVoidGasOnBehalf(address contractAddress) external { }
    function configureGovernor(address _governor) external { }
    function configureGovernorOnBehalf(address _newGovernor, address contractAddress) external { }

    // claim yield
    function claimAllYield(address contractAddress, address recipientOfYield) external returns (uint256) { }

    // claim gas
    function claimAllGas(address contractAddress, address recipientOfGas) external returns (uint256) { }
    function claimGasAtMinClaimRate(address contractAddress, address recipientOfGas, uint256 minClaimRateBips) external returns (uint256) { }
    function claimMaxGas(address contractAddress, address recipientOfGas) external returns (uint256) { }

    // read functions
    function readClaimableYield(address contractAddress) external view returns (uint256) { }
    function readYieldConfiguration(address contractAddress) external view returns (uint8){ }
    function readGasParams(address contractAddress) external view returns (uint256 etherSeconds, uint256 etherBalance, uint256 lastUpdated, GasMode) { }
}
