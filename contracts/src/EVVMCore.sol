// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EVVMCore
 * @notice Manages async nonces for off-chain signature verification
 */
contract EVVMCore is Ownable {
    // User => Nonce => Used
    mapping(address => mapping(uint256 => bool)) public usedNonces;
    
    // User => Current nonce counter
    mapping(address => uint256) public nonceCounters;
    
    event NonceUsed(address indexed user, uint256 indexed nonce);
    event NonceIncremented(address indexed user, uint256 newNonce);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Check if a nonce has been used
     */
    function verifyAsyncNonce(address user, uint256 nonce) external view returns (bool) {
        return !usedNonces[user][nonce];
    }
    
    /**
     * @notice Mark a nonce as used
     */
    function incrementAsyncNonce(address user, uint256 nonce) external {
        require(!usedNonces[user][nonce], "Nonce already used");
        usedNonces[user][nonce] = true;
        emit NonceUsed(user, nonce);
    }
    
    /**
     * @notice Get current nonce for user
     */
    function getCurrentNonce(address user) external view returns (uint256) {
        return nonceCounters[user];
    }
    
    /**
     * @notice Increment nonce counter
     */
    function bumpNonce(address user) external {
        nonceCounters[user]++;
        emit NonceIncremented(user, nonceCounters[user]);
    }
}
