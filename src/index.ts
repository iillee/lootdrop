import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  Billboard,
  BillboardMode,
  GltfContainer,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'

export function main() {
  // === SCENE CONSTANTS ===
  // 2x2 parcels = 32m x 32m, center at (16, 0, 16)
  const CENTER_X = 16
  const CENTER_Z = 16

  // === GROUND FLOOR ===
  // Main floor — dark stone look
  const floor = engine.addEntity()
  Transform.create(floor, {
    position: Vector3.create(CENTER_X, 0, CENTER_Z),
    scale: Vector3.create(32, 0.1, 32)
  })
  MeshRenderer.setBox(floor)
  MeshCollider.setBox(floor)
  Material.setPbrMaterial(floor, {
    albedoColor: Color4.create(0.15, 0.15, 0.18, 1),
    roughness: 0.85,
    metallic: 0.1
  })

  // === DROP ZONE — Central circular platform ===
  // Raised platform in the center where drops happen
  const dropZone = engine.addEntity()
  Transform.create(dropZone, {
    position: Vector3.create(CENTER_X, 0.08, CENTER_Z),
    scale: Vector3.create(10, 0.15, 10)
  })
  MeshRenderer.setCylinder(dropZone)
  MeshCollider.setCylinder(dropZone)
  Material.setPbrMaterial(dropZone, {
    albedoColor: Color4.create(0.12, 0.12, 0.2, 1),
    roughness: 0.5,
    metallic: 0.3,
    emissiveColor: Color3.create(0.05, 0.05, 0.15),
    emissiveIntensity: 0.5
  })

  // Drop zone ring — glowing edge
  const dropRing = engine.addEntity()
  Transform.create(dropRing, {
    position: Vector3.create(CENTER_X, 0.18, CENTER_Z),
    scale: Vector3.create(10.5, 0.02, 10.5)
  })
  MeshRenderer.setCylinder(dropRing)
  Material.setPbrMaterial(dropRing, {
    albedoColor: Color4.create(0.1, 0.4, 1, 0.8),
    emissiveColor: Color3.create(0.1, 0.4, 1),
    emissiveIntensity: 3
  })

  // Inner ring accent
  const innerRing = engine.addEntity()
  Transform.create(innerRing, {
    position: Vector3.create(CENTER_X, 0.19, CENTER_Z),
    scale: Vector3.create(5, 0.02, 5)
  })
  MeshRenderer.setCylinder(innerRing)
  Material.setPbrMaterial(innerRing, {
    albedoColor: Color4.create(0.3, 0.1, 1, 0.6),
    emissiveColor: Color3.create(0.3, 0.1, 1),
    emissiveIntensity: 2
  })

  // === WELCOME SIGN ===
  const signPost = engine.addEntity()
  Transform.create(signPost, {
    position: Vector3.create(CENTER_X, 3.5, CENTER_Z + 12),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0)
  })

  // Title
  const titleText = engine.addEntity()
  Transform.create(titleText, {
    position: Vector3.create(0, 0, 0),
    parent: signPost
  })
  TextShape.create(titleText, {
    text: 'LOOTDROP',
    fontSize: 8,
    textColor: Color4.create(0.2, 0.6, 1, 1),
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.15
  })
  Billboard.create(titleText, { billboardMode: BillboardMode.BM_Y })

  // Subtitle
  const subtitleText = engine.addEntity()
  Transform.create(subtitleText, {
    position: Vector3.create(0, -1, 0),
    parent: signPost
  })
  TextShape.create(subtitleText, {
    text: 'Drop Items. Find Items. Keep Items.',
    fontSize: 3,
    textColor: Color4.create(0.8, 0.8, 0.9, 1)
  })
  Billboard.create(subtitleText, { billboardMode: BillboardMode.BM_Y })

  // Instructions
  const instructText = engine.addEntity()
  Transform.create(instructText, {
    position: Vector3.create(0, -2, 0),
    parent: signPost
  })
  TextShape.create(instructText, {
    text: '[ Prototype v0.1 ]',
    fontSize: 2,
    textColor: Color4.create(0.5, 0.5, 0.6, 1)
  })
  Billboard.create(instructText, { billboardMode: BillboardMode.BM_Y })

  // === CORNER PILLARS — visual boundaries ===
  const pillarPositions = [
    Vector3.create(3, 0, 3),
    Vector3.create(29, 0, 3),
    Vector3.create(3, 0, 29),
    Vector3.create(29, 0, 29)
  ]

  for (const pos of pillarPositions) {
    // Pillar base
    const pillar = engine.addEntity()
    Transform.create(pillar, {
      position: Vector3.create(pos.x, 1.5, pos.z),
      scale: Vector3.create(0.6, 3, 0.6)
    })
    MeshRenderer.setBox(pillar)
    MeshCollider.setBox(pillar)
    Material.setPbrMaterial(pillar, {
      albedoColor: Color4.create(0.2, 0.2, 0.25, 1),
      roughness: 0.4,
      metallic: 0.6
    })

    // Pillar light on top
    const light = engine.addEntity()
    Transform.create(light, {
      position: Vector3.create(pos.x, 3.3, pos.z),
      scale: Vector3.create(0.4, 0.4, 0.4)
    })
    MeshRenderer.setSphere(light)
    Material.setPbrMaterial(light, {
      albedoColor: Color4.create(0.1, 0.5, 1, 1),
      emissiveColor: Color3.create(0.1, 0.5, 1),
      emissiveIntensity: 5
    })
  }

  // === SAMPLE DROPPED ITEMS (Mock) ===
  // These represent what dropped items will look like
  // In the real system, these would be spawned by the server
  createMockDroppedItem(
    Vector3.create(CENTER_X - 2, 1.2, CENTER_Z + 1),
    'Legendary Hat',
    'legendary'
  )
  createMockDroppedItem(
    Vector3.create(CENTER_X + 3, 1.2, CENTER_Z - 1),
    'Rare Jacket',
    'rare'
  )
  createMockDroppedItem(
    Vector3.create(CENTER_X + 1, 1.2, CENTER_Z + 3),
    'Common Shoes',
    'common'
  )

  // === BOB ANIMATION SYSTEM ===
  // Gentle floating animation for dropped items
  let time = 0
  engine.addSystem((dt: number) => {
    time += dt
    for (const [entity] of engine.getEntitiesWith(TextShape, Transform)) {
      const transform = Transform.getMutableOrNull(entity)
      if (transform && transform.parent) {
        // Only animate items that are children (our mock items' labels)
        // The actual bob is handled on the parent
      }
    }
    // Animate all mock items
    for (const item of mockItems) {
      const transform = Transform.getMutable(item.entity)
      transform.position.y = item.baseY + Math.sin(time * 2 + item.offset) * 0.15
      transform.rotation = Quaternion.fromEulerDegrees(0, time * 30 + item.offset * 60, 0)
    }
  })
}

// === MOCK ITEM SYSTEM ===
interface MockItem {
  entity: number
  baseY: number
  offset: number
}
const mockItems: MockItem[] = []

function createMockDroppedItem(
  position: { x: number; y: number; z: number },
  name: string,
  rarity: 'common' | 'rare' | 'legendary'
) {
  const rarityColors: Record<string, { color: Color4; emissive: Color3; intensity: number; model: string }> = {
    common: {
      color: Color4.create(0.7, 0.7, 0.7, 1),
      emissive: Color3.create(0.5, 0.5, 0.5),
      intensity: 1,
      model: 'models/rarity-bg-common.glb'
    },
    rare: {
      color: Color4.create(0.2, 0.4, 1, 1),
      emissive: Color3.create(0.2, 0.4, 1),
      intensity: 3,
      model: 'models/rarity-bg-rare.glb'
    },
    legendary: {
      color: Color4.create(1, 0.6, 0.1, 1),
      emissive: Color3.create(1, 0.6, 0.1),
      intensity: 4,
      model: 'models/rarity-bg-legendary.glb'
    }
  }

  const config = rarityColors[rarity]

  // Item card (the rarity background model)
  const item = engine.addEntity()
  Transform.create(item, {
    position: Vector3.create(position.x, position.y, position.z),
    scale: Vector3.create(0.8, 0.8, 0.8)
  })
  GltfContainer.create(item, {
    src: config.model,
    visibleMeshesCollisionMask: ColliderLayer.CL_POINTER
  })

  // Glow sphere behind the card
  const glow = engine.addEntity()
  Transform.create(glow, {
    position: Vector3.create(0, 0, 0),
    scale: Vector3.create(1.2, 1.2, 0.3),
    parent: item
  })
  MeshRenderer.setSphere(glow)
  Material.setPbrMaterial(glow, {
    albedoColor: Color4.create(config.emissive.r, config.emissive.g, config.emissive.b, 0.2),
    emissiveColor: config.emissive,
    emissiveIntensity: config.intensity
  })

  // Item name label
  const label = engine.addEntity()
  Transform.create(label, {
    position: Vector3.create(0, 0.8, 0),
    parent: item
  })
  TextShape.create(label, {
    text: name,
    fontSize: 2,
    textColor: config.color,
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.2
  })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })

  // Rarity tag below name
  const rarityLabel = engine.addEntity()
  Transform.create(rarityLabel, {
    position: Vector3.create(0, 0.5, 0),
    parent: item
  })
  TextShape.create(rarityLabel, {
    text: `[ ${rarity.toUpperCase()} ]`,
    fontSize: 1.2,
    textColor: Color4.create(config.color.r, config.color.g, config.color.b, 0.7)
  })
  Billboard.create(rarityLabel, { billboardMode: BillboardMode.BM_Y })

  mockItems.push({
    entity: item,
    baseY: position.y,
    offset: mockItems.length * 1.5
  })
}
