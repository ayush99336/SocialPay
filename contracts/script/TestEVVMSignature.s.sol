// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SocialPayEVVMIntegrated.sol";
import "../src/EVVMCore.sol";

contract TestEVVMSignatureScript is Script {
    function run() external {
        address contractAddr = vm.envAddress("SOCIALPAY_CONTRACT");
        address pyusdAddr = 0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9;
        address evvmCoreAddr = 0x09Cb0b572648431fdCecbd494e3950D0a698fb50;
        
        SocialPayEVVMIntegrated socialPay = SocialPayEVVMIntegrated(contractAddr);
        EVVMCore evvmCore = EVVMCore(evvmCoreAddr);
        
        // Payment details
        string memory handle = "evvmtest";
        string memory platform = "telegram";
        uint256 amount = 3 * 1e6;
        uint256 asyncNonce = 1729891530012345;
        uint256 deadline = block.timestamp + 3600;
        
        console.log("=== EVVM Integration Test ===");
        console.log("Nonce:", asyncNonce);
        
        uint256 userKey = vm.envUint("PRIVATE_KEY");
        address signer = vm.addr(userKey);
        
        // Check nonce before
        bool nonceBefore = evvmCore.verifyAsyncNonce(signer, asyncNonce);
        console.log("Nonce available before:", nonceBefore);
        
        // Build signature
        bytes32 structHash = keccak256(abi.encode(
            keccak256("PaymentIntent(string handle,string platform,uint256 amount,uint256 asyncNonce,uint256 deadline)"),
            keccak256(bytes(handle)),
            keccak256(bytes(platform)),
            amount,
            asyncNonce,
            deadline
        ));
        
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            socialPay.getDomainSeparator(),
            structHash
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        
        // Approve and execute
        vm.startBroadcast(userKey);
        IERC20(pyusdAddr).approve(contractAddr, amount);
        vm.stopBroadcast();
        
        uint256 execKey = vm.envUint("EXECUTOR_PRIVATE_KEY");
        vm.startBroadcast(execKey);
        
        console.log("Executing payment...");
        socialPay.payToHandleWithSignature(
            handle,
            platform,
            amount,
            asyncNonce,
            deadline,
            abi.encodePacked(r, s, v)
        );
        
        console.log("Payment SUCCESS!");
        vm.stopBroadcast();
        
        // Check nonce after
        bool nonceAfter = evvmCore.verifyAsyncNonce(signer, asyncNonce);
        console.log("Nonce available after:", nonceAfter);
        
        if (!nonceAfter) {
            console.log("EVVM INTEGRATION CONFIRMED!");
        } else {
            console.log("WARNING: Nonce still available");
        }
    }
}
