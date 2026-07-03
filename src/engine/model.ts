// Dependency-free core vocabulary: the enums and small interfaces that describe the map
// model (primitives, channels, dataset kinds, scales) with NO imports - not d3, not geojson,
// not DOM. This lets pure consumers (the app catalog, the Node data producer) share the
// exact same types without dragging the DOM-dependent engine (render/primitives) into a
// non-DOM TypeScript program. types.ts re-exports these alongside the DOM/d3-bound types.

/**
 * The rendering primitives - the low-level draw routines. A channel names a primitive;
 * topic content is data over these, not new code. `region-symbol` draws centroid bubbles;
 * `field` (gridded vector streamlines) is reserved for M3.
 */
export type Primitive = 'base' | 'region' | 'region-symbol' | 'point' | 'flow'

/**
 * A display-mode channel: how a dataset's values map to a visual channel. Channels carry a
 * capacity (see `ChannelCapacity`) and target one primitive. This is the public display
 * axis; `Primitive` is the renderer it dispatches to.
 */
export type ChannelId = 'base' | 'choropleth' | 'area' | 'bubble' | 'marker' | 'arc'

/**
 * Channel capacity - how many datasets a channel can legibly hold at once.
 *   single      - one dataset (a second selection replaces the first): choropleth/area/bubble.
 *   multi       - many datasets, distinguished by style: marker/arc.
 *   structural  - not a data binding (the base geometry).
 */
export type ChannelCapacity = 'single' | 'multi' | 'structural'

/** The dataset kinds a channel can bind. `grid` (vector fields) is reserved for M3. */
export type DatasetKind = 'region' | 'point' | 'pair' | 'grid'

/** How a value column maps to a color/size channel. `sqrt` is the size default. */
export type ScaleType = 'linear' | 'log' | 'quantile' | 'threshold' | 'sqrt'

export interface ScaleSpec {
  type: ScaleType
  /** color ramp (d3-scale-chromatic interpolator key); ignored by `sqrt`. */
  ramp?: string
  /** explicit breakpoints for `threshold`; if unset, quantile-derived. */
  thresholds?: number[]
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
