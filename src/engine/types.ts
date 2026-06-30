// Engine type contracts. This module defines the two axes (View x Layer), the
// projector abstraction shared by all views, and the resolved-layer shape the app
// hands to the renderer. The engine never fetches a topic dataset itself - the app
// resolves data and passes it in - which keeps `engine/` publishable and dataset-free.

import type { GeoPath, GeoProjection } from 'd3-geo'
import type { Selection } from 'd3-selection'
import type { FeatureCollection } from 'geojson'

/** The four layer rendering primitives. Topic content is data over these, not new code. */
export type Primitive = 'base' | 'region' | 'point' | 'flow'

export type ViewKind = 'projection' | 'cartogram'

export type CartogramKind = 'noncontiguous'

export type ViewId =
  | 'equirectangular'
  | 'azimuthal-equidistant'
  | 'orthographic'
  | 'cartogram-noncontiguous'

/**
 * A Projector turns a lon/lat into screen coordinates (or `null` when the point is
 * clipped, e.g. the back of an orthographic globe), and carries the d3 `path`
 * generator for area/line features plus the raw projection (for graticules and
 * drag-to-rotate).
 */
export interface Projector {
  project(coord: [number, number]): [number, number] | null
  readonly path: GeoPath | null
  readonly projection: GeoProjection | null
}

export interface View {
  readonly id: ViewId
  readonly label: string
  readonly kind: ViewKind
  /** Set for `kind: 'cartogram'` - tells the `region` primitive how to lay out areas. */
  readonly cartogramKind?: CartogramKind
  /** Globe-like views: drag rotates the projection center (re-centers), wheel zooms. */
  readonly rotatable?: boolean
  /** Draw a marker at the projection center (helps read azimuthal / polar maps). */
  readonly showCenter?: boolean
  build(width: number, height: number): Projector
}

/** Per-layer visual options. Kept small and serializable. */
export interface LayerStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  /** region: choropleth color ramp name (d3-scale-chromatic interpolator key). */
  ramp?: string
  /** point: marker radius range [min, max] in px, mapped from value. */
  radiusRange?: [number, number]
  /** flow: arc color. */
  arcColor?: string
  /** flow/point: drop features whose value is below this threshold (density knob). */
  minValue?: number
}

/**
 * A layer with its geometry + values already resolved by the app. `features` holds
 * GeoJSON appropriate to the primitive (areas for base/region, points for point,
 * LineStrings for flow). `values` maps a feature id to a numeric value for
 * choropleth / sizing / weighting; `valueDomain` is the precomputed [min,max].
 */
export interface ResolvedLayer {
  readonly id: string
  readonly primitive: Primitive
  readonly features: FeatureCollection
  readonly style: LayerStyle
  readonly values?: Map<string | number, number>
  readonly valueDomain?: [number, number]
}

/** Context handed to every primitive renderer for the active view + size. */
export interface RenderContext {
  readonly view: View
  readonly projector: Projector
  readonly width: number
  readonly height: number
}

/** SVG group selection type alias used by the d3-svg primitive renderers. */
export type SvgGroup = Selection<SVGGElement, unknown, null, undefined>

/**
 * A primitive renderer draws one of the four primitives into an SVG group for the
 * active view. Layers stay backend-agnostic GeoJSON; the renderer projects them.
 */
export interface PrimitiveRenderer {
  drawSVG(group: SvgGroup, layer: ResolvedLayer, ctx: RenderContext): void
}

export interface MapOptions {
  view: ViewId
  layers: ResolvedLayer[]
}

export interface MapHandle {
  setView(view: ViewId): void
  setLayers(layers: ResolvedLayer[]): void
  destroy(): void
}
