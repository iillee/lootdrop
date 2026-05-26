import {
  engine,
  Transform,
  TextShape,
  GltfContainer,
  Material,
  MeshRenderer,
  ColliderLayer,
  Entity,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { Rarity, RARITY_MODELS } from '../shared/items'
import { room } from '../shared/messages'

// ── Rarity visual config ──

const RARITY_TEXT_COLOR: Record<string, Color4> = {
  common: Color4.create(0.95, 0.95, 0.95, 1),
  uncommon: Color4.create(0.95, 0.95, 0.95, 1),
  rare: Color4.create(1, 1, 1, 1),
  epic: Color4.create(1, 1, 1, 1),
  legendary: Color4.create(1, 1, 1, 1),
  mythic: Color4.create(1, 1, 1, 1),
  unique: Color4.create(1, 1, 1, 1),
}

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
    src: RARITY_MODELS[rarity] || RARITY_MODELS.common,
    visibleMeshesCollisionMask: ColliderLayer.CL_POINTER
  })

  // Front label
  const labelFront = engine.addEntity()
  Transform.create(labelFront, {
    position: Vector3.create(0, 0.08, 0.01),
    parent: entity
  })
  TextShape.create(labelFront, {
    text: name + '\n' + rarity.toUpperCase(),
    fontSize: 1.2,
    textColor: RARITY_TEXT_COLOR[rarity] || RARITY_TEXT_COLOR.common,
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.2,
    width: 0.8
  })

  // Thumbnail image plane (if available)
  let thumbEntity: Entity | null = null
  if (thumbnail) {
    thumbEntity = engine.addEntity()
    Transform.create(thumbEntity, {
      position: Vector3.create(0, 0.08, 0.005),
      scale: Vector3.create(0.45, 0.45, 1),
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
