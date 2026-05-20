/** Reusable item slot component — used in both hotbar and inventory grid. */
import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { OwnedWearable } from '../../shared/items'
import { rarityColor } from './colors'
import { SLOT_BG_SELECTED, SLOT_BG_HOVER } from './constants'

export interface ItemSlotProps {
  w: OwnedWearable | null
  size: number
  radius: number
  isSelected: boolean
  isHovered: boolean
  bgNormal: Color4
  bgEmpty: Color4
  onEnter: () => void
  onLeave: () => void
  onDown: () => void
  keyStr: string
  slotLabel?: string
}

export function ItemSlot(props: ItemSlotProps) {
  const { w, size, radius, isSelected, isHovered, bgNormal, bgEmpty, onEnter, onLeave, onDown, slotLabel } = props

  const bg = w
    ? (isSelected ? SLOT_BG_SELECTED : isHovered ? SLOT_BG_HOVER : bgNormal)
    : bgEmpty
  const iconSize = Math.round(size * 0.65)

  return (
    <UiEntity
      uiTransform={{
        width: size, height: size,
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderRadius: radius,
      }}
      uiBackground={{ color: bg }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
    >
      {/* Item content */}
      {w && (
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
          {w.thumbnail ? (
            <UiEntity
              uiTransform={{ width: iconSize, height: iconSize }}
              uiBackground={{ textureMode: 'stretch', texture: { src: w.thumbnail } }}
            />
          ) : (
            <Label
              value={w.name.slice(0, 2).toUpperCase()}
              fontSize={Math.round(size * 0.28)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ width: iconSize, height: iconSize }}
            />
          )}
          {/* Rarity bar */}
          <UiEntity
            uiTransform={{ width: size - 14, height: 3, margin: { top: 1 }, borderRadius: 2 }}
            uiBackground={{ color: rarityColor(w.rarity) }}
          />
        </UiEntity>
      )}

      {/* Selection glow */}
      {isSelected && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: size, height: size, borderRadius: radius }}
          uiBackground={{ color: Color4.create(1, 0.84, 0, 0.18) }}
        />
      )}

      {/* Slot number label */}
      {slotLabel && (
        <Label
          value={slotLabel}
          fontSize={10}
          color={Color4.create(0.45, 0.45, 0.5, 1)}
          uiTransform={{ positionType: 'absolute', position: { top: 2, left: 6 }, width: 14, height: 14 }}
        />
      )}
    </UiEntity>
  )
}
