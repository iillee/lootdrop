import ReactEcs, { ReactEcsRenderer, UiEntity, Button, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../shared/messages'
import { Rarity, OwnedWearable } from '../shared/items'
import { getWearables, isLoading, isLoaded, fetchWearables } from './inventory'

// ── Rarity colors ──

const RARITY_COLORS: Record<string, Color4> = {
  common: Color4.create(0.7, 0.7, 0.7, 1),
  uncommon: Color4.create(0.4, 0.85, 0.4, 1),
  rare: Color4.create(0.3, 0.5, 1, 1),
  epic: Color4.create(0.65, 0.3, 0.9, 1),
  legendary: Color4.create(1, 0.65, 0, 1),
  mythic: Color4.create(0.9, 0.2, 0.3, 1),
  unique: Color4.create(1, 0.4, 0.7, 1),
}

function rarityColor(r: string): Color4 {
  return RARITY_COLORS[r] || RARITY_COLORS.common
}

// ── Inventory panel state ──

let showInventory = false
let scrollOffset = 0
const ITEMS_PER_PAGE = 8
let lastDropTime = 0
const DROP_COOLDOWN_MS = 2000

function toggleInventory(): void {
  showInventory = !showInventory
  if (showInventory && !isLoaded() && !isLoading()) {
    fetchWearables()
  }
  scrollOffset = 0
}

function handleDropItem(w: OwnedWearable): void {
  if (!isStateSyncronized()) return
  const now = Date.now()
  if (now - lastDropTime < DROP_COOLDOWN_MS) return
  lastDropTime = now
  room.send('requestDrop', { name: w.name, rarity: w.rarity, urn: w.urn })
  showInventory = false
}

// ── Pickup notification state ──

let notificationText = ''
let notificationColor = Color4.White()
let notificationUntil = 0
const NOTIFICATION_DURATION_MS = 3000

export function showPickupNotification(pickerName: string, itemName: string, rarity: Rarity): void {
  notificationText = `${pickerName} picked up ${itemName}!`
  notificationColor = rarityColor(rarity)
  notificationUntil = Date.now() + NOTIFICATION_DURATION_MS
}

// ── UI Components ──

const InventoryPanel = () => {
  const wearables = getWearables()
  const loading = isLoading()
  const pageItems = wearables.slice(scrollOffset, scrollOffset + ITEMS_PER_PAGE)
  const hasMore = scrollOffset + ITEMS_PER_PAGE < wearables.length
  const hasPrev = scrollOffset > 0

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { bottom: '18%', right: '3%' },
      width: 280,
      flexDirection: 'column',
      alignItems: 'center'
    }}
    uiBackground={{ color: Color4.create(0.08, 0.08, 0.12, 0.92) }}
    >
      {/* Header */}
      <UiEntity uiTransform={{
        width: '100%',
        height: 36,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: { left: 12, right: 8 }
      }}
      uiBackground={{ color: Color4.create(0.12, 0.12, 0.18, 1) }}
      >
        <Label
          value={`YOUR WEARABLES (${wearables.length})`}
          fontSize={13}
          color={Color4.create(0.7, 0.7, 0.8, 1)}
          uiTransform={{ width: 200, height: 30 }}
        />
        <Button
          value="✕"
          variant="secondary"
          fontSize={14}
          uiTransform={{ width: 30, height: 28 }}
          onMouseDown={() => { showInventory = false }}
        />
      </UiEntity>

      {/* Loading state */}
      {loading && (
        <Label
          value="Loading wearables..."
          fontSize={14}
          color={Color4.create(0.6, 0.6, 0.7, 1)}
          uiTransform={{ width: 260, height: 40, margin: { top: 10 } }}
          textAlign="middle-center"
        />
      )}

      {/* Empty state */}
      {!loading && wearables.length === 0 && (
        <Label
          value="No wearables found"
          fontSize={14}
          color={Color4.create(0.5, 0.5, 0.6, 1)}
          uiTransform={{ width: 260, height: 40, margin: { top: 10 } }}
          textAlign="middle-center"
        />
      )}

      {/* Item list */}
      {pageItems.map((w, i) => (
        <UiEntity
          key={`inv-${scrollOffset + i}`}
          uiTransform={{
            width: 264,
            height: 42,
            flexDirection: 'row',
            alignItems: 'center',
            margin: { top: 2, left: 8, right: 8 },
            padding: { left: 8, right: 4 }
          }}
          uiBackground={{ color: Color4.create(0.14, 0.14, 0.2, 1) }}
        >
          {/* Thumbnail or rarity dot */}
          {w.thumbnail ? (
            <UiEntity
              uiTransform={{ width: 36, height: 36, margin: { right: 8 }, flexShrink: 0 }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: w.thumbnail }
              }}
            />
          ) : (
            <UiEntity
              uiTransform={{ width: 8, height: 8, margin: { right: 8 }, flexShrink: 0 }}
              uiBackground={{ color: rarityColor(w.rarity) }}
            />
          )}
          {/* Name + rarity label */}
          <UiEntity uiTransform={{ flexDirection: 'column', width: 150 }}>
            <Label
              value={w.name.length > 22 ? w.name.slice(0, 20) + '…' : w.name}
              fontSize={12}
              color={Color4.White()}
              uiTransform={{ width: 170, height: 20 }}
            />
            <Label
              value={w.rarity.toUpperCase()}
              fontSize={9}
              color={rarityColor(w.rarity)}
              uiTransform={{ width: 170, height: 14 }}
            />
          </UiEntity>
          {/* Drop button */}
          <Button
            value="DROP"
            variant="primary"
            fontSize={11}
            uiTransform={{ width: 56, height: 30 }}
            onMouseDown={() => handleDropItem(w)}
          />
        </UiEntity>
      ))}

      {/* Pagination */}
      {(hasPrev || hasMore) && (
        <UiEntity uiTransform={{
          width: '100%',
          height: 32,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          margin: { top: 4, bottom: 4 }
        }}>
          {hasPrev && (
            <Button
              value="◀"
              variant="secondary"
              fontSize={12}
              uiTransform={{ width: 40, height: 26, margin: { right: 8 } }}
              onMouseDown={() => { scrollOffset = Math.max(0, scrollOffset - ITEMS_PER_PAGE) }}
            />
          )}
          <Label
            value={`${Math.floor(scrollOffset / ITEMS_PER_PAGE) + 1}/${Math.ceil(wearables.length / ITEMS_PER_PAGE)}`}
            fontSize={11}
            color={Color4.create(0.5, 0.5, 0.6, 1)}
            uiTransform={{ width: 40, height: 24 }}
            textAlign="middle-center"
          />
          {hasMore && (
            <Button
              value="▶"
              variant="secondary"
              fontSize={12}
              uiTransform={{ width: 40, height: 26, margin: { left: 8 } }}
              onMouseDown={() => { scrollOffset += ITEMS_PER_PAGE }}
            />
          )}
        </UiEntity>
      )}

      {/* Bottom padding */}
      <UiEntity uiTransform={{ width: 1, height: 6 }} />
    </UiEntity>
  )
}

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
          value={showInventory ? 'CANCEL' : 'DROP ITEM'}
          variant="primary"
          fontSize={16}
          color={Color4.White()}
          uiTransform={{ width: 160, height: 50 }}
          onMouseDown={toggleInventory}
        />
      </UiEntity>

      {/* Inventory panel */}
      {showInventory && <InventoryPanel />}

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
