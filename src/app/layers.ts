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
import { DATASETS } from './catalog'
import type { Dataset } from './catalog'
import { loadRegionValues, loadPointData, loadPairData } from './data-loaders'

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
  return { type, ramp: ds.defaultRamp }
}

async function resolveBase(): Promise<ResolvedLayer> {
  const features = await loadCountries()
  return {
    id: 'base',
    primitive: 'base',
    features,
    style: { fill: '#161b23', stroke: '#2b323d', strokeWidth: 0.5 },
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

async function resolveMarker(b: Binding): Promise<ResolvedLayer> {
  const ds = DATASETS[b.dataset]!
  const d = await loadPointData(ds)
  return {
    id: `marker-${ds.id}`,
    primitive: 'point',
    features: d.features,
    values: d.values,
    valueDomain: d.domain,
    style: { fill: '#ffcc44', radiusRange: [1.5, 7] },
  }
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
): Promise<{ layers: ResolvedLayer[]; failed: Set<string> }> {
  const choro = bindings.find((b) => b.channel === 'choropleth')
  const area = bindings.find((b) => b.channel === 'area')

  const tasks: Task[] = []
  if (bindings.some((b) => b.channel === 'base')) tasks.push({ keys: ['base'], run: resolveBase })
  if (choro || area) {
    const keys = [choro, area].filter((b): b is Binding => b != null).map(bindingKey)
    tasks.push({ keys, run: () => resolveRegion(choro, area) })
  }
  for (const b of bindings.filter((b) => b.channel === 'arc')) tasks.push({ keys: [bindingKey(b)], run: () => resolveArc(b) })
  for (const b of bindings.filter((b) => b.channel === 'bubble')) tasks.push({ keys: [bindingKey(b)], run: () => resolveBubble(b) })
  for (const b of bindings.filter((b) => b.channel === 'marker')) tasks.push({ keys: [bindingKey(b)], run: () => resolveMarker(b) })

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

/** Attribution strings for the datasets backing the active bindings (base included). */
export function attributionsFor(bindings: Binding[]): string[] {
  const out = new Set<string>()
  for (const b of bindings) {
    if (b.channel === 'base') {
      out.add(BASE_ATTRIBUTION)
      continue
    }
    const ds = DATASETS[b.dataset]
    if (ds) out.add(ds.attribution)
  }
  return [...out]
}
