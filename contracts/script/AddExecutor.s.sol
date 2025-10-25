// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SocialPayEVVMIntegrated.sol";

contract AddExecutorScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address contractAddress = vm.envAddress("SOCIALPAY_CONTRACT");
        address executorAddress = vm.envAddress("EXECUTOR_ADDRESS");
        
        vm.startBroadcast(deployerKey);
        
        SocialPayEVVMIntegrated socialPay = SocialPayEVVMIntegrated(contractAddress);
        
        console.log("Adding executor:", executorAddress);
        socialPay.addExecutor(executorAddress);
        
        console.log("Executor added successfully!");
        
        vm.stopBroadcast();
    }
}
