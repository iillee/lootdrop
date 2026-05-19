import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  // Client → Server
  requestDrop: Schemas.Map({
    name: Schemas.String,
    rarity: Schemas.String,
    urn: Schemas.String
  }),
  // New: client completed on-chain deposit, tells server to place the item
  confirmDrop: Schemas.Map({
    name: Schemas.String,
    rarity: Schemas.String,
    urn: Schemas.String,
    onChainDropId: Schemas.String,
    collection: Schemas.String,
    tokenId: Schemas.String
  }),
  requestPickup: Schemas.Map({ itemId: Schemas.String }),
  // New: client completed on-chain claim, tells server to remove the item
  confirmPickup: Schemas.Map({
    itemId: Schemas.String,
    onChainDropId: Schemas.String
  }),

  // Server → Client
  itemDropped: Schemas.Map({
    id: Schemas.String,
    name: Schemas.String,
    rarity: Schemas.String,
    x: Schemas.Float,
    y: Schemas.Float,
    z: Schemas.Float,
    dropperId: Schemas.String,
    onChainDropId: Schemas.String
  }),
  // New: server tells client "you're close enough, go ahead and claim on-chain"
  approvePickup: Schemas.Map({
    itemId: Schemas.String,
    onChainDropId: Schemas.String
  }),
  itemPickedUp: Schemas.Map({
    id: Schemas.String,
    pickerId: Schemas.String,
    pickerName: Schemas.String,
    itemName: Schemas.String,
    rarity: Schemas.String
  }),
  syncAll: Schemas.Map({ itemsJson: Schemas.String }),
  error: Schemas.Map({ message: Schemas.String })
}

export const room = registerMessages(Messages)
