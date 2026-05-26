// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title LootDropEscrowV2
 * @notice Holds DCL wearable NFTs in escrow for the LootDrop game.
 *         Supports relay-based deposits and claims for use with Decentraland scenes
 *         where the player cannot send Polygon transactions directly.
 *
 *   DIRECT:     Owner calls deposit() / claim() / withdraw() themselves.
 *   VIA RELAY:  Relay wallet calls depositFor() / claimFor() on behalf of players.
 *
 * Deploy on Polygon PoS. Pass the relay hot wallet address to the constructor.
 */
contract LootDropEscrowV2 is IERC721Receiver {

    struct Drop {
        address collection;
        uint256 tokenId;
        address dropper;
        bool    active;
    }

    uint256 public nextDropId;
    mapping(uint256 => Drop) private drops;

    address public immutable relay;

    event ItemDeposited(uint256 indexed dropId, address indexed collection, uint256 tokenId, address indexed dropper);
    event ItemClaimed(uint256 indexed dropId, address indexed picker);
    event ItemWithdrawn(uint256 indexed dropId, address indexed dropper);

    constructor(address _relay) {
        require(_relay != address(0), "Invalid relay");
        relay = _relay;
    }

    // ═══════════════════════════════════════════
    // Direct calls (player sends tx themselves)
    // ═══════════════════════════════════════════

    /// @notice Deposit an NFT into escrow. Caller must have approved this contract.
    function deposit(address collection, uint256 tokenId) external returns (uint256 dropId) {
        return _deposit(msg.sender, collection, tokenId);
    }

    /// @notice Claim a dropped item. NFT transfers to caller.
    function claim(uint256 dropId) external {
        _claim(msg.sender, dropId);
    }

    /// @notice Cancel a drop. Only the original dropper can withdraw.
    function withdraw(uint256 dropId) external {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");
        require(d.dropper == msg.sender, "Not the dropper");

        d.active = false;
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);

        emit ItemWithdrawn(dropId, msg.sender);
    }

    // ═══════════════════════════════════════════
    // Relay calls (relay wallet acts for players)
    // ═══════════════════════════════════════════

    /// @notice Deposit on behalf of a player. Only callable by relay.
    /// @dev The player must have approved THIS CONTRACT (not the relay) for the token.
    function depositFor(address owner, address collection, uint256 tokenId) external returns (uint256 dropId) {
        require(msg.sender == relay, "Only relay");
        return _deposit(owner, collection, tokenId);
    }

    /// @notice Claim on behalf of a player. Only callable by relay.
    function claimFor(address picker, uint256 dropId) external {
        require(msg.sender == relay, "Only relay");
        _claim(picker, dropId);
    }

    // ═══════════════════════════════════════════
    // View
    // ═══════════════════════════════════════════

    function getDrop(uint256 dropId) external view returns (
        address collection,
        uint256 tokenId,
        address dropper,
        bool    active
    ) {
        Drop storage d = drops[dropId];
        return (d.collection, d.tokenId, d.dropper, d.active);
    }

    // ═══════════════════════════════════════════
    // Internal
    // ═══════════════════════════════════════════

    function _deposit(address owner, address collection, uint256 tokenId) internal returns (uint256 dropId) {
        require(collection != address(0), "Invalid collection");

        dropId = nextDropId++;
        drops[dropId] = Drop({
            collection: collection,
            tokenId: tokenId,
            dropper: owner,
            active: true
        });

        IERC721(collection).transferFrom(owner, address(this), tokenId);

        emit ItemDeposited(dropId, collection, tokenId, owner);
    }

    function _claim(address picker, uint256 dropId) internal {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");

        d.active = false;
        IERC721(d.collection).transferFrom(address(this), picker, d.tokenId);

        emit ItemClaimed(dropId, picker);
    }

    /// @notice Required to receive ERC-721 tokens via safeTransferFrom.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
