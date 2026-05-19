import {
  engine,
  Transform,
  TextShape,
  GltfContainer,
  ColliderLayer,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { Rarity, RARITY_MODELS } from '../shared/items'

// ── Rarity visual config ──

const RARITY_TEXT_COLOR: Record<Rarity, Color4> = {
  common: Color4.create(0.95, 0.95, 0.95, 1),
  rare: Color4.create(1, 1, 1, 1),
  legendary: Color4.create(1, 1, 1, 1),
}

// ── Active item tracking ──

interface RenderedItem {
  entity: Entity
  baseY: number
  offset: number
}

const renderedItems = new Map<string, RenderedItem>()
let itemCount = 0

// ── Public API ──

export function spawnItemCard(id: string, name: string, rarity: Rarity, x: number, y: number, z: number): void {
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
    text: name,
    fontSize: 1.2,
    textColor: RARITY_TEXT_COLOR[rarity] || RARITY_TEXT_COLOR.common,
    outlineColor: Color4.create(0, 0, 0, 1),
    outlineWidth: 0.2,
    width: 0.8
  })

  renderedItems.set(id, {
    entity,
    baseY: y,
    offset: itemCount++ * 1.5
  })
}

export function removeItemCard(id: string): void {
  const item = renderedItems.get(id)
  if (!item) return
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
    transform.position.y = item.baseY + Math.sin(animTime * 2 + item.offset) * 0.15
    transform.rotation = Quaternion.fromEulerDegrees(0, animTime * 30 + item.offset * 60, 0)
  }
}

let animTime = 0
