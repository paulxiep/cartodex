// Scalar grid -> valid spherical contour bands (build-time). This is the projection-invariant
// geometry factory for the `surface` encoding: it turns a gridded scalar field (ETOPO elevation
// now; SST / climate later) into a FeatureCollection of hypsometric bands that render identically
// under every projection, because the geometry it emits is valid *on the sphere*.
//
// Producing seamless-on-the-sphere geometry is a build-time / data-layer concern, kept strictly
// outside the projection (render) layer: lon/lat is the canonical base coordinate, and flat / globe
// / polar are just flattenings of it. So this module owns the parts that make the lon/lat encoding
// faithful to the sphere - contouring, the grid->geo transform, and ring hygiene - and the engine
// renders whatever it is handed, view-agnostically.
//
// Full-sphere coverage & the antimeridian: the grid spans the FULL -180..180 (the +180 column is the
// same meridian as -180, so no Earth is dropped). d3-contour treats -180 and +180 as the left/right
// edges, so each band is CUT at the antimeridian - edges lie exactly on +-180, which coincide on the
// sphere, giving valid non-wrapping polygons (RFC 7946's recommended form) that every projection,
// including the whole-sphere polar view, renders seamlessly. (d3-geo-projection's geoStitch would
// merge these into wrapping polygons instead, but that corrupts the winding of the cumulative bands
// larger than a hemisphere - the deep-ocean fills - so cut bands are the correct representation here.)
//
// Pipeline: prepend a coverage floor below the grid min (so the deepest cells stay enclosed) ->
// d3-contour marching squares at the given levels -> affine grid-index -> lon/lat -> round + de-dupe
// ring vertices to the weight budget. Each band carries its level as `value`.

import { contours } from 'd3-contour'
import type { Feature, FeatureCollection, MultiPolygon, Position } from 'geojson'
import type { ScalarGrid } from './erddapGrid'

export interface ContourBandsOptions {
  /** decimals to round baked coordinates to (~1 km at 0.01deg). Default 2. */
  coordDecimals?: number
}

function makeRound(dp: number): (n: number) => number {
  const f = 10 ** dp
  return (n) => Math.round(n * f) / f
}

// Round vertices, drop rounding-collapsed duplicates, keep the ring closed.
function cleanRing(ring: Position[], round: (n: number) => number): Position[] {
  const out: Position[] = []
  for (const pt of ring) {
    const p: Position = [round(pt[0]!), round(pt[1]!)]
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  if (out.length > 1) {
    const f = out[0]!
    const l = out[out.length - 1]!
    if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0]!, f[1]!])
  }
  return out
}

/**
 * Contour a scalar grid into hypsometric bands as valid spherical geometry. `levels` are the band
 * cut levels (also the colour thresholds downstream); a floor below the grid min is prepended so the
 * deepest cells are enclosed. Grid axes are assumed ascending and spanning the full sphere
 * (lon -180..180, lat -90..90) so bands cut cleanly at the antimeridian.
 */
export function scalarGridToBands(
  grid: ScalarGrid,
  levels: number[],
  opts: ContourBandsOptions = {},
): { features: FeatureCollection; bandCount: number; floor: number } {
  const round = makeRound(opts.coordDecimals ?? 2)
  const w = grid.lons.length
  const h = grid.lats.length
  if (w < 2 || h < 2) throw new Error(`degenerate grid ${w}x${h}`)

  // Flatten row-major (row y = latitude index, ascending north) for d3-contour; track the min so a
  // floor threshold below the deepest value still encloses it as the backmost band.
  const flat = new Array<number>(w * h)
  let min = Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = grid.values[y]![x]!
      flat[y * w + x] = v
      if (Number.isFinite(v) && v < min) min = v
    }
  }
  if (!Number.isFinite(min)) throw new Error('grid has no finite values')
  const floor = Math.floor(min) - 1
  // No-data cells (NaN land / masked ocean, e.g. SST over continents) get a sentinel strictly below
  // the floor threshold, so d3-contour drops them from every band - they fall under the lowest cut,
  // yield no polygon, and render transparent - while boundary interpolation between sentinel and real
  // ocean stays finite (no NaN vertices at coastlines). Elevation is fully defined, so this is a no-op
  // there; the floor band still encloses its deepest real cells.
  const noData = floor - 1e4
  for (let i = 0; i < flat.length; i++) if (!Number.isFinite(flat[i]!)) flat[i] = noData
  const bands = contours().size([w, h]).thresholds([floor, ...levels])(flat)

  // Affine grid-index -> lon/lat. d3-contour returns image-space rings (y increasing downward);
  // mapping y -> latitude ascending flips them vertically, landing rings on the clockwise-exterior
  // winding d3-geo fills as interior - so no reversal is needed. Clamp indices to the grid bounds so
  // extreme columns/rows land exactly on +-180 / +-90 (clean antimeridian cut, no sub-cell overshoot).
  const lon0 = grid.lons[0]!
  const lat0 = grid.lats[0]!
  const dLon = (grid.lons[w - 1]! - lon0) / (w - 1)
  const dLat = (grid.lats[h - 1]! - lat0) / (h - 1)
  const toGeo = (pt: Position): Position => {
    const gx = Math.min(Math.max(pt[0]!, 0), w - 1)
    const gy = Math.min(Math.max(pt[1]!, 0), h - 1)
    return [round(lon0 + gx * dLon), round(lat0 + gy * dLat)]
  }

  const features: Feature<MultiPolygon>[] = []
  for (const band of bands) {
    const polys: Position[][][] = []
    for (const poly of band.coordinates) {
      const rings: Position[][] = []
      for (const ring of poly) {
        const cleaned = cleanRing(ring.map(toGeo), round)
        if (cleaned.length >= 4) rings.push(cleaned)
      }
      if (rings.length) polys.push(rings)
    }
    if (polys.length) features.push({ type: 'Feature', properties: { value: band.value }, geometry: { type: 'MultiPolygon', coordinates: polys } })
  }
  return { features: { type: 'FeatureCollection', features }, bandCount: features.length, floor }
}
