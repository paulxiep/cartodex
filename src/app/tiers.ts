// Base-geometry resolution tiers and the zoom policy that picks one. The tier files are self-hosted
// same-origin (built by scripts/sources/reference/basemap.ts): coarse 110m draws at world-fit and the
// finer tiers load as the user zooms in. Pure (no engine or DOM), so the composer and the bench share it.

export type Tier = '110m' | '50m' | '10m'

export const DEFAULT_TIER: Tier = '110m'

/** Heavy layers with a `-fine` snapshot read it at any tier finer than the default. */
export function isFine(tier: Tier): boolean {
  return tier !== DEFAULT_TIER
}

/** The next coarser tier, or null for the default. */
export function coarserTier(tier: Tier): Tier | null {
  return tier === '10m' ? '50m' : tier === '50m' ? '110m' : null
}

// One hysteresis step: switch up at k 2.5 / 6 and back down at the lower 2.0 / 5, so a tier holds
// through small zoom jitter near a threshold. `k` is the engine's zoom ratio (1 = world-fit).
function step(k: number, current: Tier): Tier {
  if (current === '110m') return k >= 2.5 ? '50m' : '110m'
  if (current === '50m') return k >= 6 ? '10m' : k < 2.0 ? '110m' : '50m'
  return k < 5 ? '50m' : '10m'
}

/**
 * The tier for zoom ratio `k`, stepping from `current` until it settles, so one zoom report can cross
 * both thresholds. Globe and polar views stop at 50m: their frame projects everything inside the
 * visible cap, so large countries at 10m cost several times the 50m frame.
 */
export function tierFor(k: number, current: Tier, rotatable: boolean): Tier {
  let tier = current
  for (let next = step(k, tier); next !== tier; next = step(k, tier)) tier = next
  return rotatable && tier === '10m' ? '50m' : tier
}
