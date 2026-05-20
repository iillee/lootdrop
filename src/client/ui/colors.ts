/** Rarity color palette — shared across all UI components. */
import { Color4 } from '@dcl/sdk/math'

const RARITY_COLORS: Record<string, Color4> = {
  common:    Color4.create(0.7, 0.7, 0.7, 1),
  uncommon:  Color4.create(0.4, 0.85, 0.4, 1),
  rare:      Color4.create(0.3, 0.5, 1, 1),
  epic:      Color4.create(0.65, 0.3, 0.9, 1),
  legendary: Color4.create(1, 0.65, 0, 1),
  mythic:    Color4.create(0.9, 0.2, 0.3, 1),
  unique:    Color4.create(1, 0.4, 0.7, 1),
}

export function rarityColor(r: string): Color4 {
  return RARITY_COLORS[r] || RARITY_COLORS.common
}
