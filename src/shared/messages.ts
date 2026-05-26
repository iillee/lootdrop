import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  // Client → Server
  requestDrop: Schemas.Map({
    name: Schemas.String,
    rarity: Schemas.String,
    urn: Schemas.String,
    thumbnail: Schemas.String,
    dropId: Schemas.Int,          // on-chain escrow dropId (-1 = mock)
    collection: Schemas.String,   // collection contract address
    tokenId: Schemas.String       // ERC-721 tokenId
  }),
  requestPickup: Schemas.Map({ itemId: Schemas.String }),
  confirmPickup: Schemas.Map({ itemId: Schemas.String, txHash: Schemas.String }),

  // Server → Client
  droppedUrns: Schemas.Map({ urnsJson: Schemas.String }),
  itemDropped: Schemas.Map({
    id: Schemas.String,
    name: Schemas.String,
    rarity: Schemas.String,
    thumbnail: Schemas.String,
    x: Schemas.Float,
    y: Schemas.Float,
    z: Schemas.Float,
    dropperId: Schemas.String,
    dropId: Schemas.Int
  }),
  itemPickedUp: Schemas.Map({
    id: Schemas.String,
    pickerId: Schemas.String,
    pickerName: Schemas.String,
    itemName: Schemas.String,
    rarity: Schemas.String,
    urn: Schemas.String,
    thumbnail: Schemas.String,
    dropId: Schemas.Int,
    collection: Schemas.String,
    tokenId: Schemas.String
  }),
  approvePickup: Schemas.Map({
    itemId: Schemas.String,
    dropId: Schemas.Int,
    itemName: Schemas.String,
    rarity: Schemas.String
  }),
  syncAll: Schemas.Map({ itemsJson: Schemas.String }),
  error: Schemas.Map({ message: Schemas.String })
}

export const room = registerMessages(Messages)
