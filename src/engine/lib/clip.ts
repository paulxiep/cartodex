// Back-hemisphere hiding for point-like marks. d3's projection() maps both hemispheres
// onto the disc and does NOT clip points the way geoPath clips areas/lines, so on a clipped
// projection (e.g. orthographic, clipAngle 90) far-side marks would still be drawn. This
// returns a predicate true when a lon/lat is on the hidden far hemisphere, or null when the
// projection clips nothing worth hiding (equirectangular; azimuthal clips only near 180°).

import { geoDistance } from 'd3-geo'
import type { RenderContext } from '../types'

export function farSideTest(ctx: RenderContext): ((lonlat: [number, number]) => boolean) | null {
  const projection = ctx.projector.projection
  if (!projection) return null
  const clip = projection.clipAngle() as number | null
  // Cylindrical projections (equirectangular, Equal Earth) report clipAngle 0, meaning no
  // small-circle clip - they show the whole world, so nothing is on a "far side". Only a
  // positive clip below 180° (orthographic 90°) actually hides a hemisphere.
  if (clip == null || clip <= 0 || clip >= 180) return null
  const rot = projection.rotate()
  const center: [number, number] = [-rot[0], -rot[1]]
  const maxDist = (clip * Math.PI) / 180
  return (lonlat) => geoDistance(center, lonlat) > maxDist
}
