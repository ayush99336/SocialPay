// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title SocialPayEVVM
 * @notice Pay anyone via their social media handle using PYUSD on EVVM
 * @dev Implements Fisher/Relayer, Executor rewards, and Async Nonces
 */
contract SocialPayEVVM is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // PYUSD token on Sepolia
    IERC20 public immutable pyusd;

    // EVVM contracts
    address public evvmCore;
    address public nameService;

    // Social handle => wallet address mapping
    mapping(bytes32 => address) public socialHandleToWallet;

    // Pending claims for unclaimed handles
    mapping(bytes32 => uint256) public pendingClaims;

    // Track used async nonces per user
    mapping(address => mapping(uint256 => bool)) public usedAsyncNonces;

    // Executor fee percentage (1% = 100 basis points)
    uint256 public executorFeeBps = 100; // 1%

    // Events
    event PaymentSent(
        address indexed sender,
        string recipientHandle,
        string platform,
        uint256 amount,
        bool directTransfer
    );

    event PaymentClaimed(
        address indexed claimer,
        string handle,
        string platform,
        uint256 amount
    );

    event BatchPaymentExecuted(
        address indexed sender,
        uint256 totalAmount,
        uint256 recipientCount,
        address executor
    );

    event HandleLinked(address indexed wallet, string handle, string platform);

    constructor(
        address _pyusd,
        address _evvmCore,
        address _nameService
    ) Ownable(msg.sender) {
        require(_pyusd != address(0), "Invalid PYUSD address");
        pyusd = IERC20(_pyusd);
        evvmCore = _evvmCore;
        nameService = _nameService;
    }

    /**
     * @notice Pay to a social media handle
     * @param handle Social media username (e.g., "alice")
     * @param platform Platform name (e.g., "telegram", "discord", "twitter")
     * @param amount Amount of PYUSD to send (in wei, 6 decimals for PYUSD)
     * @param executor Address of the fisher executing this transaction
     */
    function payToHandle(
        string memory handle,
        string memory platform,
        uint256 amount,
        address executor
    ) external {
        require(amount > 0, "Amount must be > 0");
        require(executor != address(0), "Invalid executor");

        bytes32 handleHash = _getHandleHash(handle, platform);

        // Transfer PYUSD from sender to contract
        require(
            pyusd.transferFrom(msg.sender, address(this), amount),
            "PYUSD transfer failed"
        );

        // Calculate executor fee
        uint256 executorFee = (amount * executorFeeBps) / 10000;
        uint256 recipientAmount = amount - executorFee;

        // Pay executor immediately
        if (executorFee > 0) {
            require(
                pyusd.transfer(executor, executorFee),
                "Executor fee failed"
            );
        }

        address recipientWallet = socialHandleToWallet[handleHash];

        if (recipientWallet == address(0)) {
            // User hasn't claimed yet - store as pending
            pendingClaims[handleHash] += recipientAmount;
            emit PaymentSent(
                msg.sender,
                handle,
                platform,
                recipientAmount,
                false
            );
        } else {
            // Direct transfer to existing wallet
            require(
                pyusd.transfer(recipientWallet, recipientAmount),
                "Direct transfer failed"
            );
            emit PaymentSent(
                msg.sender,
                handle,
                platform,
                recipientAmount,
                true
            );
        }
    }

    /**
     * @notice Batch payment to multiple social handles using async nonces
     * @dev Demonstrates EVVM's async nonce capability
     */
    function batchPayToHandles(
        string[] memory handles,
        string[] memory platforms,
        uint256[] memory amounts,
        uint256[] memory asyncNonces,
        bytes[] memory signatures,
        address executor
    ) external {
        require(handles.length == platforms.length, "Length mismatch");
        require(handles.length == amounts.length, "Length mismatch");
        require(handles.length == asyncNonces.length, "Length mismatch");
        require(handles.length == signatures.length, "Length mismatch");
        require(executor != address(0), "Invalid executor");

        uint256 totalAmount = 0;

        for (uint i = 0; i < handles.length; i++) {
            // Verify async nonce hasn't been used
            require(
                !usedAsyncNonces[msg.sender][asyncNonces[i]],
                "Nonce already used"
            );

            // Verify EIP-191 signature
            bytes32 messageHash = _getPaymentMessageHash(
                handles[i],
                platforms[i],
                amounts[i],
                asyncNonces[i]
            );

            address signer = messageHash.toEthSignedMessageHash().recover(
                signatures[i]
            );
            require(signer == msg.sender, "Invalid signature");

            // Mark nonce as used
            usedAsyncNonces[msg.sender][asyncNonces[i]] = true;

            // Process payment
            bytes32 handleHash = _getHandleHash(handles[i], platforms[i]);
            address recipientWallet = socialHandleToWallet[handleHash];

            uint256 executorFee = (amounts[i] * executorFeeBps) / 10000;
            uint256 recipientAmount = amounts[i] - executorFee;

            if (recipientWallet == address(0)) {
                pendingClaims[handleHash] += recipientAmount;
            } else {
                require(
                    pyusd.transfer(recipientWallet, recipientAmount),
                    "Transfer failed"
                );
            }

            totalAmount += amounts[i];

            emit PaymentSent(
                msg.sender,
                handles[i],
                platforms[i],
                recipientAmount,
                recipientWallet != address(0)
            );
        }

        // Transfer total from sender
        require(
            pyusd.transferFrom(msg.sender, address(this), totalAmount),
            "Batch transfer failed"
        );

        // Pay executor total fees
        uint256 totalExecutorFee = (totalAmount * executorFeeBps) / 10000;
        if (totalExecutorFee > 0) {
            require(
                pyusd.transfer(executor, totalExecutorFee),
                "Executor fee failed"
            );
        }

        emit BatchPaymentExecuted(
            msg.sender,
            totalAmount,
            handles.length,
            executor
        );
    }

    /**
     * @notice Claim pending payments by linking social handle to wallet
     * @param handle Your social media username
     * @param platform Platform name
     * @param proof Signed proof of handle ownership (signed by fisher/oracle)
     */
    function claimPending(
        string memory handle,
        string memory platform,
        bytes memory proof
    ) external {
        bytes32 handleHash = _getHandleHash(handle, platform);

        // Verify handle isn't already claimed
        require(
            socialHandleToWallet[handleHash] == address(0),
            "Handle already claimed"
        );

        // TODO: Verify proof signature from trusted fisher/oracle
        // For hackathon MVP, we'll allow direct claims

        // Link handle to wallet
        socialHandleToWallet[handleHash] = msg.sender;
        emit HandleLinked(msg.sender, handle, platform);

        // Transfer pending claims
        uint256 pending = pendingClaims[handleHash];
        if (pending > 0) {
            pendingClaims[handleHash] = 0;
            require(
                pyusd.transfer(msg.sender, pending),
                "Claim transfer failed"
            );
            emit PaymentClaimed(msg.sender, handle, platform, pending);
        }
    }

    /**
     * @notice Check if a social handle is claimed
     */
    function isHandleClaimed(
        string memory handle,
        string memory platform
    ) external view returns (bool, address) {
        bytes32 handleHash = _getHandleHash(handle, platform);
        address wallet = socialHandleToWallet[handleHash];
        return (wallet != address(0), wallet);
    }

    /**
     * @notice Get pending balance for unclaimed handle
     */
    function getPendingBalance(
        string memory handle,
        string memory platform
    ) external view returns (uint256) {
        bytes32 handleHash = _getHandleHash(handle, platform);
        return pendingClaims[handleHash];
    }

    /**
     * @notice Update executor fee (only owner)
     */
    function setExecutorFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high"); // Max 10%
        executorFeeBps = _feeBps;
    }

    // Internal functions
    function _getHandleHash(
        string memory handle,
        string memory platform
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(platform, ":", handle));
    }

    function _getPaymentMessageHash(
        string memory handle,
        string memory platform,
        uint256 amount,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(handle, platform, amount, nonce));
    }
}
