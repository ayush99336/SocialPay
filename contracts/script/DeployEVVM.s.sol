// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/EVVMCore.sol";
import "../src/EVVMNameService.sol";

contract DeployEVVMScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        EVVMCore core = new EVVMCore();
        console.log("EVVMCore deployed at:", address(core));

        EVVMNameService nameService = new EVVMNameService();
        console.log("EVVMNameService deployed at:", address(nameService));

        vm.stopBroadcast();
    }
}
