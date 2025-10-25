// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ApprovePYUSDScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address pyusd = vm.envAddress("PYUSD_ADDRESS");
        address contractAddress = vm.envAddress("SOCIALPAY_CONTRACT");
        
        // Approve a large amount (1 million PYUSD)
        uint256 approvalAmount = 1_000_000 * 1e6;
        
        vm.startBroadcast(deployerKey);
        
        IERC20(pyusd).approve(contractAddress, approvalAmount);
        
        console.log("Approved", approvalAmount / 1e6, "PYUSD");
        console.log("From deployer to contract:", contractAddress);
        
        vm.stopBroadcast();
    }
}
