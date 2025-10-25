// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ApprovePYUSDScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address pyusd = vm.envAddress("PYUSD_SEPOLIA");
        address socialPay = vm.envAddress("SOCIALPAY_CONTRACT");

        vm.startBroadcast(deployerPrivateKey);

        IERC20(pyusd).approve(socialPay, type(uint256).max);

        console.log("PYUSD approved for SocialPay contract");
        console.log("PYUSD:", pyusd);
        console.log("SocialPay:", socialPay);

        vm.stopBroadcast();
    }
}
