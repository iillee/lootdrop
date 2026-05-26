// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title LootDropEscrow
 * @notice Holds DCL wearable NFTs (ERC-721) in escrow for the LootDrop game.
 *
 *   DROP:   Player approves this contract, then calls deposit(collection, tokenId).
 *           The NFT transfers here. Returns a dropId.
 *
 *   PICKUP: Another player calls claim(dropId). The NFT transfers to them.
 *
 *   CANCEL: The original dropper calls withdraw(dropId) to get it back
 *           (only if nobody has claimed it yet).
 *
 * Deploy on Polygon PoS (DCL wearables live there).
 * No admin keys, no fees, no upgradability — pure escrow.
 */
contract LootDropEscrow is IERC721Receiver {

    struct Drop {
        address collection;
        uint256 tokenId;
        address dropper;
        bool    active;
    }

    uint256 public nextDropId;
    mapping(uint256 => Drop) private drops;

    event ItemDeposited(uint256 indexed dropId, address indexed collection, uint256 tokenId, address indexed dropper);
    event ItemClaimed(uint256 indexed dropId, address indexed picker);
    event ItemWithdrawn(uint256 indexed dropId, address indexed dropper);

    /// @notice Deposit an ERC-721 NFT into escrow. Caller must have approved this contract first.
    /// @param collection The NFT contract address (DCL wearable collection).
    /// @param tokenId    The specific token ID to escrow.
    /// @return dropId    The ID assigned to this drop.
    function deposit(address collection, uint256 tokenId) external returns (uint256 dropId) {
        require(collection != address(0), "Invalid collection");

        dropId = nextDropId++;
        drops[dropId] = Drop({
            collection: collection,
            tokenId: tokenId,
            dropper: msg.sender,
            active: true
        });

        // Transfer NFT from caller to this contract
        IERC721(collection).transferFrom(msg.sender, address(this), tokenId);

        emit ItemDeposited(dropId, collection, tokenId, msg.sender);
    }

    /// @notice Claim a dropped item. The NFT transfers to the caller.
    /// @param dropId The drop to claim.
    function claim(uint256 dropId) external {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");

        d.active = false;

        // Transfer NFT from escrow to picker
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);

        emit ItemClaimed(dropId, msg.sender);
    }

    /// @notice Cancel a drop and reclaim the NFT. Only the original dropper can call this.
    /// @param dropId The drop to withdraw.
    function withdraw(uint256 dropId) external {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");
        require(d.dropper == msg.sender, "Not the dropper");

        d.active = false;

        // Transfer NFT back to dropper
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);

        emit ItemWithdrawn(dropId, msg.sender);
    }

    /// @notice Read drop details.
    function getDrop(uint256 dropId) external view returns (
        address collection,
        uint256 tokenId,
        address dropper,
        bool    active
    ) {
        Drop storage d = drops[dropId];
        return (d.collection, d.tokenId, d.dropper, d.active);
    }

    /// @notice Required to receive ERC-721 tokens via safeTransferFrom.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
