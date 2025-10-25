// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SocialPayEVVM.sol";

contract CheckBalanceScript is Script {
    function run() external view {
        address oldContract = 0x5922ED4eaE4DB949A340ca85915f9ca51B7b3061;
        address newContract = 0x287aDef130Eb012f43A57B2F074f57c2e63B1dcB;

        console.log("Checking OLD contract:", oldContract);
        SocialPayEVVM old = SocialPayEVVM(oldContract);
        uint256 oldBalance = old.getPendingBalance("testuser", "telegram");
        console.log("@testuser pending (OLD):", oldBalance);

        console.log("\nChecking NEW contract:", newContract);
        SocialPayEVVM newC = SocialPayEVVM(newContract);
        uint256 newBalance = newC.getPendingBalance("testuser", "telegram");
        console.log("@testuser pending (NEW):", newBalance);
    }
}
