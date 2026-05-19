import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  // Client → Server
  requestDrop: Schemas.Map({ t: Schemas.Int }),
  requestPickup: Schemas.Map({ itemId: Schemas.String }),

  // Server → Client
  itemDropped: Schemas.Map({
    id: Schemas.String,
    name: Schemas.String,
    rarity: Schemas.String,
    x: Schemas.Float,
    y: Schemas.Float,
    z: Schemas.Float,
    dropperId: Schemas.String
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
