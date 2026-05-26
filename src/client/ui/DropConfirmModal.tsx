/** Modal dialog confirming an item drop — shows item preview, rarity, and blockchain warning. */
import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { rarityColor } from './colors'
import { dropConfirmItem, closeDropConfirm, confirmDrop, dropInProgress } from './state'

const ICON_SIZE = 128
const MODAL_WIDTH = 300
const CONTENT_WIDTH = 260
const BUTTON_WIDTH = 220

export const DropConfirmModal = () => {
  if (!dropConfirmItem) return null
  const w = dropConfirmItem
  const isReal = !!(w.urn && w.collection && w.tokenId)

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

        {/* Blockchain info */}
        {isReal ? (
          <UiEntity uiTransform={{ width: CONTENT_WIDTH, flexDirection: 'column', alignItems: 'center', margin: { bottom: 14 } }}>
            <Label
              value="⛓️ ON-CHAIN DROP" fontSize={12}
              color={Color4.create(1, 0.7, 0.2, 1)}
              textAlign="middle-center" uiTransform={{ width: CONTENT_WIDTH, height: 18 }}
            />
            <Label
              value="Your NFT will be transferred to" fontSize={11}
              color={Color4.create(0.6, 0.6, 0.65, 1)}
              textAlign="middle-center" uiTransform={{ width: CONTENT_WIDTH, height: 16 }}
            />
            <Label
              value="the escrow contract on Polygon." fontSize={11}
              color={Color4.create(0.6, 0.6, 0.65, 1)}
              textAlign="middle-center" uiTransform={{ width: CONTENT_WIDTH, height: 16 }}
            />
            <Label
              value="You will sign 2 transactions." fontSize={11}
              color={Color4.create(0.6, 0.6, 0.65, 1)}
              textAlign="middle-center" uiTransform={{ width: CONTENT_WIDTH, height: 16, margin: { top: 2 } }}
            />
          </UiEntity>
        ) : (
          <UiEntity uiTransform={{ width: CONTENT_WIDTH, margin: { bottom: 14 } }}>
            <Label
              value="Are you sure you want to drop this item?" fontSize={14}
              color={Color4.create(0.7, 0.7, 0.75, 1)}
              textAlign="middle-center" textWrap="wrap"
              uiTransform={{ width: CONTENT_WIDTH, height: 36 }}
            />
          </UiEntity>
        )}

        {/* Drop button */}
        {!dropInProgress ? (
          <UiEntity
            uiTransform={{ width: BUTTON_WIDTH, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: { bottom: 8 } }}
            uiBackground={{ color: isReal ? Color4.create(0.85, 0.5, 0.1, 1) : Color4.create(0.85, 0.2, 0.2, 1) }}
            onMouseDown={() => { confirmDrop() }}
          >
            <Label
              value={isReal ? '⛓️ APPROVE & DROP' : 'DROP ITEM'}
              fontSize={14} color={Color4.White()} textAlign="middle-center"
              uiTransform={{ width: BUTTON_WIDTH, height: 36 }}
            />
          </UiEntity>
        ) : (
          <UiEntity
            uiTransform={{ width: BUTTON_WIDTH, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', margin: { bottom: 8 } }}
            uiBackground={{ color: Color4.create(0.3, 0.3, 0.35, 0.8) }}
          >
            <Label value="⏳ Waiting for wallet..." fontSize={14} color={Color4.create(1, 0.85, 0.3, 1)} textAlign="middle-center" uiTransform={{ width: BUTTON_WIDTH, height: 36 }} />
          </UiEntity>
        )}

        {/* Cancel button */}
        {!dropInProgress && (
          <UiEntity
            uiTransform={{ width: BUTTON_WIDTH, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
            uiBackground={{ color: Color4.create(0.15, 0.15, 0.18, 0.9) }}
            onMouseDown={() => { closeDropConfirm() }}
          >
            <Label value="Cancel" fontSize={13} color={Color4.create(0.6, 0.6, 0.65, 1)} textAlign="middle-center" uiTransform={{ width: BUTTON_WIDTH, height: 32 }} />
          </UiEntity>
        )}
      </UiEntity>
    </UiEntity>
  )
}
