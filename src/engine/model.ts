// Dependency-free core vocabulary: the enums and small interfaces that describe the map
// model (primitives, channels, dataset kinds, scales) with NO imports - not d3, not geojson,
// not DOM. This lets pure consumers (the app catalog, the Node data producer) share the
// exact same types without dragging the DOM-dependent engine (render/primitives) into a
// non-DOM TypeScript program. types.ts re-exports these alongside the DOM/d3-bound types.

/**
 * The rendering primitives - the low-level draw routines. A channel names a primitive;
 * topic content is data over these, not new code. `region-symbol` draws centroid bubbles;
 * `field` draws gridded vector streamlines (winds, ocean currents); `surface` fills baked
 * scalar contour bands by value (elevation/bathymetry relief, heatmaps).
 */
export type Primitive = 'base' | 'region' | 'region-symbol' | 'point' | 'flow' | 'field' | 'surface'

/**
 * A display-mode channel: how a dataset's values map to a visual channel. Channels carry a
 * capacity (see `ChannelCapacity`) and target one primitive. This is the public display
 * axis; `Primitive` is the renderer it dispatches to.
 */
export type ChannelId = 'base' | 'choropleth' | 'area' | 'bubble' | 'marker' | 'arc' | 'field' | 'lane' | 'surface'

/**
 * Channel capacity - how many datasets a channel can legibly hold at once.
 *   single      - one dataset (a second selection replaces the first): choropleth/area/bubble.
 *   multi       - many datasets, distinguished by style: marker/arc.
 *   structural  - not a data binding (the base geometry).
 */
export type ChannelCapacity = 'single' | 'multi' | 'structural'

/**
 * The dataset kinds a channel can bind.
 *   region - values keyed by numeric ISO code.
 *   point  - lon/lat markers.
 *   pair   - flow endpoints (two point ids).
 *   grid    - a gridded vector field (winds, currents), baked to streamline LineStrings.
 *   lines   - a baked LineString network (shipping lanes), drawn as context geometry.
 *   surface - a baked scalar field (elevation, SST), contoured to value-carrying polygon bands.
 */
export type DatasetKind = 'region' | 'point' | 'pair' | 'grid' | 'lines' | 'surface'

/** How a value column maps to a color/size channel. `sqrt` is the size default. */
export type ScaleType = 'linear' | 'log' | 'quantile' | 'threshold' | 'sqrt'

/**
 * A colour ramp reference: either a d3-scale-chromatic scheme name (e.g. "YlGnBu") or an
 * explicit list of CSS colour stops interpolated in order. Lets a dataset supply a stock
 * scheme or a custom palette without the engine hard-coding either.
 */
export type RampRef = string | string[]

/**
 * A diverging colour descriptor: below and above a `pivot` value each get their own ramp. Modular
 * per side (sea vs land for hypsometric relief); each side is a stock scheme or a custom stop-list.
 * Applied by the `threshold` scale (bands), which knows which buckets fall on each side of the pivot,
 * so the seam is insensitive to asymmetric extents. The seam lands exactly on the pivot only when the
 * pivot is one of the threshold breakpoints (as it is for elevation: 0 ∈ HYPSOMETRIC_LEVELS);
 * otherwise it falls on the nearest breakpoint.
 */
export interface DivergingRamp {
  /** value the two ramps meet at (sea level for elevation). Default 0. */
  pivot?: number
  below: RampRef
  above: RampRef
}

export interface ScaleSpec {
  type: ScaleType
  /** color ramp: a d3-scale-chromatic scheme name or an explicit CSS stop-list; ignored by `sqrt`. */
  ramp?: RampRef
  /** explicit breakpoints for `threshold`; if unset, quantile-derived. */
  thresholds?: number[]
  /** diverging colour (threshold only): per-side ramps meeting at a pivot. Overrides `ramp`. */
  diverging?: DivergingRamp
}

/**
 * A channel definition. `encodes` names the visual variable the dataset values drive;
 * `defaultScaleType` is the scale used when neither the dataset nor the binding specifies
 * one (size channels are intrinsically sqrt, so they pin it here).
 */
export interface Channel {
  readonly id: ChannelId
  readonly label: string
  readonly primitive: Primitive
  readonly capacity: ChannelCapacity
  readonly encodes: 'color' | 'size' | 'width' | 'none'
  readonly datasetKind?: DatasetKind
  readonly defaultScaleType: ScaleType
  /** When set, the channel is only meaningful on views with a matching flag (e.g. `area`
   *  needs an equal-area base). Checked by `compatible(view, channel)`. */
  readonly requiresEqualArea?: boolean
}
