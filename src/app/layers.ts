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
import { topmostSelected } from './taxonomy'
import type { Taxonomy } from './taxonomy'
import { loadRegionValues, loadPointsMerged, loadPairData, loadLinesData, loadLinesMerged, loadSurfaceData } from './data-loaders'

export interface Binding {
  channel: ChannelId
  dataset: string
  scale?: ScaleType
}

// Flight-route density knob: keep only routes flown by at least this many airlines.
export const FLIGHT_MIN_COUNT = 2

const BASE_ATTRIBUTION = 'Basemap: Natural Earth via world-atlas (public domain)'

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
async function resolveBase(bordersOnly = false): Promise<ResolvedLayer> {
  const features = await loadCountries()
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
async function resolveSurface(b: Binding, month?: number): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const d = await loadSurfaceData(ds, month)
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
async function resolveRegion(choro?: Binding, area?: Binding): Promise<ResolvedLayer | null> {
  if (!choro && !area) return null
  const features = await loadCountries()
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

async function resolveBubble(b: Binding): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const [features, rv] = await Promise.all([loadCountries(), loadRegionValues(ds)])
  return {
    id: `bubble-${ds.id}`,
    primitive: 'region-symbol',
    features,
    values: rv.values,
    valueDomain: rv.domain,
    style: { fill: 'rgba(255,140,60,0.55)', stroke: 'rgba(20,10,0,0.6)', radiusRange: [2, 26] },
  }
}

// Colour by domain: air (airports/flights) stays yellow, sea (seaports/lanes) is one blue tone
// so the two systems never blur together and any sea sub-layers merge cleanly.
const AIR_YELLOW = '#ffcc44'
const SEA_BLUE = 'rgba(96,168,235,0.85)'

// Marker datasets that share one snapshot (seaports by type) merge into ONE layer sized by the
// summed union of selected fields - markers placed once, never stacked duplicates. Grouped by
// snapshot upstream, so airports and seaports stay distinct (and keep their air/sea colour).
async function resolveMarkers(bindings: Binding[]): Promise<ResolvedLayer | null> {
  const datasets = topmostDatasets(bindings, PORT_TAXONOMY)
  if (!datasets.length) return null
  const d = await loadPointsMerged(datasets)
  const sea = datasets[0]!.domain === 'maritime'
  return {
    id: `marker-${snapshotKey(datasets[0]!)}`,
    primitive: 'point',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    style: { fill: sea ? SEA_BLUE : AIR_YELLOW, radiusRange: [1.5, 7] },
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

// Submarine cables take a contrasting signal-amber so they read against the sea-blue shipping/river
// water networks when overlaid (the "two undersea networks" preset); mirrors how the field resolver
// tones winds vs currents.
const CABLE_AMBER = 'rgba(240,175,90,0.85)'

// One lane layer per SNAPSHOT: datasets that share a snapshot (shipping by ship type) merge into one
// geometry (summed over the union of the top-most selected leaf fields, drawn once); different
// snapshots (shipping vs cables vs rivers) are distinct networks resolved separately. Grouped by
// snapshot upstream in buildLayers, so each network is drawn from its own file and keeps its tone.
async function resolveLanes(bindings: Binding[]): Promise<ResolvedLayer | null> {
  const datasets = topmostDatasets(bindings, LANE_TAXONOMY)
  if (!datasets.length) return null
  const d = await loadLinesMerged(datasets)
  const weighted = d.values.size > 0
  const cable = datasets[0]!.id === 'cables'
  const stroke = cable
    ? weighted ? CABLE_AMBER : 'rgba(240,175,90,0.6)'
    : weighted ? SEA_BLUE : 'rgba(120,150,190,0.32)'
  return {
    id: `lane-${snapshotKey(datasets[0]!)}`,
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
async function resolveField(b: Binding, month?: number): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const d = await loadLinesData(ds, month)
  const color = ds.id === 'currents' ? 'rgba(90,200,190,0.75)' : 'rgba(240,150,90,0.8)'
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
): Promise<{ layers: ResolvedLayer[]; failed: Set<string> }> {
  const choro = bindings.find((b) => b.channel === 'choropleth')
  const area = bindings.find((b) => b.channel === 'area')
  const surface = bindings.find((b) => b.channel === 'surface')

  // Draw order (back to front): surface (relief background), base, lanes, region, field, arcs,
  // bubbles, markers. A surface fills the whole map, so it sits behind everything - and base
  // becomes borders-only over it, so country outlines read on top of the relief.
  const tasks: Task[] = []
  if (surface) tasks.push({ keys: [bindingKey(surface)], run: () => resolveSurface(surface, month) })
  if (bindings.some((b) => b.channel === 'base')) {
    tasks.push({ keys: ['base'], run: () => resolveBase(surface != null) })
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
  for (const group of laneGroups.values()) tasks.push({ keys: group.map(bindingKey), run: () => resolveLanes(group) })
  if (choro || area) {
    const keys = [choro, area].filter((b): b is Binding => b != null).map(bindingKey)
    tasks.push({ keys, run: () => resolveRegion(choro, area) })
  }
  for (const b of bindings.filter((b) => b.channel === 'field')) tasks.push({ keys: [bindingKey(b)], run: () => resolveField(b, month) })
  for (const b of bindings.filter((b) => b.channel === 'arc')) tasks.push({ keys: [bindingKey(b)], run: () => resolveArc(b) })
  for (const b of bindings.filter((b) => b.channel === 'bubble')) tasks.push({ keys: [bindingKey(b)], run: () => resolveBubble(b) })
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
  return { layers, failed }
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
