// Which (view, layer-primitive) cells are meaningful. The composer uses this to grey
// out nonsensical combinations instead of rendering nonsense.
//
// Cartogram views replace area layout with value-driven shapes (scaled regions), so
// only the `region` primitive registers against them; overlays like points, flows, and
// base have no stable position there. Projection views accept all four primitives.

import type { Primitive, View } from './types'

export function compatible(view: View, primitive: Primitive): boolean {
  if (view.kind === 'cartogram') return primitive === 'region'
  return true
}
