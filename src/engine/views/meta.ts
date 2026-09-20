// Pure view metadata (id → display label), free of d3/DOM: the one copy of the view labels. The View
// objects in projections.ts carry none, and no engine module imports this file, so the app can import
// it directly (the gallery and the composer) without the bundle pulling in the d3/engine chunks.

import type { ViewId } from '../types'

export const VIEW_META: Record<ViewId, string> = {
  equirectangular: 'Equirectangular',
  'equal-earth': 'Equal Earth',
  'azimuthal-equidistant': 'Azimuthal Equidistant (Polar)',
  orthographic: 'Orthographic Globe',
}
