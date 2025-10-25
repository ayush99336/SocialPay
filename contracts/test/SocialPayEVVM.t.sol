// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SocialPayEVVM.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock PYUSD token for testing
contract MockPYUSD is ERC20 {
    constructor() ERC20("PayPal USD", "PYUSD") {
        _mint(msg.sender, 1000000 * 10 ** 6); // 1M PYUSD (6 decimals)
    }

    function decimals() public pure override returns (uint8) {
        return 6; // PYUSD has 6 decimals
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SocialPayEVVMTest is Test {
    SocialPayEVVM public socialPay;
    MockPYUSD public pyusd;

    address public owner;
    address public alice;
    address public bob;
    address public executor;

    // Test handles
    string constant ALICE_HANDLE = "alice_crypto";
    string constant BOB_HANDLE = "bob_trader";
    string constant PLATFORM = "telegram";

    function setUp() public {
        // Setup accounts
        owner = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        executor = makeAddr("executor");

        // Deploy mock PYUSD
        pyusd = new MockPYUSD();

        // Deploy SocialPayEVVM
        socialPay = new SocialPayEVVM(
            address(pyusd),
            address(0x1), // Mock EVVM core
            address(0x2) // Mock name service
        );

        // Fund test accounts
        pyusd.mint(alice, 10000 * 10 ** 6); // 10k PYUSD
        pyusd.mint(bob, 10000 * 10 ** 6);

        // Approve SocialPay contract
        vm.prank(alice);
        pyusd.approve(address(socialPay), type(uint256).max);

        vm.prank(bob);
        pyusd.approve(address(socialPay), type(uint256).max);

        console.log("=== Test Setup Complete ===");
        console.log("SocialPay:", address(socialPay));
        console.log("PYUSD:", address(pyusd));
        console.log("Alice:", alice);
        console.log("Bob:", bob);
        console.log("Executor:", executor);
    }

    // ============================================
    // Test 1: Basic Payment to Unclaimed Handle
    // ============================================
    function test_PayToUnclaimedHandle() public {
        uint256 amount = 100 * 10 ** 6; // 100 PYUSD

        uint256 aliceBalanceBefore = pyusd.balanceOf(alice);

        // Alice pays to Bob's handle (Bob hasn't claimed yet)
        vm.prank(alice);
        socialPay.payToHandle(BOB_HANDLE, PLATFORM, amount, executor);

        // Check Alice's balance decreased
        assertEq(
            pyusd.balanceOf(alice),
            aliceBalanceBefore - amount,
            "Alice balance should decrease"
        );

        // Check executor received fee (1%)
        uint256 expectedExecutorFee = (amount * 100) / 10000;
        assertEq(
            pyusd.balanceOf(executor),
            expectedExecutorFee,
            "Executor should receive 1% fee"
        );

        // Check pending balance for Bob's handle
        uint256 pendingAmount = amount - expectedExecutorFee;
        assertEq(
            socialPay.getPendingBalance(BOB_HANDLE, PLATFORM),
            pendingAmount,
            "Pending balance should be stored"
        );

        console.log("[PASS] Test 1: Payment to unclaimed handle");
    }

    // ============================================
    // Test 2: Claim Pending Payment
    // ============================================
    function test_ClaimPendingPayment() public {
        uint256 amount = 100 * 10 ** 6; // 100 PYUSD

        // Alice pays to Bob's handle
        vm.prank(alice);
        socialPay.payToHandle(BOB_HANDLE, PLATFORM, amount, executor);

        uint256 bobBalanceBefore = pyusd.balanceOf(bob);

        // Bob claims his pending payment
        vm.prank(bob);
        socialPay.claimPending(BOB_HANDLE, PLATFORM, "");

        // Check Bob received the payment (minus executor fee)
        uint256 expectedAmount = amount - ((amount * 100) / 10000);
        assertEq(
            pyusd.balanceOf(bob),
            bobBalanceBefore + expectedAmount,
            "Bob should receive pending payment"
        );

        // Check handle is now linked to Bob's wallet
        (bool claimed, address wallet) = socialPay.isHandleClaimed(
            BOB_HANDLE,
            PLATFORM
        );
        assertTrue(claimed, "Handle should be claimed");
        assertEq(wallet, bob, "Handle should link to Bob's wallet");

        // Check pending balance is cleared
        assertEq(
            socialPay.getPendingBalance(BOB_HANDLE, PLATFORM),
            0,
            "Pending balance should be zero"
        );

        console.log("[PASS] Test 2: Claim pending payment");
    }

    // ============================================
    // Test 3: Direct Payment to Claimed Handle
    // ============================================
    function test_PayToClaimedHandle() public {
        // Bob claims his handle first
        vm.prank(bob);
        socialPay.claimPending(BOB_HANDLE, PLATFORM, "");

        uint256 amount = 100 * 10 ** 6;
        uint256 bobBalanceBefore = pyusd.balanceOf(bob);

        // Alice pays to Bob's handle (now claimed)
        vm.prank(alice);
        socialPay.payToHandle(BOB_HANDLE, PLATFORM, amount, executor);

        // Check Bob received payment directly (minus executor fee)
        uint256 expectedAmount = amount - ((amount * 100) / 10000);
        assertEq(
            pyusd.balanceOf(bob),
            bobBalanceBefore + expectedAmount,
            "Bob should receive direct payment"
        );

        // No pending balance
        assertEq(
            socialPay.getPendingBalance(BOB_HANDLE, PLATFORM),
            0,
            "No pending balance for claimed handle"
        );

        console.log("[PASS] Test 3: Direct payment to claimed handle");
    }

    // ============================================
    // Test 4: Batch Payment with Async Nonces
    // ============================================
    function test_BatchPaymentAsyncNonces() public {
        // Prepare batch payment data
        string[] memory handles = new string[](3);
        handles[0] = "user1";
        handles[1] = "user2";
        handles[2] = "user3";

        string[] memory platforms = new string[](3);
        platforms[0] = PLATFORM;
        platforms[1] = PLATFORM;
        platforms[2] = PLATFORM;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 50 * 10 ** 6; // 50 PYUSD
        amounts[1] = 75 * 10 ** 6; // 75 PYUSD
        amounts[2] = 25 * 10 ** 6; // 25 PYUSD

        uint256[] memory asyncNonces = new uint256[](3);
        asyncNonces[0] = 1;
        asyncNonces[1] = 2;
        asyncNonces[2] = 3;

        // Create signatures
        bytes[] memory signatures = new bytes[](3);
        uint256 alicePrivateKey = 0xA11CE;

        for (uint i = 0; i < 3; i++) {
            bytes32 messageHash = keccak256(
                abi.encodePacked(
                    handles[i],
                    platforms[i],
                    amounts[i],
                    asyncNonces[i]
                )
            );
            bytes32 ethSignedHash = keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    messageHash
                )
            );
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(
                alicePrivateKey,
                ethSignedHash
            );
            signatures[i] = abi.encodePacked(r, s, v);
        }

        // Get alice's address from private key
        address aliceSigner = vm.addr(alicePrivateKey);

        // Fund alice signer
        pyusd.mint(aliceSigner, 1000 * 10 ** 6);
        vm.prank(aliceSigner);
        pyusd.approve(address(socialPay), type(uint256).max);

        uint256 totalAmount = 150 * 10 ** 6; // 50 + 75 + 25
        uint256 balanceBefore = pyusd.balanceOf(aliceSigner);

        // Execute batch payment
        vm.prank(aliceSigner);
        socialPay.batchPayToHandles(
            handles,
            platforms,
            amounts,
            asyncNonces,
            signatures,
            executor
        );

        // Verify balance decreased
        assertEq(
            pyusd.balanceOf(aliceSigner),
            balanceBefore - totalAmount,
            "Sender balance should decrease by total amount"
        );

        // Verify each payment is pending
        for (uint i = 0; i < 3; i++) {
            uint256 expectedPending = amounts[i] - ((amounts[i] * 100) / 10000);
            assertEq(
                socialPay.getPendingBalance(handles[i], PLATFORM),
                expectedPending,
                "Pending balance should match"
            );
        }

        // Verify nonces are marked as used
        assertTrue(
            socialPay.usedAsyncNonces(aliceSigner, 1),
            "Nonce 1 should be used"
        );
        assertTrue(
            socialPay.usedAsyncNonces(aliceSigner, 2),
            "Nonce 2 should be used"
        );
        assertTrue(
            socialPay.usedAsyncNonces(aliceSigner, 3),
            "Nonce 3 should be used"
        );

        console.log("[PASS] Test 4: Batch payment with async nonces");
    }

    // ============================================
    // Test 5: Prevent Nonce Reuse
    // ============================================
    function test_RevertOnNonceReuse() public {
        uint256 nonce = 999;
        uint256 amount = 100 * 10 ** 6; // Explicit type

        // Create signature
        uint256 alicePrivateKey = 0xA11CE;
        address aliceSigner = vm.addr(alicePrivateKey);

        pyusd.mint(aliceSigner, 1000 * 10 ** 6);
        vm.prank(aliceSigner);
        pyusd.approve(address(socialPay), type(uint256).max);

        bytes32 messageHash = keccak256(
            abi.encodePacked("test_user", PLATFORM, amount, nonce)
        );
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            alicePrivateKey,
            ethSignedHash
        );
        bytes memory signature = abi.encodePacked(r, s, v);

        // First transaction should succeed
        string[] memory handles = new string[](1);
        handles[0] = "test_user";

        string[] memory platforms = new string[](1);
        platforms[0] = PLATFORM;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        uint256[] memory nonces = new uint256[](1);
        nonces[0] = nonce;

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        vm.prank(aliceSigner);
        socialPay.batchPayToHandles(
            handles,
            platforms,
            amounts,
            nonces,
            signatures,
            executor
        );

        // Second transaction with same nonce should fail
        vm.prank(aliceSigner);
        vm.expectRevert("Nonce already used");
        socialPay.batchPayToHandles(
            handles,
            platforms,
            amounts,
            nonces,
            signatures,
            executor
        );

        console.log("[PASS] Test 5: Nonce reuse prevented");
    }

    // ============================================
    // Test 6: Executor Fee Calculation
    // ============================================
    function test_ExecutorFeeCalculation() public {
        uint256 amount = 1000 * 10 ** 6; // 1000 PYUSD
        uint256 expectedFee = (amount * 100) / 10000; // 1% = 10 PYUSD

        uint256 executorBalanceBefore = pyusd.balanceOf(executor);

        vm.prank(alice);
        socialPay.payToHandle(BOB_HANDLE, PLATFORM, amount, executor);

        assertEq(
            pyusd.balanceOf(executor),
            executorBalanceBefore + expectedFee,
            "Executor fee should be 1%"
        );

        console.log("[PASS] Test 6: Executor fee calculation");
    }

    // ============================================
    // Test 7: Update Executor Fee (Owner Only)
    // ============================================
    function test_UpdateExecutorFee() public {
        // Owner can update fee
        socialPay.setExecutorFee(200); // 2%
        assertEq(socialPay.executorFeeBps(), 200, "Fee should update to 2%");

        // Non-owner cannot update
        vm.prank(alice);
        vm.expectRevert();
        socialPay.setExecutorFee(300);

        // Cannot set fee > 10%
        vm.expectRevert("Fee too high");
        socialPay.setExecutorFee(1001);

        console.log("[PASS] Test 7: Executor fee update");
    }

    // ============================================
    // Test 8: Multiple Payments to Same Handle
    // ============================================
    function test_MultiplePaymentsToSameHandle() public {
        uint256 amount1 = 100 * 10 ** 6;
        uint256 amount2 = 50 * 10 ** 6;

        // First payment
        vm.prank(alice);
        socialPay.payToHandle(BOB_HANDLE, PLATFORM, amount1, executor);

        // Second payment
        vm.prank(alice);
        socialPay.payToHandle(BOB_HANDLE, PLATFORM, amount2, executor);

        // Pending balance should accumulate
        uint256 fee1 = (amount1 * 100) / 10000;
        uint256 fee2 = (amount2 * 100) / 10000;
        uint256 expectedPending = (amount1 - fee1) + (amount2 - fee2);

        assertEq(
            socialPay.getPendingBalance(BOB_HANDLE, PLATFORM),
            expectedPending,
            "Pending balance should accumulate"
        );

        console.log("[PASS] Test 8: Multiple payments accumulate");
    }
}
