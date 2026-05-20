/** Bottom hotbar — always visible. Shows 10 item slots with drop popup. */
import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { SLOT_SIZE, SLOT_GAP, SLOT_RADIUS, SLOT_BG, SLOT_EMPTY_BG, HOTBAR_SLOTS } from './constants'
import { ItemSlot } from './ItemSlot'
import {
  selSource, selIndex, hotbar, showInventory,
  hotbarHover, hoveredGridItem, setHoveredGridItem,
  clearSelection, handleSlotClick, openDropConfirm,
  ensureHotbarInit,
} from './state'

export const Hotbar = () => {
  ensureHotbarInit()

  const hasSelection = selSource === 'hotbar' && selIndex >= 0 && !showInventory && hotbar[selIndex] != null

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: '100%', height: '100%',
    }}>
      {/* Click-away backdrop to dismiss selection */}
      {hasSelection && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.01) }}
          onMouseDown={() => { clearSelection() }}
        />
      )}

      {/* Hotbar row */}
      <UiEntity uiTransform={{
        positionType: 'absolute',
        position: { bottom: 20 },
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {Array.from({ length: HOTBAR_SLOTS }).map((_, i) => {
            const isThisSelected = selSource === 'hotbar' && selIndex === i && !showInventory && hotbar[i] != null
            return (
              <UiEntity key={`hb-wrap-${i}`} uiTransform={{
                width: SLOT_SIZE, height: SLOT_SIZE,
                margin: { left: i === 0 ? 0 : SLOT_GAP },
              }}>
                {/* Drop popup — shared background extends above the card */}
                {isThisSelected && (
                  <UiEntity uiTransform={{
                    positionType: 'absolute',
                    position: { bottom: 0, left: 0 },
                    width: SLOT_SIZE,
                    height: SLOT_SIZE + 36,
                    flexDirection: 'column', alignItems: 'center',
                    padding: { top: 5, left: 4, right: 4 },
                    borderRadius: SLOT_RADIUS,
                  }}
                  uiBackground={{ color: Color4.create(0.05, 0.05, 0.08, 0.94) }}
                  >
                    <UiEntity
                      uiTransform={{ width: SLOT_SIZE - 12, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                      uiBackground={{ color: Color4.create(0.85, 0.2, 0.2, 1) }}
                      onMouseDown={() => {
                        const w = hotbar[i]
                        if (w) openDropConfirm(w, i)
                      }}
                    >
                      <Label value="DROP" fontSize={11} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: SLOT_SIZE - 12, height: 26 }} />
                    </UiEntity>
                  </UiEntity>
                )}

                {/* Slot */}
                {ItemSlot({
                  w: hotbar[i],
                  size: SLOT_SIZE,
                  radius: SLOT_RADIUS,
                  isSelected: selSource === 'hotbar' && selIndex === i,
                  isHovered: hotbarHover[i],
                  bgNormal: SLOT_BG,
                  bgEmpty: SLOT_EMPTY_BG,
                  onEnter: () => { hotbarHover[i] = true; if (showInventory) setHoveredGridItem(hotbar[i] || null) },
                  onLeave: () => { hotbarHover[i] = false; if (showInventory && hoveredGridItem === hotbar[i]) setHoveredGridItem(null) },
                  onDown: () => { handleSlotClick('hotbar', i) },
                  keyStr: `hb-${i}`,
                  slotLabel: `${i + 1 === 10 ? 0 : i + 1}`,
                })}
              </UiEntity>
            )
          })}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
