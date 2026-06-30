// Shared helper: wrap a fitted d3 GeoProjection as the engine's Projector. `project`
// returns null for clipped points (e.g. the far side of an orthographic globe), which
// the layer renderers use to drop back-hemisphere geometry.

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
