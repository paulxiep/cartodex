// Great-circle helpers for the `flow` primitive. A straight LineString between two
// far-apart lon/lat points projects to a wrong-looking chord under most projections,
// so we densify it into many intermediate points along the great circle. d3-geo's
// geoInterpolate gives the spherical interpolation; the result projects to a correct
// curve under any projection (and is what reads as an "arc").

import { geoInterpolate, geoDistance } from 'd3-geo'
import type { Feature, LineString } from 'geojson'

export type LonLat = [number, number]

/** Densify a single great-circle segment into `steps`+1 lon/lat points. */
export function greatCirclePoints(a: LonLat, b: LonLat, steps = 48): LonLat[] {
  const interp = geoInterpolate(a, b)
  const pts: LonLat[] = []
  for (let i = 0; i <= steps; i++) {
    const p = interp(i / steps)
    pts.push([p[0], p[1]])
  }
  return pts
}

/**
 * Build a densified LineString Feature for an a→b flow. Step count scales with the
 * angular distance so short hops stay cheap and long hauls stay smooth.
 */
export function flowFeature(
  a: LonLat,
  b: LonLat,
  properties: Record<string, unknown> = {},
): Feature<LineString> {
  const angular = geoDistance(a, b) // radians, 0..π
  const steps = Math.max(6, Math.round((angular / Math.PI) * 28))
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: greatCirclePoints(a, b, steps) },
    properties,
  }
}
