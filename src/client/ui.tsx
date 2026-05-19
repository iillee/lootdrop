import ReactEcs, { ReactEcsRenderer, UiEntity, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { room } from '../shared/messages'

let lastDropTime = 0
const DROP_COOLDOWN_MS = 2000

function handleDrop(): void {
  if (!isStateSyncronized()) return
  const now = Date.now()
  if (now - lastDropTime < DROP_COOLDOWN_MS) return
  lastDropTime = now
  room.send('requestDrop', { t: 0 })
}

const LootDropUI = () => (
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
)

export function setupUi(): void {
  ReactEcsRenderer.setUiRenderer(LootDropUI)
}
