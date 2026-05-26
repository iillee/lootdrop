// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721 {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/**
 * @title LootDropEscrowV2
 * @notice Holds NFTs in escrow for the LootDrop game.
 *         Adds relay-callable depositFor() and claimFor() so a hot wallet
 *         can submit transactions on behalf of players (no player gas fees).
 */
contract LootDropEscrowV2 {
    struct Drop {
        address collection;
        uint256 tokenId;
        address dropper;
        bool active;
    }

    address public relay;
    uint256 public nextDropId;
    mapping(uint256 => Drop) public drops;

    event ItemDeposited(uint256 indexed dropId, address indexed collection, uint256 tokenId, address indexed dropper);
    event ItemClaimed(uint256 indexed dropId, address indexed picker);
    event ItemWithdrawn(uint256 indexed dropId, address indexed dropper);

    constructor(address _relay) {
        relay = _relay;
    }

    modifier onlyRelay() {
        require(msg.sender == relay, "Only relay");
        _;
    }

    /// @notice Original deposit — caller deposits their own NFT.
    function deposit(address collection, uint256 tokenId) external returns (uint256 dropId) {
        require(collection != address(0), "Invalid collection");
        dropId = nextDropId++;
        drops[dropId] = Drop(collection, tokenId, msg.sender, true);
        IERC721(collection).transferFrom(msg.sender, address(this), tokenId);
        emit ItemDeposited(dropId, collection, tokenId, msg.sender);
    }

    /// @notice Deposit on behalf of a player. Only callable by the relay wallet.
    /// @dev The player must have approved THIS CONTRACT to transfer their NFT.
    function depositFor(address owner, address collection, uint256 tokenId) external onlyRelay returns (uint256 dropId) {
        require(collection != address(0), "Invalid collection");
        dropId = nextDropId++;
        drops[dropId] = Drop(collection, tokenId, owner, true);
        IERC721(collection).transferFrom(owner, address(this), tokenId);
        emit ItemDeposited(dropId, collection, tokenId, owner);
    }

    /// @notice Original claim — caller receives the NFT.
    function claim(uint256 dropId) external {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");
        d.active = false;
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);
        emit ItemClaimed(dropId, msg.sender);
    }

    /// @notice Claim on behalf of a player. Only callable by the relay wallet.
    function claimFor(address picker, uint256 dropId) external onlyRelay {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");
        d.active = false;
        IERC721(d.collection).transferFrom(address(this), picker, d.tokenId);
        emit ItemClaimed(dropId, picker);
    }

    /// @notice Original withdraw — dropper reclaims their NFT.
    function withdraw(uint256 dropId) external {
        Drop storage d = drops[dropId];
        require(d.active, "Drop not active");
        require(d.dropper == msg.sender, "Not dropper");
        d.active = false;
        IERC721(d.collection).transferFrom(address(this), msg.sender, d.tokenId);
        emit ItemWithdrawn(dropId, msg.sender);
    }

    /// @notice Read a drop's data.
    function getDrop(uint256 dropId) external view returns (address collection, uint256 tokenId, address dropper, bool active) {
        Drop storage d = drops[dropId];
        return (d.collection, d.tokenId, d.dropper, d.active);
    }
}
