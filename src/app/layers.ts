// Binding resolver: turn the composer's channel bindings into the engine's ResolvedLayers.
// A binding is a dataset placed in a channel (with an optional scale override); this module
// loads the data and shapes each binding for its primitive. Two subtleties:
//   - a choropleth binding and an area binding on region geometry MERGE into ONE region
//     layer (fill + cartogram transform on the same path set) so a colored cartogram works;
//   - a binding whose snapshot is unreachable is dropped (its key returned in `failed`) so
//     the rest of the map still renders and the composer can flag it.
// Draw order is fixed by channel: base, region, arcs, bubbles, markers (markers on top).

import { loadCountries, getChannel } from '../engine'
import type { ChannelId, ResolvedLayer, ScaleSpec, ScaleType } from '../engine'
import { DATASETS, LANE_TAXONOMY, PORT_TAXONOMY } from './catalog'
import type { Dataset } from './catalog'
import { markerStyleFor, PLATE_STYLE, SEA_BLUE, CABLE_AMBER, WINDS_COLOR, CURRENTS_COLOR } from './layer-styles'
import { topmostSelected } from './taxonomy'
import type { Taxonomy } from './taxonomy'
import { baseGeometryUrl, loadRegionValues, loadPointsMerged, loadPairData, loadLinesData, loadLinesMerged, loadSurfaceData } from './data-loaders'
import type { Tier } from './data-loaders'

export interface Binding {
  channel: ChannelId
  dataset: string
  scale?: ScaleType
}

/** A colour-channel legend source: the dataset label plus the resolved layer's values + scale,
 *  handed to the legend which resolves them through the same engine scale the renderer uses. */
export interface LegendEntry {
  label: string
  values: Iterable<number>
  scale: ScaleSpec
}

// Flight-route density knob: keep only routes flown by at least this many airlines.
export const FLIGHT_MIN_COUNT = 2

const BASE_ATTRIBUTION = 'Basemap: Natural Earth (public domain)'

/** Stable key for a binding, used to flag an unavailable dataset back to the composer. */
export function bindingKey(b: Binding): string {
  return b.channel === 'base' ? 'base' : `${b.channel}:${b.dataset}`
}

function scaleSpecFor(ds: Dataset, channel: ChannelId, override?: ScaleType): ScaleSpec {
  const type = override ?? ds.defaultScale ?? getChannel(channel).defaultScaleType
  // A dataset may pin explicit threshold breaks (hypsometric levels) and a diverging ramp
  // (sea/land relief); both flow into the scale so bands align to levels and colour to sea level.
  return { type, ramp: ds.defaultRamp, thresholds: ds.defaultThresholds, diverging: ds.defaultDiverging }
}

// `bordersOnly` drops the land fill so a background surface (relief/bathymetry) shows through
// with country outlines drawn on top of it; the darker stroke reads over bright hypsometric
// colour. Normal maps keep the opaque land fill over the sphere.
async function resolveBase(tier: Tier, bordersOnly = false): Promise<ResolvedLayer> {
  const features = await loadCountries(baseGeometryUrl(tier))
  return {
    id: 'base',
    primitive: 'base',
    // Land clearly lighter than water (sphere #0d1826), borders legible as a bright hairline.
    features,
    style: bordersOnly
      ? { fill: 'none', stroke: 'rgba(15,22,32,0.6)', strokeWidth: 0.5 }
      : { fill: '#2b3644', stroke: 'rgba(165,185,210,0.5)', strokeWidth: 0.5 },
  }
}

// Surface: a baked scalar field (elevation/bathymetry relief, heatmap) drawn as value-filled
// contour bands. Single-occupancy background - drawn backmost so overlays (quakes, currents)
// read above it. Colour comes from the dataset's scale (threshold + diverging sea/land ramp).
async function resolveSurface(b: Binding, month: number | undefined, fine: boolean): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const d = await loadSurfaceData(ds, month, fine)
  return {
    id: `surface-${ds.id}`,
    primitive: 'surface',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    scale: scaleSpecFor(ds, 'surface', b.scale),
    style: { opacity: 1 },
  }
}

// Merge the (single) choropleth binding (colour) and the (single) area binding (cartogram)
// on region geometry into one region layer, so both encode the same path set.
async function resolveRegion(choro: Binding | undefined, area: Binding | undefined, tier: Tier): Promise<ResolvedLayer | null> {
  if (!choro && !area) return null
  const features = await loadCountries(baseGeometryUrl(tier))
  const layer: {
    values?: ResolvedLayer['values']
    scale?: ScaleSpec
    valueDomain?: [number, number]
    area?: ResolvedLayer['area']
  } = {}
  if (choro) {
    const ds = DATASETS[choro.dataset]!
    const rv = await loadRegionValues(ds)
    layer.values = rv.values
    layer.valueDomain = rv.domain
    layer.scale = scaleSpecFor(ds, 'choropleth', choro.scale)
  }
  if (area) {
    const ds = DATASETS[area.dataset]!
    const rv = await loadRegionValues(ds)
    layer.area = { values: rv.values, domain: rv.domain }
  }
  return {
    id: `region-${choro?.dataset ?? 'x'}-${area?.dataset ?? 'x'}`,
    primitive: 'region',
    features,
    style: { stroke: 'rgba(0,0,0,0.25)', strokeWidth: 0.4 },
    ...layer,
  }
}

async function resolveBubble(b: Binding, tier: Tier): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const [features, rv] = await Promise.all([loadCountries(baseGeometryUrl(tier)), loadRegionValues(ds)])
  return {
    id: `bubble-${ds.id}`,
    primitive: 'region-symbol',
    features,
    values: rv.values,
    valueDomain: rv.domain,
    style: { fill: 'rgba(255,140,60,0.55)', stroke: 'rgba(20,10,0,0.6)', radiusRange: [2, 26] },
  }
}

// Marker datasets that share one snapshot (seaports by type) merge into ONE layer sized by the
// summed union of selected fields - markers placed once, never stacked duplicates. Grouped by
// snapshot upstream, so airports and seaports stay distinct (and keep their per-dataset glyph).
// Shape + colour + outline come from the central marker palette (layer-styles.ts).
async function resolveMarkers(bindings: Binding[]): Promise<ResolvedLayer | null> {
  const datasets = topmostDatasets(bindings, PORT_TAXONOMY)
  if (!datasets.length) return null
  const d = await loadPointsMerged(datasets)
  const ms = markerStyleFor(datasets[0]!)
  return {
    id: `marker-${snapshotKey(datasets[0]!)}`,
    primitive: 'point',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    style: { fill: ms.fill, shape: ms.shape, stroke: ms.stroke, strokeWidth: ms.strokeWidth, radiusRange: [1.5, 7] },
  }
}

/** Key that groups marker datasets drawn from the same snapshot. */
function snapshotKey(ds: Dataset): string {
  return ds.source.mode === 'baked' ? ds.source.snapshot : ds.id
}

async function resolveArc(b: Binding): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const d = await loadPairData(ds)
  return {
    id: `arc-${ds.id}`,
    primitive: 'flow',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    style: { arcColor: 'rgba(255,180,120,0.55)', strokeWidth: 0.5, opacity: 0.5, minValue: FLIGHT_MIN_COUNT },
  }
}

// Shipping lanes: the real lane network. Unweighted, it is a subtle background context; a
// traffic-weighted variant (cargo, passenger, ...) renders each lane's width by real AIS traffic
// via the field primitive. All lane layers share one sea-blue tone (the hierarchy in the composer,
// not colour, distinguishes them), so overlapping selections merge instead of clashing.
// The datasets that actually drive a merged layer: the TOP-MOST selected nodes in the taxonomy.
// A selected parent subsumes its children (Seaports total wins over its cargo subtypes; All
// traffic over its classes), so volume is counted once at the level the user picked.
function topmostDatasets(bindings: Binding[], tax: Taxonomy): Dataset[] {
  const top = new Set(topmostSelected(tax, bindings.map((b) => b.dataset)))
  return bindings.filter((b) => top.has(b.dataset)).map((b) => DATASETS[b.dataset]).filter((d): d is Dataset => !!d)
}

// One lane layer per SNAPSHOT: datasets that share a snapshot (shipping by ship type) merge into one
// geometry (summed over the union of the top-most selected leaf fields, drawn once); different
// snapshots (shipping vs cables vs rivers) are distinct networks resolved separately. Grouped by
// snapshot upstream in buildLayers, so each network is drawn from its own file and keeps its tone.
async function resolveLanes(bindings: Binding[], fine: boolean): Promise<ResolvedLayer | null> {
  const datasets = topmostDatasets(bindings, LANE_TAXONOMY)
  if (!datasets.length) return null
  const d = await loadLinesMerged(datasets, fine)
  const first = datasets[0]!
  // Plate boundaries are a hazard context network, not a sea lane: a bright core over a dark casing
  // (layer-styles.ts) so they read over dark sea, bright bathymetry, and warm SST alike.
  if (first.id === 'plate-boundaries') {
    return {
      id: `lane-${snapshotKey(first)}`,
      primitive: 'field',
      features: d.features,
      values: d.values,
      valueDomain: d.domain,
      style: {
        stroke: PLATE_STYLE.core,
        casing: PLATE_STYLE.casing,
        widthRange: [PLATE_STYLE.width, PLATE_STYLE.width],
        opacity: PLATE_STYLE.opacity,
      },
    }
  }
  const weighted = d.values.size > 0
  const cable = first.id === 'cables'
  const stroke = cable
    ? weighted ? CABLE_AMBER : 'rgba(240,175,90,0.6)'
    : weighted ? SEA_BLUE : 'rgba(120,150,190,0.32)'
  return {
    id: `lane-${snapshotKey(first)}`,
    primitive: 'field',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    style: {
      stroke,
      widthRange: weighted ? [0.4, 3] : [0.5, 0.5],
      opacity: weighted ? 0.75 : 0.5,
    },
  }
}

// Field: baked streamlines (winds, currents), width by per-feature magnitude, coloured by the
// dataset's identity ramp so multiple fields stay distinguishable.
async function resolveField(b: Binding, month: number | undefined, fine: boolean): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const d = await loadLinesData(ds, month, fine)
  const color = ds.id === 'currents' ? CURRENTS_COLOR : WINDS_COLOR
  return {
    id: `field-${ds.id}`,
    primitive: 'field',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    style: { stroke: color, widthRange: [0.3, 2.4], opacity: 0.8, arrowhead: true },
  }
}

interface Task {
  keys: string[] // binding keys this task covers (all flagged if it fails)
  run: () => Promise<ResolvedLayer | null>
}

/**
 * Resolve bindings into engine ResolvedLayers (in fixed draw order). Each task loads
 * independently; a task whose dataset is unreachable is dropped and its binding keys are
 * returned in `failed`, so the rest of the map still renders.
 */
export async function buildLayers(
  bindings: Binding[],
  month?: number,
  tier: Tier = '110m',
): Promise<{ layers: ResolvedLayer[]; failed: Set<string>; legends: LegendEntry[] }> {
  const choro = bindings.find((b) => b.channel === 'choropleth')
  const area = bindings.find((b) => b.channel === 'area')
  const surface = bindings.find((b) => b.channel === 'surface')

  // Heavy line/surface layers use their finer geometry tier once the user has zoomed past the coarse
  // default (any non-110m base tier); the loaders fall back to coarse if a `-fine` file is absent.
  const fine = tier !== '110m'

  // Draw order (back to front): surface (relief background), base, lanes, region, field, arcs,
  // bubbles, markers. A surface fills the whole map, so it sits behind everything - and base
  // becomes borders-only over it, so country outlines read on top of the relief.
  const tasks: Task[] = []
  if (surface) tasks.push({ keys: [bindingKey(surface)], run: () => resolveSurface(surface, month, fine) })
  if (bindings.some((b) => b.channel === 'base')) {
    // A land-covering relief (elevation) shows through, so the base drops its land fill; an
    // ocean-only surface (SST) leaves land alone. Non-surface maps keep the opaque land fill.
    const bordersOnly = surface != null && !!DATASETS[surface.dataset]?.coversLand
    tasks.push({ keys: ['base'], run: () => resolveBase(tier, bordersOnly) })
  }
  // Lane bindings that share a snapshot (shipping by ship type) merge into one layer; different
  // snapshots (shipping vs cables vs rivers) stay separate networks, each drawn from its own file.
  const laneGroups = new Map<string, Binding[]>()
  for (const b of bindings.filter((b) => b.channel === 'lane')) {
    const ds = DATASETS[b.dataset]
    if (!ds) continue
    const key = snapshotKey(ds)
    ;(laneGroups.get(key) ?? laneGroups.set(key, []).get(key)!).push(b)
  }
  for (const group of laneGroups.values()) tasks.push({ keys: group.map(bindingKey), run: () => resolveLanes(group, fine) })
  if (choro || area) {
    const keys = [choro, area].filter((b): b is Binding => b != null).map(bindingKey)
    tasks.push({ keys, run: () => resolveRegion(choro, area, tier) })
  }
  for (const b of bindings.filter((b) => b.channel === 'field')) tasks.push({ keys: [bindingKey(b)], run: () => resolveField(b, month, fine) })
  for (const b of bindings.filter((b) => b.channel === 'arc')) tasks.push({ keys: [bindingKey(b)], run: () => resolveArc(b) })
  for (const b of bindings.filter((b) => b.channel === 'bubble')) tasks.push({ keys: [bindingKey(b)], run: () => resolveBubble(b, tier) })
  // Marker bindings that share a snapshot (seaports by type) merge into one layer; different
  // snapshots (airports vs seaports) stay separate.
  const markerGroups = new Map<string, Binding[]>()
  for (const b of bindings.filter((b) => b.channel === 'marker')) {
    const ds = DATASETS[b.dataset]
    if (!ds) continue
    const key = snapshotKey(ds)
    ;(markerGroups.get(key) ?? markerGroups.set(key, []).get(key)!).push(b)
  }
  for (const group of markerGroups.values()) tasks.push({ keys: group.map(bindingKey), run: () => resolveMarkers(group) })

  const settled = await Promise.allSettled(tasks.map((t) => t.run()))
  const layers: ResolvedLayer[] = []
  const failed = new Set<string>()
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) layers.push(r.value)
    else {
      for (const k of tasks[i]!.keys) failed.add(k)
      if (r.status === 'rejected') {
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
        console.warn(`binding ${tasks[i]!.keys.join(',')} unavailable: ${reason}`)
      }
    }
  })

  // Legend sources: the colour-encoding layers that actually resolved (surface, region choropleth).
  // Both channels are single-occupancy, so each matches at most one built layer by its primitive;
  // the label comes from the bound dataset, the values/scale from the layer the renderer draws.
  const legends: LegendEntry[] = []
  const colorLayer = (primitive: ResolvedLayer['primitive']): ResolvedLayer | undefined =>
    layers.find((l) => l.primitive === primitive && l.scale != null && l.values != null)
  const surfaceLayer = surface && colorLayer('surface')
  if (surface && surfaceLayer) {
    legends.push({ label: DATASETS[surface.dataset]!.label, values: surfaceLayer.values!.values(), scale: surfaceLayer.scale! })
  }
  const regionLayer = choro && colorLayer('region')
  if (choro && regionLayer) {
    legends.push({ label: DATASETS[choro.dataset]!.label, values: regionLayer.values!.values(), scale: regionLayer.scale! })
  }

  return { layers, failed, legends }
}

/** Attribution strings for the datasets actually drawn (base included). For a taxonomy channel
 *  only the top-most selected node renders, so a cascaded subtree credits its source once. */
export function attributionsFor(bindings: Binding[]): string[] {
  const laneTop = new Set(topmostSelected(LANE_TAXONOMY, bindings.filter((b) => b.channel === 'lane').map((b) => b.dataset)))
  const markerTop = new Set(topmostSelected(PORT_TAXONOMY, bindings.filter((b) => b.channel === 'marker').map((b) => b.dataset)))
  const out = new Set<string>()
  for (const b of bindings) {
    if (b.channel === 'base') {
      out.add(BASE_ATTRIBUTION)
      continue
    }
    if (b.channel === 'lane' && !laneTop.has(b.dataset)) continue
    if (b.channel === 'marker' && !markerTop.has(b.dataset)) continue
    const ds = DATASETS[b.dataset]
    if (ds) out.add(ds.attribution)
  }
  return [...out]
}
