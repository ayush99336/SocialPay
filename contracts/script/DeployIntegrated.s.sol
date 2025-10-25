// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SocialPayEVVMIntegrated.sol";

contract DeployIntegratedScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address pyusd = vm.envAddress("PYUSD_ADDRESS");
        address evvmCore = vm.envAddress("EVVM_CORE");
        address nameService = vm.envAddress("EVVM_NAMESERVICE");
        
        console.log("Deploying with:");
        console.log("PYUSD:", pyusd);
        console.log("EVVM Core:", evvmCore);
        console.log("Name Service:", nameService);
        
        vm.startBroadcast(deployerPrivateKey);
        
        SocialPayEVVMIntegrated socialPay = new SocialPayEVVMIntegrated(
            pyusd,
            evvmCore,
            nameService
        );
        
        console.log("SocialPayEVVMIntegrated deployed at:", address(socialPay));
        
        vm.stopBroadcast();
    }
}
