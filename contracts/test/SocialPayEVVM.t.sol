// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SocialPayEVVM.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock PYUSD", "PYUSD") {
        _mint(msg.sender, 1000000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockEVVMCore {
    function verifyAsyncNonce(address, uint256) external pure returns (bool) {
        return true;
    }

    function incrementAsyncNonce(address, uint256) external {}
}

contract MockNameService {
    function getHandle(address) external pure returns (string memory) {
        return "testuser";
    }

    function isHandleRegistered(string memory) external pure returns (bool) {
        return true;
    }
}

contract SocialPayEVVMTest is Test {
    SocialPayEVVM public socialPay;
    MockERC20 public pyusd;
    MockEVVMCore public evvmCore;
    MockNameService public nameService;

    address public owner;
    address public alice;
    address public bob;
    address public executor;

    function setUp() public {
        owner = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        executor = makeAddr("executor");

        pyusd = new MockERC20();
        evvmCore = new MockEVVMCore();
        nameService = new MockNameService();

        socialPay = new SocialPayEVVM(
            address(pyusd),
            address(evvmCore),
            address(nameService)
        );

        socialPay.addExecutor(executor);

        pyusd.mint(alice, 1000 * 10 ** 6);
        pyusd.mint(bob, 1000 * 10 ** 6);
    }

    function testPayToUnclaimedHandle() public {
        vm.startPrank(alice);
        pyusd.approve(address(socialPay), 100 * 10 ** 6);

        bool direct = socialPay.payToHandle(
            "bob",
            "telegram",
            100 * 10 ** 6,
            executor
        );

        assertFalse(direct);
        assertEq(socialPay.getPendingBalance("bob", "telegram"), 100 * 10 ** 6);
        vm.stopPrank();
    }

    function testPayToClaimedHandle() public {
        vm.startPrank(bob);
        bytes memory proof = abi.encodePacked("proof");

        pyusd.approve(address(socialPay), 50 * 10 ** 6);
        socialPay.payToHandle("bob", "telegram", 50 * 10 ** 6, executor);

        vm.stopPrank();

        vm.startPrank(alice);
        pyusd.approve(address(socialPay), 100 * 10 ** 6);

        bool direct = socialPay.payToHandle(
            "bob",
            "telegram",
            100 * 10 ** 6,
            executor
        );

        vm.stopPrank();
    }

    function testClaimPending() public {
        vm.startPrank(alice);
        pyusd.approve(address(socialPay), 100 * 10 ** 6);
        socialPay.payToHandle("bob", "telegram", 100 * 10 ** 6, executor);
        vm.stopPrank();

        uint256 bobBalanceBefore = pyusd.balanceOf(bob);

        vm.startPrank(bob);
        bytes memory proof = abi.encodePacked("valid_proof");

        vm.stopPrank();

        assertEq(socialPay.getPendingBalance("bob", "telegram"), 100 * 10 ** 6);
    }

    function testGetPendingBalance() public {
        vm.startPrank(alice);
        pyusd.approve(address(socialPay), 100 * 10 ** 6);
        socialPay.payToHandle("bob", "telegram", 100 * 10 ** 6, executor);
        vm.stopPrank();

        uint256 pending = socialPay.getPendingBalance("bob", "telegram");
        assertEq(pending, 100 * 10 ** 6);
    }

    function testIsHandleClaimed() public {
        (bool claimed, address wallet) = socialPay.isHandleClaimed(
            "bob",
            "telegram"
        );
        assertFalse(claimed);
        assertEq(wallet, address(0));
    }

    function testExecutorWhitelist() public {
        address newExecutor = makeAddr("newExecutor");

        socialPay.addExecutor(newExecutor);
        assertTrue(socialPay.executors(newExecutor));

        socialPay.removeExecutor(newExecutor);
        assertFalse(socialPay.executors(newExecutor));
    }

    function testAdminClaim() public {
        vm.startPrank(alice);
        pyusd.approve(address(socialPay), 100 * 10 ** 6);
        socialPay.payToHandle("charlie", "telegram", 100 * 10 ** 6, executor);
        vm.stopPrank();

        address charlieWallet = makeAddr("charlie");

        socialPay.adminClaim("charlie", "telegram", charlieWallet);

        (bool claimed, address wallet) = socialPay.isHandleClaimed(
            "charlie",
            "telegram"
        );
        assertTrue(claimed);
        assertEq(wallet, charlieWallet);
        assertEq(pyusd.balanceOf(charlieWallet), 100 * 10 ** 6);
    }
}
