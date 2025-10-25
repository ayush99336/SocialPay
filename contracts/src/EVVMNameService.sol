// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EVVMNameService
 * @notice Manages social handle registrations
 */
contract EVVMNameService is Ownable {
    // Platform => Handle => Address
    mapping(string => mapping(string => address)) public handles;
    
    // Address => Platform => Handle
    mapping(address => mapping(string => string)) public reverseHandles;
    
    event HandleRegistered(
        string indexed platform,
        string indexed handle,
        address indexed owner
    );
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Register a handle
     */
    function registerHandle(
        string memory platform,
        string memory handle,
        address owner
    ) external onlyOwner {
        require(handles[platform][handle] == address(0), "Handle taken");
        
        handles[platform][handle] = owner;
        reverseHandles[owner][platform] = handle;
        
        emit HandleRegistered(platform, handle, owner);
    }
    
    /**
     * @notice Get handle for address
     */
    function getHandle(address user) external view returns (string memory) {
        return reverseHandles[user]["telegram"];
    }
    
    /**
     * @notice Check if handle is registered
     */
    function isHandleRegistered(string memory handle) external view returns (bool) {
        return handles["telegram"][handle] != address(0);
    }
    
    /**
     * @notice Get address for handle
     */
    function getAddress(string memory platform, string memory handle) 
        external 
        view 
        returns (address) 
    {
        return handles[platform][handle];
    }
}
