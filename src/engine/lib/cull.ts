// Viewport culling. visibleLayer(layer, ctx, padding) returns the layer to draw this frame, without the
// features that lie wholly outside the drawn viewport. `padding` widens the viewport by that many
// pixels for primitives that draw past their geometry (marker glyphs, bubbles, strokes); `null` turns
// culling off for a layer whose drawing moves geometry (the cartogram's scaling). Culling is an
// optimization, never a correctness requirement: every uncertain case draws everything or keeps the
// feature.
//
// A feature's test reads its lon/lat bounding box, computed once with d3 geoBounds (antimeridian and
// pole aware), and on rotatable views a bounding cap derived from that box. Both are cached per feature
// object, which persists across rotate/zoom frames, so the sweep is paid once per feature.

import { geoBounds, geoDistance } from 'd3-geo'
import type { GeoProjection } from 'd3-geo'
import type { Feature } from 'geojson'
import type { RenderContext, ResolvedLayer } from '../types'

const DEG = Math.PI / 180
// Rounding slack added to every window and cap (degrees for flat views, radians for globe caps).
const SLACK_DEG = 0.5

type Cull = (f: Feature) => boolean
type BBox = [number, number, number, number] // [west, south, east, north] (RFC 7946)
interface Cap {
  center: [number, number]
  radius: number // radians
}
interface Bounds {
  box: BBox | null
  cap?: Cap | null
}

const boundsCache = new WeakMap<Feature, Bounds>()

function boxOf(f: Feature): BBox | null {
  if (!f.geometry) return null
  const [[w, s], [e, n]] = geoBounds(f)
  const box: BBox = [w, s, e, n]
  return box.every((v) => Number.isFinite(v)) ? box : null
}

function boundsOf(f: Feature): Bounds {
  let bounds = boundsCache.get(f)
  if (!bounds) {
    bounds = { box: boxOf(f) }
    boundsCache.set(f, bounds)
  }
  return bounds
}

// A cap containing the feature's box, or null when the box crosses the antimeridian or spans more than
// 180 degrees of longitude. For such a box the point farthest from its lon/lat midpoint is a corner, so
// the corner distance bounds the whole box (half the diagonal does not: it misses the equatorward
// corners of wide, high-latitude boxes such as Canada's).
function capOf(f: Feature): Cap | null {
  const bounds = boundsOf(f)
  if (bounds.cap === undefined) {
    const box = bounds.box
    if (!box || box[0] > box[2] || box[2] - box[0] > 180) bounds.cap = null
    else {
      const [w, s, e, n] = box
      const center: [number, number] = [(w + e) / 2, (s + n) / 2]
      // Corners are symmetric in longitude about the midpoint, so two distances cover all four.
      bounds.cap = { center, radius: Math.max(geoDistance(center, [w, s]), geoDistance(center, [w, n])) }
    }
  }
  return bounds.cap
}

// The rotated projection centre and the clip angle (radians), or null when the projection clips no
// hemisphere (the flat views, which have no clip angle).
function horizon(projection: GeoProjection): { center: [number, number]; clip: number } | null {
  const clip = projection.clipAngle() as number | null
  if (clip == null || clip <= 0 || clip >= 180) return null
  const rot = projection.rotate()
  return { center: [-rot[0], -rot[1]], clip: clip * DEG }
}

// Rotatable views (orthographic globe, azimuthal polar): cull a feature whose bounding cap lies wholly
// outside the visible cap. Rotation and zoom keep the projection centre fixed on screen, so the frame
// corner farthest from it (plus the padding) bounds everything drawn; the view's radialAngle turns
// that screen distance into an angle. Without radialAngle the visible cap is the clip angle.
function makeGlobeCull(ctx: RenderContext, padding: number): Cull | null {
  const proj = ctx.projector.projection
  const hz = proj && horizon(proj)
  if (!proj || !hz) return null
  const [cx, cy] = proj.translate()
  const { width, height } = ctx
  const reach =
    Math.max(Math.hypot(cx, cy), Math.hypot(width - cx, cy), Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)) +
    padding
  const onScreen = ctx.view.radialAngle ? ctx.view.radialAngle(reach / proj.scale()) : Infinity
  const cap = Math.min(hz.clip, onScreen) + SLACK_DEG * DEG
  if (cap >= Math.PI) return null // the whole sphere can be on screen
  return (f) => {
    const c = capOf(f)
    return c != null && geoDistance(hz.center, c.center) - c.radius > cap
  }
}

// Equal-area (pseudocylindrical) views: latitude is an exact function of screen-y (a parallel is a
// horizontal line), so the visible latitude band comes from inverting the top and bottom edges, and a
// feature whose latitude range is entirely above the top or below the bottom is off-screen. Longitude
// is left unrestricted: the pseudocylindrical inverse curves too sharply toward the poles to bound
// longitude cheaply and conservatively. Bail to draw-all when an edge is off the map (world-fit, or a
// pole in view).
function makeEqualAreaCull(ctx: RenderContext, padding: number): Cull | null {
  const proj = ctx.projector.projection
  if (!proj?.invert) return null
  const invert = proj.invert
  const { width, height } = ctx
  // Scan x across a row for an on-map sample; latitude is constant along a screen-y line, so the first
  // valid invert gives that row's latitude. d3's inverse clamps rather than failing for rows past a
  // pole, so a latitude counts only if it projects back onto the row.
  const latAtY = (y: number): number | null => {
    for (let i = 0; i <= 20; i++) {
      const ll = invert([(i / 20) * width, y])
      if (!ll || !Number.isFinite(ll[1])) continue
      const back = proj(ll)
      return back && Math.abs(back[1] - y) <= 1 ? ll[1] : null
    }
    return null
  }
  const north = latAtY(-padding)
  const south = latAtY(height + padding)
  if (north == null || south == null) return null
  const S = south - SLACK_DEG
  const N = north + SLACK_DEG
  return (f) => {
    const box = boundsOf(f).box
    return box != null && (box[3] < S || box[1] > N) // latitude band entirely below or above the viewport
  }
}

// Flat views: cull by a lon/lat window inverted from the viewport (widened by the padding). The
// cylindrical case (equirectangular) has an exactly linear inverse, so the window from the corners is
// exact. The equal-area view (Equal Earth) is pseudocylindrical and culls by latitude band only (see
// makeEqualAreaCull). Bail to draw-all on a point that fails to invert, or an antimeridian wrap.
function makeFlatCull(ctx: RenderContext, padding: number): Cull | null {
  const proj = ctx.projector.projection
  if (!proj?.invert) return null
  if (ctx.view.equalArea) return makeEqualAreaCull(ctx, padding)
  const x0 = -padding
  const y0 = -padding
  const x1 = ctx.width + padding
  const y1 = ctx.height + padding
  const xm = ctx.width / 2
  const ym = ctx.height / 2
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  // Corners give the exact window for a linear inverse; the edge midpoints and centre are added so a
  // window straddling the antimeridian (its corners alias to a <180 span) still shows up as span > 180.
  for (const [x, y] of [
    [x0, y0], [x1, y0], [x0, y1], [x1, y1],
    [xm, y0], [xm, y1], [x0, ym], [x1, ym], [xm, ym],
  ] as Array<[number, number]>) {
    const ll = proj.invert([x, y])
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null
    minLon = Math.min(minLon, ll[0])
    maxLon = Math.max(maxLon, ll[0])
    minLat = Math.min(minLat, ll[1])
    maxLat = Math.max(maxLat, ll[1])
  }
  if (maxLon - minLon > 180) return null // antimeridian wrap or a wide (~world) view
  // The same span measured continuously along the middle row: a frame wider than half the world (a
  // small map, or padding wide against it) wraps past ±180 and would otherwise alias to a narrow window.
  let span = 0
  for (let i = 1, prev = proj.invert([x0, ym]); i <= 16; i++) {
    const ll = proj.invert([x0 + ((x1 - x0) * i) / 16, ym])
    if (!ll || !prev || !Number.isFinite(ll[0]) || !Number.isFinite(prev[0])) return null
    span += Math.abs(((ll[0] - prev[0] + 540) % 360) - 180)
    prev = ll
  }
  if (span > 180) return null
  const W = minLon - SLACK_DEG
  const E = maxLon + SLACK_DEG
  const S = minLat - SLACK_DEG
  const N = maxLat + SLACK_DEG
  return (f) => {
    const box = boundsOf(f).box
    if (!box || box[0] > box[2]) return false // unbounded, or crosses the antimeridian: keep
    return box[2] < W || box[0] > E || box[3] < S || box[1] > N // no overlap with the window
  }
}

/**
 * The layer as it should be drawn this frame: features wholly outside the viewport widened by
 * `padding` px are dropped. `padding` null draws the layer whole (its drawing moves geometry).
 */
export function visibleLayer(layer: ResolvedLayer, ctx: RenderContext, padding: number | null): ResolvedLayer {
  if (padding == null) return layer
  const outside = ctx.view.rotatable ? makeGlobeCull(ctx, padding) : makeFlatCull(ctx, padding)
  if (!outside) return layer
  const features = layer.features.features.filter((f) => !outside(f))
  return features.length === layer.features.features.length ? layer : { ...layer, features: { ...layer.features, features } }
}

// Exact back-hemisphere test for a MARK POSITION (a point coordinate or a region centroid). d3's
// projection() folds both hemispheres onto the disc and does NOT return null for far-side points the
// way geoPath clips paths, so point-like primitives need this explicit horizon test to hide marks on a
// globe's hidden hemisphere. It is exact at the clip angle, unlike the viewport cull, which pads.
// Returns null for the flat views; on the polar view (clip 179.999) it hides only marks at the
// antipode.
export function farSideTest(ctx: RenderContext): ((lonlat: [number, number]) => boolean) | null {
  const hz = ctx.projector.projection && horizon(ctx.projector.projection)
  if (!hz) return null
  return (lonlat) => geoDistance(hz.center, lonlat) > hz.clip
}
