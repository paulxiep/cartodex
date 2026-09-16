// Viewport culling. makeCull(ctx) builds a per-frame predicate: `true` = the feature is safely
// outside the drawn viewport and may be skipped. It returns `null` when no safe test can be built,
// and the caller then draws everything. Culling is an optimization, never a correctness requirement:
// every uncertain case bails to draw-all (`null`) or keeps the feature (`false`).
//
// A feature's test reads its lon/lat bounding box. A bbox is a pure function of geometry in the
// canonical base coordinate with a first-class RFC 7946 slot, so it is read from `feature.bbox` when
// present and otherwise computed once with d3 geoBounds (antimeridian/pole-aware) and cached into
// that slot. The cache survives every rotate/zoom frame (feature objects persist across paint), so
// the sweep is paid once per feature, and never at all on a flat world-fit view where nothing culls.

import { geoBounds, geoDistance } from 'd3-geo'
import type { Feature } from 'geojson'
import type { RenderContext } from '../types'

const DEG = Math.PI / 180

type BBox = [number, number, number, number] // [west, south, east, north] (RFC 7946)

function bboxOf(f: Feature): BBox | null {
  const existing = f.bbox
  if (existing && existing.length >= 4) {
    return [existing[0]!, existing[1]!, existing[2]!, existing[3]!]
  }
  if (!f.geometry) return null
  const [[w, s], [e, n]] = geoBounds(f)
  if (!Number.isFinite(w) || !Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(n)) {
    return null
  }
  const bb: BBox = [w, s, e, n]
  f.bbox = bb
  return bb
}

// Rotatable (globe/polar) views: cull a feature whose bbox lies wholly beyond the visible cap.
// Generalizes a point-only far-side test to a feature bbox: a bounding circle around the bbox (its
// centre plus the larger half-diagonal, with a small margin) is compared to the cap radius.
// Only orthographic (clipAngle 90) has a cap worth culling; azimuthal-equidistant shows ~the whole
// sphere (clipAngle ~180) so nothing is culled there (the strict whole-sphere polar view).
function makeGlobeCull(ctx: RenderContext): ((f: Feature) => boolean) | null {
  const proj = ctx.projector.projection
  if (!proj) return null
  const clip = proj.clipAngle() as number | null
  if (clip == null || clip <= 0 || clip >= 179) return null
  const rot = proj.rotate()
  const center: [number, number] = [-rot[0], -rot[1]]
  const capRadius = clip * DEG
  return (f) => {
    const bb = bboxOf(f)
    if (!bb) return false
    const [w, s, e, n] = bb
    // Antimeridian-crossing, or a wide-longitude feature (a world-spanning surface band, whose
    // lon corners collapse on the sphere): the bounding-circle bound is invalid, so keep it. The
    // cullable features (river/plate segments, points, small regions) are all longitude-local.
    if (w > e || e - w > 90) return false
    const bcx = (w + e) / 2
    const bcy = (s + n) / 2
    const diag = Math.max(geoDistance([w, s], [e, n]), geoDistance([w, n], [e, s]))
    const radius = diag / 2 + 2 * DEG
    return geoDistance(center, [bcx, bcy]) - radius > capRadius
  }
}

// Equal-area (pseudocylindrical) views: latitude is an exact function of screen-y (a parallel is a
// horizontal line), so the visible latitude band is exact from inverting the top and bottom edges,
// and a feature whose latitude range is entirely above the top or below the bottom is off-screen.
// Longitude is left unrestricted: the pseudocylindrical inverse curves too sharply toward the poles
// to bound longitude cheaply and conservatively, and latitude alone already drops most off-screen
// features when zoomed. Bail to draw-all when an edge is off the map (world-fit, or a pole in view).
function makeEqualAreaCull(ctx: RenderContext): ((f: Feature) => boolean) | null {
  const proj = ctx.projector.projection
  if (!proj?.invert) return null
  const invert = proj.invert
  const { width, height } = ctx
  // Scan x across an edge for an on-map sample; latitude is constant along a screen-y line, so the
  // first valid invert gives that edge's latitude (null when the whole edge is off the map).
  const latAtY = (y: number): number | null => {
    for (let i = 0; i <= 20; i++) {
      const ll = invert([(i / 20) * width, y])
      if (ll && Number.isFinite(ll[1])) return ll[1]
    }
    return null
  }
  const north = latAtY(0)
  const south = latAtY(height)
  if (north == null || south == null || north - south >= 178) return null
  const S = south - 0.5
  const N = north + 0.5
  return (f) => {
    const bb = bboxOf(f)
    if (!bb) return false
    return bb[3] < S || bb[1] > N // feature latitude band entirely below or above the viewport
  }
}

// Flat views: cull by a lon/lat window inverted from the viewport. The cylindrical case
// (equirectangular) has an exactly linear inverse, so the window from the viewport corners is exact.
// The equal-area view (Equal Earth) is pseudocylindrical and culls by latitude band only (see
// makeEqualAreaCull). Bail to draw-all (`null`) on any unsafe condition: a corner that fails to
// invert, an antimeridian wrap, a pole in view, or a ~whole-world window.
function makeFlatCull(ctx: RenderContext): ((f: Feature) => boolean) | null {
  const proj = ctx.projector.projection
  if (!proj?.invert) return null
  if (ctx.view.equalArea) return makeEqualAreaCull(ctx)
  const { width, height } = ctx
  const w2 = width / 2
  const h2 = height / 2
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  // Corners give the exact window for a linear inverse; the edge midpoints and centre are added so a
  // view straddling the antimeridian (its corners alias to a <180 span) still shows up as span > 180.
  for (const [x, y] of [
    [0, 0], [width, 0], [0, height], [width, height],
    [w2, 0], [w2, height], [0, h2], [width, h2], [w2, h2],
  ] as Array<[number, number]>) {
    const ll = proj.invert([x, y])
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null
    minLon = Math.min(minLon, ll[0])
    maxLon = Math.max(maxLon, ll[0])
    minLat = Math.min(minLat, ll[1])
    maxLat = Math.max(maxLat, ll[1])
  }
  if (maxLon - minLon > 180) return null // antimeridian wrap or a wide (~world) view
  const inFrame = (p: [number, number] | null): boolean =>
    !!p && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height
  if (inFrame(proj([0, 90])) || inFrame(proj([0, -90]))) return null // pole in view
  // A small epsilon covers rounding only; the linear inverse makes the corner window exact.
  const W = minLon - 0.5
  const E = maxLon + 0.5
  const S = minLat - 0.5
  const N = maxLat + 0.5
  return (f) => {
    const bb = bboxOf(f)
    if (!bb) return false
    const [fw, fs, fe, fn] = bb
    if (fw > fe) return false // feature crosses the antimeridian: keep (conservative)
    return fe < W || fw > E || fn < S || fs > N // no overlap with the window -> cull
  }
}

export function makeCull(ctx: RenderContext): ((f: Feature) => boolean) | null {
  return ctx.view.rotatable ? makeGlobeCull(ctx) : makeFlatCull(ctx)
}

// Exact back-hemisphere test for a MARK POSITION (a point coordinate or a region centroid). d3's
// projection() folds both hemispheres onto the disc and does NOT return null for far-side points
// the way geoPath clips paths, so point-like primitives need this explicit horizon test to hide
// marks on a globe's hidden hemisphere. It is exact at the cap edge (unlike the feature cull, which
// pads its bbox bounding-circle and so must not be used to hide a single mark). Returns null when
// the projection hides no hemisphere (cylindrical views; azimuthal shows ~the whole sphere).
export function farSideTest(ctx: RenderContext): ((lonlat: [number, number]) => boolean) | null {
  const projection = ctx.projector.projection
  if (!projection) return null
  const clip = projection.clipAngle() as number | null
  if (clip == null || clip <= 0 || clip >= 180) return null
  const rot = projection.rotate()
  const center: [number, number] = [-rot[0], -rot[1]]
  const maxDist = clip * DEG
  return (lonlat) => geoDistance(center, lonlat) > maxDist
}
