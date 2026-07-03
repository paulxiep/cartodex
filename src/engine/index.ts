// Cartodex engine - public API. This barrel is the package boundary: the app (and any
// future external consumer) imports only from here. The engine holds no datasets and
// no page chrome, so it can be published and reused as-is.

export { createMap } from './render'
export { VIEWS, VIEW_LIST, getView } from './views'
export { PRIMITIVES, getPrimitive } from './primitives'
export { CHANNELS, CHANNEL_LIST, getChannel } from './channels'
export { compatible } from './compatible'

// Geometry + geo helpers (generic, not topic datasets) for the app's data layer.
export { loadCountries, loadBorders, loadLand } from './lib/geodata'
export { flowFeature, greatCirclePoints } from './lib/greatCircle'
export { makeColorScale, radiusScale, valueOf, interpolatorByName } from './lib/scales'
export type { ColorFn } from './lib/scales'

export type {
  Primitive,
  ChannelId,
  ChannelCapacity,
  Channel,
  DatasetKind,
  ScaleType,
  ScaleSpec,
  ViewKind,
  ViewId,
  View,
  Projector,
  LayerStyle,
  ResolvedLayer,
  RenderContext,
  PrimitiveRenderer,
  MapOptions,
  MapHandle,
} from './types'
