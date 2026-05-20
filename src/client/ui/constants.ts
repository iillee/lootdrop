/** Shared UI layout constants. */
import { Color4 } from '@dcl/sdk/math'

// ── Slot sizing ──
export const SLOT_SIZE = 64
export const SLOT_GAP = 4
export const SLOT_RADIUS = 12

// ── Slot colors ──
export const SLOT_BG          = Color4.create(0.08, 0.08, 0.1, 0.87)
export const SLOT_BG_HOVER    = Color4.create(0.16, 0.16, 0.22, 0.92)
export const SLOT_BG_SELECTED = Color4.create(0.28, 0.22, 0.08, 0.95)
export const SLOT_EMPTY_BG    = Color4.create(0.06, 0.06, 0.08, 0.5)

// ── Grid dimensions ──
export const HOTBAR_SLOTS = 10
export const GRID_COLS = 10
export const GRID_ROWS = 5
export const GRID_SLOT_SIZE = SLOT_SIZE
export const GRID_SLOT_GAP = SLOT_GAP

// ── Timing ──
export const DROP_COOLDOWN_MS = 2000
export const NOTIFICATION_DURATION_MS = 3000
