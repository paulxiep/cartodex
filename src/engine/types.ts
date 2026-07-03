// Engine type contracts. Cartodex models a map on two axes: a View (spatial layout) and
// a set of channel bindings (a dataset drawn through a display mode with a scale). This
// module defines the View/Projector abstraction, the display Channels and their capacity,
// the value→visual Scale spec, and the resolved-layer shape the app hands the renderer.
// The engine never fetches a topic dataset itself - the app resolves data and passes it
// in - which keeps `engine/` publishable and dataset-free.

import type { GeoPath, GeoProjection } from 'd3-geo'
import type { Selection } from 'd3-selection'
import type { FeatureCollection } from 'geojson'
import type { Primitive, ScaleSpec } from './model'

// The dependency-free core vocabulary lives in model.ts (so pure consumers - the app catalog
// and the Node producer - share it without pulling the DOM-bound engine in). Re-exported here
// so the barrel and app import surface is unchanged.
export type {
  Primitive,
  ChannelId,
  ChannelCapacity,
  Channel,
  DatasetKind,
  ScaleType,
  ScaleSpec,
} from './model'

export type ViewKind = 'projection'

export type ViewId =
  | 'equirectangular'
  | 'equal-earth'
  | 'azimuthal-equidistant'
  | 'orthographic'

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
  /** Equal-area base: required for the `area` channel (density-equalization assumes true
   *  areas). Only `equal-earth` sets this today. */
  readonly equalArea?: boolean
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
  /** point/bubble: marker radius range [min, max] in px, mapped from value via sqrt. */
  radiusRange?: [number, number]
  /** field: streamline stroke-width range [min, max] in px, mapped from magnitude via sqrt. */
  widthRange?: [number, number]
  /** field: draw a downstream arrowhead at each line's end (flow direction; streamlines only). */
  arrowhead?: boolean
  /** flow: arc color. */
  arcColor?: string
  /** flow/point: drop features whose value is below this threshold (density knob). */
  minValue?: number
}

/**
 * A layer with its geometry + values already resolved by the app. `features` holds
 * GeoJSON appropriate to the primitive (areas for base/region, points for point/bubble,
 * LineStrings for flow and field). `values` maps a feature id to the value that drives the
 * layer's primary channel (color for region/choropleth, size for point/bubble, width for
 * flow, streamline width/magnitude for field);
 * `scale` says how. A region layer may also carry an `area` binding (a second dataset that
 * scales each region around its centroid) so a colored cartogram composes fill + area on
 * one path set.
 */
export interface ResolvedLayer {
  readonly id: string
  readonly primitive: Primitive
  readonly features: FeatureCollection
  readonly style: LayerStyle
  readonly values?: Map<string | number, number>
  /** how `values` map to the visual channel (color scales need it; sqrt sizing uses `valueDomain`). */
  readonly scale?: ScaleSpec
  /** precomputed [min,max] of `values`, for sqrt sizing (point/bubble). */
  readonly valueDomain?: [number, number]
  /** region only: optional area (sqrt-scaled) transform driven by a second dataset. */
  readonly area?: { values: Map<string | number, number>; domain: [number, number] }
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
 * A primitive renderer draws one of the primitives into an SVG group for the active view.
 * Layers stay backend-agnostic GeoJSON; the renderer projects them.
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
