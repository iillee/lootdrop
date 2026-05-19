import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../shared/messages'
import { Rarity } from '../shared/items'

// ── Drop button state ──

let lastDropTime = 0
const DROP_COOLDOWN_MS = 2000

function handleDrop(): void {
  if (!isStateSyncronized()) return
  const now = Date.now()
  if (now - lastDropTime < DROP_COOLDOWN_MS) return
  lastDropTime = now
  room.send('requestDrop', { t: 0 })
}

// ── Pickup notification state ──

const RARITY_COLORS: Record<Rarity, Color4> = {
  common: Color4.create(0.8, 0.8, 0.8, 1),
  rare: Color4.create(0.3, 0.5, 1, 1),
  legendary: Color4.create(1, 0.65, 0, 1),
}

let notificationText = ''
let notificationColor = Color4.White()
let notificationUntil = 0
const NOTIFICATION_DURATION_MS = 3000

export function showPickupNotification(pickerName: string, itemName: string, rarity: Rarity): void {
  notificationText = `${pickerName} picked up ${itemName}!`
  notificationColor = RARITY_COLORS[rarity] || RARITY_COLORS.common
  notificationUntil = Date.now() + NOTIFICATION_DURATION_MS
}

// ── UI Component ──

const LootDropUI = () => {
  const showNotification = Date.now() < notificationUntil

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {/* Drop button — bottom right */}
      <UiEntity uiTransform={{
        positionType: 'absolute',
        position: { bottom: '10%', right: '3%' },
        width: 160,
        height: 50
      }}>
        <Button
          value="DROP ITEM"
          variant="primary"
          fontSize={16}
          color={Color4.White()}
          uiTransform={{ width: 160, height: 50 }}
          onMouseDown={handleDrop}
        />
      </UiEntity>

      {/* Pickup notification — top center */}
      {showNotification && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { top: '12%' },
          width: '100%',
          height: 40,
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Label
            value={notificationText}
            fontSize={20}
            color={notificationColor}
            textAlign="middle-center"
            uiTransform={{ width: 500, height: 40 }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(LootDropUI)
}
