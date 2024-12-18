// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

// The upgradeable token implementation
contract FutaToken is Initializable, ERC20Upgradeable, OwnableUpgradeable {
    bool public auctionUnlocked_;
    address public futaVault_;
    mapping(address => bool) public preApproved_;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address authority,
        address futaVault,
        address auctionDex,
        address tradingDex
    ) public initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();
        _mint(futaVault, initialSupply);
        transferOwnership(authority);
        preApproved_[futaVault] = true;
        preApproved_[auctionDex] = true;
        preApproved_[tradingDex] = true;
        futaVault_ = futaVault;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        if (preApproved_[spender]) {
            return type(uint256).max;
        }
        return super.allowance(owner, spender);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(preApproved_[msg.sender] || auctionUnlocked_, "Auction lock");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(preApproved_[from] || auctionUnlocked_, "Auction lock");
        return super.transferFrom(from, to, amount);
    }

    function unlockTransfer() public {
        require(msg.sender == owner() || msg.sender == futaVault_, "Auction lock auth");
        auctionUnlocked_ = true;
        emit AuctionTransferUnlocked();
    }

    event AuctionTransferUnlocked();
}

// The beacon that holds the implementation address
contract TokenBeacon is UpgradeableBeacon {
    constructor(address implementation_) UpgradeableBeacon(implementation_) {}
}

// Factory to deploy new token instances
contract TokenFactory is Ownable {
    address public immutable beacon;
    
    constructor(address implementation) {
        // Deploy the beacon pointing to the token implementation
        TokenBeacon newBeacon = new TokenBeacon(implementation);
        beacon = address(newBeacon);
    }
    
    function deployToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address authority,
        address futaVault,
        address auctionDex,
        address tradingDex
    ) external returns (address) {
        // Create initialization data
        bytes memory initData = abi.encodeWithSelector(
            FutaToken.initialize.selector,
            name,
            symbol,
            initialSupply,
            authority,
            futaVault,
            auctionDex,
            tradingDex
        );
        
        // Deploy new proxy
        BeaconProxy proxy = new BeaconProxy(
            beacon,
            initData
        );
        
        return address(proxy);
    }
    
    function upgradeImplementation(address newImplementation) external onlyOwner {
        TokenBeacon(beacon).upgradeTo(newImplementation);
    }
}