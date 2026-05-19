import { isServer } from '@dcl/sdk/network'
// Shared modules — must be static imports so schemas register before engine seals
import './shared/messages'

export async function main() {
  if (isServer()) {
    console.log('[Main] ⚙️  SERVER MODE')
    const { setupServer } = await import('./server/server')
    await setupServer()
    return
  }

  console.log('[Main] 🎮 CLIENT MODE')
  const { setupClient } = await import('./client/setup')
  const { setupUi } = await import('./client/ui')
  setupClient()
  setupUi()
}
