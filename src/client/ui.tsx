/**
 * ui.tsx — Root UI renderer. Composes all UI components and re-exports
 * public functions needed by other client modules.
 */
import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { SLOT_SIZE } from './ui/constants'
import { Hotbar } from './ui/Hotbar'
import { InventoryGrid } from './ui/InventoryGrid'
import { DropConfirmModal } from './ui/DropConfirmModal'
import {
  showInventory, showDropConfirm,
  txStatusText, txStatusColor, txStatusUntil,
  notificationText, notificationColor, notificationUntil,
  toggleInventory,
} from './ui/state'

// Re-export public API so existing imports from './ui' keep working
export { showTxStatus, showPickupNotification } from './ui/state'

// ── Root UI ──

const LootDropUI = () => {
  const showNotification = Date.now() < notificationUntil
  const showTx = Date.now() < txStatusUntil

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}>
      {/* Hotbar — always visible at bottom */}
      <Hotbar />

      {/* Inventory grid overlay */}
      {showInventory && <InventoryGrid />}

      {/* Inventory toggle button */}
      {!showInventory && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { top: 40 },
          width: '100%', height: 32,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <UiEntity uiTransform={{
            width: 120, height: 32,
            borderRadius: 10,
            justifyContent: 'center', alignItems: 'center',
          }}
          uiBackground={{ color: Color4.create(0.85, 0.2, 0.2, 1) }}
          onMouseDown={toggleInventory}
          >
            <Label value="INVENTORY" fontSize={12} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: 120, height: 32 }} />
          </UiEntity>
        </UiEntity>
      )}

      {/* Transaction status */}
      {showTx && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { top: '40%' },
          width: '100%', height: 50,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <UiEntity
            uiTransform={{ padding: { top: 8, bottom: 8, left: 16, right: 16 } }}
            uiBackground={{ color: Color4.create(0.05, 0.05, 0.1, 0.9) }}
          >
            <Label value={txStatusText} fontSize={18} color={txStatusColor} textAlign="middle-center" uiTransform={{ width: 500, height: 30 }} />
          </UiEntity>
        </UiEntity>
      )}

      {/* Drop confirmation modal */}
      {showDropConfirm && <DropConfirmModal />}

      {/* Network banner */}
      <UiEntity uiTransform={{
        positionType: 'absolute',
        position: { top: 10 },
        width: '100%', height: 24,
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Label value="⛓️ POLYGON — Real NFT escrow active" fontSize={12} color={Color4.create(0.5, 0.85, 1, 0.7)} textAlign="middle-center" uiTransform={{ width: 300, height: 24 }} />
      </UiEntity>

      {/* Pickup notification */}
      {showNotification && (
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { top: '12%' },
          width: '100%', height: 40,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Label value={notificationText} fontSize={20} color={notificationColor} textAlign="middle-center" uiTransform={{ width: 500, height: 40 }} />
        </UiEntity>
      )}
    </UiEntity>
  )
}

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(LootDropUI)
}
