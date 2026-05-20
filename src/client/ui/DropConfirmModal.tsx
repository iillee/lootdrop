/** Modal dialog confirming an item drop — shows item preview, rarity, and confirm/cancel. */
import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { rarityColor } from './colors'
import { dropConfirmItem, closeDropConfirm, confirmDrop } from './state'

const ICON_SIZE = 128
const MODAL_WIDTH = 280
const CONTENT_WIDTH = 240
const BUTTON_WIDTH = 200

export const DropConfirmModal = () => {
  if (!dropConfirmItem) return null
  const w = dropConfirmItem

  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: '100%', height: '100%',
      justifyContent: 'center', alignItems: 'center',
    }}>
      {/* Backdrop */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
        onMouseDown={() => { closeDropConfirm() }}
      />

      {/* Modal card */}
      <UiEntity uiTransform={{
        width: MODAL_WIDTH,
        flexDirection: 'column', alignItems: 'center',
        padding: { top: 20, bottom: 20, left: 20, right: 20 },
        borderRadius: 16,
      }}
      uiBackground={{ color: Color4.create(0.08, 0.08, 0.1, 0.96) }}
      >
        {/* Item thumbnail */}
        {w.thumbnail ? (
          <UiEntity
            uiTransform={{ width: ICON_SIZE, height: ICON_SIZE, borderRadius: 12, margin: { bottom: 12 } }}
            uiBackground={{ textureMode: 'stretch', texture: { src: w.thumbnail } }}
          />
        ) : (
          <UiEntity
            uiTransform={{ width: ICON_SIZE, height: ICON_SIZE, borderRadius: 12, margin: { bottom: 12 }, justifyContent: 'center', alignItems: 'center' }}
            uiBackground={{ color: Color4.create(0.12, 0.12, 0.15, 1) }}
          >
            <Label value={w.name.slice(0, 2).toUpperCase()} fontSize={40} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: ICON_SIZE, height: ICON_SIZE }} />
          </UiEntity>
        )}

        {/* Item name */}
        <Label
          value={w.name} fontSize={18} color={Color4.White()}
          textAlign="middle-center" textWrap="wrap"
          uiTransform={{ width: CONTENT_WIDTH, height: 48, margin: { bottom: 4 } }}
        />

        {/* Rarity badge */}
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: 14 } }}>
          <UiEntity
            uiTransform={{ width: 8, height: 8, borderRadius: 4, margin: { right: 6 } }}
            uiBackground={{ color: rarityColor(w.rarity) }}
          />
          <Label
            value={w.rarity.toUpperCase()} fontSize={12}
            color={rarityColor(w.rarity)}
            textAlign="middle-left" uiTransform={{ height: 16 }}
          />
        </UiEntity>

        {/* Confirmation text */}
        <Label
          value="Are you sure you want" fontSize={14}
          color={Color4.create(0.7, 0.7, 0.75, 1)}
          textAlign="middle-center" uiTransform={{ width: CONTENT_WIDTH, height: 18 }}
        />
        <Label
          value="to drop this item?" fontSize={14}
          color={Color4.create(0.7, 0.7, 0.75, 1)}
          textAlign="middle-center" uiTransform={{ width: CONTENT_WIDTH, height: 18, margin: { bottom: 16 } }}
        />

        {/* Drop button */}
        <UiEntity
          uiTransform={{ width: BUTTON_WIDTH, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: { bottom: 8 } }}
          uiBackground={{ color: Color4.create(0.85, 0.2, 0.2, 1) }}
          onMouseDown={() => { confirmDrop() }}
        >
          <Label value="DROP ITEM" fontSize={14} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: BUTTON_WIDTH, height: 36 }} />
        </UiEntity>

        {/* Cancel button */}
        <UiEntity
          uiTransform={{ width: BUTTON_WIDTH, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: Color4.create(0.15, 0.15, 0.18, 0.9) }}
          onMouseDown={() => { closeDropConfirm() }}
        >
          <Label value="Cancel" fontSize={13} color={Color4.create(0.6, 0.6, 0.65, 1)} textAlign="middle-center" uiTransform={{ width: BUTTON_WIDTH, height: 32 }} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
