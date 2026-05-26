import {
  engine,
  Transform,
  TextShape,
  GltfContainer,
  Material,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Entity,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { Rarity, CARD_MODEL } from '../shared/items'
import { room } from '../shared/messages'
import { rarityColor } from './ui/colors'

// ── Active item tracking ──

interface RenderedItem {
  entity: Entity
  label: Entity
  thumb: Entity | null
  baseY: number
  offset: number
}

const renderedItems = new Map<string, RenderedItem>()
let itemCount = 0

// ── Public API ──

export function spawnItemCard(id: string, name: string, rarity: Rarity, x: number, y: number, z: number, thumbnail: string = ''): void {
  if (renderedItems.has(id)) return // already rendered

  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(1.6, 1.6, 1.6)
  })
  GltfContainer.create(entity, {
    src: CARD_MODEL,
    visibleMeshesCollisionMask: ColliderLayer.CL_POINTER
  })

  // Thumbnail image plane — upper portion of card
  let thumbEntity: Entity | null = null
  if (thumbnail) {
    thumbEntity = engine.addEntity()
    Transform.create(thumbEntity, {
      position: Vector3.create(0, 0.13, -0.01),
      scale: Vector3.create(0.38, 0.38, 1),
      parent: entity
    })
    MeshRenderer.setPlane(thumbEntity)
    Material.setPbrMaterial(thumbEntity, {
      texture: Material.Texture.Common({ src: thumbnail }),
      emissiveTexture: Material.Texture.Common({ src: thumbnail }),
      emissiveIntensity: 0.6,
      emissiveColor: Color4.White(),
      roughness: 1,
      specularIntensity: 0,
      metallic: 0
    })
  }

  // Item name — below thumbnail (or centered if no thumbnail)
  const labelFront = engine.addEntity()
  Transform.create(labelFront, {
    position: Vector3.create(0, thumbnail ? -0.22 : 0.0, -0.01),
    parent: entity
  })

  // Truncate long names
  const displayName = name.length > 20 ? name.slice(0, 18) + '…' : name

  TextShape.create(labelFront, {
    text: displayName + '\n' + rarity.toUpperCase(),
    fontSize: 0.8,
    textColor: Color4.White(),
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.15,
    width: 0.9
  })

  // Pointer event — pick up on E press or left-click
  pointerEventsSystem.onPointerDown(
    {
      entity,
      opts: {
        button: InputAction.IA_PRIMARY,
        hoverText: '[E] Pick up ' + name,
        maxDistance: 5
      }
    },
    () => {
      if (!isStateSyncronized()) return
      room.send('requestPickup', { itemId: id })
    }
  )

  renderedItems.set(id, {
    entity,
    label: labelFront,
    thumb: thumbEntity,
    baseY: y,
    offset: itemCount++ * 1.5
  })
}

export function removeItemCard(id: string): void {
  const item = renderedItems.get(id)
  if (!item) return
  pointerEventsSystem.removeOnPointerDown(item.entity)
  if (item.thumb) engine.removeEntity(item.thumb)
  engine.removeEntity(item.label)
  engine.removeEntity(item.entity)
  renderedItems.delete(id)
}

export function clearAllItems(): void {
  for (const [id] of renderedItems) {
    removeItemCard(id)
  }
}

// ── Animation system — call once from client setup ──

export function itemAnimationSystem(dt: number): void {
  animTime += dt
  for (const [_id, item] of renderedItems) {
    const transform = Transform.getMutable(item.entity)
    transform.position.y = item.baseY + Math.sin(animTime * 1.5 + item.offset) * 0.1
    transform.rotation = Quaternion.fromEulerDegrees(0, animTime * 15 + item.offset * 60, 0)
  }
}

let animTime = 0
