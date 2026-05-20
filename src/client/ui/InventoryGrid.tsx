/** Full inventory grid — opens as an overlay above the hotbar. */
import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isLoading } from '../inventory'
import { rarityColor } from './colors'
import {
  GRID_COLS, GRID_ROWS, GRID_SLOT_SIZE, GRID_SLOT_GAP,
  SLOT_BG, SLOT_BG_HOVER, SLOT_EMPTY_BG,
} from './constants'
import { ItemSlot } from './ItemSlot'
import {
  selSource, selIndex, inventory, gridScrollOffset,
  gridHover, hoveredGridItem, setHoveredGridItem,
  setShowInventory, setGridScrollOffset,
  getInventorySize, handleSlotClick,
} from './state'

export const InventoryGrid = () => {
  const loading = isLoading()
  const invSize = getInventorySize()
  const PAGE_SIZE = GRID_COLS * GRID_ROWS
  const totalPages = Math.max(1, Math.ceil(invSize / PAGE_SIZE))
  const currentPage = Math.floor(gridScrollOffset / PAGE_SIZE)
  const visibleItems = inventory.slice(gridScrollOffset, gridScrollOffset + PAGE_SIZE)
  const hasPrev = gridScrollOffset > 0
  const hasNext = gridScrollOffset + PAGE_SIZE < invSize
  const itemCount = inventory.filter(Boolean).length

  const gridWidth = GRID_COLS * GRID_SLOT_SIZE + (GRID_COLS - 1) * GRID_SLOT_GAP + 24

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: '100%', height: '100%',
      flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <UiEntity uiTransform={{
        width: gridWidth,
        flexDirection: 'column', alignItems: 'center',
        padding: { top: 10, bottom: 10, left: 12, right: 12 },
        borderRadius: 14,
      }}
      uiBackground={{ color: Color4.create(0.06, 0.06, 0.09, 0.94) }}
      >
        {/* Header bar */}
        <UiEntity uiTransform={{
          width: '100%', height: 32,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          margin: { bottom: 6 }, padding: { left: 10, right: 4 },
        }}>
          {/* Hovered item info or placeholder */}
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
            {hoveredGridItem ? (
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
                <Label
                  value={hoveredGridItem.name} fontSize={14} color={Color4.White()}
                  textAlign="middle-center" uiTransform={{ height: 20, margin: { right: 10 } }}
                />
                <UiEntity
                  uiTransform={{ width: 8, height: 8, borderRadius: 4, margin: { right: 6 } }}
                  uiBackground={{ color: rarityColor(hoveredGridItem.rarity) }}
                />
                <Label
                  value={hoveredGridItem.rarity.toUpperCase()} fontSize={12}
                  color={rarityColor(hoveredGridItem.rarity)}
                  textAlign="middle-left" uiTransform={{ height: 18 }}
                />
              </UiEntity>
            ) : (
              <Label
                value="Hover over an item to see details · Click to equip"
                fontSize={11} color={Color4.create(0.45, 0.45, 0.55, 1)}
                textAlign="middle-center" uiTransform={{ height: 18 }}
              />
            )}
          </UiEntity>

          {/* Close button */}
          <UiEntity
            uiTransform={{ width: 24, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}
            uiBackground={{ color: Color4.create(0.2, 0.12, 0.12, 0.9) }}
            onMouseDown={() => { setShowInventory(false) }}
          >
            <Label value="✕" fontSize={14} color={Color4.create(1, 0.4, 0.4, 1)} textAlign="middle-center" uiTransform={{ width: 24, height: 24 }} />
          </UiEntity>
        </UiEntity>

        {/* Loading / empty states */}
        {loading && (
          <Label value="Loading wearables..." fontSize={13} color={Color4.create(0.5, 0.5, 0.6, 1)} textAlign="middle-center" uiTransform={{ height: 40 }} />
        )}
        {!loading && itemCount === 0 && (
          <Label value="Inventory empty — unequip items from your hotbar" fontSize={12} color={Color4.create(0.4, 0.4, 0.5, 1)} textAlign="middle-center" uiTransform={{ height: 40 }} />
        )}

        {/* Item grid */}
        {Array.from({ length: GRID_ROWS }).map((_, row) => (
          <UiEntity key={`grow-${row}`} uiTransform={{ flexDirection: 'row', margin: { top: row === 0 ? 0 : GRID_SLOT_GAP } }}>
            {Array.from({ length: GRID_COLS }).map((_, col) => {
              const localIdx = row * GRID_COLS + col
              const absIdx = gridScrollOffset + localIdx
              const w = localIdx < visibleItems.length ? visibleItems[localIdx] || null : null
              return (
                <UiEntity key={`gs-${row}-${col}`} uiTransform={{ margin: { left: col === 0 ? 0 : GRID_SLOT_GAP } }}>
                  {ItemSlot({
                    w,
                    size: GRID_SLOT_SIZE,
                    radius: 10,
                    isSelected: selSource === 'grid' && selIndex === absIdx,
                    isHovered: gridHover[localIdx] || false,
                    bgNormal: SLOT_BG,
                    bgEmpty: SLOT_EMPTY_BG,
                    onEnter: () => { gridHover[localIdx] = true; setHoveredGridItem(w) },
                    onLeave: () => { gridHover[localIdx] = false; if (hoveredGridItem === w) setHoveredGridItem(null) },
                    onDown: () => { handleSlotClick('grid', absIdx) },
                    keyStr: `gs-${row}-${col}`,
                  })}
                </UiEntity>
              )
            })}
          </UiEntity>
        ))}

        {/* Pagination */}
        <UiEntity uiTransform={{
          width: '100%', height: 30,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          margin: { top: 8 },
        }}>
          <UiEntity
            uiTransform={{ width: 30, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', margin: { right: 12 } }}
            uiBackground={{ color: hasPrev ? SLOT_BG_HOVER : Color4.create(0.06, 0.06, 0.08, 0.3) }}
            onMouseDown={() => { if (hasPrev) { setGridScrollOffset(Math.max(0, gridScrollOffset - PAGE_SIZE)); setHoveredGridItem(null) } }}
          >
            <Label value="◀" fontSize={14} color={hasPrev ? Color4.create(0.8, 0.8, 0.9, 1) : Color4.create(0.25, 0.25, 0.3, 1)} textAlign="middle-center" uiTransform={{ width: 30, height: 24 }} />
          </UiEntity>
          <Label
            value={`Page ${currentPage + 1} of ${totalPages}`}
            fontSize={12} color={Color4.create(0.6, 0.6, 0.7, 1)}
            textAlign="middle-center" uiTransform={{ width: 100, height: 24 }}
          />
          <UiEntity
            uiTransform={{ width: 30, height: 24, borderRadius: 6, justifyContent: 'center', alignItems: 'center', margin: { left: 12 } }}
            uiBackground={{ color: hasNext ? SLOT_BG_HOVER : Color4.create(0.06, 0.06, 0.08, 0.3) }}
            onMouseDown={() => { if (hasNext) { setGridScrollOffset(gridScrollOffset + PAGE_SIZE); setHoveredGridItem(null) } }}
          >
            <Label value="▶" fontSize={14} color={hasNext ? Color4.create(0.8, 0.8, 0.9, 1) : Color4.create(0.25, 0.25, 0.3, 1)} textAlign="middle-center" uiTransform={{ width: 30, height: 24 }} />
          </UiEntity>
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
