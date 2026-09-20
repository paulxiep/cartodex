// Shared helper: wrap a fitted d3 GeoProjection as the engine's Projector. `project` returns the
// projected point, or null only when d3 yields none. Note d3 does NOT return null for a globe's
// far-side points - both hemispheres fold onto the disc - so point-like renderers hide back-
// hemisphere marks with an explicit horizon test (lib/cull farSideTest); geoPath clips paths itself.

import { geoPath } from 'd3-geo'
import type { GeoProjection } from 'd3-geo'
import type { Projector } from '../types'

export function svgProjector(projection: GeoProjection): Projector {
  const path = geoPath(projection)
  return {
    projection,
    path,
    project: (coord) => projection(coord) ?? null,
  }
}

/** Unit sphere object used with `.fitSize` to frame the whole world. */
export const SPHERE = { type: 'Sphere' } as const
