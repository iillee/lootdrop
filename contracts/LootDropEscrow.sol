// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LootDropEscrow
 * @notice Holds ERC-721 NFTs (DCL wearables) while they're "dropped" in-world.
 *         Dropper deposits → item appears in scene → picker claims → NFT transfers to picker.
 *         Dropper can withdraw if nobody has claimed yet.
 */
contract LootDropEscrow is ReentrancyGuard {

    struct Drop {
        address collection;     // ERC-721 contract address
        uint256 tokenId;        // Token ID within that collection
        address dropper;        // Who deposited it
        bool active;            // Still available for pickup
    }

    uint256 public nextDropId;
    mapping(uint256 => Drop) public drops;

    // Owner (deployer) — only used for emergency pause, not custody
    address public owner;
    bool public paused;

    // ── Events ──
    event ItemDeposited(uint256 indexed dropId, address indexed collection, uint256 tokenId, address indexed dropper);
    event ItemClaimed(uint256 indexed dropId, address indexed picker);
    event ItemWithdrawn(uint256 indexed dropId, address indexed dropper);

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Deposit an ERC-721 token into escrow. Caller must have approved this contract first.
     * @param collection The ERC-721 contract address
     * @param tokenId The token ID to deposit
     * @return dropId The ID assigned to this drop (used by the scene to track it)
     */
    function deposit(address collection, uint256 tokenId) external whenNotPaused nonReentrant returns (uint256 dropId) {
        require(collection != address(0), "Invalid collection");

        // Transfer NFT from caller to this contract
        IERC721(collection).transferFrom(msg.sender, address(this), tokenId);

        dropId = nextDropId++;
        drops[dropId] = Drop({
            collection: collection,
            tokenId: tokenId,
            dropper: msg.sender,
            active: true
        });

        emit ItemDeposited(dropId, collection, tokenId, msg.sender);
    }

    /**
     * @notice Claim a dropped item. NFT transfers to the caller. Anyone can claim.
     * @param dropId The drop to claim
     */
    function claim(uint256 dropId) external whenNotPaused nonReentrant {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");

        d.active = false;

        // Transfer NFT from escrow to picker
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);

        emit ItemClaimed(dropId, msg.sender);
    }

    /**
     * @notice Dropper reclaims their item if nobody has picked it up yet.
     * @param dropId The drop to withdraw
     */
    function withdraw(uint256 dropId) external nonReentrant {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");
        require(d.dropper == msg.sender, "Not the dropper");

        d.active = false;

        // Transfer NFT back to dropper
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);

        emit ItemWithdrawn(dropId, msg.sender);
    }

    /**
     * @notice Read drop info.
     */
    function getDrop(uint256 dropId) external view returns (
        address collection, uint256 tokenId, address dropper, bool active
    ) {
        Drop storage d = drops[dropId];
        return (d.collection, d.tokenId, d.dropper, d.active);
    }

    // ── Admin ──

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}
