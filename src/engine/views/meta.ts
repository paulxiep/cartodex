// Pure view metadata (id → display label), free of d3/DOM, for consumers that must show view names
// without importing the engine's d3 projection code (the gallery). Kept deliberately separate from
// the View objects in projections.ts, which inline the same labels: importing this instead of the
// engine is what lets the gallery entry ship without the d3/engine chunk (WP-3). The two label sets
// must stay in sync.

import type { ViewId } from '../types'

export const VIEW_META: Record<ViewId, string> = {
  equirectangular: 'Equirectangular',
  'equal-earth': 'Equal Earth',
  'azimuthal-equidistant': 'Azimuthal Equidistant (Polar)',
  orthographic: 'Orthographic Globe',
}
