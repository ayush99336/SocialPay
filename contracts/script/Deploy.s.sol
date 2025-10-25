// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SocialPayEVVM.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address pyusd = vm.envAddress("PYUSD_SEPOLIA");
        address evvmCore = vm.envAddress("EVVM_CORE");
        address nameService = vm.envAddress("EVVM_NAMESERVICE");

        vm.startBroadcast(deployerPrivateKey);

        SocialPayEVVM socialPay = new SocialPayEVVM(
            pyusd,
            evvmCore,
            nameService
        );

        console.log("SocialPayEVVM deployed at:", address(socialPay));

        vm.stopBroadcast();
    }
}
